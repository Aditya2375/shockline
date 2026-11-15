import { run, forecast } from "../web/src/model.js";
import { spawn } from "node:child_process";
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  mkdtempSync,
} from "node:fs";

const HTTP_PORT = 8989;
const CDP_PORT = 9390;
const SHOTS = process.env.SMOKE_SHOTS === "1";
const root = new URL("..", import.meta.url).pathname;

const profile = mkdtempSync("/tmp/shockline-chrome-");
const server = spawn(
  "python3",
  [
    "-m",
    "http.server",
    String(HTTP_PORT),
    "--bind",
    "127.0.0.1",
    "--directory",
    `${root}docs`,
  ],
  { stdio: "ignore", detached: true },
);
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: true },
);

const cleanup = async (code) => {
  for (const child of [chrome, server]) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
  }
  await Promise.all(
    [chrome, server].map((child) =>
      child.exitCode !== null
        ? Promise.resolve()
        : new Promise((r) => child.once("exit", r)),
    ),
  );
  rmSync(profile, { recursive: true, force: true });
  process.exit(code);
};
const timeout = setTimeout(() => {
  console.error("smoke: timeout");
  cleanup(1);
}, 90000);
process.on("SIGINT", () => cleanup(2));
process.on("uncaughtException", (e) => {
  console.error(e);
  cleanup(1);
});
process.on("unhandledRejection", (e) => {
  console.error(e);
  cleanup(1);
});

async function waitFor(fn, label, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    if (Date.now() - start > timeoutMs)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(
    `${ok ? "ok" : "NOT OK"} - ${name}${detail ? " - " + detail : ""}`,
  );
};

await waitFor(
  async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).ok,
  "chrome devtools",
);
const target = await (
  await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: "PUT" })
).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let mid = 0;
const rpcPending = new Map();
const consoleErrors = [];
const requests = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === "Network.requestWillBeSent")
    requests.push(msg.params.request.url);
  if (msg.id && rpcPending.has(msg.id)) {
    rpcPending.get(msg.id)(msg);
    rpcPending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown")
    consoleErrors.push(
      msg.params.exceptionDetails?.exception?.description ?? "page exception",
    );
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++mid;
    rpcPending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails)
    throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result?.result?.value;
};
const shot = async (name) => {
  if (!SHOTS) return;
  await new Promise((r) => setTimeout(r, 900));
  const metrics = await cdp("Page.getLayoutMetrics");
  const size = metrics.result.cssContentSize;
  const r = await cdp("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 },
  });
  writeFileSync(
    `${root}smoke-${name}.png`,
    Buffer.from(r.result.data, "base64"),
  );
};

await cdp("Runtime.enable");
await cdp("Network.enable");
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
const url = process.env.SMOKE_URL || `http://127.0.0.1:${HTTP_PORT}/`;
await cdp("Page.navigate", { url });
await waitFor(
  async () =>
    await evaluate(`document.querySelectorAll('#ledger tr').length===360`),
  "rendered",
);
const input = (id, value) =>
    evaluate(
      `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(String(value))};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}));true`,
    ),
  submit = () =>
    evaluate(`document.getElementById('controls').requestSubmit();true`),
  f = (v, d = 8) => v.toFixed(d),
  pct = (v, d = 3) => (v * 100).toFixed(d) + "%";
async function verify(p, selected, label) {
  const r = run(p),
    row = r.rows[selected - 1],
    fc = forecast(row.nextVariance, p.alpha, p.beta, p.targetVol),
    d = await evaluate(
      `({head:Object.fromEntries(['target-metric','persistence','half','omega'].map(k=>[k,document.getElementById(k).textContent])),rows:[...document.querySelectorAll('#ledger tr')].map(r=>[...r.cells].map(c=>c.textContent)),inspect:[...document.querySelectorAll('#inspect dd')].map(x=>x.textContent),identity:document.getElementById('identity').textContent,summary:document.getElementById('forecast-summary').textContent,selected:document.querySelector('#ledger tr.selected').dataset.period,charts:['history','forecast'].map(id=>{const s=document.getElementById(id);return{id,w:Math.max(200,Math.floor(s.getBoundingClientRect().width)),paths:[...s.querySelectorAll('path')].map(x=>x.getAttribute('d')),dots:[...s.querySelectorAll('circle')].map(x=>[+x.getAttribute('cx'),+x.getAttribute('cy')])}})})`,
    ),
    eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(
    label + "head",
    eq(d.head, {
      "target-metric": pct(p.targetVol, 2),
      persistence: f(r.persistence, 2),
      half: r.halfLife === null ? "N/A" : f(r.halfLife, 2),
      omega: f(r.omega),
    }),
  );
  check(
    label + "all3600ledgerCells",
    eq(
      d.rows,
      r.rows.map((x) => [
        String(x.period),
        f(x.innovation, 6),
        f(x.variance),
        f(x.volatility * 100, 6),
        f(x.residual * 100, 6),
        f(x.omega),
        f(x.shockTerm),
        f(x.persistenceTerm),
        f(x.nextVariance),
        f(x.nextVolatility * 100, 6),
      ]),
    ),
  );
  check(
    label + "inspection",
    eq(d.inspect, [
      pct(row.volatility, 4),
      f(row.innovation, 4),
      pct(row.residual, 4),
      pct(row.nextVolatility, 4),
      f(row.variance),
      f(row.omega),
      f(row.shockTerm),
      f(row.persistenceTerm),
    ]),
  );
  check(
    label + "identity",
    d.identity ===
      `h[${selected + 1}] ${f(row.nextVariance)} = ω ${f(row.omega)} + αε² ${f(row.shockTerm)} + βh ${f(row.persistenceTerm)}. Variance uses return-squared units.`,
  );
  check(
    label + "forecastSummary",
    d.summary ===
      `As of ${selected} · horizon 1: ${pct(fc[0].rootExpectedVariance)} · horizon 60: ${pct(fc[59].rootExpectedVariance)}`,
  );
  check(label + "highlight", d.selected === String(selected));
  for (const c of d.charts) {
    const hist = c.id === "history",
      points = hist
        ? r.rows.map((x) => [x.period, x.volatility])
        : fc.map((x) => [x.horizon, x.rootExpectedVariance]),
      vals = [...points.map((x) => x[1]), p.targetVol],
      maxX = hist ? 360 : 60;
    let lo = Math.min(...vals),
      hi = Math.max(...vals),
      pad = (hi - lo) * 0.13 || Math.max(0.001, p.targetVol * 0.1);
    lo = Math.max(0, lo - pad);
    hi += pad;
    const bottom = (hist ? 250 : 230) - 32,
      x = (i) => 62 + ((i - 1) / (maxX - 1)) * (c.w - 77),
      y = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - 16),
      parsed = [...c.paths[0].matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [
        +m[1],
        +m[2],
      ]);
    check(
      label + c.id + "allCoordinates",
      c.paths.length === 1 &&
        parsed.length === points.length &&
        parsed.every(
          (v, i) =>
            Math.abs(v[0] - x(points[i][0])) <= 0.00501 &&
            Math.abs(v[1] - y(points[i][1])) <= 0.00501,
        ),
    );
    check(
      label + c.id + "selectedMarker",
      hist
        ? c.dots.length === 1 &&
            Math.abs(c.dots[0][0] - x(selected)) < 1e-7 &&
            Math.abs(c.dots[0][1] - y(row.volatility)) < 1e-7
        : c.dots.length === 0,
    );
  }
}
const base = {
  seed: 2026,
  scenario: "positive",
  alpha: 0.08,
  beta: 0.88,
  targetVol: 0.01,
};
await verify(base, 181, "default");
await shot("default");
await input("period", 182);
await verify(base, 182, "firstEffect");
await input("period", 1);
await verify(base, 1, "initial");
await input("period", 360);
await verify(base, 360, "terminal");
await input("seed", 4294967295);
await verify(base, 360, "dirty");
await input("alpha", 0.2);
await submit();
check(
  "invalidRelationRetains",
  await evaluate(
    `document.getElementById('status').textContent.includes('unchanged')&&document.getElementById('beta').getAttribute('aria-invalid')==='true'`,
  ),
);
await verify(base, 360, "invalid");
await input("alpha", 0.3);
await input("beta", 0.69);
await input("target", 3);
await input("scenario", "negative");
await input("period", 181);
await submit();
const high = {
  seed: 4294967295,
  scenario: "negative",
  alpha: 0.3,
  beta: 0.69,
  targetVol: 0.03,
};
await verify(high, 181, "highPersistence");
await shot("high");
await input("alpha", 0);
await input("beta", 0);
await input("target", 0.5);
await input("scenario", "seeded");
await submit();
const zero = {
  seed: 4294967295,
  scenario: "seeded",
  alpha: 0,
  beta: 0,
  targetVol: 0.005,
};
await verify(zero, 181, "zero");
check(
  "zeroHalfNA",
  await evaluate(`document.getElementById('half').textContent==='N/A'`),
);
await shot("zero");
for (const id of ["seed", "alpha", "beta", "target"]) {
  await input(id, "");
  await submit();
  check(
    "blank" + id,
    await evaluate(
      `document.getElementById(${JSON.stringify(id)}).getAttribute('aria-invalid')==='true'`,
    ),
  );
  await input(id, id === "seed" ? 2026 : id === "target" ? 1 : 0);
}
await input("alpha", 0.08);
await input("beta", 0.88);
await input("scenario", "positive");
await submit();
for (const [width, height] of [
  [768, 1000],
  [390, 844],
  [360, 780],
  [320, 800],
]) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
  await new Promise((r) => setTimeout(r, 300));
  check(
    "pageBounds" + width,
    await evaluate(`document.documentElement.scrollWidth<=innerWidth`),
  );
  check(
    "metricBounds" + width,
    await evaluate(
      `[...document.querySelectorAll('.metrics strong')].every(x=>x.getBoundingClientRect().right<=innerWidth-10)`,
    ),
  );
  check(
    "svgBounds" + width,
    await evaluate(
      `[...document.querySelectorAll('svg')].every(x=>x.getBoundingClientRect().right<=innerWidth&&x.getBoundingClientRect().width>200)`,
    ),
  );
  await verify(base, 181, "mobile" + width);
  if (width === 320) {
    await shot("mobile-plots");
    await evaluate(`document.querySelector('details').open=true;true`);
    check(
      "ledgerBounded320",
      await evaluate(
        `document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.table-scroll').scrollWidth>document.querySelector('.table-scroll').clientWidth&&document.querySelector('.table-scroll').scrollHeight>document.querySelector('.table-scroll').clientHeight`,
      ),
    );
    await shot("mobile-ledger");
  }
}
check("noExceptions", consoleErrors.length === 0, consoleErrors.join(";"));
check(
  "sameOriginOnly",
  requests.every(
    (x) => x.startsWith(new URL(url).origin) || x === "about:blank",
  ),
);
check(
  "noStorage",
  await evaluate(`localStorage.length===0&&sessionStorage.length===0`),
);
check(
  "csp",
  await evaluate(
    `document.querySelector('meta[http-equiv="Content-Security-Policy"]').content.includes("connect-src 'none'")`,
  ),
);
writeFileSync(`${root}browser-checks.json`, JSON.stringify(checks, null, 2));
console.log(
  `${checks.length} Chrome checks, ${checks.filter((x) => !x.ok).length} failures`,
);
clearTimeout(timeout);
await cleanup(checks.every((x) => x.ok) ? 0 : 1);

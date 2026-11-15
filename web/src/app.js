import { run, forecast } from "./model.js";
const $ = (id) => document.getElementById(id),
  ns = "http://www.w3.org/2000/svg";
let current = null,
  params = null;
const pct = (v, d = 3) => (v * 100).toFixed(d) + "%",
  f = (v, d = 8) => v.toFixed(d);
function el(tag, attrs = {}, text) {
  const x = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) x.setAttribute(k, String(v));
  if (text !== undefined) x.textContent = text;
  return x;
}
function chart(id, points, target, selected = null) {
  const svg = $(id);
  for (const e of [...svg.children])
    if (!["title", "desc"].includes(e.tagName)) e.remove();
  const w = Math.max(200, Math.floor(svg.getBoundingClientRect().width)),
    h = id === "history" ? 250 : 230,
    l = 62,
    r = w - 15,
    t = 16,
    b = h - 32,
    minX = 1,
    maxX = id === "history" ? 360 : 60,
    x = (i) => l + ((i - minX) / (maxX - minX)) * (r - l),
    vals = [...points.map((p) => p[1]), target];
  let lo = Math.min(...vals),
    hi = Math.max(...vals),
    pad = (hi - lo) * 0.13 || Math.max(0.001, target * 0.1);
  lo = Math.max(0, lo - pad);
  hi += pad;
  const y = (v) => b - ((v - lo) / (hi - lo)) * (b - t);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  for (let k = 0; k < 3; k++) {
    const v = lo + ((hi - lo) * k) / 2;
    svg.append(
      el("line", { x1: l, x2: r, y1: y(v), y2: y(v), stroke: "#d3d5ce" }),
      el(
        "text",
        { x: l - 8, y: y(v) + 4, "text-anchor": "end" },
        (100 * v).toFixed(2) + "%",
      ),
    );
  }
  for (const i of id === "history" ? [1, 120, 240, 360] : [1, 20, 40, 60])
    svg.append(
      el(
        "text",
        {
          x: x(i),
          y: h - 8,
          "text-anchor": i === 1 ? "start" : i === maxX ? "end" : "middle",
        },
        String(i),
      ),
    );
  svg.append(
    el("line", {
      x1: l,
      x2: r,
      y1: y(target),
      y2: y(target),
      stroke: "#986116",
      "stroke-dasharray": "5 5",
    }),
  );
  if (id === "history" && params.scenario !== "seeded")
    svg.append(
      el("line", {
        x1: x(181),
        x2: x(181),
        y1: t,
        y2: b,
        stroke: "#986116",
        "stroke-dasharray": "7 5",
      }),
    );
  svg.append(
    el("path", {
      d: points
        .map(
          ([i, v], k) =>
            (k ? "L" : "M") + x(i).toFixed(2) + " " + y(v).toFixed(2),
        )
        .join(" "),
      fill: "none",
      stroke: "#315c85",
      "stroke-width": 2,
      "vector-effect": "non-scaling-stroke",
    }),
  );
  if (selected !== null) {
    svg.append(
      el("line", {
        x1: x(selected),
        x2: x(selected),
        y1: t,
        y2: b,
        stroke: "#58616c",
        "stroke-dasharray": "2 4",
      }),
      el("circle", {
        cx: x(selected),
        cy: y(points[selected - 1][1]),
        r: 3.5,
        fill: "#315c85",
      }),
    );
  }
}
function inspect() {
  const t = Number($("period").value),
    r = current.rows[t - 1],
    fc = forecast(r.nextVariance, params.alpha, params.beta, params.targetVol);
  $("selected").value = t + " / 360";
  $("inspect").replaceChildren();
  for (const [k, v] of [
    ["σ before shock", pct(r.volatility, 4)],
    ["Innovation z", f(r.innovation, 4)],
    ["Residual ε", pct(r.residual, 4)],
    ["Next σ", pct(r.nextVolatility, 4)],
    ["h before", f(r.variance)],
    ["ω / baseline", f(r.omega)],
    ["αε² / shock", f(r.shockTerm)],
    ["βh / memory", f(r.persistenceTerm)],
  ]) {
    const dl = document.createElement("dl"),
      dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
    $("inspect").append(dl);
  }
  $("identity").textContent =
    `h[${t + 1}] ${f(r.nextVariance)} = ω ${f(r.omega)} + αε² ${f(r.shockTerm)} + βh ${f(r.persistenceTerm)}. Variance uses return-squared units.`;
  $("forecast-summary").textContent =
    `As of ${t} · horizon 1: ${pct(fc[0].rootExpectedVariance)} · horizon 60: ${pct(fc[59].rootExpectedVariance)}`;
  for (const tr of $("ledger").children)
    tr.classList.toggle("selected", Number(tr.dataset.period) === t);
  chart(
    "history",
    current.rows.map((r) => [r.period, r.volatility]),
    params.targetVol,
    t,
  );
  chart(
    "forecast",
    fc.map((x) => [x.horizon, x.rootExpectedVariance]),
    params.targetVol,
  );
}
function render() {
  const r = current;
  $("target-metric").textContent = pct(params.targetVol, 2);
  $("persistence").textContent = f(r.persistence, 2);
  $("half").textContent = r.halfLife === null ? "N/A" : f(r.halfLife, 2);
  $("omega").textContent = f(r.omega);
  $("applied").textContent =
    `APPLIED / ${params.scenario} · seed ${params.seed} · α ${params.alpha} · β ${params.beta} · target σ ${pct(params.targetVol, 2)} · 360 abstract periods`;
  $("event-note").textContent =
    params.scenario === "seeded"
      ? "No intervention. All 360 innovations come from the seeded generator."
      : `Intervention at period 181: z replaced with ${params.scenario === "positive" ? "+4" : "−4"}. Its return uses σ[181]; the first variance effect is h[182].`;
  const frag = document.createDocumentFragment();
  for (const row of r.rows) {
    const tr = document.createElement("tr");
    tr.dataset.period = row.period;
    for (const value of [
      row.period,
      f(row.innovation, 6),
      f(row.variance),
      f(row.volatility * 100, 6),
      f(row.residual * 100, 6),
      f(row.omega),
      f(row.shockTerm),
      f(row.persistenceTerm),
      f(row.nextVariance),
      f(row.nextVolatility * 100, 6),
    ]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.append(td);
    }
    frag.append(tr);
  }
  $("ledger").replaceChildren(frag);
  inspect();
}
function apply(e) {
  e?.preventDefault();
  for (const id of ["seed", "alpha", "beta", "target"])
    $(id).removeAttribute("aria-invalid");
  const seed = Number($("seed").value),
    alpha = Number($("alpha").value),
    beta = Number($("beta").value),
    targetVol = Number($("target").value) / 100,
    scenario = $("scenario").value;
  let error = "",
    id = "";
  if (
    !$("seed").value.trim() ||
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 4294967295
  ) {
    error = "Seed must be a whole number from 1 to 4294967295.";
    id = "seed";
  } else if (
    !$("alpha").value.trim() ||
    !Number.isFinite(alpha) ||
    alpha < 0 ||
    alpha > 0.3
  ) {
    error = "α must be between 0 and 0.30.";
    id = "alpha";
  } else if (
    !$("beta").value.trim() ||
    !Number.isFinite(beta) ||
    beta < 0 ||
    beta > 0.98
  ) {
    error = "β must be between 0 and 0.98.";
    id = "beta";
  } else if (alpha + beta > 0.99) {
    error = "α + β must be at most 0.99.";
    id = "beta";
  } else if (
    !$("target").value.trim() ||
    !Number.isFinite(targetVol) ||
    targetVol < 0.005 ||
    targetVol > 0.03
  ) {
    error = "Target σ must be between 0.5% and 3%.";
    id = "target";
  }
  if (error) {
    $(id).setAttribute("aria-invalid", "true");
    $("status").textContent = error + " Applied results are unchanged.";
    return;
  }
  try {
    const p = { seed, scenario, alpha, beta, targetVol },
      r = run(p);
    params = p;
    current = r;
    $("status").textContent = "";
    render();
  } catch {
    $("status").textContent = "Could not apply inputs. Results are unchanged.";
  }
}
$("controls").addEventListener("submit", apply);
$("controls").addEventListener("input", () => {
  $("status").textContent = "Inputs changed. Apply to update results.";
});
$("period").addEventListener("input", inspect);
window.addEventListener("resize", () => {
  if (current) inspect();
});
apply();

import { run, forecast } from "../web/src/model.js";
import { execFileSync } from "node:child_process";
let n = 0,
  max = 0;
function same(a, b, path = "") {
  if (typeof a === "number") {
    n++;
    const d = Math.abs(a - b) / Math.max(1, Math.abs(a));
    max = Math.max(max, d);
    if (d > 2e-10) throw Error(`${path}: ${a} ${b}`);
  } else if (Array.isArray(a)) {
    if (a.length !== b.length) throw Error("length");
    a.forEach((v, i) => same(v, b[i], path + i + "."));
  } else if (a && typeof a === "object") {
    if (Object.keys(a).join() != Object.keys(b).join()) throw Error("keys");
    Object.keys(a).forEach((k) => same(a[k], b[k], path + k + "."));
  } else {
    n++;
    if (a !== b) throw Error(path + " value");
  }
}
for (const seed of [1, 2, 2026, 2147483648, 4294967295])
  for (const scenario of ["seeded", "positive", "negative"])
    for (const [alpha, beta, targetVol] of [
      [0.08, 0.88, 0.01],
      [0, 0, 0.005],
      [0, 0.98, 0.03],
      [0.3, 0.69, 0.03],
      [0.01, 0, 0.02],
    ]) {
      const p = { seed, scenario, alpha, beta, targetVol };
      same(
        run(p),
        JSON.parse(
          execFileSync(
            process.env.JAVA || "java",
            [
              "-cp",
              "build/classes",
              "Dump",
              String(seed),
              scenario,
              String(alpha),
              String(beta),
              String(targetVol),
            ],
            { encoding: "utf8", maxBuffer: 8e6 },
          ),
        ),
      );
    }
console.log(`${n} Java/JS full values maxscaled ${max}`);

for (const [a, b, v] of [
  [0.08, 0.88, 0.01],
  [0, 0, 0.005],
  [0.3, 0.69, 0.03],
])
  for (const h of [0.000001, 0.0001, 0.01, 1e200])
    same(
      forecast(h, a, b, v),
      JSON.parse(
        execFileSync(
          process.env.JAVA || "java",
          [
            "-cp",
            "build/classes",
            "Dump",
            "forecast",
            String(h),
            String(a),
            String(b),
            String(v),
          ],
          { encoding: "utf8" },
        ),
      ),
    );
console.log(`${n} total Java/JS states incl forecast maxscaled ${max}`);

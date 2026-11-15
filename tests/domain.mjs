import assert from "node:assert/strict";
import { run, simulate, generate, forecast } from "../web/src/model.js";
let n = 0;
const ck = (x) => {
    n++;
    assert(x);
  },
  eq = (a, b) => ck(Math.abs(a - b) < 1e-12 * Math.max(1, Math.abs(b)));
for (const seed of [1, 2026, 4294967295])
  for (const scenario of ["seeded", "positive", "negative"])
    for (const [a, b, v] of [
      [0.08, 0.88, 0.01],
      [0, 0, 0.005],
      [0.3, 0.69, 0.03],
    ]) {
      const z = generate(seed, scenario),
        r = simulate(z, a, b, v);
      for (let c = 0; c < 359; c += 19) {
        const zz = [...z];
        for (let i = c + 1; i < 360; i++) zz[i] = i % 2 === 0 ? 4 : -4;
        const rr = simulate(zz, a, b, v);
        for (let i = 0; i <= c; i++)
          ck(JSON.stringify(rr.rows[i]) === JSON.stringify(r.rows[i]));
      }
      for (const row of r.rows) {
        let h = row.nextVariance;
        const fc = forecast(h, a, b, v);
        for (const f of fc) {
          eq(f.variance, v * v + Math.pow(a + b, f.horizon - 1) * (h - v * v));
          eq(f.rootExpectedVariance, Math.sqrt(f.variance));
        }
        ck(row.nextVariance > 0);
      }
    }
const z = Array(360).fill(1);
z[180] = 4;
const pos = simulate(z, 0.1, 0.8, 0.01);
z[180] = -4;
const neg = simulate(z, 0.1, 0.8, 0.01);
eq(pos.rows[180].variance, 0.0001);
eq(pos.rows[180].nextVariance, 0.00025);
ck(pos.rows[180].residual === -neg.rows[180].residual);
for (let i = 0; i < 360; i++) eq(pos.rows[i].variance, neg.rows[i].variance);
const fc = forecast(0.00025, 0.1, 0.8, 0.01);
eq(fc[0].variance, 0.00025);
eq(fc[1].variance, 0.000235);
eq(fc[59].variance, 0.0001 + Math.pow(0.9, 59) * 0.00015);
const reset = forecast(0.00025, 0, 0, 0.01);
eq(reset[1].variance, 0.0001);
for (const p of [
  { seed: 0 },
  { scenario: "bad" },
  { alpha: 0.31 },
  { beta: 0.99 },
  { alpha: 0.1, beta: 0.9 },
  { targetVol: 0 },
  { alpha: NaN },
])
  assert.throws(() =>
    run({
      seed: 1,
      scenario: "seeded",
      alpha: 0.08,
      beta: 0.88,
      targetVol: 0.01,
      ...p,
    }),
  );
console.log(
  `${n} causal prefix / analytic shock symmetry / forecast recursion / domain checks passed`,
);

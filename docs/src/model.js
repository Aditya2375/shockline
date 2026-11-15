export const N = 360,
  H = 60;
function validate(a, b, v) {
  if (
    !Number.isFinite(a) ||
    a < 0 ||
    a > 0.3 ||
    !Number.isFinite(b) ||
    b < 0 ||
    b > 0.98 ||
    a + b > 0.99 ||
    !Number.isFinite(v) ||
    v < 0.005 ||
    v > 0.03
  )
    throw Error("Invalid parameters");
}
export function generate(seed, scenario) {
  if (
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 4294967295 ||
    !["seeded", "positive", "negative"].includes(scenario)
  )
    throw Error("Invalid generator inputs");
  let x = seed >>> 0;
  const z = Array.from({ length: N }, () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (((x >>> 0) / 4294967296) * 2 - 1) * Math.sqrt(3);
  });
  if (scenario !== "seeded") z[180] = scenario === "positive" ? 4 : -4;
  return z;
}
export function run(p) {
  if (!p) throw Error("Missing parameters");
  return simulate(generate(p.seed, p.scenario), p.alpha, p.beta, p.targetVol);
}
export function simulate(z, a, b, v) {
  validate(a, b, v);
  if (
    !Array.isArray(z) ||
    z.length !== N ||
    z.some((x) => !Number.isFinite(x) || Math.abs(x) > 4)
  )
    throw Error("Need 360 bounded innovations");
  const target = v * v,
    omega = target * (1 - a - b),
    rows = [];
  let h = target;
  for (let i = 0; i < N; i++) {
    const sigma = Math.sqrt(h),
      e = sigma * z[i],
      shockTerm = a * e * e,
      persistenceTerm = b * h,
      nextVariance = omega + shockTerm + persistenceTerm;
    rows.push({
      period: i + 1,
      innovation: z[i],
      variance: h,
      volatility: sigma,
      residual: e,
      omega,
      shockTerm,
      persistenceTerm,
      nextVariance,
      nextVolatility: Math.sqrt(nextVariance),
    });
    h = nextVariance;
  }
  const persistence = a + b;
  return {
    omega,
    persistence,
    halfLife: persistence === 0 ? null : Math.log(0.5) / Math.log(persistence),
    rows,
  };
}
export function forecast(nextVariance, a, b, v) {
  validate(a, b, v);
  if (!Number.isFinite(nextVariance) || nextVariance <= 0)
    throw Error("Invalid initial forecast variance");
  const omega = v * v * (1 - a - b),
    out = [];
  let h = nextVariance;
  for (let k = 1; k <= H; k++) {
    out.push({ horizon: k, variance: h, rootExpectedVariance: Math.sqrt(h) });
    h = omega + (a + b) * h;
  }
  return out;
}

package shockline;

import java.util.*;

public final class Engine {
  public static final int N = 360, H = 60;

  public record Params(long seed, String scenario, double alpha, double beta, double targetVol) {}

  public record Row(
      int period,
      double innovation,
      double variance,
      double volatility,
      double residual,
      double omega,
      double shockTerm,
      double persistenceTerm,
      double nextVariance,
      double nextVolatility) {}

  public record Forecast(int horizon, double variance, double rootExpectedVariance) {}

  public record Result(double omega, double persistence, Double halfLife, List<Row> rows) {}

  static void validate(double a, double b, double v) {
    if (!Double.isFinite(a)
        || a < 0
        || a > .3
        || !Double.isFinite(b)
        || b < 0
        || b > .98
        || a + b > .99
        || !Double.isFinite(v)
        || v < .005
        || v > .03) throw new IllegalArgumentException("Invalid parameters");
  }

  public static double[] generate(long seed, String scenario) {
    if (seed < 1
        || seed > 0xffffffffL
        || !Set.of("seeded", "positive", "negative").contains(scenario))
      throw new IllegalArgumentException("Invalid generator inputs");
    double[] z = new double[N];
    long x = seed;
    for (int i = 0; i < N; i++) {
      x ^= (x << 13) & 0xffffffffL;
      x ^= x >>> 17;
      x ^= (x << 5) & 0xffffffffL;
      x &= 0xffffffffL;
      z[i] = (x / 4294967296.0 * 2 - 1) * Math.sqrt(3);
    }
    if (!scenario.equals("seeded")) z[180] = scenario.equals("positive") ? 4 : -4;
    return z;
  }

  public static Result run(Params p) {
    if (p == null) throw new IllegalArgumentException("Missing parameters");
    return simulate(generate(p.seed, p.scenario), p.alpha, p.beta, p.targetVol);
  }

  public static Result simulate(double[] z, double a, double b, double v) {
    validate(a, b, v);
    if (z == null || z.length != N) throw new IllegalArgumentException("Need 360 innovations");
    for (double x : z)
      if (!Double.isFinite(x) || Math.abs(x) > 4)
        throw new IllegalArgumentException("Invalid innovation");
    double target = v * v, omega = target * (1 - a - b), h = target;
    List<Row> rows = new ArrayList<>();
    for (int i = 0; i < N; i++) {
      double sigma = Math.sqrt(h),
          e = sigma * z[i],
          shock = a * e * e,
          persist = b * h,
          next = omega + shock + persist;
      rows.add(new Row(i + 1, z[i], h, sigma, e, omega, shock, persist, next, Math.sqrt(next)));
      h = next;
    }
    double p = a + b;
    return new Result(omega, p, p == 0 ? null : Math.log(.5) / Math.log(p), rows);
  }

  public static List<Forecast> forecast(double nextVariance, double a, double b, double v) {
    validate(a, b, v);
    if (!Double.isFinite(nextVariance) || nextVariance <= 0)
      throw new IllegalArgumentException("Invalid initial forecast variance");
    double omega = v * v * (1 - a - b), h = nextVariance;
    List<Forecast> out = new ArrayList<>();
    for (int k = 1; k <= H; k++) {
      out.add(new Forecast(k, h, Math.sqrt(h)));
      h = omega + (a + b) * h;
    }
    return out;
  }
}

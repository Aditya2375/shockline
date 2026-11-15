package shockline;

import java.util.*;

public class TestRunner {
  static long n;

  static void ck(boolean x) {
    n++;
    if (!x) throw new AssertionError("check" + n);
  }

  static void eq(double a, double b) {
    ck(Math.abs(a - b) < 1e-11 * Math.max(1, Math.abs(b)));
  }

  public static void main(String[] args) {
    for (long seed : new long[] {1, 2, 2026, 2147483648L, 4294967295L})
      for (String mode : new String[] {"seeded", "positive", "negative"})
        for (double[] params :
            new double[][] {
              {.08, .88, .01}, {0, 0, .005}, {0, .98, .03}, {.3, .69, .03}, {.01, 0, .02}
            }) {
          double a = params[0], b = params[1], v = params[2], target = v * v;
          var result = Engine.run(new Engine.Params(seed, mode, a, b, v));
          eq(result.omega(), target * (1 - a - b));
          double previous = target;
          for (var r : result.rows()) {
            eq(r.variance(), previous);
            eq(r.volatility() * r.volatility(), r.variance());
            eq(r.residual(), r.volatility() * r.innovation());
            eq(r.nextVariance(), r.omega() + r.shockTerm() + r.persistenceTerm());
            eq(r.nextVariance(), r.omega() + a * r.residual() * r.residual() + b * r.variance());
            ck(r.variance() > 0 && Double.isFinite(r.variance()));
            if (a == 0) eq(r.variance(), target);
            previous = r.nextVariance();
            var fc = Engine.forecast(previous, a, b, v);
            for (var f : fc) {
              eq(f.variance(), target + Math.pow(a + b, f.horizon() - 1) * (previous - target));
              eq(f.rootExpectedVariance() * f.rootExpectedVariance(), f.variance());
              ck(
                  f.variance() >= Math.min(target, previous) - 1e-14
                      && f.variance() <= Math.max(target, previous) + 1e-14);
            }
          }
        }
    double[] zero = new double[360];
    var q = Engine.simulate(zero, .1, .8, .01);
    eq(q.rows().get(0).variance(), .0001);
    eq(q.rows().get(0).nextVariance(), .00009);
    for (int i = 0; i < 360; i++) eq(q.rows().get(i).variance(), .00005 + Math.pow(.8, i) * .00005);
    double[] ones = new double[360];
    Arrays.fill(ones, 1);
    var flat = Engine.simulate(ones, .1, .8, .01);
    for (var r : flat.rows()) eq(r.variance(), .0001);
    ones[180] = 4;
    var pos = Engine.simulate(ones, .1, .8, .01);
    eq(pos.rows().get(180).variance(), .0001);
    eq(pos.rows().get(180).nextVariance(), .00025);
    ones[180] = -4;
    var neg = Engine.simulate(ones, .1, .8, .01);
    for (int i = 0; i < 360; i++) eq(pos.rows().get(i).variance(), neg.rows().get(i).variance());
    ck(pos.rows().get(180).residual() > 0 && neg.rows().get(180).residual() < 0);
    try {
      Engine.simulate(zero, .2, .8, .01);
      throw new AssertionError();
    } catch (IllegalArgumentException e) {
      n++;
    }
    try {
      Engine.forecast(Double.NaN, .1, .8, .01);
      throw new AssertionError();
    } catch (IllegalArgumentException e) {
      n++;
    }
    System.out.println(n + " Java assertions passed");
  }
}

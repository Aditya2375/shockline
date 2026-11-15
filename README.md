# shockline

A GARCH(1,1) variance lab with known parameters, an invented innovation path and an auditable recurrence. Java 21 core with a dependency-free browser mirror. Compare a seeded path with a +4σ or -4σ intervention at period 181, inspect the variance update, and view model-implied forward variance on a square-root scale.

**No fitting or market forecast.** Parameters are chosen, not estimated. This is a synthetic teaching model, not evidence of predictive skill. No market data, accounts, uploads, storage, trades, external runtime requests or package install.

## Run

```sh
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`. After download, the app works without internet. Optional source links leave the app when clicked.

## Model

- `epsilon[t] = sqrt(h[t]) * z[t]`
- `h[t+1] = omega + alpha * epsilon[t]^2 + beta * h[t]`
- Target variance `v = targetSigma^2`; `omega = v * (1 - alpha - beta)`; `h[1] = v`.
- alpha 0..0.3, beta 0..0.98, alpha+beta at most 0.99, target sigma 0.5..3% per abstract period. No annualization.
- After period t, horizon k forecast variance is `v + (alpha+beta)^(k-1) * (h[t+1] - v)`. The plot shows its square root, **not expected volatility**, a realized future path or a confidence interval. Future innovations are assumed independent with mean zero and variance one.
- Variance-gap half-life is `log(0.5)/log(alpha+beta)`. At zero persistence it is N/A; forecast variance resets at horizon 2.

The finite seeded generator is uniform-like on `[-sqrt(3),sqrt(3))`, scaled for an ideal uniform distribution's unit variance. Intervention modes replace innovation 181 with +4 or -4, without changing other draws. That shock uses sigma181 and first changes variance182. Forecasts after an intervention treat it as observed history and do not anticipate another one. Before it, forecasts do not know it will happen. Initial variance is fixed at its target, not sampled from stationarity; no burn-in.

The model is symmetric in positive and negative residuals, has zero conditional mean and does not price an asset. No normal/Student-t innovations, parameter uncertainty, likelihood, estimated parameters, confidence bands, calibration or validation against data. A finite path need not average to the target; its realized variance need not decay monotonically. See [NUMERICS.md](NUMERICS.md) for exact timing, units and analytical tests.

## Tests

Java21+, Node22+, Python3 standard library. Browser tests require `google-chrome` on PATH:

```sh
javac -d build/classes src/shockline/*.java tools/*.java tests/shockline/*.java
java -cp build/classes shockline.TestRunner
node tests/parity.mjs
node tests/domain.mjs
python3 tests/reference.py
node tools/build-web.mjs
node tests/browser-smoke.mjs
```

Java/browser full-state parity includes all recurrence rows and forecast points. Independent Python verifies the PRNG, recurrence and closed-form forecast. Analytic fixtures cover zero shocks, unit innovations, isolated sign-symmetric 4σ shocks and zero persistence. Future-innovation mutation tests check causal prefixes. Chrome checks every ledger cell, plotted coordinate and selected marker, input retention and 320px layout. CI checks generated `docs/` for byte drift and runs pinned scanners with local rules. Runtime has no dependencies.

## Reading

- [Bollerslev (1986), Generalized autoregressive conditional heteroskedasticity](https://public.econ.duke.edu/%7Eboller/Published_Papers/joe_86.pdf): original model and stationarity discussion. The original paper's conditional-normal assumption is not this app's uniform-like demonstration.
- [arch GARCH reference](https://arch.readthedocs.io/en/stable/univariate/generated/arch.univariate.GARCH.html): squared-innovation and variance recurrence.
- [arch analytical forecasting](https://arch.readthedocs.io/en/stable/univariate/forecasting.html): future residual-square expectation and origin-aligned variance forecasts.
- [David Ruppert, GARCH Models](https://faculty.washington.edu/ezivot/econ589/ch18-garch.pdf): variance stationarity, persistence, forecasts and distributional limits.
- [Nicolás Cachanosky, volatility models notes](https://ncachanosky.github.io/ECON-5371/chapters/09/chapter_09.html): ARCH/GARCH definitions and conditional volatility.
- [Wergieluk (2019), simulation and estimation from scratch](https://wergieluk.com/garch/): general standardized-innovation construction. No code or estimation routines adopted.

## License

Original code and documentation: **MIT OR Apache-2.0**, at your option. See [LICENSE-MIT](LICENSE-MIT) and [LICENSE-APACHE](LICENSE-APACHE). Linked texts are not bundled or relicensed. Educational illustration, not investment advice.

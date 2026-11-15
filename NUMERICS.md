# Numerical contract

## Known parameters and units

360 observations with zero conditional mean, no dates, prices or calendar scale. Residual epsilon is in decimal-return units, variance h in return-squared units. sigma=sqrt(h) is per abstract period. Inputs: alpha finite [0,0.3], beta finite [0,0.98], alpha+beta <=0.99, target sigma finite [0.005,0.03]. omega=targetSigma^2\*(1-alpha-beta)>0. h[1]=targetSigma^2. This is an initialized conditional process, not a sample from the stationary distribution. No burn-in or estimation.

## Generator and intervention

Seed integer1..4294967295. xorshift32: x XOR x<<13, x XOR x>>>17, x XOR x<<5, with unsigned 32-bit wrap. Exactly one draw per observation, u=unsigned(x)/2^32*2-1, z=u*sqrt(3). The underlying ideal continuous uniform on [-sqrt(3),sqrt(3)] has mean0 and variance1. The finite PRNG is not proof of independence or exact sample moments. This is not Gaussian noise. Positive/negative intervention replaces z[181] (one-indexed) with +4/-4 after generation. Other draws stay identical across modes.

For each t, h[t] is known before z[t]. epsilon[t]=sqrt(h[t])*z[t]. shockTerm=alpha*epsilon[t]*epsilon[t], persistenceTerm=beta*h[t], nextVariance=omega+shockTerm+persistenceTerm. The row contains pre-shock variance and post-shock next variance, not two competing estimators. Equal-sized signed shocks have identical squared effects. No leverage/asymmetry. The injected shock is outside the base innovation support, deliberately breaking the assumed ordinary innovation law for that observation.

## Model-implied forecast

At selected observation t's end, h[t+1] is known. Horizon1 forecast is exactly that value, without a future shock draw. For k>=2, F[k]=omega+(alpha+beta)_F[k-1]. Closed form: F[k]=v+(alpha+beta)^(k-1)_(h[t+1]-v), v=targetSigma^2. Plot sqrt(F[k]), k1..60. This is not E[sqrt(h)], a realized volatility forecast, a return forecast, confidence band or market prediction. It assumes future innovations independent with mean0/unitvariance and no future intervention. Before observation181, forecasts never use or anticipate the planned intervention. The historical chart still shows all360 observations and uses full-path axis bounds; this retrospective presentation is not used by the forecasting function.

Expected variance gaps, not realized paths, decay with persistence p=alpha+beta. Half-life log(.5)/log(p) for p>0. At p=0 N/A: F1 is the supplied next variance and F2..60 reset to target. If nextVariance already equals target, all horizons are flat although the parameter half-life remains defined for hypothetical deviations. Do not interpret beta alone as expected-gap persistence. Future sigma target is sqrt(unconditional variance), not mean sigma. No higher-moment claim is made: p<1 alone does not guarantee a finite fourth moment.

## Audit cases

With targetSigma=.01, alpha=.1,beta=.8, v=.0001 and omega=.00001:

- Unit innovations z=1 leave h at .0001 throughout. Replace z181 with4: h181=.0001, epsilon181=.04, h182=.00025. Replacing with-4 flips only the intervention residual's sign; every variance stays identical.
- Forecast from h182=.00025: F1=.00025,F2=.000235,F60=.0001+.9^59\*.00015.
- All-zero innovations: h[t]=.00005+.8^(t-1)\*.00005, demonstrating decay below the unconditional target to omega/(1-beta), not to v. This deterministic-zero path does not follow the unit-variance innovation law underlying the forecast.
- alpha0 with target initialization yields constant variance regardless of shocks. alpha=beta=0 gives no gap memory. Sign symmetry is not a skewness or leverage model.

Java unit tests verify recursion, positivity and direct forecast formula; full-state Java/JS parity includes forecast outputs. Python independently generates uint32 draws and recurrence, then compares Java forecasts with the direct closed form. Domain tests mutate all future innovations and check prior rows unchanged. Chart tests compare all plotted coordinates, dots, ledger cells and displayed algebra with the model. These are bounded numerical checks, not formal correctness proofs or financial validation.

## Floating point and scope

Double precision, no early rounding. Ledger variance8decimals, residual/volatility6percentage decimals, headline omega8decimals; tiny values may round to zero. Charts use dynamic pixel-width geometry; they may overlap when constant. Domain helpers accept exactly360 finite standardized innovations in [-4,4]. No arbitrary-length arrays, imports, user data, prices, returns converted into prices, model fitting or live ingestion. The forecast helper accepts a positive finite starting variance; it is a recurrence evaluator, not an inferred model. No parameter optimization, likelihood, parameter uncertainty, mean model, fat-tail calibration, market forecast or annualization. Chrome mobile emulation is not native iOS/Android verification.

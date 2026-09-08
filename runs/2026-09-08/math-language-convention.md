# The math language against scipy/numpy convention — survey

**Dispatched by:** R143's closing paragraph ("which useful scipy-style functions
we are missing, what `sci-rs` already offers that is unexposed, and what to
model the FFT and iEKF work on").
**Criterion (R142, Isaac's words):** *"the idea is to have it be a language that
has been around long enough to have models trained on it … supposed to mirror
how this would feel if it were scipy."*
**Policy (R143):** mirror scipy/numpy where **semantically equivalent**; where
not equivalent, choose a **deliberately different** name. A false friend is
worse than an invented name.

Every claim about our own code is anchored to a file and line actually read.
Rust paths are inside the `rust/` submodule. Where I could not establish
equivalence with confidence I say so rather than guess.

---

## 0. Two corrections to the brief, up front

**(a) The catalog's `fft` is not `welch`.** R143 states that "`core/src/fft.rs`
implements `welch()` and the math language exposes it as `fft`". `fft.rs`
contains *both* functions, and the math language calls the **other** one:

- `rust/core/src/math/eval.rs:939` — `crate::fft::fft(&ch.samples[start..end], window)`.
- `rust/core/src/fft.rs:39` — `pub fn fft(data, window) -> Vec<f64>`: apply
  window weights, one real-to-complex forward transform, `c.norm()` per bin.
  No segmentation, no averaging, no detrend, no normalisation. Its own doc
  comment (`fft.rs:5`) says "Equivalent to `abs(numpy.fft.rfft(window * data))`".
- `rust/core/src/fft.rs:388` — `pub fn welch(...)` is the segmented, windowed,
  averaged one, and the **chart** path is what calls it
  (`rust/tauri/src/commands/rasters.rs:508` and `:586`;
  `rust/core/src/session/handle.rs:794`, `:822`).

So the rename direction changes, and there is a second finding underneath it:
**the notebook's `fft(ch, "hann")` and the Analyze tab's FFT chart of the same
channel are two different computations.** The chart runs Welch with
`nperseg`/`noverlap`/`detrend`/`averaging`/`scaling` off the wire; the notebook
runs a single un-normalised `|rfft|` over the whole selected window. They agree
only in the degenerate one-segment / rectangular / no-detrend /
`Scaling::Magnitude` case — which `fft.rs:210` explicitly documents as the case
where they coincide. Recommendation in §4.

**(b) An iEKF implementation does exist** — the brief says "there is no iEKF
specification in this repo", which is true of the *specs*, but
`rust/core/src/estimate/` holds a working one: `iekf.rs` (393 lines),
`model.rs`, `state.rs` (24-DOF `MtbState`), `process.rs`, `measurements/`,
`smooth.rs` (RTS). §4's recommendation is therefore about what to align the
*surface* on, given what is already built, not a greenfield choice.

---

## 1. False-friend audit — all 69 catalog entries

Source of truth for behaviour: `rust/core/src/math/eval.rs`'s `call_function`
(the dispatch arms are at `eval.rs:861`–`eval.rs:1450`) and the modules it calls.
Names as transcribed in `app/src/routes/pages/Notebook/model/functionCatalog.ts:46-118`.

Verdict key: **EQ** equivalent (keep the name) · **FF** false friend (same name,
different semantics — rename) · **GR** gratuitously renamed (same semantics,
different name — adopt theirs) · **NE** no equivalent (deliberate DSL, keep).

### 1.1 The headline false friends

| # | Ours | Closest upstream | Verdict | Why |
|---|---|---|---|---|
| 1 | `angle(a, b)` | `numpy.angle` = phase of a complex number | **FF** | Ours is the angle **between two 3-vectors**, `atan2(‖a×b‖, a·b)`, in `[0, π]` (`math/vector.rs:158-161`). Known from R143. Rename → `angle_between` (or `vector_angle`). |
| 2 | `variance_time(ch)` / `variance_dist(ch)` | `numpy.var` / `scipy.stats` "variance" = σ² | **FF** | Ours are **lap deltas**: main-lap sample minus the time-matched (resp. arc-length-matched) overlay-lap value, `NaN` where projection fails (`core/src/variance.rs:8-25`). "Variance of fork travel" is a thing a model will confidently write and get a lap-delta channel back, silently. I rate this **the worst false friend in the catalog** — worse than `angle`, because the wrong answer is a plausible-looking channel rather than a type error. Rename → `lap_delta_time` / `lap_delta_dist` (or `delta_time`/`delta_dist`). |
| 3 | `fft(ch, window)` | `numpy.fft.fft` (complex DFT); `scipy.signal.welch`; `scipy.signal.periodogram` | **FF** | Ours is `abs(rfft(w·x))`, one-sided, **un-normalised** — not a complex DFT (no phase, no negative frequencies), not a periodogram (no `1/(fs·Σw²)`), not Welch (no segmentation or averaging). See §0(a) and §4.1. |
| 4 | `butter(order, cutoff, "low"\|"high", ch)` | `scipy.signal.butter` = a **design** function returning `(b, a)` / `sos` | **FF, two ways** | (i) Ours designs *and applies*; scipy's returns coefficients. (ii) Ours applies `sosfiltfilt_dyn` — **zero-phase forward-backward** (`core/src/filters.rs:36`, `:63`), so the effective order is doubled and the result is non-causal. A model reasoning "2nd-order Butterworth low-pass, causal, with phase lag" is wrong on both counts. The catalog already reserves `sosfilt(sos, ch)`, so the scipy-shaped fix is available: make `butter(...)` **return an `sos` value** and apply it with `sosfilt` (causal) or a new `sosfiltfilt` (zero-phase). If a one-call form is kept, name it something that is not `butter` — `butter_filtfilt`. |
| 5 | `round(x)` | `numpy.round` | **FF (subtle)** | `f64::round` is half-away-from-zero (`eval.rs:1041`); `numpy.round` is banker's rounding (half-to-even). `round(0.5)` is `1.0` here, `0.0` in numpy. Low blast radius, but it is exactly the class this exercise exists to catch. Keep the behaviour (Dart parity) and **document it in the signature**, or rename. |
| 6 | `hilbert(ch)` *(NotImplemented, `eval.rs:1177`)* | `scipy.signal.hilbert` returns the **complex analytic signal** | **FF pre-emptively** | The value type has no complex kind (`math/value.rs`), so whatever we implement will be the *envelope* `|x + i·H{x}|`. Rename the catalog entry now, before it is built: `envelope` (or `hilbert_envelope`). |
| 7 | `resample(ch, hz)` *(NotImplemented)* | `scipy.signal.resample(x, num)` takes a **sample count**, not a rate | **FF at the parameter level** | Also see §2: sci-rs's `resample` documents itself as "similar but not exactly equivalent to the SciPy method" (`sci-rs-0.4.1/src/signal/resample.rs:10-12`). Decide the parameterisation before implementing — `resample(ch, num)` positionally, `resample(ch, hz=…)` by keyword (now that R143 approves keywords). |

### 1.2 The systematic one: every reducer is a `nan*` function

`rust/core/src/math/aggregate.rs:13-15` filters to `is_finite()` before every
fold. So:

| Ours | Actual numpy equivalent | Note |
|---|---|---|
| `mean(ch)` | `numpy.nanmean` | plain `numpy.mean` propagates NaN |
| `std(ch)` | `numpy.nanstd` (ddof=0 — matches numpy's default; **pandas** `.std()` defaults ddof=1) | `aggregate.rs:66` |
| `median(ch)` | `numpy.nanmedian` | `aggregate.rs:78` |
| `min(ch)` / `max(ch)` | `numpy.nanmin` / `nanmax` | `aggregate.rs:41-49`; `NaN` (not ±inf) when nothing is finite |
| `sum(ch)` | `numpy.nansum` (empty → `0.0`, same as nansum) | `aggregate.rs:23` |
| `p(ch, q)` | `numpy.nanpercentile(a, q, method="linear")` | `aggregate.rs:86-99`; argument order matches numpy |
| `rms(ch)` | no numpy/scipy equivalent | NaN-skipping |
| `count(ch)` | pandas `.count()` (non-NA count); no numpy equivalent | `aggregate.rs:18` |
| `first(ch)` / `last(ch)` | pandas `GroupBy.first`/`.last` (skip NA) | `aggregate.rs:102-108` — note these return the first/last **finite** sample, not the first/last sample |

Ours additionally skip **±inf**, which numpy's `nan*` family keeps.

**Verdict: EQ-with-a-policy, not FF.** The NaN-skipping is right for telemetry
and `statistics.rs:92-96` argues the case explicitly for `detrend` ("Do not
'fix' this back to scipy semantics"). Renaming nine reducers to `nanmean`,
`nanstd`, … would be worse than the divergence. **The fix is documentation, not
renaming**: state the whole-language NaN policy once in C2 §3.3's preamble
("every reducer is NaN- and inf-skipping; the numpy analogue is the `nan*`
form"), and — since keywords are now approved — consider a future
`nan_policy=` keyword mirroring `scipy.stats`'s own parameter of that name.

### 1.3 Gratuitous renames (semantics already match — adopt theirs)

| Ours | Upstream | Evidence of equivalence |
|---|---|---|
| `p(ch, q)` | `numpy.percentile` | `aggregate.rs:86-99`, linear interpolation, `q` ∈ [0,100] — numpy's default method. **EQ modulo NaN policy.** |
| `clamp(ch, lo, hi)` | `numpy.clip` | `eval.rs:1148-1155`. See the defect note in §1.6 before renaming. |
| `if(cond, t, f)` | `numpy.where` | `eval.rs:1156-1176`. One divergence: ours requires `cond` to be a **channel** (`require_channel`, `eval.rs:1158`), so a scalar condition is an error; `numpy.where` accepts scalars. Fix when renaming. |
| `integrate(ch)` | `scipy.integrate.cumulative_trapezoid(y, dx=1/fs, initial=0)` | `core/src/integration.rs:24-33` — result[0]=0, trapezoid accumulation. `integration.rs:11` already claims exactly this equivalence. **Genuinely EQ.** Adopt `cumulative_trapezoid`; `cumtrapz` is the older scipy spelling and is at least as well represented in training data — my preference is `cumulative_trapezoid` as the name with `cumtrapz` accepted as a parse alias. |
| `asin` `acos` `atan` `atan2` | numpy spells these `arcsin` `arccos` `arctan` `arctan2`; Python's `math` and C spell them as we do | **Not worth churning.** The `a*` spelling is universal outside numpy and unambiguous. Optionally accept the `arc*` spellings as aliases — zero risk, small win. |

### 1.4 `differentiate` — the one R143 gets backwards

R143 lists `differentiate` → `gradient` under "gratuitous renames … the
semantics already match". **They do not match.**

`core/src/statistics.rs:11-15`: `result[0] = 0.0`; `result[i] = (data[i] −
data[i−1]) · sample_rate_hz` — a **backward** finite difference, first-order
accurate, with a fabricated zero at the first sample.

`numpy.gradient` is a **central** difference in the interior (second-order
accurate) with one-sided differences at the ends, and returns no zero. On a
suspension-velocity channel the two differ by a half-sample phase shift and by a
factor of √2 in high-frequency noise gain — visible, and exactly the kind of
thing someone tunes a damper against.

`numpy.diff` is not it either (no `dx` scaling, output shortened by one).

**Recommendation:** do **not** rename `differentiate` to `gradient`. Either
(a) keep `differentiate` as a deliberately-different name for the backward
difference and **add** a true `gradient(ch)` that matches numpy, or (b) change
the implementation to central differences and then take the name. I prefer (a):
the backward form is the causal one and some existing definitions will depend on
its phase, and `gradient` is what a model will reach for anyway.

### 1.5 Everything else, by verdict

**EQ — keep the name** (numpy semantics, verified elementwise at
`eval.rs:1036-1058`): `abs`, `sqrt`, `sign` (`dart_sign`, `eval.rs:839-849` —
NaN→NaN, 0→0, matching `numpy.sign` for floats), `floor`, `ceil`, `pow`
(`numpy.power`, `eval.rs:1059-1063`), `sin` `cos` `tan` `sinh` `cosh` `tanh`,
`deg2rad`, `rad2deg` (numpy's exact spellings), `cross` (`numpy.cross`,
`vector.rs:125`), `norm` (`numpy.linalg.norm`, 2-norm, `vector.rs:144`),
`detrend` (`scipy.signal.detrend`; fits against sample index like scipy,
`statistics.rs:82-83`; the NaN divergence is deliberate and documented at
`statistics.rs:92-96`; our extra `"mean"`/`"none"` modes are additive — scipy
spells the constant mode `"constant"`, which we already accept, `eval.rs:978`).

`min` / `max` are **EQ with a note**: the 1-arg form is `numpy.nanmin`/`nanmax`,
the 2-arg form is `numpy.minimum`/`maximum` (`eval.rs:1064-1087`). numpy uses
two different names for those two jobs; the arity overload is a divergence but a
benign one — both spellings a model might reach for land somewhere sensible.

`dot` is **EQ for rank ≤ 1** (`vector.rs:135`): `numpy.dot` on 1-D vectors is
the inner product, which is what ours does per sample. `numpy.dot` on 2-D is
matrix multiplication; C2 §3.6.3 already rules rank ≥ 2 a `ShapeMismatch` for
`dot`, which is the right call — keep it that way.

**NE — deliberate DSL, keep**: `declip` (`clip_reconstruct.rs:1-9`, asymmetric
analytic pulse fit to a saturated segment — nothing upstream does this),
`rms(ch)` / `rms(ch, w)` (standard in signal work, absent from numpy/scipy),
`current_lap`, `lap_start_time`, `lap_start_distance`, `sector_number`,
`attitude`, `body_accel`, `wheel_travel`, `wheel_velocity` (estimator read-outs,
`eval.rs:873-887`), `vec` / `vx` / `vy` / `vz`, `normalize` (`vector.rs:152`;
sklearn has `preprocessing.normalize`, scipy does not — the name is
self-evident, keep it), `rotate_mat` / `rotate_axis` / `rotate_euler`
(`vector.rs:191-225`; scipy's analogue is
`scipy.spatial.transform.Rotation.from_matrix/from_rotvec/from_euler` + `.apply()`,
a two-step object API with no one-call equivalent).

One documentation gap in that last group: `rotate_euler` uses nalgebra's
`Rotation3::from_euler_angles`, i.e. **intrinsic roll-pitch-yaw about X-Y-Z**
(`vector.rs:220-225`). `scipy`'s `from_euler` forces the caller to name the
convention because there are twelve. Put the convention in the signature.

**GR-but-delete-rather-than-rename**: `vadd`, `vsub`, `vscale`
(`vector.rs:94-123`). These are `+`, `−`, and `*` on a Vec3. numpy would write
the operators. Once C2 §3.6's `[…,c3]` shapes make the elementwise rules apply
to vectors, these three become redundant spellings rather than functions worth
renaming. Not urgent, but they are the "most custom corner" R142 flagged, and
the resolution is removal, not a better name.

**Deferred, semantics not yet fixed** (`eval.rs:1177` returns `NotImplemented`
for all six): `sosfilt` (EQ-if-implemented — `scipy.signal.sosfilt` is the
causal single pass; note the grammar has no way to *write* an `sos` value today,
which is the real blocker and the reason §1.1 #4's fix is the right shape),
`spectrogram` (EQ-if-implemented; note C2 §3.3 and §3.6.3 mark it `Implemented`
after R110, but the submodule as checked out still returns `NotImplemented` at
`eval.rs:1177` — a contract/engine drift worth someone's attention independent
of this survey), `hilbert` (see §1.1 #6), `correlate`, `convolve` (both EQ to
`scipy.signal.correlate`/`convolve` if we take a `mode` argument — scipy
defaults `mode="full"`, and a model will assume it), `resample` (§1.1 #7).

### 1.6 Two crash-on-bad-data defects found while checking semantics

Out of scope for the naming exercise but found by reading the implementations,
and both violate CLAUDE.md §5 ("never a crash on bad data"):

1. **`clamp` panics when `lo > hi` or either is NaN.** `eval.rs:1152` calls
   `f64::clamp(lo, hi)` on user-supplied scalars; `std`'s `f64::clamp` panics if
   `min > max`, `min` is NaN, or `max` is NaN. `numpy.clip(x, 5, 1)` quietly
   returns 1. Whatever the fix, note it before renaming to `clip`, or the rename
   ships a false friend of a different kind.
2. **`butter` panics when the cutoff is ≥ Nyquist.** `core/src/filters.rs:67-84`
   passes `cutoff_hz` straight to `butter_dyn` with no validation, and sci-rs
   panics with "Digital filter critical frequencies must be 0 < Wn < fs/2"
   (`sci-rs-0.4.1/src/signal/filter/design/iirfilter.rs:137-142`). `butter(2,
   500, "low", ch)` on a 200 Hz channel takes the process down. The arm already
   returns a typed `Runtime` error for a bad direction string (`eval.rs:906`);
   this needs the same treatment.

### 1.7 A grammar-level divergence worth naming now that keywords are approved

Three of the reducers dispatch on **argument type**, not name:
`mean(ch)` reduces, `mean(ch, 50)` is a rolling window (`eval.rs:1008-1020`),
and C2 §3.6.3 adds `mean(x, "f")` for an axis. Nothing in numpy, scipy, pandas
or xarray overloads a single name across "reduce / roll / reduce-along-axis" by
the *type* of a positional argument. With R143's keywords, the trained-on
spelling is available: `mean(x, dim="f")` (xarray) for the axis form and an
explicit `rolling_mean(x, window=w)` — or at minimum `mean(x, window=w)` — for
the rolling form. Positional forms stay valid per R143(1); this is about what
completion and the docs should *show*.

### 1.8 Count

69 entries audited. **7 false friends** (`angle`, `variance_time`,
`variance_dist`, `fft`, `butter`, `round`, `hilbert`) plus `resample` as a
parameter-level one (8 if counted); **5 gratuitous renames** (`p`, `clamp`,
`if`, `integrate`, and the `asin`-family spelling, which I recommend leaving);
**1 misclassified in R143** (`differentiate`); **1 systematic policy divergence**
(every reducer is a `nan*` function); the rest equivalent or deliberate DSL.

---

## 2. What sci-rs already offers that we do not expose

Dependency: `rust/core/Cargo.toml:12` — `sci-rs = "0.4"`, resolved to **0.4.1**,
**default features only** (`default = ["alloc"]`,
`sci-rs-0.4.1/Cargo.toml:103-116`). That feature choice matters below.

### 2.1 Available today, no feature change, no new code

| sci-rs item | scipy name | Use here | Cost |
|---|---|---|---|
| `FilterBandType::Bandpass` / `Bandstop` (`design/filter_type.rs:39-44`) | `butter(..., btype="bandpass")` | Our `butter` arm *rejects* `"band"` as a `Runtime` error (`eval.rs:906`) — but the design path supports it, and `butter_dyn` takes `wn: Vec<F>` (`design/butter.rs:20-27`), so two cutoffs already work. Band-pass around the ~3–5 Hz sprung mass or the ~15–20 Hz unsprung mass is core suspension work. | **Lowest-hanging fruit in this document.** A `Vec<f64>` cutoff and one match arm. |
| `savgol_filter_dyn`, `savgol_coeffs_dyn` (`filter/savgol_filter.rs:23`, `:79`; `alloc`-gated, so **on**) | `scipy.signal.savgol_filter` | Smoothed derivative in one pass — the standard way to get shaft velocity from a travel trace without amplifying quantisation noise. Directly better than `differentiate` for that job. | One catalog entry + wire-up. |
| `sosfilt` (`filter/sosfilt.rs`), `sosfilt_zi`, `lfilter_zi` | `scipy.signal.sosfilt`, `sosfilt_zi`, `lfilter_zi` | Unblocks the deferred `sosfilt` **once the language can express an `sos` value** (see §1.1 #4 — that is the actual blocker, not the DSP). | Contract work, not DSP work. |
| `stats::zscore`, `mod_zscore`, `median_abs_deviation` (`stats.rs:386`, `:419`, `:449`) | `scipy.stats.zscore`, `scipy.stats.median_abs_deviation` | Robust outlier gating on GPS speed / accel spikes. `mod_zscore` (median-based) is the one that survives impacts. | One entry each. |
| `stats::autocorr` (`stats.rs:215`) | `numpy.correlate`-based ACF / `statsmodels.acf` | Periodicity in a travel trace (chatter, pedal bob at cadence). | One entry. |
| `gaussian_filter` re-export of the `gaussfilt` crate (`filter/mod.rs:14`) | `scipy.ndimage.gaussian_filter1d` | Zero-ish-phase smoothing alternative to Butterworth. Lower value — `butter` + `sosfiltfilt` already covers it. | Skip unless asked. |
| `kalmanfilt::kalman::kalman_filter`, `kalmanfilt::gh` (`filter/mod.rs:4`, `:9`) | `filterpy.kalman.KalmanFilter`, `filterpy.gh` | See §4.2 — **not** a candidate to replace our IEKF, but its vocabulary is directly relevant. | — |

### 2.2 Available behind one feature flag

`convolve`, `fftconvolve`, `correlate` (`signal/convolve.rs:29`, `:100`, `:116`)
and `resample` (`signal/resample.rs:19`) are `#[cfg(feature = "std")]`
(`signal/mod.rs:7-13`). We do not enable `std`. Enabling it also turns on
`nalgebra/std`, `nalgebra/macros` and `rustfft` — and `rustfft` is already a
**direct** dependency of `idl-rs` (`rust/core/Cargo.toml:14`), so the marginal
cost is close to zero.

That single flag hands us three of the six deferred catalog entries:
`correlate` and `convolve` become "take a `mode` argument and call through",
and `resample` becomes available with the caveat in §1.1 #7 and below.

Caveat on `resample`: sci-rs's own doc comment
(`signal/resample.rs:10-12`) says it "is similar but not exactly equivalent to
the SciPy method … skips some complexity … such as windowing and handling odd vs.
even-length signals". For non-periodic telemetry, Fourier resampling rings at
the ends anyway; scipy users reach for `resample_poly` in practice. Either
implement `resample` on top of interpolation (which C2 §3.6.3's `align` already
needs) and describe it accurately, or expose sci-rs's and say in the signature
that it is Fourier-method and approximate.

### 2.3 What sci-rs does **not** give us, despite appearances

- **No spectral API at all.** `fft.rs:180` and `fft.rs:381` say so in comments,
  and the module listing confirms it: no `welch`, `periodogram`, `spectrogram`,
  `csd`, or `coherence` anywhere in `sci-rs-0.4.1/src`. Ours are composed on
  `realfft`/`rustfft` directly and will stay that way.
- **Only Butterworth actually works.** `FilterType` names ChebyshevI,
  ChebyshevII, CauerElliptic and BesselThomson, but every one of those arms is
  `todo!()` in `design/iirfilter.rs:101-129` — reaching them panics. Do not plan
  a `cheby1`/`ellip` catalog entry against sci-rs 0.4.1.
- **Design errors are panics, not `Result`s** (`iirfilter.rs:66-95`, `:137-142`).
  Anything we expose through the design path needs validation on our side first
  — see §1.6 #2.
- Not useful here: `linalg::companion`, `special::combinatorics`,
  `signal::wave::square`, `plot`.

---

## 3. Missing scipy-shaped functions worth having, ranked

Ranked by usefulness for motorcycle/MTB suspension, IMU and GPS/lap analysis —
not by how often they appear in the scipy index.

1. **`welch` / `periodogram` as language functions.** Highest value and the
   cheapest of the high-value items: the implementation already exists
   (`core/src/fft.rs:388`) and is already what the charts use. This is the fix
   for §0(a) as well as a feature. Sci-rs: no. Cost: a catalog entry, keyword
   plumbing for the parameters, and the migration R143 already mandates.
2. **`histogram`.** The travel-distribution histogram is *the* canonical
   suspension-setup plot (time at each travel position → spring rate and
   progression; velocity histogram → damping). `core/src/histogram.rs` and
   `histogram2d.rs` already implement the binning; it exists as a chart
   endpoint but is not a math value. Sci-rs: no (and `histogram.rs:5-9`
   explains why it never will be). Cost: needs C2 §3.6's shape work to land
   first (the output carries a bin axis), then a wire-up. Name it
   `histogram(x, bins=…, range=…)` after `numpy.histogram`.
3. **`savgol_filter`.** See §2.1 — the right tool for shaft velocity. Sci-rs:
   **yes, available now**. Cost: one entry.
4. **`unwrap`.** `numpy.unwrap`, for GPS heading. SPEC §5.6 delivers `heading`
   as `deg × 100`, which wraps at 360; every derived quantity (yaw rate,
   heading delta between laps, corner-entry direction) is wrong across the
   wrap without it. Sci-rs: no. Cost: trivial (~15 lines), and it is the
   highest value-per-line item in this list.
5. **`find_peaks`.** `scipy.signal.find_peaks` — bottom-out counting, impact
   detection, topout events, peak-force events. Sci-rs: no. Cost: moderate.
   `height` and `distance` are easy; `prominence` and `width` are the
   expensive parts. Implement the subset, but keep each implemented keyword's
   meaning **exactly** scipy's, and error on the unimplemented ones rather than
   ignoring them — a silently-ignored `prominence=` is a false friend in
   parameter form.
6. **`gradient`.** See §1.4. Sci-rs: no. Cost: trivial. Ranked here rather than
   higher only because `differentiate` already covers the common case.
7. **`medfilt`.** `scipy.signal.medfilt` — despiking GPS speed and clipped
   accel before anything else touches them. Sci-rs: no (its `stats::median`
   is a whole-slice reducer, not a rolling filter). Cost: low; a rolling median
   is already half-written in `statistics.rs`'s rolling family.
8. **`csd` and `coherence`.** `scipy.signal.csd` / `coherence` — the
   **axle-to-chassis transfer function** is the single most informative
   suspension measurement we could add, and it is what a two-IMU install is
   *for*. `fft.rs`'s `Stft` deliberately keeps frames complex "so phase is
   available to future transfer-function / coherence / Hilbert work"
   (`fft.rs:293-296`), so the primitive is in place. Sci-rs: no. Cost: moderate
   — the segmentation is done; what is missing is the cross-spectrum fold,
   a second-channel argument, and axis-compatibility checking under C2 §3.6.2.
   Ranked below the cheap wins only because it is real work, not because it is
   less valuable.
9. **`cumulative_trapezoid`.** Already implemented as `integrate` — this is the
   §1.3 rename, listed here so it is not lost.
10. **`linregress`.** `scipy.stats.linregress` — spring-rate fits, sag-vs-load,
    lap-time-vs-setting regressions in table cells. Sci-rs: `lstsq` is a
    transitive dependency but not re-exported. Cost: low-moderate; the value is
    mostly in table cells rather than channel math.
11. **`diff`.** `numpy.diff`. Cheap, and a model will try it. Note the
    length-`n−1` output is awkward against C2 §3.6's axis identity — it produces
    a new `time` axis origin. Worth it only alongside the shape work.

**Would not bother with:**

- `hilbert` as the true complex analytic signal — the value type has no complex
  kind, and adding one for this alone is not worth it. Ship `envelope` (§1.1 #6).
- `cheby1` / `cheby2` / `ellip` / `bessel` — sci-rs can't (§2.3), and
  Butterworth plus zero-phase filtering is what suspension work actually uses.
- `sosfilt` with a user-authored SOS matrix — there is no matrix literal in the
  grammar and no reason to add one; `butter`-returns-`sos` covers every real
  case.
- `fftconvolve` as a separate name — scipy folded this into
  `convolve(..., method="fft")`; do the same.
- Band-power / RMS-in-a-band as a named function — with C2 §3.6.3's `slice` and
  `sum` on a `[f]` value it is one line of workbook, and a named function would
  just be a second way to say it. (Principle: no renderer-only parameters, and
  no catalog entries that are compositions.)
- `scipy.stats` distribution fitting, `special`, `interpolate`'s spline family —
  nothing in this domain asks for them.

---

## 4. What to model the FFT and iEKF work on

### 4.1 Spectral: `core::fft::welch` against `scipy.signal.welch`

Signature comparison (`core/src/fft.rs:377-388` against
`scipy.signal.welch(x, fs=1.0, window='hann', nperseg=None, noverlap=None,
nfft=None, detrend='constant', return_onesided=True, scaling='density',
axis=-1, average='mean')`):

| Concern | Ours | scipy | Verdict |
|---|---|---|---|
| Parameter **names** | `sample_rate_hz`, `window`, `nperseg`, `noverlap`, `detrend`, `averaging`, `scaling` | `fs`, `window`, `nperseg`, `noverlap`, `detrend`, `average`, `scaling` | Very close. Rename `averaging` → `average` when it reaches the language surface; `sample_rate_hz` is derived from the data here (R76), so it never becomes a user keyword — good. |
| **Defaults** | `nperseg == 0` means *one full-record segment* (`resolve_seg`, `fft.rs:266`); no default `noverlap` | `nperseg=256`; `noverlap=nperseg//2` | **A model will assume 256/50 %.** Whatever we choose, state it in the signature. Our "0 = whole record" sentinel has no scipy analogue and should not be the documented default; prefer scipy's. |
| `scaling="density"` | `avg_power / (fs · Σw²)`, interior bins ×2, Nyquist and DC not doubled (`fft.rs:443-455`) | identical formula | **Equivalent.** This one is right. |
| `scaling="magnitude"` | `sqrt(avg_power)` — **un-normalised** (`fft.rs:440`) | scipy's other option is `'spectrum'`: `|X|² / (Σw)²`, i.e. power, normalised by the window **sum** | **Not equivalent, and not equivalent in two ways** (amplitude vs power, and no normalisation at all). Magnitudes scale with segment length and window choice. This is the second-most-dangerous divergence in the document after `variance_*`, because it produces a plausible curve with a wrong vertical axis. Either normalise to match `'spectrum'` (and offer `sqrt` of it as an explicit amplitude option) or give the option a deliberately different name — `"raw_magnitude"`. |
| `detrend` spelling | `Detrend::None` / `Mean` / `Linear` (`fft.rs:76-84`) | `'constant'` / `'linear'` / `False` | Cosmetic. `eval.rs:978` already accepts `"constant"` as a synonym for `"mean"` in the language's `detrend()`; make `"constant"` the primary spelling everywhere and keep `"mean"` parsing. |
| `average="median"` | plain per-bin median (`fft.rs:425-429`) | scipy divides by a **bias-correction factor** `_median_bias(n)` so the median estimator is unbiased for Gaussian noise | **Not numerically equivalent.** A model comparing against scipy will find our median PSD low by ~11 % at large segment counts (the asymptotic `ln 2` factor). Either apply the correction or say plainly in the signature that ours is uncorrected. |
| `average` extras | `None` (first segment only, R63) and `Max` (per-bin maximum) | absent | Deliberate additions, correctly named for what they do. Keep. `Max` is genuinely useful for transient hunting. |
| Missing that a model will expect | — | `nfft` (zero-padding), `return_onesided`, `axis` | `axis` is answered by C2 §3.6's named axes and needs no port. `nfft` is a real gap and cheap. `return_onesided` is moot for real input. |
| Returns | `WelchResult { freqs_hz, values }` (`fft.rs:216-222`) | `(f, Pxx)` | Equivalent. C2 §3.6's `[f]` axis with Hz coordinates is the right shape for it. |

**Recommendation for the spectral surface**, in one line each:

- Point the language's spectral entry at `fft::welch`, not `fft::fft`, and name
  it **`welch`** with scipy's parameter names, scipy's defaults, and scipy's
  `scaling` semantics (fixing the `magnitude` normalisation).
- Add **`periodogram(ch, window=…, scaling=…)`** for the single-segment case —
  it is `welch` with `nperseg = len(x)`, it is the name a model reaches for when
  it wants "the FFT of this", and `fft.rs:96-100` documents that our
  `Averaging::None` + full-record `nperseg` already reproduces it exactly.
- Keep **`spectrogram`** on scipy's name (the semantics match) and make its
  parameters keywords in scipy's order.
- Leave **`fft` free** — either unused, or bound to a genuine complex DFT if a
  complex value type ever exists. Do not leave it meaning a magnitude spectrum.
- Under R143's migration rule, the current `fft(ch, window)` must keep parsing
  for one revision and rewrite on save. Note that the rewrite is **not** a pure
  rename: `fft(ch, "hann")` → `welch(ch, window="hann", nperseg=<len>,
  average="none", scaling="raw_magnitude")` is the only spelling that preserves
  today's numbers, and if the `magnitude` normalisation is fixed at the same
  time, the numbers change for everyone. That is a decision for the lead, not a
  detail of the migration.

### 4.2 iEKF: what to model the interface and vocabulary on

**What exists.** `core/src/estimate/iekf.rs:106-186` — an iterated EKF over a
24-DOF error state, Gauss-Newton / information-form measurement update, Joseph
covariance. `model.rs:38-76` defines three estimator-agnostic traits
(`ErrorState` with `oplus`/`ominus`, `ProcessModel` with
`predict`/`jacobian_noise`, `MeasurementModel` with
`dim`/`residual`/`jacobian`/`noise`/`active`). `state.rs:16-38` is the concrete
`MtbState`. `smooth.rs:1-25` is a fixed-interval RTS smoother.
`measurements/{gps,gravity,prior,zupt}.rs` are the factors.

**The internals already use the standard state-space names.** `iekf.rs:135-186`
literally computes `S = H P Hᵀ + R`, `K = P Hᵀ S⁻¹`, and its predict is
`P ← F P Fᵀ + Q` (`iekf.rs:123-129`). The manifold layer uses navlie/GTSAM's
vocabulary (`⊞`/`⊟`, right perturbation, `ErrorState`, factors with analytic
Jacobians) and `model.rs:1-6` says so explicitly ("the navlie/factor blueprint").

**Recommendation, in three parts:**

1. **Keep the internals exactly as they are.** navlie / factor-graph vocabulary
   is the correct trained-on vocabulary for *on-manifold* estimation — it is
   what navlie, GTSAM, kalibr and the MSCKF literature all use, and there is no
   Python-ecosystem alternative that handles SO(3) retraction at all. Changing
   this to look more like filterpy would make it *less* recognisable, not more.
2. **Model any public/wire/language surface on `filterpy`.** `x, P, F, H, Q, R,
   K, S, y, x_prior, P_prior, x_post, P_post`, and the method names
   `predict` / `update` / `rts_smoother`. Two reasons beyond training-data
   coverage: (a) our field names already match — the only gap is that
   `smooth.rs`'s pass is not *called* `rts_smoother`; (b) **filterpy's
   vocabulary is already in our dependency tree**. `sci-rs` re-exports
   `kalmanfilt::kalman::kalman_filter` (`sci-rs-0.4.1/src/signal/filter/mod.rs:9`),
   and `kalmanfilt` describes itself as "a port of the filterpy library"
   (`kalmanfilt-0.3.0/src/lib.rs:4`) with exactly those field names
   (`kalman_filter.rs:42-77`). Aligning on filterpy aligns us with a crate we
   already compile.
3. **Do not adopt the `ahrs` library's *filter* names.** Madgwick, Mahony and
   `ahrs`'s EKF are complementary/gradient-descent attitude filters that assume
   a 9-DOF (accel + gyro + **magnetometer**) input. SPEC §5.5 gives us 3-axis
   accel and 3-axis gyro per IMU (up to three IMUs, `IMU0`/`IMU1`/`IMU2`) with
   per-sample `timestamp_us`, and **no magnetometer**; SPEC §5.6 gives GPS
   `speed` (km/h × 100) and `heading` (deg × 100) at fix rate, plus lat/lon/alt,
   `fix_quality` and `satellites`. Naming anything `madgwick` would promise a
   filter we cannot run and cannot feed. Two consequences are already
   acknowledged in the code and should be kept in whatever vocabulary we choose:
   yaw is a free gauge at rest and only weakly observed through GPS course
   (`estimate/orient.rs:1-5`, `attitude.rs:22-24`), and the GPS anchor is
   2-DOF horizontal only because the receiver reports no vertical velocity
   (`measurements/gps.rs:1-10`). Where the `ahrs` vocabulary *is* worth
   borrowing is its **output** naming — roll / pitch / yaw in degrees, plus a
   quaternion — which our `attitude("roll"|"pitch")` already half-follows.
4. **Do not reach for sci-rs's Kalman filter for this.** `kalmanfilt`'s
   `KalmanFilter` is a *linear* KF with compile-time-fixed dimensions
   (`DimX`/`DimZ`/`DimU: DimName`, `kalman_filter.rs:28-40`) — no EKF, no
   iteration, no manifold retraction. Our 24-DOF `DMatrix` implementation is the
   right one and should stay hand-rolled. Its value to us is as a **naming
   reference**, and possibly as a cross-check fixture for a linear sub-problem.

**On the GPS speed field**, since the recommendation should not rest on an
assumption: SPEC §5.6 lists `speed` (u16, km/h × 100) and `heading` (u16,
deg × 100) with no statement of how the receiver derives them.
`measurements/gps.rs:12-22` states that the receiver runs its own internal
Kalman filter, so the output is smoothed and latency-bearing, and that the
runner latency-corrects and speed-gates it. I have **not** found a statement
anywhere in the repo that these are Doppler-derived; the brief says so, and it
is very likely true of any modern receiver, but it is not a documented fact
here — so I am flagging it rather than repeating it as one.

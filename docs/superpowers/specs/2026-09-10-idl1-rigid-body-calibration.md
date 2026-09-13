# Rigid-body IMU calibration (M6 task 3, R192)

Layer: `rust/core` (`idl-rs`), pure maths, no I/O, no new crates (`nalgebra`
0.33 is already a dependency). Implemented in `core/src/calibration/rigid.rs`;
the gravity-only helpers of the old `core/src/calibration.rs` are absorbed into
`core/src/calibration/mod.rs` unchanged and remain the rest-only path's way of
tying a body to the world.

This document supersedes the M6 draft of 2026-09-10. Seven recommendations of
that draft were adopted by R192; §7 below records how each was settled, and §8
records the seven places where writing the solver proved the draft's own
equations wrong. Where this text and the draft disagree, this text wins.

**Hardware, as stated.** `IDL0_SPEC.md` §3.2 lists **three** IMUs: `IMU0`
sprung (PCB, frame), `IMU1` front unsprung (fork), `IMU2` rear unsprung
(swingarm, absent on hardtails). A **handlebar IMU is not stated anywhere in
the spec** — the model admits N sensors so one drops in, but none is in the
wire contract today. Wire units are §5.3: `IMU{n}_Accel{XYZ}` in `g`
(`accel_range_g/32768` per LSB), `IMU{n}_Gyro{XYZ}` in `dps`; core works in SI,
rad/s and m/s².

## 1. Model

**1.1 Bodies and joint.** Held in the air with the suspension topped out,
nothing suspension-related moves, so the machine is two rigid bodies. **R**
(rear) is frame + swingarm, sensors `IMU0` and `IMU2`; its frame is the chassis
frame core already uses, ISO 8855, X forward, Y left, Z up
(`rust/core/src/estimate/geometry.rs`). **F** (front) is fork lowers + steerer
+ bar, sensor `IMU1`. They are joined by the **steering axis**, a one-DoF
hinge: unit vector `s` in the R frame (dimensionless, 2 free parameters), steer
angle `δ(t)` in rad. The rotation taking F-frame vectors into the R frame is

    C(δ) = exp([s]ₓ δ) · C₀                                       (1)

with `C₀ ∈ SO(3)` the F→R rotation at the `δ = 0` datum and `[·]ₓ` the skew
matrix. **The exponential is on the left**, because `s` is stated above to live
in the R frame and `exp([s]ₓ δ)` must therefore act on R-frame vectors; the
draft's `C₀ · exp([s]ₓ δ)` puts `s` in the F frame instead (§8.1). Fork travel
and rear linkage are frozen at topped-out — the point of the manoeuvre.

**1.2 Per-sensor unknowns**, twelve per sensor `i`: `R_i`, the rotation sensor
frame → body frame (dimensionless, 3 DoF); `r_i`, the lever arm from body
origin to sensor in the body frame (m, 3); `b_g,i`, gyro bias in the sensor
frame (rad/s, 3); `b_a,i`, accel bias in the sensor frame (m/s², 3). Body
origins are a convention, not an observable (§2.4): fix `r₀ ≡ 0` for `IMU0` on
R and `r₁ ≡ 0` for `IMU1` on F.

**1.2a Frame gauges.** Two more conventions are forced, not chosen (§8.2).
Nothing in the protocol observes either body's frame absolutely, so both are
fixed by declaration and reported `authored`, never `measured`:

- **`R₀ ≡ I`** — the R body frame *is* `IMU0`'s sensor frame. Every other
  R-body quantity is then relative to `IMU0`, which is the only thing the data
  contains. Mapping the R frame onto the ISO chassis frame is a separate,
  later step: the rest hold's gravity gives two of its three degrees of freedom
  (`rotation_from_gravity`, §4) and the yaw about gravity must be authored.
- **`C₀ ≡ I`** — the F body frame *is* the R frame at the datum. With one
  sensor on body F only the product `C₀ R₁` enters any residual (substitute
  `ω_F = R₁(ω₁ˢ − b_g,1)` into (4): every occurrence is
  `exp([s]ₓδ) C₀ R₁`), so `C₀` and `R₁` are not separately observable at all.

**1.3 Measurement equations.** Body `b` has rate `ω_b(t)` (rad/s, b frame),
angular acceleration `ω̇_b` (rad/s²), origin inertial acceleration `a_b` (m/s²)
and gravity `g_b` (m/s², b frame, 9.80665). One `ω_b` for every sensor on it:

    ω_i^s(t) = R_iᵀ ω_b(t) + b_g,i + n_g,i(t)                     (2)
    a_i^s(t) = R_iᵀ[ a_b + ω̇_b×r_i + ω_b×(ω_b×r_i) − g_b ]
               + b_a,i + n_a,i(t)                                 (3)
    C(δ) ω_F(t) = ω_R(t) + δ̇(t) s          (δ̇ in rad/s)          (4)

(4) is the whole steering model: whatever the two bodies' gyros disagree about
must lie along `s`. `n_g`, `n_a` are white with per-sample σ from the Allan
coefficients in `rust/core/src/estimate/noise.rs`, working values gyro ARW
0.003 rad/√s, accel VRW 0.05 (m/s)/√s — the same two constants the synthetic
generator uses (`synth::GYRO_SIGMA_RAD_S`, `synth::ACCEL_SIGMA_M_S2`). **Those
are the estimator's plausible defaults, not LSM6DSO32 datasheet figures; the
datasheet noise density is not in the spec.**

## 2. Estimation

**2.0 Segments.** The protocol (§5) is read as three segments, found from the
data, never from wall-clock assumptions:

| Segment | Test | Used for |
|---|---|---|
| `rest` | the leading run whose smoothed `‖ω_R‖` stays under 0.6 rad/s, ≥ 2 s | `b_g,i` |
| `datum` | from the end of `rest` to the start of `steer` — in practice the tumble, bars held straight | `R_i`, `r_i`, `β` |
| `steer` | the remainder, where the two bodies' rates diverge | `s`, `δ(t)` |

The `datum`/`steer` boundary is the **signed** `‖ω_F‖² − ‖ω_R‖²`, smoothed and
only then taken in magnitude. That quantity is `2δ̇ sᵀω_R + δ̇²` (§2.4), whose
`δ̇²` term never cancels — a plain norm *difference* vanishes whenever the bar
rate sits across the body rate, and the bars would look straight. Rectifying
before smoothing is equally wrong for the opposite reason: it averages `|noise|`
rather than noise, which at §5's per-sample σ alone clears any usable threshold,
and the bars look turned from the first sample of the tumble (§8.6). Both
boundaries are then pulled back by the smoothing half-width, so a window that
bleeds a later segment's energy backwards cannot put one of its samples in an
earlier segment.

**2.1 Gyro bias, from rest.** `ω_b ≡ 0` over `rest`, so (2) collapses to
`ω_i^s = b_g,i + n`: the per-sensor mean over the window *is* the bias, and it
is the only place an **individual** gyro bias is observable (§8.3). Ten seconds
at 833 Hz gives σ/√N ≈ 0.087/91 ≈ 1·10⁻³ rad/s.

**2.2 Gyros alone give the rotations.** Bias-corrected, (2) gives
`R_i ω_i^s = R_j ω_j^s` for two sensors on one body — Wahba's problem over the
stream:

    min_Q Σ_t ‖ ω_i^s(t) − Q ω_j^s(t) ‖²,  Q ∈ SO(3)              (5)

closed-form by SVD of `M = Σ_t ω_i^s ω_j^sᵀ` (`Q = U diag(1,1,det(UVᵀ)) Vᵀ`,
`nalgebra` SVD). It needs the body rate to span all three axes — hence figure-8s
plus roll, pitch and yaw. With `R₀ ≡ I` this returns `R_i` directly for `IMU2`.
It returns `R₁` too, because over `datum` the bars are straight: `δ = δ̇ = 0`,
so (4) with `C₀ ≡ I` reads `ω_F = ω_R` and `IMU1` is, for that segment, just
another sensor on body R. **This is what the datum is for** — it is not merely
a labelling convention (§7.2).

**2.3 Accelerometers add lever arms.** Rotate (3) into the body frame and
difference two sensors on one body; `a_b` and `g_b` are common-mode and cancel:

    R_i a_i^s − R_j a_j^s = Ω(t)(r_i − r_j) + β_ij                (6)
    β_ij = R_i b_a,i − R_j b_a,j        (m/s², body frame)
    Ω(t) = [ω̇_b]ₓ + [ω_b]ₓ²            (units s⁻²)

Lever arms are then linear given the rotations, and separable from the constant
`β_ij` precisely because `Ω(t)` varies and `β_ij` does not. Solved by stacked
linear least squares on the 6 unknowns `(r_i − r_j, β_ij)` per pair, accumulated
as a 6×6 normal-equation system rather than a 3N×6 matrix so a 25 000-sample
window costs 288 bytes instead of 3.6 MB. Take `ω̇_b` by differentiating the (far
cleaner) gyro stream after a zero-phase low-pass; raw differentiation at 833 Hz
and ARW 0.003 rad/√s is noise-dominated.

`Ω(t)` is an **estimate** of the body's motion, not data, so the least-squares
system above is inconsistent: `E[Ω̂ᵀΩ̂] = ΩᵀΩ + N·E[ΔᵀΔ]`, which attenuates the
lever arm. The dominant error term is the `[ω̇]ₓ` half, with
`E[[d]ₓᵀ[d]ₓ] = 2σ_d² I`, so `2N σ_d²` is subtracted from the diagonal of the
`ΩᵀΩ` block; `σ_d` follows from the gyro σ, the smoothing half-width and the
stencil. The `[ω]ₓ[n]ₓ` cross terms are an order of magnitude smaller and their
squares two, and are not corrected.

`β_ij`, not the individual `b_a,i`, is the estimated quantity: see §8.3.

**2.4 Bar-turning adds the hinge.** Over `steer`, `exp([s]ₓδ)` is a rotation
about `s`, so it preserves both the component of `ω_F` along `s` and the length
of the component across it. The second of those gives an **exact constraint on
`s` alone, with `δ(t)` eliminated** (§8.4):

    sᵀ( ω_R ω_Rᵀ − ω_F ω_Fᵀ ) s = ‖ω_R‖² − ‖ω_F‖²                 (7)

which is linear in the rank-1 symmetric matrix `S = s sᵀ`. Stack (7) over the
segment, solve the six independent entries of `S` by least squares with `tr S = 1`
imposed, and take `s` as the dominant eigenvector of the symmetrised solution.
Its sign is a gauge shared with `δ`; fix it by `s·ẑ > 0` (the steering axis
points up). Then, from the preserved component along `s`,

    δ̇(t) = sᵀ( ω_F(t) − ω_R(t) )                                  (8)

and `δ(t)` follows by trapezoidal integration from `δ = 0` at the end of
`datum`. The draft's route — `s` as the dominant left singular vector of the
residuals `C(δ)ω_F − ω_R` — needs `δ(t)` to form the residuals it estimates `δ`
from; (7) does not.

**2.5 Not observable.**

1. **Absolute position** — only `r_i − r_j` within a body. **Absolute attitude**
   — gyros are blind to gravity; hence the gauges of §1.2a. **Scale factor and
   axis non-orthogonality** — not modelled (§7.5).
2. **Lever-arm component along the instantaneous rotation axis.** `[ω]ₓ²` has
   `ω` in its null space, `[ω̇]ₓ` has `ω̇`. Under a single-axis spin (`ω ∥ ω̇`)
   that component of `Δr` is invisible — hence figure-8s rather than three
   separate single-axis wiggles.
3. **The cross-body lever arm** (`IMU1` relative to `IMU0`): (6) does not apply
   across bodies, since `a_b`/`g_b` no longer cancel. It needs the hinge *point*,
   which this manoeuvre does not expose (§7.3). `r₁ ≡ 0` by §1.2, so `IMU1`'s
   accelerometer stream constrains nothing in this model and is not read.
4. **Individual accelerometer bias** — see §8.3. Only `β_ij` is estimated.

**2.6 Solver** — closed form, then refinement, all in `nalgebra`. §2.1 for
`b_g,i`; §2.2 for `R_i`; §2.4 for `s` and `δ(t)`; §2.3 for `r_i` and `β_ij`.
Then **Levenberg–Marquardt** over the joint parameter vector

    [ δθ₁, δθ₂ (rotation increments, 3 each) | b_g,0..2 (3 each)
      | s tangent (2) ]

on residuals (2) over `rest`, the bias-corrected gyro difference over `datum`,
(6) over `datum`, and (4) over `steer` with `δ(t)` profiled out by (8) at each
iteration — 17 parameters, weighted by per-sample σ. **`r_i` and `β_ij` are
deliberately not in the vector** (§8.7): they enter only through `Ω(t)`, and an
LM free to move them minimises the same inconsistent objective §2.3 corrects,
undoing the correction. The accelerometer residual stays in the objective, so
those two still constrain everything LM does move. LM over Gauss–Newton
because the rotation parameters make the problem mildly non-convex and LM
degrades gracefully on marginal excitation. Rotations are carried as
`UnitQuaternion` with a tangent 3-vector increment (`q ⊕ exp(δθ)`), re-linearised
each iteration, so no norm constraint enters the normal equations. The Jacobian
is by central differences on that 23-vector: analytic blocks would be ~300 lines
for a step that starts within a tenth of a degree of the answer. **No new crate:**
hand-rolled LM is ~100 lines against `nalgebra`'s dense solvers, and a problem
this small and dense does not justify a sparse-LM dependency.

## 3. Excitation adequacy

Computed from the data, reported before any fit is trusted.

| Metric | Definition | Gate |
|---|---|---|
| Rotation richness | cond(`Σ_t ω_R ω_Rᵀ`) over `datum` | ≤ 20 |
| Rate magnitude | median ‖ω_R‖ over `datum` | ≥ 2.0 rad/s (≈115 °/s) |
| Lever-arm richness | min eigenvalue of `Σ_t Ω(t)ᵀΩ(t)` over `datum` | ≥ N·(1 s⁻²)² |
| Steer richness | peak-to-peak `δ` over `steer` | ≥ 0.5 rad (≈30°) |
| Rest hold | `rest` duration | ≥ 2 s |
| Duration | `datum` samples | ≥ 30 s at session ODR |

Failure is per-metric and named, never a bare "calibration failed"; partial
results are kept and marked, since orientation converges far earlier than lever
arms do. Each metric is one variant of `ExcitationShortfall`, carrying the value
seen and the value needed, and the record's `quality.fields_observed` drops the
fields the failed metric governs. The operator-facing rendering of a failure
reads:

> Orientations fitted, but the lever arms are uncertain: the bike was mostly
> turned about one axis. Repeat the figure-8s, tumbling through roll, pitch and
> yaw rather than spinning about one direction. The bars also did not turn far
> enough to find the steering axis (18° seen, 30° needed), so it is not kept.

A gate that fails is not an error: `calibrate` returns a record with fewer
fields and a populated `quality.shortfalls`. The one typed *error* is
`CalibrationError::MotionNotRich`, returned when **every** gate fails, i.e.
nothing beyond gyro bias could be fitted.

## 4. Rest-only as a degenerate case

The stationary hold alone is this model with `ω_b ≡ 0`, `ω̇_b ≡ 0`, `a_b ≡ 0`.
Then (2) gives `b_g,i` directly and (3) collapses to `a_i^s = −R_iᵀ g_b +
b_a,i`, one direction per sensor. So `Ω ≡ 0` and **no lever arm is
observable**; `R_i` is fixed only up to rotation **about gravity** (2 of 3 DoF),
exactly `rotation_from_gravity` in `rust/core/src/calibration.rs`; `b_a,i` is
not separable from gravity; the steering axis is invisible. Rest-only is the
same code path with every gate except the rest hold failing, populating the same
record with unobserved fields **absent, never zero** (R190: blank is "not
applicable"), `source = rest_only`.

## 5. Protocol and validation

**5.1 Protocol.** Bike held in the air, suspension topped out, front wheel
steadied. In order: a **stationary hold** of at least 10 s; a **tumble** of at
least 30 s — figure-8s through roll, pitch and yaw together, bars held straight,
at a hand-held rate around 3 rad/s; then a **bar turn** of at least 10 s,
sweeping the bars at least ±30° while the machine keeps moving.

**5.2 Ground truth** before hardware exists, via the `synth` generator in core
(C1 §9): `--protocol calibration` replaces the loop kinematics with exactly the
three segments of §5.1, adds body F and the hinge, and propagates (2)–(4) to
each sensor with **known** `R_i`, `r_i`, `b_g,i`, `b_a,i`, `s` and `δ(t)`; noise
at the `GYRO_SIGMA_RAD_S` / `ACCEL_SIGMA_M_S2` σ; quantised to the §5.3 LSB grid.
`truth.hinge` carries `steer_axis`, the hinge point, the datum and steer window
bounds, and the peak-to-peak `δ`.

**Set the noise to `√ODR`, not 1.** The generator's `GYRO_SIGMA_RAD_S` is a
per-sample σ in rad/s; the 0.003 in the table below is an angle-random-walk
coefficient in rad/√s, which at 833 Hz means a per-sample σ of
`0.003·√833 ≈ 0.087` rad/s — the figure each threshold is justified against. At
`--noise 1.0` the synthetic body is 29× quieter than the acceptance arithmetic
assumes and a fit validated there is flattered (§8.7). Every number below was
measured at `--noise 28.8617`.

Acceptance, with the arithmetic behind it (30 s ⇒ N ≈ 25 000):

| Quantity | Threshold | Achieved | Justification |
|---|---|---|---|
| `R_i` | ≤ 0.5° geodesic | 0.07° | per-sample gyro σ = 0.003·√833 ≈ 0.087 rad/s; at ‖ω‖ ≈ 3 rad/s the Kabsch error goes as σ/(‖ω‖√N) ≈ 3·10⁻⁴ rad ≈ 0.02°. 0.5° is ~25× margin for ω̇ and model error. |
| `r_i` | ≤ 10 mm per axis | 1.0 mm | accel σ = 0.05·√833 ≈ 1.44 m/s²; ‖Ω‖ ≈ ω² ≈ 9 s⁻²; error ≈ σ/(‖Ω‖√N) ≈ 1 mm. 10 mm is 10× margin and the honest floor: lever arms are quadratically sensitive to hand-held rate. |
| `s` | ≤ 1.0° | 0.11° | from a rate *difference*, so ~√2 the gyro error, on a shorter segment. |
| `b_g,i` | ≤ 0.002 rad/s | 0.0016 rad/s | mean of N samples: 0.087/√8330 ≈ 1·10⁻³ rad/s over a 10 s hold. |
| `β_ij` | ≤ 0.05 m/s² per axis | 0.013 m/s² | separated from `r_i` only through `Ω(t)` variation; weakest of the five. **Not** the individual `b_a,i`: §8.3. |

Also tested: the §2.5 degeneracies are **detected**, not silently mis-fitted (a
single-axis spin must fail the lever-arm gate); a hardtail (no `IMU2`) fits with
one sensor on body R; a session with no rest hold reports the shortfall.

## 6. Output record

Per R190 (closed): one setup sheet per session, captured at the start,
content-addressed and synced, applied in **post-processing** — never on the
device, never folded into the immutable blob; the importer version bumps when
the model changes (M6 task 4). A **reserved typed block** under `calibration.*`,
not free user parameters (§7.1), serialised as JSON:

| Field | Type and units |
|---|---|
| `model_version`, `captured_utc`, `source` | u32; RFC 3339 string or absent; enum `rigid_body` \| `rest_only` |
| `sensors[i].imu_index`, `.body` | u8 (0/1/2, §3.2 physical location); enum `rear` \| `front` |
| `sensors[i].mount`, `.mount_origin` | quaternion (w,x,y,z) sensor→body, dimensionless; enum `measured` \| `gauge` |
| `sensors[i].lever` | 3-vector in the body frame, m; absent when the lever-arm gate failed |
| `sensors[i].gyro_bias` | 3-vector in the sensor frame, rad/s; absent with no rest hold |
| `accel_bias_differences[]` | `{ from, to, value }`: `β_ij` in the body frame, m/s² |
| `steer_axis`, `steer_datum` | unit 3-vector in R frame; `steer_datum` is the identity gauge of §1.2a, present so a future multi-sensor front body can carry a fitted value |
| `quality.*`, `quality.shortfalls[]` | the §3 metrics in their own units; the named failures |

Every optional field is **absent** when unobserved, never zero (R190). `mount` +
`lever` map one-to-one onto the existing `ImuPose`, and `steer_axis` onto
`BikeGeometry::steer_axis` (both in `rust/core/src/estimate/geometry.rs`): this
record is the *measured* replacement for those authored constants. The two
gauge quantities (`R₀`, `C₀`) carry `mount_origin = gauge` so a consumer can
tell a fitted rotation from a declared one.

## 7. Questions, settled

1. **Where does a structured record live on a scalar sheet?** A reserved
   `calibration.*` namespace, typed, not user-editable, read-only to the maths
   editor. §6 is its shape.
2. **What defines `δ = 0`?** The bars held straight through the tumble segment,
   which §2.2 shows is load-bearing rather than cosmetic: it is what makes `R₁`
   solvable by the same Wahba step as `R₂`.
3. **The cross-body lever arm** is unobservable here (§2.5.3). Take it from the
   sheet's geometry (head angle, reach, axle-to-crown), marked `authored`, not
   `measured`. Not produced by `calibrate`.
4. **Is the front wheel free to spin?** §3.2 lists no wheel IMU — out of scope;
   the operator steadies it.
5. **Scale factor and non-orthogonality: not modelled in v1.** They need a
   tumble-table protocol, and at hand-held rates scale error is a small fraction
   of the lever-arm budget.
6. **Is `IMU2` on body R, or its own body?** Body R, plus the runtime check that
   the R-body gyro residual stays under threshold — what (4) catches, reported
   as `quality.rear_body_residual_rad_s`.
7. **A bar IMU is not in the wire contract.** The model stays N-sensor; no bar
   sensor is specified until `IDL0_SPEC.md` §3.2 lists one.

## 8. Where the draft was wrong

1. **Equation (1) had the hinge rotation on the wrong side.** `s` is stated to
   be in the R frame, so `exp([s]ₓδ)` must act last, not first. §1.1.
2. **`C₀` and `R₀` are not parameters, they are gauges.** The draft counted
   `C₀` among the unknowns; with one sensor on body F only `C₀R₁` is ever
   observed, and with gyros alone the R body frame is unobservable outright.
   §1.2a.
3. **`b_a,i` is not observable; `β_ij` is.** The draft's §5 promised a threshold
   on the individual per-sensor accel bias, but its own §2.2 derives only the
   difference `R_i b_a,i − R_j b_a,j`, and (3) taken alone contains the unknown
   per-sample `a_b − g_b`, which absorbs any common offset exactly. The rest
   hold does not rescue it either: with `a_b = 0` there are 2 unknown gravity
   directions plus 3 bias components per sensor against 3 equations per sensor.
   The threshold is therefore stated on `β_ij`, at the same 0.05 m/s². The same
   argument applies to the individual `b_g,i` **during motion** — which is why
   §2.1 takes it from the rest hold, where `ω_b ≡ 0` removes the nuisance.
4. **`s` is available in closed form without `δ`.** §2.4's equation (7).
5. **The stationary hold is not optional.** The draft treated rest-only as a
   degenerate *alternative*; it is in fact a required *prefix*, because it is the
   only source of individual gyro bias (§8.3).
6. **A rectified segmentation statistic is not a statistic.** Taking `| · |`
   before smoothing averages `|noise|`, which at the real per-sample σ is large
   enough on its own to trip any threshold the signal could. Smooth, then take
   the magnitude. §2.0.
7. **`r_i` and `β_ij` do not belong in the LM vector.** The draft put them
   there. They enter the residual only through `Ω(t)`, which is an estimate, so
   the objective is inconsistent in exactly those two parameters; an LM free to
   move them lands on the attenuated answer and undoes §2.3's correction. On the
   synthetic body, leaving them in cost a factor of four in the lever arm
   (2.9 mm against 1.1 mm) and six in the bias difference (77 mm/s² against
   13 mm/s², i.e. through and then under §5's 50 mm/s²). §2.6.

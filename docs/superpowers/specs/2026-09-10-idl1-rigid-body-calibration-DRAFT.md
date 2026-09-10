# Rigid-body IMU calibration — DRAFT spec (M6 task 3)

Draft for the lead. Layer: `rust/core` (`idl-rs`), pure maths, no I/O, no new
crates (`nalgebra` 0.33 is already a dependency). Spec-first.

**Hardware, as stated.** `IDL0_SPEC.md` §3.2 lists **three** IMUs: `IMU0`
sprung (PCB, frame), `IMU1` front unsprung (fork), `IMU2` rear unsprung
(swingarm, absent on hardtails). A **handlebar IMU is not stated anywhere in
the spec.** The model admits N sensors so one drops in, but none exists in the
wire contract today. Wire units are §5.3: `IMU{n}_Accel{XYZ}` in `g`
(`accel_range_g/32768` per LSB), `IMU{n}_Gyro{XYZ}` in `dps`
(`gyro_range_dps/32768`). Core works in SI, rad/s and m/s².

## 1. Model

### 1.1 Bodies and joint

Held in the air with the suspension topped out, nothing suspension-related
moves, so the machine is two rigid bodies:

- **R** (rear): frame + swingarm, sensors `IMU0`, `IMU2`. Its frame is the
  chassis frame core already uses — ISO 8855, X forward, Y left, Z up
  (`rust/core/src/estimate/geometry.rs`).
- **F** (front): fork lowers + steerer + bar, sensor `IMU1`.

They are joined by the **steering axis**, a one-DoF hinge: unit vector `s` in
the R frame (dimensionless, 2 free parameters), steer angle `δ(t)` in rad. The
rotation taking F-frame vectors into the R frame is

    C(δ) = C₀ · exp([s]ₓ δ)                                       (1)

with `C₀ ∈ SO(3)` the F→R rotation at the `δ = 0` datum, `[·]ₓ` the skew
matrix. Fork travel and rear linkage are frozen at topped-out; that is the
point of the manoeuvre.

### 1.2 Per-sensor unknowns

Twelve per sensor `i`: `R_i`, the rotation sensor frame → body frame
(dimensionless, 3 DoF); `r_i`, the lever arm from body origin to sensor in the
body frame (m, 3); `b_g,i`, gyro bias in the sensor frame (rad/s, 3); `b_a,i`,
accel bias in the sensor frame (m/s², 3). Body origins are a convention, not an observable (§2.4): fix `r₀ ≡ 0` for
`IMU0` on R and `r₁ ≡ 0` for `IMU1` on F.

### 1.3 Measurement equations

Body `b` has rate `ω_b(t)` (rad/s, b frame), angular acceleration `ω̇_b`
(rad/s²), origin inertial acceleration `a_b` (m/s²), gravity `g_b` (m/s²,
b frame, 9.80665). Every sensor on one body sees the same `ω_b`:

    ω_i^s(t) = R_iᵀ ω_b(t) + b_g,i + n_g,i(t)                     (2)
    a_i^s(t) = R_iᵀ[ a_b + ω̇_b×r_i + ω_b×(ω_b×r_i) − g_b ]
               + b_a,i + n_a,i(t)                                 (3)
    C(δ) ω_F(t) = ω_R(t) + δ̇(t) s          (δ̇ in rad/s)          (4)

(4) is the whole steering model: whatever the two bodies' gyros disagree about
must lie along `s`. `n_g`, `n_a` are white with per-sample σ from the Allan
coefficients in `rust/core/src/estimate/noise.rs`; the app-side working values
are `ProcessNoiseConfig::reference_default()` — gyro ARW 0.003 rad/√s, accel
VRW 0.05 (m/s)/√s. **Those are the estimator's plausible defaults, not
LSM6DSO32 datasheet figures; the datasheet noise density is not in the spec.**

## 2. Estimation

**2.1 Gyros alone.** Bias-corrected, (2) gives `R_i ω_i^s = R_j ω_j^s` for two
sensors on one body — Wahba's problem over the stream:

    min_Q Σ_t ‖ ω_i^s(t) − Q ω_j^s(t) ‖²,  Q ∈ SO(3)              (5)

closed-form by SVD of `M = Σ_t ω_i^s ω_j^sᵀ` (`Q = U diag(1,1,det(UVᵀ)) Vᵀ`,
`nalgebra` SVD). It needs the body rate to span all three axes — hence
figure-8s plus roll, pitch and yaw. Gyros give **relative** orientation only;
what ties body R to the world comes from the rest hold (§4) and geometry.

**2.2 Accelerometers add lever arms.** Rotate (3) into the body frame and
difference two sensors on the same body. `a_b` and `g_b` are common-mode and
cancel exactly:

    R_i a_i^s − R_j a_j^s = Ω(t)(r_i − r_j) + (R_i b_a,i − R_j b_a,j)   (6)
    Ω(t) = [ω̇_b]ₓ + [ω_b]ₓ²          (units s⁻²)

Lever arms are then linear given the rotations, and separable from the constant
bias term precisely because `Ω(t)` varies and the bias does not. Take `ω̇_b` by
differentiating the (far cleaner) gyro stream after a zero-phase low-pass;
raw differentiation at 833 Hz and ARW 0.003 rad/√s is noise-dominated.

**2.3 Bar-turning adds the hinge.** From (4), `C(δ)ω_F − ω_R ∥ s` at every
sample. Stack those residuals over the bar-turn segment: they span a line, and
`s` is the dominant left singular vector. `δ(t)` follows from the residual's
signed magnitude. `C₀` depends on the `δ = 0` datum (question 2).

**2.4 Not observable.**

1. **Absolute position** — only `r_i − r_j` within a body.
2. **Absolute attitude** — gyros are blind to gravity.
3. **Lever-arm component along the instantaneous rotation axis.** `[ω]ₓ²` has
   `ω` in its null space, `[ω̇]ₓ` has `ω̇`. Under a single-axis spin
   (`ω ∥ ω̇`) that component of `Δr` is invisible. This is why the protocol is
   figure-8s and not three separate single-axis wiggles.
4. **Scale factor and axis non-orthogonality** — not modelled (question 5).
5. **The cross-body lever arm** (`IMU1` relative to `IMU0`): (6) does not
   apply across bodies, since `a_b`/`g_b` no longer cancel. It needs the hinge
   *point*, which this manoeuvre does not expose (question 3).

**2.5 Solver** — closed form, then refinement, all in `nalgebra`:

1. Gyro bias seeded from the mean over a stationary sub-window; accel bias at 0.
2. `R_i` per body from (5), against that body's reference sensor.
3. `s`, `δ(t)`, `C₀` from §2.3.
4. `r_i` and `b_a,i` from (6) by stacked linear least squares (`nalgebra` QR).
5. **Levenberg–Marquardt** over all unknowns jointly, residuals (2)+(3)+(4),
   weighted by per-sample σ. LM over Gauss–Newton because the rotation
   parameters make the problem mildly non-convex and LM degrades gracefully on
   marginal excitation. Rotations carried as `UnitQuaternion` with a tangent
   3-vector increment (`q ⊕ exp(δθ)`), re-linearised each iteration, so no norm
   constraint enters the normal equations.

Hand-rolled LM is roughly 60 lines against `nalgebra`'s dense solvers. **No new
crate:** the problem is small (tens of parameters) and dense, and does not
justify a sparse-LM dependency.

## 3. Excitation adequacy

Computed from the data and reported before any fit is trusted:

| Metric | Definition | Proposed gate |
|---|---|---|
| Rotation richness | cond(`Σ_t ω_R ω_Rᵀ`) | ≤ 20 |
| Rate magnitude | median ‖ω_R‖ | ≥ 2.0 rad/s (≈115 °/s) |
| Lever-arm richness | min eigenvalue of `Σ_t Ω(t)ᵀΩ(t)` | ≥ N·(1 s⁻²)² |
| Steer richness | peak-to-peak `δ` | ≥ 0.5 rad (≈30°) |
| Duration | excitation samples | ≥ 30 s at session ODR |

Failure is per-metric and named, never a bare "calibration failed", and partial
results are kept and marked — orientation converges on far weaker excitation
than lever arms do:

> Orientations fitted, but the lever arms are uncertain: the bike was mostly
> turned about one axis. Repeat the figure-8s, tumbling through roll, pitch and
> yaw rather than spinning about a single direction.

> The bars did not turn far enough to find the steering axis (18° seen, 30°
> needed). Orientations and lever arms are kept; the steering axis is not.

## 4. Rest-only as a degenerate case

The 10 s stationary hold is this model with `ω_b ≡ 0`, `ω̇_b ≡ 0`, `a_b ≡ 0`.
Then (2) gives `b_g,i` directly and (3) collapses to `a_i^s = −R_iᵀ g_b +
b_a,i`, one direction per sensor. Consequences follow from the equations, not
from extra rules: `Ω ≡ 0`, so **no lever arm is observable**; `R_i` is fixed
only up to rotation **about gravity** (2 of 3 DoF), which is exactly
`rotation_from_gravity` in `rust/core/src/calibration.rs`; `b_a,i` is not
separable from the gravity direction; the steering axis is invisible. Rest-only
is therefore the same code path with every excitation gate failing, and it
populates the same record with unobserved fields **absent, never zero** (R190
amended: blank is "not applicable", not "unknown" and not zero).

## 5. Validation

Ground truth before hardware exists, via the roadmap's `synthetic_session`
generator in core (behind the existing `test-fixtures` feature): generate
`ω_R(t)` as a band-limited tumble plus a bar-turn segment driving `δ(t)`;
propagate (2)–(4) to each sensor with **known** `R_i`, `r_i`, `b_g,i`,
`b_a,i`; add white noise at the `reference_default()` σ; quantise to the §5.3
LSB grid at the configured ranges; sample at 833 Hz; fit; compare.

Acceptance, with the arithmetic behind it (833 Hz, 30 s ⇒ N ≈ 25 000):

| Quantity | Threshold | Justification |
|---|---|---|
| `R_i` | ≤ 0.5° geodesic | per-sample gyro σ = 0.003·√833 ≈ 0.087 rad/s; at ‖ω‖ ≈ 3 rad/s the Kabsch error goes as σ/(‖ω‖√N) ≈ 3·10⁻⁴ rad ≈ 0.02°. 0.5° is ~25× margin for ω̇ and model error. |
| `r_i` | ≤ 10 mm per axis | accel σ = 0.05·√833 ≈ 1.44 m/s²; ‖Ω‖ ≈ ω² ≈ 9 s⁻²; error ≈ σ/(‖Ω‖√N) ≈ 1 mm. 10 mm is 10× margin and the honest floor: lever arms are quadratically sensitive to hand-held rate. |
| `s` | ≤ 1.0° | from a rate *difference*, so ~√2 the gyro error, on a shorter segment. |
| `b_g,i` | ≤ 0.002 rad/s | mean of N samples: 0.087/√25000 ≈ 5·10⁻⁴ rad/s. |
| `b_a,i` | ≤ 0.05 m/s² | separated only through `Ω(t)` variation; weakest of the five. |

Also tested: the §2.4 degeneracies are **detected**, not silently mis-fitted (a
single-axis spin must fail the lever-arm gate); a hardtail (no `IMU2`) fits with
body R holding one sensor; clipping at ±16 g on the unsprung IMUs is rejected
rather than fitted.

## 6. Output record

Per R190 (closed): one setup sheet per session, captured at the start,
content-addressed and synced, applied in **post-processing** — never on the
device, never folded into the immutable blob. Importer version bumps when the
model changes (roadmap M6 task 4). Proposed **reserved typed block** on the
sheet, not free user parameters (question 1):

| Field | Type | Units |
|---|---|---|
| `model_version` | u32 | — |
| `captured_utc` | timestamp | — |
| `source` | enum `rigid_body` \| `rest_only` | — |
| `sensors[i].imu_index` | u8 | — (0/1/2, §3.2 physical location) |
| `sensors[i].body` | enum `rear` \| `front` | — |
| `sensors[i].mount` | quaternion (w,x,y,z), sensor→body | — |
| `sensors[i].lever` | 3-vector, body frame | m |
| `sensors[i].gyro_bias` | 3-vector, sensor frame | rad/s |
| `sensors[i].accel_bias` | 3-vector, sensor frame | m/s² |
| `steer_axis` | unit 3-vector, R frame | — |
| `steer_datum` | rotation F→R at δ=0 | — |
| `quality.*`, `quality.fields_observed` | §3 metrics, bitset | mixed |

`mount` + `lever` map one-to-one onto the existing `ImuPose`, and `steer_axis`
onto `BikeGeometry::steer_axis`, both in `rust/core/src/estimate/geometry.rs`.
This record is the *measured* replacement for those authored constants.

## 7. Open questions

1. **Where does a structured record live on a scalar sheet?** R190 amended
   makes setup values per-session scalars usable in the maths editor; this is
   40-odd coupled numbers. *Recommend:* a reserved `calibration.*` namespace,
   typed, not user-editable, leaves exposed read-only to the maths editor.
2. **What defines `δ = 0`?** *Recommend:* bars held straight for 2 s at the
   start of the bar-turn segment, and that window is the datum. Median `δ` over
   a ride is a post-hoc fix-up and drifts.
3. **The cross-body lever arm** is unobservable here (§2.4.5). *Recommend:*
   take it from the sheet's geometry (head angle, reach, axle-to-crown) and
   mark it `authored`, not `measured`.
4. **Is the front wheel free to spin?** If so a wheel sensor is a third body.
   *Recommend:* §3.2 lists no wheel IMU, so declare wheel sensors out of scope
   and tell the operator to steady the wheel.
5. **Scale factor and non-orthogonality: modelled?** *Recommend:* not in v1.
   They need a tumble-table protocol, and at hand-held rates scale error is a
   small fraction of the lever-arm error budget.
6. **Is `IMU2` on body R, or its own body?** It is rigid with the frame only
   while the shock is topped out. *Recommend:* body R, with a runtime check
   that the R-body gyro residual stays under threshold — a moving shock is
   exactly the residual (4) is built to catch.
7. **A bar IMU is not in the wire contract.** *Recommend:* keep the model
   N-sensor, specify no bar sensor until `IDL0_SPEC.md` §3.2 lists one.

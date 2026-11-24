# One model: attitude, velocity and GPS in the physics estimator; the IEKF retired (DRAFT)

Status: DRAFT, 2026-11-24. Spec-first. Direction approved by Isaac 2026-11-24 ("fully retire the
iekf and build it all into the model … the long term goal is to have this solver turn into something
that can be run very efficiently on an npu, so we want it all in one place"). Rulings in §9.

## 1. Why

Two estimators exist. `estimate/physics` (batch Gauss-Newton over a differentiable bike model) gives
travel, steer, bending and flex; it is attitude-free because gravity is common to every pod and cancels
(`readings.rs` module docs). `estimate/{iekf,run,process,…}` (a forward EKF) gives roll, pitch,
heading, course, slip, steer, steer-needed, understeer, body accel and a drifting travel, read through
the `attitude`/`body_accel`/`wheel_travel`/`wheel_velocity` builtins. Its attitude is forward-only (no
smoothing), its travel is not meaningful, and a second recursive filter cannot become the network the
NPU runs. The network (ml/README "Where ML comes in later") is trained on the objective, so whatever
the objective does not contain the network can never output.

Goal: every estimator output comes from one objective. Then delete the IEKF.

## 2. New latents and globals

| Latent | Representation | Knot spacing | Replaces |
|---|---|---|---|
| Chassis attitude R(t), chassis → nav (ENU-style: X north, Y west, Z up, as `GpsSample`) | cumulative cubic B-spline on SO(3): R(t) = R_k ∏_{j=1..3} Exp(B̃_j(u) Ω_j), Ω_j = Log(R_{k+j-1}⁻¹ R_{k+j}) | 2 samples | — (built: the frame-rate spline w0 stays; a rate row ties the attitude spline's body rate to it, so the pod model and its goldens are untouched) |
| Nav velocity v(t), m/s | uniform cubic B-spline, 3 rows | 4 samples (10 ms, the steer's spacing: a wider spacing widens the normal matrix's band) | — |

The attitude spline's coefficients are rotations; Gauss-Newton steps them as R_i ← R_i Exp(δ_i)
(a local 3-vector per knot), so the solver's unknowns stay 3 reals per knot and the band structure is
unchanged. Body rate and angular acceleration come from the spline in closed form; with hyper-dual time
they also come out of the existing AD path.

GPS latency stays `fit_gps_latency`'s pre-step for now (fixes are assigned to the grid sample nearest
their corrected time); a latency global is a later step. Existing bias globals unchanged.

## 3. New residuals (per sample unless noted)

| Rows | Term | σ (initial, to tune) |
|---|---|---|
| frame accel (3) | f_meas vs R_fpᵀ(Rᵀ(v̇ − g_nav) + transport to the frame pod) — today f0 is *taken* from f_meas; it becomes *predicted*, so the frame accelerometer now constrains attitude and velocity | `frame_accel_sigma` (1.0 m/s², as today) |
| GPS horizontal velocity (2, per fix) | v(t_fix − τ) north/west vs the fix | 0.3 m/s at 3 Hz |
| GPS vertical velocity (1, per fix, when `up_mps` exists) | v_z(t_fix − τ) | 0.5 m/s |
| stationary (3+3, ZUPT/ZARU samples from `detect.rs`) | v = 0, body rate = 0 | 0.02 m/s, 0.005 rad/s |
| no-GPS acceleration prior (3, only when the ride has no GPS) | v̇ horizontal ~ 0 | 3 m/s² (gravity-leveling's batch form) |

The pod rows stay as they are, but the gravity that cancelled before is now explicit in the transport
(same f0 into every pod), so the pod readings are unchanged in value: the golden tests must still pass
with R held at any value (a test of that, §8).

Airborne needs no special switch: f ≈ 0 says nothing about R, so attitude rides on the gyro through
the spline, and the specific-force row itself pins v̇ to gravity (a separate ballistic row would repeat it).

Built (2026-11-24, `physics/nav.rs`, `so3spline.rs`): rows specific force (σ 3 m/s²: the velocity spline
cannot follow frame vibration), rate vs w0 (σ 0.02 rad/s), GPS north/west/up (0.3 / 0.5 m/s), start
attitude and velocity priors at the window's first sample. The frame pod's flex is left out of these rows
(f_meas stands for the chassis's specific force). Off unless `Spec::nav` and `Window::nav` are both set.
Synthetic check: start 2° tilt / 9° yaw off, solved to 0.06° / 0.11°, travel moved 0.005 mm.
Still to build: ZUPT rows, the no-GPS acceleration prior.

Heading is observable only through GPS velocity against the accelerometer (turning and speed changes).
Straight constant-speed riding leaves it weak; the spline's smoothness carries it. No course-equals-
heading prior: that would erase slip.

## 4. Windows and stitching

Travel is window-local; heading and velocity are not. Windows are solved in time order and each window
gets a Gaussian prior on its first knots' attitude and velocity from the previous window's solution in
the overlap (σ from that window's Hessian block). The first window of each riding stretch: tilt from
the stationary window (`orient.rs`), heading from the first GPS course above 3 m/s, v from GPS. The
current parallel window solve becomes a chain; to keep threads busy, separate riding stretches (split by
stops, where ZUPT resets velocity and pins tilt) run in parallel.

## 5. Outputs

New derived channels beside the existing `Physics …` ones (C1 §5, `derived_kind` "physics"):
`Physics roll (deg)`, `Physics pitch (deg)`, `Physics heading (deg)`, `Physics course (deg)`,
`Physics slip (deg)`, `Physics long accel (g)`, `Physics lat accel (g)`, `Physics speed (m/s)`, and a
`_sigma` for roll, pitch, heading from the marginal covariance (diagonal of the band inverse at the
attitude rows). Sign conventions as `attitude.rs` (roll + right down, pitch + nose up, heading clockwise
from north). Steer-needed and understeer: ported from `run.rs` as post-processing over these channels.

`PHYSICS_ESTIMATOR_VERSION` → 3.

## 6. Rides the model cannot run fully

- No fork or rear pod (hardtail, missing pod): that pod's rows masked, its latents prior-only; the model
  still gives attitude, velocity and the other end.
- No bike calibration: no estimate (Isaac, 2026-11-24, Q2: "hold off for now"). A frame-only mode
  (IMU0 mount from `fit_imu0_mount_from_riding`, pods ignored) is deferred; until then deleting the
  IEKF removes lean/heading from uncalibrated bikes (the moto).

## 7. NPU constraints on the new code

Fixed window length and knot counts per configuration; no data-dependent shapes inside a window
(masks, not branches: GPS rows exist at fixed slots per window with a weight of 0 where there is no
fix); fixed Gauss-Newton iteration count available as an option; physics evaluable in f32 (the SO(3)
spline uses Exp/Log with small-angle series, no f64-only tricks).

## 8. Tests and acceptance

- Unit: SO(3) spline rate and acceleration vs finite differences; constant-rotation spline gives exact
  body rate; pod readings unchanged by R (gravity explicit) against the golden fixture.
- Synthetic: `ml/idlml/sim/synth.py`-style ride with known attitude: roll/pitch error < 0.5°.
- Real (the IEKF README's own checks, same rides): Beacon `173461a2` and Walden `4f3f3032`: roll vs
  GPS-implied steady-turn lean (IEKF: slope 0.89 / 0.97, r 0.93 / 0.97), heading − GPS course above
  4 m/s (IEKF: RMS 5.8° / 13.2°). Accept when the model matches or beats both; then delete.
- Travel results on Beacon unchanged within 1 mm median (attitude must not disturb travel).

## 9. Rulings (Isaac, 2026-11-24)

1. The `attitude`, `body_accel`, `wheel_travel`, `wheel_velocity` builtins are removed at retirement;
   the model's outputs are named `Physics …` channels, the pattern the solver already uses ("continue
   with whatever pattern we've been using for the solver"). No library workbook uses them (checked).
2. Uncalibrated bikes: no frame-only mode for now ("maybe hold off for now?").

## 10. Retirement order

1. Attitude + velocity + GPS in the objective, behind the version bump; IEKF untouched.
2. Acceptance (§8) side by side.
3. Port the remaining IEKF users to the model: `bike calibrate --forward-from` (forward trim and steer
   zero from the model's slip and steer), `SessionHandle`'s estimate (`handle.rs` ~591), the builtins
   (per §9 Q1), examples (`estimator_regression`, `estimate_trace`, `compare_sag`, `diag_coupling`),
   `tests_ahrs.rs`.
4. Delete `iekf.rs`, `process.rs`, `smooth.rs`, `state.rs`, `schema.rs`, `ledger.rs`, `noise.rs`,
   `measurements/`, the IEKF half of `run.rs` (keep `EstimatorInput`, `GpsSample`, the GPS channel
   reader, which the physics pipeline uses), and the README's IEKF sections. Keep `orient.rs`,
   `detect.rs`, `attitude.rs` (conventions), `geometry.rs` as used.

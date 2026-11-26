# Force model: Newton per body in the physics solver (DRAFT)

Status: DRAFT, 2026-11-25, revised the same day after Isaac's answers (§11). Spec-first. Direction
approved by Isaac 2026-11-25 ("force model sounds good"): A (force balance per body), B (ground as an
unknown), C (rider: torso + head). Revisions: the rider is 3-D (roll and yaw matter most), one ground
shared by both wheels with a Huber tie, parameters drift with heat through a ride, Rust only.
Builds on the whole-bike sim spec §5.2 (the estimator's dynamics layer). Nothing here is built.

## 1. Why

The physics objective (`core::estimate::physics`) is kinematics only. Its latents are positions (travel,
steer, bending, flex, twist), and any trajectory that explains the pods is allowed. Two results show
what that costs (one-model spec §3a):

- Travel solves past its stop: 11/21 lap 2 reads 174.7 mm on a 170 mm fork, with only the wall row and
  Huber holding it.
- Mismatch moves the answer: the start, the damping rule and the attitude spline each shift the front
  p99 by 5-8 mm. Some unmodelled physics is being absorbed by whichever latent is cheapest.

Forces close that gap. A travel trajectory now has to be produced by a spring, a damper and a tyre on
known masses. The same force laws are the simulator's, so the parameters identified on rides (damper
curve, tyre casing, rider stiffness, their drift with heat) are the ones the sim uses (whole-bike spec
§5.3).

## 2. Specific force: gravity drops out

Accelerometers measure specific force, f = a − g. Newton for a body with gravity moved to the left is
m·f = Σ(contact forces); the moment balance is the same with no gravity term about the centre of mass.
**Gravity drops out of every balance**, so the balances need no attitude. The specific force and angular
motion of each body come from the existing forward model (`readings.rs`: rigid-body transport from the
frame's f0, w0, a0, plus the relative motion from hyper-dual latents). The shared ground (§6) needs
heights, so it needs navigation (one-model spec), which every ride has (GPS assumed, 2026-11-25).

## 3. Bodies and balances (3-D)

| Body | Mass, inertia (bike file, D3: never fitted) | Balance rows per sample |
|---|---|---|
| Front unsprung U_f (lowers, wheel, tyre, brake) | `mass_table().front_unsprung_kg` | 1: along the fork axis (F3 adds across it) |
| Rear unsprung U_r (wheel, tyre, axle share of the links) | `rear_unsprung_kg` (link masses split between pivots, reduced through the motion ratio) | 1: along the axle path |
| Rider body B (torso, arms, thighs as one rigid body) | rider mass less head and lower legs; inertia from a segment table (§9 gap) | 6: force and moment |
| Rider head H (+ helmet, camera) | segment table | 6 (phase F2), plus the helmet IMU's 6 sensor rows |
| Whole system (bike + rider) | every mass; spinning wheels' inertia (`mass_table().front/rear`) | 6: force and moment |

The **whole-system balance** stands in for a frame balance, so it needs no joint forces (fork bushings,
pivots, pedals, bar). The only non-gravity forces on bike + rider are the two tyre forces, with air drag
and rolling resistance folded into their tangential parts:

- Force: Σ mᵢ fᵢ = F_tyre,f + F_tyre,r.
- Moment, about the frame pod: the bodies' rates of change of angular momentum, including each wheel's
  spin (I_w ω_spin, ω_spin = speed / rolling radius). The gyroscopic part is what turns the bike's roll
  into yaw torque, so it cannot be left out in 3-D.

The lower legs are lumped into the frame (they move with the pedals).

### 3.1 The rider: one body on a 6-axis spring, plus a wrench he applies

Isaac (2026-11-25): the rider moves in 3-D, most importantly in roll and yaw, so two 1-D springs are not
enough; a single force vector and moment on the frame would almost do. Proposal: keep that wrench, and
put a body behind it.

- **Body B** has a pose relative to its neutral place on the frame: 3 translations (fore-aft, lateral,
  vertical) and 3 rotations (roll, pitch, yaw), latents at 2-sample knots.
- **Passive part:** a 6-axis spring + damper between B and the frame (a bushing), diagonal in the
  bike's axes: k and c for x, y, z, roll, pitch, yaw. That is 12 numbers per riding stretch, plus the
  neutral pose. The springs are the legs and arms acting together. Off-diagonal coupling (hips across
  while rolling) is added only if the residuals ask for it.
- **Active part:** a wrench (3 forces + 3 moments) the rider applies on purpose: pumping, unweighting,
  leaning the bike under him, steering with the hips. Latents at 50 ms knots (under about 3 Hz), prior
  0 with a loose σ.
- **On the frame:** −(passive + active), applied at the neutral pose's reference point. This is exactly
  Isaac's force vector and moment. It is an output channel (§9).

Why a body and not a bare wrench: a bare wrench is a free signal at every sample, and it would explain
anything the bike model gets wrong. The body's inertia and the bushing tie the fast part of the wrench
to the rider's measured and modelled motion. That leaves only a slow active part free, and it gives the
sim a rider it can run (stiffness sweeps, D7). The helmet (F2) sees B through the neck; a lower-back IMU
(D9, "one day") would see B directly and is the single biggest upgrade to the rider.

### 3.2 The force laws (shared with `sim`, generic over `Real`)

| Element | Law | Fitted (§5) | Fixed |
|---|---|---|---|
| Fork spring | `sim::suspension::AirSpring` from `fork.*` params, the sag fit, as `sim::ride` uses it (isothermal static point, adiabatic about it) | pressure scale (drifts with heat) | area, volumes, tokens |
| Shock spring | the same through the leverage (`physics::fourbar`), virtual work (Cossalter §5.3, PDF 177-179) | pressure scale (drifts) | |
| Bump stops | stiff smooth stop at full travel (both ends, top-out too) | — | stiffness |
| Dampers | `sim::ride::Damper` shape (LSC, HSC, LSR, HSR, knee) with a smooth knee; Dixon ch. 7 (PDF 277) | 5 per end (a common scale drifts) | — |
| Seal friction | smoothed Coulomb, F_c tanh(v / v_0) | F_c per end | v_0 |
| Tyre radial | `sim::tyre::Tyre::force` (air + casing, CushCore crush, rim strike), lift-off as a softplus | casing_pa, damping per tyre (both drift) | cold pressure (log), insert height |
| Tyre tangential, lateral | free latents (T, S), per wheel; a slip model later (D5, Magic Formula) | — | — |
| Rider bushing | §3.1 | 12 per stretch, neutral pose | |
| Neck (F2) | 3-axis rotational spring + damper | 6 per stretch | |

Every law becomes one generic function used by both solvers. The sim calls it with smoothing width 0,
which gives today's hard switches; the estimator uses a small width so Gauss-Newton and the NPU see
smooth functions (one-model spec §7).

## 4. New latents (uniform cubic B-splines, as today)

| Latent | Meaning | Knot spacing | Prior |
|---|---|---|---|
| δ_f, δ_r | tyre radial deflection, m | 1 | tension-free; the ground tie (§6) |
| φ_f, φ_r | tilt of the tyre force in the wheel plane (the local ground normal relative to the bike), rad | 4 | from the ground's slope (§6) |
| T_f, T_r | tyre tangential force (braking, drive, drag), N | 4 | 0 ± 500 N |
| S_f, S_r | tyre lateral force, N | 4 | 0 ± 500 N |
| rider pose (6) | §3.1 | 2 | 0 ± 0.25 m fore-aft and vertical, 0.1 m lateral; 0.3 rad |
| rider active wrench (6) | §3.1 | 50 ms | 0 ± 300 N, 0 ± 60 N·m |
| head (3, F2) | neck rotation, rad | 2 | 0 ± 0.3 rad |

NL goes from 14 to about 28 at sample-rate levels, plus the slow wrench. Travel stays a latent: the
force rows check it, they do not replace it.

**Counting.** In F1, per sample, the new rows are 1 (fork axis) + 1 (axle path) + 6 (rider) + 6
(system) + 1 (ground tie) = 15, and the new latents are 8 (tyres) + 6 (rider pose), plus the slow
wrench. The chain: the system balance gives the sum of the tyre forces and moments; the rider balance
splits off the rider's share; each unsprung balance turns its tyre force into a suspension force; the
spring + damper law turns that into travel; the ground tie makes the rear's deflection agree with the
front's ground. Identifiability is checked on exact synthetic data first (as
`physics_identifiability.rs` did for flex, §8).

## 5. Parameters, and their drift with heat

Isaac (2026-11-25): air springs get stiffer and damping (suspension and tyres) gets weaker toward the
bottom of a run and through the day. It is subtle but very noticeable riding, and it is something he
wants to model. So the temperature-sensitive parameters are not constants per ride.

- **Drifting (step 1, measured):** each temperature-sensitive parameter is a slow spline over ride time
  (knots every 2 min of riding, smoothness prior, continuous across stops): fork and shock pressure
  scale, each damper's overall scale, each tyre's casing stiffness and damping. The damper's curve
  shape (the 5 numbers) stays constant per ride: heat thins the oil, scaling the curve more than
  reshaping it (to check against the fits).
- **Drifting (step 2, predicted):** a thermal state per damper and tyre, heated by the power it
  dissipates (the model already has the damper's F·v and the tyre's damping force × rate) and cooled
  toward ambient: dT/dt = (P − h (T − T_amb)) / C. Temperature then sets the gas pressure (ideal gas,
  p ∝ T in kelvin) and the damping scale (viscosity against temperature). h, C and the viscosity slope
  are fitted per bike, T_amb from the weather or a sensor. Accepted when step 2 predicts step 1's
  trends. This is what the sim needs to say "the last minute of a run rides like this".
- **Per riding stretch:** the rider's bushing (12), the neutral pose (6), the neck (6). Isaac fatigues
  through a day; the trend across stretches is reported.
- **Per ride:** damper curve shapes, friction.
- **Never fitted:** masses (D3), cold pressures (from the log), geometry.
- **Identification across windows** (bundle-adjustment form): solve every window with the current
  parameters (chained per stretch as today), reduce each window's normal equations onto the parameters
  (Schur complement of its banded latents: one band solve per parameter the window touches; a 2-minute
  drift knot touches only the windows near it), sum, add the priors, take a Levenberg-Marquardt step,
  repeat (3-5 outer passes). The window handoff priors are ignored in the reduction (an
  approximation). For speed, identify on a fixed subsample of windows, then solve the whole ride once
  with the parameters frozen.
- Output: a fit file (parameters and drift curves, σ from the reduced Hessian, the windows used)
  beside the solve's parquet in `derived/` (C1 §5, `derived_kind` "physics"), content-addressed like
  the solve.

A temperature sensor on the shock body (or an IR reading at the bottom of a run) would test step 2
directly. Optional.

## 6. One ground, a Huber tie

Isaac (2026-11-25): assume the ground is the same for both wheels, with Huber so it doesn't hurt where
it differs. Adopted in place of the per-wheel profiles of the first draft.

- **The ground** is one height profile along the distance travelled, h(s). The front wheel defines it:
  h(s_f(t)) = height of the front contact point = front axle − (r₀ − δ_f)·n̂(φ_f), positions from the
  navigation's velocity integrated (window-local; slow drift goes into h and cancels, since both wheels
  read the same profile within a wheelbase of each other).
- **The tie:** for the rear, (rear contact height − h(s_f − L)) / σ_g, with Huber k = 3. L is the
  wheelbase along the path. σ_g = 5 mm plus the vertical position's uncertainty over the delay.
- Where the lines really differ (a tight turn, a slide), the tie's residual grows and Huber caps its
  pull, as Isaac asked. One case Huber does not cover: many rows a little off at once (2-3σ, inside
  Huber's square zone, a whole turn on an inside line). So σ_g also widens by the off-tracking a turn
  forces (≈ L² / 2R, R = v / ψ̇ from the nav) and by the chassis slip × L. That costs nothing extra and
  only applies when the geometry says the rear cannot be on the front's line.
- Off below 1.5 m/s (the delay gets long, the position drifts) and while either tyre is off the ground.
- φ is tied to the ground's slope: φ_f ≈ dh/ds − bike pitch (soft, σ 0.1 rad), and the rear's φ to
  the same profile at its own distance.
- Output: `Physics ground (mm)` against distance, for the sim to re-ride (whole-bike spec §6).

## 7. Rows, weights and robustness

- Each balance row is (m·f − ΣF) / σ_F (moments the same in N·m). σ_F = σ₀ + ρ·|F_model|, with
  ρ = 10 %: model error grows with the force. σ₀ = 20 N on the unsprung rows and 50 N (20 N·m) on the
  rider and system rows, capped at 1.5 kN (300 N·m). σ_F is frozen within a Gauss-Newton iteration
  (IRLS, like Huber). These are starting values, tuned on simulated truth (Isaac had no view, §11).
- The cap matters: with no cap, the residual of a huge bump-stop force tends to 1/ρ, and the stop would
  stop stopping. The existing wall rows (15..19) stay, as the hard backstop.
- Huber k = 3 on the force rows and the ground tie, as on the sensor rows (version 3): one unmodelled
  event (a foot off a pedal, a hand off the bar, a casing pinch) must not drag the rest.
- Starting values: δ from the static load at sag, φ from the ground slope, T = S = 0, the rider at
  neutral, damper parameters from `Damper::default` scaled to the fork's and the shock's leverage, the
  drift curves flat.

## 8. Phases and acceptance

Each phase is behind `Spec::forces` (off by default, like `nav`) and bumps `PHYSICS_ESTIMATOR_VERSION`.

| Phase | Adds | Needs |
|---|---|---|
| F0 | the force laws generic over `Real` in `sim` (tyre, damper, air spring, smooth contact), with the sim unchanged (its tests pass) | — |
| F1 | unsprung rows, system rows (6), the rider body (6), tyre latents, per-ride and per-stretch parameters, identification (attitude-free) | F0 |
| F2 | head + helmet IMU rows (`Cam_Accel*`, `Cam_Gyro*`, camera mount rotation fitted per ride) | F1 |
| F3 | flex as load / stiffness: fork bending from the across-axis load (φ, T, S), rear member and frame pod flex from the linkage loads; one stiffness per part | F1 |
| F4 | the shared ground and its tie | F1, nav |
| F5 | drift: step 1 (slow splines), then step 2 (thermal state) | F1 |

Built: **F0** (2026-11-25, `core::sim::laws`): `relu` / `step` (softplus, logistic), `stop_n`, `DamperLaw`, `friction_n`, `air_force_n` / `air_force_about_n`, `TyreLaw`, all generic over `Real` with a smoothing width (0 exact). The sim's `Damper`, `AirSpring` and `Tyre` now call them; the sim's 71 tests pass unchanged.

Built: **F1 core** (2026-11-25, `physics/forces.rs`, `force_setup.rs`): every row and latent of
§3-7 except the shared ground (F4) and the drift (F5), with the active wrench on 4-sample knots and a
2000x smoothness instead of coarse knots (coarse knots touch many samples and widened the solver's
band about 15x: 53 s to 1 s per solve), a deflection prior (0.02 m about static), and the parameters
as log-multiplier globals. The tyre force's tilt (phi) is left out: with forces alone a tilted
normal and a tangential force cannot be told apart; it returns with the ground (F4).

Exact-model results (`forces.rs` tests; the frame integrated as a free body under prescribed
ground, brakes and cornering, and a slow attitude holder standing in for the ground and the rider):
from a cold start, travel within 0.5 mm rms, tyre loads within 9 / 22 N rms of 950 N, the rider's
position 1-3 mm and rotation 3-10 mrad. Identification over 3 s pulls the four damper numbers and the
rider's vertical spring and damper back to within 30 % of a 1.3-1.6x error (1 s: 15-70 %). **Not
identifiable from forces alone, as the counting said:** the tyre's damping (needs the shared ground,
F4) and the rider's pitch spring (needs the helmet, F2). Generating the ride found two physical
facts worth keeping: prescribing the frame's motion fixes the suspension forces and leaves the
unsprung inertia undetermined (prescribe the ground instead), and a free bike under prescribed tyre
forces rolls away (a real one is held by the ground and the rider's body English).

Real rides, first try (Beacon `173461a2`, 2966-2996 s, pressures given for the run: fork 75, shock
220, tyres 23.5 / 28.5 psi): the setup's static check holds every balance within 12 N / 8 N m, but
the solve did not converge. Identification takes one step and stalls (loss 9.3 M -> 1.2 M per 4 x 6 s; the
balance rows sit near 4 sigma on average, five times the pods' share), three of four 12 s windows
fail to factor (not positive definite), and the dampers' nominal values are far too strong (the
fork's 3000 N s/m low-speed rebound at the axle gives -8.5 kN in rebound, which no tyre load can
balance). Next, in order: why Levenberg-Marquardt stalls on the shared parameters; the failed
factorisations (conditioning); then nominal damping from a real curve. Each run prints its static
check and the loss by row group with `IDL_FORCE_DEBUG=1`.

Fixed the same day: the stall and the failed factorisations were one bug. The seal friction's
`tanh(v / v0)` (v0 = 0.01 m/s) evaluated as a dual number divides cosh's infinities past about 300
(the fork at 3.5-4 m/s), and the NaN derivative spoiled every band it touched; friction is now
constant past |v / v0| = 20. Also: GPS fixes without a speed are skipped, force solves warm-start from
the window's pod-only solve, the deflection prior keeps tyres in range.

Real rides, second try (2026-11-25; the log now holds fork 75, shock 190, tyres 24 / 28.5 psi and
the rider's 1.80 m, as Isaac assumed them; his centre of mass at half his height above the bottom
bracket, standing a little upright). 30 s each, 4 identification windows of 6 s, every window
solved:

| | Beacon `173461a2` 2966-2996 s | 11/21 lap 2 `d1f49dac` 4930-4960 s (the bottom-out) |
|---|---|---|
| identification loss | 12.9 M -> 97 k (60 iterations, still falling slowly) | 24 M -> 343 k |
| front travel median / p99, mm (pods only) | 57 / 139 (54 / 152) | 55 / 155 |
| rear travel median / p99, mm (pods only) | 53 / 135 (48 / 139) | 50 / 135 |
| tyre loads median, front / rear, N | 423 / 462 (sum 885; weight 956) | 432 / 314 |
| fork damping LSC / HSC / LSR / HSR, factor on the nominal | 0.21 / 0.24 / 0.10 / 0.08 | 0.21 / 0.31 / 0.08 / 0.13 |
| shock pressure factor (on 190 psi) | 0.68 | 0.65 |
| pod rows' loss per 6 s window | about 7 k (as pods only) | about 31 k (4x pods only) |

Read: the fork's damping comes out the same on two rides weeks apart, at a fifth to a tenth of the
guessed nominal (the nominal was the problem). The shock wants two thirds of its logged pressure on
both: a leakier shock than assumed, or the shock's spring model or leverage too stiff; to check
against a measured sag. Not consistent between the rides: the shock's damping, the friction, the
tyres' damping (6-11x nominal) and the rider's springs (fore-aft and lateral near 0: a standing
rider barely sprung that way). On 11/21 the force rows still pull the pods 4x off their own fit: the
model misses something there (the rider, most likely: his rows carry the largest share). Next:
identification on more windows spread through whole rides, the sag check of the shock, then F2
(the helmet) for the rider.

Whole rides (2026-11-26): Beacon 884 s and 11/21 `d1f49dac` 859 s of riding, 6 identification
windows of 6 s spread through each (60 iterations, the cap, the loss still falling), then all 96 /
95 windows solved with the parameters frozen (0 failed; 69 / 66 min on 9 threads each). Sigma from
the reduced Hessian at the fit (`solve::globals_sigma`, printed with `IDL_FORCE_DEBUG`):

| factor on the nominal (x/ sigma) | Beacon | 11/21 |
|---|---|---|
| fork LSC / HSC / LSR / HSR | 0.08 (1.18) / 0.03 (1.63) / 0.07 (1.08) / 0.18 (1.05) | 0.22 (1.05) / 0.27 (1.03) / 0.13 (1.04) / 0.18 (1.03) |
| shock LSC / HSC / LSR / HSR | 0.42 (1.10) / 0.04 (2.36) / 0.18 (1.06) / 0.50 (1.04) | 0.52 (1.03) / 1.19 (1.02) / 0.23 (1.03) / 0.37 (1.05) |
| fork / shock spring ("pressure") | 1.16 (1.01) / 0.89 (1.01) | 1.40 (1.01) / 0.67 (1.01) |
| fork / shock friction | 1.12 / 5.92 | 0.21 / 2.00 |
| tyre stiffness front / rear | 1.34 / 0.70 | 1.84 / 0.74 |
| tyre damping front / rear | 2.12 / 10.09 | 2.23 / 9.96 |
| rider k up / c up | 0.84 / 0.25 | 0.78 / 0.19 |
| front / rear travel median / p99, mm | 51 / 132, 47 / 123 | 44 / 140, 56 / 120 |
| tyre normal force 1 % / median / 99 %, N, front; rear | 0 / 458 / 1133; -60 / 453 / 1204 | 0 / 449 / 1838; -114 / 466 / 1537 |

Read: the formal sigmas are a few percent, and the two rides (and Beacon's 30 s fit, fork LSC
0.21) disagree by many of them: what sets the parameters is model error, or drift the frozen
parameters cannot follow, not sensor noise; the sigmas are not to be quoted as uncertainty until
the residuals are white. Alike on both rides: fork HSR, fork knee, shock LSR, rear tyre stiffness
and damping, front tyre damping, the rider's vertical spring and damper. The spring factors may
differ for a real reason (pressures are assumed, not gauged, and the shock leaks). The spring factor
is a force scale on an air geometry that nothing measured anchors (the bike file's piston areas and
volumes; no sag tests in the log), so "shock pressure 0.67" reads as the rear spring a third softer
than the guessed curve, not as a pressure. The rear tyre's normal force goes negative: the law is
spring + c x deflection rate (gated by contact), and at 10x nominal damping the rebound term
outweighs the spring; a tyre cannot pull. Next: identification run to convergence (or its cap
shown not to matter); identification per window to see whether the spread is drift or misfit; the
normal force kept non-negative; the sag check; F2.

Laps only (2026-11-26; Isaac: the descents, not climbing, walking or the bike laid over; for
prototyping, the whole ride stays the goal through the NPU). `IDL_PHYSICS_LAPS` solves only inside
the session's laps (Beacon 6 laps, 531 s solved; 11/21 3 laps, 352 s), and the tyre's normal force
is now kept >= 0 (spring and damping together through a 1 N softplus). Both changes in one run, so
their effects are not separated. 19 / 15 min instead of 69 / 66.

| factor on the nominal (x/ sigma) | Beacon laps | 11/21 laps |
|---|---|---|
| fork LSC / HSC / LSR / HSR | 0.19 (1.08) / 0.09 (1.28) / 0.16 (1.05) / 0.23 (1.06) | 0.27 (1.04) / 0.24 (1.04) / 0.08 (1.06) / 0.16 (1.03) |
| shock LSC / HSC / LSR / HSR | 0.60 (1.06) / 0.03 (2.48) / 0.22 (1.05) / 0.60 (1.04) | 0.95 (1.08) / 1.05 (1.02) / 0.35 (1.08) / 0.44 (1.02) |
| fork / shock spring | 1.29 (1.01) / 0.82 (1.01) | 1.28 (1.01) / 0.78 (1.00) |
| fork / shock friction | 0.96 / 3.96 | 0.43 / 0.76 |
| tyre stiffness front / rear | 1.49 / 0.70 | 1.74 / 0.97 |
| tyre damping front / rear | 5.51 / 5.61 | 2.74 / 9.26 |
| rider k up / c up | 0.93 / 0.43 | 0.79 / 0.21 |
| front / rear travel median / p99, mm | 56 / 138, 46 / 139 | 58 / 149, 44 / 124 |
| tyre normal force 1 % / median / 99 %, N, front; rear | 0 / 531 / 1253; 0 / 388 / 1205 | 1 / 496 / 1964; 0 / 349 / 1732 |

Read: the spring factors now agree between the rides (fork 1.29 / 1.28, shock 0.82 / 0.78), which
whole rides did not (1.16 / 1.40, 0.89 / 0.67); the fork's dampers come closer (within 2x, not
within sigma); the shock's high-speed compression is unidentified on Beacon (x/ 2.5) and 1.0 on
11/21; the tyre loads stay positive. Still more spread than sigma everywhere.

Converged: with the cap at 200 (`IDL_FORCE_ID_ITERS`), Beacon's laps stop on their own at 65
iterations with the same parameters; the 60 cap was not what spread them.

Per lap (2026-11-26; `IDL_PHYSICS_LAPS=<n>`, 6 identification windows of 6 s inside each lap):

| factor on the nominal | B1 | B2 | B3 | B4 | B5 | B6 | E1 | E2 | E3 |
|---|---|---|---|---|---|---|---|---|---|
| fork LSC / HSC | 0.21 / 0.17 | 0.33 / 0.11 | 0.32 / 0.04 | 0.27 / 0.12 | 0.23 / 0.04 | 0.20 / 0.22 | 0.20 / 0.23 | 0.45 / 0.30 | 0.23 / 0.23 |
| fork LSR / HSR | 0.07 / 0.08 | 0.12 / 0.28 | 0.10 / 0.16 | 0.06 / 0.11 | 0.14 / 0.14 | 0.09 / 0.10 | 0.11 / 0.08 | 0.06 / 0.16 | 0.10 / 0.16 |
| shock LSC / HSC | 7.73 / 0.30 | 0.82 / 0.01 | 0.95 / 0.07 | 1.63 / 0.37 | 1.78 / 0.01 | 1.46 / 0.23 | 0.89 / 0.91 | 1.27 / 0.97 | 0.73 / 0.95 |
| shock LSR / HSR | 0.01 / 0.34 | 0.29 / 0.16 | 0.17 / 0.45 | 0.34 / 0.37 | 0.05 / 0.65 | 0.13 / 0.46 | 0.27 / 0.34 | 0.21 / 0.44 | 0.52 / 0.44 |
| fork / shock spring | 0.74 / 0.47 | 1.18 / 0.95 | 1.06 / 1.04 | 0.97 / 0.75 | 0.95 / 1.09 | 1.14 / 0.80 | 1.28 / 0.67 | 1.24 / 0.69 | 1.34 / 0.83 |
| fork / shock friction | 0.23 / 0.05 | 0.44 / 2.48 | 0.58 / 4.27 | 0.49 / 2.71 | 0.69 / 2.76 | 0.45 / 3.55 | 0.46 / 0.02 | 0.22 / 0.29 | 0.72 / 0.82 |
| tyre stiffness front / rear | 1.36 / 0.83 | 1.31 / 0.72 | 1.37 / 0.83 | 1.41 / 0.79 | 1.38 / 0.81 | 1.40 / 0.95 | 1.71 / 0.96 | 1.79 / 0.94 | 1.81 / 0.81 |
| tyre damping front / rear | 13.9 / 11.0 | 1.65 / 2.03 | 7.92 / 8.42 | 6.20 / 12.1 | 4.80 / 9.09 | 6.59 / 14.2 | 5.29 / 11.0 | 3.81 / 4.99 | 3.66 / 13.2 |
| rider k up / k roll / k yaw | 0.78 / 1.77 / 3.41 | 0.95 / 0.98 / 1.05 | 0.92 / 0.96 / 1.12 | 0.89 / 2.05 / 3.62 | 0.93 / 0.96 / 1.15 | 1.17 / 2.27 / 3.68 | 0.97 / 0.72 / 1.82 | 0.93 / 0.97 / 1.54 | 0.71 / 0.56 / 1.57 |

Read: no trend through either day (no heat drift visible); scatter. Tight within each ride: the
front tyre's stiffness (1.31-1.41 on Beacon, 1.71-1.81 on 11/21: the same logged 24 psi, so the
front tyre differed between the days or its pressure did), the rear tyre's (0.72-0.96), the
fork's low-speed dampers (LSC 0.20-0.33 but for E2, LSR 0.06-0.14), the shock's HSR (0.16-0.65,
mostly 0.34-0.46) and the rider's vertical spring (0.71-1.17). Scattered, and trading off: the
shock's HSC (0.01-0.97), friction (0.02-4.3), the tyres' damping (1.7-14) and the rider's rotational
springs, which sit near 1 (not moved from nominal: the data does not reach them) on B2, B3, B5 and
leave it together on B1, B4, B6. Lap 1 of Beacon is an outlier in nearly every row (a cold first
lap, or a stretch the model does not fit). The parameters that scatter are the ones that can
explain the same rows: model error lands on them. Next: the spring's progression (a fitted chamber
volume, Isaac to approve) and the static rest point moving with the fitted pressure, then F2.

The rest point follows the fitted pressure (2026-11-26, `AirChambers::rest_at`): the slow spring
carries the same static load at a scaled pressure, by Newton inside the law, the leverage's change
left out. Laps of both rides: Beacon's identification loss 164 k -> 159 k; spring factors fork /
shock 1.29 / 0.82 -> 1.26 / 0.88 (Beacon), 1.28 / 0.78 -> 1.28 / 0.82 (11/21); the rest within the
per-lap scatter.

How F1 is built: as navigation was (`physics/nav.rs`), a separate block, `physics/forces.rs`, with its own latents, rows, weights and parameters, on only when `Spec::forces` and `Window::forces` are set. The 14 core latents, their golden tests and the PyTorch fixtures stay as they are. The core latents the force rows read (travel, steer, the rear member, the frame motion) enter through the same `Sample` the pod rows use.

Acceptance (simulated truth and physics checks, never the IEKF; one-model spec §8):

- **Exact-model synthetic:** integrate the estimator's own force model over a known ground, rider
  input and drift, run its readings through the sensor model, solve: travel back within 2 mm rms,
  damper parameters and drift within their σ, from any start.
- **Independent synthetic:** the forward sim (whole-bike phase 1; `sim::ride` covers the rear today)
  over known terrain: travel, tyre force and terrain recovered.
- **Real rides** (11/21 x2, Beacon `173461a2`):
  - bottom-outs at or below the stop (11/21 lap 2 peak ≤ 171 mm), and the rear pod's misfit through
    the 50 g hits under 5σ (26σ today);
  - at stops and slow rolling, the static balance reproduces the bike file's sag within 3 mm;
  - the two 11/21 rides (same setup) give the same damper curve shapes within their σ;
  - drift goes the way Isaac feels it: springs stiffer and damping weaker toward the bottom of each run
    and through the day, recovering over breaks;
  - a click change: Isaac's next clicker test must move the fitted curve the right way (a prediction
    written before the ride);
  - rider stiffness per stretch through 11/21 (expected to trend with fatigue; reported, not gated).

## 9. Outputs

Channels (C1 §5, `derived_kind` "physics"): `Physics front tyre force (N)`, `Physics rear tyre force (N)`
(normal), `Physics front / rear tyre lateral (N)`, `Physics front / rear tyre tangential (N)`,
`Physics fork force (N)`, `Physics shock force (N)`, `Physics front / rear tyre deflection (mm)`,
`Physics rider force x / y / z (N)` and `Physics rider moment roll / pitch / yaw (N·m)` (the wrench on
the frame), the same for the active part (`Physics rider pump …`), `Physics ground (mm)`, and the drift
curves as channels (`Physics fork pressure scale`, `Physics shock damping scale`, …). Rim strikes and
insert contact show in the deflection channels against the tyre's limits.

Shelf gaps (whole-bike spec §11): standing-rider segment masses, inertias and stiffnesses (a segment
table, e.g. de Leva 1996, must be cited from the web or added to the shelf before it drives a number);
MTB tyre casing at low pressure (Pacejka gives structure only); damper oil viscosity against
temperature and air-shock heating (Dixon's thermal chapter to check first).

## 10. Cost, mobile and NPU

About 28 latents instead of 14, and about 15 more rows per sample: a window solve roughly 3-4x slower
(the normal matrix's band grows with the square of the latents at the finest level). The
identification's outer passes run over a window subsample. On phones (4 threads) a whole-ride force
solve is slow: the force model runs on the desktop first, and the phone's path is the NPU network.
Every law is smooth, fixed-shape and f32-safe (softplus contact, tanh friction, smooth knee): no
branches on data inside a window.

## 11. Rulings (Isaac, 2026-11-25)

1. Force tolerance: no view ("i have no idea"). Use §7's starting values, tuned on simulated truth.
2. Parameters: per ride for bike parts and per stretch for the rider, yes, but bike parts drift with
   heat (stiffer air, less damping in suspension and tyres toward the bottom of a run and through the
   day), so not strictly once per ride: §5's drift, measured then predicted.
3. Ground: one ground for both wheels with Huber on the tie (§6), not two profiles.
4. PyTorch: "whatever works", everything must work on mobile. Rust is the reference from now on; the
   PyTorch reference (`ml/idlml`) is frozen where it is (no fork twist, no Huber) and is not extended.
   The golden tests compare against fixtures it already produced, with the new terms held at 0. How
   the NPU network is trained is decided when that work starts (whole-bike spec §5.2 is superseded on
   this point).
5. Rider: 3-D, roll and yaw first in importance; Isaac suggested a single force vector + moment on
   the frame. §3.1 adopted (Isaac, 2026-11-25: "i'm in got the 6dof force/moment, as that should
   capture everything"). He shifts his weight fore and aft about as much as up and down: the pose
   prior is as loose fore-aft as vertical.

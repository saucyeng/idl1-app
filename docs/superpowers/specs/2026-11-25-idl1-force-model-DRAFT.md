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

Real rides (Beacon `173461a2`, 2966-2996 s, pressures given for the run: fork 75, shock 220, tyres
23.5 / 28.5 psi): the setup's static check holds every balance within 12 N / 8 N m, but the solve
does not converge. Identification takes one step and stalls (loss 9.3 M -> 1.2 M per 4 x 6 s; the
balance rows sit near 4 sigma on average, five times the pods' share), three of four 12 s windows
fail to factor (not positive definite), and the dampers' nominal values are far too strong (the
fork's 3000 N s/m low-speed rebound at the axle gives -8.5 kN in rebound, which no tyre load can
balance). Next, in order: why Levenberg-Marquardt stalls on the shared parameters; the failed
factorisations (conditioning); then nominal damping from a real curve. Each run prints its static
check and the loss by row group with `IDL_FORCE_DEBUG=1`.

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

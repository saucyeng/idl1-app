# Force model: Newton per body in the physics solver (DRAFT)

Status: DRAFT, 2026-11-25. Spec-first. Direction approved by Isaac 2026-11-25 ("force model sounds
good"): A (force balance per body), B (ground as an unknown), C (rider: torso + head, vertical + pitch
first), with his caveat that **the front and rear can take different lines** (tight turns, loss of
traction). Builds on the whole-bike sim spec §5.2 (the estimator's dynamics layer) and replaces its
single shared terrain profile with one per wheel. Open questions are in §11. Nothing here is built.

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
curve, tyre casing, rider stiffness) are the ones the sim uses (whole-bike spec §5.3).

## 2. The key simplification: specific force, no attitude

Accelerometers measure specific force, f = a − g. Newton for a body with gravity moved to the left is
m·f = Σ(contact forces). **Gravity drops out of every balance**, so the force model needs no attitude
and works with navigation off, like the rest of the objective. The specific force of each body comes
from the existing forward model (`readings.rs`: rigid-body transport from the frame's f0, w0, a0, plus
the relative motion from hyper-dual latents). Only the ground heights (§6) need navigation.

## 3. Bodies and balances (in-plane: the bike's x-z plane, plus pitch)

| Body | Mass (bike file, D3: never fitted) | Balance rows per sample |
|---|---|---|
| Front unsprung U_f (lowers, wheel, tyre, brake) | `mass_table().front_unsprung_kg` | 2: along the fork axis, across it |
| Rear unsprung U_r (wheel, tyre, axle share of the links) | `rear_unsprung_kg` (link masses split between pivots, reduced through the motion ratio) | 1: along the axle path |
| Rider torso T (point mass + pitch inertia) | rider mass less head and lower legs | 3: x, z, pitch |
| Rider head H (+ helmet, camera) | segment table (§9 gap) | 2 (phase F2): x, z, plus the helmet IMU rows |
| Whole system (bike + rider) | every mass | 3: x, z, pitch |

The **whole-system balance** replaces a frame balance. It needs no joint forces (fork bushings, pivots,
pedals, bar): the only non-gravity forces on bike + rider are the two tyre forces (air drag and rolling
resistance folded into the tyres' tangential forces). Σ mᵢ fᵢ = F_tyre,f + F_tyre,r, and the same for
moments about the frame pod. The lower legs are lumped into the frame (they move with the pedals).

### 3.1 The force laws (shared with `sim`, generic over `Real`)

| Element | Law | Fitted (per §5) | Fixed |
|---|---|---|---|
| Fork spring | `sim::suspension::AirSpring` from `fork.*` params, the sag fit, as `sim::ride` uses it (isothermal static point, adiabatic about it) | scale s_f, prior 1 ± 0.05 | area, volumes, tokens |
| Shock spring | the same through the leverage (`physics::fourbar`), virtual work (Cossalter §5.3, PDF 177-179) | scale s_r, prior 1 ± 0.05 | |
| Bump stops | stiff smooth stop at full travel (both ends, top-out too) | — | stiffness |
| Dampers | `sim::ride::Damper` shape (LSC, HSC, LSR, HSR, knee) with a smooth knee; Dixon ch. 7 (PDF 277) | 5 per end | — |
| Seal friction | smoothed Coulomb, F_c tanh(v / v_0) | F_c per end | v_0 |
| Tyre radial | `sim::tyre::Tyre::force` (air + casing, CushCore crush, rim strike), lift-off as a softplus | casing_pa, damping per tyre | pressure (log), insert height |
| Rider legs, arms | spring + damper between torso and its contact point (BB / bar), plus an active force | k, c per stretch; neutral pose per stretch | |
| Neck (F2) | rotational spring + damper | k, c per stretch | |

Every law becomes one generic function used by both solvers. The sim calls it with smoothing width 0,
which gives today's hard switches; the estimator uses a small width so Gauss-Newton and the NPU see
smooth functions (one-model spec §7).

## 4. New latents (per sample, uniform cubic B-splines as today)

| Latent | Meaning | Knot spacing | Prior |
|---|---|---|---|
| δ_f, δ_r | tyre radial deflection, m | 1 | none (smoothness); force is tension-free |
| φ_f, φ_r | direction of the tyre force in the bike plane (the local ground normal relative to the bike), rad | 4 | 0 ± 0.3 rad |
| T_f, T_r | tyre tangential force (braking, drive, drag), N | 4 | 0 ± 500 N |
| torso x, z, θ | torso pose relative to its neutral pose on the frame, m, rad | 2 | 0 ± 0.15 m / 0.3 rad |
| u_legs, u_arms | rider's active force (pumping, unweighting), N, along the leg / arm line | 50 ms (pumping < 3 Hz) | 0 ± 300 N |
| head θ (F2) | neck angle, rad | 2 | 0 ± 0.3 rad |

NL goes from 14 to about 25. Travel stays a latent: the force rows check it, they do not replace it.

**Counting.** In F1, per sample, the new rows are 1 (fork axis) + 1 (axle path) + 3 (torso) + 3 (system)
= 8 and the new latents are 9 (plus u at a low rate); the soft priors take up the slack. The across-axis
fork row joins in F3, when bending becomes load / stiffness (until then the bushing load is unknown, and
the row says nothing). The system balance gives the sum of the tyre forces; the torso balance splits the rider's share;
each unsprung balance turns its tyre force into a suspension force; the spring + damper law turns that
into travel. The model is closed, not a pile of free signals. Without a helmet IMU the torso is seen
only through the system balance; the head rows tighten it (F2). Identifiability is checked on exact
synthetic data first (as `physics_identifiability.rs` did for flex, §8).

## 5. Parameters: what is fitted where

- **Per ride** (bike parts can change between rides: clicks, pressure): both damper curves, friction,
  spring scales, tyre casing and damping. About 20 numbers.
- **Per riding stretch** (Isaac fatigues through a day, so the rider drifts): leg, arm, neck stiffness
  and damping, and the torso's neutral pose. Stretches are already split by stops (one-model spec §4).
- **Never fitted:** masses (D3), pressures, geometry.
- **Identification across windows** (bundle-adjustment form): solve every window with the current
  parameters (chained per stretch as today), reduce each window's normal equations onto the parameters
  (Schur complement of its banded latents: one band solve per parameter), sum per ride / stretch, add
  the priors, take a Levenberg-Marquardt step, repeat (3-5 outer passes). The window handoff priors
  are ignored in the reduction (an approximation). For speed, identify on a fixed subsample of
  windows, then solve the whole ride once with the parameters frozen.
- Output: a fit file (parameters, σ from the reduced Hessian, the windows used) beside the solve's
  parquet in `derived/` (C1 §5, `derived_kind` "physics"), content-addressed like the solve.

## 6. Ground per wheel (phase F4: needs navigation)

Each wheel has its own ground. The latent is the tyre deflection; the ground height under wheel w is
derived: h_w(t) = z of the contact point = axle − (r₀ − δ_w)·n̂(φ_w), with positions from integrating
the velocity spline (window-local; the unknown constant cancels in differences).

Rear-follows-front prior: h_r(t) vs h_f(t − τ(t)), where τ is the time to travel one wheelbase along
the path (∫|v_h| dt = L). Its σ grows with how far the rear's track is from the front's:

- e_lat(t) = off-tracking in a turn (≈ L² / 2R, R = v / ψ̇ from the nav) + slide (chassis slip × L);
- σ_g = √(σ₀² + (k_g · e_lat)² + (σ_vz · τ)²), with σ₀ 5 mm, k_g ≈ 1 (a 5 cm offset gives a 5 cm σ:
  effectively off), σ_vz the vertical velocity's uncertainty;
- off below 1.5 m/s (τ long, position drift large) and while either tyre is off the ground.

This is never a hard shared profile, and nothing else ties the two grounds. φ_w is then also checked
against the ground's slope: φ_w ≈ slope of h_w − bike pitch (soft, σ 0.1 rad).

## 7. Rows, weights and robustness

- Each balance row is (m·f − ΣF) / σ_F. σ_F = σ₀ + ρ·|F_model|, with ρ = 10 % (model error grows
  with the force), σ₀ = 20 N on the unsprung rows and 50 N on the torso and system rows, capped at
  1.5 kN. σ_F is frozen within a Gauss-Newton iteration (IRLS, like Huber).
- The cap matters: with no cap, the residual of a huge bump-stop force tends to 1/ρ, and the stop would
  stop stopping. The existing wall rows (15..19) stay, as the hard backstop.
- Huber k = 3 on the force rows, as on the sensor rows (version 3): one unmodelled event (a foot off
  a pedal, a hand off the bar, a casing pinch) must not drag the rest.
- Starting values: δ from the static load at sag, φ = 0, T = 0, torso at neutral, damper parameters
  from `Damper::default` scaled to the fork's and the shock's leverage.

## 8. Phases and acceptance

Each phase is behind `Spec::forces` (off by default, like `nav`) and bumps `PHYSICS_ESTIMATOR_VERSION`.

| Phase | Adds | Needs |
|---|---|---|
| F0 | the force laws generic over `Real` in `sim` (tyre, damper, air spring, smooth contact), with the sim unchanged (its tests pass) | — |
| F1 | unsprung rows (along-axis), system rows, torso, δ / φ / T / torso / u latents, per-ride and per-stretch parameters, identification | F0 |
| F2 | head + helmet IMU rows (`Cam_Accel*`, `Cam_Gyro*`, camera mount rotation fitted per ride) | F1, nav (gravity is in `Cam_Accel` as specific force, but the mount needs the head's rate) |
| F3 | flex as load / stiffness: fork bending from the across-axis load (φ, T), rear member and frame pod flex from the linkage loads; one stiffness per part | F1 |
| F4 | ground per wheel, rear-follows-front prior, terrain output for the sim | F1, nav |

Acceptance (simulated truth and physics checks, never the IEKF; one-model spec §8):

- **Exact-model synthetic:** integrate the estimator's own force model over a known ground and rider
  input, run its readings through the sensor model, solve: travel back within 2 mm rms, damper
  parameters within their σ, from any start.
- **Independent synthetic:** the forward sim (whole-bike phase 1; `sim::ride` covers the rear today)
  over known terrain: travel, tyre force and terrain recovered.
- **Real rides** (11/21 x2, Beacon `173461a2`):
  - bottom-outs at or below the stop (11/21 lap 2 peak ≤ 171 mm), and the rear pod's misfit through
    the 50 g hits under 5σ (26σ today);
  - at stops and slow rolling, the static balance reproduces the bike file's sag within 3 mm;
  - the two 11/21 rides (same setup) give the same damper curves within their σ;
  - a click change: Isaac's next clicker test must move the fitted curve the right way (a prediction
    written before the ride);
  - rider stiffness per stretch through 11/21 (expected to trend with fatigue; reported, not gated).

## 9. Outputs

Channels (C1 §5, `derived_kind` "physics"): `Physics front tyre force (N)`, `Physics rear tyre force (N)`,
`Physics fork force (N)`, `Physics shock force (N)`, `Physics front tyre deflection (mm)`,
`Physics rear tyre deflection (mm)`, `Physics rider leg force (N)`, `Physics rider arm force (N)`,
`Physics rider pump (N)` (the active part), and in F4 `Physics front ground (mm)`, `Physics rear ground (mm)`.
Rim strikes and insert contact show in the deflection channels against the tyre's limits.

Shelf gaps (whole-bike spec §11): standing-rider segment masses and stiffnesses (a segment table, e.g.
de Leva 1996, must be cited from the web or added to the shelf before it drives a number); MTB tyre
casing at low pressure (Pacejka gives structure only).

## 10. Cost and NPU

About 25 latents instead of 14 and about 9 more rows per sample: a window solve 2-3x slower (the normal
matrix's band grows with the latents' count squared at 1-sample knots, only δ is at 1). The
identification's outer passes run over a window subsample. Every law is smooth, fixed-shape and f32-
safe (softplus contact, tanh friction, smooth knee): no branches on data inside a window.

## 11. Questions for Isaac (asked 2026-11-25, in chat)

1. Force tolerance: 10 % of the force plus a small floor, capped, with Huber.
2. Fitted per ride (bike parts) and per stretch (rider); masses never; pool rides with the same setup later.
3. Ground coupling: relax by how far the rear's track is from the front's; off below 1.5 m/s.
4. The PyTorch reference: the force model is built Rust-first and the reference catches up later
   (torch is not installed; the reference already lags by fork twist and Huber). Whole-bike spec §5.2
   said the reference leads.

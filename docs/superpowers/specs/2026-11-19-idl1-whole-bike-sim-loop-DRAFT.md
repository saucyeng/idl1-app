# DRAFT — The whole-bike loop: estimate, identify, simulate, ride, compare

Status: draft r1, 2026-11-19. Architecture: needs Isaac's yes on every decision in §10
before anything here is built. Written for Claude; Isaac gets the decisions as an in-chat
walkthrough. Sits above `2026-11-19-idl1-drivetrain-sim-DRAFT.md` (the chain becomes one
component of this) and `rust/ml/README.md` / `core::estimate::physics` (the physics
estimator becomes the inverse half of this).

## 1. What Isaac asked for (2026-11-19)

- A whole-bike simulator, "kind of like Ansys": the drivetrain is one component of it.
- All the suspension dynamics: spring, damper, tyres, a whole mass table with an automatic
  estimate of sprung, unsprung and rotating masses and moments of inertia.
- Work backwards through a tyre model to turn IMU data into estimated terrain, then feed
  that terrain forward through tyre, bike and rider models. The rider "maybe half and half":
  part model, part input.
- Plan the whole data loop, e.g. take the chain off: the rider feels it, the data should
  show it, the simulator should predict it.
- Linkages other than the Horst 4-bar: single pivot, counter-rotating (short-link) 4-bar,
  6-bar.
- Drafted now, so the near-term decisions (sim result format, chain sim merge) are made
  with this goal in mind.

## 2. Vocabulary: one physics, three uses

The same equations are used three ways. The names differ by what is unknown.

| Use | Known | Unknown | Today |
|---|---|---|---|
| **Forward simulation** | bike parameters, inputs (terrain, rider) | motion, forces | `core::sim` (chain only, travel prescribed) |
| **Estimation** (inverse) | pod readings, GPS, bike parameters | motion (travel, steer, bending, flex) | `core::estimate::physics` — kinematic only, no forces |
| **Identification** (fitting) | pod readings, GPS | bike parameters (and inputs) | the estimator's bike fit (geometry only) |

All three minimise a loss subject to constraints. "Machine learning" in this project means
only one thing: a model part whose form is **not** physics (a learned function whose
parameters mean nothing on their own). Rule (proposed, D6): physics everywhere a physical
model exists; a learned part only as a *residual* on a physics model (grey box), only where
validation shows the physics falls short, and never as the whole model. Reason: a
counterfactual ("chain off", "different idler") is outside the data by definition, and only
a model whose parameters are physical extrapolates to it. `ml/` is physics estimation in
PyTorch (autodiff + GPU), not ML in this sense.

## 3. The loop

1. **Measure.** Ride with the pods (IMU0 frame, IMU1 fork, IMU2 rear) and GPS.
2. **Estimate motion.** The physics estimator: travel, steer, bending, flex (exists).
3. **Identify.** With a dynamics layer added (§5.2): fit the dynamic parameters (spring,
   damper, tyre, rider passive, drivetrain drag) and estimate the unknown inputs (terrain
   profile, rider active input) so the motion obeys the equations of motion.
4. **Simulate the change.** Same terrain, same rider input, changed bike (chain off, an
   idler, a clutch setting, a spring rate). Forward sim (§5.1).
5. **Predict a signature.** What the pods would read under the change: travel velocity
   histogram, top-out count, frame-pod energy by band, chain-slap events.
6. **Ride it and compare.** Measure the changed bike; the misses refine step 3.

The chain-off A/B ride needs none of the new machinery: same descent, chain on and off,
the existing estimator on both. If the difference is visible, that pair is the first
benchmark the full loop must reproduce (§8).

**Why replaying measured travel cannot answer "chain off".** Today's `Excitation`
prescribes travel and frame motion; the chain responds but cannot push back. A changed
bike's travel is the *answer*, so it cannot be the input. The input has to be what does
not change with the bike: the terrain (and, to first order, the rider's intent).

## 4. The bike model: one description, the bike file

Everything the estimator and the simulator know about a bike lives in the bike file
(`bikes/<bike_id>.json`, newer section wins on merge). Both read it; neither keeps its own
copy. Sections, existing and new:

### 4.1 Linkage: a general planar mechanism (replaces the Horst named points)

Today `calibration::linkage::LinkagePoints` has named Horst points and the pose is two
circle intersections. Proposed (D2):

- **Bodies**: front triangle (ground), and any number of moving links, each a rigid body
  with named points in its drawn (topped-out) pose.
- **Joints**: revolute joints between two bodies at a point. (Sliders later if a design
  needs one.)
- **Elements**: the shock as a two-eye element between two bodies (eye-to-eye length is
  its coordinate); the rear axle as a point on one body.
- **One coordinate**: the mechanism has one degree of freedom; the solver poses it at a
  given shock length or a given rear travel by closing every loop with Newton's method.
- **Differentiable**: the estimator fits through the pose, so the solve gives exact
  derivatives (implicit function theorem on the converged loop equations, evaluated with
  the same num-dual types the estimator uses).
- **Covered**: single pivot (1 moving body), linkage-driven single pivot, Horst 4-bar,
  split pivot / Trek ABP (a 4-bar with the axle on the joint), short-link and
  counter-rotating 4-bars (VPP, DW-link style), Stephenson and Watt 6-bars.
- **Migration**: a Horst bike file converts to this form exactly; a test holds the new
  solver to the current `LinkagePose` to 1e-9 m across travel for the GT Force file.
- **Photo tool**: places points per body and draws joints; the type is a template that
  pre-creates bodies and joints (single pivot, Horst, …), editable.

Layer: `core::calibration::linkage` (physics of the bike). The estimator's `fourbar`
becomes the general solver's caller.

### 4.2 Mass table (D3)

One row per part: mass (kg), centre of mass (point on a body), inertia about its centre
(kg·m², in-plane; 3-D tensor later), body it rides on, and a `source`: `measured`,
`estimated`, or `fitted`, with an uncertainty.

- **Automatic estimate** from what a rider can find: total bike mass, wheel and tyre
  masses, fork and shock masses (spec sheets), frame mass. Shapes give the inertia:
  wheels as rim ring + hub + spokes, tubes as rods between the photo's points, the rider
  as segments from height and mass. A measured value always overrides an estimate.
- **Derived lumps** the models use, computed, never typed in: sprung mass and pitch
  inertia (everything on the front triangle and a share of the links), rear and front
  unsprung masses (each linkage body's mass reduced to the axle through the linkage's
  motion ratio, Dixon ch. 4 installation and motion ratios, PDF 153), rotating inertias
  (wheels, cassette, cranks).
- **Refined by identification**: a row with `source: estimated` is a prior; the fit may
  move it within its uncertainty and marks it `fitted`.

### 4.3 Suspension elements (D4)

Shock and fork, each:

- **Spring**: coil (rate) or air (chamber volumes, spacers, pressure → force curve);
  negative spring; bottom-out bumper.
- **Damper**: force–velocity curve per direction (compression, rebound), with
  low/high-speed regions and a clicks-to-curve map per adjuster; friction (seal stiction).
  Dixon ch. 7 force–velocity, friction and hysteresis, PDF 277; ch. 8 adjusters, PDF 307.
- **Installed**: the shock's force goes through the general linkage (§4.1); the fork's
  along its axis.

Values start from measurement (dyno sheet if one exists, else the spec sheet's curve
shape scaled by identification).

### 4.4 Tyres (D5)

In-plane first: a radial spring and damper (carcass), a footprint that envelops the
terrain (the tyre cannot follow features shorter than its contact patch; it filters the
profile), and lift-off (no tension). Longitudinal force (braking, driving) second; lateral
and camber with the 3-D model. Reference: Cossalter ch. 2 (radial stiffness PDF 71,
carcass elasticity and tyre model §2.8–2.10, PDF 83).

Caveat: Cossalter's numbers are motorcycle tyres at motorcycle pressures; an MTB tyre at
1.3–2 bar with an insert is a different regime. Use the book's model structure only; get
the numbers from a drop or a static load test (§8) and from identification.

### 4.5 Rider: half model, half input (D7)

- **Passive**: the rider as masses on springs and dampers at the contact points (hands on
  the bar, feet on the pedals; the saddle only when seated), parameters per rider.
  Dixon §3.6 "Passenger on seat", PDF 136, for the seated case; standing is the usual MTB
  case and has no shelf reference (gap, §11).
- **Active**: what the rider does on purpose (pumping, unweighting, weight shifts) is an
  unknown input force at those contact points, estimated like terrain.
- A rider is their own file (`riders/<rider_id>.json`), not part of the bike's: one rider
  rides several bikes.

### 4.6 Drivetrain as a component (the chain sim)

The chain sim (drivetrain spec) stays as it is, with two changes:

- **Two-way coupling**: the chain's tension at the cog and the clutch's torque at the
  cage act on the swingarm body (squat and kickback: Cossalter §6, chain force and the
  squat line, PDF 243–246). Chain off = the component removed.
- **Excitation becomes a choice**: `prescribed` (today: travel and frame motion given)
  or `coupled` (the bike sim supplies the swingarm's motion each step and takes back the
  chain's forces).

## 5. Solvers

### 5.1 Forward: the whole-bike simulator

- **Bodies (in-plane)**: front triangle (x, y, pitch), linkage (one coordinate), fork
  (travel), two wheels (rotation), tyres (radial deflection is a force, not a body),
  rider passive masses (2–4 coordinates). Roughly 10 coordinates, against the chain's
  ~236.
- **Integrator**: implicit or semi-implicit at a step set by the stiffest element (the
  tyre and the bump stops); the chain keeps its 50 µs step and is co-simulated
  (D8: the chain substeps inside each bike step, exchanging swingarm motion for chain
  forces).
- **Inputs**: terrain profile (height against distance, one profile both wheels roll
  over), speed (GPS), rider active input, pedal state.
- **Outputs**: every body's motion and every element's force as tracks of a sim result
  (§6). Plus *predicted pod readings*: what IMU0/1/2 would read, so a sim compares to a
  ride in the space the pods measure.
- Comparisons between setups by statistics over many terrain stretches, not one run's
  peak (drivetrain spec §14 already found peaks chaotic).

### 5.2 Inverse: the estimator's dynamics layer

The estimator's objective today: pod residuals, kinematic priors, smoothness. Proposed
addition: an **equations-of-motion residual** (the estimated motion must satisfy the
bike model's force balance with the current parameters, within a modelled error), and two
new unknown signals per window: the terrain profile and the rider's active input.

- **Terrain is well posed**: the rear wheel crosses the ground the front wheel crossed one
  wheelbase earlier (delay = wheelbase / speed). One profile explains both wheels; that
  redundancy is what separates terrain from rider input and from model error.
- **Rider input is the weak part**: it acts at the bar and pedals, which the frame and fork
  pods see only through the bike. Separation comes from where it acts and its frequency
  (a rider pumps at well under the wheel-hop frequencies). A pod on the rider (back or
  helmet) would make it observable directly (D9).
- **Parameters** (spring, damper, tyre, rider passive, mass-table rows) are fitted across
  many windows with shared values, as the bike fit does for geometry today.
- Same layer and style as today: `core::estimate::physics`, num-dual derivatives, banded
  Gauss-Newton; the PyTorch reference in `ml/` leads and the Rust port follows, as now.

### 5.3 Why two solvers, one description

The estimator needs a smooth, differentiable model fitted over a whole ride. The forward
sim needs contact that switches on and off and a chain that is chaotic; it needs no
derivatives. Sharing the solver would make both worse. They share the bike file, the
linkage solver, the mass table, the element models (spring, damper, tyre force laws as
plain functions generic over the number type), and the terrain and rider-input signals the
estimator produces and the simulator consumes.

## 6. Data products

- **Sim result** (wire `IDLM` v1, D1; human name "sim result"): a JSON header with
  `components` (drivetrain, suspension, tyres, rider, each with its own metadata) and
  `tracks` (`name`, `component`, `kind` = `xy` | `xyz` | `angle` | `scalar`, `count`,
  `unit`, optional `labels`), then frame times and each track's f32 values. A new
  component adds tracks, not a version. Replaces the chain sim's colliding `IDLS` v1.
- **Derived ride products** (C1 §5 derived store, content-addressed by inputs): estimated
  terrain and rider input per ride, keyed by (blob, importer version, bike file section
  hashes, rider file hash, estimator version). Synced only because they are
  content-addressed (principle 2).
- **CLI**: `idl-rs sim run`, `idl-rs session estimate-terrain`, `idl-rs bike masses`
  (the table and its derived lumps). A sim result on disk uses the same layout as the
  wire (so its definition moves into `core` with the CLI verbs; D1).

## 7. Layers

All the physics in `core` (bike file sections, linkage solver, element models, forward
sim, estimator dynamics layer, terrain). `library`: storing derived ride products and
riders. `idl1-bridge`: commands and the wire encoding. App: drawing. Nothing new in
`transport`. Every piece passes the decision rule: a CLI user with another logger would
need it.

## 8. Validation

- **Bench, per bike**: static sag at several loads (spring + linkage), a drop from a
  known height on the pods (tyre and damper together), wheel spin-down (rotating inertia
  and hub drag), weighing each part for the mass table.
- **Ride benchmarks**: chain-on / chain-off A/B on one descent; a shock clicker sweep
  (rebound ±N clicks) on one stretch. Each predicted before it is ridden.
- **Acceptance**: the loop predicts the *sign and size* of each benchmark's difference in
  the pod-space statistics within the ride-to-ride spread of repeated runs. Repeat runs of
  the same setup are required to know that spread.
- **Tests**: element models against closed forms (1-dof and 2-dof bounce and wheel hop,
  Cossalter §5.6–5.9, PDF 199; Dixon ch. 2, PDF 79); linkage solver against today's Horst
  solver and against brute-force geometry for each template; forward sim → predicted pod
  readings → estimator recovers the terrain it was given (the round-trip test of the whole
  loop on synthetic data, before any real ride).

## 9. Phases

0. **Decisions** (§10). Then the two schema changes that everything builds on: the
   general linkage (§4.1, with the Horst migration) and the mass table (§4.2).
1. **Forward in-plane suspension sim** on synthetic terrain; chain coupled; sim result
   with components. Chain on/off differs in the sim.
2. **Element models in the estimator + dynamics residual + terrain estimate**; the
   synthetic round-trip test passes.
3. **Identification on real rides**; bench tests; chain on/off benchmark predicted then
   ridden.
4. **Rider model** (passive fitted, active estimated); rider pod if D9 says so.
5. **3-D** (lean, steer, lateral tyre forces), building on the estimator's existing 3-D
   kinematics.

The drivetrain merge (idler fix, `IDLM`) happens before phase 0 and is compatible with it.

## 10. Decisions for Isaac

- **D1** Sim result format: `IDLM` v1 with components and tracks, named "sim result";
  becomes the on-disk format too when the CLI verbs land.
- **D2** General planar linkage (bodies, revolute joints, shock element, Newton loop
  closure, exact derivatives) replaces the Horst named points, with an exact migration.
- **D3** Mass table rows with `measured` / `estimated` / `fitted` sources and derived
  lumps computed, never typed.
- **D4** Spring and damper models: which data exist (dyno sheets? spec curves only?).
- **D5** Tyre: in-plane radial + enveloping footprint first; numbers from bench tests.
- **D6** The "learned only as a residual" rule.
- **D7** Rider: passive model + active input; riders as their own files.
- **D8** Chain co-simulated inside the bike step (two-way).
- **D9** A rider pod (hardware): wanted, or not for now?
- **D10** Phase order (§9), and that phase 0 starts after the drivetrain merge.

## 11. Shelf gaps

The shelf has Cossalter (motorcycle tyres, in-plane suspension models, chain force and
squat) and Dixon (dampers, vibration theory, installation). It has nothing on: planar
mechanism kinematics and loop closure, multibody dynamics and integrators, system
identification and input estimation, MTB-specific tyres at low pressure, standing-rider
biomechanics. Before any of those drives a number, add a book or cite the web and say so.

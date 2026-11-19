# DRAFT — Drivetrain simulation: chain growth and chain slap

Status: proposal for Isaac, 2026-11-19, revised the same day with his
answers (§1). Spec-first. Nothing is built until §10 is answered. Adds a
module to idl-rs core, a `drivetrain` section to the bike file, a derived
kind to the derived store, and a top-level **Simulate** tab after Notebook.

Long-term frame: a full-bike simulator ("how does this theoretical setup
ride a known track"). This draft is the drivetrain, and sets the bike model
and replay plumbing the later parts reuse.

Builds on idl-rs branch `physics-estimator` (not yet on `main`): the linkage
photo tool (`ml/tools/linkage.html`), `calibration::linkage::{Linkage,
LinkagePoints}`, the 4-bar solver `estimate::physics::fourbar`, the bike
file's `linkage` section, and the physics estimator's derived channels.

## 1. What Isaac asked for, and his answers (2026-11-19)

- A chain and derailleur physics simulator: how the chain slaps over bumps,
  and chain growth through travel. It lives in a **Simulate** tab after
  Notebook (Device · Data · Notebook · Simulate · Settings).
- Growth is *through travel* (length, not lateral chainline). Anti-squat
  later.
- 1× drivetrains, with optional **top and/or lower rollers**.
- Dynamics are the **full system**: the whole chain loop, plus the inertia
  of the cassette and every other rotating part, not just the slack span.
- Isaac measures the drivetrain parameters on 2026-11-20 (§11) and will
  validate with video later.
- The sim lives in idl-rs core.
- Sim outputs next to a session's channels: "maybe, that's the idea to
  test theoretical suspension response" (see §6 for what replay can and
  can't answer).

## 2. Physics

### 2.1 Bodies on a Horst-link bike

The photo tool's linkage is a Horst 4-bar (GT Force). That puts the
drivetrain on **three moving bodies**, not two:

| Body | Carries | Motion |
|---|---|---|
| Front triangle | BB / chainring, frame-mounted rollers or guide | Prescribed from IMU0 (§5) |
| Chainstay (main pivot → Horst) | the chainstay protector the lower span hits | Rotates `θ_cs(s)` about the main pivot |
| Seatstay (Horst → axle, → rocker) | rear axle, cassette, **derailleur hanger** | 4-bar pose at travel `s` |

So the derailleur turns with the seatstay, the surface it slaps sits on the
chainstay, and the chain is anchored on the front triangle. Through travel
all three move relative to each other. The existing `fourbar()` gives the
chainstay angle from travel. The sim also needs the seatstay pose, which the
private `axle()` already computes. §3 proposes making both public.

### 2.2 Kinematic (quasi-static): chain growth

Pure geometry in the side plane. The loop: chainring → (top roller) → cog →
upper jockey → lower jockey → (lower roller) → chainring, as tangent segments
and wrap arcs. At each travel `s` and gear:

- **Chain growth** `G(s)`: the change in the top (drive) span's path length
  from a chainring tooth to a cog tooth, wrap changes included.
- **Cage angle** `θ_cage(s)`: the angle that closes the loop at the real
  chain length (a 1-D root find).
- **Kickback** (wheel locked to the seatstay, the Linkage convention):
  `θ_kick(s) = (G(s) + r_cog · Δφ_ss(s)) / r_ring`, with `Δφ_ss` the
  seatstay's rotation relative to the front triangle. The tool's own sweep
  already prints the seatstay rotation over the stroke.
- **Clearance**: the lower span's distance to the chainstay protector,
  through travel.

These are milliseconds of work and are computed on demand, never stored.

### 2.3 Dynamic: why slap happens (scaling)

Seen from the front triangle, each bit of chain feels a body force equal to
minus the **specific force** at that point (what an accelerometer there
would read). Gravity is already inside it, so the IMU gives exactly the term
that's needed, without separating gravity out. For a span of length `L`,
tension `T` and mass per length `μ`:

```
static deflection  δ = μ·f·L² / (8·T)        sharp hit ≈ 2δ
first mode         f₁ = √(T/μ) / (2L)
```

With a 126-link 12-speed chain (μ ≈ 0.17 kg/m): T = 25 N and L = 0.40 m
give f₁ ≈ 15 Hz, with δ ≈ 13 mm at 10 g and 26 mm at 20 g. A lower roller
that shortens L to 0.25 m cuts δ to about 5 mm at 10 g. **Span length
counts squared, tension only linearly.** f₁ falls at 12–30 Hz, inside what
a rock garden puts in, so slap is a resonance problem and a time-domain sim
earns its keep.

The non-linearities that make it worth simulating, not just evaluating:

- **Clutch stick-slip** (Coulomb). Below breakaway the cage is locked; above
  it, the cage swings and the span goes slack.
- **Freehub ratchet.** The cassette is coupled to the wheel only in the
  drive direction, after the engagement angle's backlash. When the wheel
  overruns the cog (coasting at speed), top-span growth spins the cassette
  forward and never reaches the cranks. That makes *real* kickback depend on
  speed, and the cassette's inertia governs how the top span snaps when it
  catches.
- **Chain lift-off** from the chainring and cog when the span tension goes
  slack. Lift-off on the ring is the derailment-risk output.

### 2.4 The dynamic model (full system)

- **Chain**: one node per link (126 nodes for 126 links, pitch 12.7 mm, mass
  = chain mass / links). Links are rigid distance constraints (a steel chain
  has no useful axial compliance), joints have no bending stiffness. The
  constraints are solved by projection (XPBD) each step.
- **Sprockets, jockeys and rollers**: a node on the wrap arc seats on the
  pitch circle (unilateral radially, toothed tangentially while seated) and
  lifts off when its contact force would go negative. Engagement and
  departure points emerge from that; they are not prescribed.
- **Rotating DOFs**, each with its inertia:
  - crank + chainring (+ rider's feet, §10 Q1);
  - cassette + freehub body, coupled to the wheel by the ratchet and its
    engagement angle;
  - upper and lower jockey, with bearing drag;
  - each roller.
- **Cage**: one rotational DOF with inertia `J_cage`, spring torque
  `τ_s(θ)`, clutch friction `±τ_c`, and bearing damping.
- **Wheel**: angular speed prescribed (§5), not simulated.
- **Contact surfaces**: polylines on any body (chainstay protector,
  seatstay, frame near the ring) as penalty spring-dampers. They give
  contact events, impact speed, impulse and the position along the
  protector.
- **Frame**: the integration runs in the front triangle's (non-inertial)
  frame, so the inertial terms (specific force, Euler and centrifugal from
  pitch rate, Coriolis) act on each node. Chainstay and seatstay motion
  comes in through the 4-bar at the given travel.
- **Planar** in v1 (§10 Q2).
- **Step**: fixed at 0.05–0.1 ms (transverse waves at ≤ 20 m/s across a
  12.7 mm link need < 0.6 ms). 126 nodes × 10–20 k steps/s is cheap: a
  60 s lap should run in seconds on one core.

Not modelled: tooth profile, link side-plates, lateral bending, the rider's
reaction to kickback.

## 3. Layers

Physics of the bike → `core`; a CLI user wants it (Isaac, 2026-11-19).

```
rust/core/src/calibration/linkage.rs   + pub 4-bar pose: travel -> chainstay angle,
                                         seatstay pose (lifted from estimate::physics::fourbar,
                                         which keeps using it)
rust/core/src/calibration/drivetrain.rs  NEW. The bike file's drivetrain section (§4)
rust/core/src/sim/                       NEW. Pure, std only.
    chain_path.rs   §2.2 tangent/wrap solver, cage closure, growth, kickback
    chain_dyn.rs    §2.4 nodes, sprockets, cage, ratchet, contact, integrator
    excite.rs       §5 a session's channels -> the sim's prescribed inputs
rust/library/src/sim.rs                  NEW. Runs a sim over a session, writes the
                                         derived file (as physics.rs does)
rust/cli/                                `idl-rs sim kinematics` / `idl-rs sim run`
crates/idl1-bridge/                      #[tauri::command(async)] sim commands, Channel
                                         progress, frames as raw bytes
app/src/routes/pages/Simulate/           the tab (§7)
```

## 4. The bike file: a `drivetrain` section

Beside `linkage` in `bikes/<bike_id>.json`, with the same rules: optional,
`updated_at_ms`, and the newer copy wins a merge. It uses the same frame as
`LinkagePoints` (origin at the rear axle, x toward the front axle, y up,
metres, topped out), and each point is tagged with the body it rides on.

```jsonc
"drivetrain": {
  "updated_at_ms": …,
  "bb_m": [0.43, 0.02],                         // front triangle
  "chainring_teeth": 32,
  "cassette_teeth": [10,12,14,16,18,21,24,28,32,36,42,52],
  "chain": { "links": 126, "mass_kg": 0.270 },
  "derailleur": {
    "b_knuckle_m": [-0.01, -0.03],              // seatstay (hanger)
    "cage_pivot_to_upper_m": 0.0, "cage_length_m": 0.095,
    "jockey_teeth": [12, 12],
    "spring_torque_nm": [[0.0, 0.35], [0.6, 0.55]],   // [cage rad from free, N·m]
    "clutch_torque_nm": 0.4, "cage_inertia_kgm2": 2.0e-5, "jockey_inertia_kgm2": 1.0e-6
  },
  "rollers": [ { "body": "front_triangle", "centre_m": […], "teeth": 14, "span": "top" } ],
  "inertia_kgm2": { "crank": …, "cassette_freehub": … },
  "freehub_engagement_deg": 6.7,
  "wheel_rolling_radius_m": 0.37,
  "contact": [ { "body": "chainstay", "polyline_m": [[…], […]] } ]
}
```

Points enter the same way the linkage did: clicked on the side photo.
Additions to the photo tool: BB, B-knuckle, roller centres, and the
protector's top edge as a polyline. Masses, torques and teeth are typed.

## 5. Excitation: what drives a replay

All on recorded time:

- **Front-triangle motion**: IMU0 specific force (x, z) and pitch rate, moved
  from the pod to the BB by the rigid-body transfer (`α×r + ω×(ω×r)`, with
  α from the differentiated, filtered gyro). The low-pass cut-off is a
  parameter: chain slap needs content to ~100 Hz, while the physics
  estimator low-passes at 0.4× its grid rate because of 60–230 Hz pod-mount
  vibration (§10 Q4).
- **Rear travel `s(t)`**: `Physics rear travel (mm)` from the physics
  derived file, the estimator's best channel for fast hits.
- **Wheel speed**: GPS speed / rolling radius (§10 Q3).
- **Synthetic**: step, sine sweep, or a bump train at a speed, as a
  frequency response and a common input to compare setups.

## 6. Outputs and what replay can and can't answer

A run is derived output (D6): `sessions/<id>/derived/<hash>.parquet` with
`derived_kind` `"drivetrain"`, content-addressed by the input channel hashes,
the drivetrain + linkage sections, solver config and engine version, through
the existing `write_derived_parquet`. Its channels then chart in a notebook
next to measured ones, e.g. `Sim cage angle (deg)`, `Sim slack span tension
(N)`, `Sim top span tension (N)`, `Sim span deflection max (mm)`, `Sim stay
contact`, `Sim kickback (deg)`, `Sim ring lift-off (links)`. Node positions
for animation are a separate frames array (f32 `[frame][node][x,y]`), sent
as raw bytes and not stored.

**Replay answers drivetrain questions exactly where it's valid**: chain
forces are tiny next to suspension forces, so changing the chain, the clutch,
a roller or the chainring doesn't change how the bike moved. Running a
different drivetrain over a recorded lap is therefore honest.

**Replay cannot test a different suspension.** The recorded travel belongs
to the shock that was fitted. A theoretical shock or linkage needs the
dynamics layer (tyre, shock, rider loads) that the ml README lists as not
started. That's the full-bike sim, and its outputs would land in this same
derived-channel slot. So the storage shape here is the one that goal needs;
the physics to fill it for suspension is a later spec.

## 7. Simulate tab

- **Left**: the side photo with the linkage and drivetrain drawn over it, a
  travel slider and a gear picker. The slider redraws from a precomputed
  curve table, so the gesture never waits on IPC.
- **Kinematics**: `G(s)`, `θ_kick(s)`, `θ_cage(s)` and clearance vs travel,
  one line per gear.
- **Dynamics**: pick a session and lap (or a synthetic input) → Run (async,
  progress) → a timeline with the animated loop, contact markers on the
  protector and the result channels. Scrubbing reads the frames already in
  memory. "Open in notebook" for the channels.

## 8. Testing

- Path solver: concentric ring and cog → growth 0; a single-pivot case
  against a closed form; the cage closure holds loop length to < 1 µm.
- Dynamics, analytic cases: cage locked, no contact → first mode of a span
  within 2 % of `c/2L`; constant `f` → `δ = μfL²/8T`; no friction and no
  damping → energy conserved within tolerance; clutch below `τ_c` → no cage
  motion; wheel overrunning the cog → the cranks feel no growth until the
  cassette catches.
- 4-bar pose: the lifted function reproduces `fourbar()`'s existing GT Force
  golden.
- Round-trips: the drivetrain section through the bike file (merge,
  newer-wins); the derived file's channels.

## 9. Phases

| Phase | Scope | Done when |
|---|---|---|
| S0 | Drivetrain section; photo-tool points; chain path solver; `idl-rs sim kinematics`; Simulate tab kinematics view | GT Force growth/kickback curves agree with a hand calc or Linkage within 2 % |
| S1 | Full-loop dynamics with synthetic input; analytic tests | Frequency response per setup; a step gives the predicted slap |
| S2 | Replay from a session (IMU0 + physics travel + GPS); derived channels; animation | A Beacon lap replays, slap events chart in a notebook |
| S3 | Video validation (§11) and parameter fitting | Predicted and filmed span deflection and contact timing agree |
| Later | Full-bike dynamics → theoretical suspension | Separate spec |

## 10. Open questions for Isaac

1. **Cranks while coasting**: are feet on the pedals free to turn (crank DOF
   plus a foot/leg inertia and damping), or is the crank held by the rider
   (locked, which is the worst kickback)? Pedalling torque as an input later?
2. **Planar for v1?** Lateral chain whip and rear flex roll/yaw (which the
   estimator outputs) are left out until the planar model is validated.
3. **Wheel speed**: is GPS speed / rolling radius good enough, or is there a
   wheel-speed source?
4. **Excitation bandwidth**: is IMU0 mounted stiffly enough that 30–100 Hz
   content is frame motion, not pod-mount resonance? Its 60–230 Hz
   vibration is why the estimator low-passes.
5. **Rollers**: which body is each on? A top guide is usually on the front
   triangle (ISCG), but a lower roller can be on the chainstay. Is each a
   toothed pulley or a smooth roller?
6. **Point entry for S0**: add the drivetrain points to
   `ml/tools/linkage.html` now (fast, same export), and move the photo tool
   into the Simulate tab later? Or build placement into the tab from the
   start?
7. **Base branch**: this work needs `physics-estimator` (linkage, 4-bar,
   bike file). Branch from it before it merges to `main`, or wait for the
   merge?

## 11. Measurement list for 2026-11-20

| What | How | Why |
|---|---|---|
| Chain mass, links | Weigh it off the bike; count links | μ (node mass) |
| Chainring, cassette teeth | Read them | radii |
| Cage length, upper jockey offset | Calipers: cage pivot → each jockey centre | cage geometry |
| B-knuckle position | Mark it on the side photo | where the cage hangs |
| Spring torque vs cage angle | Chain off, clutch **off**. Hook a luggage scale on the lower jockey axle, pull at 90° to the cage, read force at 4–5 cage angles (phone inclinometer on the cage). Torque = force × cage length | `τ_s(θ)` |
| Clutch torque | Same with clutch **on**: pull forward (cage swings toward the front), then let it return slowly. Clutch ≈ (forward − return) / 2 | `τ_c` |
| Slack-span tension (cross-check) | Chain on, in a mid gear. Hang a known weight W at mid lower span, measure the extra sag δ and span length L: `T ≈ W·L / (4δ)` | checks spring + geometry model |
| Freehub engagement | Hub spec, or count clicks per turn of the cassette: 360° / POE | ratchet backlash |
| Cassette and cage mass | Weigh if they come off; otherwise catalogue | inertias (estimated from mass and size) |
| Protector top edge | Mark 4–6 points on the side photo | contact polyline |
| Chain-to-protector gap at sag | Feeler / ruler in 3 gears | checks the clearance output |
| Video (later) | Phone at 240 fps, mounted on the frame looking at the lower span: about 8–16 frames per slap cycle at 15–30 Hz | S3 |

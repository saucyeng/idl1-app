# DRAFT — Drivetrain simulation: chain growth and chain slap

Status: approved by Isaac 2026-11-19 (§10 Q5: "yes"); S0 and the synthetic-input
half of S1/S2 built the same day (§12). Adds a
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

Second round (2026-11-19):

- Cranks while coasting: **locked** (the rider holds them).
- **2-D.** The primary output is a **video-like playback** of the simulated
  bike in the Simulate tab (§7).
- Wheel speed from **GPS**.
- IMU0's 30–100 Hz content is real frame motion, so the excitation filter
  can stay open to ~100 Hz.
- Rollers: any body, chosen at runtime. Isaac's bike has one mounted on the
  chainstay (main) pivot, and he is considering adding an ISCG lower guide.
  He wants to know how much it helps in theory by taking up chain growth so
  the clutch doesn't slip (§2.5).
- Point placement is **built into the Simulate tab** now, not added to
  `ml/tools/linkage.html`.
- The work stays on idl-rs **`physics-estimator`**.

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
  - crank + chainring: **locked to the front triangle** while coasting
    (Isaac, 2026-11-19), so kickback shows up as a top-span tension and a
    pedal-force spike, not as a crank angle. The DOF stays in the model for
    pedalling later;
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
- **Planar** (Isaac, 2026-11-19).
- **Step**: fixed at 0.05–0.1 ms (transverse waves at ≤ 20 m/s across a
  12.7 mm link need < 0.6 ms). 126 nodes × 10–20 k steps/s is cheap: a
  60 s lap should run in seconds on one core.

Not modelled: tooth profile, link side-plates, lateral bending, the rider's
reaction to kickback.

### 2.5 What a lower guide can and can't do (Isaac's ISCG question)

A fixed roller doesn't absorb chain: it only reroutes it. Total loop length
is fixed, so whatever the path loses or gains through travel, the cage has
to make up. A guide changes two things:

1. **The loop's length change through travel**, `ΔL_loop(s)`. The cage
   turns by about `ΔL_loop / (2·cage length)` (the lower loop doubles back
   over both jockeys). The guide helps only if routing the slack span over
   it makes the lower path's change offset the top span's growth `G(s)`.
   How much depends on where the guide sits relative to the main pivot,
   Horst pivot and the B-knuckle, which is exactly what the kinematic
   solver answers.
2. **The free span length** `L`. Slap deflection goes as `L²`, so a guide
   near the ring that cuts `L` from 0.40 m to 0.25 m cuts deflection about
   2.5×, whatever it does to growth.

The clutch slips when the chain's torque on the cage, `T·(cage lever)`,
beats `τ_c`. On a fast compression, the cage has to turn at
`dθ_cage/dt ≈ (dΔL_loop/ds)·(ds/dt) / (2·cage length)`. If it can't follow
without slipping, the top-span tension spikes instead, and with locked
cranks that spike is the kickback the rider feels. So the A/B the sim should
report for "with vs without the ISCG lower":

- `ΔL_loop(s)` and cage swing through travel (kinematic, per gear);
- clutch slip, total degrees and number of events per lap (replay);
- peak top-span tension / pedal force on hits (replay);
- slap: peak span deflection, number of protector contacts and impact speed
  (replay).

The tab gets an **A/B mode**: two drivetrain variants on the same replay,
played side by side, with these numbers as a table.

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
  "rollers": [ { "body": "chainstay", "centre_m": […], "teeth": 14, "span": "top" },
               { "body": "front_triangle", "centre_m": […], "teeth": 0, "radius_m": 0.02, "span": "lower" } ],
                                                // body: front_triangle | chainstay | seatstay;
                                                // teeth 0 = smooth roller (radius_m)
  "variants": { "iscg_lower": { "rollers": […] } },   // §2.5 A/B: named overrides
  "inertia_kgm2": { "crank": …, "cassette_freehub": … },
  "freehub_engagement_deg": 6.7,
  "wheel_rolling_radius_m": 0.37,
  "contact": [ { "body": "chainstay", "polyline_m": [[…], […]] } ]
}
```

Points are clicked on the side photo **in the Simulate tab** (Isaac,
2026-11-19): the linkage points the photo tool takes today, plus BB,
B-knuckle, roller centres, and the protector's top edge as a polyline.
Masses, torques and teeth are typed. The tab writes both `linkage` and
`drivetrain`, so it takes over from `ml/tools/linkage.html` (§10 Q3).

## 5. Excitation: what drives a replay

All on recorded time:

- **Front-triangle motion**: IMU0 specific force (x, z) and pitch rate, moved
  from the pod to the BB by the rigid-body transfer (`α×r + ω×(ω×r)`, with
  α from the differentiated, filtered gyro). The low-pass cut-off is a
  parameter, defaulting to 100 Hz. Isaac confirms IMU0's content up to there
  is real frame motion. (The physics estimator low-passes harder, at 0.4×
  its grid rate, for its own reasons.)
- **Rear travel `s(t)`**: `Physics rear travel (mm)` from the physics
  derived file, the estimator's best channel for fast hits.
- **Wheel speed**: GPS speed / rolling radius (Isaac, 2026-11-19).
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

The **primary output is playback**: the simulated bike, side-on, moving
like a video (Isaac, 2026-11-19).

- **Stage** (most of the tab): the side photo with the linkage and the
  whole chain loop drawn over it as vectors. In playback, the 4-bar moves
  with recorded travel, the chain is drawn from the frames array, contacts
  flash on the protector, and the cage and clutch-slip state are shown.
  Transport controls: play/pause, speed (1×, ¼×, 1/16× slow motion), frame
  step, scrub. Playback runs entirely from memory, so no IPC is ever awaited
  (CLAUDE.md §2). A **view toggle** fixes the camera to the front triangle
  (the default: slap is clearest there) or lets the frame move with IMU0's
  motion, exaggerated.
- **Timeline** under the stage: rear travel plus the result channels
  (tension, deflection, contacts, clutch slip), cursor locked to the
  playhead. Pick a session and lap, or a synthetic input. Run is async with
  progress.
- **A/B** (§2.5): two variants side by side on one timeline, with a summary
  table.
- **Setup mode**: place points on the photo, type masses and torques, and a
  travel slider plus gear picker that redraws from a precomputed curve
  table. The kinematic curves (`G(s)`, cage angle, `ΔL_loop(s)`, clearance,
  per gear) are drawn beside it.
- If the session has a linked ride video, it can play beside the sim, synced
  on session time (§10 Q4).
- "Open in notebook" for the result channels.

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
| S0 | Drivetrain section; Simulate tab with setup mode (photo, point placement, kinematic curves); chain path solver; `idl-rs sim kinematics` | GT Force growth/cage curves agree with a hand calc within 2 %; with vs without ISCG lower `ΔL_loop(s)` compared |
| S1 | Full-loop dynamics with synthetic input; analytic tests; playback stage | A step plays back with the predicted slap; frequency response per setup |
| S2 | Replay from a session (IMU0 + physics travel + GPS); derived channels; A/B | A Beacon lap plays back for both variants with the §2.5 table |
| S3 | Video validation (§11) and parameter fitting | Predicted and filmed span deflection and contact timing agree |
| Later | Full-bike dynamics → theoretical suspension | Separate spec |

## 10. Open questions for Isaac

Answered 2026-11-19: crank locked; 2-D; GPS wheel speed; IMU0 good to
100 Hz; rollers on any body at runtime; placement in the tab; idl-rs work
on `physics-estimator`.

Third round (2026-11-19):

1. The pivot roller guides the **top** span, toothed (about 16T, to be
   checked), concentric with the main pivot.
2. Work goes on this session's idl-rs branch built on `physics-estimator`
   (`claude/chain-derailleur-physics-4a23f3`), for Isaac to merge.
3. The photo lives beside the bike file: `bikes/<bike_id>.photo.<ext>`,
   named with its frame in `drivetrain.photo`.
4. Ride video beside the sim: later. The sim plays on its own for now.
5. Approved; S0 starts.

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

## 12. What was built (2026-11-19)

- **Engine** (`rust/core/src/sim/`): `bike` (the 4-bar and drivetrain
  placed at a travel, gear and cage angle; the parallelogram moves the cage
  along the axle-to-upper-jockey line by the change in cog radius, keeping
  the drawn B-gap), `path` (§2.2 tangents and wraps, unilateral rollers,
  cage closure, `chain_fit`), `kinematics` (per-gear curves, snapshots),
  `excite` (bump trains), `dynamics` (§2.4, XPBD at 25 µs, 2 passes; link
  axial stiffness 1e7 N/m; surfaces only stop links that were on their
  side; impact speed relative to the moving surface). Wrapped chain length
  uses teeth × pitch / 2π per radian, the pin line the pitch radius.
- **Bike file**: `calibration::drivetrain::Drivetrain` beside `linkage`,
  newer wins; the 4-bar pose is public in `calibration::linkage` and
  `estimate::physics::fourbar` uses it (its golden test holds).
- **App**: C3 §3.15; the Simulate tab (setup on the photo or a blank canvas
  for a bike with a linkage but no photo, kinematics, playback down to
  1/64×, A/B totals of the last four runs).
- **Not built yet**: replay of a recorded ride (§5), the CLI verbs (§3), a
  wire golden for `IDLS`, Isaac's measured numbers (§11). The defaults are
  placeholders: the typical derailleur geometry needs a 17 cm cage to fit a
  10–52 cassette on the GT Force linkage, so the drawn points, not the
  defaults, are what to trust.

## 13. Contact model, revised (2026-11-19, Isaac's review of the first clip)

Isaac saw the chain carried round every wheel past the tangent: "it looks
like the chain stays fixed to the pulleys". Root cause: the first contact
model pinned a link that touched a toothed wheel to a fixed angle on it, and
decided by distance tolerances where links joined and left. Lifting off
means pivoting about the seated link behind, which changes that angle, so
the lock made it impossible. Three rule-based patches (a lock only while
pressed in, sloped frictionless flanks, a geometric lift rule) each failed:
the flanks let a slack chain climb off the ring and diverge.

Decided with Isaac: force-based contact, **wheels as circles** at the pitch
radius (no tooth profiles), because a little over- and under-wrap in motion
is expected and should come out of the dynamics.

- **Normal**: a stiff, damped penalty force (2e5 N/m, 20 N·s/m) pushing a
  link's pin out of a wheel it presses into.
- **Teeth as grip**: elastic stick-slip friction anchored where the link
  touched down, capped at `tooth_grip` × the normal force (default 1.5; by
  the capstan relation a wrap θ holds a tension ratio e^(μθ), about 110 over
  180°). Smooth rollers have none.
- **Reactions** turn the wheel, and a jockey's axle carries them to the cage.
- **Stays** use the same penalty contact with rubber friction (μ 0.5), felt
  only by links within 6 mm on the surface's side.
- Links, the ratchet and the clutch are unchanged.

Proof: a bench with no gravity or bumps, the cranks driven (new
`crank_rate_rad_s`, the start of pedalling) and the hub overrunning, checks
every frame that each wheel holds the exact tangent path's links within one.
The old model fails it (its cage is driven to an impossible angle); the new
one passes. Known remainder: a slack top span lying on the protector bunches
into link-scale kinks; the chain's own pin-joint friction is not modelled.

## 14. Idlers, speed, and reading the results (2026-11-19, Isaac's review)

- **The chain runs over Isaac's idler**, not under it: on the main pivot it
  sits above the cog-to-chainring line, high-pivot style. Rollers now say
  whether the chain is **threaded** round them (an idler: always in the
  path, in order along its span, at every travel) or they are **guides**
  (an ISCG roller, a chain guide: only where the chain reaches them). New
  top rollers default to threaded, chain over. Treating every roller as a
  guide had left an idler 2 mm clear of the straight line out of the path at
  top-out and in it a few millimetres later, a 60 mm step in "growth".
  Threaded on the GT Force's main pivot, growth is 0–1 mm over 160 mm of
  travel (about 25 mm without it), which is why idlers go on the pivot.
- **Speed**: Isaac: about 1:1 ride time to compute is too slow. Measured in
  release: 2.4× real time at a 25 µs step. The step was the lever: the
  contact springs are stable to about 200 µs, the spans' waves need under
  about 800 µs, and the tangent bench holds to 100 µs and fails at 200 µs.
  Default now 50 µs: about 5.5× real time (a 2-minute lap in about 22 s; a
  bump train in well under a second). Per-step work is spread through the
  loop (no hotspot in a profile), so more speed needs an implicit
  integrator, not micro-optimisation or a GPU. Many runs (setups, A/Bs)
  parallelise across cores.
- **Peaks are chaotic.** A slack, flailing chain is sensitive to tiny
  changes: peak deflection and clutch slip move by tens of percent between
  25 and 50 µs steps, and even with a change in rounding. Compare setups by
  statistics over several hits or runs, not by one run's peak.

## 15. Teeth hold without slip (2026-11-19, Isaac's review)

Isaac: the chain slid round the held cranks; a finite friction coefficient
was a complication that made it worse. Right: §13's grip was capped at
`tooth_grip` × the normal force, and a slack chain barely presses on the
chainring, so the cap went to nothing and links crept round it (73° in a
bump train). A roller in a tooth gap cannot move round the sprocket however
lightly it presses. `tooth_grip` is gone: a link pressing into a sprocket is
held where it touched down with no slip, and is free the moment it stops
pressing in. The tangent bench still passes.

A held link can still end up somewhere else on the ring if the chain is
thrown clear of the teeth and lands again, which the default bump train does
to the top of the wrap (lifts of 6–25 mm, landing about 1.5 teeth along) on
the placeholder bike with no guide. That is a dropped or nearly dropped
chain, not sliding. The test therefore allows a move round the ring only
after a lift of more than a tooth's height (4 mm); the capped grip fails it,
the no-slip hold passes. A "chain lift off the chainring" output would show
this risk directly (not built).


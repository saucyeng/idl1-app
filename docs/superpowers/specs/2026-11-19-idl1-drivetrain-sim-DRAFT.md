# DRAFT — Drivetrain simulation: chain growth and chain slap

Status: proposal for Isaac, 2026-11-19. Spec-first. Nothing is built until
Isaac answers §10. Adds a module to idl-rs core, a file type to the data
directory (C4) and a top-level **Simulate** tab after Notebook.

Long-term frame: a full-bike simulator ("how does this theoretical setup
ride a known track"). This draft covers the first part, the drivetrain,
and is meant to set the bike model and replay plumbing that later parts reuse.

## 1. What Isaac asked for

- A chain and derailleur physics simulator: how the chain slaps over bumps,
  and chain growth through travel (Isaac, 2026-11-19).
- It builds on the rear-suspension import tool (points dropped on a side
  photo of the frame).
- It lives in idl1-app in a **Simulate** tab after workbooks.

## 2. The physics in one page

Two separate problems with different maths. Both are worth having, and the
first is a prerequisite of the second.

### 2.1 Kinematic (quasi-static): chain growth

Pure geometry, in the frame's side plane. Inputs: BB, rear axle path
`P_axle(s)` over travel `s`, chainring radius `r_ring`, cog radius `r_cog`
for the gear, derailleur pivot (B-knuckle) and cage geometry, any idler or
upper guide. The chain path is a closed loop of tangent segments and wrap
arcs. At each `s`:

- **Top (drive) span** = outer tangent ring → cog (or ring → idler → cog).
  Its length change through travel is the **chain growth** `G(s)`, in mm.
- **Lower (slack) span** goes ring → lower jockey → upper jockey → cog. The
  derailleur cage rotates to keep the total loop length constant: solve
  cage angle `θ_cage(s)` so that `L_loop(s, θ_cage) = L_chain`.
- **Pedal kickback** (wheel held fixed to the axle-carrying link, Linkage-
  style convention): `θ_kick(s) = (G(s) + r_cog · Δφ_link(s)) / r_ring`,
  where `Δφ_link` is that link's rotation relative to the front triangle.
  The real kickback is speed-dependent: when the wheel spins faster than the
  cog, the freehub is disengaged and absorbs growth until it catches up, so
  kickback is gated by speed and the freehub's engagement angle. This is a
  dynamic output (§2.2), not a geometric one.
- **Chain force line**: the top span's line of action. With the instant
  centre and a centre of mass this gives anti-squat. Anti-squat is in scope
  only if the suspension tool already gives the IC (§10 Q2).

Per gear, these are curves vs travel: `G(s)`, `θ_cage(s)`, `θ_kick(s)`,
lower-span length and its clearance to the chainstay.

### 2.2 Dynamic: chain slap

In the frame's (accelerating) reference, a vertical chassis acceleration `a`
loads the slack span as a distributed force `μ·a` (μ = chain mass per
length). For a taut string of length `L` under tension `T`:

```
static deflection  δ = μ·a·L² / (8·T)        dynamic peak ≈ 2δ for a sharp hit
wave speed         c = √(T/μ)                 first mode  f₁ = c / (2L)
```

Back-of-envelope with a 126-link 12-speed chain (μ ≈ 0.17 kg/m):

| T (N) | L (m) | f₁ (Hz) | δ at 10 g | δ at 20 g |
|---|---|---|---|---|
| 15 | 0.40 | 12 | 22 mm | 44 mm |
| 25 | 0.40 | 15 | 13 mm | 26 mm |
| 25 | 0.25 | 24 | 5 mm | 10 mm |
| 40 | 0.40 | 19 | 8 mm | 17 mm |

What this tells us before writing any code:

- Slap amplitude ∝ `μ·a·L²/T`. Span length is squared, which is why a
  chain guide or a high-pivot idler (shorter `L`) works better than more
  clutch. Clutch tension enters linearly.
- `f₁` sits at 12–30 Hz, inside the band a rock garden puts in (5–10 m/s
  over bumps spaced 0.3–0.6 m). Slap is a **resonance** problem, not only a
  peak-g problem, so a time-domain sim driven by real bump spectra earns its
  keep over the static formula.
- `T` is not constant. It is set by the derailleur spring torque on the cage
  arm, plus clutch friction, which is **Coulomb**: below the breakaway torque
  the cage is locked and the span is a string with both ends fixed; above it
  the cage swings and the span goes slack. That stick-slip is the
  non-linearity worth simulating, and it is why tensions are given as ranges
  above: they need measuring (§10 Q5).
- Through travel, the chain growth from §2.1 changes the span length and the
  cage angle, so `L`, `T` and the clearance to the chainstay all depend on
  `s(t)`. The kinematic solver feeds the dynamic one at each step.

### 2.3 Proposed dynamic model

Reduced-order, chosen to resolve slap without solving full chain-sprocket
contact:

- **Slack span** = N lumped masses (N ≈ 20–30), joined by stiff axial links
  enforced as distance constraints (inextensible chain), with no bending
  stiffness (a roller chain has none until it locks laterally, which is
  ignored). The end points are the tangent points on the ring and the lower
  jockey, moving with the kinematics.
- **Derailleur cage** = 1 rotational DOF: inertia `J_cage`, spring torque
  `τ_s(θ)`, clutch friction `±τ_c` (stick-slip), viscous damping `c_cage`.
  Coupled to the span through the chain tension at the jockey.
- **Top span**: under pedalling it is taut and treated as kinematic. When
  coasting, the same lumped model as the slack span (§10 Q4).
- **Chainstay** = polyline in the axle-link frame. Contact is a penalty
  spring-damper. Outputs: contact events, impact speed, impulse, position
  along the stay.
- **Excitation** is prescribed, never simulated: front-triangle motion and
  rear travel come in as time series (§5).
- **Integrator**: fixed step, semi-implicit Euler with constraint projection
  (position-based). CFL with node spacing ~15 mm and `c` ≤ 20 m/s gives
  `dt` < 0.75 ms. Use 0.1 ms; this is cheap at N ≈ 30.

Rejected for v1: a full multibody chain (every link, sprocket tooth
engagement). It is closer to reality but 100× the cost and needs data we
won't have. The reduced model is the right first step if its predictions
can be checked against measurement (§10 Q6).

## 3. Layers (CLAUDE.md §2 decision rule)

Physics of the bike → `core`. Would a CLI user with no app want it? Yes:
`idl-rs sim drivetrain --bike … --session … --lap 3` producing a results
file is useful on its own. So:

```
rust/core/src/sim/              idl-rs   NEW. Pure. std only.
    geometry.rs     planar linkage solve → axle path, IC, link angles (if the
                    import tool doesn't already provide them, §10 Q1)
    chain_path.rs   §2.1 tangent/wrap solver, cage-angle closure, growth, kickback
    chain_dyn.rs    §2.3 lumped span + cage + contact, fixed-step integrator
    excite.rs       §5 excitation from a session or a synthetic profile
    bike_model.rs   the bike model file (§4) read/write, atomic
rust/cli/                       `idl-rs sim …` subcommands
crates/idl1-bridge/             #[tauri::command(async)] run_sim, Channel progress;
                                frames out as raw bytes (tauri::ipc::Response)
app/src/routes/pages/Simulate/  UI: geometry view, curves, animation (JS = pictures)
```

`core::estimate::geometry::AxlePath` already carries a sampled rear axle
path, and its doc comment says the linkage solver "is an authoring-time
concern and is deferred". `sim/geometry.rs` would be that solver, and the
estimator could consume its output. That reuse is a decision for Isaac
(§10 Q1).

## 4. The bike model file

A simulated bike is a file, like a workbook. It is synced as a source (D6)
and readable by the CLI. Proposed `<data>/bikes/<bike_id>.model.json` or a
new `<data>/models/` directory (§10 Q8). Contents, all lengths in mm in the
frame side plane, origin at BB, +x forward, +y up:

- `frame`: points from the import tool (BB, pivots, link points, shock
  eyes, rear axle at topout), link topology, shock stroke.
- `drivetrain`: chainring teeth, cassette teeth list, chain links, chain
  mass (g), derailleur geometry (B-knuckle position on the hanger, cage
  length, jockey teeth and positions), spring torque curve (N·m vs θ),
  clutch friction torque (N·m), cage inertia (kg·m²), optional idler and
  guide positions, freehub engagement angle (°).
- `chainstay`: clearance polyline in the axle-link frame.
- `source`: the photo blob hash and pixel→mm scale, so the points stay
  traceable to the image (blobs are immutable, D3).

## 5. Excitation: what drives the dynamic sim

Two sources, in order of value:

1. **Replay a recorded ride.** Front-triangle linear acceleration and
   angular rate from IMU0 (chassis frame), rear travel `s(t)` from the
   estimator's materialised output, all on recorded time (principle: time
   is recorded, not assumed). Each sample is interpolated onto the sim's
   fixed step. This answers "what did my chain do on lap 3 at Windrock",
   and a different drivetrain model can be run on the same ride.
2. **Synthetic**: a step, a sine sweep, or a bump train at a speed. Used for
   frequency response and comparing setups on a common input.

Replaying a recorded ride with a *different* suspension setup does not hold
up: the measured travel belongs to the bike that was ridden. Doing that
properly needs the full-bike simulator (tyre, suspension, rider), so it is
out of scope here. It is the place the long-term goal starts.

## 6. Outputs and storage

A sim run is a deterministic function of `(bike model, excitation, solver
config, engine version)`. Under D6 it is a **derived output**,
content-addressed by those inputs. Proposed: results are written as a
Parquet file of channels on its own `t` axis (`chain_cage_angle`,
`chain_tension_slack`, `chain_span_max_deflection`, `chain_stay_contact`,
`chain_kickback`, …). When the excitation was a session, the file sits next
to that session's derived files, so **notebook cells can chart sim channels
beside measured ones** with no new cell API. Node positions for animation
are a separate frames array (f32, `[frame][node][x,y]`) sent to the UI as
raw bytes.

Kinematic curves (§2.1) are cheap (milliseconds), so they are computed on
demand and never stored.

## 7. Simulate tab (UI sketch)

- **Left**: the frame photo with the imported points, drivetrain drawn on
  top, a travel slider and a gear picker. Moving the slider redraws the chain
  path from a precomputed curve table, so the gesture makes no IPC call
  (CLAUDE.md §2).
- **Right, Kinematics**: `G(s)`, `θ_kick(s)`, `θ_cage(s)`, plus chainstay
  clearance vs travel, one line per gear.
- **Right, Dynamics**: pick a session and lap (or a synthetic input), Run
  (async, progress over a Channel), then a timeline with the animated chain,
  contact markers on the stay, and the result channels. Scrubbing reads the
  frames array already in memory.
- An "Open in notebook" action for the result channels.

## 8. Testing (what we own)

- Path solver: two concentric sprockets give a growth of 0. A single pivot
  at the top-span tangent line gives near-zero growth (closed form). The
  cage closure holds the loop length to < 1 µm over the travel range.
- Dynamics: with the cage locked and no contact, the span's first mode
  matches `f₁ = c/2L` within 2 %. A constant `a` settles to `δ = μaL²/8T`.
  With no damping or friction, energy is conserved within tolerance.
  Clutch stick-slip: no cage motion below `τ_c`.
- Round-trips: bike model file write → read; sim results Parquet.
- Excitation: resampling a recorded channel preserves its timestamps' order
  and ends.

## 9. Phases

| Phase | Scope | Done when |
|---|---|---|
| S0 | Bike model file; geometry from the import tool; chain path solver; Simulate tab kinematics view | Growth/kickback curves for Isaac's bike match Linkage (or a hand calc) within 2 % |
| S1 | Dynamic slack span + cage + chainstay contact, synthetic excitation; CLI `idl-rs sim` | Analytic tests pass; frequency response plot per setup |
| S2 | Replay from a recorded session; results as derived channels; animation | Lap replay on a real ride, slap events chartable in a notebook |
| S3 | Validation against measurement (§10 Q6) and parameter fitting | Predicted vs measured cage angle / contact timing agree |
| Later | Full-bike sim (tyre, suspension, rider) on a known track | Separate spec |

## 10. Questions for Isaac

Blocking S0:

1. **Where is the suspension import tool?** It isn't in idl1-app or idl-rs
   on `main` or this branch. Which repo/branch, and what does it output:
   which points, in what units/frame, and does it already solve the linkage
   (axle path, IC, link angles) or only store points?
2. **"Chain line growth"**: do you mean chain *length* growth through
   travel (§2.1), the *lateral* chainline per gear (plan view, chain
   angle), or both? Anti-squat in S0 or later?
3. **Bike scope**: 1× only? Idler / high-pivot bikes and upper chain guides
   in v1, or later? (Each adds a node to the path topology.)

Blocking S1:

4. **Top span when coasting**: model it dynamically too (it can slap on
   the top of the stay), or treat it as taut always?
5. **Derailleur numbers**: do you have, or can you measure, spring torque
   vs cage angle, clutch breakaway torque, cage inertia? Otherwise I'd start
   from catalogue estimates per model (SRAM Eagle/Transmission, Shimano)
   marked as estimates.
6. **Validation**: is there a way to measure slap? E.g. high-speed video,
   or an IMU (or a piezo) on the cage or the chainstay protector? A sim we
   can't check against anything isn't worth much, and S3 depends on it.

Placement and product:

7. **Layer**: confirm the sim lives in idl-rs core (`core/src/sim/`), with
   the CLI subcommand. If it should stay app-only for now, it would go in
   `idl1-bridge`.
8. **Bike model file**: extend `bikes/<bike_id>.json` (bike log) with a
   `model` section, or a separate file? A sheet's setup (shock psi etc.)
   and a geometry model change at different rates, so I lean separate,
   linked by `bike_id`.
9. **Simulate tab**: Device · Data · Notebook · **Simulate** · Settings,
   with Ctrl+4 → Simulate and Settings moving to Ctrl+5. OK?
10. **Results as derived session channels** (§6): OK to put sim channels
    next to a session so notebooks can chart them, or keep sim results
    separate from ride data?

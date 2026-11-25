# Kinematic-chain suspension and steering estimator (DRAFT)

Status: **spec-first draft**, written 2026-09-15, revised the same day on
Isaac's answers (§9). No code yet. Numbered equations are cited by the code
that implements them. "The calibration spec" is
`2026-09-10-idl1-rigid-body-calibration.md`; its bars-free amendment is
`2026-09-15-idl1-calibration-bars-free-DRAFT.md`. C1, C2, C3, C6 are the
contracts of those names.

## 0. What this replaces, and why

The shipped estimator (`rust/core/src/estimate/`) is a 24-DOF error-state IEKF
plus a 2-state RTS pass per wheel. Its three internal degrees of freedom are
handled today as:

| DOF | Today | Consequence |
|---|---|---|
| Front travel `d` | Double integrator driven by the *differential specific force* along the fork axis (IMU1 − IMU0 with lever-arm transport); anchored by airborne top-out, stationary zero-velocity, a `[0, max]` barrier | The unsprung accelerometer is a **control input**, not a measurement: its noise is integrated, and the steer-induced lever-arm term at the offset IMU1 is transported at a fixed `psi = 0`, so bar motion leaks into travel |
| Rear travel `s` | Same, along the authored axle-path tangent | IMU2's gyro is unused |
| Steer `psi` | Frozen (`estimate_steering: false`) | No steering output |

Geometry is `BikeGeometry::reference_bike()`: mounts baked from a June 2026
capture, lever arms "approximate", chosen per build, not per session. The
M6.3 calibration record (`calibration.*`) is produced by the CLI and consumed
by nothing.

This spec makes the two unsprung IMUs **measurements** of a three-body
kinematic chain whose joint coordinates are exactly the three DOFs, takes the
chain's extrinsics from the calibration record, unfreezes steering, smooths
the whole state offline, and materialises the result once per (inputs, config, engine) into the C1 §5
derived store. Compatibility with the existing state ordering, factor set or
`store_math` cache is **not** a goal (Isaac, 2026-09-15); the model traits
(`ErrorState` / `ProcessModel` / `MeasurementModel`) and the right-perturbation
convention are kept because they are what makes filter and smoother share
one set of factors.

**The deliverable is wheel velocity and its spectrum.** Travel position is a
bounded, top-out-anchored state needed to keep the filter honest, not an
output anyone reads to the millimetre. Every design choice below is judged
against the 0.5–30 Hz velocity band first.

## 1. Model

**1.1 Bodies and joints.** ISO 8855 chassis frame, X forward, Y left, Z up;
`IMU0` defines it up to the calibration spec's §1.2a gauge and the authored
yaw about gravity.

| Body | Sensor | Joint to chassis | Coordinates |
|---|---|---|---|
| C, chassis (sprung) | `IMU0` | — | attitude `R`, nav-frame velocity `v` |
| F, fork lowers + steerer + bars | `IMU1`, on the front brake post | steering hinge about unit axis `s` through point `h`, then telescopic travel along `s` | `psi` rad, `d` m |
| S, rear unsprung member carrying the brake post | `IMU2`, on the rear brake post | rear linkage: axle path `p(s_r)`, link rotation `Θ(s_r)` about chassis Y | `s_r` m |

Both unsprung IMUs sit on the brake posts, a few centimetres from the axle
(Isaac, 2026-09-15). For the front this fixes the offset across the steer
axis that makes `IMU1` move longitudinally with steer; for the rear it means
`IMU2` rides on whichever member carries the rear caliper. The bike is a
**GT Force, a four-bar** (Isaac, 2026-09-15): the caliper is on the seatstay,
whose rotation over the travel is almost small enough to ignore. Rear travel
is therefore accel-based like the front, and (8) contributes only what the
seatstay's `θ′(s_r)` allows, which on this bike is close to nothing. The
factor stays in the model regardless, because the same sensors also go on
Isaac's **motocross bike, a single-pivot swingarm in pure rotation**, where
`θ′` is large and (8) becomes the strong rear observation. Geometry is per
session (setup sheet), so one estimator serves both bikes; the schema
activates (8) and `b_g2` from the authored `θ′`, never from a bike name.

For a pure-rotation swingarm of length `ℓ` pivoting at `q` in the chassis
frame, the linkage curve is closed-form and the sheet needs only `q` and `ℓ`:
`p(s_r)` is the arc about `q`, `θ(s_r)` the swingarm angle, `θ′ = 1/ℓ`
(rad/m) at the axle. For a four-bar the sheet carries sampled points.

What the rear needs from the linkage on any bike is the axle path `p(s_r)`,
because it sets the direction the transported acceleration is projected
along. **GT Force authored path** (Isaac, 2026-09-15): a three-point circular
arc, ends vertically 160 mm apart, 10 mm of rearward bulge at mid-travel.
In the chassis frame with top-out at the origin and X forward that is centre
`(+315, 0, +80)` mm, radius 325 mm, so

    p(s_r) = ( 315 − √(325² − (z − 80)²),  0,  z ) mm,  z ∈ [0, 160]

with `s_r` the arc length from top-out (within 0.3 % of `z` here). The
tangent leans 14.3° rearward at top-out, is vertical at mid-travel and leans
14.3° forward at bottom-out; `θ(s_r)` for the seatstay is authored `≡ 0`
until a Linkage export says otherwise. This replaces the five-point table in
`reference_bike()`.

The fork axis is parallel to the steer axis, so travel is a translation along
`s` whatever the bar angle; only the hinge moves the sensor across the axis.

**1.2 Sensor poses in the chassis frame.** With `C(psi) = exp([s]ₓ psi)`
(calibration spec (1), F→C at the datum `C₀ ≡ I`) and `L₁` the position of
`IMU1` at `psi = 0, d = 0` (the cross-body lever, calibration spec §7.3,
authored from head angle, reach, axle-to-crown and the brake-post offset):

    p₁(psi, d)  = h + C(psi) (L₁ − h) + d s                                  (1)
    ṗ₁          = psi̇ [s]ₓ C(psi)(L₁ − h) + ḋ s                             (2)
    p̈₁          = psï [s]ₓ C(L₁ − h) + psi̇² [s]ₓ² C(L₁ − h) + d̈ s          (3)

`h` is any point on the axis; (1) is invariant to sliding it along `s`. For
the rear, with `r₂` the lever from the rear axle to `IMU2` in the link frame
at top-out (`L₂ − p(0)`, `L₂` from the calibration record):

    p₂(s_r)     = p(s_r) + Θ(s_r) r₂                                         (4)
    ṗ₂          = ṡ_r [ p′(s_r) + θ′(s_r) [ŷ]ₓ Θ(s_r) r₂ ]                    (5)
    p̈₂          = s̈_r [ … same bracket … ] + ṡ_r² [ p″ + θ″[ŷ]ₓΘr₂ + θ′²[ŷ]ₓ²Θr₂ ]

`θ(s_r)` is **authored** from the linkage curve; absent ⇒ `θ ≡ 0`, (8) carries
no travel information, and the ledger says `s_r` is accel-only.

**1.3 Measurement equations.** `ω` is the chassis rate (`IMU0`, bias-
corrected), `α = ω̇` (§2.4). `f₀` is the `IMU0` specific force after mount and
bias. Sensor `i` with mount `R_i` (sensor→body, calibration record):

    ω₁ˢ = R₁ᵀ C(psi)ᵀ ( ω + psi̇ s )                         + b_g1            (6)
    a₁ˢ = R₁ᵀ C(psi)ᵀ [ f₀ + α×p₁ + ω×(ω×p₁) + 2 ω×ṗ₁ + p̈₁ ] + β₀₁           (7)
    ω₂ˢ = R₂ᵀ Θ(s_r)ᵀ ( ω + θ′(s_r) ṡ_r ŷ )                  + b_g2            (8)
    a₂ˢ = R₂ᵀ Θ(s_r)ᵀ [ f₀ + α×p₂ + ω×(ω×p₂) + 2 ω×ṗ₂ + p̈₂ ] + β₀₂           (9)

(7) and (9) are the rigid-body transport of the calibration spec's (3) plus
the Coriolis and relative-acceleration terms a moving joint adds. `f₀` is the
*measured* `IMU0` specific force, so chassis acceleration and gravity are
common-mode and cancel in the residual; nothing needs a nav-frame
acceleration. `β₀ᵢ` is the calibrated accel-bias difference, a known
constant, not a state (calibration spec §8.3).

**1.4 Chassis velocity.** GPS velocity fused with the `IMU0` strapdown, as
today: the GPS velocity solution is far better than its position, and with
ZUPT on stationary windows it pins `v` well enough for accel-compensated
leveling and for the `ω × v`-free nav-frame propagation. The wheel-speed
pulse channels (`IDL0_SPEC.md` §3.5) are **not in the model**: the surface is
loose so a rim speed is not a chassis speed, and the sensors are still being
debugged (Isaac, 2026-09-15). When they are trusted they enter as one more
soft factor on `v`, with no state change; a `// TODO(idl0):` marks the spot.

**Observability, stated honestly.**

- `psi̇`: strong, (6).
- `psi`: observable absolutely through (7), because `s` is ~26° off vertical
  so rotating about it moves the specific-force direction in the F frame by
  ≈ `0.45 psi`. Near `s ∥ f₀` it weakens; the ledger reports it per window.
- `d`, `s_r`: accel-based. Position DC comes from top-out (airborne), the
  `[0, max]` barrier, stationary windows, and the §2.7 full-travel datum.
  The gain over today is that steer terms in (3) are predicted and removed,
  accelerometer noise is a bounded measurement noise rather than an
  integrated control noise, and the smoother spreads every anchor backward.
- `ḋ`, `ṡ_r` (the deliverable): the integral of a measured acceleration with
  a calibrated constant bias, anchored at zero on every stationary sample and
  reset at top-out; drift between anchors is the accel VRW over the interval,
  ≈ `0.05·√T` m/s, i.e. 10 mm/s over 4 s. That is the velocity-band floor and
  it is well below the signal.

## 2. State and estimation

**2.1 State, designed fresh for the velocity deliverable.** 27 error-state
DOF, ordered by how strongly each block is observed, so a hardtail or a
`θ ≡ 0` rear simply drops trailing blocks:

    [ δθ(3), δv(3), δb_g0(3), δb_a0(3),
      δpsi, δpsi̇, δpsï,
      δd, δḋ, δd̈,
      δs_r, δṡ_r, δs̈_r,
      δb_g1(3), δb_g2(3) ]                                                   (10)

- `v` is the chassis velocity in the **nav frame**, as today: GPS reads it
  there directly and the propagation has no `ω × v` term.
- Each joint is a `[x, ẋ, ẍ]` triple. `ẍ` is a state so (7)/(9) can be
  measurements: they read `d̈`, `s̈_r`, `psï` directly. This is the
  constant-acceleration (Singer) model; its random-walk `q_acc` is set high
  (§2.3) so it never attenuates the 0.5–30 Hz band. The alternative,
  accelerometer-as-control with `[x, ẋ]`, cannot couple to `psi` and attitude
  consistently, which is what today's leak is.
- `b_g1` is kept: calibration gives a gyro bias at one temperature, and (6) is
  the only thing observing `psi̇`, so a drifted bias would bias steer rate.
  `b_g2` is active only when `θ′` is non-negligible (schema-gated on the
  authored curve), because with `θ ≡ 0` nothing observes it. On the GT Force
  it is expected to be inactive, and the state is then 24 DOF.
- No individual accel biases for `IMU1`/`IMU2` (unobservable; §1.3).

**2.2 Process.** Chassis attitude, velocity and `IMU0` biases by strapdown on
`IMU0` as today (`v̇ = R f₀ + g`). Each joint block:

    x ← x + ẋ dt + ½ ẍ dt²,   ẋ ← ẋ + ẍ dt,   ẍ ← ẍ + w,   w ~ N(0, q_acc dt)   (11)

**2.3 Tuning rule for `q_acc`.** The CA block is a second-order low-pass on
the measured acceleration with corner `f_c ≈ (q_acc / R_acc)^{1/4} / 2π` at
the operating point. The rule: `f_c ≥ 60 Hz` for both wheels so the joint
velocity spectrum is flat to 30 Hz; steer `f_c ≥ 20 Hz`. Defaults are derived
from the noise figures, not hand-picked, and a test checks the corner.

**2.4 Angular acceleration `α`.** A zero-phase smoothed central difference of
the bias-corrected `IMU0` gyro (calibration spec §2.3 rule), computed once
per run, not a state; its noise enters the `R` of (7)/(9) through `[α]ₓ p_i`.

**2.5 Measurement factors.** All `MeasurementModel`, all soft, all with
analytic Jacobians FD-checked at 1e-6:

| Factor | Residual | Dim | Noise | Gate |
|---|---|---|---|---|
| `FrontGyro` | `ω₁ˢ − (6)` | 3 | gyro ARW per sample | always |
| `FrontAccel` | `a₁ˢ − (7)` | 3 | accel VRW + `α` term | not airborne |
| `RearGyro` | `ω₂ˢ − (8)` | 3 | gyro ARW | full-sus and `θ′ ≠ 0` |
| `RearAccel` | `a₂ˢ − (9)` | 3 | accel VRW + `α` term | not airborne |
| `Zupt` / `Zaru` | `v`, `ẋ` of all joints, all gyro biases | | | stationary |
| `Gravity` | `IMU0` leveling, accel-compensated by `v̇` | 2 | | not airborne |
| `Gps` | `v − v_gps` | 3 | | speed-gated, latency-shifted |
| `Barrier` | `[0, max]` on `d`, `s_r` | 1 | | outside range |
| `Topout` | `d = 0`, `s_r = 0` | 1 | | airborne |
| `FullTravel` | §2.7 | 1 | | per-ride, optional |

The sag prior is deleted, not defaulted off: it pulls the state inside the
band the deliverable lives in, and top-out, the barrier, ZUPT and the §2.7
datum are the DC references this sensor set honestly has.

**2.6 Reserved.** (Wheel-speed gating lived here; removed with §1.4.)

**2.7 Full-travel datum.** Isaac rides test tracks that use all the travel.
`FullTravel` is an optional per-run factor: the maximum of the ride's
un-smoothed travel over each wheel is asserted to equal `0.95 · travel_max`
with σ = 5 % of travel, applied as a scale correction to the CA block's
integrated position at the sample of the maximum. **Default off.** It is
primarily a validation metric (§7.2); enabling it converts an assumption into
information and the ledger marks the run `full_travel_assumed`.

**2.8 Airborne.** Today's free-fall detector stays (IMU0 magnitude plus a
small differential) and its top-out anchor stays. While airborne the two
accelerometer factors are gated off.

**2.9 Steering datum and drift.** `psi = 0` is the calibration's bars-straight
datum (`C₀`). Integration drift of `psi` is bounded by the gravity term in
(7); no straight-ahead prior is added.

**2.10 Initialisation.** As today (stationary window for attitude and
biases), plus `psi₀` by solving (7) with `ω = 0` for `psi` alone over the
window, and `d₀ = s_r₀ = 0` at a detected top-out, else sag from the sheet.

## 3. Smoothing

The wheel-only smoother (`smooth.rs`) is deleted: under §2.5 the joints are
coupled to attitude and `psi` through every row of (6)–(9). It is replaced by
a **fixed-lag RTS smoother over the full state**. Fixed-lag, not fixed-
interval: fixed-interval must retain `P_k|k` and `P_k+1|k` per sample,
27² × 8 B ≈ 5.8 kB, ≈ 17 GB for an hour at 833 Hz. A lag `L` holds `L`
samples of state and covariance; default `L = 10 s` (8 330 samples, ≈ 48 MB),
configurable, and the lag must exceed the longest un-anchored interval that
matters (a float of a few seconds). Bell 1994 applies unchanged: the
backward pass within the window is the Gauss-Newton step on the same
factors. The run's memory is declared to the R203 budget before it starts.

Outputs are the smoothed marginals; `smooth: false` remains for diagnosis.

## 4. Inputs: the calibration record and the setup sheet

`ChainGeometry`, built from two sources, each field tagged `measured` or
`authored` (calibration spec §6, R190):

| Field | Source | Tag |
|---|---|---|
| `R₁`, `R₂`, `L₂`, `b_g,i` (initial), `β₀₁`, `β₀₂`, `s`, `C₀` | `calibration.*` record | `measured` |
| `L₁`, `h` | setup-sheet geometry: head angle, reach, axle-to-crown, brake-post offset | `authored` |
| `p(s_r)`, `θ(s_r)` | setup-sheet linkage: `swingarm {pivot, length}` (closed form) or `sampled {points}` (four-bar; GT Force arc in §1.1) | `authored`; `θ` absent ⇒ `θ ≡ 0` |
| travel maxima, topology | setup sheet | `authored` |
| `IMU0` → ISO chassis yaw | setup sheet (calibration spec §1.2a) | `authored` |

`BikeGeometry::reference_bike()` becomes a test fixture. With no calibration
record the run refuses with a typed `EstimatorError::NoCalibration` naming
the missing fields; the bound cells show that error where their chart would
be. Where the record lives (setup sheet per session, M6.4) is R190's, not
this spec's; this spec needs only
`ChainGeometry::from_records(&CalibrationRecord, &SetupSheet) -> Result<_, _>`.

## 5. Calibration protocol

Isaac's bars-free figure-8 is specified separately in
`2026-09-15-idl1-calibration-bars-free-DRAFT.md`. This spec reads the record
in either form; nothing in §1–§4 depends on the amendment landing.

## 6. Materialisation, the node, the CLI

**6.1 Derived store.** One C1 §5 file per run, `derived_kind =
"kinematic_chain"`; inputs = the nine `IMU{0,1,2}_{Accel,Gyro}{X,Y,Z}`
columns and `GPS_SpeedKmh`/`GPS_Heading` when present; `config_json` = canonical `EstimatorConfig` plus
`ChainGeometry` (a re-calibration or a geometry edit therefore yields a new
file beside the old); `engine_version` = the core crate version. Columns:

| Channel id | Unit |
|---|---|
| `Front travel`, `Rear travel` | mm |
| `Front velocity`, `Rear velocity` | mm/s |
| `Steer angle`, `Steer rate` | deg, deg/s; positive = bars left (ISO yaw) |
| `Roll`, `Pitch` | deg |
| `Speed` (chassis, from the fused `v`) | km/h |
| `Longitudinal accel`, `Lateral accel` | g |
| `Stationary`, `Airborne` | 0/1 |
| `… sigma` for the six joint outputs | same unit |

The `store_math` in-memory path for these channels is deleted; the session
handle reads the derived file and requests a run when it is absent (§6.3).

**6.2 The node: why a cell kind.** The workbook is the file and the app is a
viewer of it, so the estimator's configuration must live in the file, be
diffable, and evaluate once. A math builtin with keyword arguments fails all
three: the config would be repeated in every call (`wheel_velocity("front",
lag=10, …)`), two calls with different arguments would silently produce two
different estimators, and a change would have to be edited in every cell.
So: a fenced ` ```estimator ` cell (C2 amendment), body YAML:

    kind: kinematic_chain
    smooth_lag_s: 10
    full_travel_datum: false
    # calibration: <sha>   # optional pin; default = the session's setup sheet

One cell = one node in the graph with an output port per §6.1 channel;
downstream math cells reference outputs by name exactly as they reference
device channels. A workbook without the cell behaves as if a default one
were present. `wheel_travel(...)` and friends become aliases onto the
default node so existing workbooks keep evaluating.

**6.3 IPC and threading.** `run_estimator(session_id, cell_id) ->
Channel<EstimatorProgress>`, `#[tauri::command(async)]` (R201); progress is
`{phase: "forward" | "smooth" | "write", fraction}`; completion carries
`derived_hash`. Bound cells show `stale` until the file exists (the
errors-staleness lane's `CellStatus`). Concurrency and memory go through the
R203/R208 pool.

**6.4 CLI.** `session estimate <id> [--config <yaml>] [--json] [--truth
<json>]`. Needs an R number.

## 7. Validation

**7.1 Synthetic.** `session synth --protocol ride` (new): the §1 chain on the
existing loop with prescribed `d(t)`, `s_r(t)`, `psi(t)` (incommensurate
sinusoids plus a jump-and-land float with a true top-out and one full-travel
compression), sensors propagated
through (6)–(9) with the generator's noise; `truth.json` gains
`chain: {d, s_r, psi}` per sample. Acceptance at `--noise √ODR`:

| Quantity | Threshold |
|---|---|
| `ḋ`, `ṡ_r` velocity PSD, 0.5–30 Hz | ≤ 1 dB per third-octave band |
| `psi` RMS | ≤ 1.0° |
| `d`, `s_r` peak-per-event | ≤ 5 mm |
| top-out timing | within 2 samples |
| `v_x` RMS vs truth | ≤ 0.1 m/s |

**7.2 Real data**, first rides after the lane lands:

- **Full-travel check**: on a test track that uses all the travel, the
  estimate's ride maximum against `travel_max` (Isaac: assume the first 95 %).
  This is the standing validation until linear pots exist.
- **Zip-tie peak** per run where one is fitted.
- **Steer cross-check** at speed against `atan(wheelbase · yaw_rate / v)`
  corrected for lean: sign always, magnitude to ~20 %.
- **Linear potentiometer**, when Isaac buys them: the spec gains a §7.3 with
  a numeric travel error, and `FullTravel` is retired if it disagrees.

## 8. Tasks (one lane, serial; each commit gated per CLAUDE.md §8)

| # | Task | Crate | Gate filter |
|---|---|---|---|
| T1 | Lift this spec from DRAFT; C1 §5 `derived_kind` row; C2 estimator cell; C6 verb row | docs | — |
| T2 | `ChainGeometry` from record + sheet; `reference_bike()` to tests | core | `estimate::geometry` |
| T3 | State (10), process (11), the factors of §2.5, FD tests, `q_acc` corner test, ledger | core | `estimate::` |
| T4 | Full-state fixed-lag RTS; delete `smooth.rs`'s wheel pass; memory estimate | core | `estimate::smooth` |
| T5 | `synth --protocol ride` with chain truth; §7.1 acceptance | core, cli | `synth::`, `session_synth` |
| T6 | Derived materialisation, handle read path, `session estimate`, `run_estimator` + progress, `app/src/ipc/` mirror | core, cli, tauri, app | targeted + `cargo check -p app` |
| T7 | Estimator cell + node (ports, status, aliases) | core (C2 parse), app | `workbook::`, vitest |
| T8 | Real-data validation §7.2 with Isaac; tuning notes back into this spec | — | — |

Order: T2, T3, T5, T4, T6, T7, T8. The calibration amendment runs as its own
lane from its own spec.

## 9. Decisions taken on Isaac's answers (2026-09-15)

1. Both unsprung IMUs are on the brake posts; the bike is a four-bar GT
   Force whose seatstay rotation is nearly negligible; rear travel is
   accel-based. → §1.1, `θ′`-gated rear gyro and `b_g2`.
1a. Wheel speeds stay **out** of the model: loose surface, sensors still in
   debug, and GPS velocity fused with `IMU0` is the trusted anchor. → §1.4,
   nav-frame `v` kept, no wheel-speed factors.
2. Node representation: estimator cell kind. → §6.2 gives the reasoning.
3. No linear pots yet; test tracks use all the travel, assume the first 95 %.
   → §2.7 optional datum, §7.2 standing check.
4. No compatibility constraint: → §2.1 state designed fresh, sag prior
   deleted, `store_math` path deleted.
5. Calibration amendment: spec and plan → separate DRAFT.

6. The rear gyro factor is kept for the motocross bike's pure-rotation
   swingarm and activated only where the authored `θ′` is real; the GT Force
   axle path is the §1.1 three-point arc. → §1.1, §4 linkage kinds.

Nothing blocks the lane. A Linkage export for the GT Force would refine the
arc and supply the seatstay `θ(s_r)`; the motocross bike needs its pivot
position and swingarm length on its setup sheet.

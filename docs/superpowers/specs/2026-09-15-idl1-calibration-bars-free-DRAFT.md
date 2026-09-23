# Rigid-body calibration, amendment: bars free during the tumble (DRAFT)

Status: **spec-first draft**, 2026-09-15. Amends
`2026-09-10-idl1-rigid-body-calibration.md` ("the base spec"); equation and
section numbers below are the base spec's unless marked (A-n). Consumed by
`2026-09-15-idl1-kinematic-chain-estimator-DRAFT.md`, which reads the record
in either form.

## 1. Why

Isaac (2026-09-15): turn the bars through the figure-8s as well, so every
combination of body rate and steer is excited, instead of the base spec's
separate bar-turn segment after a bars-straight tumble. The base protocol
works, but it puts the steer information in a short segment and relies on the
operator holding the bars still for 30 s while tumbling a bike, which is the
part people get wrong.

## 2. What the base spec relied on, and what changes

| Base spec | Relied on `psi ≡ 0` over the tumble? | Amendment |
|---|---|---|
| §2.0 three segments `rest` / `datum` / `steer` | yes (the split itself) | two segments: `rest` (bars straight, still), `tumble` (bars free) |
| §2.1 gyro bias from `rest` | no | unchanged |
| §2.2 Kabsch for `R₂` (IMU2 on body R) | no | unchanged |
| §2.2 Kabsch for `R₁` over `datum` | **yes** | replaced by the joint solve (A-1)–(A-3) |
| §2.3 lever arms and `β` | no (IMU0/IMU2 are one body; IMU1's lever is a gauge) | unchanged |
| §2.4 steer axis `s` from the `psi`-free quadratic form (7) | no, it holds for every sample | applied over the whole tumble |
| §2.6 LM refinement | no | gains `psi(t)` as described below |
| §3 gates | partly | `steer_richness` added, §2.4's gate re-scoped |
| §6 record | no | `MODEL_VERSION = 2`; `source` gains `rigid_body_bars_free` |

## 3. Estimation under bars-free motion

**(A-1) Steer axis first.** The base spec's (7) eliminates `psi(t)` exactly,
so `s` is solved over the whole tumble as before; more samples, not fewer.

**(A-2) Steer rate from the invariant component.** Rotation about `s`
preserves the component along `s`, so from (4), for any `R₁`:

    psi̇(t) = sᵀ R₁ ω₁ˢ(t) − sᵀ ω_R(t)                                      (A-2)

This depends on `R₁` only through `sᵀ R₁`, one row.

**(A-3) `R₁` and `psi(t)` jointly.** Unknowns: `R₁` (3), the datum offset
`psi₀` (1, but a gauge, see A-4), and `psi(t)` = `psi₀ + ∫psi̇`. Equations: (4)
at every sample, 3 per sample. Initialise `R₁` from the rest hold: gravity
gives two of its three DOF, and the third, the rotation about gravity, is
fixed by requiring `R₁ ω₁ˢ` to match `ω_R + psi̇ s` in the least-squares sense
over the first second of the tumble with `psi ≈ 0`. Then LM over
`(R₁, s, r₂, β, {psi_k})` where `{psi_k}` is parameterised **per sample by its
integrated rate plus one offset**, not as N free values: the gyro-difference
integral is far cleaner than N unknowns, and it keeps the LM vector at 18
instead of 25 000. A slow drift term (1 parameter, linear in `t`) absorbs the
`IMU1` gyro bias error along `s`.

**(A-4) The datum.** With `C₀ ≡ I` still the gauge, `psi = 0` is defined by
the **rest hold with the bars straight**: with `s` known and not parallel to
gravity (26° off it on the reference bike), the two sensors' gravity
directions fix `psi` there. The base spec already required the rest hold; the
amendment only requires that the bars be straight *during it*, which is the
easy version of the instruction.

**(A-5) Identifiability.** `3N` equations, `3 + 2 + 2` unknowns after the
integral parameterisation. Degenerate cases, detected not mis-fitted: `s`
parallel to gravity (datum undefined, `quality.shortfalls` names it); bars
never moving (reduces to the base solver, which is the intended fallback);
tumble rate parallel to `s` throughout (the base §2.5 degeneracy, unchanged).

## 4. Protocol (replaces base §5.1)

Bike held in the air, suspension topped out, front wheel steadied. In order:
a **stationary hold** of at least 10 s with the bars straight; then a
**tumble** of at least 40 s, figure-8s through roll, pitch and yaw at a
hand-held rate around 3 rad/s, **turning the bars continuously through at
least ±30°** while doing so. The operator is asked for nothing else.

## 5. Gates (base §3, amended)

- `steer_richness`: peak-to-peak `psi` over the tumble ≥ 0.5 rad, **and**
  `psi̇` not correlated with any single body-rate axis above 0.8 (a bar
  motion locked to the tumble cannot be separated from a mount error).
- Rotation condition and lever richness unchanged, computed on `ω_R`.
- `rest` gains `bars_straight`: the rest-hold gravity solution for `psi`
  must be within 5° of zero *after* the fit, else the datum is reported
  unreliable and `steer_datum` is absent.

## 6. Validation

`session synth --protocol calibration` gains `--bars free` (default `held`,
so every existing byte-identical session is unchanged, C1 §9's rule):
`psi(t)` a third incommensurate sinusoid through the tumble, zero through the
rest hold. Acceptance identical to base §5: rotation ≤ 0.5°, lever ≤ 10 mm,
`s` ≤ 1.0°, plus `psi(t)` RMS ≤ 0.5° against `truth.hinge`. Also required: a
`--bars held` session fits **identically** under the new solver (regression
against the M6.3 numbers), and a session with bars locked to the roll axis
fails `steer_richness` rather than returning a wrong `R₁`.

## 7. Record

`MODEL_VERSION = 2`. `source` adds `rigid_body_bars_free`. `quality` gains
`steer_richness`, `bars_straight_rest_deg`. Shape otherwise unchanged, so the
estimator's `ChainGeometry::from_records` reads both versions.

## 8. Plan (one lane, serial, after or beside the estimator lane)

| # | Task | Gate filter |
|---|---|---|
| A1 | Lift this spec from DRAFT; fold into the base spec as §2.7/§5.1b or supersede it (lead decides at merge) | docs |
| A2 | Synth `--bars free`; truth `hinge.psi[]`; byte-identity test for the default | `synth::` |
| A3 | Segmentation to two segments; (A-2)/(A-3) solver path; `R₁` init from rest gravity; LM parameterisation | `calibration::rigid` |
| A4 | Gates §5; record v2; CLI `session calibrate` prints the new quality fields; `docs cli` regenerated | `calibration::`, `session_calibrate` |
| A5 | Acceptance §6 on both protocols; CHANGELOG `[docs]` | full lane gate |

Estimated at one Sonnet implementer day plus review; no new crate, no app
change.

# Review: calibration lane (M6.3, R192)

## Commits reviewed

Rust (`idl-rs-worktrees/calibration`, branch `calibration`, `git diff main...HEAD`):
914abfa, eb7c898, 34bd274, c91ace8, e2b746f.

Files touched: `cli/src/verbs/mod.rs`, `cli/src/verbs/session.rs`,
`core/src/calibration.rs` → `core/src/calibration/mod.rs`,
`core/src/calibration/rigid.rs` (new, 1878 lines), `core/src/calibration/json.rs` (new),
`core/src/commands/calibration_ops.rs` (new), `core/src/commands/mod.rs`,
`core/src/commands/table.rs`, `core/src/synth/mod.rs`, `core/src/synth/tests.rs`.

App/docs (`idl1-app-worktrees/calibration`, branch `calibration`, `git diff main...HEAD`):
a180d68, 7990f35, 7be6bd2.

Files touched: `CHANGELOG.md`, `docs/CLI-REFERENCE.md`,
`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`,
`docs/superpowers/specs/2026-09-10-idl1-rigid-body-calibration-DRAFT.md` (deleted),
`docs/superpowers/specs/2026-09-10-idl1-rigid-body-calibration.md` (new),
`docs/superpowers/specs/2026-09-11-idl1-c6-cli.md`.

## Test command and result

Per task instructions, cargo was not run. Owner-reported gate (taken at face value
per instructions, not re-executed): `cargo test -p idl-rs -p idl-rs-cli --
--test-threads=4` = 1616 + 118 passed, exit 0; `cargo check -p idl-rs-cli --tests`
exit 0. Verified statically instead: read every new test in
`core/src/calibration/rigid.rs`, `core/src/calibration/json.rs`,
`core/src/commands/calibration_ops.rs`, `cli/src/verbs/session.rs`,
`core/src/synth/tests.rs`; all follow Arrange/Act/Assert with blank lines and
are named for condition/result (a few in `synth/tests.rs` use "Arrange + Act"
combined, consistent with the file's pre-existing style, not a new deviation).
Re-derived the maths by hand against spec equations (1), (4), (6), (7), (8),
the Kabsch direction, the errors-in-variables correction, and the two-body
kinematics in `calibration_kinematics` (rigid transport + relative
acceleration + Coriolis `2ω×q̇`, and `ω_F = C(δ)ᵀ(ω_R + δ̇s)`); all check out
against the spec text.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `idl1-app-worktrees/calibration/docs/superpowers/specs/2026-09-10-idl1-rigid-body-calibration.md:198` | §2.6 says the LM parameter vector is "17 parameters" (line 189, matching the code's `Layout::build`: 6 rotation + 9 bias + 2 steer = 17) but nine lines later calls it "central differences on that 23-vector" — a stale figure left over from before `r_i`/`β_ij` (6 more params) were pulled out of the vector in §8.7's correction. The spec contradicts itself on its own headline number. | Change "23-vector" to "17-vector" (or "that vector"). |
| Important | `idl1-app-worktrees/calibration/docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md:1133` | New `### 9.9 The calibration protocol` section is physically inserted between `### 9.6 The truth file` and `### 9.7 Determinism`, so the document reads §9.6, §9.9, §9.7, §9.8 in file order — out of numeric sequence. Purely a documentation defect but the doc is the contract and a reader following it top-to-bottom hits §9.9 before §9.7/§9.8 exist. | Renumber to §9.7 and bump the old §9.7/§9.8 to §9.8/§9.9, or move the new section after §9.8. |
| Minor | `idl-rs-worktrees/calibration/core/src/calibration/mod.rs:12-16` | New doc comment claims "[`rigid`] is the full model … and calls back to this yaw-free rotation [`rotation_from_gravity`] when it is asked to tie a body frame to the world." No such call exists anywhere in `rigid.rs` in this diff — `rotation_from_gravity` is never referenced outside `calibration/mod.rs` itself. The doc describes a future/consumer relationship as if it were already wired up. | Reword to something like "…which a consumer applies to map the record onto the world frame" rather than asserting `rigid` calls back into it. |
| Minor | `idl1-app-worktrees/calibration/docs/superpowers/specs/2026-09-10-idl1-rigid-body-calibration.md:299` | §6's output-record table gives one type description, "unit 3-vector in R frame", to the combined row `steer_axis, steer_datum`, but `steer_datum` is `C₀ ∈ SO(3)` (implemented and serialised as a quaternion `(w,x,y,z)`, per `CalibrationRecord::steer_datum: UnitQuaternion<f64>` and `CalibrationJson::steer_datum: [f64; 4]`), not a 3-vector. | Split the row or state both types explicitly. |
| Minor | `idl-rs-worktrees/calibration/core/src/commands/table.rs:990-1005` | The `every_ruled_verb_names_the_ruling_that_added_it` test was loosened to accept either an `R`-numbered ruling or a string ending in `" brief"`, specifically to admit `("calibrate", "M6.3 brief")`. The task's own numbered ruling `R192` already exists and is used throughout the spec/CHANGELOG for this exact feature; using it here would have kept the test's original, stricter invariant (every verb traces to a numbered ruling) instead of adding a second, looser convention. | Either use `"R192"` for the `calibrate` row (matching the rest of the deliverable) or, if the brief's un-numbered "granted" is deliberately distinct from R192, say so in a comment at the table row. |
| Minor | `idl-rs-worktrees/calibration/core/src/calibration/rigid.rs:824-834` | Spec §2.6 states rotations are "carried as `UnitQuaternion` with a tangent 3-vector increment (`q ⊕ exp(δθ)`)". The implementation carries `Solution::mount` as `Matrix3<f64>` throughout the solve and only converts to `UnitQuaternion` when building the final `SensorCalibration` (line ~1423). Mathematically equivalent (product of orthogonal matrices stays orthogonal to floating-point precision over 12 LM iterations) and the code's own doc comment on `apply_delta` explains the design, but it silently diverges from the literal spec text. | Either note the representation choice in the spec's §2.6 (as an implementation detail that doesn't change the maths), or switch the internal type to match. |

## Verified correct (no finding, listed because explicitly asked)

- **Kabsch direction**: `kabsch(m)` with `m = Σ reference·sensorᵀ` returns `R = U Vᵀ` mapping *sensor → reference(body)*, confirmed by algebraic derivation (`M = R·P` for `P` symmetric PSD ⇒ `UVᵀ = R`) and by its use at `rigid.rs:1302-1316`, where the reference sensor already has `R₀ ≡ I` so `corrected_reference[k]` *is* the body rate — matches spec §1.2's `R_i`: sensor frame → body frame, not the transpose.
- **Equation (7) expansion**: `rigid.rs:664-716` builds `M = ω_R ω_Rᵀ − ω_F ω_Fᵀ` and the row `[M11,M22,M33,2M12,2M13,2M23]` against `x=[S11,S22,S33,S12,S13,S23]`, which reproduces `sᵀMs` exactly when `x = vec(S)`, `S = ssᵀ`; the `tr S = 1` row is weighted by the sample count as the spec's prose states; `s` is signed by `s·ẑ>0` (`axis.z<0.0 ⇒ negate`). Matches (7) exactly.
- **Equation (8) sign**: `steer_angles` computes `steer_axis.dot(&(front - rear))`, i.e. `sᵀ(ω_F − ω_R)`, matching (8) precisely; the LM `Steer` residual `rotation*front - rear - steer_axis*delta_rate` matches (4) rearranged.
- **§2.4's "same coordinates in both frames" claim**: valid specifically because `C₀ ≡ I` (§1.2a) makes `s` numerically invariant across the F/R frame boundary; used correctly in `steer_angles`.
- **Two-body kinematics** (`synth::calibration_kinematics`, `mod.rs:1022-1120`): the front sensor's specific force is `specific_forces[k] + [ω̇_R]×q + [ω_R]×([ω_R]×q) + q̈ + 2[ω_R]×q̇`, exactly the standard moving-frame transport formula (rigid terms + relative acceleration + Coriolis), with `q`, `q̇`, `q̈` correctly expressed and differentiated in the R frame. `ω_F = C(δ)ᵀ(ω_R + δ̇s)` matches (4) inverted.
- **Errors-in-variables correction**: `2·σ_d²·N` subtracted from the top-left 3×3 (lever-arm) block only, matching the spec's `2Nσ_d²` on "the diagonal of the `ΩᵀΩ` block", not the `β` block.
- **LM parameter count in code**: `Layout::build` yields 6 (2 non-reference rotations × 3) + 9 (3 sensors × 3 gyro bias) + 2 (steer tangent) = 17, matching the spec's corrected "17 parameters" (not its own stale "23-vector", see finding above). `r_i`/`β_ij` are correctly excluded from the vector per §2.6/§8.7.
- **`loop` protocol byte-identity**: `SynthConfig::protocol` has `#[serde(default, skip_serializing_if = "Protocol::is_loop")]`, so a default-protocol config's `identity_bytes` (and hence UUID, device ID, CRC) is unchanged; `SYNTH_VERSION` was correctly left at `1.0.0` since no existing configuration's output bytes change. Confirmed by reading `identity_bytes` and the untouched `SynthConfig::fixture()` (default protocol) driving the committed-fixture tests.
- **`SPEC_NOISE_SCALE = √833`**: the generator's `GYRO_SIGMA_RAD_S`/`ACCEL_SIGMA_M_S2` are per-sample σ at `noise_scale=1`, applied linearly (`gyro_sigma = GYRO_SIGMA_RAD_S * config.noise_scale`), while the spec's 0.003/0.05 are random-walk coefficients needing `×√ODR` to become a per-sample σ; `√833 ≈ 28.8617` is exactly what the spec's own text prescribes ("measured at `--noise 28.8617`"), and the accuracy-test thresholds (0.5°, 10 mm, 1.0°, 0.002 rad/s, 0.05 m/s²) match the §5 table verbatim.
- **R190 (absent, not zero)**: `SensorCalibration.lever_m`/`gyro_bias_rad_s`, `CalibrationRecord.steer_axis` are `Option`, serialised with `skip_serializing_if = "Option::is_none"`; the `rest_only_record_omits_every_unobserved_field_rather_than_zeroing_it` test directly asserts the JSON lacks `lever_m`/`steer_axis` keys while `gyro_bias_rad_s` is present. No absent-as-zero found.
- **Layering / R230**: `calibration_ops.rs` (wire-unit conversion, session→input, truth scoring) lives in core; `cli/src/verbs/session.rs::calibrate` is a thin wrapper (parse, call, format) with no CLI-only logic. No Tauri/async/network in core.
- **No `unwrap()`/`expect()` on external or session data** outside `#[cfg(test)]` blocks; the few non-test `expect()`s are on internal invariants (SVD components, finite-value sorts after validation, JSON-serialising an already-validated config) — acceptable.
- **No bare `TODO`, no `Err(String)`**, doc comment present on every `pub` item checked in `rigid.rs` (spot-verified with a script), no `cargo fmt` touch (style matches surrounding code, e.g. no reformatting of untouched lines observed in the diff).
- **Commit messages**: single-line, no AI attribution trailers.

## Verdict rationale

The core deliverable — the two-body rigid-body solver, its Kabsch/Wahba step,
the δ-free steering-axis quadratic form, the errors-in-variables lever-arm
correction, the LM refinement with the deliberately-reduced 17-parameter
vector, and the matching synthetic two-body kinematics with correct Coriolis
transport — is mathematically correct against the spec's own equations, checked
by hand, and the accuracy tests genuinely exercise the spec's own noise-scale
correction and threshold table rather than a flattered noiseless case. The
`loop` protocol's byte-identity claim holds up under inspection of
`identity_bytes` and the `skip_serializing_if` gate. The R190 absent-vs-zero
rule is honoured throughout, including a positive test for it. The only real
defects found are in the accompanying spec document (an internally
contradictory parameter count, a section out of numeric order, and one type
description conflating two fields) plus a couple of minor code-doc/test
looseness items — none of which touch the shipped Rust behaviour or its
correctness. These are Important as spec-hygiene issues (the spec is the
contract and CLAUDE.md requires spec discipline) but are trivially fixable
documentation edits, not defects in the shipped solver.

VERDICT: NEEDS_FIXES

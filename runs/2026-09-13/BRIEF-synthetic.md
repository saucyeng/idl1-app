# Brief: synthetic session generator (roadmap "Firmware", M6.3 precondition, R187)

Lean owner, Rust core + cli, spec-first (a short C1 §9 "Synthetic sessions" section written in
the app worktree before code). Worktrees: Rust `idl-rs-worktrees/synthetic`, app
`../idl1-app-worktrees/synthetic` (spec text only). Read CLAUDE.md (§8; R235: only Rust lane;
memory gates 4 GB core/cli, 6 GB tauri/app), rulings R187 (firmware item), R190/R192
(calibration draft: `docs/superpowers/specs/2026-09-10-idl1-rigid-body-calibration-DRAFT.md`
§5 validation plan), `docs/HARDWARE_M10_SETUP.md` (the M10 GPS fields), `docs/IDL0_SPEC.md`
§3–§5 (record layout, IMU record, GPS_FIX record, header), C1 (channels, `timestamp_utc_ms`,
`timestamp_source`), the `.idl0` writer if one exists in core (grep `IDL0` magic writers; the
parser is `core/src/parse/v3.rs`), `core/src/wire_golden.rs` (the deterministic-fixture pattern
from R236), and the CLI table (`core/src/commands/table.rs`, R230 vocabularies).

## Rulings (do not ask)
1. **Output is a real `.idl0` file**, bytes valid for the current parser, so every importer,
   catalog, cache and chart path is exercised unchanged; not a parquet shortcut.
2. **Content is a simulated rigid body on a synthetic track**: a closed loop (parametric
   curve, configurable length) driven at a speed profile; three IMUs (frame, fork, rear) with
   known extrinsics (rotation + lever arm), gyro = body angular rate rotated into each sensor
   frame, accel = gravity + centripetal + lever-arm terms, plus configurable white noise and
   bias; GPS at 1 or 5 Hz from the loop position with `sAcc`, `velD` and the NAV-ODO fields per
   `HARDWARE_M10_SETUP.md` (write them where the record has room; if SPEC §5.6 lacks the
   fields, emit the legacy record and say so in C1 §9); laps by crossing a start/finish gate.
   All units and rates documented; seedable (`--seed`), deterministic across platforms.
3. **Ground truth beside the file**: `<name>.truth.json` with the extrinsics, lap times, loop
   geometry and noise settings, so M6.3's calibration can be validated against it and lap
   detection can be scored.
4. **Verbs** (R230 vocabulary; `session` noun): `idl-rs session synth --out <file> [--laps N
   --lap-length-m L --rate-hz 800 --gps-hz 5 --seed S --noise ...]`; if `synth` is a new verb it
   needs the R230 test's vocabulary updated and a one-line ruling recorded in C6: it is granted.
5. Tests: round-trip through the real parser (channel names, rates, sample counts), lap count
   matches the truth, gyro streams of two sensors differ by exactly the known rotation, seed
   determinism. Also a small committed fixture (≤ 200 KB, a few laps) under `core` test
   fixtures for other lanes to use.

## Gates
`cargo test -p idl-rs synth`, `cargo test -p idl-rs-cli`, then `cargo test -p idl-rs -p
idl-rs-cli -- --test-threads=4`, `cargo check -p idl-rs-cli --tests`; regenerate `docs/
CLI-REFERENCE.md` + `cliTable.json` (`docs cli`). One reviewer (sonnet). Merge both repos (main
into branch first, --no-ff), submodule bump, CHANGELOG `[docs]`, retire in the R171 order with
the tightened check. Lanes never create branches or edit files in the main checkout. Never push.
Report 10 lines or fewer.

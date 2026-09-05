# IDL0 Tools

Developer utilities for inspecting IDL0 logs and prototyping the processing
pipeline. None of these ship in the app — they're for development and
investigation only.

## Log inspection

`idl0_dump.dart` (header fields, record boundaries, `.espl` legacy support) is a Dart tool and
was not carried into idl1-app (idl1 has no Dart layer — CLAUDE.md §2); it remains available in
`idl0-app/tools/idl0_dump.dart` for anyone still working against that repo. The overlapping,
Rust-side subset — session metadata and per-channel sample counts — is available here via the
CLI: `idl-rs info <file.idl0>` and `idl-rs channels <file.idl0>` (see `rust/cli/src/main.rs`).

## `imu_drop_analysis.py` / `imu_budget_model.py`

One-off firmware investigations into IMU FIFO sample drops. `imu_drop_analysis.py`
walks a log's record stream to reconstruct the firmware drain cadence and locate
lost samples (pass the log path as the first argument); `imu_budget_model.py`
models the FIFO drain/capacity budget. Kept as analysis references — not
maintained tools.

```bash
python tools/imu_drop_analysis.py path/to/session.idl0
```

## `estimator_sim/`

A Python prototype of the suspension travel/velocity estimator (EKF + RTS
smoother). The production implementation now lives in the Rust engine
(`rust/core/src/estimate/`); this directory is retained as a readable reference
for the estimator's design. See [`estimator_sim/README.md`](estimator_sim/README.md).

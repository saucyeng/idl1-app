# Wave 3 roadmap — the data pipeline

*Draft 2026-09-10 from Isaac's answers. Mark it up; every "Decide" line is yours,
everything else is the lead's proposal and becomes rulings once you have read it.*

## The pipeline, as stated

    logger --WiFi--> phone --(LAN or bucket)--> computer --> library --> meta-analysis
                       |
                       +--> instant report from premade workbooks (paper view)

Phone is the front door and the instant-report surface; the computer is the library
and the deep-analysis surface. Everything wireless. Old sessions get folded into the
library once and future ones arrive automatically.

## Milestones, in order

### M4a — Front door: logger to phone, instant report
| # | Task | Layer | Hardware needed |
|---|---|---|---|
| 1 | Android WiFi binding: bind the process to the logger's AP (no-internet network) so `reqwest` reaches SPEC §6 | Kotlin shim in `app/src-tauri` (same size class as the multicast lock, R183) | old logger works |
| 2 | Device transfer UI on the phone: list files, download with progress, import on arrival | `app/src` over existing `idl-transport` | old logger |
| 3 | **Auto workbooks:** on import, the "premade" workbook set is instantiated against the new session and the paper view opens on it | core (workbook instantiation is already a file operation) + app | none |
| 4 | Deltas on the phone: lap-vs-lap comparison in the premade set | workbook content, C2 already supports multi-window | none |

Gate: ride, then the phone shows the report before the logger is powered down. Real-device
check is the first use of the old hardware (Isaac, when the app is usable).

### M4b — Phone to computer: LAN is v1; the bucket is designed now, built later
*Isaac, 2026-09-10: "if the LAN transfer is close, stick with that for now; it's a tool for
me. Doesn't hurt to think about the cloud architecture now so we're prepared." So this
milestone is a **C5 spec draft only** in wave 3; the tasks below are its content.*

| # | Task | Decide |
|---|---|---|
| 1 | `idl-transport` gains a **bucket transport** behind the existing sync trait: manifest per device at `devices/<peer_id>/manifest.json`, blobs at `blobs/<hash>`, workbooks versioned by hash; pull merges with the same per-cell merge; catalog never synced | **Provider:** R2 (default, no egress fees) / B2 / S3 |
| 2 | Credentials: one access key per device, entered once in Settings, stored in `app_config_dir` beside `identity.json`, never in `<data>` | — |
| 3 | Phone pushes automatically after an import on any network (cellular included); desktop pulls on launch and on a timer | **Cellular push on by default?** (lead: yes, files are a few MB) |
| 4 | LAN sync stays as built; both transports can be enabled at once, idempotent by content hash | — |

Spec-first: C5 "bucket sync" contract before code. Crate: `object_store` (Apache
Arrow's, pure Rust, S3/R2/B2/GCS), so no new HTTP stack.

### M4c — The library
| # | Task |
|---|---|
| 1 | **Inbox folder:** any `.idl0` dropped into `<data>/inbox/` (desktop) is imported and moved; the existing watcher pattern |
| 2 | **Names from the log, not the file:** session start is already back-filled from the first GPS fix (SPEC §5.6). The uuid-named grab bag are files that never got a fix or predate the rename; for those the start time is unknown and the metadata editor asks once |
| 3 | **Metadata editor** on the session: venue, track, bike (setup-sheet id), rider notes, tags; C1 fields, synced with the session |
| 4 | **Batch re-import** after an importer version change (`data.parquet` is a function of blob + importer version, so this is a rebuild, not a re-ingest) |
| 5 | **Duplicates** cannot exist: the CAS keys by content hash. A "same ride, two files" case (a re-download) is one blob |
| 6 | **Bulk fold-in tool:** point at a folder, preview names and detected venues, import all |

### M5 — Meta-analysis (spec-first, C2 change)
Workbook cells today range over windows of **one** session. Meta-analysis needs a
cell to range over a **set of sessions** chosen by a query: "all runs on track X",
"every session this season". Proposal: a `sessions(query)` source in C2 §5 that
yields a window per matching session, evaluated per session with the R125 cache
(keyed on session, definition, revision, designed for exactly this), and a
catalog query command in C3. Fitness-over-a-season is then a chart over that set.
Deferred detail: query grammar (venue, track, date range, bike, tag). One lane after
M4c, because the metadata it queries has to exist first.

### M6 — Setup sheet and calibration
| # | Task | Hardware |
|---|---|---|
| 1 | Setup sheet: the parameter list Isaac supplies (C1 profile fields, editable per bike, versioned, synced) | none |
| 2 | **Rest calibration:** 10 s at rest, gravity vector per IMU, mounting tilt about the one observable axis. A BLE/WiFi command in SPEC §8 plus core maths | new logger |
| 3 | **Rigid-body calibration (core, pure maths):** bike held in the air, suspension topped out, figure-8 / roll / pitch / yaw / bar turn. All gyros see one angular velocity, so relative orientations come from aligning gyro streams (Wahba); accelerometer differences under rotation give lever arms; bar turning exposes the steering axis as the one free DoF. Built and validated against a **simulated rigid body** first, so it is correct before a logger exists | none until validation |
| 4 | Calibration values live in the setup sheet, applied in post-processing (importer version bump when the model changes) | — |

Task 3 is the earliest hardware-free head start with the highest payoff for suspension
motion measurement.

### Release toolchain (GitHub Actions): do early, it also fixes the compute problem
| # | Task | Decide |
|---|---|---|
| 1 | CI: `cargo test -p idl-rs -p idl-rs-cli`, `-p idl-rs-tauri`, `-p idl-transport`, `tsc`, `vitest` on every push to `main` and every PR. **Moves the lane gate off the 16 GB dev machine** | Repo visibility (Actions minutes: unlimited on public, 2000/month private) |
| 2 | Android debug APK artifact per push to `main` via `tauri-apps/tauri-action`, sideloadable | Isaac generates a keystore once, stored as a repo secret, for release builds |
| 3 | Windows `.msi`/`.exe` and Linux AppImage on tags | — |
| 4 | The `rust/` submodule checkout in CI needs a token if idl-rs is private | Visibility of idl-rs |

### Firmware (idl1)
Lead's choice, as offered: **app side now against synthetic fixtures, firmware
incrementally when hardware lands.** A `synthetic_session` generator in core (rigid-body
motion plus GPS at 5 Hz with the M10 fields from `docs/HARDWARE_M10_SETUP.md`) gives every
lane a fixture and gives M6 task 3 its validation data. idl0 firmware is not touched.

## Decisions (2026-09-10)
1. Bucket: design only for now; provider decided when it is built (lead's default R2).
2. Repo visibility: idl1-app private (2000 Actions min/month), idl-rs public. Settled.
3. The setup-sheet parameter list: Isaac will supply.
4. Firmware stays Isaac's, in a separate session; the lead writes specs
   (`docs/HARDWARE_M10_SETUP.md` is the first).
5. Phone: **Pixel 8 Pro** (Android 14+, API 34; ~412 x 915 CSS px portrait, 915 wide in
   landscape, so landscape lands in the `medium` side-by-side layout by design).

## Order of dispatch
Release toolchain task 1 first (it multiplies everything after it), then M4a, M6 task 3
in parallel (hardware-free, core-only), M4c, the C5 draft whenever a spec slot is free, M5 last.

### M7 — Agent (added 2026-09-11, R222/R223/R228; promotes design L12 from optional)
| # | Task | Layer | Depends on |
|---|---|---|---|
| 1 | Generated reference + editor help + "Ask an agent" (terminal) + AGENTS.md at the data root | cli, tauri, app | R222/R223 lane (running) |
| 2 | One command table → CLI verbs, ribbon/menu/palette (R225), **and agent tool schemas** | core/cli/app | ribbon lane |
| 3 | Desktop in-app agent: BYOK key in Settings, sidebar chat, tool calls into the engine, workbook edits as previewed, undoable diffs | tauri + app | 1, 2 |
| 4 | Headless service on the same tool surface: pure-Rust import/eval/template instantiation, Node-side chart render to SVG, HTML report, server-side agent loop under R189 identity/storage | new service repo | 3, C5 |
| 5 | Web page: upload a Strava activity (API → GPX/streams; harden the GPX importer) → report | web | 4 |
Order: 1 → 2 → 3 on the desktop first (proves prompts and tools on Isaac's rides), then 4 → 5.

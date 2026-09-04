# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Added

- **Repository created (2026-09-02).** From the idl1 rewrite design
  (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`). Docs carried
  over from idl0-app: SPEC, design rationale, signal pipeline, datasheet,
  tools. The idl-rs engine is the same submodule idl0-app used, continued on
  `main` after tag `idl0-final`.
- **M0 complete (2026-09-02; desktop check confirmed 2026-09-03).** Tauri v2 scaffold, `idl-rs-tauri` with the binary IPC
  smoke path, `idl-transport` stub, and contracts C1–C4 signed. Wave 1 may start.
- **L4 `idl-transport` desktop device client complete pending the manual real-device check (2026-09-03).**
  BLE (`btleplug`) scan/connect/status/control/config-push, WiFi (`reqwest`) file listing,
  resumable download, config-push fallback — all behind `BleTransport`/`WifiTransport` traits
  L9's mobile plugins implement later. SPEC gains §14a (trait shapes, chunk/timeout defaults).
- **L1 core `store/` landed (wave 1, 2026-09-03).** Mandatory per-sample-time `Session`/`Channel`
  model (C1 §2); burst-seam correction (C1 §3.3) with a real-session ODR cross-check (pass —
  corrected 812.348 Hz vs. GPS-independent estimate 814.017 Hz, relative error 0.21 %, well
  within the 5 % tolerance); `data.parquet` Arrow/Parquet read/write with the C1 §7 round-trip
  suite; `derived/<hash>.parquet` writer + hash recipe (C1 §5); CAS blob store + atomic-write
  primitive (C4 §3–4); SQLite catalog + rebuild (C4 §5 — overwrite swap, `laps.track_id` by
  visit containment, `duration_ms` from the time span); `verify` checks #1–5, #8, #10 (#6/#7/#9
  deferred); `session.json` (C1 §6, replaces `.idl0w`); `.idl0t` writer; bike-profile
  (`<data>/profiles/`, C4 §2 amendment) and app-settings (`settings.json` keys, C4 §1 amendment)
  persistence; gate synthesis, session-wide lap renumbering, lap-distance normalisation
  (unit-corrected vs idl0 — the Dart fed ×1e7 coordinates into degree math), session filenames;
  core import pipeline (idempotent re-import, version-triggered regeneration, same-UUID/
  different-bytes collision refused); CLI `idl-rs import`/`sessions`/`verify`/`prune`.

### Verified

- Binary IPC path (Rust 2/2, vitest 3/3, cargo build, tsc clean) on Windows desktop, 2026-09-02 — automated; visual check via `npm run tauri dev` confirmed by Isaac 2026-09-03 (Engine 0.1.0, smoke tile 0–7 rendered).
- `idl-transport` unit/integration tests (`cargo test -p idl-transport`, 29/29 passed) and
  `cargo build -p idl-transport --release` on Windows desktop, 2026-09-03 — automated. Real-device
  BLE scan/connect/WiFi-mode entry, WiFi file list + resumable download, and BLE config push +
  read-back verify against a physical IDL0 device pending (Isaac).

# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Added

- **TS coverage reporting added (2026-09-05).** `@vitest/coverage-v8` pinned to vitest's
  version in `app/package.json`; `app/vitest.config.ts` gains a `coverage` block (v8
  provider, `src/**/*.ts`, text reporter, no thresholds set) so `vitest run --coverage`
  reports the per-module numbers CLAUDE.md §4 asks reviewers to check.
- **Device tab, Task 1 (2026-09-05, L7b).** `DevicePage.tsx` moved to
  `app/src/routes/pages/Device/` (a directory this lane owns), over a pure
  `connectionReducer` driven by the landed `ble_scan`/`ble_connect` (C3
  §3.8). `ConnectionInfo.connected` is treated as "the last connect attempt
  succeeded," never a live link — `rust/tauri/src/commands/device.rs`
  connects and disconnects inside each command, so nothing stays connected
  between calls (R53 Device Q4). `ipcStubs.ts` stands in for the five
  not-yet-landed Device/App commands (`device_status`, `device_control`,
  `pull_config`, `list_profiles`/`save_profile`/`delete_profile`,
  `connect_device`/`disconnect_device`) with a local `NotImplementedError`,
  never an `IpcError` kind.
- **Device tab, Task 2 (2026-09-05, L7b).** `Device/config/{model,defaults}.ts`
  — a typed TypeScript mirror of SPEC §8's `idl0_config.json`, field for
  field. `parseConfig` is lenient: a malformed field falls back to its
  default and is recorded as a `Repair` rather than throwing; a value that
  is the right type but off a SPEC-stated valid set (`imu.sample_rate_hz`'s
  ODR table) is kept exactly as read and reported as a `Repair` instead of
  being silently snapped, unlike idl0's `ImuSettingsDialog`. Unknown
  top-level keys and the two read-only fields (`device_id`,
  `config_version`) survive a parse → serialise round trip unchanged.
  `serializeConfig` omits an absent `heart_rate_monitor` block rather than
  writing back `enabled: false` (SPEC §8's stated equivalence, kept
  minimal). SPEC §8 gains an app-side config-model note, restating that
  `analog.sample_rate_hz`'s valid set is still undefined and the app
  accepts any positive integer there (R53 Device Q2). Does not build the
  validator — that is Task 3.
- **Device tab, Task 3 (2026-09-05, L7b).** `Device/config/validate.ts` —
  `validateConfig`/`isPushable`, the single gate `pushConfig` sits behind
  (a config is never pushed unvalidated). Checks every SPEC §8 valid-value
  set (IMU ODR by power mode, accel/gyro range, GPS rate range and
  integrality, dynamic model, digital channel kind) plus cross-cutting
  rules the schema doesn't state as a table but SPEC §8's prose implies:
  duplicate/empty analog channel keys, zero analog scale, negative digital
  debounce, a disabled wheel slot skipped entirely, an HRM address format
  checked only while enabled, and a pin-collision check that walks
  `analog.channels` and `digital.channels` together so an analog/digital
  cross-kind collision on one physical pin is caught, not just same-kind
  duplicates. Only `error`-severity issues block `isPushable`; `warning`
  flags a config that is valid but likely a mistake (an enabled IMU with
  every channel off, a reserved `level`/`pwm` digital kind). SPEC §8 gains
  a validation table (one row per rule, path/severity/condition/citation)
  as a machine-checkable counterpart to its prose tables.
- **Device tab, Task 4 (2026-09-05, L7b) — R53 Q1 narrowed scope.**
  `Device/config/sourcesPreview.ts` — `previewSources`, one row per source
  (IMU0/1/2, GPS, wheel front/rear, each analog/digital channel, HRM)
  carrying enable state, sample rate, and units **only**. This is
  deliberately narrower than the plan's original Task 4: it does not derive
  `scale`, `channel_id`, or `data_type` in TypeScript, since that arithmetic
  (`scale = range / 32768`) is the wire contract's own formula (SPEC §3),
  owned by `core::parse`. The full per-channel registry preview is deferred
  to `preview_channel_registry(config_json) -> RegistryRow[]` (IPC need 12),
  computed engine-side in the Rust write-amendment lane.
- **Device tab, IMU mode-flag warning follow-up (2026-09-05, L7b).**
  `validateConfig` now warns (never blocks `isPushable`) when
  `imu.low_power_mode` and `imu.high_performance_mode` are both set: SPEC §8
  frames the two as one physical toggle but does not state which one the
  firmware honours when both are true, so the validator surfaces the
  ambiguity rather than guessing a precedence rule. Tracked for Isaac in
  `runs/2026-09-03/decisions.md`'s 2026-09-05 "IMU `low_power_mode` vs
  `high_performance_mode`" note — the SPEC §8 gap this warning exists for
  is still open.
- **Device tab, Task 5 (2026-09-05, L7b).** `Device/sources.ts` —
  `listSources`, the channels table's `SourceView[]` — one row per
  configurable source in a stable order (hardware-pinned sources first),
  each with an expandable per-channel breakdown (`ChannelsTable.tsx`).
  Enable state and sample rate are joined from Task 4's `previewSources` by
  `sourceKey`, never re-derived. Scale/offset show only for an
  `analog.channels[]` entry's own config-typed values — never a
  registry-derived number (R53 Device Q1) — matching Task 4's narrowed
  scope; no `channel_id`/data-type column. `docs/IDL0_SPEC.md` §23.3
  rewritten to describe the columns as built.
- **L5 complete (2026-09-04).** idl-rs-tauri wired to every landed wave-1 lane's C3 command
  group (catalog, workbook, cursor, raster, tile) plus device (L4); <data> resolution,
  workbook watcher, app/src/ipc/ module layer, routing and state skeleton. Tile fetched
  end-to-end from a real .idl0 — parse → store → `fetch_tile` → decoded bytes verified in a
  headless test (header v2, 20224 bytes, real sample values); the NotebookPage canvas render
  visually confirmed in the dev app on 2026-09-05 (IMU2_AccelX envelope from the real
  session). M0 smoke path retired. Import commands (C3 §3.3) ship with L2, not this lane.
- **Raster commands (C3 §3.6) over L3's core::raster.** fetch_raster (binary) and fetch_raster_meta (axis domains + colour scale, resolution-independent per ruling R38); typed SpectrogramParams/Histogram2dParams replace the provisional Record<string, number> (C3 open question 6.4 closed).
- **Cursor command (C3 §3.7) over L3's core::cursor.** cursor_readout — nearest recorded sample, null outside a channel's recorded span (ruling R31); an unknown channel rejects the whole call with invalid_argument. Settle-bound only, never a hot path (C3 §4).
- **Workbook commands (C3 §3.4) over L3's v3 parser/evaluator.** open_workbook, eval_workbook (per-cell CellOutput, host channels as HostChannelRef markers only — the byte path is deferred to wave 2 with L6), save_workbook (C4 §4 expected-hash ordering + optimistic based_on_hash), watch_workbook (Task 3's watcher + a cell-body diff). No unsubscribe in wave 1.
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
- **Workbook v3 (`.idl1wb`) lands in idl-rs core (L3, 2026-09-04).** Markdown/front-matter
  parsing and cell-id assignment (C2 §1–§2); the math-cell definition grammar with a flat,
  document-wide constants table and a deps-first resolver whose per-definition results are
  never swallowed (C2 §2.4, §3.1–§3.2); `if()` folds its time axis across all three operands,
  not just the condition (R33); table-cell bodies wired onto the existing
  `table::model::TableModel` (C2 §4); Rust-side host-variable data for JS cells —
  `channel()`, `laps`, `session`, `constants` — and `${…}` inline-expression extraction
  (C2 §5), with cross-session `channel()` lookup exclusive (never falling back to the primary
  session) and lap-out-of-range errors naming the session's recorded lap count (R34) — the
  caller-side id/lookup pairing check for cross-session lookup is documented as owed to the
  wave-2 caller, not enforced here (R35); one evaluation result per cell (C3 §3.4); tile
  bytes at layout **version 2** with per-column stats and a per-column recorded `t_us`
  region, plus `MAX_TIER` as C3 §3.5's "engine's configured range" (C3 §3.5); spectrogram and
  2-D-histogram RGBA rasters with a `raster_meta` axis/colour-scale side-channel, colour
  bounds scanned over the full pre-rebin matrix so they are resolution-independent (C3 §3.6,
  R38); cursor readout, `null` outside a channel's recorded span (C3 §3.7, R31);
  pre-existing `gps_channel_values` amended to match — `null` past a channel's recorded
  span rather than a frozen last value (R39). Resolves the C1 §8 item 5 `t` naming collision
  (µs storage axis vs. seconds host-variable field). SPEC §17a rewritten for v3. Workbook
  migration from v2 (`migrate-workbook`, C2 §6) is deliberately **not** implemented — dropped
  from wave 1 by ruling R30; C2 §6 stays written and unimplemented.
- **idl-rs-tauri: typed IpcError (C3 §2).** Cross-cutting and transport-sourced kinds seeded; each lane adds its own prefixed kinds when its command lands.
- **<data> resolution and settings.json bootstrap (C4 §1).** Resolved once at startup, directory tree created idempotently; overridable via app_config_dir()/settings.json.**
- **Workbook file-watcher plumbing (C4 §4).** notify on <data>/workbooks, ~100ms debounce, expected-hash-set self-write suppression. Not yet wired to watch_workbook — gated on L3 (Task 11).
- **app/src/ipc/tiles.ts, rasters.ts: real C3 §3.5/§3.6 binary decoders.** Pure, tested against C3's own worked examples; fetchTile/fetchRaster reject until Task 14/12 land the Rust commands.
- **app/src/ipc/: full C3 §1 module scaffolding.** engine, catalog, import, workbook, cursor, device, sync — typed per C3 §3, invoke()-wrapped; commands not yet backed reject until their owning lane's Group B task lands.
- **React routing skeleton + app-level state (no new dependency).** Four-tab shell (Notebook/Device/Data/Settings) over a Context+useReducer AppState; placeholder pages for L6/L7.
- **docs/IDL0_SPEC.md §11 rewritten for the Tauri/Rust-core/TS architecture (spec-during).** First draft by L5; L10 does the cross-lane consistency pass.
- **Catalog commands (C3 §3.2).** list_sessions, get_session, list_laps, rebuild_catalog, list_workbooks, list_tracks, get_track, over a new core read layer (idl_rs::store::catalog_read) — L1 landed the writer only.
- **Device commands (C3 §3.8) wired to L4's idl-transport.** ble_scan, ble_connect, list_device_files, download_file (streams Progress), push_config. Each command connects/acts/disconnects per call (no managed BLE session yet). `push_config` validates `config_json` is well-formed JSON only — full schema validation via `idl_rs::config::parse_config` is blocked on core defining a `VersionedConfig` type for SPEC §8's device-config schema, not yet landed.

### Verified

- Binary IPC path (Rust 2/2, vitest 3/3, cargo build, tsc clean) on Windows desktop, 2026-09-02 — automated; visual check via `npm run tauri dev` confirmed by Isaac 2026-09-03 (Engine 0.1.0, smoke tile 0–7 rendered).
- `idl-transport` unit/integration tests (`cargo test -p idl-transport`, 29/29 passed) and
  `cargo build -p idl-transport --release` on Windows desktop, 2026-09-03 — automated. Real-device
  BLE scan/connect/WiFi-mode entry, WiFi file list + resumable download, and BLE config push +
  read-back verify against a physical IDL0 device pending (Isaac).

# Changelog

All notable changes to idl1 are recorded here. Format: Semantic Versioning.

## [Unreleased]

### Added

- **Rust raster underlay (L6 Task 9).** Spectrogram and 2-D histogram rasters drawn beneath Plot axes via `fetch_raster`/`fetch_raster_meta`, settle-bound only (P1/P3/P4); colour scale never recomputed in JS (R38, P8).
- **Sandbox rebuild ordering fixed: channels replay after `init`, before `setCells` (L6 Task 8, review-task5c.md Critical follow-up).** `SandboxHost.rebuild()` was calling `onChannelsInvalidated()` before `init` was even queued, so once wired its channel `setHostVar` messages would arrive at a sandbox whose `SandboxRuntime` was still `null` and be silently dropped by `sandbox/main.ts`'s no-op handler — the race-safety `OutboundQueue` provides does not by itself guarantee processing order. `rebuildReplay.ts`'s `replayAfterRebuild` is split into `replayInitAndHostVars`/`replaySetCells` so `rebuild()` can call `onChannelsInvalidated()` between them: `init` → JSON host vars → channels → `setCells`.
- **Pan/zoom viewport transforms, settle-bound tile fetch (L6 Task 8).** Gesture frames update a CSS/canvas transform only (P3/P4); the debounced settle callback is the sole caller of `ensureTiles`/`fetchTile` at the re-chosen tier.
- **channel() buffer type fixed to Float64Array (review-task7.md follow-up).** `channelData.ts`'s `ChannelData.v` was `Float32Array`, silently mismatched against `sandbox/main.ts`'s already-landed `materializeHostVar`, which unconditionally reinterprets a received buffer as `Float64Array` — every plotted value would have been garbled once wired. `v` is now `Float64Array` (matching `t` and C1's native `f64` channels); `host/protocol.ts`'s `channelPayload` doc comment now states both buffers' element type explicitly, and `protocol.test.ts` gained a round-trip test proving values survive the exact `new Float64Array(buffer)` reinterpretation `materializeHostVar` performs.
- **Rebuild race and host-var replay fixed (review-task5b.md follow-up).** `SandboxHost.rebuild()` no longer replays `init`/`setCells` synchronously against a not-yet-loaded iframe — the sandbox now sends `ready` unconditionally on load (not gated on `init`), and a pure `OutboundQueue` (generation-tagged, so a stale `ready` can never flush into a newer iframe) holds every outbound message until it arrives. `laps`/`session`/`constants` and any other JSON-kind host variable are now cached and replayed after `init`; channel host variables (whose transferred `ArrayBuffer`s are detached and can't be replayed verbatim) are instead re-derived from the still-in-memory `TileCache` via a new pure driver, `model/channelRebind.ts`'s `rebindChannelsAfterRebuild`, invoked through `SandboxHostCallbacks.onChannelsInvalidated`.
- **Tiles → Plot data, hover from the column region (L6 Task 7).** `tileToChannelData` materialises the sandbox's `channel()` records (an array of `{t, v}`, per the settled C2 §5.1 shape) from transferred buffers; `hoverAt` reads a tile's own column stats — no `cursor_readout`, no IPC on the hover path.
- **Tile tier/cache model (L6 Task 6).** Pure tier selection, point budget (2×pixelWidth desktop), and a byte-tracked (session,channel,tier,index,columnCount) tile LRU with request coalescing. Follow-up (review-task6.md fixes): default byte cap corrected to mirror idl0's documented `ChartTileCache.defaultMaxBytes` (30 MB, `chart_tile_cache.dart:24-25`) instead of an undocumented 64 MiB guess; in-flight fetch coalescing moved from a module-level map into a per-`TileCache`-instance field so two independent caches can no longer resolve into each other's fetch.
- **Sandboxed iframe host (L6 Task 5).** postMessage cell API (host- and sandbox-side message unions, validated on receipt), a watchdog (1000 ms ping / 3000 ms stall), and the sandbox's own Runtime+Plot+d3+Inputs+htl bundle entry, served via `vite.config.ts`'s `notebookSandbox` build entry (R56). `allow-same-origin` never granted. Follow-up (review-task5.md fixes): host variables (`laps`/`session`/`constants`/`channel`) now bind through a pure, unit-tested `bindHostVariables` as reactive `module.variable()`s instead of `module.builtin()`s that silently handed cells a getter function instead of their data; a watchdog-triggered rebuild now replays the last `init`/`setCells` payloads (`replayAfterRebuild`) instead of permanently emptying the notebook.
- **Notebook cell scan (L6 Task 4).** Pure TS fence scan over C2 §2.2/§2.4 giving the editors byte ranges per cell; Rust's parser stays authoritative for evaluation. Follow-up: two review-named tests added (unterminated fence at EOF, invalid `id=` value) and two doc-completeness nits closed in the module doc comment, no production-code change.
- **TS coverage reporting added (2026-09-05).** `@vitest/coverage-v8` pinned to vitest's
  version in `app/package.json`; `app/vitest.config.ts` gains a `coverage` block (v8
  provider, `src/**/*.ts`, text reporter, no thresholds set) so `vitest run --coverage`
  reports the per-module numbers CLAUDE.md §4 asks reviewers to check.
- **plotForm.parse and the round trip (L6 Task 3).** Bidirectional over the C2 §5.3 subset; every custom-code rule in the contract has its own test. Design §10's "plotForm round-trips its subset" holds.
- **plotForm.generate (L6 Task 2).** Emits the C2 §5.3 Plot subset byte-identically for all four of the contract's worked examples.
- **Notebook tab: page becomes a directory (L6 Task 1).** routes/pages/NotebookPage.tsx → routes/pages/Notebook/index.tsx with a re-export shim; no behaviour change.
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

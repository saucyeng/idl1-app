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
- **Device tab, Task 6 (2026-09-05, L7b).** `Device/config/edit.ts` — pure,
  immutable edit operations over `DeviceConfig` (`setImuRate`, `setImuSlot`,
  `setImuAxis`, `setGps`, `setWheelSlot`, `setHrm`, `clearHrm`); none mutates
  its input, checked by deep-equality against a pre-call clone. `ImuForm`,
  `GpsForm` and `WheelForm` edit their slice of the config through those
  operations and show `validateConfig`'s issues for their own paths inline —
  never snapping a value, only reporting it. Every control (ODR list,
  accel/gyro ranges, GPS rate/model/NMEA set) is constrained to Task 3's
  named valid-value sets, so an invalid value can only arrive from a file or
  device, not from pointing at a control. `ChannelsTable.tsx`'s gear control
  now opens the IMU/GPS/Wheel forms; Analog/Digital/HRM stay disabled
  pending Task 7. The four analog/digital channel edit operations
  (`upsertAnalogChannel`, `removeAnalogChannel`, `upsertDigitalChannel`,
  `removeDigitalChannel`) are left entirely to Task 7 — nothing in this
  task's forms calls them, so no signature was guessed here.
  `docs/IDL0_SPEC.md` gains §23.3.1–§23.3.3 describing the three forms.
- **Device tab, Task 5 review follow-up (2026-09-05, L7b).** `sources.ts`'s
  breakdown rows now name the SPEC §5.4 registry channel a user will see
  again in the Data tab and notebook (`WheelFront`/`WheelRear`, `HR_BPM`,
  and the GPS row's six `GPS_Latitude`/`GPS_Longitude`/`GPS_Altitude`/
  `GPS_SpeedKmh`/`GPS_Heading`/`GPS_EpochMs` children) instead of the
  invented `"pulse"`/`"heart_rate"`/`"fix"` strings. `index.tsx` shows a
  visible banner above the config card while `pull_config` is not wired,
  so `defaultConfig("")`'s placeholder values are never mistaken for a
  connected device's real settings. `docs/IDL0_SPEC.md` §23.3 updated with
  both.
- **Device tab, Task 6 review fix (2026-09-05, L7b).** `ImuForm`'s four
  mode-flag/top-level-range controls (`low_power_mode`,
  `high_performance_mode`, `accel_range_g`, `gyro_range_dps`) now commit
  through two new pure `edit.ts` operations, `setImuModeFlags` and
  `setImuRanges`, instead of an inline object-literal spread in the JSX
  handler — closing the review's Important finding and making
  `docs/IDL0_SPEC.md` §23.3.1's "every field commits through `edit.ts`"
  claim true. `ChannelsTable.tsx`'s wrapping `<table>` re-indented one level
  under the sibling `<OpenForm>` fragment (Minor, cosmetic).
- **Ruling R58 (2026-09-05): unassigned pins are representable, no pin
  range is invented (`runs/2026-09-03/decisions.md`).** `AnalogChannel.adc_pin`
  and `DigitalChannel.gpio_pin` are now `number | null`; `null` means
  unassigned. `parseConfig` reads a missing pin key as `null` with no
  `Repair` (a legal draft state); a present non-integer is a `Repair`,
  treated as unassigned rather than a guessed pin number.
  `serializeConfig` omits the key entirely when `null` — the schema has no
  null-pin shape. `validateConfig` reports an unassigned pin as a
  push-blocking error (`isPushable` false); the pin-collision check ignores
  `null` claims entirely (two unassigned channels never "collide"). No pin
  range exists anywhere in `DeviceConfig` or SPEC §8/§3.7, so the app never
  invents one.
- **Device tab, Task 7 (2026-09-05, L7b).** `Device/forms/{AnalogForm,
  DigitalForm,HrmForm,AddChannelPicker}.tsx` and `Device/config/newChannel.ts`
  complete the Device tab's source forms. Analog and Digital each edit one
  channel through new `edit.ts` operations `upsertAnalogChannel`/
  `removeAnalogChannel`/`upsertDigitalChannel`/`removeDigitalChannel` (both
  "add" and "in-place edit" are the same upsert, keyed on the channel's own
  `key`). The ADC/GPIO pin control in both forms is a plain
  non-negative-integer input starting empty when unassigned — never a
  `<select>` — per ruling R58: SPEC §8 states no valid pin range, so the
  app never auto-selects one. HRM's "Search nearby" runs the landed
  `bleScan` (C3 §3.8) and lists every discovered BLE device (no
  service-UUID filter exists in `DeviceDiscovered`, so heart-rate straps
  cannot be singled out — Parity gap, `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`);
  selecting one prefills `device_address`/`device_name` and enables the
  monitor; manual address entry and Forget (`clearHrm`) round out the form.
  `newChannel.ts`'s `newAnalogChannel`/`newDigitalMarker` generate a unique
  `key` (`analog_N`/`marker_N`, never idl0's colliding `"__new__"`) and
  seed SPEC §8's example-shape defaults with an unassigned pin;
  `addChannelOptions` drives `AddChannelPicker`'s four choices (Wheel
  front/rear toggle an existing slot rather than creating an entry; Analog
  channel and Marker button create a new draft). `level`/`pwm` digital
  kinds are never offered (SPEC §8: reserved, not shipped in Spec 1's
  picker). `ChannelsTable.tsx`'s gear control now opens every source's form,
  including analog/digital rows keyed by that row's own channel `key`; a
  "+ Add channel…" button opens the picker. `docs/IDL0_SPEC.md` gains
  §23.3.4–§23.3.6 and a rewritten §23.4 describing the real picker (in
  place of idl0's `kChannelSourceFactories` description), plus a one-line
  "pin input is unconstrained until SPEC §8 states a valid pin range" note
  in both §23.3.4 and §23.3.5 for Isaac.
- **Device tab, Task 8 (2026-09-05, L7b).** `Device/profiles.ts`'s pure
  `profilesReducer` (select/create/rename/duplicate/delete) is an
  **in-memory-for-the-session** profile library — `list_profiles`/
  `save_profile`/`delete_profile` (IPC need 11) are stubs, so `ProfileBar.tsx`
  states plainly, unconditionally, that nothing here survives an app
  restart; `DUPLICATE` deep-copies the source config (`structuredClone`) so
  editing a copy never touches the original. `Device/push.ts`'s
  `preparePush(config)` is the one gate a config passes before
  `PushConfigBar.tsx` calls the real, landed `pushConfig` (C3 §3.8):
  `validateConfig`/`isPushable` first, `serializeConfig` only if pushable —
  never the reverse, the lane's load-bearing invariant. A small pure
  `pushReducer` (idle → pushing → succeeded/failed) keeps one push in
  flight at a time. `pull_config` (IPC need 10) is still a stub, so
  `describePushResult` reports all four idl0 outcomes but every real wave-2
  push lands on "applied, not verified" — no reconnect-and-verify leg
  exists yet. Idle-mode gating (SPEC §10.4) is stated in copy, not
  enforced — `device_status` (IPC need 8) is a stub too, so a device that
  refuses a push in the wrong mode surfaces through `Device/errors.ts`'s
  `describeIpcError` (`kind: "config"`/`"ble"`) rather than being blocked
  in advance. `docs/IDL0_SPEC.md` §23.2 and §23.6 are rewritten for wave 2
  in place of idl0's file-backed-library and `BleService` descriptions.
- **Device tab, Task 7 review-fix (2026-09-05, L7b).** Ruling R58's second
  sentence — "a non-negative-integer input" — is now enforced, not just
  stated: `config/validate.ts`'s `checkAnalogChannels`/`checkDigitalChannels`
  reject a negative or non-integer assigned `adc_pin`/`gpio_pin` with a new
  `"pin must be a non-negative integer"` error (`isPushable` false);
  `AnalogForm`/`DigitalForm`'s `parsePinInput` mirrors the same check
  locally, so typing a negative pin is treated as unassigned rather than
  committed —
  parse leniency (a loaded file's non-integer pin) is unchanged, still a
  `Repair`. `ChannelsTable.tsx`'s carried indentation nit (flagged in Task 6
  and Task 7's reviews, "fix on next touch") is fixed this time.
- **Device tab, errors.ts review-fix (2026-09-05, L7b).** `Device/errors.ts`'s
  `describeIpcError` now appends the device's own rejection reason to a
  `kind: "config"` error's text (C3 §2: that kind's `message` *is* the
  device's stated reason, not Rust-side debug text, so it is safe and
  useful to show) — `"The device rejected the config it was sent: <reason>"`.
  An empty `message` still falls back to the fixed generic sentence, never a
  bare trailing colon.
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

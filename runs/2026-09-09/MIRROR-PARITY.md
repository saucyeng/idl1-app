# Mirror parity audit — `rust/tauri/src/commands/*.rs` vs `app/src/ipc/*.ts`

Date: 2026-09-09. Scope: every `#[tauri::command]` across `app.rs`, `catalog.rs`,
`cursor.rs`, `device.rs`, `import.rs`, `maintenance.rs`, `mod.rs`, `rasters.rs`,
`sync.rs`, `tiles.rs`, `workbook.rs`, and every DTO/enum reachable from their
arguments and return values, checked field by field (name, type, optionality —
`Option<T>` → `T | null` vs `#[serde(skip_serializing_if)]` → `?:` — and enum/
alias vocabulary) against `app/src/ipc/*.ts`.

**Summary.** 58 `#[tauri::command]` handlers exist in Rust. 54 have a
TypeScript `invoke()` wrapper in `app/src/ipc/`; 4 do not (all deliberately
superseded `_v1` commands, see below). Every TS `invoke()` call name matches a
real Rust command (no dead TS mirrors). Field-by-field comparison of every
DTO found only one true mismatch (a doc-comment contradiction, no wire-byte
effect) and one harmless `accepts-more` literal-union looseness. The two
previously-known-and-fixed items (`SpectrogramParams.scaling`/
`RasterMeta.magnitude_unit`'s deliberate `"magnitude"` alias, and
`CellDefResult`'s `unit`/`unit_notes`/`sample_rate_hz`) are confirmed correct
and are not re-reported below. This surface is in much better shape than the
"two lanes independently tripped over a stale mirror" framing suggested —
the stale-mirror risk here is almost entirely the *absence* of a wrapper for
a deprecated command, not silent field drift.

## Mismatches (ranked, worst first)

| # | Severity | TS | Rust | What differs |
|---|----------|----|------|---------------|
| 1 | `cosmetic` | `app/src/ipc/workbook.ts:141` `RenamedFunction.line` doc: *"u32, the 0-based line within `cell_id`..."* | `rust/tauri/src/commands/workbook.rs:236` `RenamedFunction.line` doc: *"u32, 1-based."*, sourced from `rust/core/src/math/alias.rs:340-341` (*"1-based line number"*) | The TS doc comment asserts 0-based indexing; the Rust DTO and the core type it mirrors are both 1-based. The wire value itself is unaffected (it's the same `u32` either way) — this is a documentation contradiction, not a serialization bug. No current UI code (`MigrationBanner.tsx`, `migrationNotice.ts`) indexes anything with `.line`, so it has no live effect today, but a future consumer trusting the TS doc would be off by one. |
| 2 | `accepts-more` | `app/src/ipc/device.ts:206` `RegistryRow.data_type: "i16" \| "i32" \| "u8" \| "u16" \| "u32"` | `rust/core/src/parse/registry_preview.rs` only ever constructs `"i16"`, `"u8"`, `"u16"`, `"u32"` (no `"i32"` construction site found) | TS union is a strict superset of what the encoder actually emits today. Harmless (never causes a runtime `undefined`), and plausibly deliberate future-proofing for a not-yet-added row kind, matching the `accepts-more` policy the two known-fixed raster items already set a precedent for. |

No `runtime-wrong` or `accepts-less` mismatches were found in any of the 54
mirrored commands' argument names (Tauri's snake_case→camelCase JS-arg
convention is honoured correctly everywhere, including multi-word names like
`fetch_host_channel_v2`'s `workbookId`/`defName`), field names, `Option<T>` →
`| null` optionality, or enum/`#[serde(alias)]` vocabularies (`SdState`,
`GpsState`, `ImuState`, `LapTiming`, `UnitLabel`, `WindowEval`'s untagged
union, `ScalingToken`'s `"magnitude"` alias, `SourceFormat`, `channel_kind`,
`AppSettings.unit_system`, `DeviceControlCommand`, etc. all checked and
correct).

## Commands with no TypeScript mirror

All four are `_v1` commands the Rust side keeps registered "deprecated for
one revision" (each says so in its own doc comment) after a `_v2`/window-based
replacement landed; the app only ever calls the `_v2` form. None of these are
newly-discovered drift — they read as intentional, but are listed because the
task asked for every no-mirror command:

- **`eval_workbook`** (`workbook.rs:1051`) — superseded by `eval_workbook_v2` (ruling R117.3). No `evalWorkbook()` wrapper exists in `workbook.ts`.
- **`fetch_fft`** (`rasters.rs:573`) — superseded by `fetch_fft_v2`. No `fetchFft()` wrapper exists in `rasters.ts` (only `fetchFftV2`/`decodeFft`).
- **`fetch_host_channel`** (`workbook.rs:1082`) — superseded by `fetch_host_channel_v2` (ruling R117.7). No `fetchHostChannel()` wrapper in `workbook.ts` (only `fetchHostChannelV2`).
- **`set_sync_device_name`** (`sync.rs:199`) — added post-sign (ruling R105, L11 Task 13). **This one is different in kind**: there is no `_v1` predecessor it supersedes, and no UI code anywhere calls it or a renamed equivalent (`grep` for `set_sync_device_name`/`setSyncDeviceName` across `app/src/` returns nothing, and there is no device-rename control under `Settings`). If the device-rename feature is meant to exist in wave 2's UI, its IPC wrapper was simply never written — worth a one-line flag to whichever lane owns the Settings/Sync UI, since this is the one case in the whole surface where a real, non-deprecated command has zero client-side reachability.

## TypeScript mirrors with no Rust counterpart

None. Every `invoke(...)` call across `app/src/ipc/*.ts` names a real
`#[tauri::command]`.

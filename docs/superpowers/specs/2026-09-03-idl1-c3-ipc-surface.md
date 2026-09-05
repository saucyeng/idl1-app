# C3 — IPC surface

**Status:** signed (lead) 2026-09-02 · **Date:** 2026-09-03 · **Owner:** lead

Consumes: design doc §4 (IPC, data path for a chart, the reactive DAG), §6
(interaction rules), §9 row C3, §10 (lanes); Task 5's M0 smoke commands
(`engine_version`, `smoke_tile` — both superseded here); `TransportError` /
`TransportErrorKind` (`rust/transport/src/error.rs`); core error enums under
`rust/core/src` (`ParseError`, `MathEvalErrorKind`, `ConfigErrorKind`,
`ExportError`, `FitExportError`); the existing tile decimation
(`rust/core/src/chart_decimation.rs`).

---

## 1. Conventions

**Naming.** Every command is a `snake_case` verb-first name registered in
`idl-rs-tauri`'s `handler()` (`rust/tauri/src/lib.rs`), e.g. `fetch_tile`,
`list_sessions`, `push_config`. Arguments are passed as named Tauri command
parameters (Rust `fn foo(a: A, b: B) -> ...`), not one wrapped object — this
is the pattern Task 5 already shipped (`engine_version()`, `smoke_tile(n:
u32)`) and this contract keeps it.

**Transport per payload shape:**
- **Control and metadata** (small structs, lists, status) cross as JSON:
  Rust `Result<T, IpcError>` where `T: Serialize`; Tauri's default IPC
  serializes `Ok`/`Err` to the frontend, which sees a resolved or rejected
  `Promise`.
- **Heavy arrays** (tiles, rasters) cross as raw bytes via
  `tauri::ipc::Response`, never as a JSON array of numbers. The frontend
  receives an `ArrayBuffer` and views it with a typed array
  (`Float32Array`/`Uint8Array`) with no copy — the pattern proven in Task 5's
  `decodeTile`. Because a `Response`-returning command cannot also return a
  typed `Err`, every binary command validates its arguments and existence
  checks *before* choosing to return `Response`; on failure it must still
  reject with the JSON `IpcError` shape (Tauri supports `Result<Response,
  IpcError>` — the `Ok` arm is binary, the `Err` arm is JSON, exactly as
  `Result<T, E>` normally works. This is not a special case; it only reads
  like one because `T` happens to be `Response`.)
- **Progress and event streams** cross over `tauri::ipc::Channel<Progress>`
  (or another named payload type — `DeviceDiscovered`, `WorkbookEvent`, both
  §3). The frontend passes a `Channel` object as a command argument; the
  backend calls `channel.send(payload)` zero or more times before the
  command's own `Result` resolves once, at the end.

**`Progress` (defined once, referenced everywhere below):**
```ts
interface Progress {
  /** Units completed so far. Meaning is phase-specific: bytes for a file
   *  download, records for an import, cells for a workbook (re)evaluation. */
  done: number;   // u64 on the Rust side
  /** Units expected in total, or null when not known ahead of time (e.g. a
   *  BLE transfer whose size the device hasn't reported yet). Same unit as `done`. */
  total: number | null;   // u64 | None
  /** Short machine-readable phase name, e.g. "reading", "decoding", "indexing". Not localized. */
  phase: string;
}
```

**JSON field naming.** All JSON payload fields (requests, responses,
`IpcError`) are `snake_case`, matching the Rust struct field names verbatim —
no camelCase rename layer. This is the precedent `TransportError` already
set (`{"kind":"wifi","message":"timeout"}`, `rust/transport/src/error.rs`
tests); TS interfaces below use the same keys so there is nothing to
translate at the boundary.

**Frontend wrapper modules.** One TS module per command group under
`app/src/ipc/`: `engine.ts`, `catalog.ts`, `import.ts`, `workbook.ts`,
`tiles.ts`, `rasters.ts`, `cursor.ts`, `device.ts`, `sync.ts`. Each wraps
`invoke()` (and `Channel` construction where relevant) behind the typed
function signatures in §3. These modules are the *only* place in `app/src`
allowed to import `@tauri-apps/api/core` (CLAUDE.md's "the frontend never
imports anything that isn't `idl-rs-tauri` commands or bundled JS libraries"
— the wrapper is how that rule is enforced in one place).

---

## 2. Error shape

One JSON error crosses every command that can fail:

```ts
interface IpcError {
  /** Machine-readable failure class. Frontend code routes on this string,
   *  never on `message`. See the kind table below for the full vocabulary. */
  kind: string;
  /** Human-readable text. No stack traces (CLAUDE.md §5). */
  message: string;
  /** Optional structured detail, shape depends on `kind` (e.g. `{ "channel":
   *  "fork_travel" }` for `not_found` from a missing channel). Absent when
   *  there is nothing structured to add. */
  detail?: Record<string, unknown>;
}
```

Rust side: `IpcError { kind: IpcErrorKind, message: String, detail: Option<serde_json::Value> }`,
`#[derive(Serialize)]`, and `IpcErrorKind` is a `#[serde(rename_all =
"snake_case")]` enum whose variants are exactly the rows of the table below.
Every fallible command returns `Result<T, IpcError>`; there is no
`Err(String)` anywhere on the IPC boundary (CLAUDE.md §5).

**Folding rule.** Several core enums carry an `Io(...)` (or equivalent)
variant meaning "the filesystem read/write failed." These are folded into
one generic `io` kind rather than duplicated per source enum — the frontend
does not need to know *which* Rust module hit the I/O error, only that it
did. `ExportError::Json` (a serialization bug, not a user-actionable
condition) is folded into `internal` for the same reason. This is stated
once here rather than repeated per row.

**Kind vocabulary** — the union of every core error enum's non-folded
variants (`snake_case`) plus two fixed, unprefixed groups. The naming rule
is applied uniformly, not case-by-case:
- Every variant sourced from a **core error enum** is prefixed with that
  enum's domain (`parse_*` from `ParseError`, `math_*` from
  `MathEvalErrorKind`, `config_*` from `ConfigErrorKind`, `export_*` from
  `ExportError`/`FitExportError`) — always, including variants that do not
  currently collide with anything (`math_unknown_function`,
  `parse_invalid_magic_bytes`, …). A stable, predictable prefix per source
  means a *new* enum, or a new variant on an existing one, can never force
  a rename of an existing kind to avoid a collision — the alternative
  (prefix only where a collision exists today) would make the vocabulary's
  spelling depend on which enums happen to coexist at a given moment.
- The four **`TransportErrorKind`** values (`ble`, `wifi`, `config`,
  `sync`) are unprefixed by design: they are already domain-named nouns,
  and Task 2 shipped and tested their exact JSON spelling
  (`{"kind":"wifi",...}`) before this contract existed — prefixing them
  would break a committed contract for no benefit.
- The four **cross-cutting kinds** (`not_found`, `invalid_argument`, `io`,
  `internal`) are unprefixed by design: they are not sourced from any one
  enum, so there is no domain to prefix with.
- **`conflict`** — *added post-sign (2026-09-04, lead ruling R44).* A fifth
  cross-cutting kind, raised when an optimistic concurrency check fails:
  `store::atomic`'s `RenameConflict`, i.e. the file on disk is no longer the
  version the caller based its edit on. It is deliberately not folded into
  `invalid_argument`, which means "the caller made a programming error": a
  conflict is neither the caller's fault nor a bug, it is a recoverable
  condition the UI must present differently ("this file changed elsewhere —
  reload?" rather than an error toast). `detail` carries `{ expected, found }`.
  Raised by: Workbook (`save_workbook`).

| `kind` | Source | Raised by (command group) |
|---|---|---|
| `ble` | `TransportErrorKind::Ble` | Device: `ble_scan`, `ble_connect`, `list_device_files`, `download_file`, `push_config` |
| `wifi` | `TransportErrorKind::Wifi` | Device: `list_device_files`, `download_file`, `push_config` |
| `config` | `TransportErrorKind::Config` | Device: `push_config` (device rejected or malformed the pushed config over the wire) |
| `sync` | `TransportErrorKind::Sync` | Sync: `sync_status`, `sync_now`, `pair_peer` |
| `parse_invalid_magic_bytes` | `ParseError::InvalidMagicBytes` | Import: `import_file` (`.idl0` source) |
| `parse_unsupported_schema_version` | `ParseError::UnsupportedSchemaVersion` | Import: `import_file` (`.idl0` source) |
| `parse_truncated_record` | `ParseError::TruncatedRecord` | Import: `import_file` (`.idl0` source, corrupt/incomplete file — recover what's readable per CLAUDE.md §5, surface as a warning in the returned `SessionSummary` rather than always rejecting; see open question 6.2) |
| `import_fit_malformed` | `ImporterError::FitMalformed` | Import: `import_file` (`.fit` source — CRC failure, no usable `record` messages, or `fitparser` rejected the stream) |
| `import_gpx_malformed_xml` | `ImporterError::GpxMalformedXml` | Import: `import_file` (`.gpx` source, not well-formed XML) |
| `import_gpx_no_trackpoints` | `ImporterError::GpxNoTrackpoints` | Import: `import_file` (`.gpx` source, no `<trkpt>` elements) |
| `import_gpx_missing_lat_lon` | `ImporterError::GpxMissingLatLon` | Import: `import_file` (`.gpx` source, a `<trkpt>` missing `lat`/`lon`) |
| `import_gpx_unparseable_lat_lon` | `ImporterError::GpxUnparseableLatLon` | Import: `import_file` (`.gpx` source, a `<trkpt>`'s `lat`/`lon` isn't a parseable number) |
| `import_csv_malformed` | `ImporterError::CsvMalformed` | Import: `import_file` (`.csv` source, missing/malformed header or no data rows) |
| `import_not_utf8` | `ImporterError::NotUtf8` | Import: `import_file` (`.gpx`/`.csv` source, bytes aren't valid UTF-8 — never raised for `.fit`, which is binary) |
| `workbook_missing_front_matter_id` | `WorkbookErrorKind::MissingFrontMatterId` | Workbook: `open_workbook`, `eval_workbook` (fatal — no `WorkbookDoc` is constructable without a valid `id`, C2 §3.5.A) |
| `workbook_unsupported_version` | `WorkbookErrorKind::UnsupportedWorkbookVersion` | Workbook: `open_workbook`, `eval_workbook` (fatal — explicit `version` ≠ `3`, C2 §1) |
| `workbook_invalid_front_matter` | `WorkbookErrorKind::InvalidFrontMatter` | Workbook: `open_workbook`, `eval_workbook` (fatal — the front-matter block is not valid YAML, C2 §3.5.A) |
| `workbook_invalid_cell_id` | `WorkbookErrorKind::InvalidCellId` | Workbook: `open_workbook`, `eval_workbook` (fatal — a fence's `id=` value doesn't match `hex8`, C2 §2.2/§3.5.A) |
| `workbook_invalid_table_json` | `WorkbookErrorKind::InvalidTableJson` | Workbook: `eval_workbook` — surfaced **per cell** in `CellOutput.error`, not as the command's own rejection (same per-cell rule as `math_*` above, C2 §3.5.A) |
| `workbook_duplicate_cell_id`, `workbook_duplicate_definition`, `workbook_duplicate_constant`, `workbook_invalid_identifier`, `workbook_reserved_name` | `WorkbookErrorKind::{DuplicateCellId, DuplicateDefinition, DuplicateConstant, InvalidIdentifier, ReservedName}` | Workbook: `eval_workbook` — **per cell only**, in `CellOutput.errors`; never a command rejection (C2 §3.5.A, R7/R22) |
| `math_parse` | `MathEvalErrorKind::Parse` | Workbook: `eval_workbook` — surfaced **per cell** in `CellOutput.error`, not as the command's own rejection (CLAUDE.md §5: "missing math channel reference → inline validation error, don't block other channels") |
| `math_unknown_function` | `MathEvalErrorKind::UnknownFunction` | Workbook: `eval_workbook` (per cell) |
| `math_unknown_channel` | `MathEvalErrorKind::UnknownChannel` | Workbook: `eval_workbook` (per cell) |
| `math_arg_count` | `MathEvalErrorKind::ArgCount` | Workbook: `eval_workbook` (per cell) |
| `math_type` | `MathEvalErrorKind::Type` | Workbook: `eval_workbook` (per cell) |
| `math_division_by_zero` | `MathEvalErrorKind::DivisionByZero` | Workbook: `eval_workbook` (per cell) |
| `math_no_lap_context` | `MathEvalErrorKind::NoLapContext` | Workbook: `eval_workbook` (per cell) |
| `math_not_implemented` | `MathEvalErrorKind::NotImplemented` | Workbook: `eval_workbook` (per cell) |
| `math_runtime` | `MathEvalErrorKind::Runtime` | Workbook: `eval_workbook` (per cell) |
| `config_parse` | `ConfigErrorKind::Parse` | Device: `push_config` (local validation of the config JSON before transmission) |
| `config_unsupported_version` | `ConfigErrorKind::UnsupportedVersion` | Device: `push_config` |
| `export_unknown_channel` | `ExportError::UnknownChannel` | none in C3 v1 — see open question 6.1 |
| `export_no_gps_data` | `FitExportError::NoGpsData` | none in C3 v1 — see open question 6.1 |
| `not_found` | cross-cutting | Catalog: `get_session`, `list_laps`; Workbook: `open_workbook`, `eval_workbook`, `save_workbook`, `watch_workbook`; Tiles: `fetch_tile`; Rasters: `fetch_raster`; Cursor: `cursor_readout`; Device: `download_file`; Sync: `sync_now`, `pair_peer`; Import: `import_file` (source path missing) |
| `invalid_argument` | cross-cutting | Import: `import_file` (unknown `importer_id`); Workbook: `save_workbook` (malformed markdown/front matter); Tiles: `fetch_tile` (`tier` outside the engine's configured tier set); Rasters: `fetch_raster` (bad `width`/`height`/`kind`); Cursor: `cursor_readout` (unknown channel in the list); Sync: `pair_peer` (malformed code) |
| `io` | cross-cutting (also folds `ParseError::Io`, `ConfigErrorKind::Io`, `ExportError::Io`, `FitExportError::Io`) | any command that touches the filesystem: Catalog (all seven — `list_sessions`, `get_session`, `list_laps`, `rebuild_catalog`, `list_workbooks`, `list_tracks`, `get_track`), Import: `import_file`, Workbook (`open_workbook`, `save_workbook`, `watch_workbook`), Tiles: `fetch_tile`, Rasters: `fetch_raster`, Device: `download_file`, Sync: `sync_status` |
| `internal` | cross-cutting (also folds `ExportError::Json`) | any command — unexpected/programmer-error conditions that are not the caller's fault |

**Added post-sign (2026-09-03, lead ruling R7, wave-1 L2).** The seven
`import_*` rows above are new: `ImporterError` (`rust/core/src/import/error.rs`,
L2) is a new core error enum for the FIT/GPX/CSV importers, prefixed
`import_*` per this section's own naming rule — matching the `import_file`
command group's name (§3.3), distinct from `parse_*` (`ParseError`,
`.idl0`-only, unchanged). §2's original table had no rows for these variants
because L2 hadn't been drafted when C3 was signed.

**Added post-sign (2026-09-04, lead ruling R21, wave-1 L3).** The five
`workbook_*` rows above are new: `WorkbookErrorKind`
(`rust/core/src/workbook/v3/error.rs`, C2 §3.5.A) is workbook v3's
parse-time/structural error enum, prefixed `workbook_*` per this section's
own naming rule — matching the `open_workbook`/`eval_workbook` command
names, distinct from `math_*` (`MathEvalErrorKind`, evaluation-time,
unchanged). Only these five of C2 §3.5.A's ten structural kinds get a row
here: `MissingFrontMatterId`, `UnsupportedWorkbookVersion`,
`InvalidFrontMatter` and `InvalidCellId` are document-fatal (no
`WorkbookDoc` at all); `InvalidTableJson` is per-cell but new this batch.
The other five (`DuplicateCellId`, `DuplicateDefinition`,
`DuplicateConstant`, `InvalidIdentifier`, `ReservedName`) have
`IpcErrorKind` variants too (one row above) so a per-cell
`CellOutput.errors` entry is always a real serializable kind; they are
never a command-level rejection (R22).

`VideoErrorKind` (`rust/core/src/video/mod.rs`) is **excluded** from this
vocabulary: `core/src/video/` and `core/src/overlay/` are deleted on the
idl1 line (design doc D9, M0 Task 2 Step 4) and no command in §3 exposes
video/overlay functionality. If reels return (D9's "later"), that work adds
its own command group and its own contract revision (§5); it does not
resurrect this kind silently.

---

## 3. Commands

### 3.1 Engine

**`engine_version()`**
Args: none. Return: `string` — `idl_rs::VERSION`. Never fails (no `Result`).
Implemented: M0 Task 5 (already shipped; unchanged by this contract).

### 3.2 Catalog (L1)

**`list_sessions()`**
Args: none.
Return: `SessionSummary[]` — mirrors the catalog `sessions` table (C4 §5)
column for column; nullable columns are `T | null`. Two fields the previous
draft carried (`duration_s`, `channel_count`) had no catalog column to
source them from and are dropped here — see §6 item 3's resolution note.
```ts
interface SessionSummary {
  session_id: string;
  blob_sha256: string;             // hex-encoded, lowercase, 64 chars (C4 §5 sessions.blob_sha256)
  source_format: "idl0" | "fit" | "gpx" | "csv";   // file-level: which importer produced this
                                                     // session — C1 §2 `Session.source_format`,
                                                     // C4 §5 sessions.source_format (post-sign
                                                     // rename from `source_kind`, which C1 reserves
                                                     // for the channel-level field — see `ChannelSummary`)
  device_id: string | null;        // null for FIT/GPX/CSV sources (no device) — C1 §2
  config_checksum: string | null;  // null for FIT/GPX/CSV sources — C1 §2
  importer_version: string;        // SemVer 2.0.0, e.g. "0.1.0" (C1 §4.3)
  seam_correction_version: string; // e.g. "v1", §3.3's algorithm version (C1 §4.3)
  engine_version: string;          // SemVer 2.0.0, `idl-rs` core `CARGO_PKG_VERSION` (C1 §4.3)
  timestamp_utc_ms: number;        // i64, session start, Unix epoch milliseconds; 0 = unknown (C1 §3.1)
  created_at_ms: number;           // i64, catalog row insert time (import time)
  rider: string;                   // "" = not set (C4 §5 sessions.rider default)
  bike: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  short_comment: string;
  tag: string;
  lap_count: number | null;        // u32 | null — null until laps are indexed for this session;
                                    // counts the same rows `list_laps` returns (round 2)
  duration_ms: number | null;      // i64 milliseconds | null — RENAMED from `duration_s` (was f64
                                    // seconds); the catalog column is nullable integer milliseconds
}
```
Errors: `io`, `internal`.

**`get_session(session_id: string)`**
Return: `SessionDetail` — C1 `Session` metadata (§2) plus `session.json`
content (§6). This does **not** extend `SessionSummary`: the catalog row is
a fast, possibly-stale cache of a subset of these same values (C4 §5,
"nothing reads the catalog for truth" — `get_session` reads the canonical
files directly, not the catalog). `importer_version`/`seam_correction_version`/
`engine_version` are catalog facts about `data.parquet` (C1 §4.3), not part of
`Session` or `session.json` — they live on `SessionSummary` only; `get_session`
reads canonical files, not file metadata, so `SessionDetail` does not carry them.
```ts
interface SessionDetail {
  // --- C1 §2 `Session` ---
  session_id: string;
  device_id: string | null;        // null for FIT/GPX/CSV sources — C1 §2
  timestamp_utc_ms: number;        // i64, session start, Unix epoch ms; 0 = unknown — C1 §3.1
  config_checksum: string | null;  // null for FIT/GPX/CSV sources — C1 §2
  source_format: "idl0" | "fit" | "gpx" | "csv";   // C1 `SourceFormat`, lowercase — C1 §2/§4.3;
                                                     // file-level, same field as `SessionSummary.source_format`
  blob_sha256: string;             // hex-encoded, lowercase, 64 chars — C1 §2
  channels: ChannelSummary[];

  // --- session.json (C1 §6) — SessionMetadata carry-forward ---
  rider: string;                   // "" = not set, no null representation (C1 §6)
  bike: string;
  bike_comment: string;
  venue_name: string;
  event_name: string;
  event_session: string;
  short_comment: string;
  long_comment: string;
  tag: string;
  bike_profile_snapshot: Record<string, unknown> | null;   // verbatim BikeProfile.config at
                                                              // recording time (C1 §6)

  // --- session.json (C1 §6) — laps, track visits, lap flags ---
  laps: LapDetail[];                     // session.json's own laps[] — see `LapDetail` below;
                                          // NOT `LapSummary` (that is the catalog's cached shape,
                                          // returned only by `list_laps` — round 2 correction)
  track_visits: TrackVisitSummary[];
  reference_lap_number: number | null;   // null/omitted = "use fastest lap" (C1 §6)
  ignored_lap_numbers: number[];         // sorted ascending (C1 §6)
  main_lap_number: number | null;
  overlay_lap_key: { session_id: string; lap_number: number } | null;
  starred_lap_number: number | null;
  track_visits_library_hash: string | null;   // opaque, do not parse (C1 §6) — NEW (round 2)
}
/** Mirrors C1 §6 `session.json`'s `laps[]` object field for field — the
 *  file-native lap shape, distinct from `LapSummary`'s catalog shape. */
interface LapDetail {
  lap_number: number;              // int, 1-based (C1 §6 laps[].lap_number)
  start_timestamp_ms: number;      // i64, UTC ms
  end_timestamp_ms: number;        // i64, UTC ms
  raw_elapsed_ms: number;          // i64, ms — end_timestamp_ms - start_timestamp_ms
  lap_time_ms: number;             // i64, ms — raw_elapsed_ms minus neutral-zone time
  start_time_secs: number;         // f64, seconds, recording-time (t=0-anchored)
  end_time_secs: number;           // f64, seconds
  sectors: unknown[];               // present when sector_gates is non-empty; C1 §6 does not fix
                                     // the element shape beyond "array" — see open question 11
  neutral_zone_visits: unknown[];   // C1 §6 does not fix the element shape beyond "array" —
                                     // see open question 11
}
interface TrackVisitSummary {
  visit_id: string;                // UUID (C1 §6 track_visits[].visit_id)
  track_id: string;                // UUID
  start_timestamp_ms: number;      // i64, UTC ms
  end_timestamp_ms: number;        // i64, UTC ms, always >= start_timestamp_ms
  laps: LapDetail[];                // C1 §6 track_visits[].laps, "same shape as top-level laps,
                                     // omitted when empty" — NEW (round 2); `[]` when C1's
                                     // session.json omits the key
}
interface ChannelSummary {
  channel_id: string;
  nominal_rate_hz: number;         // f64, metadata only — never used to synthesize time (C1 §3.5)
  unit: string;                    // C1 §4.1's per-channel unit
  source_kind: string;             // channel-level: which sensor this channel came from — C1 §4.2
                                    // token, e.g. "imu0", "gps", "fit", "gpx" — NEW. Distinct from
                                    // the file-level `source_format` (`SessionSummary`/`SessionDetail`)
  channel_kind: "fixed-rate" | "event";   // C1 §4.2; "event" iff nominal_rate_hz == 0.0 — NEW
  sample_count: number;            // u64
}
```
Errors: `not_found`, `io`, `internal`.

**`list_laps(session_id: string)`** — NEW (round 2). Catalog-backed (lane
L1): mirrors C4 §5's `laps` + `lap_summary` tables, column for column, per
`SessionDetail.laps`/`LapDetail` above being sourced from `session.json`
instead. `SessionSummary.lap_count` counts the same rows this command
returns.
Return: `LapSummary[]`
```ts
interface LapSummary {
  lap_number: number;              // i32, 1-based — RENAMED from `lap_index` (was u32, 0-based);
                                    // matches C1 §6 session.json laps[].lap_number and C4 §5 laps.lap_number
  lap_time_ms: number;             // i64 ms (C4 §5 laps.lap_time_ms)
  track_id: string | null;         // C4 §5 laps.track_id — null if this lap isn't attributed to a track
  channel_stats: LapChannelStat[]; // C4 §5 lap_summary rows for this (session, lap) — NEW; replaces
                                    // the previous draft's `start_t_us`/`end_t_us`/`distance_m`, none
                                    // of which the catalog stores (see §6 item 3's resolution note)
}
interface LapChannelStat {
  channel_id: string;              // materialised channel name (C4 §5 lap_summary.channel_id)
  derived_hash: string;            // 64-hex — which derived/<hash>.parquet this was computed from
  min_value: number;
  max_value: number;
  mean_value: number;
}
```
Errors: `not_found`, `io`, `internal`.

**`rebuild_catalog()`**
Args: none.
Return:
```ts
interface RebuildReport {
  sessions_indexed: number;   // u32
  workbooks_indexed: number;  // u32
  tracks_indexed: number;     // u32
  duration_ms: number;        // u64, wall-clock time the rebuild took
}
```
Errors: `io`, `internal`.

**`list_workbooks()`**
Args: none.
Return: `WorkbookSummary[]` — mirrors the catalog `workbooks` table (C4 §5)
column for column.
```ts
interface WorkbookSummary {
  workbook_id: string;    // stable id from front matter (C2) — RENAMED from `id`
  file_name: string;       // RENAMED from `path`. C4 §5 workbooks.file_name: the bare,
                            // filesystem-sanitised display name used as `workbooks/<file_name>.idl1wb`
                            // (C4 §2) — not a path relative to `workbooks/` as the previous draft said
  name: string;             // display name from front matter (C2)
  updated_at_ms: number;    // i64, file mtime — RENAMED from `updated_utc_ms`
  size_bytes: number;       // u64 — NEW (C4 §5 workbooks.size_bytes)
}
```
Errors: `io`, `internal`.

**`list_tracks()`**
Args: none.
Return: `TrackSummary[]` — the catalog `tracks` table's (C4 §5) scalar
columns only, excluding `full_json` (§6 item 7: a list command does not
ship the full per-track artifact on every row; `get_track` below returns
it). `length_m` (the previous draft's only field beyond `track_id`/`name`)
is **dropped**: no Track field (IDL0_SPEC §16.2) or catalog column stores a
track length, so it had no source to reconcile against — see §6 item 3's
resolution note.
```ts
interface TrackSummary {
  track_id: string;
  name: string;
  venue_name: string;    // NEW (C4 §5 tracks.venue_name)
  created_at_ms: number; // i64 — NEW
  updated_at_ms: number; // i64 — NEW
}
```
Errors: `io`, `internal`.

**`get_track(track_id: string)`**
Return: `TrackDetail` — the full `.idl0t` artifact content, the engine's
`track_artifact::model::Track` (`idl-rs` core) serialised. Never on a hot
path (§4) — called on explicit track-detail open, settle-bound like
`get_session`.
```ts
interface TrackDetail {
  track_id: string;
  name: string;
  venue_name: string;
  created_at_ms: number;        // i64
  updated_at_ms: number;        // i64
  lap_timing: unknown | null;   // sealed union (`Circuit` | `PointToPoint`, IDL0_SPEC §16.2a) —
                                 // exact serde tagging not yet fixed by any contract; see open question 10
  neutral_zones: unknown[];     // `NeutralZone[]`, IDL0_SPEC §16.2b — field shape not yet fixed; see open question 10
  sector_gates: unknown[];      // `SectorGate[]` — field shape not yet fixed; see open question 10
  reference_polyline: unknown[]; // `GpsFix[]` — field shape not yet fixed; see open question 10
}
```
Errors: `not_found`, `io`, `internal`.

### 3.3 Import (L2)

**`import_file(path: string, importer_id: string | null, progress: Channel<Progress>)`**
`importer_id` is `null` for extension-based auto-detection, or one of the
ids `list_importers` returns to force a specific importer.
Streams `Progress` (`phase` values e.g. `"reading"`, `"decoding"`,
`"materializing"`) then resolves with:
Return: `SessionSummary` (§3.2).
Errors: `not_found` (path missing), `invalid_argument` (unrecognised
`importer_id`), `parse_invalid_magic_bytes`, `parse_unsupported_schema_version`,
`parse_truncated_record` (`.idl0` sources only), `io`, `internal`.

**`list_importers()`**
Args: none.
Return: `ImporterInfo[]`
```ts
interface ImporterInfo {
  id: string;             // e.g. "idl0", "fit", "gpx", "csv"
  label: string;           // human-readable, e.g. "IDL0 log"
  extensions: string[];    // e.g. [".idl0"]
}
```
Errors: `internal`.

### 3.4 Workbook (L3)

**`open_workbook(id_or_path: string)`**
Return:
```ts
interface WorkbookHandle {
  id: string;
  name: string;
  path: string;
  cell_count: number;   // u32
}
```
Errors: `not_found`, `io`, `internal`, `workbook_missing_front_matter_id`,
`workbook_unsupported_version`, `workbook_invalid_front_matter`,
`workbook_invalid_cell_id` — *added post-sign (2026-09-04, lead ruling
R21)*: opening a document whose front matter or cell ids are malformed
enough that no `WorkbookDoc` can be built now rejects with the specific
`workbook_*` kind (§2) instead of failing some other, less informative way.

**`eval_workbook(id: string, session_id: string | null)`**
*`session_id` added post-sign (2026-09-04, lead ruling R41).* `eval_cells`
requires a channel lookup and a lap context; the original signature supplied
neither, and C2 deliberately has no front-matter session binding — the active
session is a UI selection, not a property of the file ("the workbook is a file;
the app is a live viewer of it"). `null` means no session is bound: the command
evaluates against an empty `SessionHandle` and `MathLapContext::empty()`, so
`[Channel]` references surface as per-cell `math_unknown_channel` rather than
the whole command failing. When a session IS bound, wave-1 lap context comes
from that session's `session.json` `laps[]`.
Return: `CellOutput[]`, one entry per cell, in document order.
```ts
interface CellOutput {
  cell_id: string;                          // C2 fence-string id
  kind: "math" | "table" | "js";             // "prose" removed — added post-sign (2026-09-04, lead ruling R21): prose has no fence id (C2 §2.1) and never gets its own CellOutput entry; it travels as prose_before/prose_after (C2 §2.4) on the fenced cell it's attached to
  value: unknown | null;                     // present when evaluation succeeded; shape depends on `kind` — see the `table` note below
  defs: CellDefResult[];                     // added post-sign (2026-09-04, lead ruling R21) — math cells only: one entry per definition (C2 §5.1's "one JS host variable per math definition"), in def_line source order; empty for table/js cells
  errors: IpcError[];                        // added post-sign (2026-09-04, lead ruling R22): plural — a cell may carry several structural problems (e.g. two duplicate definitions); empty on success; each kind is a structural (workbook_*) or evaluation (math_*) kind — see §2
}

// Added post-sign (2026-09-04, lead ruling R21).
interface CellDefResult {
  name: string;
  label: string | null;
  value: HostChannelRef | null;   // added post-sign (2026-09-04, lead ruling R22): the light wire marker { length: number /* u32 */, has_t: boolean } — the full {length, t, v} HostChannel stays in-process (core); sample bytes cross via the binary command assigned to L5 in the host-channel byte-path note below §3.4
  error: IpcError | null;      // math_* kind only — a structural problem on this definition (e.g. ReservedName) keeps it out of `defs` entirely and is reported, if anywhere, on the cell's own `error` above (R22)
}
interface HostChannelRef { length: number; has_t: boolean; }
```
A `table` cell's `value` on success is
`{ model: TableModel, results: CellResult[][] }` (added post-sign,
2026-09-04, lead ruling R21) — `model` is the parsed `TableModel` (§4) and
`results` is `idl_rs::table::eval::evaluate_table`'s `Vec<Vec<CellResult>>`
grid verbatim (`CellResult = { value: number | null, error: string | null
}`), indexed `results[r][c]` exactly as C2 §4's `cells[r][c]`. This closes
the gap where a successful table cell and a silently-skipped one
serialized identically (`value: null` either way).

A per-cell failure (`math_*` or `workbook_*` kind) never rejects the
command — it appears in that cell's `errors` list, or in a specific
definition's own `defs[i].error` for a per-definition evaluation problem.
The command itself only rejects for a condition that makes *no* cell
evaluable: an unknown workbook id, an I/O failure reading the file, or —
added post-sign — a document-fatal structural problem (`workbook_missing_
front_matter_id`, `workbook_unsupported_version`, `workbook_invalid_front_
matter`, `workbook_invalid_cell_id`, §2) that means no `WorkbookDoc` exists
to produce any `CellOutput` at all.
Errors (command-level): `not_found`, `io`, `internal`,
`workbook_missing_front_matter_id`, `workbook_unsupported_version`,
`workbook_invalid_front_matter`, `workbook_invalid_cell_id`.

**`save_workbook(id: string, markdown: string, based_on_hash: string | null)`**
*`based_on_hash` added post-sign (2026-09-04, lead ruling R44).* C4 §4 steps
3-4 mandate an optimistic concurrency check on `workbooks/*.idl1wb`, and
`store::atomic::write_atomic(data_root, target, bytes, based_on_hash)` already
implements exactly it — the original signature gave the backend no `H0` to pass.
`null` means "creating a new workbook" (the target must not exist, `write_atomic`'s
own `None` semantics); a non-null value is the hash the editor last read. Note
`None` against an existing file *errors* rather than clobbering, so omitting the
argument was never a silent-overwrite option — it would have made every save of
an existing workbook fail. A `RenameConflict` maps to the `conflict` kind (§2).
Return:
```ts
interface SaveResult {
  hash: string;          // sha256 of the written bytes, hex
  saved_utc_ms: number;  // i64
}
```
Errors: `not_found`, `invalid_argument` (front matter fails to parse, or a
fence is malformed enough that cell ids cannot be assigned — C2), `io`, `internal`.

**`watch_workbook(id: string, channel: Channel<WorkbookEvent>)`**
Subscribes to the file watcher (design §7) for one workbook; the command's
own `Promise` resolves once subscription is established, then the channel
carries events for the life of the subscription (unsubscribe is closing the
channel from the frontend side).
Return: `void` (the subscription's events are carried on `channel`, not on
the resolved value).
```ts
interface WorkbookEvent {
  kind: "changed" | "conflict";
  cell_ids: string[];   // cells affected by this event
}
```
Errors (on the initial `Promise` only): `not_found`, `io`, `internal`.

**Host-channel byte path — open item, owner L5 (added post-sign,
2026-09-04, lead ruling R21).** `CellDefResult.value` above and C2 §5.1's
per-definition JS host variables both carry a `HostChannel`
(`{length, t, v}`, `idl_rs::workbook::v3::to_host_channel`, L3): **full,
undecimated** arrays — `t` is `t_us[i] as f64 / 1e6` over the source's
recorded axis, and is **empty** when the source has no recorded axis (a
scalar or table-column result, C1's "time is recorded, not assumed").
Decimating a `HostChannel` to the current tile budget before it reaches
the sandboxed iframe is the **host's** job (L5/L6, design §6) — it is not
something `to_host_channel` does, and it is **not** represented in
`CellOutput`'s JSON: `HostChannel`'s `t`/`v` arrays are exactly the heavy,
per-sample data CLAUDE.md §2 requires to cross IPC as raw bytes, never
JSON, so `CellDefResult.value`'s actual wire representation is the
`HostChannelRef` marker (§3.4, R22), never the full `{length, t, v}`
object serialized as JSON numbers. **This contract does not specify that
byte layout.** It is
assigned to L5's workbook-command task to design, following the
`tauri::ipc::Response` pattern §3.5/§3.6 already establish for
tiles/rasters (magic/version header, little-endian, self-describing
lengths) — a new contract revision (§5) when L5 writes it, not invented
here.

### 3.5 Tiles (L3)

**`fetch_tile(session_id: string, channel: string, tier: number, tile_index: number, column_count: number)`**
*`column_count` added post-sign (2026-09-04, lead ruling R43).* The per-column
region exists so hover never needs IPC at the chart's own pixel width, and only
the frontend knows that width; the original signature had no argument to carry
it, which would have pinned the column region to a constant that can never match
the chart. `column_count: u32`, validated `1..=4096` (`invalid_argument`
outside). Request-only change — the binary layout is unchanged, its header
already carries `column_count`.
`tier`: `u32`, `0` = raw (bucket size 1), `k` = bucket size `TIER_BASE.pow(k)`
(`TIER_BASE = 8`, `rust/core/src/chart_decimation.rs`). `tile_index`: `u32`.
Return: raw bytes via `tauri::ipc::Response` (`Result<Response, IpcError>`),
decoded frontend-side into the layout below.
Errors: `not_found` (unknown `session_id` or `channel`), `invalid_argument`
(`tier` outside the engine's configured range), `io`, `internal`.
`MAX_TIER = 10` (`idl_rs::chart_decimation::MAX_TIER`, the largest tier
`k` for which `TIER_BASE.pow(k)` fits `u32` — *added post-sign, 2026-09-04,
lead ruling R25, wave-1 L3*) **is** "the engine's configured range" above:
L5 rejects `tier > MAX_TIER` with `invalid_argument` before producing any
bytes. The request stays `u32`; the header's `tier` field below stays
`u16` — narrowing is safe under that bound (`MAX_TIER = 10` fits a `u16`
with room to spare).

**Binary layout.** Little-endian throughout. Three regions after a fixed
32-byte header: a **sample region** (the existing bucket min/max pairs —
`decimate_channel`'s output, made self-describing), a **column region**
(coarser per-pixel-column `min, max, mean` stats, shipped so hover reads
never need IPC — design §6, "Hover reads the per-pixel-column stats shipped
with each tile"), and a **column time region** (*added post-sign,
2026-09-04, lead ruling R25, wave-1 L3* — see below; places each column on
the session's real time axis, C1 §2/§3.1: "time is recorded, not
assumed").

*Header (32 bytes, fixed):*

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLT"` |
| `version` | `u16` | 4 | Layout version, `2` for this contract — *bumped post-sign, 2026-09-04, lead ruling R25, wave-1 L3, for the new column time region below.* Version 1 (index-space only, no column time region) was never shipped. |
| `tier` | `u16` | 6 | Echoes the request |
| `tile_index` | `u32` | 8 | Echoes the request |
| `sample_count` | `u32` | 12 | Number of `(min, max)` bucket pairs that follow. Today `decimate_channel` always fills `TILE_SIZE_BUCKETS = 1024` (right-edge-padded with NaN); `sample_count` makes the tile self-describing so a shorter final tile or a future tile-size change never requires a layout bump. |
| `column_count` | `u32` | 16 | Number of pixel columns in the stats table that follows, and in the column time region below (same count for both). Independent of `sample_count` — chosen by the caller/L3 to match the rendered chart width (design §6 point budget), not tied to the bucket grid. |
| `flags` | `u32` | 20 | Reserved, `0` in this contract — see open question 6.5 |
| `reserved` | `[u8; 8]` | 24 | Zero-filled, reserved |

Header ends at byte offset **32**.

*Sample region — offset formula:*
- Start: `sample_region_offset = 32` (fixed, right after the header).
- Length: `sample_region_len = sample_count * 8` bytes (2 × `f32` × 4 bytes per bucket).
- Pair `i` (0-indexed, `0 <= i < sample_count`): `min` at byte
  `32 + i*8`, `max` at byte `32 + i*8 + 4`.

*Column region — offset formula:*
- Start: `column_region_offset = 32 + sample_count*8` (immediately after the sample region).
- Length: `column_region_len = column_count * 12` bytes (3 × `f32` × 4 bytes per column).
- Column `j` (0-indexed, `0 <= j < column_count`): `min` at byte
  `(32 + sample_count*8) + j*12`, `max` at `+4`, `mean` at `+8`.

*Column time region — offset formula (added post-sign, 2026-09-04, lead
ruling R25, wave-1 L3):*
- Start: `column_time_region_offset = 32 + sample_count*8 + column_count*12` (immediately after the column region).
- Length: `column_time_region_len = column_count * 8` bytes (`i64` × 8 bytes per column).
- Column `j` (0-indexed, `0 <= j < column_count`): `t_us` at byte
  `(32 + sample_count*8 + column_count*12) + j*8`.
- Value: the recorded `t_us` of the **first sample** in column `j`'s
  bucket range — exact, no interpolation, no `nominal_rate_hz` (C1
  §2/§3.1: "time is recorded, not assumed"). When that bucket range
  contains a sample but every stat in the column region is `NaN` (the
  sample's own value is `NaN`), the column still carries that sample's
  real `t_us`. When the bucket range contains **no** sample at all (past
  the end of the source data, or `column_count` overruns `sample_count`'s
  coverage), the sentinel `i64::MIN` is written instead.

*Total tile length:* `32 + sample_count*8 + column_count*12 + column_count*8`
bytes (added post-sign, 2026-09-04, lead ruling R25, wave-1 L3 — was
`32 + sample_count*8 + column_count*12`).

**Worked example — tier 3, 512 samples, 256 columns:**
```
header:                 offset    0, length 32     → header occupies [0, 32)
sample region:          offset   32, length 512*8  = 4096   → [32, 4128)
column region:          offset 4128, length 256*12 = 3072   → [4128, 7200)
column time region:     offset 7200, length 256*8  = 2048   → [7200, 9248)
total tile length:      32 + 4096 + 3072 + 2048 = 9248 bytes
```
Check: `4128 = 32 + 4096` ✓. `7200 = 4128 + 3072` ✓. `9248 = 7200 + 2048` ✓.
`9248 = 32 + 4096 + 3072 + 2048` ✓.

*Deferred, not part of this contract (added post-sign, 2026-09-04, lead
ruling R25, wave-1 L3):* design §4's L3 row lists a **tier cache**
alongside these tile endpoints. No such cache exists yet — recorded here
so this section is not read as claiming one.

### 3.6 Rasters (L3)

**`fetch_raster(session_id: string, channel: string, kind: "spectrogram" | "histogram2d", width: number, height: number, params: SpectrogramParams | Histogram2dParams)`**
`width`/`height`: `u16`, output pixel dimensions. `params` is one of the
two typed shapes below, matching `kind` — *replaces the interim
`Record<string, number>` bag, added post-sign 2026-09-04, lead ruling R25,
wave-1 L3, closes open question 6.4*:
```ts
interface SpectrogramParams {
  window_size: number;   // nperseg, samples
  hop_size: number;      // samples; hop = nperseg − noverlap (idl_rs::fft's own noverlap parameter)
  window: "rectangular" | "hann" | "hamming";   // idl_rs::fft::FftWindow, snake_case
  detrend: "none" | "mean" | "linear";          // idl_rs::fft::Detrend, snake_case
  scaling: "magnitude" | "density";             // idl_rs::fft::Scaling, snake_case
}
interface Histogram2dParams {
  y_channel: string;   // the second channel; `channel` above is the x channel
  x_bins: number;       // u32 — must equal `width` in wave 1, see below
  y_bins: number;       // u32 — must equal `height` in wave 1, see below
}
```
*`x_bins`/`y_bins` constrained post-sign (2026-09-04, lead ruling R42).* The
landed encoder (`core/src/raster.rs`, `build_histogram2d_raster_bytes`) builds
exactly one bin per pixel — unlike the spectrogram path, it does not rebin,
because rebinning counts would misrepresent them. So the two argument pairs
describe one grid: `fetch_raster`/`fetch_raster_meta` reject `x_bins != width ||
y_bins != height` with `invalid_argument` and `detail { x_bins, y_bins, width,
height }`, rather than silently preferring one. The fields are kept rather than
removed because bins < pixels (an upsampled display of a coarse histogram) is
the intended future extension, and this reserves the space for it.
Return: raw bytes via `tauri::ipc::Response`.
Errors: `not_found`, `invalid_argument` (bad `width`/`height`/`kind`/`params`), `io`, `internal`.

**`fetch_raster_meta(session_id: string, channel: string, kind: "spectrogram" | "histogram2d", width: number, height: number, params: SpectrogramParams | Histogram2dParams)`**
*Added post-sign (2026-09-04, lead ruling R25, wave-1 L3).* Same arguments
as `fetch_raster` above — a sibling JSON command, not a variant of the
binary path — so the chart can draw axes and a legend without decoding
pixel bytes to find their extents.
Return:
```ts
interface RasterMeta {
  x_domain: [number, number];
  y_domain: [number, number];
  x_label: string;
  y_label: string;
  scale: { vmin: number; vmax: number; kind: "linear" };
  transparent_zero: boolean;
}
```
Errors: `not_found`, `invalid_argument`, `io`, `internal` (same conditions
as `fetch_raster` above).

**Binary layout.** Little-endian throughout, header then row-major top-down
pixel data. Unchanged by this batch — pixel layout stays at header
`version = 1`; axis extents and the colour scale travel via
`fetch_raster_meta` above, not a header revision.

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLR"` |
| `version` | `u16` | 4 | Layout version, `1` |
| `width` | `u16` | 6 | Pixel columns |
| `height` | `u16` | 8 | Pixel rows |
| `format` | `u16` | 10 | `0` = RGBA8 (only defined value in this contract) |
| `reserved` | `[u8; 4]` | 12 | Zero-filled, pads the header to 16 bytes |

Header ends at byte offset **16**. Pixel data starts at offset 16, length
`width * height * 4` bytes (one `u8` per RGBA channel, no padding between
rows), row 0 first (top), each row left-to-right.

*Worked example — 64×32, format 0:* pixel data length `64*32*4 = 8192`
bytes → pixel region `[16, 8208)`, total raster length `16 + 8192 = 8208` bytes.

### 3.7 Cursor (L3)

**`cursor_readout(session_id: string, channels: string[], t_us: number)`**
`t_us`: `i64`, a point on the session's `t` axis (C1 §3.1). Called once on
cursor settle (debounced), never per pointer move (design §6).
Return:
```ts
interface CursorReadout {
  t_us: number;                          // echoes the request
  values: Record<string, number | null>; // channel_id → nearest recorded sample by t_us, null outside its recorded span — see below
}
```
*Amended post-sign (2026-09-04, lead ruling R25, wave-1 L3, closes open
question Q4).* Each channel's value is the sample **nearest** `t_us` on
that channel's own recorded `t_us` axis — the engine's existing
nearest-sample rule (`idl_rs::session::handle`) — **but only while `t_us`
lies inside that channel's recorded span.** *Amended again post-sign
(2026-09-04, ruling R31, Isaac): the clamp is removed.* When `t_us <
first` or `t_us > last` for a channel, its value is `null`: a channel
that stops (an HR strap that drops out at minute 40) must not read as a
live value for the rest of the session — "if the data stops, it stops".
Inside the span the nearest rule is unchanged. A tie (the cursor sits exactly between two samples) resolves to
the **earlier** sample. `null` therefore in exactly three cases: `t_us`
outside the recorded span (above), the channel has no samples at all, or
the channel has no recorded time axis (an empty `t_us` — a scalar or
table-column result, L3-R12/L3-R21). This replaces the original "no
sample **near** `t_us`" wording, which implied an unspecified proximity
bound; there is none.
Errors: `not_found` (unknown `session_id`), `invalid_argument` (a channel in
`channels` doesn't exist on this session — reported via `detail.channel`,
the rest of the readout is not partially returned; CLAUDE.md's
"don't block other channels" rule is about math cells, not this: a cursor
readout is one atomic answer for one instant), `io`, `internal`.

### 3.8 Device (L4)

**`ble_scan(timeout_ms: number, progress: Channel<DeviceDiscovered>)`**
`timeout_ms`: `u32`. Streams a `DeviceDiscovered` message per device found;
resolves (with no value) when the scan window ends.
```ts
interface DeviceDiscovered {
  device_id: string;   // platform BLE address/identifier
  name: string;
  rssi_dbm: number;    // i32
}
```
Errors: `ble`.

**`ble_connect(device_id: string)`**
Return:
```ts
interface ConnectionInfo {
  device_id: string;
  firmware_version: string;
  connected: boolean;
}
```
Errors: `ble`.

**`list_device_files(device_id: string)`**
Return: `DeviceFile[]`
```ts
interface DeviceFile {
  name: string;
  size_bytes: number;          // u64
  session_id: string | null;   // null if the device hasn't assigned one yet
}
```
Errors: `ble`, `wifi`.

**`download_file(device_id: string, file_name: string, progress: Channel<Progress>)`**
`Progress.done`/`.total` are bytes transferred/expected.
Return:
```ts
interface DownloadResult {
  path: string;         // where the blob landed under <data>/blobs/sha256/
  sha256: string;
  size_bytes: number;   // u64
}
```
Errors: `ble`, `wifi`, `not_found` (file no longer on the device), `io`.

**`push_config(device_id: string, config_json: string)`**
`config_json`: the config document as a JSON string (SPEC §8 fixes its
schema; this command validates it locally before transmission via the same
`parse_config` path core already has).
Return: `void` (resolves with no value on success).
Errors: `config_parse`, `config_unsupported_version` (local validation
failures, raised before anything is sent), `ble`, `wifi`, `config` (device
rejected the pushed config, or transport failed mid-push).

### 3.9 Sync (L11)

**`sync_status()`**
Args: none.
Return:
```ts
interface SyncStatus {
  paired_peers: PeerStatus[];
  last_sync_utc_ms: number | null;   // i64, null if never synced
}
interface PeerStatus {
  peer_id: string;
  name: string;
  online: boolean;   // currently visible on the LAN via mDNS
}
```
Errors: `io`, `internal`, `sync` (a sync-layer failure while reading peer/pairing state — added post-sign 2026-09-05, lead ruling R57, to match the §2 kind table's row for `sync`).

**`sync_now(peer_id: string, progress: Channel<Progress>)`**
`Progress.done`/`.total` are blobs+cells transferred/expected (a mixed unit;
`phase` disambiguates: `"manifest"`, `"blobs"`, `"workbooks"`).
Return:
```ts
interface SyncResult {
  blobs_transferred: number;    // u32
  workbooks_merged: number;     // u32
  conflicts: number;            // u32, conflict cells created (design §7 per-cell merge)
}
```
Errors: `sync`, `not_found` (unknown/unpaired `peer_id`).

**`pair_peer(code: string)`**
`code`: the 6-digit pairing code (design §7).
Return: `PeerStatus` (§3.9 above).
Errors: `sync`, `invalid_argument` (malformed code — wrong length/non-digit),
`not_found` (code not recognised or expired).

---

## 4. Interaction budget

From the principle "no IPC on the interaction path" (design §3, §6):

**Never called on a hot path** (every render frame, every pointer-move
event): `fetch_tile`, `fetch_raster`, `cursor_readout`, `eval_workbook`.

- **Hover** never calls `cursor_readout`. It reads the per-pixel-column
  `(min, max, mean)` stats already shipped in the tile's column region
  (§3.5) — that's what that region is *for*. `cursor_readout` fires once,
  on cursor **settle** (debounced), for the cross-channel numeric readout a
  hover panel shows once the pointer stops.
- **Zoom** is quantised to tiers. During a pinch/scroll gesture the current
  tile's picture scales via a canvas/CSS transform — no IPC. `fetch_tile` at
  the new tier is called once, on **settle**.
- **Pan** is translation: the picture slides locally; `fetch_tile` is called
  only for newly exposed edge tiles, on settle. Playback prefetches ahead of
  the playhead — also `fetch_tile`, but proactive and off the interaction
  path (it runs on a timer/lookahead, not in response to a gesture frame).
- **Density views** (`fetch_raster`) follow the same settle rule as
  `fetch_tile` — recomputing a spectrogram or 2-D histogram per pointer
  move would be strictly worse than the tile case, so it gets at least as
  strict a budget.
- **`eval_workbook`** runs on cell content change (debounced by the code
  editor — not per keystroke), on a `watch_workbook` file-change event, and
  once on workbook open. It is never called per animation frame.

**Fine to call any time, not gesture-bound** (cheap, or explicit user
action rather than a continuous gesture): `engine_version`, `list_sessions`,
`get_session`, `list_laps` (settle-bound alongside `get_session`, never a
hot path — round 2), `rebuild_catalog`, `list_workbooks`, `list_tracks`,
`get_track` (explicit track-detail open, settle-bound like `get_session`;
never on a hot path), `list_importers`, `import_file` (explicit user action on the Data tab —
picking a file to import is never a chart gesture), `open_workbook`,
`save_workbook` (explicit save action), `watch_workbook` (one-time
subscribe), `ble_scan`/`ble_connect`/`list_device_files`/`download_file`/
`push_config` (explicit user action on the Device tab, never triggered by
chart interaction), `sync_status` (periodic poll on a timer, not
per-frame), `sync_now`, `pair_peer`.

---

## 5. Versioning

A command's **signature** (args or return shape) is not changed in place.
A breaking change:
1. Adds a **new** command (new name, or the old name with a numeric suffix,
   e.g. `fetch_tile` → `fetch_tile_v2`) rather than mutating the existing
   one's Rust signature — CLAUDE.md §7's rule ("after changing an
   `idl-rs-tauri` command signature, update `app/src/ipc/` and the C3
   contract together") still applies to whichever command is actually
   edited; renaming avoids editing a signature every caller already
   depends on.
2. Keeps the old command registered and documented (marked **deprecated**
   in this file, with the revision it was deprecated in) for one contract
   revision's window — i.e. it is removed only in the *next* C3 revision
   after the one that deprecated it, giving every lane one full revision to
   migrate.
3. Is recorded as a dated revision line appended directly under this
   document's title (a running changelog inside the contract), e.g.
   `- 2026-09-10: fetch_tile v2 adds a per-tile checksum; fetch_tile
   (v1) deprecated, removal in the next revision.`
4. Updates the TS wrapper module for the affected group in the same change.

**`IpcError.kind` values are additive-only.** A `kind` is never renamed or
removed once shipped — frontend code routes on the string, and a removed
kind is a silent behaviour change no type system catches across the IPC
boundary. New kinds may be added freely (e.g. when export gets its own
command, per open question 6.1) and are appended to §2's table with a
revision note.

**Binary layouts (§3.5, §3.6) are versioned by their own `version` header
field**, independent of this document's revision line: a layout change
bumps `version`, the reader switches on it, and both the old and new
`version` values are documented here until the old one is retired from the
engine.

---

## 6. Open questions

1. **`export_unknown_channel` / `export_no_gps_data` have no command in C3
   v1.** `ExportError`/`FitExportError` exist in `idl-rs` core (CSV/JSON/FIT
   channel export, `core/src/export/`) but no lane in design §10 wires a
   CLI-only capability through IPC yet. Assigned: lead — either add an
   `export_channels`/`export_fit` command group in a future C3 revision
   when a lane picks up the work, or drop these two kinds from §2's table
   if export never gets IPC exposure (CLI keeps its own error path).
2. **`ParseError::TruncatedRecord` on `import_file` — reject or partial-succeed?**
   CLAUDE.md §5 says "corrupt/truncated log → recover what's readable,
   surface a warning," which argues `import_file` should still resolve with
   a `SessionSummary` (partial data) plus a warning field, not reject with
   `parse_truncated_record`. This contract lists the kind because the
   *engine's* `ParseError` enum has the variant, but whether `import_file`
   ever actually surfaces it as a command-level rejection (vs. a warning on
   a successful `SessionSummary`) is L2's call to make and document in its
   SPEC section. Assigned: L2.
3. **Resolved 2026-09-02 — §3.2/§3.4 reconciled against C1 (signed draft
   ddf9bd5+) and C4 (afde4e5).** `SessionSummary`, `SessionDetail`,
   `ChannelSummary`, `LapSummary`, `WorkbookSummary`, `TrackSummary` (§3.2)
   now match their C1/C4 sources field-for-field. This turned out **not**
   to be purely additive as originally hoped: `WorkbookSummary` renames
   `id`→`workbook_id`, `path`→`file_name` (and narrows its meaning to the
   bare file name, not a relative path), `updated_utc_ms`→`updated_at_ms`;
   `LapSummary` renames `lap_index`→`lap_number` (and 0-based becomes
   1-based) and replaces `start_t_us`/`end_t_us`/`distance_m` with
   `channel_stats` (none of the three had a catalog source); `SessionSummary`
   renames/retypes `duration_s` (f64 seconds) to `duration_ms` (i64 ms,
   nullable) and drops `channel_count` (no catalog column); `TrackSummary`
   drops `length_m` (no Track field or catalog column stores one).
   `SessionDetail` no longer `extends SessionSummary` — it now reads C1's
   `Session` plus `session.json` directly, decoupled from the catalog's
   cached, possibly-stale copy of the same values. **Controller ruling
   (2026-09-02): the reconciliation was not purely additive (6 renames, 2
   fields dropped outright with no C1/C4 source at all — `SessionSummary
   .channel_count`, `TrackSummary.length_m` — plus `LapSummary`'s
   `start_t_us`/`end_t_us`/`distance_m` consolidated into one new
   `channel_stats` field), and no §5 deprecation window applies — this is
   C3's first signed version, no command had been implemented against the
   prior draft field lists, so there is nothing for a deprecation window to
   protect.** **Round 2 (2026-09-02, controller ruling R27):** a scoped
   re-review found `get_session`'s `SessionDetail.laps` was still wrongly
   typed `LapSummary[]` (the catalog shape, sourced from `lap_summary` —
   `get_session` reads files, not the catalog) instead of C1 §6's own
   file-native `laps[]` shape; `TrackVisitSummary.laps` (C1 §6) had been
   silently dropped with no open question; and `session.json`'s top-level
   `track_visits_library_hash` (C1 §6) was omitted, undocumented. Fixed:
   `LapDetail` now mirrors C1 §6's `laps[]` object field for field and is
   what `SessionDetail.laps`/`TrackVisitSummary.laps` actually return;
   `LapSummary` (the catalog shape) is unchanged but is now returned only
   by the new `list_laps(session_id) -> LapSummary[]` command, not by
   `get_session`; `track_visits_library_hash: string | null` was added to
   `SessionDetail`. None of round 2's three fixes are new drops — they
   restore/correct fields round 1 mis-typed or missed; the drop count above
   (2 outright, 1 consolidation) is unchanged by round 2.
4. **Resolved 2026-09-04 (lead ruling R25, wave-1 L3, contract batch 3).**
   `fetch_raster`'s `params` is now the two typed shapes `SpectrogramParams`
   and `Histogram2dParams` (§3.6), replacing `Record<string, number>` and
   the ad hoc separate-string-arg workaround this item flagged for a second
   channel id. §3.6 also gains a `fetch_raster_meta` sibling command
   carrying axis extents and the colour-scale range, so the raster's pixel
   bytes don't need decoding just to draw axes or a legend.
5. **Tile `flags: u32` (§3.5 header) has no defined bits.** Reserved and
   zero in this contract. Assigned: lead/L3 — define bit 0 onward if/when a
   need appears (e.g. "this tile is provisional, a materialised channel is
   still computing"); until then callers must treat it as always `0`.
6. **Whether `ble_scan` is the right shape (stream-only, discovery events,
   no final list) vs. also returning a snapshot list on resolve** isn't
   settled by the design doc. Assigned: L4 — the transport crate's actual
   `btleplug` usage will make the natural shape obvious; revise §3.8 to
   match once L4 has working code, rather than guessing here.
7. **Resolved 2026-09-02 (controller ruling).** `TrackSummary.full_json` is
   dropped; `list_tracks` returns only `tracks`' scalar columns (C4 §5:
   `track_id`, `name`, `venue_name`, `created_at_ms`, `updated_at_ms` — the
   DDL has no gate/sector-count columns, so none are added here). A new
   command, `get_track(track_id) -> TrackDetail` (§3.2, lane L1), returns
   the full `.idl0t` artifact content instead. `TrackDetail`'s nested
   `lap_timing`/`neutral_zones`/`sector_gates`/`reference_polyline` fields
   are typed `unknown`/`unknown[]` pending L1's actual
   `track_artifact::model::Track` serde shape — see open question 10.
8. **Resolved 2026-09-02 (controller ruling).** `source_kind` and
   `source_format` are **not** the same enum: C1 owns the vocabulary —
   `source_format` is file-level (which importer produced the session);
   `source_kind` is channel-level (which sensor a channel came from). C4's
   `sessions.source_kind` column had the wrong name (it holds the file
   format) and has been renamed to `source_format` in C4 (post-sign
   revision, `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md`,
   branch `c4`). C3 now uses `source_format` for the session-level field
   (`SessionSummary`, `SessionDetail`) and reserves `source_kind` for
   `ChannelSummary` (channel-level, unchanged meaning).
9. **`lap_gates`/`sector_gates` (C1 §6, C1's own open item 2) and
   `WorkbookHandle` (§3.4, not in item 3's assigned type list) were left
   untouched by this reconciliation.** The former because C1 §8 item 2 is
   itself still open — adding them here would guess at an unresolved
   upstream question; the latter because `open_workbook`'s `id`/`path`
   fields were not named in the reconciliation assignment, though they may
   deserve the same `workbook_id`/`file_name` treatment `WorkbookSummary`
   just got, for naming consistency. Assigned: lead.
10. **`TrackDetail`'s (§3.2, `get_track`) nested field shape is
    provisional.** `track_id`/`name`/`venue_name`/`created_at_ms`/
    `updated_at_ms` are typed directly from the catalog + IDL0_SPEC §16.2's
    unchanged `Track` fields, but `lap_timing` (a sealed union,
    `Circuit`/`PointToPoint`, §16.2a), `neutral_zones` (§16.2b),
    `sector_gates`, and `reference_polyline` (`GpsFix[]`) have no fixed
    serde/JSON shape in any contract yet — no `track_artifact::model::Track`
    Rust struct exists to read the field names/enum tagging from. Typed
    `unknown`/`unknown[]` here rather than guessed. Assigned: L1 — pin the
    real shape when `track_artifact` lands and revise §3.2 in the same
    change.
11. **`LapDetail.sectors`/`.neutral_zone_visits` (§3.2, round 2) element
    shape is unfixed.** C1 §6 types both only as `"array"` — "present when
    sector_gates non-empty" for `sectors`, no further shape given for
    either. IDL0_SPEC §15.2's illustrative session tree names
    `sectors[] → sector_name, sector_time_ms` and §16.2b defines
    `NeutralZoneVisit { neutralZoneName, enterMs, exitMs }` for the legacy
    Dart model, which plausibly carries forward, but C1 itself does not
    commit to this, so `LapDetail` types both `unknown[]` rather than
    guessing. Assigned: lead/C1 — pin the element shape in C1 §6 (or here,
    if C1 declines to) before `list_laps`/`get_session` ship.

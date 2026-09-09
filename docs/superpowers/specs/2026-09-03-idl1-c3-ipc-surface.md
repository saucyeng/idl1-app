# C3 — IPC surface

**Status:** signed (lead) 2026-09-02 · **Date:** 2026-09-03 · **Owner:** lead

**Revisions:**
- 2026-09-05: wave-2 write amendment (lead ruling R59) — 17 commands added
  (Catalog: `save_session_metadata`, `delete_session`; Workbook: `read_workbook`,
  `create_workbook`, `fetch_host_channel`; Rasters and DSP: `fetch_fft`;
  Device: `connect_device`, `disconnect_device`, `device_status`,
  `device_control`, `pull_config`, `preview_channel_registry`; new §3.10 App
  group: `get_settings`, `set_settings`, `get_data_dir`, `set_data_dir`,
  `list_profiles`, `save_profile`, `delete_profile`); `eval_workbook` (§3.4)
  amended with a `lap_context` argument; new §2 cross-cutting kind
  `device_rejected`; one clarifying sentence added to §3.5's tile entry.
  Quarantine commands, `save_track`/`delete_track`, `rescan_track_visits`,
  `fetch_histogram` and `fetch_scatter_points` considered and deferred to
  wave 3 — see §6. Also (lead ruling R60): `import_file` (§3.3) now
  resolves with `ImportOutcome { session, warnings }` instead of a bare
  `SessionSummary`; new §2 kind `import_collision`.
- 2026-09-06: `rescan_tracks(session_id)` added to §3.2 (L2b Task 8, PLAN Q8)
  — the engine gap the wave-2 amendment's deferred `rescan_track_visits`
  named (§6) is now landed (`store::lap_index`, L2b Tasks 1–2), so this is
  the read-only "re-run visit/lap detection" half of that deferred item;
  `save_track`/`delete_track` (track *writes*) remain deferred to wave 3.
  New `not_found`/`io` rows in §2.
- 2026-09-06: L8x — `save_track`, `delete_track`, `list_quarantine`,
  `resolve_quarantine`, `verify_data_dir` added; §6's `TrackDetail` open
  question 10 closed and the four `unknown` fields typed; §6's quarantine
  and track-write deferrals struck.
- 2026-09-06: `list_math_builtins` added to §3.4 (lead-added L8w Task 12b,
  spec-during, lead ruling R64.2) — a thin catalog dump for the notebook
  editor's function reference to verify itself against at startup. No
  `unit_rule` field: R64.2 drops it (no source defines its vocabulary);
  `status` is `"implemented" | "not_implemented"` instead.
- 2026-09-06: L11 Task 1 (spec-first, lead ruling R88) — §3.9 gains
  `start_pairing()` and `unpair_peer(peer_id)`; `PeerStatus` gains
  `protocol_version`/`paired_at_ms`; a `peer_appeared` event is added;
  `sync_now`'s `phase` union is stated explicitly. New §2 rows: `sync`
  gains `start_pairing`/`unpair_peer`, `not_found` gains `unpair_peer`.
- 2026-09-07: L11 Task 10 review (lead ruling R102) — §3.9's `SyncResult`
  gains `sessions_updated`, `tracks_updated`, `profiles_updated`, matching
  the transport-internal `SyncRunResult` shape the client already returned;
  a sync run that only moved a session or a track was reporting "0 blobs,
  0 workbooks" under the old three-field shape. Task 12 applies this.
- 2026-09-07: L11 Task 13 (spec-during, lead ruling R105 item 1) — §3.9
  gains `set_sync_device_name(name)`. This device's own `peer_id`/`name`
  now persist in `identity.json` (`app_config_dir()`, beside `peers.json`,
  never under `<data>`), minted once on first read; a corrupt or unreadable
  `identity.json` is a typed `sync` error, never a silently re-minted id
  (which would orphan every existing pairing).
- 2026-09-07: S1 selection lane (ruling R117) — §3.4 gains
  `eval_workbook_v2(id, windows)` and `fetch_host_channel_v2(workbook_id,
  window, def_name, budget)`; §3.6 gains `fetch_fft_v2(window, channel,
  params, averaging)`. All three take C1 §6.1's `Window` (`{ session_id,
  span, colour }`) in place of a `session_id`/`lap`/`lap_context` pair.
  `eval_workbook`, `fetch_host_channel` and `fetch_fft` are deprecated as of
  this revision and removed in the next (§5); `fetch_tile`,
  `cursor_readout`, `fetch_raster`/`fetch_raster_meta` and the session-entity
  CRUD commands are unchanged.
- 2026-09-09: scipy-alignment lane (ledger R151 item 9, R157) — `WorkbookSource`
  (`read_workbook`) gains `pending_migrations: RenamedFunction[]`; `SaveResult`
  (`save_workbook`) gains `migrations: RenamedFunction[]`; `MathBuiltinDto`
  (`list_math_builtins`) gains `renamed_from: string[]` and the catalog's
  stated size moves from 69 (63 implemented, 6 not) to 72 (66 implemented, 6
  not). All three are additive — no existing field changes shape.

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
- **`device_rejected`** — *added post-sign (2026-09-05, lead ruling R59,
  wave-2 write lane).* A sixth cross-cutting kind, raised when a device
  refuses a control transition (SPEC §7.2 `AckCode` non-success value)
  rather than the transport itself failing. Deliberately not folded into
  `config` (which means a config document was rejected or malformed on the
  wire) or `invalid_argument` (a caller programming error): a
  busy/precondition/write-not-permitted/not-implemented refusal is a
  recoverable condition the UI must present differently ("stop the
  recording first"). `detail` carries `{ ack: "busy" | "precondition" |
  "write_not_permitted" | "not_implemented" }`. Raised by: Device
  (`device_control`).

| `kind` | Source | Raised by (command group) |
|---|---|---|
| `ble` | `TransportErrorKind::Ble` | Device: `ble_scan`, `ble_connect`, `list_device_files`, `download_file`, `push_config` |
| `wifi` | `TransportErrorKind::Wifi` | Device: `list_device_files`, `download_file`, `push_config` |
| `config` | `TransportErrorKind::Config` | Device: `push_config` (device rejected or malformed the pushed config over the wire) |
| `sync` | `TransportErrorKind::Sync` | Sync: `sync_status`, `sync_now`, `pair_peer`, `start_pairing`, `unpair_peer`, `set_sync_device_name` |
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
| `import_collision` | `ImporterError::Collision` | Import: `import_file` (re-import of a different blob under an existing session id — see the R60 note below) |
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
| `not_found` | cross-cutting | Catalog: `get_session`, `list_laps`, `rescan_tracks`, `save_track` (a string `track_id` naming no existing track), `delete_track`, `resolve_quarantine` (unknown `entry_id`); Workbook: `open_workbook`, `eval_workbook`, `save_workbook`, `watch_workbook`; Tiles: `fetch_tile`; Rasters: `fetch_raster`; Cursor: `cursor_readout`; Device: `download_file`; Sync: `sync_now`, `pair_peer`, `unpair_peer` (unknown `peer_id`); Import: `import_file` (source path missing) |
| `invalid_argument` | cross-cutting | Import: `import_file` (unknown `importer_id`); Workbook: `save_workbook` (malformed markdown/front matter); Tiles: `fetch_tile` (`tier` outside the engine's configured tier set); Rasters: `fetch_raster` (bad `width`/`height`/`kind`); Cursor: `cursor_readout` (unknown channel in the list); Sync: `pair_peer` (malformed code), `set_sync_device_name` (blank/whitespace-only name); Catalog: `save_track` (failed draft validation — empty name, non-finite/out-of-range gate coordinate, empty sector/neutral-zone name, or a zero-length gate), `resolve_quarantine` (`"restore"` whose `original_path` is occupied, or an `action` that is neither `"restore"` nor `"discard"`) |
| `io` | cross-cutting (also folds `ParseError::Io`, `ConfigErrorKind::Io`, `ExportError::Io`, `FitExportError::Io`, `LapIndexErrorKind::Io`) | any command that touches the filesystem: Catalog (`list_sessions`, `get_session`, `list_laps`, `rebuild_catalog`, `list_workbooks`, `list_tracks`, `get_track`, `rescan_tracks`, `save_track`, `delete_track`, `list_quarantine`, `resolve_quarantine`), Import: `import_file`, Workbook (`open_workbook`, `save_workbook`, `watch_workbook`), Tiles: `fetch_tile`, Rasters: `fetch_raster`, Device: `download_file`, Sync: `sync_status`, App: `verify_data_dir` |
| `internal` | cross-cutting (also folds `ExportError::Json`, `LapIndexErrorKind::Track` — currently unreached, see the variant's own doc comment) | any command — unexpected/programmer-error conditions that are not the caller's fault |
| `device_rejected` | cross-cutting | Device: `device_control` (a refused control transition — see the R59 note above) |

**Added post-sign (2026-09-03, lead ruling R7, wave-1 L2).** The seven
`import_*` rows above are new: `ImporterError` (`rust/core/src/import/error.rs`,
L2) is a new core error enum for the FIT/GPX/CSV importers, prefixed
`import_*` per this section's own naming rule — matching the `import_file`
command group's name (§3.3), distinct from `parse_*` (`ParseError`,
`.idl0`-only, unchanged). §2's original table had no rows for these variants
because L2 hadn't been drafted when C3 was signed.

**Added post-sign (2026-09-05, lead ruling R60).** `import_collision`
(`ImporterError::Collision`) is a new `import_*` row: a re-import of a
different blob under a session id the catalog already holds. It is kept
distinct from the cross-cutting `conflict` kind rather than folded into it —
the same precedent ruling R44 set for `conflict` itself — because a blob
collision on import is a different recoverable condition than an
optimistic-concurrency failure on a file write, and folding the two would
make `conflict` mean two unrelated things the UI cannot tell apart without
reading `message` (§2 forbids that).

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
  sectors: LapSector[];              // present when sector_gates is non-empty — pinned (§6 item 11,
                                      // closed): the landed session_json::SectorJson shape, not
                                      // IDL0_SPEC §15.2's illustrative sector_name/sector_time_ms
  neutral_zone_visits: LapNeutralZoneVisit[];   // pinned (§6 item 11, closed)
}
/** `LapDetail.sectors` element — C1 §6 `laps[].sectors[]` (§6 item 11). */
interface LapSector {
  name: string;
  start_ms: number;                // i64, UTC ms
  end_ms: number;                  // i64, UTC ms
  start_time_secs: number;         // f64, seconds, recording-time (t=0-anchored)
  end_time_secs: number;           // f64, seconds
}
/** `LapDetail.neutral_zone_visits` element — C1 §6 `laps[].neutral_zone_visits[]`
 *  (§6 item 11). */
interface LapNeutralZoneVisit {
  name: string;
  enter_ms: number;                // i64, UTC ms
  exit_ms: number;                 // i64, UTC ms
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
`get_session`. **REVISED (2026-09-06, L8x, ruling R86)** — §6 open question
10's four `unknown`/`unknown[]` fields are now typed; see `TrackDetail`
below `rescan_tracks`, shared with `save_track`/`delete_track`.
Errors: `not_found`, `io`, `internal`.

**`save_session_metadata(session_id: string, metadata: SessionMetadataPatch)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).* Satisfies
wave-2 need L7-1.

```ts
/** The nine editable `session.json` fields (C1 §6). "" is the only
 *  not-set representation — C1 §6 defines no null for these. Whole-block
 *  replace, not a sparse patch: every field is required, so a concurrent
 *  editor cannot half-apply one. */
interface SessionMetadataPatch {
  rider: string; bike: string; bike_comment: string;
  venue_name: string; event_name: string; event_session: string;
  short_comment: string; long_comment: string; tag: string;
}
```
Return: `SessionDetail` (above).

Reads `session.json`, replaces exactly those nine fields, leaves every other
key (`laps`, `track_visits`, the lap-flag fields, `bike_profile_snapshot`,
`schema_version`) untouched, writes through
`store::session_json::write_session_json` (C4 §4 atomic write), then re-reads
and returns `catalog_read::get_session`'s `SessionDetail` so the pane redraws
from canonical truth rather than from what it hoped it wrote. Unknown keys in
`metadata` are ignored, not rejected. The catalog row is **not** re-indexed
by this command; `rebuild_catalog` reconciles it (C4 §5).

The command computes the optimistic-concurrency check internally (read,
hash, write) rather than taking a `based_on_hash` argument — last-write-wins
inside the command, no `conflict` kind raised (ruling R59 Q1(a); revisit
when L11 LAN sync makes concurrent edits real).

Errors: `not_found` (unknown `session_id`), `invalid_argument` (a field that
is not a string), `io`, `internal`.

**`delete_session(session_id: string, delete_blob: boolean)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).* Satisfies
wave-2 need L7-3.

Return: `void`.

Removes `<data>/sessions/<session_id>/` recursively and the catalog rows for
that session. `delete_blob: true` additionally removes the blob at
`blobs/sha256/<2>/<62>` named by the session's `blob_sha256`; `false` keeps
it (idl0's "Forget session"). A blob still referenced by another session is
never removed even when `delete_blob: true` — blobs are content-addressed
and shared by construction (C4 §3).

Errors: `not_found` (unknown `session_id`), `io`, `internal`.

**`rescan_tracks(session_id: string)`**
*Added post-sign (2026-09-06, L2b Task 8, PLAN Q8).* The read-only half of
the wave-2 amendment's deferred `rescan_track_visits` (§6) — at the time
this command landed, track *write* commands (`save_track`/`delete_track`)
were still deferred to wave 3, but rescan only reads the existing track
library, so it landed with lap indexing itself (`store::lap_index`, L2b
Tasks 1–2) rather than waiting on that. **`save_track`/`delete_track` have
since landed too (2026-09-06, L8x, below)** — this command remains the
UI's own trigger; neither write command calls it (see below).

```ts
interface RescanReport {
  session_id: string;
  visits_indexed: number;
  laps_indexed: number;
  /** Lap-flag fields cleared because their lap number no longer exists
   *  after renumbering (PLAN Q3): any of "main_lap_number",
   *  "reference_lap_number", "starred_lap_number", "ignored_lap_numbers".
   *  `overlay_lap_key` is never in this list — it names a lap in *another*
   *  session, which this session's own renumbering cannot invalidate. The
   *  UI warns the rider a starred/ignored lap was dropped. */
  flags_cleared: string[];
  warnings: string[];
  elapsed_ms: number;
}
```
Return: `RescanReport`.

Is IDL0_SPEC §17.4's "Rescan Tracks": re-runs visit and lap detection for
one session against the *current* track library
(`idl_rs::store::lap_index::reindex_laps`, which always recomputes rather
than trusting the cache stamp — the point of an explicit rescan is
confirming a newly-added or newly-edited track took effect) and rewrites
`session.json`'s `laps`/`track_visits`/stamp fields. When `catalog.sqlite`
already exists, also re-indexes that session's catalog rows
(`store::catalog::index_session`), matching `import_file`'s own incremental-
catalog rule (C4 §5); a bare data root that has never had `rebuild_catalog`
run is left catalog-less, same as import. A catalog-indexing failure is
folded into `warnings` rather than failing the call — the lap rescan itself
already succeeded, and `rebuild_catalog` remains the recovery path.

This is the only C3 command that writes `session.json` outside the
workbook/metadata paths (`save_session_metadata`, workbook cell edits); it
is a *read* of the track library, not a track edit, so it never conflicted
with the (now-landed, see `save_track`/`delete_track` below) track-write
commands.

Errors: `not_found` (unknown `session_id`), `io`, `internal` (see §2's
`LapIndexErrorKind::Track` note — currently unreached).

**`save_track(track: TrackDraft) -> SaveTrackResult`** /
**`delete_track(track_id: string) -> DeleteTrackReport`**
*Added post-sign (2026-09-06, L8x, ruling R86).* Close the track-write half
of the wave-2 amendment's deferral (§6's "Wave-2 amendment (R59)" block):
`open_workbook`/§6 item 10's blocker — `track_artifact::model::Track` had
no fixed serde shape — is closed by the types below, which pin
`TrackDetail`'s four previously-`unknown` fields.

```ts
/** Decimal degrees. The `.idl0t` file stores degrees x1e7 (SPEC §17b.1);
 *  that scaling is a wire detail of the file, never of the IPC surface —
 *  core's `laps::model::Gate` is already decimal degrees (R27). */
interface Gate { lat1: number; lon1: number; lat2: number; lon2: number; }
interface SectorGate { name: string; gate: Gate; }
interface NeutralZone { name: string; enter: Gate; exit: Gate; }
interface GpsFix { timestamp_ms: number; lat: number; lon: number; }
type LapTiming =
  | { kind: "circuit"; start_finish: Gate }
  | { kind: "point_to_point"; start: Gate; finish: Gate };

/** REVISED — the four fields §6 item 10 left `unknown` are now typed. */
interface TrackDetail {
  track_id: string; name: string; venue_name: string;
  created_at_ms: number; updated_at_ms: number;
  lap_timing: LapTiming | null;
  neutral_zones: NeutralZone[]; sector_gates: SectorGate[];
  reference_polyline: GpsFix[];
}

/** `save_track(track)` is one command for create and edit. `track_id: null`
 *  creates (the command mints a UUID v4 and both timestamps); a string
 *  edits, preserving `created_at_ms` and bumping `updated_at_ms` to now. */
interface TrackDraft {
  track_id: string | null; name: string; venue_name: string;
  lap_timing: LapTiming | null;
  neutral_zones: NeutralZone[]; sector_gates: SectorGate[];
  reference_polyline: GpsFix[];
}
interface SaveTrackResult {
  track: TrackDetail;
  /** Sessions whose `track_visits_library_hash` no longer matches the
   *  library. The UI offers "Rescan N sessions" over `rescan_tracks`. */
  stale_session_ids: string[];
  warnings: string[];
}
interface DeleteTrackReport {
  track_id: string; stale_session_ids: string[]; warnings: string[];
}
```

`save_track` validates the draft (non-empty trimmed `name`; every gate
coordinate finite and within ±90/±180 decimal degrees; no empty sector or
neutral-zone name; a `Circuit`/`PointToPoint` gate whose two endpoints are
identical, since a zero-length gate can never be crossed) before writing —
a failure is `invalid_argument`, never a partial write. A valid draft
writes through the already-landed `write_track` (`tmp/<uuid>` → fsync →
rename, C4 §4's atomic-write primitive); no new atomicity primitive is
added. After the file lands, the command upserts the one `tracks` catalog
row **only when `catalog.sqlite` already exists** — the same
`import_file`/`rescan_tracks` rule (a data root that has never had
`rebuild_catalog` run stays catalog-less). A catalog-upsert failure is
folded into `warnings`, never fails the write. Neither `save_track` nor
`delete_track` calls `rescan_tracks`: a track edit stales every visiting
session's `track_visits_library_hash` stamp, and both commands instead
return `stale_session_ids` — the sessions whose stamp no longer matches —
for the UI to offer "Rescan N sessions" over the existing `rescan_tracks`
per id, keeping a name/venue edit bounded regardless of library size.
`delete_track` removes the `tracks` catalog row; `laps.track_id` is already
`REFERENCES tracks(track_id) ON DELETE SET NULL` (C4 §5), so lap rows
survive unattributed and `session.json` is not rewritten. Duplicate sector
or neutral-zone names are allowed (display labels, not keys, matching
idl0's own behaviour); only an empty name is an error. There is no
`conflict` kind on `save_track`: like `save_session_metadata` above, this
is last-write-wins.

Errors (`save_track`): `invalid_argument` (failed validation, above),
`not_found` (a string `track_id` naming no existing track), `io`,
`internal`.
Errors (`delete_track`): `not_found` (unknown `track_id`), `io`, `internal`.

**`list_quarantine() -> QuarantineEntry[]`** /
**`resolve_quarantine(entry_id: string, action: "restore" | "discard") -> void`**
*Added post-sign (2026-09-06, L8x, ruling R86 Q1/Q2).* Close the
quarantine deferral (§6's "Wave-2 amendment (R59)" block, ruling R59 Q2(a)):
the empty-command objection that deferral raised is resolved by
`verify_data_dir` (§3.10) landing in the same lane as the C4 §7 repair
producer that files entries here, so the pair is never permanently empty in
a signed contract.

```ts
interface QuarantineEntry {
  entry_id: string;            // the uuid in the filename
  path: string;                // absolute, under <data>/tmp/quarantine/
  original_path: string;       // where it was pulled from, "" if unknown
  reason: string;              // C4 §7 finding text
  quarantined_at_ms: number;   // i64
}
```

A quarantined entry is a file already inside `<data>` whose bytes failed
their own content-address check (C4 §7 findings #1/#5) and was moved,
never deleted, to `tmp/quarantine/<uuid>-<original-name>` by
`verify_data_dir(repair: true)` — the sole caller (C4 §7). `list_quarantine`
reads the C4 §2 sidecar (`tmp/quarantine/<uuid>.json`) next to each payload
for `original_path`/`reason`/`quarantined_at_ms`; a payload with no sidecar
is still listed with `reason: "unknown (no sidecar)"`, and an orphaned
sidecar with no payload is skipped. `resolve_quarantine` renamed the
stub's `"retry"` action to **`"restore"`** (ruling R86 Q2): these are
corrupt bytes already inside the store, not a rejected import, so there is
nothing to re-run. `"restore"` moves the payload back to `original_path`
when that path is free — occupied is `invalid_argument` — and `"discard"`
deletes the payload outright; both then delete the sidecar. Nothing under
`tmp/` is ever read as truth (C4 §2), so a resolve never touches the
catalog.

Errors (`list_quarantine`): `io`, `internal`.
Errors (`resolve_quarantine`): `not_found` (unknown `entry_id`),
`invalid_argument` (`"restore"` whose `original_path` is occupied, or an
`action` that is neither `"restore"` nor `"discard"`), `io`, `internal`.

### 3.3 Import (L2)

**`import_file(path: string, importer_id: string | null, progress: Channel<Progress>)`**
`importer_id` is `null` for extension-based auto-detection, or one of the
ids `list_importers` returns to force a specific importer.
Streams `Progress` (`phase` values e.g. `"reading"`, `"decoding"`,
`"materializing"`) then resolves with:
Return: `ImportOutcome` — *changed post-sign (2026-09-05, lead ruling R60)*
from a bare `SessionSummary`:
```ts
interface ImportOutcome {
  session: SessionSummary;   // §3.2, unchanged shape
  warnings: string[];        // the importer's recovered warnings, e.g. a
                              // truncated-record recovery; empty on a clean import
}
```
A catalog row (`SessionSummary`) must not carry per-import state, and
dropping the importer's recovered warnings — including truncation — would
violate CLAUDE.md §5's "recover what's readable, surface a warning." This
resolves open question 6.2 below: `parse_truncated_record` recovery
surfaces here, on `warnings`, rather than as a command rejection.
Errors: `not_found` (path missing), `invalid_argument` (unrecognised
`importer_id`), `parse_invalid_magic_bytes`, `parse_unsupported_schema_version`,
`parse_truncated_record` (`.idl0` sources only), `import_collision`
(*added post-sign, 2026-09-05, lead ruling R60* — `ImporterError::Collision`,
re-import of a different blob under an existing session id, §2), `io`,
`internal`.

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

**`read_workbook(id_or_path: string)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).* Satisfies
wave-2 need L6-N1 — closes the gap that made `save_workbook` unusable as
specified: no command let the editor read the file it was about to save
`based_on_hash` against.

```ts
interface RenamedFunction {          // added 2026-09-09 (scipy-alignment lane, R151 item 9)
  cell_id: string;
  line: number;                      // u32, 0-based within cell_id
  old: string;                       // the retired spelling
  new: string;                       // what it was (or would be) rewritten to
}

interface WorkbookSource {
  markdown: string;   // the file's UTF-8 text, verbatim
  hash: string;       // sha256 of those bytes, hex — the `based_on_hash` a later save passes
  path: string;       // absolute, under <data>/workbooks/
  pending_migrations: RenamedFunction[];  // added 2026-09-09, R151 item 9 — see below
}
```
Return: `WorkbookSource`.

Returns bytes and **does not parse**. Deliberately does not raise the four
document-fatal `workbook_*` kinds: a document whose front matter is
malformed must still be readable in order to be repaired in the editor.
That separation from `open_workbook` is the entire point of the command.

**`pending_migrations`** *(added 2026-09-09, scipy-alignment lane, ledger
R151 item 9)*: retired math-builtin names (C2 §3.8) this document would be
rewritten to on the next save — `[]` when `markdown` carries none,
including every `version: 4` document. Computed by running
`idl_rs::math::migrate_document` read-only (it never fails a malformed
front matter, it just reports no migrations, so it cannot regress this
command's "read anyway" contract above). Nothing is written and nothing
here changes `hash` — decision 75: opening a workbook is not consent to
modify it. The editor renders this as a passive, dismissable-only-by-saving
strip; the actual rewrite happens only inside `save_workbook`, below.

Errors: `not_found`, `io`, `internal`.

**`create_workbook(name: string)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).* Satisfies
wave-2 need L6-N8.

Return: `WorkbookHandle` (above).

Mints a UUIDv4 id, writes a minimal valid v3 document (front matter with
`id`, `name` and `version: 3`; no cells), and returns the existing
`WorkbookHandle`. The file name derives from `name`, filesystem-sanitised —
not from the id. A `file_name` collision on create follows the
`session_filename.dart` convention (SPEC §15.1) and appends `-2`, `-3`, …
(C4 §2) — not an error.

Errors: `invalid_argument` (empty `name`, or a name that sanitises to an
empty filename), `io`, `internal`.
*Note (L8w Task 14 wrap-up, 2026-09-06):* the sanitises-to-empty branch is
unreachable with the landed shared sanitiser, which falls back to
`"workbook"` rather than returning empty; the check and its error stay as
defence against a future sanitiser change, per Task 10's implementer note.

**`eval_workbook(id: string, session_id: string | null, lap_context: LapContext | null)`**
*`session_id` added post-sign (2026-09-04, lead ruling R41).* `eval_cells`
requires a channel lookup and a lap context; the original signature supplied
neither, and C2 deliberately has no front-matter session binding — the active
session is a UI selection, not a property of the file ("the workbook is a file;
the app is a live viewer of it"). `null` means no session is bound: the command
evaluates against an empty `SessionHandle` and `MathLapContext::empty()`, so
`[Channel]` references surface as per-cell `math_unknown_channel` rather than
the whole command failing. When a session IS bound, wave-1 lap context comes
from that session's `session.json` `laps[]`.

**`lap_context` added post-sign (2026-09-05, lead ruling R59, wave-2 write
lane, ruling R52 Q5).**
```ts
interface LapContext {
  main_lap: number | null;    // 1-based, matching §3.2 LapSummary.lap_number
  overlay_laps: number[];     // 1-based, may be empty
}
```
`null` keeps today's behaviour exactly (`MathLapContext::empty()`), so the
argument is additive and no existing caller changes. Six `Implemented`
functions in C2 §3.3 read `MathLapContext` and are unreachable without it:
`current_lap()`, `sector_number()`, `lap_start_time(n)`,
`lap_start_distance(n)`, `variance_time(ch)` and `variance_dist(ch)`. The
Main/Overlay designation is a UI selection, not a property of the file (R41)
and is written by `state/AppState.tsx`'s `selection.lapContext = { mainLap,
overlayLaps }` (R53 Data Q3), passed through unchanged.

An `Option`-typed trailing argument that Tauri deserialises to `None` when
absent, and whose `None` reproduces today's behaviour bit for bit, is not a
breaking change under §5 — R41 (`session_id`) and R43 (`column_count`) set
that precedent post-sign on this same contract.

*Added post-sign (2026-09-05, lead ruling R64.1).* `overlay_laps` names laps
of `session_id`'s own session in wave 2 — `variance_time`/`variance_dist`
compare the main lap against other laps of the same recorded session, not a
different one; cross-session overlay is a wave-3 amendment carrying a
`{ session_id, lap }[]` shape instead.

*Amended post-sign (2026-09-06, R73 closed, L2b Task 7).* `overlay_laps`
drives every one of its entries, not just the first: each named lap becomes
one overlay window, and `variance_time(ch)`/`variance_dist(ch)` evaluate
`ch` against every overlay lap independently, then take the elementwise
mean of the resulting delta series (a rider comparing against several ghost
laps at once gets the average deviation across all of them, not just the
first ghost's). `current_lap()`, `sector_number()`, `lap_start_time(n)`, and
`lap_start_distance(n)` are unaffected — they read `main_lap`, not
`overlay_laps`.

Return: `CellOutput[]`, one entry per cell, in document order.
```ts
interface CellOutput {
  cell_id: string;                          // C2 fence-string id
  kind: "math" | "table" | "js";             // "prose" removed — added post-sign (2026-09-04, lead ruling R21): prose has no fence id (C2 §2.1) and never gets its own CellOutput entry; it travels as prose_before/prose_after (C2 §2.4) on the fenced cell it's attached to
  value: unknown | null;                     // present when evaluation succeeded; shape depends on `kind` — see the `table` note below
  defs: CellDefResult[];                     // added post-sign (2026-09-04, lead ruling R21) — math cells only: one entry per definition (C2 §5.1's "one JS host variable per math definition"), in def_line source order; empty for table/js cells
  errors: IpcError[];                        // added post-sign (2026-09-04, lead ruling R22): plural — a cell may carry several structural problems (e.g. two duplicate definitions); empty on success; each kind is a structural (workbook_*) or evaluation (math_*) kind — see §2
  prose_before_html: string | null;          // added post-sign (2026-09-05, lead ruling R70, R69 item 4) — rendered HTML of this cell's CellDoc.prose_before (C2 §2.4); null when there is none. This is the first time CellOutput has actually carried a prose field — closing a gap R21's own comment above claimed was already true but wasn't implemented: prose reached the frontend by a separate client-side re-scan of read_workbook's raw markdown until this task. ${...} spans (C2 §5.2) appear as <span data-span-id="{id}"></span> placeholders (see prose_spans below) for the sandbox (L6 Task 13b) to fill; raw HTML the author typed is escaped, never passed through (R69's sandbox security boundary)
  prose_after_html: string | null;           // same, CellDoc.prose_after — non-null only on the last cell in the document (C2 §2.4)
  prose_spans: ProseSpan[];                  // added post-sign (2026-09-05, lead ruling R70) — every ${...} span across prose_before_html then prose_after_html, in document order, found by core's find_inline_exprs (the only ${...} scanner) — lets the sandbox consumer fill each placeholder without its own re-scan of the raw prose text
}

// Added post-sign (2026-09-05, lead ruling R70).
interface ProseSpan {
  id: string;    // matches a prose_before_html/prose_after_html placeholder's data-span-id attribute exactly, e.g. "{cell_id}-before:0"
  expr: string;  // the JavaScript expression text between ${ and }, verbatim (C2 §5.2)
}

// Added post-sign (2026-09-04, lead ruling R21).
interface CellDefResult {
  name: string;
  label: string | null;
  value: HostChannelRef | null;   // added post-sign (2026-09-04, lead ruling R22): the light wire marker { length: number /* u32 */, has_t: boolean } — the full {length, t, v} HostChannel stays in-process (core); sample bytes cross via the binary command assigned to L5 in the host-channel byte-path note below §3.4
  sample_rate_hz: number | null;  // added post-sign (2026-09-08, lead ruling R144, amended R152) — this definition's sample rate, Hz, on success; null means genuinely not applicable (a scalar reduction has no rate), never "unknown", and is also null on failure. R144 originally asked for a `unit` field alongside this one; ruling R152 drops that half — no unit is tracked anywhere in the engine's math value type today, C2 §3.3 states output units only for named functions (not for `+ - * /` between two differently-unitted channels), and shipping a partial/guessed unit would be worse than shipping none (a reader stops checking a labelled-but-wrong number). A `unit` field is deferred to its own spec-first task.
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
`workbook_invalid_front_matter`, `workbook_invalid_cell_id`, and — *added
post-sign (2026-09-05, lead ruling R59)* — `invalid_argument` when a named
lap in `lap_context` does not exist on `session_id`, with `detail { lap }`.

**`eval_workbook_v2(id: string, windows: Window[])`**
*Added post-sign (2026-09-07, S1 selection lane, ruling R117).* Replaces
`session_id` + `lap_context` with an ordered list of `Window` (C1 §6.1) —
R111 forbids selection having two live representations in the app, so this
is a `_v2` rename rather than an additive argument (§5, ruling R117 item 3).
```ts
interface Window {
  session_id: string;
  span: { kind: "session" }
      | { kind: "lap"; lap_number: number }        // 1-based, matches §3.2 LapSummary.lap_number
      | { kind: "range"; t0_us: number; t1_us: number }; // i64, session-relative, t0_us < t1_us
  colour: string;   // a `--chart-1` … `--chart-8` token name, never a hex literal (C1 §6.1)
}
```
Evaluates workbook `id` once per entry of `windows`, in order, returning one
`CellOutput[]` per window in the same order. `windows: []` evaluates once
against no session — byte-identical to `eval_workbook(id, null, null)`, the
"nothing selected" result (decision 48), and returns `[[…]]` (one element,
not zero) so a caller always has a result array to render.

Two windows over the same `session_id` with different spans are legal and
are the normal case — lap-to-lap comparison (C1 §6.1, ruling R117 item 2);
uniqueness is on the whole window, never on `session_id`.

Return: one entry per `windows` entry, same order, each entry **either**
that window's `CellOutput[]` **or** that window's error:

```
WindowEval = { ok: CellOutput[] } | { error: IpcError }
```

**Errors are split by attribution (ruling R121).** An error that is a
property of *one* window fails only that entry; the other windows still
return their outputs:

| Failure | Kind | Where it lands |
|---|---|---|
| Unresolvable `session_id` | `not_found` | that window's entry |
| Unknown lap number | `invalid_argument`, `detail: { "lap": n }` | that window's entry |
| Range with no overlap (R119) | `invalid_argument`, `detail: { session_id, t0_us, t1_us, session_span_us }` | that window's entry |
| Range with `t0_us >= t1_us` (R120) | `invalid_argument`, same `detail` shape | that window's entry |
| Unknown or unparseable workbook `id` | `not_found` / `invalid_argument` | **the call** (`Err`) — no window has a meaningful answer |

Each per-window error still names its index in `detail: { "window": i }`.
Per-cell evaluation errors keep their existing home in
`CellOutput.errors`.

> *Revision note.* Before R121 this paragraph read "Errors are per call,
> not per window" and listed only the first two rows. It was drafted before
> R119/R120 added the two range failures and was never reconciled with C1
> §6.1's "fails only that window". C1 was right; this section was not.
> Blanking every selected window's charts because one range is degenerate
> contradicts decision 61 and section D's in-place error presentation.

**`eval_workbook(id, session_id, lap_context)` is deprecated** as of this
revision (§5) and is removed in the next. It stays registered and behaves
exactly as before. No TypeScript caller uses it after this revision.

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
  migrations: RenamedFunction[];  // added 2026-09-09, R151 item 9 — see below
}
```
Errors: `not_found`, `invalid_argument` (front matter fails to parse, or a
fence is malformed enough that cell ids cannot be assigned — C2), `io`, `internal`.

**`migrations`** *(added 2026-09-09, scipy-alignment lane, ledger R151 item
9, `RenamedFunction` shape above)*: every retired math-builtin name (C2
§3.8) this save rewrote to its current spelling — `[]` when the document
carried none. This is the **only** place a rewrite happens — `save_workbook`
runs `idl_rs::math::migrate_document` on `markdown` before writing, hashing,
and returning; `hash` above is the hash of the **migrated** bytes, never the
caller's original text with a retired name still in it. The editor renders
this list as a dismissable report ("N retired function names were updated
in this workbook"), reusing the same banner slot `ConflictBanner`/
`VersionBanner` already occupy rather than a second mechanism.

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
  hash: string;         // sha256 of the file's bytes after this change, hex --
                         // equals SaveResult.hash when this event reflects
                         // the app's own successful save (added post-sign,
                         // 2026-09-05, lead ruling R67)
}
```
Errors (on the initial `Promise` only): `not_found`, `io`, `internal`.

**`fetch_host_channel(workbook_id: string, session_id: string | null, def_name: string, budget: number)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane, ruling
R52 Q6).* Satisfies wave-2 need L6-N3; closes the "host-channel byte path"
open item below, which R45 deferred to wave 2.

`budget`: `u32`, max points, validated `1..=65536`. Returns raw bytes via
`tauri::ipc::Response` (`Result<Response, IpcError>`), so arguments and
existence are validated before any byte is produced (§1).

**Binary layout `IDLH`, version 1.** Little-endian throughout.

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLH"` |
| `version` | `u16` | 4 | `1` |
| `flags` | `u16` | 6 | bit 0 = `has_t`; all other bits reserved, zero |
| `length` | `u32` | 8 | number of `f64` values in `v` |
| `t_length` | `u32` | 12 | number of `f64` values in `t`; `0` when the source has no recorded axis |
| `reserved` | `[u8; 8]` | 16 | zero-filled |

Header ends at byte offset **24**, padded so both payload arrays start on an
8-byte boundary (ruling R59 Q3(a)). Then `t` as `t_length` × `f64` at offset
24 (seconds, matching `to_host_channel`'s µs→s conversion), then `v` as
`length` × `f64` at offset `24 + t_length*8`. Total length
`24 + t_length*8 + length*8`.

`t` is empty (`t_length == 0`, `has_t` clear) when the source has no recorded
axis — a scalar or table-column result (C1's "time is recorded, not
assumed"). Decimation to `budget` happens before these bytes are produced,
so `length` is always ≤ `budget`.

Errors: `not_found` (unknown workbook or definition), `invalid_argument`
(`budget` outside range), the `math_*` kinds when the definition itself
fails to evaluate, `io`, `internal`.

**`fetch_host_channel_v2(workbook_id: string, window: Window | null, def_name: string, budget: number)`**
*Added post-sign (2026-09-07, S1 selection lane, ruling R117).* Replaces
`session_id` with a single `Window | null` (§3.4's `eval_workbook_v2`
shape, C1 §6.1); `null` reproduces today's session-less behaviour. Same
binary layout, `budget` validation and error set as `fetch_host_channel`
above.

This closes a live gap: `fetch_host_channel`'s backend
(`fetch_host_channel_via`) passes `None` for the lap selection today, so a
host channel is evaluated session-wide while the matching `eval_workbook`
result is evaluated lap-aware — the two disagree whenever a lap is
selected (ruling R117 item 7). `fetch_host_channel_v2` uses the same
per-window resolution `eval_workbook_v2` uses, so the two always agree.

**`fetch_host_channel(workbook_id, session_id, def_name, budget)` is
deprecated** as of this revision (§5) and is removed in the next. It stays
registered and behaves exactly as before, missing lap context and all.

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

**`list_math_builtins()`**
*Added post-sign (2026-09-06, lead-added L8w Task 12b, spec-during, lead
ruling R64.2).* A thin catalog dump over `idl_rs::math::math_builtin_catalog()`
(`rust/core/src/math/catalog.rs`, hand transcribed from C2 §3.3's Builtin
catalog table) so the notebook editor's `functionCatalog.ts` function
reference can verify itself against the engine once at startup and log a
mismatch (a lead shell task, not this command). Never fails — no
device/session/file dependency, matching `engine_version`'s "no `Result`"
pattern (§3.1).

Return:
```ts
interface MathBuiltinDto {
  name: string;
  arity: number[];   // valid argument counts for this name — more than
                      // one entry when C2 §3.3's signature documents more
                      // than one call form, e.g. rms(ch) | rms(ch, w) -> [1, 2]
  status: "implemented" | "not_implemented";
  renamed_from: string[];  // added 2026-09-09, R151 item 9 — see below
}
type MathBuiltins = MathBuiltinDto[];  // 72 entries (66 implemented, 6 not) — revised
                                        // 2026-09-09, scipy-alignment lane, from 69
                                        // (63 implemented, 6 not); see C2 §3.3's own
                                        // count paragraph for the +3 breakdown and a
                                        // recorded disagreement over the split
```

**`renamed_from`** *(added 2026-09-09, scipy-alignment lane, ledger R151
item 9)*: retired names that now migrate to this one (C2 §3.8), drawn from
`idl_rs::math::math_name_migrations()` — e.g. `["variance_time"]` for
`lap_delta_time`, `["p"]` for `percentile`. `[]` for every function nothing
was ever renamed from. Lets the notebook's function reference and
completion catalog show "was `X`" beside a renamed builtin, rather than the
old name simply vanishing from view.

No `unit_rule` field — an earlier draft of this task proposed one, but C2
§3.3 has no "units" column and no other Rust or TS artifact names a
per-builtin unit-propagation vocabulary; R64.2 drops it rather than ship a
placeholder taxonomy in a signed contract. A `unit_rule`-equivalent field
is a future additive amendment once C2 states real unit-propagation rules
per builtin.

Excludes `main(col[])` (table-cell only, C2 §4) and the grammar keywords
`and`/`or`/`not` (parsed as operators, never reach the function-call
dispatch) — the same three exclusions L6's `functionCatalog.ts`
transcription already made.

Errors: none (see above).

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

*Added post-sign (2026-09-05, lead ruling R59, wave-2 write amendment,
Q3).* Regions are not alignment-padded; decoders copy through a DataView,
they do not view the buffer in place. A zero-copy decoder is a
layout-version bump.

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

**`fetch_fft(session_id: string, channel: string, lap: number | null, params: SpectrogramParams, averaging: "none" | "mean" | "max" | "median")`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane, ruling
R52 Q7).* Satisfies wave-2 need L6-N5.

`params` reuses `SpectrogramParams` (above) verbatim — the same window, hop,
detrend and scaling vocabulary over the same `idl_rs::fft` types.
`averaging` is `idl_rs::fft::Averaging`, extended to all four wire tokens
(ruling R63 (3), L8w Task 12) — `"none"`/`"mean"`/`"median"`/`"max"` each
map directly to an `Averaging` variant, none rejected. Returns raw bytes via
`tauri::ipc::Response`. `"none"` requires the request's segmentation to
produce exactly one segment (ruling R76) — more is `invalid_argument` with
`detail: { "segments": n }`, not a silent first-segment result.

**Binary layout `IDLF`, version 1.** Little-endian throughout.

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLF"` |
| `version` | `u16` | 4 | `1` |
| `reserved` | `[u8; 2]` | 6 | zero-filled |
| `bin_count` | `u32` | 8 | number of `f32` magnitudes that follow |
| `sample_rate_hz` | `f32` | 12 | the real rate derived from the request's own `t_us` axis: the whole channel's for `lap: null`, that lap's sliced window's for `lap: n` (ruling R85) |

Header ends at byte offset **16**, padded so the magnitude array starts on
a 4-byte boundary (ruling R59 Q3(a)); magnitudes are `bin_count` × `f32`
from offset 16. Total `16 + bin_count*4`. Bin `k`'s frequency is
`k * sample_rate_hz / (2 * bin_count)`, derived frontend-side from the two
header fields, so no second array crosses.

This is a wrapper over the `idl_rs::fft` the spectrogram raster already
uses, not new DSP. The math catalog's `fft(ch, window)` is not a
substitute: its result is a bin-indexed channel with no frequency axis
attached, so a chart built on it would synthesise the axis in JavaScript,
which CLAUDE.md §2 forbids.

`lap: null` takes the whole channel. `lap: n` selects that lap's
recording-time window from `session.json`'s `laps[]` (ruling R83) and takes
only the samples inside it — an unknown lap number is `invalid_argument`
with `detail: { "lap": n }`. Both of R76's core guards then run against
that lap window, not the whole channel (ruling R85): a window too short
for the requested FFT parameters fails the same `"none"`-averaging segment
check above (`detail: { "segments": n }`), and a window with too few
samples or duplicate timestamps to derive a rate (e.g. a 1–2-sample
degenerate lap boundary) is `invalid_argument` rather than a spectrum full
of `NaN`.

Errors: `not_found`, `invalid_argument` (bad `params`, an unknown `lap`, a
lap window that fails the `"none"`-averaging segment check, or a window too
short/degenerate to derive a sample rate), `io`, `internal`.

- 2026-09-05: fetch_fft's averaging union closed against
  idl_rs::fft::Averaging (ruling R63 (3), L8w Task 12) — "none" and "max"
  now implemented, not rejected.
- 2026-09-06: `lap` accepts a real lap number, resolved against
  `session.json`'s `laps[]` (ruling R83, L2b Task 6) — no longer rejected
  unconditionally.
- 2026-09-06: "none" requires exactly one segment; more is invalid_argument
  with detail: { "segments": n } instead of silently keeping the first
  segment's power (ruling R76, L8w Task 12 fix).
- 2026-09-06: R76's segment/rate guards run against the lap window's own
  t_us/sample count, not the whole channel's, closing a gap where a
  1-2-sample degenerate lap window bypassed both guards (ruling R85, L2b
  Task 6 fix).

**`fetch_fft_v2(window: Window, channel: string, params: SpectrogramParams, averaging: "none" | "mean" | "max" | "median")`**
*Added post-sign (2026-09-07, S1 selection lane, ruling R117).* Replaces
`session_id` + `lap: number | null` with a single `Window` (§3.4's
`eval_workbook_v2` shape, C1 §6.1): `lap: null` becomes `{ kind: "session"
}`, `lap: n` becomes `{ kind: "lap", lap_number: n }`, and `{ kind: "range"
}` makes an FFT over a dragged range expressible for the first time. Same
binary layout (`IDLF`, version 1), the same `"none"`-averaging
exactly-one-segment rule, and the same R76 guards as `fetch_fft` above —
ruling R85's order stands: slice to the window first, then apply R76's
guards to the window's own samples.

Errors: `not_found`, `invalid_argument` (bad `params`, an unresolvable
window span, a window that fails the `"none"`-averaging segment check, or a
window too short/degenerate to derive a sample rate), `io`, `internal`.

**`fetch_fft(session_id, channel, lap, params, averaging)` is deprecated**
as of this revision (§5) and is removed in the next. It stays registered
and behaves exactly as before.

**Unchanged commands, stated so no lane guesses (ruling R117).**
`fetch_tile` (§3.5) stays session-scoped: tiles are a resolution pyramid
over the whole session and the host clips by viewport — putting a window
in the tile key would fragment the cache for no gain. `cursor_readout`
(§3.7) stays `(session_id, channels, t_us)`: a cursor is a point, and the
caller already knows which window it is in. `fetch_raster` /
`fetch_raster_meta` (above) keep no window in **this** lane — the
spectrogram's own time axis is a separate question, deferred to the T lane,
and noted here so it is not silently assumed done. `get_session`,
`list_laps`, `save_session_metadata`, `delete_session`, `rescan_tracks`
(§3.2) are session-entity CRUD and are untouched.

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

**`connect_device(device_id: string)` / `disconnect_device(device_id: string)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane, ruling
R53 Device Q4).* Satisfies wave-2 need L7-13.

`connect_device` returns `ConnectionInfo` (above) and leaves the BLE link
**open**, held in a new `state::Connections` map
(`Mutex<HashMap<String, ConnectedDevice>>`, registered in `app/src-tauri`'s
`.setup()` beside `DataDir`/`Hashes`/`Watchers`). `disconnect_device` tears
it down and returns `void`; disconnecting an unconnected device is a no-op,
not an error.

`ble_connect` above is **unchanged and stays registered**: it connects,
reads firmware, and disconnects inside its own call — this is an added
command, not a changed signature (§5). `device_status`, `device_control`
and `pull_config` below use the managed link when one exists for
`device_id` and otherwise connect-act-disconnect, so the Device tab works
either way and a dropped link degrades rather than fails.

Errors: `ble`, `not_found` (device not discoverable), `internal`.

**`device_status(device_id: string)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane, ruling
R59 Q6).* Satisfies wave-2 need L7-8.

One read of SPEC §7.3's status characteristic, mirroring
`idl_transport::ble_status::DeviceStatus` field for field with
`#[serde(rename_all = "snake_case")]` on its three enums:

```ts
interface DeviceStatus {
  wifi_on: boolean | null;
  logging: boolean | null;                                 // true while recording
  battery_pct: number | null;                              // u8, percent
  sd: "ok" | "full" | "error" | "absent" | null;
  gps: "fix" | "no_fix" | "absent" | null;
  imu: "ok" | "partial" | "error" | "absent" | null;
  firmware: string | null;
  ota_pending_verify: boolean;                             // never null
  hr: string | null;                                       // raw §7.3 line value
  hr_battery_pct: number | null;                           // u8, percent
}
```
Every field except `ota_pending_verify` is nullable, and `null` means "the
device did not report this line" — never zero. `parse_status` already
guarantees that: unknown lines are ignored so the set may grow, and a
malformed value for a known key leaves that field `None` rather than
failing the parse. This shape mirrors the landed transport rather than the
ten fields the lane's IPC needs list proposed — four of those
(`sd_free_bytes`, `gps_fix_quality`, `gps_satellites`,
`battery_millivolts`) have no source in SPEC §7.3 or the landed parser; see
§6's wave-2 amendment note for the follow-up question to Isaac.

Errors: `ble`, `not_found`, `internal`.

**`device_control(device_id: string, command: "start_recording" | "stop_recording" | "wifi_on" | "wifi_off")`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).*
Satisfies wave-2 need L7-9.

Return: `DeviceStatus` (above) — the post-transition status, so the UI
never has to guess whether the device took the instruction.

`command` maps onto `idl_transport::ble_control::ControlCommand`:
`start_recording` → `StartLogging` (0x03), `stop_recording` → `StopLogging`
(0x04), `wifi_on` → `WifiOn` (0x01), `wifi_off` → `WifiOff` (0x02). The
other five `ControlCommand` variants are **not** exposed: `CalibrateImu` is
wave 3 (SPEC §7.6), `OtaConfirm` belongs to the deferred firmware path, and
`ConfigBegin`/`ConfigCommit`/`ConfigReadBegin` are internal to
`push_config`/`pull_config`.

SPEC §7.2's ACK `0x00` means "accepted and dispatched", not "completed" —
completion is the FF04 status notify. The command therefore writes, then
polls status until the transition is observed or a bounded timeout
expires, the same pattern `list_device_files` already uses for `WifiOn` in
`commands/device.rs`. A timeout returns the last status read rather than
failing, so the UI shows what the device actually reports.

Errors: `ble`, `not_found`, `invalid_argument` (unknown `command` string),
`device_rejected` (the device returned a non-success `AckCode` — SPEC
§10.4 suspends BLE control in WiFi mode, and a reboot would abort a
recording; §2's new cross-cutting kind, ruling R59 Q4), and `internal`.

**`pull_config(device_id: string)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).*
Satisfies wave-2 need L7-10.

Return: `string` — the device's live `idl0_config.json` as a JSON string,
symmetric with `push_config`'s `config_json` argument. Drives
`ControlCommand::ConfigReadBegin` (0x09) and reassembles the chunks
through the landed `ble_config::reassemble_config_reads`;
`ble_config::configs_match` is what a caller uses for the verify half of a
push.

Errors: `ble`, `not_found`, `config` (the device returned something
unparseable — this is the §2 `config` kind's own meaning, a config
document malformed on the wire), `internal`.

**`preview_channel_registry(config_json: string)`**
*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane, ruling
R53 Device Q1).* Satisfies wave-2 need L7-12.

```ts
interface RegistryRow {
  channel_id: number;                          // u16, SPEC §5.2
  data_type: "i16" | "i32" | "u8" | "u16" | "u32";
  sample_rate_hz: number;                      // 0 = event-driven (SPEC §5.7)
  scale: number; offset: number;
  name: string; units: string;
}
```
Return: `RegistryRow[]` — a pure function of the config document, no
device I/O. It lives in the Device group because that is the only surface
that calls it; the implementation is in `core` (`scale = range / 32768` is
SPEC §3's own formula, already owned by `core::parse`, not restated in
TypeScript).

Errors: `config_parse`, `config_unsupported_version` (both already in §2's
table), `invalid_argument`, `internal`.

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
  online: boolean;          // currently visible on the LAN via mDNS
  protocol_version: number; // u32, the peer's `/idl1/v1`-style mDNS `v=` value
                             // (added post-sign 2026-09-06, lead ruling R88,
                             // L11 Task 1) — a peer advertising a `v` this
                             // build does not speak is listed incompatible
                             // (PLAN §3) rather than omitted
  paired_at_ms: number;     // i64, ms since epoch when pairing completed
                             // (added post-sign 2026-09-06, lead ruling R88)
}
```
Errors: `io`, `internal`, `sync` (a sync-layer failure while reading peer/pairing state — added post-sign 2026-09-05, lead ruling R57, to match the §2 kind table's row for `sync`).

**`sync_now(peer_id: string, progress: Channel<Progress>)`**
`Progress.done`/`.total` are blobs+cells transferred/expected (a mixed unit;
`phase` disambiguates — stated explicitly, added post-sign 2026-09-06, lead
ruling R88, L11 Task 1, widened from the three named above; `app/src/ipc/sync.ts`
already documents `phase` as free-form, so this widening breaks no caller):
`"manifest" | "blobs" | "sessions" | "workbooks" | "tracks" | "profiles"`.
Return:
```ts
interface SyncResult {
  blobs_transferred: number;    // u32, successful `Blob` transfers this run,
                                 // pull and push combined. Content-addressed
                                 // session channels (`Derived`) and
                                 // `data.parquet` are counted under
                                 // `sessions_updated` instead — they are
                                 // always session-scoped, unlike a raw blob
                                 // (added post-sign 2026-09-07, lead ruling
                                 // R102, L11 Task 10 review)
  workbooks_merged: number;     // u32, workbooks installed locally by a
                                 // pull this run. A push of a workbook is
                                 // not counted: the merge it may cause
                                 // happens on the peer, whose outcome this
                                 // run never observes (the peer answers a
                                 // bare 200) (added post-sign 2026-09-07,
                                 // lead ruling R102, L11 Task 10 review)
  conflicts: number;            // u32, conflict cells created across every
                                 // workbook merge this run (design §7
                                 // per-cell merge)
  sessions_updated: number;     // u32, distinct session ids that had at
                                 // least one successful `data.parquet`,
                                 // derived-channel, or `session.json`
                                 // transfer this run (pull or push) (added
                                 // post-sign 2026-09-07, lead ruling R102,
                                 // L11 Task 10 review)
  tracks_updated: number;       // u32, successful `Track` transfers this
                                 // run, pull and push combined (added
                                 // post-sign 2026-09-07, lead ruling R102,
                                 // L11 Task 10 review)
  profiles_updated: number;     // u32, successful `Profile` transfers this
                                 // run, pull and push combined (added
                                 // post-sign 2026-09-07, lead ruling R102,
                                 // L11 Task 10 review)
}
```
Errors: `sync`, `not_found` (unknown/unpaired `peer_id`).

**Added post-sign (2026-09-07, lead ruling R102, L11 Task 10 review).**
review-task10 found `SyncRunResult` (the transport-internal type
`sync_with_peer` returns) had grown three fields
(`sessions_updated`/`tracks_updated`/`profiles_updated`) past this
contract's `SyncResult`: a sync run whose only effect was a
`session.json` merge, or a track/profile last-write-wins transfer, showed
zero change under every field of the old three-field shape — a count the
UI needs and `SyncResult` lacked, which CLAUDE.md §1 pre-declares a STOP.
Ruled: the fields are right (a run that moved a session or a track and
reported "0 blobs, 0 workbooks" would be a lie to the user), so
`SyncResult` is amended to carry all six, each field's attribution
documented above exactly as `SyncRunResult`'s own doc comments define it.
Task 12 applies this amendment and the UI reads six numbers, not three.

**`pair_peer(peer_id: string, code: string)`** *Signature amended post-sign
(2026-09-07, lead ruling R104, L11 Task 12) — was `pair_peer(code: string)`
alone.* `peer_id`: the specific discovered peer (`sync_status`/
`peer_appeared`'s `PeerStatus.peer_id`) the user chose as the one currently
showing `code` on its own screen. This command never guesses which online
peer offered a code and never fans a pairing secret out to every unpaired
peer visible on the LAN — the caller names one. The UI may prefill
`peer_id` when exactly one unpaired peer is online, but always sends it
explicitly.
`code`: the 6-digit pairing code (design §7).
Return: `PeerStatus` (§3.9 above).
Errors: `sync`, `invalid_argument` (malformed code — wrong length/non-digit,
checked before `peer_id` is even resolved, so a malformed code never sends
a request), `not_found` (`peer_id` not currently visible on the LAN, or the
code that peer is offering does not recognise/has expired).

**`start_pairing()`** *Added post-sign (2026-09-06, lead ruling R88, L11
Task 1).* Mints a single-use, short-lived pairing code on this side so the
other side can call `pair_peer(peer_id, code)` against it — pairing is
symmetric (PLAN §8 Q4): either side presses "Show code", the other types
it.
Args: none.
Return:
```ts
interface PairingCode {
  code: string;          // the 6-digit code to display, digits only
  expires_at_ms: number; // i64, ms since epoch (PLAN §8 Q3: 120 s lifetime,
                          // burnt after 5 failed `pair_peer` attempts)
}
```
Errors: `sync`, `internal`.

**`unpair_peer(peer_id: string)`** *Added post-sign (2026-09-06, lead ruling
R88, L11 Task 1).* Forgets a paired peer: discards its stored token and
drops it from `sync_status`'s `paired_peers` list.
Return: `void`.
Errors: `sync`, `not_found` (unknown `peer_id`).

**`set_sync_device_name(name: string)`** *Added post-sign (2026-09-07, lead
ruling R105 item 1, L11 Task 13).* Renames this device: persists `name` to
`identity.json` (keeping `peer_id` unchanged) and updates the running
`SyncState` so `pair_peer`'s outgoing request reflects it for the rest of
the process's life. Does not retroactively change what an already-paired
peer displays for us — that name was copied into their own peer file at
pairing time. `name` is trimmed; blank/whitespace-only is rejected before
anything is written.
Return: `string` — the name actually stored (trimmed).
Errors: `invalid_argument` (blank/whitespace-only name), `sync` (the
identity file could not be written).

**`peer_appeared` event.** *Added post-sign (2026-09-06, lead ruling R88,
L11 Task 1).* Not attached to any single command's `Channel` argument
(§1) — mDNS discovery runs continuously in background state (PLAN §2's
"discovery lifecycle in state"), independent of any one call's lifetime.
Emitted as a Tauri app event (`app.emit("peer_appeared", payload)`,
frontend `listen<PeerStatus>("peer_appeared", ...)`) whenever a
`PeerStatus`-bearing peer newly becomes visible on the LAN, listed here the
way §3.4 lists `WorkbookEvent`'s payload shape:
```ts
// payload: PeerStatus (§3.9 above)
```
No error channel — a discovery-layer failure is not user-actionable per
event; it surfaces the next time `sync_status()` is polled.

### 3.10 App

**Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).** New
group: `get_settings`/`set_settings`, `get_data_dir`/`set_data_dir` and the
three profile commands are app and profile state — not catalog rows, not
import, not workbook, not tiles/rasters/cursor, not device I/O, not sync.
`app/src/ipc/app.ts` is the wrapper module (§1's one-module-per-group
rule); the group's commands live in `rust/tauri/src/commands/app.rs`.

**`get_settings()` / `set_settings(settings: AppSettings)`**
Satisfies wave-2 need L7-6 (ruling R53 Settings Q1).

```ts
/** Exactly `idl_rs::store::settings::AppSettings` and C4 §1's settings.json
 *  keys — no translation layer. */
interface AppSettings {
  data_dir: string | null;
  rider_name: string;                  // "" = not set (C4 §1)
  unit_system: "imperial" | "metric";  // engine default "imperial"
}
```
Both return `AppSettings` (the state after the call).

`get_settings` calls `store::settings::load(app_config_dir()/settings.json)`,
which never fails — a missing or malformed file yields defaults (C4 §1).
`set_settings` calls `store::settings::save`, a whole-document replace
through C4 §4's primitive, staged in the file's own directory.

`set_settings` ignores the `data_dir` field of its argument and echoes the
current value in its response — `set_data_dir` below is the sole writer of
that key (ruling R59 Q5).

Errors: `io`, `internal` (`SettingsErrorKind::Encode` folds to `internal`
per §2's folding rule; `load` never fails).

**`get_data_dir()` / `set_data_dir(path: string | null)`**
Satisfies wave-2 need L7-7 (ruling R53 Settings Q4).

```ts
interface DataDirInfo {
  /** The <data> root in use for this process (C4 §1). */
  resolved_path: string;
  /** The override from settings.json, or null when the platform default is in use. */
  override_path: string | null;
  /** True when `resolved_path` differs from what `override_path` would give —
   *  the override changed and the app has not restarted. */
  restart_required: boolean;
}
```
Both return `DataDirInfo`.

`resolved_path` is the managed `state::DataDir`, resolved once at startup
and cached for the process lifetime (C4 §1) — which is precisely why
`restart_required` is a real condition and not defensive coding.
`set_data_dir` writes only the `data_dir` key, read-modify-write,
preserving `rider_name` and `unit_system` (ruling R59 Q5); it does **not**
move existing files, and C4 §1 requires the UI to state that before
committing a change ("old data left at `<old path>`").

Errors: `invalid_argument` (a relative path, or one the app cannot
create), `io`, `internal`.

**`list_profiles()` / `save_profile(profile: BikeProfile)` / `delete_profile(profile_id: string)`**
Satisfies wave-2 need L7-11.

```ts
interface BikeProfile {
  profile_id: string; profile_name: string;
  created_at_ms: number; updated_at_ms: number;   // i64
  /** The SPEC §8 device-config document, stored and pushed verbatim. */
  config: Record<string, unknown>;
}
interface ProfileLoadReport {
  profiles: BikeProfile[];                        // sorted by profile_name ascending
  /** Files that failed to parse — never a failure of the whole load. */
  skipped: { path: string; reason: string }[];
}
```
`list_profiles` returns `ProfileLoadReport`; `save_profile` returns the
`BikeProfile` as written; `delete_profile` returns `void`. Thin over
`store::profile::{load_all, save, delete}` against `<data>/profiles/*.idl0p`
(C4 §2).

Core's `profile::delete` is idempotent — it no-ops on a missing file — but
the command layer raises `not_found` when the file is absent, so a delete
of a stale id doesn't silently succeed.

Errors: `not_found` (delete of an unknown id), `invalid_argument` (a
`config` that is not a JSON object), `io`, `internal`.

**`verify_data_dir(repair: boolean) -> VerifyReport`**
*Added post-sign (2026-09-06, L8x, ruling R86 Q8).* Runs whole-`<data>`-tree
maintenance (C4 §7's numbered check list), not a catalog read — it scans
every session, blob, workbook and track under `<data>`, none of which is a
single catalog row, which is why it sits here beside
`get_data_dir`/`set_data_dir` rather than in §3.2 Catalog.

```ts
interface VerifyReport {
  findings: { severity: "info"|"warning"|"error"; path: string; message: string }[];
  quarantined: QuarantineEntry[];   // empty unless repair === true
  elapsed_ms: number;
}
```

`repair: false` is `store::verify::verify` unchanged — read-only, returns
`findings` with an empty `quarantined`. `repair: true` additionally runs
the C4 §7 repair pass: findings #1 and #5 (a `blobs/` or `derived/`
file whose own SHA-256 disagrees with its path) are moved into
`tmp/quarantine/<uuid>-<original-name>` with a sidecar
`tmp/quarantine/<uuid>.json` (C4 §2 amendment) and appear in the returned
`quarantined` array; finding #9 (a stale catalog foreign key) still
auto-triggers the §5 rebuild as C4 §7 already specifies. `verify_data_dir`
is the **only** caller of the quarantine-producing repair path — the sole
route bytes take from "corrupt inside `<data>`" to `tmp/quarantine/`
(`list_quarantine`/`resolve_quarantine`, §3.2, only ever read or resolve
what this command filed).

Errors: `io`, `internal`.

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
10. **`TrackDetail`'s (§3.2, `get_track`) nested field shape — CLOSED
    2026-09-06 (L8x Task 1).** `track_artifact::model::Track` (`idl-rs`
    core) landed with a fixed serde shape; `lap_timing`, `neutral_zones`,
    `sector_gates` and `reference_polyline` are now typed `LapTiming |
    null`, `NeutralZone[]`, `SectorGate[]` and `GpsFix[]` respectively (§3.2,
    the `TrackDetail` block shared by `get_track`/`save_track`/
    `delete_track`) — no field is `unknown` any longer.
11. **`LapDetail.sectors`/`.neutral_zone_visits` (§3.2, round 2) element
    shape — CLOSED 2026-09-06 (L2b Task 5, R53 Q5).** Lap indexing landed
    (L2b Tasks 1–4) and with it `store::session_json`'s `SectorJson {
    name, start_ms, end_ms, start_time_secs, end_time_secs }` and
    `NeutralZoneVisitJson { name, enter_ms, exit_ms }` — the shapes
    `session.json` actually contains. This closes the guess this item
    originally recorded (IDL0_SPEC §15.2's illustrative
    `sector_name`/`sector_time_ms`, which the landed `SectorJson` does
    **not** match — the landed shape wins, per the ambiguity policy's rule
    that a signed contract is corrected to match landed truth rather than
    the reverse). `NeutralZoneVisitJson` does match §16.2b modulo naming.
    `LapDetail` above now types both as `LapSector[]`/
    `LapNeutralZoneVisit[]`. See C1 §6's `laps[]` block for the
    canonical field list.

### Wave-2 amendment (R59)

*Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane.)* Five
needs from the batched wave-2 IPC-needs lists, considered in
`runs/2026-09-05/C3-WAVE2-AMENDMENT-DRAFT.md` and deferred to wave 3 rather
than added to §3:

- **`list_quarantine` / `resolve_quarantine`** — landed 2026-09-06 (L8x),
  alongside `verify_data_dir` (§3.10) as the repair pass that files entries
  here (ruling R86 Q1).
- **`save_track` / `delete_track`** — landed 2026-09-06 (L8x), once
  open question 10's `TrackDetail` blocker closed; ruling R54's drop of the
  Track *editor UI* from the Data tab for wave 2 is unaffected — these
  commands back only the name/venue/delete edits IDL0_SPEC §24.12 already
  described (R86 Q7).
- **`rescan_track_visits`** — not a command gap but an engine gap:
  track-visit detection over a session does not exist in core and no lane
  owns it yet. *Landed 2026-09-06:* the engine gap is closed
  (`store::lap_index`, L2b Tasks 1–2) and its read-only command shipped as
  `rescan_tracks` (§3.2, L2b Task 8, PLAN Q8); `save_track`/`delete_track`
  (track writes) also landed 2026-09-06 (L8x), above.
- **`fetch_histogram`** — ruling R52 Q7. The 1-D histogram is genuinely new
  binning code, not a wrapper like `fetch_fft` (§3.6) is over the existing
  `idl_rs::fft`.
- **`fetch_scatter_points`** — filed by its own lane as wave 3; the density
  mode the G-G diagram needs is already served by
  `fetch_raster(kind: "histogram2d")`.

**For Isaac (carried from ruling R59 Q6):** could the firmware report SD
free bytes, GPS fix quality, satellite count and battery millivolts in the
SPEC §7.3 status block? `device_status` (§3.8) mirrors the landed
`idl_transport::ble_status::DeviceStatus` exactly, which has no field to
source those four values from. If the firmware can add them, a SPEC §7.3
amendment lets `device_status` grow additively (§5); if not, they stay
absent from the contract.

# C3 — IPC surface

**Status:** draft · **Date:** 2026-09-03 · **Owner:** lead

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
variants (`snake_case`), the four `TransportErrorKind` values (unprefixed,
since they are already domain-named and a fixed, tested contract from Task
2), plus the four cross-cutting kinds `not_found` / `invalid_argument` /
`io` / `internal`. Enum-sourced kinds that could collide across enums if
flattened naively (`MathEvalErrorKind::Parse` vs `ConfigErrorKind::Parse`)
are prefixed by source domain (`math_parse` vs `config_parse`) — this is the
only naming transform applied; nothing is renamed for style.

| `kind` | Source | Raised by (command group) |
|---|---|---|
| `ble` | `TransportErrorKind::Ble` | Device: `ble_scan`, `ble_connect`, `list_device_files`, `download_file`, `push_config` |
| `wifi` | `TransportErrorKind::Wifi` | Device: `list_device_files`, `download_file`, `push_config` |
| `config` | `TransportErrorKind::Config` | Device: `push_config` (device rejected or malformed the pushed config over the wire) |
| `sync` | `TransportErrorKind::Sync` | Sync: `sync_status`, `sync_now`, `pair_peer` |
| `parse_invalid_magic_bytes` | `ParseError::InvalidMagicBytes` | Import: `import_file` (`.idl0` source) |
| `parse_unsupported_schema_version` | `ParseError::UnsupportedSchemaVersion` | Import: `import_file` (`.idl0` source) |
| `parse_truncated_record` | `ParseError::TruncatedRecord` | Import: `import_file` (`.idl0` source, corrupt/incomplete file — recover what's readable per CLAUDE.md §5, surface as a warning in the returned `SessionSummary` rather than always rejecting; see open question 6.2) |
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
| `not_found` | cross-cutting | Catalog: `get_session`; Workbook: `open_workbook`, `eval_workbook`, `save_workbook`, `watch_workbook`; Tiles: `fetch_tile`; Rasters: `fetch_raster`; Cursor: `cursor_readout`; Device: `download_file`; Sync: `sync_now`, `pair_peer`; Import: `import_file` (source path missing) |
| `invalid_argument` | cross-cutting | Import: `import_file` (unknown `importer_id`); Workbook: `save_workbook` (malformed markdown/front matter); Tiles: `fetch_tile` (`tier` outside the engine's configured tier set); Rasters: `fetch_raster` (bad `width`/`height`/`kind`); Cursor: `cursor_readout` (unknown channel in the list); Sync: `pair_peer` (malformed code) |
| `io` | cross-cutting (also folds `ParseError::Io`, `ConfigErrorKind::Io`, `ExportError::Io`, `FitExportError::Io`) | any command that touches the filesystem: Catalog (all five), Import: `import_file`, Workbook (`open_workbook`, `save_workbook`, `watch_workbook`), Tiles: `fetch_tile`, Rasters: `fetch_raster`, Device: `download_file`, Sync: `sync_status` |
| `internal` | cross-cutting (also folds `ExportError::Json`) | any command — unexpected/programmer-error conditions that are not the caller's fault |

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
Return: `SessionSummary[]`
```ts
interface SessionSummary {
  session_id: string;
  device_id: string | null;       // null for FIT/GPX/CSV sources (no device)
  timestamp_utc_ms: number;       // i64, session start, Unix epoch milliseconds
  duration_s: number;             // f64, session length in seconds
  channel_count: number;          // u32
  source_kind: "idl0" | "fit" | "gpx" | "csv";
  blob_sha256: string;            // hex-encoded, lowercase
}
```
Errors: `io`, `internal`.

**`get_session(session_id: string)`**
Return: `SessionDetail`
```ts
interface SessionDetail extends SessionSummary {
  config_checksum: string | null; // null for non-device sources
  channels: ChannelSummary[];
  laps: LapSummary[];
}
interface ChannelSummary {
  channel_id: string;
  nominal_rate_hz: number;        // f64, metadata only — never used to synthesize time (design §5)
  unit: string;
  sample_count: number;           // u64
}
interface LapSummary {
  lap_index: number;              // u32, 0-based
  start_t_us: number;             // i64, µs on the session's t axis (C1 §3.1)
  end_t_us: number;                // i64, µs on the session's t axis
  distance_m: number | null;      // f64, null when no track/GPS to normalise against
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
Return: `WorkbookSummary[]`
```ts
interface WorkbookSummary {
  id: string;                 // front-matter `id` (C2)
  name: string;
  path: string;                // relative to <data>/workbooks/
  updated_utc_ms: number;      // i64, file mtime
}
```
Errors: `io`, `internal`.

**`list_tracks()`**
Return: `TrackSummary[]`
```ts
interface TrackSummary {
  track_id: string;
  name: string;
  length_m: number;   // f64
}
```
Errors: `io`, `internal`.

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
Errors: `not_found`, `io`, `internal`.

**`eval_workbook(id: string)`**
Return: `CellOutput[]`, one entry per cell, in document order.
```ts
interface CellOutput {
  cell_id: string;                          // C2 fence-string id
  kind: "math" | "table" | "js" | "prose";
  value: unknown | null;                    // present when evaluation succeeded; shape depends on `kind`
  error: IpcError | null;                    // present when this cell failed; other cells still evaluate
}
```
A per-cell failure (`math_*` kinds) never rejects the command — it appears
in that cell's `error` field. The command itself only rejects for a
condition that makes *no* cell evaluable: an unknown workbook id, or an I/O
failure reading the file.
Errors (command-level): `not_found`, `io`, `internal`.

**`save_workbook(id: string, markdown: string)`**
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
```ts
interface WorkbookEvent {
  kind: "changed" | "conflict";
  cell_ids: string[];   // cells affected by this event
}
```
Errors (on the initial `Promise` only): `not_found`, `io`, `internal`.

### 3.5 Tiles (L3)

**`fetch_tile(session_id: string, channel: string, tier: number, tile_index: number)`**
`tier`: `u32`, `0` = raw (bucket size 1), `k` = bucket size `TIER_BASE.pow(k)`
(`TIER_BASE = 8`, `rust/core/src/chart_decimation.rs`). `tile_index`: `u32`.
Return: raw bytes via `tauri::ipc::Response` (`Result<Response, IpcError>`),
decoded frontend-side into the layout below.
Errors: `not_found` (unknown `session_id` or `channel`), `invalid_argument`
(`tier` outside the engine's configured range), `io`, `internal`.

**Binary layout.** Little-endian throughout. Two regions after a fixed
32-byte header: a **sample region** (the existing bucket min/max pairs —
`decimate_channel`'s output, made self-describing) and a **column region**
(coarser per-pixel-column `min, max, mean` stats, shipped so hover reads
never need IPC — design §6, "Hover reads the per-pixel-column stats shipped
with each tile").

*Header (32 bytes, fixed):*

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLT"` |
| `version` | `u16` | 4 | Layout version, `1` for this contract |
| `tier` | `u16` | 6 | Echoes the request |
| `tile_index` | `u32` | 8 | Echoes the request |
| `sample_count` | `u32` | 12 | Number of `(min, max)` bucket pairs that follow. Today `decimate_channel` always fills `TILE_SIZE_BUCKETS = 1024` (right-edge-padded with NaN); `sample_count` makes the tile self-describing so a shorter final tile or a future tile-size change never requires a layout bump. |
| `column_count` | `u32` | 16 | Number of pixel columns in the stats table that follows. Independent of `sample_count` — chosen by the caller/L3 to match the rendered chart width (design §6 point budget), not tied to the bucket grid. |
| `flags` | `u32` | 20 | Reserved, `0` in this contract — see open question 6.4 |
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

*Total tile length:* `32 + sample_count*8 + column_count*12` bytes.

**Worked example — tier 3, 512 samples, 256 columns:**
```
header:              offset    0, length 32   → header occupies [0, 32)
sample region:        offset   32, length 512*8    = 4096   → [32, 4128)
column region:         offset 4128, length 256*12   = 3072   → [4128, 7200)
total tile length:     32 + 4096 + 3072 = 7200 bytes
```
Check: `4128 = 32 + 4096` ✓. `7200 = 4128 + 3072` ✓. `7200 = 32 + 4096 + 3072` ✓.

### 3.6 Rasters (L3)

**`fetch_raster(session_id: string, channel: string, kind: "spectrogram" | "histogram2d", width: number, height: number, params: Record<string, number>)`**
`width`/`height`: `u16`, output pixel dimensions. `params`: kind-specific
numeric parameters (e.g. `window_size`/`hop_size` for `"spectrogram"`,
`x_channel`/`y_channel` are not numeric so those stay as separate string
args if `kind` needs a second channel — flagged provisional, open question
6.3; the shape here is the interim, typed-but-generic contract).
Return: raw bytes via `tauri::ipc::Response`.
Errors: `not_found`, `invalid_argument` (bad `width`/`height`/`kind`/`params`), `io`, `internal`.

**Binary layout.** Little-endian throughout, header then row-major top-down
pixel data.

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
  values: Record<string, number | null>; // channel_id → interpolated/nearest value, null if the channel has no sample near t_us
}
```
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
Errors: `io`, `internal`.

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
`get_session`, `rebuild_catalog`, `list_workbooks`, `list_tracks`,
`list_importers`, `open_workbook`, `save_workbook` (explicit save action),
`watch_workbook` (one-time subscribe), `ble_scan`/`ble_connect`/
`list_device_files`/`download_file`/`push_config` (explicit user action on
the Device tab, never triggered by chart interaction), `sync_status`
(periodic poll on a timer, not per-frame), `sync_now`, `pair_peer`.

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
3. **`SessionDetail`/`ChannelSummary`/`LapSummary`/`WorkbookSummary`/
   `TrackSummary` field sets are provisional**, built from design §5's data
   model and inventory rows, not yet reconciled against C1 (session schema)
   or C4 (data directory), which land after this contract. Assigned: lead —
   revise §3.2/§3.4 field lists to match C1/C4 once both are signed; this
   is expected to be additive (new fields), not a rename, so it should not
   need a full C3 revision cycle, but if a field's type turns out wrong
   here it does.
4. **`fetch_raster`'s `params` bag is generic (`Record<string, number>`)
   because the raster kinds' actual parameters aren't fixed anywhere yet**
   (design §4 says only "core computes STFT or 2-D histogram"). A
   `"histogram2d"` raster also plausibly needs a second channel id, which
   isn't a number and doesn't fit `params` as typed here. Assigned: L3 —
   pin `SpectrogramParams { window_size: number; hop_size: number }` and
   `Histogram2dParams { y_channel: string; x_bins: number; y_bins: number }`
   (or similar) before implementation, and revise §3.6 in the same change.
5. **Tile `flags: u32` (§3.5 header) has no defined bits.** Reserved and
   zero in this contract. Assigned: lead/L3 — define bit 0 onward if/when a
   need appears (e.g. "this tile is provisional, a materialised channel is
   still computing"); until then callers must treat it as always `0`.
6. **Whether `ble_scan` is the right shape (stream-only, discovery events,
   no final list) vs. also returning a snapshot list on resolve** isn't
   settled by the design doc. Assigned: L4 — the transport crate's actual
   `btleplug` usage will make the natural shape obvious; revise §3.8 to
   match once L4 has working code, rather than guessing here.

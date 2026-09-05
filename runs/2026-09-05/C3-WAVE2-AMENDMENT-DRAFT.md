# C3 wave-2 write amendment — DRAFT for the lead

**Status:** draft, unsigned · **Date:** 2026-09-05 · **Author:** adjudicator
(read-only pass; no repo source, spec, CHANGELOG or TASKS touched, nothing built)

Amends `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` (C3, signed
2026-09-02, post-sign rulings R7, R21, R22, R25, R41–R45, R57). Written per
wave-2 operating brief §3/§4: the UI lanes wrote their needs into two
IPC-needs files and built against typed stubs; this is the single batched
amendment those stubs are replaced from, and the specification the one Rust
write lane implements.

**Six entries below are PROVISIONAL** — marked inline, each tied to a
numbered question in §E. Nothing in §E is decided here; §E states a
recommendation and this draft is written as if that recommendation held, so
the lane is not blocked by an unanswered question.

**Sources read.** C3 in full; C1 §2/§4/§6; C4 §1/§2/§3/§5/§7; the wave-2
operating brief; both IPC-needs lists; rulings R41–R58 in
`runs/2026-09-03/decisions.md`; the three landed/worktree `ipcStubs.ts` files
and their call sites; and the landed Rust each command wraps —
`core/src/store/{settings,profile,session_json,catalog_read,import,verify}.rs`,
`core/src/import/`, `tauri/src/{paths,state,error,lib}.rs`,
`tauri/src/commands/device.rs`,
`transport/src/{ble_status,ble_control,ble_config,device}.rs`.

---

## A. Amendment entries, by C3 §3 group

Conventions are C3 §1's, unchanged: `snake_case` verb-first names, named Tauri
parameters (not one wrapped object), `snake_case` JSON fields matching the
Rust struct fields verbatim, `Result<T, IpcError>` for everything fallible,
`tauri::ipc::Response` for heavy arrays. Error kinds are drawn from C3 §2 only,
with one proposed addition (§A.4, question Q4).

### A.1 Catalog (§3.2) — three commands added

**`save_session_metadata(session_id: string, metadata: SessionMetadataPatch)`**
*Satisfies L7 IPC need 1. Replaces `Data/ipcStubs.ts::saveSessionMetadata`.*

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
Return: `SessionDetail` (C3 §3.2).

Reads `session.json`, replaces exactly those nine fields, leaves every other
key (`laps`, `track_visits`, the lap-flag fields, `bike_profile_snapshot`,
`schema_version`) untouched, writes through
`store::session_json::write_session_json` (C4 §4 atomic write), then re-reads
and returns `catalog_read::get_session`'s `SessionDetail` so the pane redraws
from canonical truth rather than from what it hoped it wrote.

Unknown keys in `metadata` are ignored, not rejected. This is deliberate and
load-bearing: `Data/metadataDraft.ts`'s `toSavePayload` returns the nine
fields **plus a redundant `session_id`**, and `MetadataForm.tsx` passes that
whole object as the second argument. Serde's default ignore-unknown behaviour
makes that a no-op, so **no UI change is required**; dropping `session_id`
from `toSavePayload` is optional tidying, not a fix.

The catalog row is **not** re-indexed by this command. C4 §5's "nothing reads
the catalog for truth" permits the row to be briefly stale and
`rebuild_catalog` reconciles it — the same position R51 Q4 took for import.

Errors: `not_found` (unknown `session_id`), `invalid_argument` (a field that
is not a string), `io`, `internal`.
**PROVISIONAL — see Q1** (optimistic-concurrency check). Written here as a
read-modify-write inside the command, which is why `conflict` is absent from
the error list.

---

**`delete_session(session_id: string, delete_blob: boolean)`**
*Satisfies L7 IPC need 3. Replaces `Data/ipcStubs.ts::deleteSession`.*

Return: `void`.

Removes `<data>/sessions/<session_id>/` recursively and the catalog rows for
that session. `delete_blob: true` additionally removes the blob at
`blobs/sha256/<2>/<62>` named by the session's `blob_sha256`; `false` keeps it
(idl0's "Forget session"). The split is CLAUDE.md §3's "log files and blobs
are immutable" made explicit — two genuinely different destructive actions,
not one with a checkbox nobody notices. The signature matches
`Data/maintenance.ts`'s `DeleteSessionFn` exactly; no UI change.

A blob still referenced by another session is never removed even when
`delete_blob: true` — blobs are content-addressed and shared by construction
(C4 §3).

Errors: `not_found` (unknown `session_id`), `io`, `internal`.

---

**`list_quarantine()` / `resolve_quarantine(entry_id: string, action: "retry" | "discard")`**
*Satisfies L7 IPC need 4. Replaces `Data/ipcStubs.ts::listQuarantine` and
`resolveQuarantine`.*

```ts
interface QuarantineEntry {
  entry_id: string;            // the <uuid> prefix of the file name (C4 §2)
  path: string;                // absolute, under <data>/tmp/quarantine/
  original_name: string;       // the <original-name> suffix (C4 §2)
  quarantined_at_ms: number;   // i64, file mtime
  reason: string;              // see Q2 — no on-disk source exists today
}
```
`list_quarantine` walks `<data>/tmp/quarantine/` and returns one entry per
file; `resolve_quarantine` moves the file back to its recorded original
location (`"retry"`) or deletes it (`"discard"`), returning `void`.
`Data/maintenance.ts` binds only `entries.length` and the
`(entryId, action)` argument shape, so the entry fields above are free; no UI
change either way.

Errors: `not_found` (unknown `entry_id`), `invalid_argument` (unknown
`action`), `io`, `internal`.
**PROVISIONAL — see Q2.** Nothing in landed core writes a quarantine file:
`store::verify::verify` returns `Finding`s and performs no repair action, and
C4 §7 records no sidecar carrying `reason` or the original location. As
written today both commands would be correct and permanently empty. Q2
recommends deferring this need to wave 3.

---

**Deferred in this batch, with cause:**

- **`save_track` / `delete_track`** (L7 need 2). Blocked by C3 §6 item 10:
  `TrackDetail.lap_timing`, `.neutral_zones`, `.sector_gates` and
  `.reference_polyline` are typed `unknown` because no
  `track_artifact::model::Track` Rust struct exists to read the serde shape
  from. A write command over `unknown` fixes a wire format nobody can
  validate. R54 already dropped the Track facet from the Data tab for wave 2,
  and the L7a plan defers the track editor itself to wave 3, so no wave-2
  surface needs these. `Data/ipcStubs.ts`'s `saveTrack`/`deleteTrack` stay
  stubs. Returns with C3 §6 item 10's resolution, not before.
- **`rescan_track_visits`** (L7 need 5). Not a command gap: track-visit
  detection over a session does not exist in core and no lane owns it. L7a
  dropped it rather than stubbing it. Wave 3.
- **`parse_workbook_cells`** (L6 N2). **Superseded by R52 Q3** — the editor's
  cell segmentation is a narrow, non-authoritative TypeScript fence scan
  (L6 plan Task 4), and Rust stays the only evaluator. No command.
- **Lap indexing at import** (R53 Data Q4). Not an IPC command at all, but it
  gates `list_laps`, `SessionSummary.lap_count`, `eval_workbook`'s
  `lap_context` (§A.2) and `fetch_fft`'s `lap` argument (§A.3) — each
  specified here but empty or rejecting until it lands. R53 puts it on the
  Rust backlog after this lane. Carried in §C.

### A.2 Workbook (§3.4) — three commands added, one amended

**`read_workbook(id_or_path: string)`**
*Satisfies L6 N1 (the lane's hard blocker). Ruling R52 Q4.*

```ts
interface WorkbookSource {
  markdown: string;   // the file's UTF-8 text, verbatim
  hash: string;       // sha256 of those bytes, hex — the `based_on_hash` a later save passes
  path: string;       // absolute, under <data>/workbooks/
}
```
Returns bytes and **does not parse**. Deliberately does not raise the four
document-fatal `workbook_*` kinds: a document whose front matter is malformed
must still be readable in order to be repaired in the editor. That separation
from `open_workbook` is the entire point of the command.

This closes a gap that made `save_workbook` unusable as specified. R44 defines
`based_on_hash` as "the hash the editor last read", no command let the editor
read anything, and `null` against an existing file errors by `write_atomic`'s
own semantics. Reading the file through a Tauri fs plugin was rejected (R52
Q4): it bypasses the `<data>` resolution C4 §1 owns and puts a second,
uncontrolled reader on a path C4 §4 assumes is single-reader.

Errors: `not_found`, `io`, `internal`.

---

**`create_workbook(name: string)`**
*Satisfies L6 N8. Ruling R48 (filename derivation).*

Mints a UUIDv4 id, writes a minimal valid v3 document (front matter with `id`,
`name` and `version: 3`; no cells), and returns C3 §3.4's existing
`WorkbookHandle`. The file name derives from `name`, filesystem-sanitised
(R48), **not** from the id.

**One correction to L6 N8 as filed (contained, decided here).** N8 lists `io`
for "a file of that name already exists". C4 §2 fixes the opposite behaviour:
a `file_name` collision on create follows the `session_filename.dart`
convention (SPEC §15.1) and appends `-2`, `-3`, …. A signed contract beats a
needs-list note, so a collision is **not** an error — the command
disambiguates and returns the handle carrying the name it actually used.

Errors: `invalid_argument` (empty `name`, or a name that sanitises to an empty
filename), `io`, `internal`.

---

**`eval_workbook(id: string, session_id: string | null, lap_context: LapContext | null)`**
*Amends the existing command. Satisfies L6 N4. Ruling R52 Q5.*

```ts
interface LapContext {
  main_lap: number | null;    // 1-based, matching C3 §3.2 LapSummary.lap_number
  overlay_laps: number[];     // 1-based, may be empty
}
```
`null` keeps today's behaviour exactly (`MathLapContext::empty()`), so the
argument is additive and no existing caller changes. Six `Implemented`
functions in C2 §3.3 read `MathLapContext` and are unreachable without it:
`current_lap()`, `sector_number()`, `lap_start_time(n)`,
`lap_start_distance(n)`, `variance_time(ch)` and `variance_dist(ch)`. The last
two need idl0's Main/Overlay designation, which C2 v3 gives no home — and per
R41's own reasoning must not have one, because the designation is a UI
selection, not a property of the file. R53 Data Q3 fixed the matching frontend
slice (`state/AppState.tsx`'s `selection.lapContext = { mainLap, overlayLaps }`),
so L7a writes it and L6 passes it through unchanged.

**On C3 §5.** §5 forbids changing a signature in place for a **breaking**
change. An `Option`-typed trailing argument that Tauri deserialises to `None`
when absent, and whose `None` reproduces today's behaviour bit for bit, is not
breaking; R41 (`session_id`) and R43 (`column_count`) set that precedent
post-sign on this same contract. No `_v2` command, no deprecation window.

Errors: unchanged (C3 §3.4), plus `invalid_argument` when a named lap does not
exist on `session_id`, with `detail { lap }`.

**Note for the lane.** Until lap indexing at import lands (§A.1's deferral
list), no session has laps, so every non-null `lap_context` rejects. The
argument is still correct to add now — L6 has nowhere else to put the
designation — but the feature it unlocks arrives with that backlog item.

---

**`fetch_host_channel(workbook_id: string, session_id: string | null, def_name: string, budget: number)`**
*Satisfies L6 N3. Ruling R52 Q6 (L6 designs the layout, the Rust write lane
implements it). Closes C3 §3.4's "host-channel byte path" open item, which R45
deferred to wave 2.*

`budget`: `u32`, max points, validated `1..=65536`. Returns raw bytes via
`tauri::ipc::Response` (`Result<Response, IpcError>`), so arguments and
existence are validated before any byte is produced (C3 §1).

**Binary layout `IDLH`, version 1.** Little-endian throughout.

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLH"` |
| `version` | `u16` | 4 | `1` |
| `flags` | `u16` | 6 | bit 0 = `has_t`; all other bits reserved, zero |
| `length` | `u32` | 8 | number of `f64` values in `v` |
| `t_length` | `u32` | 12 | number of `f64` values in `t`; `0` when the source has no recorded axis |
| `reserved` | `[u8; 8]` | 16 | zero-filled |

Header ends at byte offset **24**. Then `t` as `t_length` × `f64` at offset 24
(seconds, matching `to_host_channel`'s µs→s conversion), then `v` as `length`
× `f64` at offset `24 + t_length*8`. Total length
`24 + t_length*8 + length*8`.

`t` is empty (`t_length == 0`, `has_t` clear) when the source has no recorded
axis — a scalar or table-column result (C1's "time is recorded, not assumed",
C3 §3.4's host-channel note). Decimation to `budget` happens before these
bytes are produced, so `length` is always ≤ `budget`.

Errors: `not_found` (unknown workbook or definition), `invalid_argument`
(`budget` outside range), the `math_*` kinds when the definition itself fails
to evaluate, `io`, `internal`.
**PROVISIONAL — see Q3.** L6 filed a 20-byte header before an `f64` array;
this draft pads it to 24 so both payload arrays start 8-byte aligned. Q3 asks
the lead to confirm, and flags the same class of issue in the landed `IDLT`
layout.

### A.3 Rasters and DSP (§3.6) — one command added

**`fetch_fft(session_id: string, channel: string, lap: number | null, params: SpectrogramParams, averaging: "none" | "mean" | "max" | "median")`**
*Satisfies L6 N5. Ruling R52 Q7 (FFT in; the 1-D histogram deferred).*

`params` reuses C3 §3.6's `SpectrogramParams` verbatim — the same window, hop,
detrend and scaling vocabulary over the same `idl_rs::fft` types.
`averaging` is idl0's cross-segment `Averaging`. Returns raw bytes via
`tauri::ipc::Response`.

**Binary layout `IDLF`, version 1.** Little-endian throughout.

| Field | Type | Byte offset | Notes |
|---|---|---|---|
| `magic` | `[u8; 4]` | 0 | ASCII `"IDLF"` |
| `version` | `u16` | 4 | `1` |
| `reserved` | `[u8; 2]` | 6 | zero-filled |
| `bin_count` | `u32` | 8 | number of `f32` magnitudes that follow |
| `sample_rate_hz` | `f32` | 12 | the channel's real rate, derived from its recorded `t_us` axis |

Header ends at byte offset **16**; magnitudes are `bin_count` × `f32` from
offset 16. Total `16 + bin_count*4`. Bin `k`'s frequency is
`k * sample_rate_hz / (2 * bin_count)`, derived frontend-side from the two
header fields, so no second array crosses.

This is a wrapper over the `idl_rs::fft` the spectrogram raster already uses,
not new DSP. The math catalog's `fft(ch, window)` is not a substitute: its
result is a bin-indexed channel with no frequency axis attached, so a chart
built on it would synthesise the axis in JavaScript, which CLAUDE.md §2
forbids.

Errors: `not_found`, `invalid_argument` (bad `params`, or a `lap` not present
on the session), `io`, `internal`.
**PROVISIONAL — see Q3** (header padding; L6's filing left the offsets
unstated). As with `eval_workbook`, `lap` must be `null` in practice until lap
indexing at import lands.

**Deferred:** `fetch_histogram` (L6 N6) — R52 Q7 defers the 1-D histogram to
wave 3; unlike the FFT it is genuinely new binning code, not a wrapper.
`fetch_scatter_points` (L6 N7) — filed by the lane as wave 3 itself; the
density mode the G-G diagram actually needs is already served by
`fetch_raster(kind: "histogram2d")`.

### A.4 Device (§3.8) — six commands added

**`connect_device(device_id: string)` / `disconnect_device(device_id: string)`**
*Satisfies L7 IPC need 13. Ruling R53 Device Q4 (a managed connection plus
status and control are one piece of work). Replaces
`Device/ipcStubs.ts::connectDevice`/`disconnectDevice`.*

`connect_device` returns C3 §3.8's existing `ConnectionInfo` and leaves the
BLE link **open**, held in a new `state::Connections` map
(`Mutex<HashMap<String, ConnectedDevice>>`, registered in `app/src-tauri`'s
`.setup()` beside `DataDir`/`Hashes`/`Watchers`). `disconnect_device` tears it
down and returns `void`; disconnecting an unconnected device is a no-op, not
an error.

C3 §3.8's existing `ble_connect` is **unchanged and stays registered**: it
connects, reads firmware, and disconnects inside its own call. Per C3 §5 this
is an added command, not a changed signature. `commands/device.rs`'s own
module doc names this exact deferral ("a persistent connection manager … is
left to whichever later task builds that UI"); this is that task.

`device_status`, `device_control` and `pull_config` below use the managed link
when one exists for `device_id` and otherwise connect-act-disconnect, so the
Device tab works either way and a dropped link degrades rather than fails.

Errors: `ble`, `not_found` (device not discoverable), `internal`.

---

**`device_status(device_id: string)`**
*Satisfies L7 IPC need 8. Replaces `Device/ipcStubs.ts::deviceStatus`.*

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
malformed value for a known key leaves that field `None` rather than failing
the parse.

**This is not the shape L7 IPC need 8 proposed, and the difference matters.**
Need 8 asked for `mode`, `recording`, `sd_card_present`, `sd_free_bytes`,
`gps_fix_quality`, `gps_satellites`, `imu_ok`, `hrm_connected`,
`battery_millivolts` and `firmware_version`. Four of those —
`sd_free_bytes`, `gps_fix_quality`, `gps_satellites`, `battery_millivolts` —
have **no source**: SPEC §7.3's status block carries no free-space, fix-quality,
satellite-count or millivolt line, and the landed parser has no field to read
them from. Inventing them would put four permanently-null fields in a signed
contract. The rest are renames or narrowings of what the transport already
returns (`mode`/`recording` are derivable in the UI from `wifi_on` and
`logging`, which is a label, i.e. pixels). **No UI change is required today**:
`Device/ipcStubs.ts::deviceStatus` returns `Promise<never>` and has no call
site, so nothing is built against need 8's shape. The Device tab's status card
is written against this shape when it is wired.

Errors: `ble`, `not_found`, `internal`.
**PROVISIONAL — see Q6** (this entry contradicts a findings file).

---

**`device_control(device_id: string, command: "start_recording" | "stop_recording" | "wifi_on" | "wifi_off")`**
*Satisfies L7 IPC need 9. Replaces `Device/ipcStubs.ts::deviceControl`.*

Return: `DeviceStatus` (above) — the post-transition status, so the UI never
has to guess whether the device took the instruction.

`command` maps onto `idl_transport::ble_control::ControlCommand`:
`start_recording` → `StartLogging` (0x03), `stop_recording` → `StopLogging`
(0x04), `wifi_on` → `WifiOn` (0x01), `wifi_off` → `WifiOff` (0x02). The other
five `ControlCommand` variants are **not** exposed: `CalibrateImu` is wave 3
(SPEC §7.6), `OtaConfirm` belongs to the deferred firmware path, and
`ConfigBegin`/`ConfigCommit`/`ConfigReadBegin` are internal to
`push_config`/`pull_config`.

SPEC §7.2's ACK `0x00` means "accepted and dispatched", not "completed" —
completion is the FF04 status notify. The command therefore writes, then polls
status until the transition is observed or a bounded timeout expires, the same
pattern `list_device_files` already uses for `WifiOn` in
`commands/device.rs`. A timeout returns the last status read rather than
failing, so the UI shows what the device actually reports.

Errors: `ble`, `not_found`, `invalid_argument` (unknown `command` string),
`device_rejected` (the device returned a non-success `AckCode` — SPEC §10.4
suspends BLE control in WiFi mode, and a reboot would abort a recording), and
`internal`.
**PROVISIONAL — see Q4.** `device_rejected` is a **proposed new §2 kind**, not
an existing one; Q4 states the alternative and the justification.

---

**`pull_config(device_id: string)`**
*Satisfies L7 IPC need 10. Replaces `Device/ipcStubs.ts::pullConfig`.*

Return: `string` — the device's live `idl0_config.json` as a JSON string,
symmetric with `push_config`'s `config_json` argument. Drives
`ControlCommand::ConfigReadBegin` (0x09) and reassembles the chunks through
the landed `ble_config::reassemble_config_reads`; `ble_config::configs_match`
is what a caller uses for the verify half of a push.

Without this command, SPEC §7.2's "a push is verified by reading the config
back" cannot be honoured, and the L7b plan's `describePushResult` can only
ever return "applied", never "applied and verified".

Errors: `ble`, `not_found`, `config` (the device returned something
unparseable — this is the §2 `config` kind's own meaning, a config document
malformed on the wire), `internal`.

---

**`preview_channel_registry(config_json: string)`**
*Satisfies L7 IPC need 12. Ruling R53 Device Q1 — (c) for wave 2, (b) here:
the preview joins the Rust write-amendment lane and L7b Task 4 widens onto it.*

```ts
interface RegistryRow {
  channel_id: number;                          // u16, SPEC §5.2
  data_type: "i16" | "i32" | "u8" | "u16" | "u32";
  sample_rate_hz: number;                      // 0 = event-driven (SPEC §5.7)
  scale: number; offset: number;
  name: string; units: string;
}
```
Return: `RegistryRow[]` — a pure function of the config document, no device
I/O. It lives in the Device group because that is the only surface that calls
it, but its implementation is in `core` (see §C): `scale = range / 32768` is
the wire contract's own formula (SPEC §3) and `core::parse` already owns it.
R53's layer call under CLAUDE.md §1/§2 is that this is physics of the bike,
and a second copy in TypeScript is exactly the drift the standing reviewer
brief calls a finding.

Errors: `config_parse`, `config_unsupported_version` (both already in C3 §2's
table; **neither is implemented in `IpcErrorKind` yet** — see §C),
`invalid_argument`, `internal`.

### A.5 App (new §3.10) — seven commands added

**New group.** `get_settings`/`set_settings`, `get_data_dir`/`set_data_dir`
and the three profile commands are app and profile state: not catalog rows,
not import, not workbook, not tiles/rasters/cursor, not device I/O, not sync.
Both IPC-needs lists proposed a new group rather than stretching an existing
one, and this draft adopts it. `app/src/ipc/app.ts` is the wrapper module
(C3 §1's one-module-per-group rule); the group's commands live in
`rust/tauri/src/commands/app.rs`.

**`get_settings()` / `set_settings(settings: AppSettings)`**
*Satisfies L7 IPC need 6. Ruling R53 Settings Q1. Replaces
`Settings/ipcStubs.ts::getSettings`/`setSettings`.*

```ts
/** Exactly `idl_rs::store::settings::AppSettings` and C4 §1's settings.json
 *  keys — no translation layer. */
interface AppSettings {
  data_dir: string | null;
  rider_name: string;                  // "" = not set (C4 §1)
  unit_system: "imperial" | "metric";  // engine default "imperial"
}
```
Both return `AppSettings` (the state after the call). This is byte-for-byte
the interface `Settings/ipcStubs.ts` already declares, so the swap is an
import-path change and **no UI change is required**.

`get_settings` calls `store::settings::load(app_config_dir()/settings.json)`,
which never fails — a missing or malformed file yields defaults (C4 §1's
"this bootstrap file's own corruption must never block the app from
opening"). `set_settings` calls `store::settings::save`, a whole-document
replace through C4 §4's primitive, staged in the file's own directory.

The swap task additionally performs R53 Settings Q1(c)'s **one-time import**:
read the `localStorage` keys L7c shipped behind `PrefsBackend`, write them
into `settings.json` through `set_settings`, then delete them, so no
preference set before this lane is silently lost. That is frontend work in
L7c's directory, not part of the command.

Errors: `io`, `internal` (`SettingsErrorKind::Encode` folds to `internal` per
C3 §2's folding rule; `load` never fails).
**PROVISIONAL — see Q5** (which command owns the `data_dir` key).

---

**`get_data_dir()` / `set_data_dir(path: string | null)`**
*Satisfies L7 IPC need 7. Replaces `Settings/ipcStubs.ts::getDataDir`/
`setDataDir`, which `Settings/DataSection.tsx` already calls.*

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
Both return `DataDirInfo`, byte-for-byte the interface
`Settings/ipcStubs.ts` already declares; **no UI change required**.

`resolved_path` is the managed `state::DataDir`, resolved once at startup and
cached for the process lifetime (C4 §1) — which is precisely why
`restart_required` is a real condition and not defensive coding.
`set_data_dir` writes only the `data_dir` key, read-modify-write, preserving
`rider_name` and `unit_system`; it does **not** move existing files, and C4 §1
requires the UI to state that before committing a change ("old data left at
`<old path>`"), which L7c's Data section already does.

Errors: `invalid_argument` (a relative path, or one the app cannot create),
`io`, `internal`.
**PROVISIONAL — see Q5.**

**Riding along, not a command (R53 Settings Q4):** the BOM strip in
`paths::resolve_data_dir`. A `settings.json` written by Windows tooling with a
UTF-8 BOM currently fails `serde_json::from_str` and falls back to
`unwrap_or_default()`, so the override reads as absent and the app silently
uses the platform default. One `trim_start_matches('\u{feff}')` and one test.
Without it, an override set from the Settings tab can appear to do nothing.

---

**`list_profiles()` / `save_profile(profile: BikeProfile)` / `delete_profile(profile_id: string)`**
*Satisfies L7 IPC need 11. Replaces `Device/ipcStubs.ts::listProfiles`,
`saveProfile`, `deleteProfile`.*

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
(C4 §2). `ProfileLoadReport.skipped` maps core's `Vec<(PathBuf, String)>` to
an object per entry, because a two-element JSON array is a worse thing to read
than two named keys.

`BikeProfile` matches `Device/profiles.ts`'s `ProfileView` field for field;
`ProfileView` types `config` as the lane's own `DeviceConfig` rather than
`Record<string, unknown>`, which serialises identically. **No UI change
required.** Timestamps are supplied by the caller (the profiles reducer
already sets them), and the command stores what it is given.

**One correction to need 11 as filed (contained, decided here).** Core's
`profile::delete` is idempotent — it no-ops on a missing file — while need 11
lists `not_found`. The command raises `not_found` when the file is absent, in
the command layer, leaving core's function unchanged. A delete that silently
succeeds against a stale id tells the UI nothing.

Errors: `not_found` (delete of an unknown id), `invalid_argument` (a `config`
that is not a JSON object), `io`, `internal`.

### A.6 Two observations, not amendments

- **§3.9 Sync has no backend.** `app/src/ipc/sync.ts` landed on `main` typed
  to C3 §3.9, and the Settings tab polls `sync_status` every five seconds
  while visible, but `idl_rs_tauri::handler()` registers no sync command. Each
  call therefore rejects with Tauri's own "command not found" error, which is
  **not** an `IpcError`, so `Settings/errors.ts` cannot classify it. L11 owns
  the fix and this batch does not touch it; flagged because the L7c landing
  record describes these three as "real".
- **`IpcErrorKind` lags C3 §2's table.** The landed enum
  (`rust/tauri/src/error.rs`) has no `parse_*`, `import_*`, `config_parse`,
  `config_unsupported_version`, `export_*`, `workbook_invalid_front_matter` or
  `workbook_invalid_cell_id` variants, though §2 lists all of them. This lane
  needs `config_parse` and `config_unsupported_version` for
  `preview_channel_registry`; L5 Task 9 needs the `parse_*` and `import_*`
  rows for `import_file`. Adding a variant is additive per C3 §5.

---

## B. Every IPC need, and what happened to it

Twenty-one needs: L7 needs 1–13, L6 needs N1–N8.

| Need | Command(s) | Disposition | Authority |
|---|---|---|---|
| L7-1 | `save_session_metadata` | **Included** (§A.1), provisional on Q1 | operating brief §3 known gap |
| L7-2 | `save_track`, `delete_track` | **Deferred to wave 3** | C3 §6 item 10 (shapes unpinned); R54 |
| L7-3 | `delete_session` | **Included** (§A.1) | operating brief §3 known gap |
| L7-4 | `list_quarantine`, `resolve_quarantine` | **Included, provisional** (§A.1) — Q2 recommends deferring | no ruling; C4 §7 has no writer |
| L7-5 | `rescan_track_visits` | **Deferred to wave 3** | needs engine work; L7a dropped it |
| L7-6 | `get_settings`, `set_settings` | **Included** (§A.5), provisional on Q5 | R53 Settings Q1 |
| L7-7 | `get_data_dir`, `set_data_dir` | **Included** (§A.5), provisional on Q5 | R53 Settings Q4 (+ BOM strip) |
| L7-8 | `device_status` | **Included, reshaped** (§A.4), provisional on Q6 | SPEC §7.3 + landed `ble_status.rs` |
| L7-9 | `device_control` | **Included** (§A.4), provisional on Q4 | R53 Device Q4 |
| L7-10 | `pull_config` | **Included** (§A.4) | SPEC §7.2; `ControlCommand::ConfigReadBegin` |
| L7-11 | `list_profiles`, `save_profile`, `delete_profile` | **Included** (§A.5) | C4 §2 `profiles/`; landed `store::profile` |
| L7-12 | `preview_channel_registry` | **Included** (§A.4) | R53 Device Q1 — (c) now, (b) here |
| L7-13 | `connect_device`, `disconnect_device` | **Included** (§A.4) | R53 Device Q4 |
| L6-N1 | `read_workbook` | **Included** (§A.2) | R52 Q4 |
| L6-N2 | `parse_workbook_cells` | **Superseded** — TS fence scan instead | R52 Q3 |
| L6-N3 | `fetch_host_channel` | **Included** (§A.2), provisional on Q3 | R52 Q6; closes C3 §3.4's open item |
| L6-N4 | `eval_workbook` + `lap_context` | **Included** (§A.2) | R52 Q5; R53 Data Q3 |
| L6-N5 | `fetch_fft` | **Included** (§A.3), provisional on Q3 | R52 Q7 |
| L6-N6 | `fetch_histogram` | **Deferred to wave 3** | R52 Q7 |
| L6-N7 | `fetch_scatter_points` | **Deferred to wave 3** | L6 plan; `histogram2d` covers the real use |
| L6-N8 | `create_workbook` | **Included** (§A.2) | R48 |

Totals: **17 commands added** across five groups, **1 command amended**
(`eval_workbook`), **1 superseded**, **5 needs deferred to wave 3**.

---

## C. Who implements what

**Thin wrappers over landed core or transport — command layer only.**

| Command | Wraps |
|---|---|
| `get_settings`, `set_settings` | `store::settings::{load, save}` |
| `list_profiles`, `save_profile`, `delete_profile` | `store::profile::{load_all, save, delete}` |
| `get_data_dir`, `set_data_dir` | `state::DataDir` + `store::settings::save` |
| `save_session_metadata` | `store::session_json::{read_session_json, write_session_json}` + `catalog_read::get_session` |
| `read_workbook` | `std::fs::read` under `<data>/workbooks/` + `store::atomic::sha256_hex` |
| `device_status` | `ble_status::parse_status` over the FF04 read |
| `device_control` | `ble_control::{ControlCommand, AckCode}` + the existing poll pattern |
| `pull_config` | `ControlCommand::ConfigReadBegin` + `ble_config::reassemble_config_reads` |

**Needs new core code.**

| Command | New work |
|---|---|
| `fetch_fft` | An `fft` wrapper producing a magnitude spectrum plus the real sample rate, over the existing `idl_rs::fft` the spectrogram already uses. Plus the `IDLF` encoder beside `core/src/raster.rs`. |
| `fetch_host_channel` | The `IDLH` encoder and the host-side decimation to `budget`, over L3's `to_host_channel`. |
| `preview_channel_registry` | A `pub fn` in `core` deriving registry rows from a parsed config, reusing `core::parse`'s own `scale = range / 32768` (SPEC §3) rather than restating it. |
| `create_workbook` | Minimal-v3-document synthesis plus C4 §2's `-2`/`-3` collision suffixing. |
| `delete_session` | Recursive session-directory removal, catalog row removal, and the conditional blob removal with a shared-reference check. |
| `list_quarantine`, `resolve_quarantine` | The entire quarantine mechanism — nothing writes these files today (Q2). |
| `eval_workbook` `lap_context` | Building a real `MathLapContext` from `session.json` laps plus the main/overlay designation. |

**Needs `app/src-tauri` changes (a Tauri build, so batched into this lane).**

1. `state::Connections` registered in `.setup()` beside the three existing
   managed values, for the managed BLE link (§A.4).
2. The dialog plugin, per R55: `@tauri-apps/plugin-dialog` in
   `app/package.json`, `tauri-plugin-dialog` in `app/src-tauri/Cargo.toml`,
   `.plugin(tauri_plugin_dialog::init())` in `app/src-tauri/src/lib.rs`, and
   `"dialog:default"` added to `capabilities/default.json`'s `permissions`
   (which today carries only `core:default`). L7a's `pickImportFile()` seam is
   then swapped from the pasted-path input by a lead shell task.
3. Nothing else: every new command registers in
   `idl_rs_tauri::handler()`, which is exactly why that indirection exists.

**Also in this lane, not a command.** The `paths::resolve_data_dir` BOM strip
(R53 Settings Q4); the `config_parse` and `config_unsupported_version`
`IpcErrorKind` variants (§A.6); and, if Q4 is answered (b), the
`device_rejected` variant.

**Not in this lane, but gating features it ships.** Lap indexing at import
(R53 Data Q4) — the Rust backlog item after this lane. Until it lands,
`eval_workbook`'s `lap_context` and `fetch_fft`'s `lap` must both be passed
`null`.

---

## D. Sequencing

The Rust track is strictly serial, one cargo process on the machine (CLAUDE.md
§8, R13). This lane is item 3 in the operating brief §1 order and starts only
after both of the following:

1. **L2 Task 8** (importers lane wrap-up). Task 7 lands
   `core::import::importers()` per R51 Q2, and Task 6 lands
   `store::import::import_file(data_root, extension, bytes)` — neither exists
   in the worktree as of this reading, and L5 Task 9 depends on both.
2. **L5 Task 9** (`import_file` / `list_importers` Tauri commands, with
   `rebuild_catalog` + `get_session` read-back per R51 Q4). It establishes the
   `commands/import.rs` module and the `parse_*`/`import_*` `IpcErrorKind`
   variants this lane extends.

**Within the lane, the ordering that unblocks the most UI soonest:**

1. **App group** (§A.5) — `get_settings`/`set_settings`,
   `get_data_dir`/`set_data_dir`, the BOM strip, the three profile commands.
   Highest value per line: the core logic is landed, the interfaces are
   already declared in the UI, and it unblocks a merged tab (Settings) plus
   L7b's profile library. No new core code at all.
2. **`read_workbook`** (§A.2) — L6's hard blocker, and a single `fs::read`
   plus a hash.
3. **Catalog writes** (§A.1) — `save_session_metadata`, `delete_session`.
4. **Device group** (§A.4) — the managed connection, status, control and
   `pull_config` are one coherent piece (R53 Device Q4) and are best done
   together; `preview_channel_registry` rides with them but is really core
   work.
5. **`eval_workbook` lap context** and **`create_workbook`** (§A.2).
6. **`fetch_host_channel`** and **`fetch_fft`** (§A.2, §A.3) — the two new
   binary layouts, last, because they need their own encoder tests and are the
   only entries whose format questions (Q3) are open.

Gates are wave-1's, unchanged: the targeted filter the dispatch names per
task, `cargo check -p idl-rs-cli --tests` on any `pub` change in `core`,
`cargo check -p idl-rs-tauri` whenever a command signature moves, the full
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` every four tasks and
at the lane gate. The `app/src-tauri` items (§C) mean one real Tauri build in
this lane; schedule it at the gate, not inside a task.

**After the lane merges,** one lead shell task on `main` swaps the three
`ipcStubs.ts` files for `app/src/ipc/` wrappers (an import-path change by
each stub file's own design), swaps L7a's `pickImportFile()` seam, and runs
L7c's one-time `localStorage` → `settings.json` import.

---

## E. Open questions for the lead

Six. Each states options and a recommendation; none is decided here. The draft
above is written as if every recommendation held, and the entries that depend
on one are marked PROVISIONAL.

### Q1 — Does `save_session_metadata` take a `based_on_hash`?

- **Where:** §A.1, `save_session_metadata`.
- **Context:** C4 §4 mandates the optimistic-concurrency check on `<data>`
  writes, and `write_session_json` already accepts
  `based_on_hash: Option<&str>`. But no command exposes the current
  `session.json` hash — `get_session` returns `SessionDetail`, which has no
  hash field. This is the same gap R44 found for workbooks and R52 Q4 closed
  with `read_workbook`. The UI built a two-argument call.
- **Blast radius:** structural (a command signature plus, in option (b), a
  field on a shared return type).
- **Options:** (a) the command reads `session.json`, computes its hash, and
  passes it to `write_session_json` itself — last-write-wins within the
  command, no `conflict` kind, signature unchanged; (b) add
  `session_json_hash: string` to `SessionDetail` and a third `based_on_hash`
  argument, raising `conflict` on mismatch, and change the `MetadataForm.tsx`
  call site.
- **Recommended answer:** (a) for wave 2. The concurrent-editor scenario
  option (b) protects against is a second app instance or a LAN sync landing
  mid-edit; neither exists yet, and (b) costs a change to a return type three
  commands already share. Revisit when sync (L11) lands, which is the point
  the risk becomes real.
- **Proceeded on:** (a). `conflict` is absent from the entry's error list and
  the signature stays two arguments.
- **Affected outputs:** §A.1 `save_session_metadata`.

### Q2 — Ship the quarantine commands now, or defer the need to wave 3?

- **Where:** §A.1, `list_quarantine` / `resolve_quarantine`.
- **Context:** C4 §2 creates `tmp/quarantine/` and C4 §7 names the repair
  action, but **nothing implements it**: `store::verify::verify` returns
  `Finding`s and performs no move, and no file format records a `reason` or
  an original location for a quarantined file. As specified, `list_quarantine`
  returns `[]` forever and `resolve_quarantine` always raises `not_found`.
- **Blast radius:** structural (a return shape, and whether an on-disk sidecar
  format is introduced).
- **Options:** (a) defer the whole need to wave 3, alongside the repair action
  that would populate the directory, and leave `Data/ipcStubs.ts` stubbed;
  (b) ship both commands now over a bare directory listing with `reason: ""`
  and `original_name` parsed back out of the file name; (c) ship them now and
  introduce a `tmp/quarantine/<uuid>.json` sidecar carrying `reason` and the
  original path, written by a repair action this lane also builds.
- **Recommended answer:** (a). Option (b) puts a permanently-empty command and
  a permanently-empty string field into a signed contract; option (c) is a new
  C4 format plus the repair action, which is a lane of its own, not a batched
  amendment item. The Data tab's maintenance panel already reports honestly
  through the stub.
- **Proceeded on:** the entry is written in full and marked PROVISIONAL, so
  the shape is ready if the lead prefers (b) or (c).
- **Affected outputs:** §A.1 `list_quarantine` / `resolve_quarantine`; §B row
  L7-4.

### Q3 — Do the new binary headers pad to natural alignment?

- **Where:** §A.2 (`IDLH`), §A.3 (`IDLF`); observation on the landed `IDLT`.
- **Context:** L6 filed `IDLH` with a 20-byte header followed by an `f64`
  array. In JavaScript, `new Float64Array(buffer, 20)` **throws** — a typed
  array's byte offset must be a multiple of its element size. The decoder
  would be forced onto per-element `DataView` reads, which defeats the
  zero-copy view CLAUDE.md §2 asks for. The same applies to `IDLF`, whose
  offsets L6 left unstated. **The landed `IDLT` layout has the same latent
  issue:** its column time region starts at `32 + sample_count*8 +
  column_count*12`, which is a multiple of 8 only when `column_count` is even,
  so `BigInt64Array` on an odd column count would throw. C3 §3.5 fixes those
  offsets and this batch does not touch them, but the lead should know before
  the pattern is copied a third time.
- **Blast radius:** structural (two binary formats every later reader depends
  on).
- **Options:** (a) pad `IDLH` to 24 bytes and `IDLF` to 16, so every payload
  array starts on its natural alignment, and note the `IDLT` case for a
  separate fix; (b) keep L6's 20-byte `IDLH` and decode via `DataView`
  element by element.
- **Recommended answer:** (a). The cost is four zero bytes per response; the
  cost of (b) is a per-sample JavaScript loop on exactly the payload the
  binary path exists to avoid.
- **Proceeded on:** (a) — the tables in §A.2 and §A.3 are written padded.
- **Affected outputs:** §A.2 `fetch_host_channel`; §A.3 `fetch_fft`.

### Q4 — Which `IpcError` kind does a refused device control transition raise?

- **Where:** §A.4, `device_control`.
- **Context:** SPEC §7.2's `AckCode` has four non-success values
  (`WriteNotPermitted`, `Busy`, `Precondition`, `NotImplemented`). None of C3
  §2's existing kinds fits: `config` means a **config document** was rejected
  or malformed on the wire; `invalid_argument` means the caller made a
  programming error, which a device that is simply busy is not; `conflict` is
  documented as an optimistic-concurrency failure and widening it would blur
  the one thing it means; `ble` means the transport failed, when here it
  succeeded and carried a refusal.
- **Blast radius:** structural (§2's kind vocabulary is additive-only and can
  never be renamed once shipped, C3 §5).
- **Options:** (a) reuse `config`, as L7 need 9 proposed; (b) add a new
  cross-cutting kind `device_rejected`, with `detail { ack: "busy" |
  "precondition" | "write_not_permitted" | "not_implemented" }`.
- **Recommended answer:** (b). §2's own rule is to propose a new kind when
  none fits, and this is a recoverable condition the UI must present
  differently ("stop the recording first"), which is exactly the argument R44
  used to justify `conflict` rather than folding it into `invalid_argument`.
  Option (a) would make `config` mean two unrelated things, and the Device tab
  would have to read `message` to tell them apart — which C3 §2 forbids.
- **Proceeded on:** (b). `device_rejected` appears in §A.4's error list and in
  §C's implementation work.
- **Affected outputs:** §A.4 `device_control`.

### Q5 — Which command owns the `data_dir` key?

- **Where:** §A.5, `set_settings` and `set_data_dir`.
- **Context:** `AppSettings.data_dir` and `set_data_dir(path)` write the same
  `settings.json` key. The UI type `Settings/ipcStubs.ts` declares carries
  `data_dir` inside `AppSettings`, so a Settings page that round-trips the
  whole object could overwrite an override set through the other command, or
  clear it by sending back a stale `null`.
- **Blast radius:** structural (two commands' semantics over one persisted
  key).
- **Options:** (a) `set_data_dir` is the sole writer; `set_settings` ignores
  the `data_dir` field of its argument and returns the current value in its
  response; (b) `set_settings` is authoritative for all three keys and
  `set_data_dir` is removed, with the UI reading resolution info from a
  separate `get_data_dir`; (c) both write it, last call wins.
- **Recommended answer:** (a). `set_data_dir` has to do more than write a
  string — validate the path, create the tree, and compute
  `restart_required` — so it cannot be a passive field on a settings blob.
  (c) is the one option that can lose a user's override silently.
- **Proceeded on:** (a), documented in §A.5's `set_settings` entry. If the
  lead picks (a), one sentence should be added to the `AppSettings` doc
  comment in `Settings/ipcStubs.ts` when it is swapped, so the ignored field
  is not a surprise.
- **Affected outputs:** §A.5 `get_settings`/`set_settings` and
  `get_data_dir`/`set_data_dir`.

### Q6 — `device_status` mirrors the landed transport, not IPC need 8

- **Where:** §A.4, `device_status`.
- **Context:** L7 IPC need 8 proposed ten fields. Four of them
  (`sd_free_bytes`, `gps_fix_quality`, `gps_satellites`,
  `battery_millivolts`) have no line in SPEC §7.3's status block and no field
  in the landed `ble_status::DeviceStatus`, so they could only ever serialise
  as `null`. Four more are renames or narrowings of fields the transport
  already has, and `mode`/`recording` are derivable in the UI from `wifi_on`
  and `logging`. The needs list also omits `ota_pending_verify`, `hr` and
  `hr_battery_pct`, which the device does report. My instructions say a
  findings file loses to the authority it contradicts, and here the authority
  is SPEC §7.3 plus landed code — but the return type is an interface later UI
  builds on, so the call is the lead's.
- **Blast radius:** structural (a return shape).
- **Options:** (a) mirror `idl_transport::ble_status::DeviceStatus` field for
  field, as §A.4 is written; (b) ship need 8's shape, with four fields
  permanently `null`; (c) mirror the transport and additionally file a SPEC
  §7.3 amendment asking the firmware for free space, fix quality, satellite
  count and battery millivolts.
- **Recommended answer:** (a), and separately ask Isaac whether the firmware
  could report the four missing values, which is (c)'s useful half without
  committing the contract to fields that do not exist yet. Nothing is built
  against need 8's shape: the stub returns `Promise<never>` and has no call
  site, so (a) costs no UI rework today.
- **Proceeded on:** (a).
- **Affected outputs:** §A.4 `device_status`, and `device_control`'s return
  type, which is the same struct.

---

## F. Decisions taken in this draft (contained and reversible)

Three, each a contradiction between a needs-list note and a signed contract or
landed code, resolved in favour of the contract or the code:

1. **`create_workbook` does not error on a file-name collision** — C4 §2 fixes
   the `-2`/`-3` suffixing convention, against L6 N8's `io`.
2. **`delete_profile` raises `not_found` for an unknown id** — the command
   layer adds the check; core's idempotent `delete` is untouched.
3. **`ProfileLoadReport.skipped` is an array of objects**, not core's
   `(PathBuf, String)` tuples, so the JSON has named keys.

Reversing any of the three is a one-line change in one command.

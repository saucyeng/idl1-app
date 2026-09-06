# L8x — Data-tab write commands (Rust lane plan)

Closes the last four C3 §6 deferrals the Data tab still stubs
(`app/src/routes/pages/Data/ipcStubs.ts`): `save_track`, `delete_track`,
`list_quarantine`, `resolve_quarantine`. Submodule base `81a7db3`.
Worktree `idl-rs-worktrees/l8x-data-writes`. Serial, one cargo process (R13).

`rescan_track_visits` needs **no work**: C3's §6 entry for it was closed
2026-09-06 by L2b Task 8's `rescan_tracks(session_id)` (R83). The lane adds
no rescan command; it reports which sessions a track edit staled instead.

## 1. What is already landed (do not rebuild)

- `core::track_artifact::{model,read,write}` — the `.idl0t` domain `Track`,
  its private wire DTOs, and `write_track(data_root, &Track)` doing C4 §4
  atomic write with a `based_on` hash. **Write already exists.**
- `core::store::catalog` — `tracks` table, `index_session`, `delete_session`.
- `core::store::catalog_read::{list_tracks,get_track}` and their thin tauri
  commands in `tauri/src/commands/catalog.rs`.
- `core::store::lap_index` — `track_library_hash`, `reindex_laps`, and the
  `track_visits_library_hash` staleness stamp in `session.json` (R83).
- `IpcErrorKind::Conflict` (R44) already exists for `RenameConflict`.
- **Nothing writes `tmp/quarantine/`.** `store::verify::verify` returns
  `Finding`s and performs no move (C4 §7 names the repair; no code does it).
  That absence is exactly why R59 Q2 deferred the pair.

## 2. Command list (C3 shapes and error kinds)

| Command | Args | Return | Kinds |
|---|---|---|---|
| `save_track` | `track: TrackDraft` | `TrackDetail` | `invalid_argument`, `not_found`, `io`, `internal` |
| `delete_track` | `track_id: string` | `DeleteTrackReport` | `not_found`, `io`, `internal` |
| `list_quarantine` | — | `QuarantineEntry[]` | `io`, `internal` |
| `resolve_quarantine` | `entry_id`, `action` | `void` | `not_found`, `invalid_argument`, `io`, `internal` |
| `verify_data_dir` | `repair: boolean` | `VerifyReport` | `io`, `internal` |

`verify_data_dir` is the quarantine **producer** — see Q1. No `conflict`
kind on `save_track`: last-write-wins, consistent with R59 Q1(a).

## 3. Where each piece lives

**core (`rust/core/src/`)**
- `track_artifact/validate.rs` *(new)* — `validate_track(&Track) ->
  Result<(), TrackValidationError>`: non-empty trimmed name; every gate
  coordinate finite and in ±90 / ±180 decimal degrees; no empty sector or
  neutral-zone name; a `Circuit`/`PointToPoint` gate whose two endpoints are
  identical is an error (a zero-length gate can never be crossed).
- `track_artifact/write.rs` — add `delete_track(data_root, track_id) ->
  Result<bool, TrackWriteError>` (removes the `.idl0t`; `false` = absent).
- `store/quarantine.rs` *(new)* — `quarantine_file`, `list_quarantine`,
  `resolve_quarantine`, and the sidecar model.
- `store/verify.rs` — a `repair` pass that routes findings #1 and #5 through
  `quarantine_file`. `verify` itself stays read-only.

**tauri (`rust/tauri/src/commands/`)** — thin. `catalog.rs` gains the two
track commands; a new `maintenance.rs` gains the three quarantine/verify
commands. UUID v4 minting and `now_ms` happen **here**, not in core: core
stays deterministic (`write_track`'s doc already says the caller owns the
timestamps), and every core function stays testable without a clock.

## 4. Atomicity and catalog re-index

- `save_track` writes through the landed `write_track` (`tmp/<uuid>` → fsync
  → rename, C4 §4). No new atomicity primitive.
- After the file lands, `save_track` upserts the one `tracks` row **only
  when `catalog.sqlite` already exists** — the `import_file` / `rescan_tracks`
  rule (a bare root that never had `rebuild_catalog` stays catalog-less).
  A catalog failure goes into `warnings`, never fails the write.
- **`rescan_tracks` is not called by either write command.** A track edit
  changes `track_library_hash`, which stales every session's
  `track_visits_library_hash` stamp; re-running lap detection over the whole
  library inside a name-field save is minutes of work behind one keystroke.
  Both commands instead return `stale_session_ids` — the sessions whose
  stamp no longer matches — and the UI offers "Rescan N sessions", calling
  the landed `rescan_tracks` per id. This is idl0's own behaviour
  (`track_provider.dart`'s delete note: stale visits are left, the user runs
  Rescan tracks) and it keeps every write command bounded.
- `delete_track` removes the `tracks` row; `laps.track_id` is already
  `REFERENCES tracks(track_id) ON DELETE SET NULL`, so lap rows survive
  unattributed. `session.json` is not rewritten.

## 5. Quarantine model

A quarantined file is a file **already inside `<data>`** whose bytes failed
their own content-address check (C4 §7 findings #1 and #5: a blob whose
SHA-256 ≠ its path, a `derived/<hash>.parquet` whose SHA-256 ≠ its name).
It is moved, never deleted, to `tmp/quarantine/<uuid>-<original-name>`.

C4's filename carries neither a reason nor a time, so each entry gains a
sidecar `tmp/quarantine/<uuid>.json` (`{ entry_id, original_path, reason,
quarantined_at_ms }`) — a C4 §2 amendment, additive. `entry_id` is the uuid.
An orphaned payload with no sidecar is still listed, with
`reason: "unknown (no sidecar)"`; an orphaned sidecar is skipped.

`resolve_quarantine` takes `"restore" | "discard"`. **Not "retry"** (Q2):
these are corrupt bytes inside the store, not a rejected import, so there is
nothing to re-run. `restore` moves the payload back to `original_path` when
that path is free (occupied ⇒ `invalid_argument`); `discard` deletes payload
and sidecar. Both then delete the sidecar. Nothing under `tmp/` is ever read
as truth (C4 §2), so a resolve never touches the catalog.

Import is **not** a producer. `import_file` reads bytes from a path the user
owns outside `<data>`; a rejected import has nothing to move, and copying a
user's file into `tmp/` to quarantine it would be inventing a store write.

## 6. Tasks (serial, ≤ 1 day each)

1. **C3 + C4 amendment** — docs only, spec-first. §7's text verbatim.
   Lead spot-check, no reviewer (operating brief §7.4).
2. **Typed `TrackDetail`** — replace `get_track`'s four `serde_json::Value`
   fields with the pinned decimal-degree types. Closes C3 §6 open question 10.
3. **core validation + `delete_track`** — `track_artifact/validate.rs`,
   `write.rs`'s delete.
4. **`save_track` command** — create/edit, catalog upsert, `stale_session_ids`.
   **Full-suite checkpoint after this task** (four tasks, CLAUDE.md §8).
5. **`delete_track` command** — plus `DeleteTrackReport`.
6. **core quarantine module** — `store/quarantine.rs` + `verify`'s repair pass.
7. **Quarantine + verify commands** — `commands/maintenance.rs`, three
   commands, `handler()` registration.
8. **Lane merge gate** — `TASKS.md`/`CHANGELOG.md` sweep, full suite.

Per-task gate: the named `cargo test` filter with a non-zero `passed` count,
foreground, plus `cargo check -p idl-rs-cli --tests` on any core `pub`
change and `cargo check -p idl-rs-tauri` on any command signature. Entry
gate on every brief: `git merge-base --is-ancestor 81a7db3 HEAD`.

## 7. C3 amendment text (Task 1 writes this into the contract)

Add to the §3.2 Catalog group, and to §2's `not_found` / `io` /
`invalid_argument` command lists. Revision-log line: *"2026-09-06: L8x —
`save_track`, `delete_track`, `list_quarantine`, `resolve_quarantine`,
`verify_data_dir` added; §6's `TrackDetail` open question 10 closed and the
four `unknown` fields typed; §6's quarantine and track-write deferrals
struck."*

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

/** `save_track(track)` — one command for create and edit. `track_id: null`
 *  creates (server mints a UUID v4 and both timestamps); a string edits,
 *  preserving `created_at_ms` and bumping `updated_at_ms` to now. */
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

interface QuarantineEntry {
  entry_id: string;            // the uuid in the filename
  path: string;                // absolute, under <data>/tmp/quarantine/
  original_path: string;       // where it was pulled from, "" if unknown
  reason: string;              // C4 §7 finding text
  quarantined_at_ms: number;   // i64
}
// list_quarantine() -> QuarantineEntry[]
// resolve_quarantine(entry_id: string, action: "restore" | "discard") -> void
// verify_data_dir(repair: boolean) -> VerifyReport
interface VerifyReport {
  findings: { severity: "info"|"warning"|"error"; path: string; message: string }[];
  quarantined: QuarantineEntry[];   // empty unless repair === true
  elapsed_ms: number;
}
```

C4 amendment, §2 Staging bullet: `tmp/quarantine/<uuid>.json` sidecar
alongside `tmp/quarantine/<uuid>-<original-name>`, holding
`{ entry_id, original_path, reason, quarantined_at_ms }`. §7's repair
paragraph gains "recorded with a sidecar so the UI can list it".

## 8. Post-lane TS shell tasks (lead-owned, `app/src/`)

1. Delete `Data/ipcStubs.ts`'s four stubs and its `NotImplementedError`
   branch in `maintenance.ts`; keep the class only if another stub survives.
2. `app/src/ipc/catalog.ts` — the typed `Gate`/`LapTiming`/`TrackDraft`/
   `SaveTrackResult`/`DeleteTrackReport` types plus `saveTrack`/`deleteTrack`.
3. `app/src/ipc/maintenance.ts` *(new)* — `listQuarantine`,
   `resolveQuarantine`, `verifyDataDir`.
4. `TrackDetailPane.tsx` — replace the presence/count placeholders with the
   real gate and sector lists, and add Name/Venue edit + Delete (SPEC
   §24.12). The map-based gate placement editor stays wave 3 (R54).
5. Data-tab maintenance panel — a quarantine review list with
   Restore/Discard per entry, and "Rescan N sessions" after a track write.

## 9. Open questions for the lead

**Q1 — Does this lane build the quarantine producer?** Shipping only the two
read/resolve commands re-creates R59 Q2's objection: a permanently empty
list. *Recommend yes* — Tasks 6–7 add `verify_data_dir(repair)` over the
landed `store::verify`, which is the C4 §7 repair the contract already
specifies and nothing implements. Cost if wrong: one extra task.

**Q2 — `"restore" | "discard"` instead of the stub's `"retry" | "discard"`.**
*Recommend the rename.* "Retry" implies re-importing; a quarantined file is
corrupt store bytes with nothing to retry. Costs one line in a TS stub
nothing calls yet.

**Q3 — `TrackDetail` in decimal degrees, not the file's x1e7.** *Recommend
decimal degrees* (§7). Blast radius is near zero: the fields are `unknown` in
TS today and `TrackDetailPane` only counts them. The alternative puts a
`/ 1e7` in JavaScript, which the "Rust = numbers" rule forbids.

**Q4 — One `save_track` with a nullable `track_id`, or `create`/`update`?**
*Recommend one command.* idl0 had two provider methods but one editor modal
and one save button; the branch is `track_id == null`.

**Q5 — Do the write commands return `stale_session_ids`?** *Recommend yes*
(§4). Without it the UI cannot offer a rescan and stale visits are silent.
Cost: a `session.json` stamp read per session on each track write.

**Q6 — Duplicate sector / neutral-zone names: error or allowed?**
*Recommend allowed.* `SectorJson.name` is a display label, not a key, and
idl0 never enforced uniqueness. Empty names stay an error.

**Q7 — Is the track editor UI in scope anywhere?** *Recommend no.* R54
dropped the Track facet for wave 2; §8's shell tasks stop at name/venue/
delete over the existing pane. Map gate placement is wave 3.

**Q8 — `verify_data_dir` group: §3.2 Catalog or the §3.10 App group?**
*Recommend §3.10 App* — it is whole-data-directory maintenance, not a
catalog read, and it sits beside `get_data_dir`/`set_data_dir`.

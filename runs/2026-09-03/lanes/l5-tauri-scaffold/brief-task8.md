# L5 Task 8 — implementer brief (catalog commands, C3 §3.2)

You are the implementer for L5 Task 8 of the idl1 rewrite — the first Group B
task of the Tauri-glue lane. TDD, two commits (rust worktree, then app
worktree), then report.

## Where
- **Rust worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`,
  branch `wave1-l5-tauri`. The lead merges idl-rs `main` (`e0440bb`, L1+L3 landed) into this
  branch before dispatch — **the brief assumes a branch already caught up to `main`**; the exact
  HEAD is in the dispatch message. Verify HEAD and a clean status first; if either is wrong,
  stop and report. The worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- **App worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`,
  branch `wave1-l5-tauri`. Its `rust` submodule tracks the rust worktree via the `local-wave1`
  remote; after committing in the rust worktree, sync the pointer there with
  `git -C rust fetch local-wave1 wave1-l5-tauri && git -C rust checkout <new sha>` and `git add rust`.
- Work ONLY in those two worktrees. Do NOT touch the shared checkouts
  (`idl1-app\rust`, `idl1-app` itself) beyond READING. Do NOT edit anything under `docs/`.
  Do NOT push.
- **Read first:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L5 plan
  `docs\superpowers\plans\2026-09-03-idl1-wave1-l5-tauri-scaffold.md` — Global Constraints
  (49–81) and `### Task 8` (1414–1484); contract C3
  `docs\superpowers\specs\2026-09-03-idl1-c3-ipc-surface.md` §1 (conventions), §2 (error shape),
  §3.2 (all seven commands, field for field); C4
  `…-c4-data-directory.md` §2 (layout) and §5 (catalog); this lane's
  `runs\2026-09-03\lanes\l5-tauri-scaffold\questions.md` **Q1** and the lead's answer to it;
  ledger `runs\2026-09-03\decisions.md` — the "L3 LANDED" entry and R25.

## COMPUTE RULES — non-negotiable
Isaac's machine is memory-bound (CLAUDE.md §8, ruling R13). One cargo process at a time,
foreground; jobs are capped machine-wide, never pass `-j`. Run **only** these filters, each of
which must report a non-zero `passed` count (a filter matching nothing is a failed gate):
- `cargo test -p idl-rs store::catalog_read`
- `cargo test -p idl-rs-tauri catalog`
- `cargo check -p idl-rs-cli --tests` — **required**: this task adds `pub` API to `core`.

No full suite, no `--workspace`, no `cargo fmt`, no tarpaulin, no `cargo doc`, no reruns to hunt
flakiness. Two known-flaky tests exist (`watcher::…never_fires_callback`,
`store::atomic::…outlasts_the_retry_window`); if one fails, rerun **that test alone by name,
once**, and say so in the report.

## Verified facts about the landed code (read, not assumed)
Every claim below was read at idl-rs `main` = `e0440bb`. Where a claim is uncertain it says so.

1. **There is no catalog read API.** `core/src/store/catalog.rs` is write/rebuild only:
   `open_catalog` (`:136`), `rebuild_catalog` (`:183`), plus private indexers. A grep for
   `fn list_sessions|fn get_session|fn list_laps|fn list_workbooks|fn list_tracks|fn get_track|
   struct SessionSummary` over `core/src` and `cli/src` returns zero hits. **The plan's Task 8
   gate ("L1 has landed catalog read functions") is false.** Q1 asks the lead; this brief
   proceeds on "L5 writes them, in a new core file".
2. **The catalog schema matches C3 §3.2 column for column.** `catalog.rs:56-130` (`const DDL`):
   `sessions` carries exactly `SessionSummary`'s 19 fields including `lap_count` and
   `duration_ms`; `workbooks(workbook_id, file_name, name, updated_at_ms, size_bytes)` matches
   `WorkbookSummary`; `tracks(track_id, name, venue_name, created_at_ms, updated_at_ms,
   full_json)` matches `TrackSummary` plus the excluded `full_json`; `laps(session_id,
   lap_number, lap_time_ms, track_id)` and `lap_summary(session_id, lap_number, channel_id,
   derived_hash, min_value, max_value, mean_value)` together match `LapSummary`/`LapChannelStat`.
   No renaming layer is needed anywhere (C3 §1's snake_case rule).
3. **Core's `RebuildReport` is not C3's.** `catalog.rs:156-176` has `blobs_indexed`,
   `tracks_indexed`, `sessions_indexed`, `laps_indexed`, `lap_summary_indexed`,
   `workbooks_indexed`, `skipped: Vec<String>` — and **no `duration_ms`**. C3 §3.2's shape is
   `{ sessions_indexed, workbooks_indexed, tracks_indexed, duration_ms }` (u32/u32/u32/u64).
   The command maps and times the call itself.
4. **`rebuild_catalog` has a precondition, stated at `catalog.rs:190-193`:** no `open_catalog`
   connection may be held across the call (it is an offline swap). The command must not hold one.
5. **`get_session` reads canonical files, not the catalog** (C3 §3.2, spec 253-260). Sources:
   `store::parquet::read_session_metadata(path) -> SessionParquetMetadata`
   (`parquet.rs:389`, fields at `:333-345`: `session_id, timestamp_utc_ms, device_id,
   config_checksum, blob_sha256, source_format, importer_version, engine_version,
   seam_correction_version`) and `store::session_json::read_session_json(path) -> SessionJson`
   (`session_json.rs:254`; struct `:19-93` — carries every C3 `SessionDetail` metadata/lap/
   track-visit/flag field, and **does not** carry `device_id`/`timestamp_utc_ms`/
   `config_checksum`/`source_format`/`blob_sha256`, which come from the parquet metadata).
   Per-channel data for `ChannelSummary` comes from `store::parquet::read_session_parquet(path)
   -> Session` (`parquet.rs:403`); `Session.channels: Vec<Channel>` (`session/mod.rs:341-362`)
   and `Channel` (`:127-179`) has `channel_id`, `nominal_rate_hz`, `unit`, `source_kind`, and
   `len()` (`:292`). `channel_kind` is `"event"` iff `nominal_rate_hz == 0.0`, `"fixed-rate"`
   otherwise (C3 §3.2's own rule).
   `read_data_parquet_session_fields` (`catalog.rs:503`) is `pub(crate)` — **not** reachable;
   use `read_session_metadata` instead.
6. **`get_track`.** `store` has no track reader; `track_artifact::read::read_track(path) ->
   Result<Track, ConfigError>` (`track_artifact/read.rs:15`) does, and `Track`
   (`track_artifact/model.rs:21-35`) is **not** `Serialize`. C3 §3.2 types `lap_timing`,
   `neutral_zones`, `sector_gates`, `reference_polyline` as `unknown` (open question 10).
7. **`SessionSummary` etc. do not exist as Rust types anywhere.** This task defines them.
8. `idl-rs-tauri` already has: `IpcError`/`IpcErrorKind` with the eight seeded kinds
   (`tauri/src/error.rs:15-67`), `state::DataDir(pub PathBuf)` (`state.rs:8`, managed in
   `app/src-tauri/src/lib.rs:22`), and the `commands/` submodule layout with `device.rs` as the
   worked example of the lane's idioms — `tauri::State<'_, DataDir>` (`device.rs:316`), a
   `_via`-suffixed pure helper per command that the tests exercise, `#[derive(serde::Serialize)]`
   structs mirroring C3 field for field with `From<core type>` impls (`device.rs:36-102`).

## The task
Write the catalog read layer in `core`, then the seven C3 §3.2 commands over it.

**PROVISIONAL** (Q1): everything below assumes the lead authorises L5 to add
`rust/core/src/store/catalog_read.rs`. If the answer is no, stop before Step 1 and report.

### Step 1: `core/src/store/catalog_read.rs` — the read API (TDD)
New file; `store/mod.rs` gains `pub mod catalog_read;` (alphabetical, after `catalog`). Nothing
in L1's `catalog.rs` is edited.

Types (all `#[derive(Debug, Clone, PartialEq)]`, field names **verbatim** from C3 §3.2 so the
Tauri layer can `#[derive(Serialize)]` a wrapper with no rename layer): `SessionSummary`,
`SessionDetail`, `ChannelSummary`, `LapDetail`, `TrackVisitSummary`, `LapSummary`,
`LapChannelStat`, `WorkbookSummary`, `TrackSummary`, `TrackDetail`. Transcribe every field from
C3 §3.2, including units and nullability, into doc comments. `unknown`-typed C3 fields
(`LapDetail.sectors`, `LapDetail.neutral_zone_visits`, and all four opaque `TrackDetail` fields)
are `serde_json::Value` on the Rust side.

Functions, each `Result<_, CatalogError>` (reuse L1's error enum, `catalog.rs:29-54` — do not
invent a second one) and each taking `data_root: &Path` first:

| fn | source | notes |
|---|---|---|
| `list_sessions` | `SELECT … FROM sessions ORDER BY timestamp_utc_ms DESC` | via `open_catalog(data_root.join("catalog.sqlite"))` |
| `get_session(session_id)` | `read_session_metadata` + `read_session_json` + `read_session_parquet` | canonical files only — **never** the catalog (C3 §3.2) |
| `list_laps(session_id)` | `laps` + `lap_summary` join | `channel_stats` grouped per lap, `channel_id` ascending |
| `rebuild_catalog_report` | `catalog::rebuild_catalog` | returns core's report unchanged; the C3 mapping happens in the command |
| `list_workbooks` | `workbooks` table | |
| `list_tracks` | `tracks` table, excluding `full_json` | |
| `get_track(track_id)` | `tracks/<track_id>.idl0t` bytes | see below |

`get_track`: read the file, `track_artifact::read::read_track` it (so a corrupt artifact is a
typed error, not a silent pass-through), then also `serde_json::from_slice::<serde_json::Value>`
the same bytes and lift the four opaque fields out of that JSON verbatim. Scalars
(`track_id`/`name`/`venue_name`/`created_at_ms`/`updated_at_ms`) come from the parsed `Track`
(`model.rs:22-35`: `id`, `name`, `venue`, `created_at_ms`, `updated_at_ms` — note `venue`, not
`venue_name`). A missing file is `CatalogErrorKind`'s not-found-equivalent; pick the variant that
already exists rather than adding one, and say which you picked in the report.

Missing-entity rule, uniform: `get_session`/`list_laps`/`get_track` for an id with no directory/
row return a *not-found-shaped* `CatalogError` (so the command maps it to `not_found`); an empty
list from a `list_*` command is `Ok(vec![])`, never an error.

Tests (inline `#[cfg(test)]`, A/A/A, `thing — condition — result`), minimum:
- `list_sessions — empty catalog — returns an empty vec`
- `list_sessions — one rebuilt session — every C3 field matches what was seeded` (build the tree
  with the same helper shape L1's own tests use: `catalog.rs:681-719`'s `write_full_session*`
  are `#[cfg(test)]`-private to that module, so **write your own local helper** — do not try to
  import theirs, and do not make theirs public)
- `get_session — unknown id — not-found error`
- `get_session — seeded session — channels carry unit, source_kind and channel_kind from data.parquet`
- `list_laps — session with two laps and lap_summary rows — stats grouped per lap`
- `list_workbooks`, `list_tracks` — one row each, field for field
- `get_track — unknown id — not-found error`

### Step 2: `rust/tauri/src/commands/catalog.rs` — the seven commands
One `#[tauri::command] pub fn` per C3 §3.2 command, each taking
`data_dir: tauri::State<'_, DataDir>` as its **last** parameter (matching `device.rs:316`), each
returning `Result<T, IpcError>`. Mirror C3's payload structs as `#[derive(serde::Serialize)]`
types in this module with `From<idl_rs::store::catalog_read::X>` impls, exactly as `device.rs:36-102`
does for the transport types — do not re-export core types directly (core's are not `Serialize`).

`rebuild_catalog` wraps the core call in `std::time::Instant::now()`/`.elapsed().as_millis()` and
returns C3's four fields only; core's `blobs_indexed`/`laps_indexed`/`lap_summary_indexed`/
`skipped` are dropped at this boundary — say so in a doc comment, and add a `// TODO(idl0):`
noting that `skipped` (non-fatal per-entity problems) has nowhere to go in C3 §3.2's shape.

`error.rs` gains `impl From<idl_rs::store::catalog::CatalogError> for IpcError`, folding: the
I/O-ish variants → `IpcErrorKind::Io` (C3 §2's folding rule), the not-found-shaped variant →
`NotFound`, everything else → `Internal`. **Add no new `IpcErrorKind` variants** — C3 §2's
catalog rows are `not_found`/`io`/`internal` only.

Register all seven in `handler()` (`tauri/src/lib.rs:21-30`), keeping the existing entries.

Tests (inline, in `commands/catalog.rs`): call each command's inner logic against a temp
`<data>` built by your Step 1 helper. `tauri::State` cannot be constructed in a unit test — use
the lane's established shape: put the body in a `_via`-suffixed plain function taking
`data_dir: &Path`, have the `#[tauri::command]` be a one-line wrapper, and test the `_via`
function (this is exactly what `device.rs:141-279` does). Minimum: one happy-path test per
command plus `get_session — unknown id — IpcError kind is not_found`.

### Step 3: TS side — no change expected
`app/src/ipc/catalog.ts` (app worktree) already declares all ten interfaces and all seven
functions against C3 §3.2 (verified: `catalog.ts` exports `SessionSummary`, `SessionDetail`,
`ChannelSummary`, `LapDetail`, `LapChannelStat`, `LapSummary`, `TrackVisitSummary`,
`RebuildReport`, `WorkbookSummary`, `TrackSummary`, `TrackDetail` and `listSessions`,
`getSession`, `listLaps`, `rebuildCatalog`, `listWorkbooks`, `listTracks`, `getTrack`). If your
Rust shape disagrees with it anywhere, the Rust is wrong (C3 is the authority) — **stop and
report**, do not silently adjust either side.

### Step 4: Gates, CHANGELOG, commits
Run the three commands under COMPUTE RULES; paste each result line with its `passed` count.

`CHANGELOG.md` (app worktree), under `[Unreleased] / ### Added`:
`- **Catalog commands (C3 §3.2).** list_sessions, get_session, list_laps, rebuild_catalog, list_workbooks, list_tracks, get_track, over a new core read layer (idl_rs::store::catalog_read) — L1 landed the writer only.`

Commits — explicit paths, **not** `git add -A`, no AI attribution trailer:
```bash
# rust worktree
git add core/src/store/catalog_read.rs core/src/store/mod.rs tauri/src/commands/catalog.rs tauri/src/commands/mod.rs tauri/src/error.rs tauri/src/lib.rs
git commit -m "tauri: catalog commands (C3 §3.2) over a new core catalog read layer"
# app worktree, after syncing the submodule pointer
git add rust CHANGELOG.md
git commit -m "docs: changelog for catalog commands; bump rust submodule"
```

## Do not
- Do not edit `core/src/store/catalog.rs`, or make any of its `#[cfg(test)]` helpers public.
- Do not read the catalog inside `get_session` (C4 §5: "nothing reads the catalog for truth").
- Do not hold an `open_catalog` connection across `rebuild_catalog` (`catalog.rs:190-193`).
- Do not add `IpcErrorKind` variants for the catalog — C3 §3.2 raises only `not_found`/`io`/`internal`.
- Do not rename any field to camelCase (C3 §1).
- Do not run `cargo test -p idl-rs` unfiltered, `--workspace`, or `cargo fmt`.
- Do not touch `app/src/ipc/catalog.ts` unless Step 3's mismatch case fires — and then report first.

## Style / hygiene
Doc comment on every public symbol; units on every numeric value (`_ms` = milliseconds, `_us` =
microseconds, `size_bytes` = bytes); `// TODO(idl0):` never bare `// TODO`; typed errors only,
never `Err(String)`; A/A/A tests with blank lines between, named `thing — condition — result`;
idl-rs is not rustfmt-formatted — match surrounding style by hand.

## Spec discipline (say it out loud in your report)
"no spec change needed" — this task implements C3 §3.2 and C4 §5, which already are the spec.
The one thing that *would* be a spec change (a catalog read module in `core`) is a lane-boundary
question, Q1, answered by the lead before dispatch — not a contract edit.

## Report back (concise)
Both commit hashes + `git show --stat` each; all three gate commands with their result lines and
`passed` counts; per-step done/deviated; which `CatalogErrorKind` variant you used for
not-found and why; confirmation `catalog.rs` was not edited; confirmation `catalog.ts` needed no
change (or the mismatch, if Step 3 fired); anything ambiguous you resolved (say how) or that
needs a lead ruling — stop and report rather than guess (CLAUDE.md §1).

---

**Contained decision, recorded not actioned (brief writer, 2026-09-04):** `device.rs:184-188`
carries a `// TODO(idl0):` saying its hand-rolled sharded blob write duplicates
`idl_rs::store::blob::write_blob`, which had not merged when Task 10 landed. It has now
(`core/src/store/blob.rs:65`). Replacing it changes `download_file`'s write semantics
(`write_blob` verifies-and-skips an existing blob), so it is **not** folded into this task —
it is a one-line lead call for after the lane merges, and the TODO stays accurate until then.

# idl1 Wave 2 — L8w: Rust Write-Amendment Lane

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 17 commands (plus one amended, one superseded) that the
wave-2 UI lanes (L6 Notebook, L7a Data, L7b Device, L7c Settings) stubbed
behind `NotImplementedError` and that C3 now specifies, per lead ruling R59
(`runs/2026-09-03/decisions.md`). This is a small, self-contained Rust lane —
mostly thin command-layer wrappers over already-landed core/transport logic,
plus five genuinely new pieces of core code (two binary encoders, a
device-config → registry-row derivation, session-lap → `MathLapContext`
construction, and workbook-document synthesis) and one real Tauri build (the
file-picker dialog plugin). When this lane merges, wave 2 is done except for
one lead shell task that swaps the three `ipcStubs.ts` files for real
`app/src/ipc/*` wrappers.

**Architecture:** Two repos change together, exactly like wave-1 L5:
`idl-rs`/`idl-rs-tauri` (`rust/`, the submodule) gains one new command file
(`rust/tauri/src/commands/app.rs`, the new §3.10 App group), additions to
three existing command files (`commands/catalog.rs`, `commands/workbook.rs`,
`commands/device.rs`), a handful of new `pub fn`s in `rust/core/src` (two new
binary-encoder modules, a device-config registry derivation, and lap-context
construction), three new `IpcErrorKind` variants, and a new
`state::Connections` managed value. `app/src-tauri` gains the
`@tauri-apps/plugin-dialog` crate + capability (the lane's one real Tauri
build). **No file in `app/src/` changes in this lane** — the UI already
builds against the stubs; swapping them is a separate, lead-run shell task
after this lane merges (§ "After this lane" below), per the operating brief's
ownership rule that a UI-lane-owned directory is edited by that lane or by a
lead shell task, never by a Rust-track lane.

**Tech Stack:** Rust 2021, matching wave-1 pins exactly — no new Rust
dependency. `app/src-tauri` gains `tauri-plugin-dialog` (Cargo) and
`@tauri-apps/plugin-dialog` (npm), both at the pins the M0 ecosystem report
would use for Tauri v2's own first-party dialog plugin (verify against
`tauri = "2.11.5"`'s compatible plugin line at implementation time — pin
whatever `cargo add tauri-plugin-dialog` resolves to against that Tauri
version, record the resolved version in the task's commit).

**Spec:** `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` (C3, as
amended by ruling R59/R60 — every entry this lane implements is already
written there; this plan does not restate C3, it implements it), `docs/IDL0_SPEC.md`
§5.2 (channel registry table), §7.2 (control ACK protocol, config push/read),
§7.3 (status block), §8 (device-config schema), `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md`
§1 (settings.json), §4 (atomic write), `CLAUDE.md` (standing orders),
`runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` (§3 contract freeze, §4 gates),
`runs/2026-09-05/C3-WAVE2-AMENDMENT-DRAFT.md` (the adjudicator's draft this
lane is built from — its §C "who implements what" and §D sequencing are this
plan's backbone), and rulings R51–R61 in `runs/2026-09-03/decisions.md`.

**Spec discipline:** no spec change needed, per task, throughout this lane.
C3 is already amended (R59/R60, transcribed onto
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` before this plan
was written) — every task below implements text that already exists in the
signed contract. The one exception is Task 12 (`preview_channel_registry`'s
generic-analog-channel gap, see Open Questions) if the lead's answer requires
a SPEC §5.2/§8 amendment — that task states "spec-during" only if so
instructed; otherwise "no spec change needed" holds throughout.

## Global constraints

- **Blocking dependency — verify before opening a worktree.** This lane
  starts only after **L2 Task 8** (importers lane wrap-up, docs) and **L5
  Task 9** (`import_file`/`list_importers` Tauri commands, `commands/import.rs`,
  the `parse_*`/`import_*` `IpcErrorKind` rows) have both merged to `idl-rs`
  `main` (the shared checkout's `rust/` submodule, not a worktree). As of this
  plan's writing neither has landed to `main` (`rust` submodule at `75589bc`,
  pre-dating even L2's own worktree tip `dcf6681`). Check before Task 1:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git log --oneline -1 -- rust   # must post-date the L2/L5-Task-9 merge commits
  grep -c "pub fn import_file" rust/tauri/src/commands/import.rs   # must be >= 1
  grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs   # must be >= 1
  ```
  If either check fails, this lane is not yet unblocked — report back to the
  lead rather than starting against the worktree tip.
- **Two repos, two worktrees**, exactly like wave-1 L5. Setup, before Task 1's
  first step (once the dependency check above passes):
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave2-l8w-write-amendment "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave2-l8w-write-amendment" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l8w-write-amendment "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l8w-write-amendment" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l8w-write-amendment"
  git submodule update --init -- rust
  git -C rust remote add local-wave2 "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave2-l8w-write-amendment"
  git -C rust fetch local-wave2 wave2-l8w-write-amendment
  git -C rust checkout -B wave2-l8w-write-amendment FETCH_HEAD
  ```
  A task that touches both repos ends with **two separate commits**, rust
  worktree first, then the app worktree (Task 14, the dialog plugin, is the
  only task that touches `app/src-tauri`/`app/package.json` — every other
  task is rust-only).
- **Branch:** `wave2-l8w-write-amendment` in both worktrees.
- **Compute rules (CLAUDE.md §8, unchanged from wave 1):** one cargo process
  on the machine at a time, `-p` always, never `-j`. Each task runs only its
  own targeted filter, foreground, and must report a non-zero `passed` count.
  `cargo check -p idl-rs-cli --tests` after any task that changes a `pub`
  signature in `core`. `cargo check -p idl-rs-tauri` after any task that adds
  or changes a command signature. Full
  `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` every four tasks
  and at the lane gate (Task 15). Never `cargo test --workspace`, never a
  bare `cargo test`. No `cargo fmt`, no `cargo tarpaulin`, no `cargo doc`.
- **`idl-rs` is not rustfmt-formatted.** Match surrounding style by hand.
- **No AI attribution trailers.** Never `git push` — Isaac pushes.
- Every `#[tauri::command]` returns `Result<T, IpcError>` (or
  `Result<tauri::ipc::Response, IpcError>` for the two binary commands) —
  never `Err(String)`. Doc comment on every public symbol; units on every
  numeric value; `// TODO(idl0):` never bare `// TODO`.
- TDD: Arrange/Act/Assert with blank lines between; Rust tests inline
  `#[cfg(test)]`; test names `thing — condition — result`.
- Every task ends with a CHANGELOG.md bullet; `TASKS.md`'s wave-2 write-lane
  line is ticked only by Task 15.
- **No file under `app/src/` changes in this lane** (Task 14's capability
  file and `package.json` are the two narrow exceptions — see that task).
  This lane never touches `app/src/routes/`, `app/src/ipc/`, `app/src/state/`.
- Command naming, transport-per-payload-shape, JSON snake_case fields: C3 §1,
  not restated per task, assumed read.

---

## Task 1: `paths::resolve_data_dir` BOM strip (R53 Settings Q4)

**Files:** Modify `rust/tauri/src/paths.rs`.

A `settings.json` written by Windows tooling with a UTF-8 BOM currently fails
`serde_json::from_str` inside `resolve_data_dir` and silently falls back to
the platform default (found and worked around 2026-09-04, tracked note in
`runs/2026-09-03/decisions.md`). Fix: `text.trim_start_matches('\u{feff}')`
before `serde_json::from_str` in `resolve_data_dir`. One test: write
`settings.json` with a leading BOM and a real `data_dir` override, assert
`resolve_data_dir` honours the override rather than falling back to
`app_data_dir`.

**Test filter:** `cargo test -p idl-rs-tauri paths::`
**`pub`-change check:** none (private helper inside an existing `pub fn`,
signature unchanged).

---

## Task 2: App group — settings + data-dir commands

**Files:**
- Create: `rust/tauri/src/commands/app.rs`
- Modify: `rust/tauri/src/commands/mod.rs` (add `pub mod app;`),
  `rust/tauri/src/lib.rs` (register the four commands in `handler()`)

**Wraps:** `idl_rs::store::settings::{load, save, AppSettings}` (already
landed, unchanged) and `state::DataDir`.

**Interfaces (C3 §3.10):**
```rust
#[derive(serde::Serialize)]
pub struct AppSettingsDto { pub data_dir: Option<String>, pub rider_name: String, pub unit_system: String }
// From<idl_rs::store::settings::AppSettings> — UnitSystem -> "imperial"|"metric"

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettingsDto, IpcError>;
#[derive(serde::Deserialize)]
pub struct AppSettingsArg { pub data_dir: Option<String>, pub rider_name: String, pub unit_system: String }
#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, settings: AppSettingsArg) -> Result<AppSettingsDto, IpcError>;

#[derive(serde::Serialize)]
pub struct DataDirInfo { pub resolved_path: String, pub override_path: Option<String>, pub restart_required: bool }
#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle, data_dir: tauri::State<'_, DataDir>) -> Result<DataDirInfo, IpcError>;
#[tauri::command]
pub fn set_data_dir(app: tauri::AppHandle, data_dir: tauri::State<'_, DataDir>, path: Option<String>) -> Result<DataDirInfo, IpcError>;
```

**Key logic** (same idiom as `commands/catalog.rs`/`commands/device.rs`: a
thin `#[tauri::command]` over a `_via`-suffixed plain function taking
`settings_path: &Path` and `resolved_data_dir: &Path` so the module's own
tests exercise the `_via` functions without a running app):

- `get_settings_via(settings_path)`: `store::settings::load(settings_path)`
  (never fails), map to `AppSettingsDto`.
- `set_settings_via(settings_path, arg)`: load current settings, **ignore
  `arg.data_dir`** (ruling R59 Q5 — `set_data_dir` is the sole writer of that
  key), overwrite `rider_name`/`unit_system` from `arg`, `store::settings::save`,
  re-`load` and return (so the response reflects what's actually on disk, same
  pattern `save_session_metadata` will use in Task 5). `save`'s only error
  (`SettingsErrorKind::Io`, `Encode` folds to `internal`) maps `Io -> io`,
  `Encode -> internal`.
- `get_data_dir_via(settings_path, resolved_data_dir)`: `load` settings,
  `override_path = settings.data_dir`, `resolved_path =
  resolved_data_dir.display()`, `restart_required = override_path.map(|p|
  Path::new(p).join("data")) != Some(resolved_data_dir.to_path_buf())` when
  `override_path` is `Some`, else `resolved_data_dir != app_data_dir/data`
  (needs `app_data_dir` too — see note below).
- `set_data_dir_via(settings_path, resolved_data_dir, path)`: validate
  `path` is `Some(p)` where `Path::new(p).is_absolute()` (else
  `invalid_argument` — "a relative path"), attempt
  `std::fs::create_dir_all(Path::new(p).join("data"))` (else `invalid_argument`
  — "a path the app cannot create", per C3's error list; distinguish from a
  transient `io` failure by trying the create *before* writing settings —
  if creation fails, nothing is written); `path: None` clears the override
  (no creation check needed — `app_data_dir` always exists by construction).
  Read-modify-write `rider_name`/`unit_system` unchanged, `data_dir = path`,
  save. Compute `restart_required` the same way `get_data_dir_via` does,
  against the **new** override.

**A real gap to resolve, not invent:** `restart_required` needs the
*platform default* path (`app_data_dir/data`) to compare against when there
is no override, and `get_data_dir`/`set_data_dir` only have `AppHandle`
(which can call `app.path().app_data_dir()`) plus the managed `DataDir`
(the value resolved at startup, already reflecting whatever was in
`settings.json` at launch). Compute the "what would resolve now" value by
calling `idl_rs_tauri::paths::resolve_data_dir(&app.path().app_data_dir()?,
&app.path().app_config_dir()?)` again inside the command (it's idempotent
and cheap — a few `create_dir_all` calls) and compare that fresh result to
the managed `DataDir.0` (the value fixed at startup). This needs no new
managed state: `AppHandle` is enough to call `app.path()` a second time.

**Tests (`_via` functions, temp settings file):**
- `get_settings_via` — missing file / present file round-trips.
- `set_settings_via` — ignores `data_dir` in the argument, preserves the
  existing override, writes `rider_name`/`unit_system`.
- `get_data_dir_via` / `set_data_dir_via` — no-override case
  (`restart_required` false when nothing changed), override-just-changed case
  (`restart_required` true), relative-path rejection, `None` clears an
  existing override.

**Test filter:** `cargo test -p idl-rs-tauri commands::app::`
**`pub`-change check:** `cargo check -p idl-rs-tauri` (new command file,
registered in `handler()`).
**UI swap (lead shell task, not this lane):** `app/src/routes/pages/Settings/ipcStubs.ts`'s
`getSettings`/`setSettings`/`getDataDir`/`setDataDir` → new
`app/src/ipc/app.ts` (`invoke("get_settings")` etc.), plus the one-time
`localStorage` → `settings.json` import R53 Settings Q1(c) specifies.

---

## Task 3: App group — profile commands

**Files:** Modify `rust/tauri/src/commands/app.rs`, `rust/tauri/src/lib.rs`.

**Wraps:** `idl_rs::store::profile::{load_all, save, delete, BikeProfile}`
(already landed, unchanged).

**Interfaces (C3 §3.10):**
```rust
#[derive(serde::Serialize)] pub struct BikeProfileDto { pub profile_id: String, pub profile_name: String, pub created_at_ms: i64, pub updated_at_ms: i64, pub config: serde_json::Value }
#[derive(serde::Serialize)] pub struct SkippedFile { pub path: String, pub reason: String }
#[derive(serde::Serialize)] pub struct ProfileLoadReport { pub profiles: Vec<BikeProfileDto>, pub skipped: Vec<SkippedFile> }

#[tauri::command] pub fn list_profiles(data_dir: tauri::State<'_, DataDir>) -> Result<ProfileLoadReport, IpcError>;
#[tauri::command] pub fn save_profile(data_dir: tauri::State<'_, DataDir>, profile: BikeProfileDto) -> Result<BikeProfileDto, IpcError>;
#[tauri::command] pub fn delete_profile(data_dir: tauri::State<'_, DataDir>, profile_id: String) -> Result<(), IpcError>;
```

**Key logic:**
- `list_profiles_via(data_root)`: `load_all`, map `Vec<(PathBuf, String)>` to
  `Vec<SkippedFile>` (F3, `runs/2026-09-03/decisions.md` R59) — `path.display().to_string()`.
- `save_profile_via`: `profile.config` must be a JSON object
  (`invalid_argument` otherwise — C3's error list); `store::profile::save`,
  return the profile as written. `save`'s `Encode`/`Io` fold `internal`/`io`.
- `delete_profile_via(data_root, profile_id)`: **check the file exists
  first** (`profiles_dir(data_root).join(format!("{profile_id}.idl0p")).is_file()`)
  and raise `not_found` if absent — core's `delete` is idempotent by design
  (F2, R59), the command layer adds the check so a stale-id delete doesn't
  silently "succeed."

**Tests:** round-trip, a malformed file surfaces in `skipped` (not a load
failure), `save_profile_via` rejects a non-object `config`, `delete_profile_via`
raises `not_found` for an unknown id and actually deletes an existing one.

**Test filter:** `cargo test -p idl-rs-tauri commands::app::`
**`pub`-change check:** `cargo check -p idl-rs-tauri`.
**UI swap:** `app/src/routes/pages/Device/ipcStubs.ts`'s
`listProfiles`/`saveProfile`/`deleteProfile` → `app/src/ipc/app.ts`.

---

## Task 4: `read_workbook` (C3 §3.4, L6's hard blocker)

**Files:** Modify `rust/tauri/src/commands/workbook.rs`, `rust/tauri/src/lib.rs`.

**Interfaces:**
```rust
#[derive(serde::Serialize)] pub struct WorkbookSource { pub markdown: String, pub hash: String, pub path: String }
#[tauri::command] pub fn read_workbook(data_dir: tauri::State<'_, DataDir>, id_or_path: String) -> Result<WorkbookSource, IpcError>;
```

**Key logic:** `read_workbook_via(data_dir, id_or_path)` reuses
`resolve_workbook_path` (already in this file, used by `open_workbook`/
`eval_workbook`) to turn `id_or_path` into an absolute path, `std::fs::read`
the bytes, `idl_rs::store::atomic::sha256_hex` for `hash`, return the three
fields. **Does not parse** — no `parse_workbook` call, no `workbook_*` error
kinds raised (that's the entire point of this command vs. `open_workbook`,
C3 §3.4).

**Tests:** existing workbook by id, existing workbook by literal path,
unknown id/path → `not_found`, hash matches a hand-computed sha256 of the
fixture bytes.

**Test filter:** `cargo test -p idl-rs-tauri commands::workbook::read_workbook`
**`pub`-change check:** `cargo check -p idl-rs-tauri`.
**UI swap:** L6 Notebook's workbook-open path → `app/src/ipc/workbook.ts`'s
new `readWorkbook`.

---

## Task 5: Catalog writes — `save_session_metadata`, `delete_session`

**Files:** Modify `rust/tauri/src/commands/catalog.rs`, `rust/tauri/src/lib.rs`.

**Wraps:** `idl_rs::store::session_json::{read_session_json, write_session_json}`,
`idl_rs::store::atomic::sha256_hex`, `catalog_read::get_session` (Task-4-style
read-back), plus new filesystem-removal logic for `delete_session`.

**Interfaces (C3 §3.2):**
```rust
#[derive(serde::Deserialize)] pub struct SessionMetadataPatch {
    pub rider: String, pub bike: String, pub bike_comment: String,
    pub venue_name: String, pub event_name: String, pub event_session: String,
    pub short_comment: String, pub long_comment: String, pub tag: String,
}
#[tauri::command] pub fn save_session_metadata(data_dir: tauri::State<'_, DataDir>, session_id: String, metadata: SessionMetadataPatch) -> Result<SessionDetail, IpcError>;
#[tauri::command] pub fn delete_session(data_dir: tauri::State<'_, DataDir>, session_id: String, delete_blob: bool) -> Result<(), IpcError>;
```

**Key logic — `save_session_metadata_via`:** read `session.json` (not-found
if the session directory is absent — check `sessions/<id>/` is a dir first,
matching `catalog_read::get_session`'s own not-found check), hash the current
bytes, replace exactly the nine fields from `metadata` on the parsed
`SessionJson` (every other field — `laps`, `track_visits`, the lap-flag
fields, `bike_profile_snapshot`, `schema_version` — untouched), `write_session_json`
with `based_on_hash = Some(&current_hash)` (ruling R59 Q1(a): the command
computes the concurrency check internally, read-hash-write, last-write-wins;
no `conflict` kind is ever raised by this path since the hash it passes is
always the one it just read — a genuinely concurrent external write in the
gap between read and write is the one case that *would* surface as
`RenameConflict`/`io`, extremely unlikely at wave-2 usage and explicitly
accepted per R59). Then `catalog_read::get_session` and return that
`SessionDetail`, not a hand-built one, per C3's own wording ("so the pane
redraws from canonical truth").

**Key logic — `delete_session_via`:** check `sessions/<id>/` exists
(`not_found` otherwise), read `blob_sha256` from it first (via
`catalog_read::get_session`, cheaper than re-implementing the metadata read)
**before** removing anything, `std::fs::remove_dir_all(sessions/<id>/)`. When
`delete_blob`, check whether any *other* session under `sessions/*/` has the
same `blob_sha256` (read each remaining session's `metadata.blob_sha256` via
`store::parquet::read_session_metadata` — cheap, no full parquet load) before
removing `blobs/sha256/<2>/<62>` — never remove a blob another session still
references (C4 §3, matches the note already in C3's entry). Then remove the
catalog's `sessions` row for this id directly (`DELETE FROM sessions WHERE
session_id = ?1` via `store::catalog::open_catalog`, plus its `laps`/
`lap_summary` rows) — **not** a full `rebuild_catalog` (that would be
correct but needlessly expensive per delete; direct row deletion mirrors
`rebuild_catalog`'s job of keeping the catalog "an index, rebuildable" —
if this delete's row-removal ever drifts from truth, `rebuild_catalog`
still fixes it, so a hand-rolled `DELETE` here is not a divergence risk in
the load-bearing sense C4 §5 cares about).

**Tests:** `save_session_metadata_via` replaces exactly the nine fields and
preserves laps/track_visits/bike_profile_snapshot; unknown fields in the
patch argument are structurally impossible (Rust struct, not a bag) so no
test needed for "unknown keys ignored" — note this in a doc comment instead,
since C3's wording assumes a JSON bag and this task's typed argument makes
the point moot by construction; unknown `session_id` → `not_found`.
`delete_session_via` — `delete_blob: false` keeps the blob and removes the
session dir + catalog rows; `delete_blob: true` with no other referencing
session removes the blob; `delete_blob: true` with a second session sharing
the blob keeps it; unknown `session_id` → `not_found`.

**Test filter:** `cargo test -p idl-rs-tauri commands::catalog::`
**`pub`-change check:** `cargo check -p idl-rs-tauri`.
**UI swap:** `app/src/routes/pages/Data/ipcStubs.ts`'s `saveSessionMetadata`/
`deleteSession` → `app/src/ipc/catalog.ts`.

---

## Task 6: Device group — managed connection + `device_status`

**Files:** Modify `rust/tauri/src/commands/device.rs`, `rust/tauri/src/state.rs`,
`rust/tauri/src/lib.rs`; modify `app/src-tauri/src/lib.rs` (register the new
managed state — **no Tauri build required for this one-line `.manage()` call
alone**, but the crate will rebuild on its own next `cargo check`/`tauri dev`
regardless; this task does not itself force a build, Task 14 is where the
lane's one real `tauri dev`/`tauri build` happens).

**New state:**
```rust
// state.rs
pub struct Connections(pub std::sync::Mutex<std::collections::HashMap<String, ConnectedDevice>>);
pub struct ConnectedDevice { /* holds a BtleplugBle once connected; see note below */ }
```

**A real design question, not a stub gap:** `BleTransport`'s desktop impl
(`BtleplugBle`) takes `&mut self` for `connect`/`disconnect` and `&self` for
every read (`state.rs`'s existing doc comment on why — see `ble_transport.rs`).
Holding one across commands means `Connections`' map value must own a
`BtleplugBle` behind something `Send`-safe for `tauri::State` (a
`tokio::sync::Mutex<BtleplugBle>` per device, keyed by `device_id`, is the
natural shape — `Mutex<HashMap<String, Arc<tokio::sync::Mutex<BtleplugBle>>>>`
so a command can clone the `Arc` out, drop the outer lock, then lock the
inner one across its own `.await`s). Implement exactly this shape unless the
implementer finds `BtleplugBle` isn't `Send` (verify with a one-line
`fn assert_send<T: Send>() {} let _ = assert_send::<BtleplugBle>;` scratch
check before committing to the design) — if it isn't, stop and report to the
lead rather than picking a workaround (CLAUDE.md §1).

**Interfaces (C3 §3.8):**
```rust
#[tauri::command] pub async fn connect_device(connections: tauri::State<'_, Connections>, device_id: String) -> Result<ConnectionInfo, IpcError>;
#[tauri::command] pub async fn disconnect_device(connections: tauri::State<'_, Connections>, device_id: String) -> Result<(), IpcError>;
#[derive(serde::Serialize)] pub struct DeviceStatus { /* field-for-field idl_transport::ble_status::DeviceStatus, snake_case enums — see C3 §3.8 */ }
#[tauri::command] pub async fn device_status(connections: tauri::State<'_, Connections>, device_id: String) -> Result<DeviceStatus, IpcError>;
```

**Key logic:** `connect_device` — if `device_id` already has an entry in the
map, treat as already-connected (return fresh `ConnectionInfo` from a
`read_status`+cached firmware version, or just re-run `connect()` on a new
`BtleplugBle` and replace the map entry — the simpler choice; document which
one is implemented and why, since C3 does not fix this edge case). Otherwise:
`BtleplugBle::new()`, `.connect(&device_id)`, insert into the map, return
`ConnectionInfo`. `disconnect_device` — remove from the map if present, call
`.disconnect()` on the removed entry; **absent from the map is a no-op, not
`not_found`** (C3: "disconnecting an unconnected device is a no-op, not an
error"). `device_status` — if `device_id` has a managed entry, `.read_status()`
on it; otherwise connect-read-disconnect (a fresh `BtleplugBle`, per C3's
"otherwise connect-act-disconnect" degrade path) — map `ble_status::DeviceStatus`
field-for-field to the C3 `DeviceStatus` DTO (`SdState`/`GpsState`/`ImuState`
→ their C3 string unions via a `From` impl or manual `match`).

**Tests:** `connect_device`/`disconnect_device`/`device_status` are async and
touch real BLE — same testing posture as the rest of `commands/device.rs`:
unit-test the `_via`-suffixed transport-agnostic core against `StubBle`
(reuse the existing test module's `StubBle`), not the `#[tauri::command]`
wrapper itself (which needs `tauri::State`, not constructible outside a
running app — matches this file's existing precedent).

**Test filter:** `cargo test -p idl-rs-tauri commands::device::`
**`pub`-change check:** `cargo check -p idl-rs-tauri` (new managed state +
new commands).
**UI swap:** `Device/ipcStubs.ts`'s `connectDevice`/`disconnectDevice` →
`app/src/ipc/device.ts`; `deviceStatus` too, once Task 7 below also lands
(both land in the same command group's TS module).

---

## Task 7: Device group — `device_control`, `pull_config`

**Files:** Modify `rust/tauri/src/commands/device.rs`, `rust/tauri/src/error.rs`,
`rust/tauri/src/lib.rs`.

**New `IpcErrorKind` variant:** `DeviceRejected` (ruling R59 Q4), with a
`From`-free construction (`IpcError::with_detail(IpcErrorKind::DeviceRejected,
message, json!({"ack": ack_str}))`) since there's no single core/transport
enum to hang a blanket `From` impl off — build it inline at the call site,
same as `IpcErrorKind::InvalidArgument` already is in several places in this
file.

**⚠ Open question — read before implementing, see "Open Questions" below.**
`idl_transport::ble_transport::BtleplugBle::send_command`'s own doc comment
(`ble_transport.rs` lines ~324–343) states that on Windows (`winrtble`),
`btleplug`'s write API never surfaces the actual SPEC §7.2 ACK byte — only
`Ok(())` (success) or a generic `TransportErrorKind::Ble` with `btleplug`'s
own coarse error text. **This means `AckCode::from_byte` cannot be driven by
a real byte on this platform**, and `device_control` cannot reliably
distinguish a device-busy refusal from any other BLE failure by inspecting
`send_command`'s `Result` alone. Do not parse `TransportError.message`
substrings to reconstruct an `AckCode` — that couples this command's
correctness to `btleplug`'s internal error-text wording, which is not a
contract. Implement per the lead's answer to Open Question 1; the interface
below assumes recommendation (a).

**Interfaces (C3 §3.8):**
```rust
#[tauri::command] pub async fn device_control(connections: tauri::State<'_, Connections>, device_id: String, command: String) -> Result<DeviceStatus, IpcError>;
#[tauri::command] pub async fn pull_config(connections: tauri::State<'_, Connections>, device_id: String) -> Result<String, IpcError>;
```

**Key logic — `device_control`:** map `command` string to `ControlCommand`
(`invalid_argument` for an unrecognised string); use the managed connection
if present, else connect-act-disconnect; `send_command`, then poll
`read_status` up to a bounded attempt count/interval (same constants pattern
as this file's existing `WIFI_ON_POLL_ATTEMPTS`/`_INTERVAL`, one constant
pair per transition type or one shared pair — implementer's call, document
it) until the expected field flips (`logging` for start/stop, no analogous
field for wifi_on/wifi_off beyond `wifi_on` itself, which `switch_to_wifi_mode`
already polls) or the timeout expires, returning the **last status read**
rather than an error on timeout (C3's own wording). Map `send_command`'s
`Err` to `IpcErrorKind::Ble` (its current, only reachable mapping — see Open
Question 1 for whether `DeviceRejected` is ever actually raised by this
command on this platform).

**Key logic — `pull_config`:** use the managed connection if present, else
connect-read-disconnect; call `.read_config()` (already implemented,
internally drives `ConfigReadBegin` + the FF06 reassembly loop per its own
doc comment), `String::from_utf8` the result (`internal` on invalid UTF-8 —
not `config`, since that's a *device*-side rejection kind, not a local
decode failure), return the string. `read_config`'s own doc comment states
it returns `TransportErrorKind::Ble` when READ_BEGIN ACKs `0x81` (no config
file) — map that straight through as `ble` per C3's error list (`ble`,
`not_found`, `config`, `internal` — note `not_found` in C3's list is for "no
config file" in the abstract; whether that's reachable as a *distinct*
condition from the generic `ble` mapping above is the same platform
limitation as Open Question 1 — do not invent a text-matching heuristic to
split it out).

**Tests:** `device_control`'s poll-until-transition logic against `StubBle`
(reuse the file's existing `wifi_on_reads`-style queue pattern, generalised
to whichever status field the sent command should flip); `pull_config`
against a `StubBle` whose `read_config` returns known bytes.

**Test filter:** `cargo test -p idl-rs-tauri commands::device::`
**`pub`-change check:** `cargo check -p idl-rs-tauri` (new `IpcErrorKind`
variant is additive per C3 §5 — no `cargo check -p idl-rs-cli --tests`
needed, this variant lives in `idl-rs-tauri`, not `idl-rs` core).

---

## Task 8: `preview_channel_registry`

**Files:** Create a new core function (`rust/core/src/parse/registry_preview.rs`
or a `pub fn` added to `rust/core/src/parse/mod.rs` — implementer's call,
document it), modify `rust/tauri/src/commands/device.rs`, `rust/tauri/src/error.rs`,
`rust/tauri/src/lib.rs`.

**New `IpcErrorKind` variants:** `ConfigParse`, `ConfigUnsupportedVersion`
(both already named in C3 §2's table, not yet implemented per the amendment
draft's §A.6 observation — this task adds them, sourced from a new core
error path, see below).

**⚠ Open question — scope this task to what SPEC §5.2/§8 actually fix, see
Open Question 2.** SPEC §5.2's "Current channels in registry at v3 launch"
table fixes exact `channel_id`s **only** for the 18 IMU axes (0–17), the two
wheel-speed counters (18–19, fixed scale 1.0), the two pressure channels
(20–21, "from config"), and the two HR channels (22–23, fixed scale/offset,
present only when `heart_rate_monitor.enabled`). It does **not** fix a
`channel_id` assignment scheme for arbitrary user-configured `analog.channels[]`
entries beyond the two named pressure slots — SPEC §5.2's own "24+ anything,
TBD" row says so directly, and `channel_id` is stated to be "unique per
session" (i.e., potentially assigned by firmware at record time), not
something a config-only preview can necessarily predict. **Implement only the
SPEC-fixed IDs** (IMU axes present per `imuN.enabled`/per-axis flags, wheel
counters per `wheel_speed.{front,rear}.enabled`, pressure per those same
analog slots if the config's schema names them explicitly, HR per
`heart_rate_monitor.enabled`) and return **no row at all** for any other
`analog.channels[]`/`digital.channels[]` entry — do not invent a
`channel_id` for it. Document this scope limit in the function's doc comment
and in this task's CHANGELOG bullet, and carry the gap into Open Question 2
for the lead (it may want a partial preview shipped now with the gap stated,
which is what this task does by default, or may want the whole command
deferred — see that question).

**New core code:**
```rust
// core::parse (or a new sibling module) — mirrors SPEC §5.2's fixed table.
pub struct RegistryPreviewRow {
    pub channel_id: u16, pub data_type: &'static str, // "i16"|"i32"|"u8"|"u16"|"u32"
    pub sample_rate_hz: f64, pub scale: f64, pub offset: f64,
    pub name: String, pub units: String,
}
pub fn preview_channel_registry(config: &DeviceConfig) -> Vec<RegistryPreviewRow>;
```
This needs a `DeviceConfig` Rust type mirroring SPEC §8's schema closely
enough to read `imu.{accel_range_g,gyro_range_dps}`, the per-IMU
`imu0`/`imu1`/`imu2` override sub-blocks and their per-axis enable flags,
`wheel_speed.{front,rear}.enabled`, and `heart_rate_monitor.enabled` — a
`serde::Deserialize` struct over the relevant subset of SPEC §8's JSON is
enough; it does not need to round-trip or validate the whole document (that's
the TS validator's job per R53 Device Q1). Wire it through
`idl_rs::config::{parse_config, VersionedConfig}` (the same machinery
`session.json`/`.idl1wb` already use) so a malformed or too-new
`config_version` raises typed `ConfigError` — this is the source of the new
`config_parse`/`config_unsupported_version` kinds. IMU axis scale:
`accel_range_g / 32768.0` / `gyro_range_dps / 32768.0` per SPEC §5.2's
formula, resolving per-IMU overrides over the top-level default exactly as
SPEC §8 "Per-IMU range resolution" describes.

**Interface (C3 §3.8):**
```rust
#[derive(serde::Serialize)] pub struct RegistryRow { pub channel_id: u16, pub data_type: String, pub sample_rate_hz: f64, pub scale: f64, pub offset: f64, pub name: String, pub units: String }
#[tauri::command] pub fn preview_channel_registry(config_json: String) -> Result<Vec<RegistryRow>, IpcError>;
```
Thin: `parse_config::<DeviceConfig>(config_json.as_bytes())` mapping
`ConfigErrorKind::{Parse,UnsupportedVersion,Io}` to
`{config_parse,config_unsupported_version,io}` (`Io` is unreachable here —
`parse_config` never touches disk — but the mapping exists for completeness
against `ConfigError`'s full enum), then `core::preview_channel_registry`.

**Tests (core, `rust/core/src`):** all 18 IMU rows present with correctly
resolved per-IMU range overrides; a disabled IMU axis produces no row (SPEC
§5.2: "disabled axes have no registry entry"); wheel/pressure/HR rows present
only per their `enabled` flags; malformed JSON / unsupported version surface
as typed `ConfigError`. **Tests (tauri command layer):** error-kind mapping
only (core's own tests already cover the derivation logic — CLAUDE.md §4
"test what we own", not the same behaviour twice).

**Test filter:** `cargo test -p idl-rs preview_channel_registry` (core),
`cargo test -p idl-rs-tauri commands::device::preview_channel_registry` (tauri).
**`pub`-change check:** `cargo check -p idl-rs-cli --tests` (new `pub` core
surface) **and** `cargo check -p idl-rs-tauri`.
**UI swap:** `Device/config/sourcesPreview.ts`'s enable/rate/unit-only
preview widens onto `app/src/ipc/device.ts`'s new `previewChannelRegistry`
(L7b Task 4, per R53 Device Q1(b)) — a lead shell task in L7b's directory,
not this lane.

---

## Task 9: `eval_workbook`'s `lap_context` argument

**Files:** Modify `rust/tauri/src/commands/workbook.rs`,
`rust/tauri/src/session_source.rs` (if lap-context construction belongs
there alongside `load_lap_context`/`load_session_handle` — check that file
first; extend rather than duplicate if a `load_lap_context`-shaped function
already exists there), `rust/tauri/src/lib.rs` (no new command — this amends
`eval_workbook`'s existing signature, additive per C3 §5).

**Interface (C3 §3.4):**
```rust
#[derive(serde::Deserialize)] pub struct LapContext { pub main_lap: Option<u32>, pub overlay_laps: Vec<u32> }
#[tauri::command]
pub fn eval_workbook(/* existing args */, lap_context: Option<LapContext>) -> Result<Vec<CellOutput>, IpcError>;
```

**Key logic:** `lap_context: None` must reproduce today's behaviour bit for
bit (`MathLapContext::empty()`) — verify this with a regression test before
changing anything else. `Some(lc)` — **per C3's own "Note for the lane"**:
until lap indexing at import lands (R53 Data Q4, Rust backlog item, not this
lane's job), no session has laps, so `lc.main_lap`/`overlay_laps` naming any
lap number must reject `invalid_argument` with `detail: {lap}` (the named lap
"does not exist on `session_id`" per C3's error list) — because
`session_source::load_lap_context` (or wherever main-lap-bounds get built
from `session.json`'s `laps[]`) will find an empty `laps` array for every
session today, this is the *natural* outcome of building a real
`MathLapContext` from the session's actual (currently always empty) lap
table, not a special-cased early return. Implement the real construction —
resolve `session.json`'s `laps[]` (via `catalog_read`/`session_json`, main
lap bounds keyed by `lc.main_lap`, overlay bounds by `lc.overlay_laps`) into
a real `MathLapContext`, and let the existing "lap N not in the lap table"
error path (already implemented and tested in `workbook/v3/host.rs::channel`
against `MathLapContext::NoLapContext`... — check whether `eval_cells`
itself surfaces an analogous per-argument check today, or whether this task
adds the `invalid_argument` check at the command boundary before calling
`eval_cells` at all) produce the correct rejection. Do **not** hand-write a
"reject if session has zero laps" shortcut — build the real thing, and let
its natural behaviour today (always empty) be the honest result; this is
what makes the command already-correct the day lap indexing lands, with zero
further change to this file.

**Tests:** `None` unchanged (regression, exact same output as before this
task); `Some(lc)` naming a lap on a session with no laps → `invalid_argument`
with `detail.lap` matching; (if a fixture with real `session.json` laps can
be built cheaply) a valid `main_lap`/`overlay_laps` selection actually reaches
`current_lap()`/`sector_number()`/etc. — nice to have, not blocking if it
requires more fixture machinery than this task's budget allows; note in the
task's own report if skipped.

**Test filter:** `cargo test -p idl-rs-tauri commands::workbook::eval_workbook`
**`pub`-change check:** `cargo check -p idl-rs-tauri` (signature change is
additive per C3 §5/R41/R43 precedent — not a breaking change, no `_v2`).

---

## Task 10: `create_workbook`

**Files:** Modify `rust/tauri/src/commands/workbook.rs`, `rust/tauri/src/lib.rs`.

**Interface (C3 §3.4):**
```rust
#[tauri::command] pub fn create_workbook(data_dir: tauri::State<'_, DataDir>, name: String) -> Result<WorkbookHandle, IpcError>;
```

**Key logic:** `name` sanitised to a filesystem-safe file name (port the
`session_filename.dart`/SPEC §15.1 convention already cited by C3 — check
whether a Rust port of that sanitiser already exists anywhere in `core`
before writing a new one; if not, this task writes the minimal version this
command needs: strip/replace characters invalid on Windows/POSIX filenames,
trim, and reject if the result is empty → `invalid_argument`). Collision
handling per C4 §2: if `workbooks/<sanitised>.idl1wb` exists, try
`<sanitised>-2`, `-3`, … until free — **not an error** (F1, R59, corrects
L6's own IPC-needs filing). Mint a UUIDv4 `id` (`uuid` crate, already a
dependency), write a minimal valid v3 document: YAML front matter with
`id`, `name: <original, unsanitised name>`, `version: 3`, no cells, no
constants — via `write_atomic` (new file, `based_on_hash: None`) or a direct
`std::fs::write` if `write_atomic`'s "must not already exist" semantics for
`None` fit better here (check `write_atomic`'s doc comment — it should,
since a fresh filename by construction cannot already exist except in a
race the collision-suffix loop already handles). Return `WorkbookHandle {
id, name, path, cell_count: 0 }`.

**Tests:** happy path (file exists after, front matter parses back via
`parse_workbook`, `cell_count` 0); empty name → `invalid_argument`; a name
that sanitises to empty (e.g. all-symbols) → `invalid_argument`; a name
colliding with an existing workbook file gets a `-2` suffix, not an error.

**Test filter:** `cargo test -p idl-rs-tauri commands::workbook::create_workbook`
**`pub`-change check:** `cargo check -p idl-rs-tauri`.
**UI swap:** L6 Notebook's "new workbook" action → `app/src/ipc/workbook.ts`'s
new `createWorkbook`.

---

## Task 11: `fetch_host_channel` (`IDLH` encoder)

**Files:** Create `rust/core/src/workbook/v3/host_channel_wire.rs` (or add to
`host.rs` — implementer's call; a separate file keeps the pure-encoder
concern away from `host.rs`'s lookup logic), modify
`rust/tauri/src/commands/workbook.rs`, `rust/tauri/src/lib.rs`.

**New core code — the `IDLH` binary encoder** (C3 §3.4, padded per ruling
R59 Q3(a)):
```rust
/// Encodes a HostChannel, decimated to `budget` points, as `IDLH` v1 bytes.
pub fn encode_host_channel_idlh(hc: &HostChannel, budget: u32) -> Vec<u8>;
```
Header: `magic="IDLH"` (4B) · `version=1u16` (2B) · `flags: u16` bit0=`has_t`
(2B) · `length: u32` (4B) · `t_length: u32` (4B) · `reserved: [u8;8]` (8B) =
24 bytes total, then `t` as `t_length × f64` (seconds — `hc.t` is already in
seconds per `to_host_channel`'s existing µs→s conversion, no further
conversion needed here), then `v` as `length × f64`. **Decimation to `budget`
happens before encoding** — reuse the existing tile-decimation approach
(`chart_decimation.rs`) if its bucket-min/max shape fits, or a simpler
uniform-stride downsample if a host channel's "decimate for a JS chart"
need doesn't match a tile's min/max-per-bucket semantics (a host channel is
plotted directly by Plot, not tiled — check `chart_decimation.rs`'s doc
comment for whether its API is reusable here at all before assuming it is;
if not, a plain stride-sample down to `budget` points is the simplest
correct thing and should be stated as such, not silently invented as
something fancier).

**Interface (C3 §3.4):**
```rust
#[tauri::command]
pub fn fetch_host_channel(data_dir: tauri::State<'_, DataDir>, workbook_id: String, session_id: Option<String>, def_name: String, budget: u32) -> Result<tauri::ipc::Response, IpcError>;
```
Validate `budget` in `1..=65536` (`invalid_argument` outside) **before**
evaluating anything (§1's binary-command validation-before-bytes rule).
Resolve the workbook + session (reuse `eval_workbook`'s existing session/lap
resolution path), evaluate exactly the one named definition (not the whole
document — check whether `eval_cells`/the resolver exposes a
single-definition entry point, or whether this command evaluates the whole
workbook and picks `def_name` out of the results; the latter is simpler and
almost certainly fine at wave-2 scale, but state which one is implemented
and why). Map `math_*` per-definition failures to their `IpcErrorKind`
directly (this command **does** reject on a failing definition — unlike
`eval_workbook`, there is no partial result to return for one requested
channel). `not_found` for an unknown `workbook_id`/`def_name`.

**Tests (core):** a channel with a recorded axis round-trips through encode
→ manual byte-offset decode → matches; an empty-`t` (scalar/table) channel
encodes `t_length=0`, `flags` bit0 clear; decimation actually reduces point
count when the source exceeds `budget` and is a no-op under it; header is
exactly 24 bytes for every case (alignment check). **Tests (tauri):**
argument validation (`budget` range), not-found cases, a failing definition's
`math_*` kind surfaces as the command's own rejection.

**Test filter:** `cargo test -p idl-rs encode_host_channel_idlh` (core),
`cargo test -p idl-rs-tauri commands::workbook::fetch_host_channel` (tauri).
**`pub`-change check:** `cargo check -p idl-rs-cli --tests` **and**
`cargo check -p idl-rs-tauri`.
**UI swap:** L6 Notebook's host-channel byte path → `app/src/ipc/workbook.ts`'s
new `fetchHostChannel`, decoded per the C3 §3.4 layout L6 already designed
its decoder against (verify the decoder L6 shipped matches this task's
actual byte offsets exactly — 24-byte header, not L6's originally-filed
20-byte one, per Q3(a)'s resolution already applied to C3).

---

## Task 12: `fetch_fft` (`IDLF` encoder)

**Files:** Create/extend a small core wrapper (e.g.
`rust/core/src/raster.rs` alongside the existing spectrogram encoder, or a
new `rust/core/src/fft_wire.rs` — match whichever existing module already
owns the analogous `IDLT`/`IDLR` encoders), modify
`rust/tauri/src/commands/rasters.rs` (or `commands/device.rs`/a new file —
C3 places this in the "Rasters and DSP" group; put it wherever
`fetch_raster`/`fetch_raster_meta` already live, i.e. `commands/rasters.rs`),
`rust/tauri/src/lib.rs`.

**New core code:** a thin wrapper over the existing `idl_rs::fft::welch`
(already landed — Averaging::{Mean,Median}, Scaling::{Magnitude,Density},
window/detrend already match `SpectrogramParams`' vocabulary exactly)
producing `(bin_count, sample_rate_hz, magnitudes: Vec<f32>)`, plus the
`IDLF` byte encoder:
```rust
pub fn encode_fft_idlf(freqs_hz: &[f64], values: &[f64], sample_rate_hz: f64) -> Vec<u8>;
```
Header: `magic="IDLF"` (4B) · `version=1u16` (2B) · `reserved:[u8;2]` (2B) ·
`bin_count:u32` (4B) · `sample_rate_hz:f32` (4B) = 16 bytes, then
`bin_count × f32` magnitudes (cast `values: &[f64]` down to `f32` — the wire
format is `f32` per C3's table even though `welch`'s own output is `f64`;
state this precision drop explicitly in the doc comment, it's deliberate per
C3, not an oversight). `sample_rate_hz` — "the channel's real rate, derived
from its recorded `t_us` axis" (C3): compute from the channel's own
`t_us` (e.g. `1e6 / median(diff(t_us))` or reuse whatever rate-derivation
helper the session/channel model already exposes — check
`session/mod.rs`/`session/handle.rs` for an existing "effective sample rate"
helper before writing a new one).

**Interface (C3 §3.6):**
```rust
#[tauri::command]
pub fn fetch_fft(data_dir: tauri::State<'_, DataDir>, session_id: String, channel: String, lap: Option<u32>, params: SpectrogramParams, averaging: String) -> Result<tauri::ipc::Response, IpcError>;
```
`averaging: "none"|"mean"|"max"|"median"` — **note the mismatch already
present in C3's own text**: `idl_rs::fft::Averaging` only has `Mean`/`Median`
(no `None`/`Max` variant exists in the landed enum per this plan's own
reading of `fft.rs`). C3's TS-facing union names four values; core's enum
has two. Resolve per Open Question 3 below — do not silently drop
`"none"`/`"max"` support or silently treat them as `Mean` without a ruling.
Until answered, this task implements `"mean"`/`"median"` only and rejects
`"none"`/`"max"` with `invalid_argument`, documenting the gap inline and in
this task's CHANGELOG bullet.

`lap: Some(n)` — per C3's own note, reject `invalid_argument` until lap
indexing lands (same honest-natural-rejection approach as Task 9, not a
special-cased check — if a lap-bounds lookup is available from Task 9's
work, reuse it here to window the channel's samples to that lap's time range
before FFT-ing; if `lap` names a lap absent from the session's `laps[]`,
that's the same "no such lap" `invalid_argument` Task 9 already produces).

**Tests (core):** `encode_fft_idlf`'s byte layout round-trips (magic,
version, bin_count, sample_rate_hz, magnitude array, exactly 16-byte
header); a known sinusoid's peak bin matches (reuse the pattern from
`fft.rs`'s own `fft_sinusoid_at_known_frequency_peaks_at_correct_bin` test,
composed through the new wrapper). **Tests (tauri):** argument validation,
not-found, the `"none"`/`"max"` rejection (or their real mapping, once
Open Question 3 is answered).

**Test filter:** `cargo test -p idl-rs encode_fft_idlf` (core),
`cargo test -p idl-rs-tauri commands::rasters::fetch_fft` (tauri).
**`pub`-change check:** `cargo check -p idl-rs-cli --tests` **and**
`cargo check -p idl-rs-tauri`.
**UI swap:** L6 Notebook's FFT chart → `app/src/ipc/rasters.ts`'s new
`fetchFft`.

---

## Task 13: `app/src-tauri` — dialog plugin (the lane's one Tauri build)

**Files:** Modify `app/src-tauri/Cargo.toml` (add `tauri-plugin-dialog`),
`app/src-tauri/src/lib.rs` (`.plugin(tauri_plugin_dialog::init())`),
`app/src-tauri/capabilities/default.json` (add `"dialog:default"` to
`permissions`), `app/package.json` (add `@tauri-apps/plugin-dialog`).

Per R55: no dialog plugin exists in the repo today; `L7a`'s `pickImportFile()`
seam is a pasted-path input pending this. Add the crate + npm package +
capability only — **do not** touch `app/src/` (the seam swap in
`Data/ipcStubs.ts`'s import flow is a lead shell task after this lane
merges, per the operating brief's ownership rule and per R55's own text:
"the seam is swapped by a shell task then"). Verify with one real
`npm run tauri dev` (or `cargo check -p app_lib` if a full dev-server launch
is heavier than this task needs — a full `tauri dev` is the more complete
proof and matches this lane's "one real Tauri build" framing, but a
`cargo check` against the new plugin dependency plus a `npm install` +
`npx tsc --noEmit` in `app/` is enough to prove the crate/capability/npm
wiring compiles and resolves, without needing the window to actually open;
implementer's call which proof to run, document which one and its output).

**Test filter:** none (no Rust/TS logic added, only dependency + capability
wiring) — the proof is the build/check above, not a `cargo test` filter.
**`pub`-change check:** n/a.

---

## Task 14: Wrap-up — CHANGELOG, TASKS.md, C3 §6, full suite gate

**Files:** `CHANGELOG.md`, `TASKS.md`, spot-check
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §6's "Wave-2
amendment (R59)" deferred-items list against what actually shipped in this
lane (it should already match — this step is a grep-confirm, not a rewrite,
per the "grep for it everywhere before calling it fixed" lesson).

- CHANGELOG bullet summarising the whole lane: the 17 commands (naming which
  are thin wrappers vs. new core code, per this plan's own task list), the
  `eval_workbook` amendment, the three new `IpcErrorKind` variants
  (`DeviceRejected`, `ConfigParse`, `ConfigUnsupportedVersion`), the
  `preview_channel_registry` scope limit (Task 8's fixed-IDs-only note), the
  `device_control`/`pull_config` platform limitation (Open Question 1's
  resolution), and the dialog-plugin wiring.
- `TASKS.md`: tick the wave-2 write-lane line; list the same parity-gap-style
  notes the CHANGELOG carries (scope limits are not silent).
- Run the full suite once: `cargo test -p idl-rs -p idl-rs-cli --
  --test-threads=4`. Report the exact `passed`/`failed`/`ignored` counts —
  this is the lane gate, not a per-task check.
- `cargo check -p idl-rs-cli --tests` and `cargo check -p idl-rs-tauri` once
  more, clean, as the final confirmation before merge.

**Test filter:** the full-suite command above (lane gate, not a targeted
filter).

---

## After this lane (lead shell tasks, not part of this plan)

1. Swap `Settings/ipcStubs.ts`, `Device/ipcStubs.ts`, `Data/ipcStubs.ts`'s
   real-command functions for `app/src/ipc/{app,catalog,device,workbook,rasters}.ts`
   wrappers — an import-path change per stub file's own design (each stub's
   doc comment already says so).
2. L7a's `pickImportFile()` seam → the real `@tauri-apps/plugin-dialog` call
   (Task 13 only adds the plugin; this swap is separate).
3. L7c's one-time `localStorage` → `settings.json` import (R53 Settings
   Q1(c)), in `Settings/`'s own directory.
4. L7b Task 4's channel-preview widening onto `preview_channel_registry`
   (R53 Device Q1(b)).
5. Run `npx tsc --noEmit && npx vitest run` (whole TS suite) on `main` after
   all four swaps, then the standard "eyeball the tab in the running dev
   app" wave-2 lane-merge step.

---

## Open Questions

1. **`device_control`'s `device_rejected` kind may be unreachable on the
   desktop transport as landed.** `BtleplugBle::send_command`'s own doc
   comment states that Windows's `winrtble` backend never surfaces the SPEC
   §7.2 ACK byte through `btleplug`'s write API — every non-success outcome,
   including a device's deliberate busy/precondition refusal, collapses into
   the same generic `TransportErrorKind::Ble`. Options: **(a)** ship
   `device_control` per C3 as written, with `device_rejected` correctly
   *defined* but practically unreachable on this platform today (every
   refusal surfaces as `ble`); document the gap in this task's doc comment
   and the CHANGELOG, and leave it to whichever later lane gives `idl-transport`
   a richer ACK readback (a different `btleplug` version, a lower-level GATT
   API, or — per the transport module's own comment — L9's mobile plugins on
   a platform whose BLE stack does expose the byte). **(b)** Change
   `BleTransport::send_command`'s trait signature to return the raw ACK byte
   (or an `AckCode`) instead of folding it into `Result<(), TransportError>`
   — a cross-lane change to `idl-transport`'s public API, needing a
   transport-lane task, not something this Rust-write lane can do unilaterally
   per CLAUDE.md §7 ("Lanes touch only their own crate/directory"). **(c)**
   Defer `device_control`'s `device_rejected` distinction to wave 3
   entirely, shipping `device_control` for wave 2 with only `ble`/`not_found`/
   `invalid_argument`/`internal` (never `device_rejected`), and file the
   trait change as a wave-3 transport task. **Recommendation: (a).** The
   contract gains a correct, forward-looking kind now (harmless, additive);
   the platform limitation is real and documented, not invented; and a
   trait-signature change to `idl-transport` is out of scope for a lane whose
   charter is "implement C3, don't redesign transport." Cost if wrong:
   `device_control`'s error UI for a busy device shows a generic BLE-failure
   message instead of "stop the recording first" until the transport layer
   changes — a UX gap, not a correctness bug (the write still doesn't
   silently succeed).

2. **`preview_channel_registry`'s generic-analog-channel gap.** SPEC §5.2's
   registry table fixes `channel_id`s only for the 18 IMU axes, 2 wheel
   counters, 2 pressure channels, and 2 HR channels — it explicitly leaves
   "24+ anything" as `TBD`, and states `channel_id` is "unique per session"
   (assigned at record time), not necessarily derivable from config alone.
   `analog.channels[]`/`digital.channels[]` entries beyond the two named
   pressure slots have no fixed wire `channel_id`. Options: **(a)** ship
   `preview_channel_registry` for the SPEC-fixed rows only (IMU/wheel/
   pressure/HR), returning no row for any other configured analog/digital
   channel — this plan's Task 8 as written. **(b)** Defer the whole command
   to wave 3 pending a SPEC §5.2 amendment that fixes a deterministic
   `channel_id` assignment scheme for generic channels (e.g. "assigned in
   config-array order starting at 24"). **(c)** Ship (a) now, and separately
   ask Isaac/firmware whether generic channel IDs are in fact assigned
   deterministically by config order — if so, a SPEC §5.2 amendment closes
   the gap additively later with no further command change. **Recommendation:
   (c).** L7b's own R53 Device Q1 ruling already scoped wave 2's Device tab
   preview to enable/rate/unit only for exactly this reason (Q1(b) widens the
   channels table onto the registry preview, but that widening is a separate,
   later L7b task per the ruling) — shipping the SPEC-fixed subset now
   unblocks that widening for the channels SPEC does fix, without guessing at
   the ones it doesn't. Cost if wrong: the Device tab's widened channels
   table shows fewer rows (only fixed-ID sensors) than a user with custom
   analog channels might expect, until the SPEC gap is closed — visible as an
   absence, not a wrong value.

3. **`fetch_fft`'s `averaging` union names two values `idl_rs::fft::Averaging`
   doesn't have.** C3's TS-facing type is `"none" | "mean" | "max" | "median"`;
   the landed core enum is `Averaging::{Mean, Median}` only — no `None`
   (single-segment, no cross-segment averaging at all — which `welch` already
   supports via `nperseg: 0`, just not as an `Averaging` *variant*) and no
   `Max` (a per-bin maximum across segments, which `welch`'s reduction loop
   does not implement at all today). Options: **(a)** extend
   `idl_rs::fft::Averaging` with `None`/`Max` variants and `welch`'s
   reduction match arm — new core logic, small (a per-bin `.max()` fold
   parallel to the existing `Mean`/`Median` arms; "none" maps to
   `nperseg: 0` at the call site, not a new `Averaging` variant, since
   "no averaging" is already expressible as "one segment"). **(b)** Narrow
   `fetch_fft`'s wire union to `"mean" | "median"` only, amend C3 §3.6
   (a real, if small, spec change), and have L6's UI drop the other two
   options from whatever picker it built. **(c)** Ship this task with
   `"mean"`/`"median"` implemented and `"none"`/`"max"` rejected as
   `invalid_argument`, matching C3's stated union without amending it, until
   the lead rules. **Recommendation: (a).** The two missing modes are small,
   well-defined DSP additions consistent with `welch`'s existing structure
   (CLAUDE.md's "physics of the bike → core" applies directly), and
   `fetch_fft` is otherwise blocked from matching its own contract's stated
   union without them. Cost if wrong: one extra small core task
   (`Averaging::Max`'s reduction arm plus its own unit test) inserted before
   Task 12 can close cleanly; if the lead prefers (b)/(c) instead, this
   task's scope shrinks rather than grows.

## Lead rulings 2026-09-05 (R63)

Open questions 1-3 are ruled in `runs/2026-09-03/decisions.md` R63: (1) `device_rejected` ships as specified, mapped only where the transport surfaces an `AckCode`, never faked from error text, `TODO(idl0)` at the transport boundary; (2) `preview_channel_registry` covers the SPEC 5.2 fixed subset only (generic channel-id determinism is a question for Isaac); (3) extend `idl_rs::fft::Averaging` with `None` and `Max` and amend C3's `fetch_fft` averaging union to `"none" | "mean" | "median" | "max"` (Task 12, spec-during). Task briefs cite R63, not this paragraph.

## Added by the lead 2026-09-05 (tracked note: math builtin catalog)

Additive task for this lane (after Task 12, before wrap-up): `list_math_builtins() -> { name, arity, unit_rule }[]` in the C3 §3.4 workbook group, a thin wrapper over the catalog `rust/core/src/math/eval.rs` already owns; C3 amended spec-during. The UI swap (a lead shell task) makes `Notebook/model/functionCatalog.ts` verify itself against the command once at startup and log a mismatch.

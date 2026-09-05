# L8w Task 2 — implementer brief (App group: settings + data-dir commands, C3 §3.10)

You are the implementer for L8w Task 2: `get_settings`, `set_settings`,
`get_data_dir`, `set_data_dir` — the first four commands of the new §3.10
App group, thin wrappers over already-landed `idl_rs::store::settings`.
Satisfies wave-2 needs L7-6/L7-7 (ruling R53 Settings Q1/Q4). TDD, ONE
commit, then report.

## GATE — verify before opening the worktree

Same gate as Task 1 — this lane opens only after **L2 Task 8** and **L5
Task 9** merge into `idl-rs` `main`:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report — do not start
against a stale tip.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment` (see Task 1's brief for the exact
  `git worktree add` command if it doesn't exist yet). If Task 1's commit is
  already on this branch, build on top of it — do not recreate the worktree.
- Work ONLY there. Do NOT touch the shared checkout beyond reading files
  named below. Do NOT edit `docs/`. Do NOT push.
- **Files:**
  - Create: `tauri/src/commands/app.rs`
  - Modify: `tauri/src/commands/mod.rs` (add `pub mod app;`), `tauri/src/lib.rs`
    (register the four commands in `handler()`'s `tauri::generate_handler![...]`
    list)

- Read first: `CLAUDE.md` (§2, §4, §5, §8); the plan's Task 2 section in
  full (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`)
  — its sketched interfaces and key-logic prose are this brief's starting
  point, refined below where the landed code makes a cleaner choice
  possible; `runs/2026-09-05/lanes/l8w/BRIEF.md` and `review-STANDING.md`;
  C3 §3.10 in full (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`)
  — quoted below; ruling R59 Q5 (`runs/2026-09-03/decisions.md`, "Q5 →
  (a)") — `set_data_dir` is the sole writer of the `data_dir` key;
  `set_settings` ignores it and echoes the current value; the landed
  `idl_rs::store::settings` module (`rust/core/src/store/settings.rs`, on
  `main`) in full — `AppSettings`, `UnitSystem` (already
  `#[derive(Serialize, Deserialize)]` with `#[serde(rename_all =
  "snake_case")]`, so it already round-trips as exactly `"imperial"` /
  `"metric"` — see the deviation note below), `load` (never fails),
  `save` (`SettingsErrorKind::{Io, Encode}`); `tauri/src/paths.rs`'s
  `resolve_data_dir` (Task 1's file — you call this function a second
  time, unmodified, inside `get_data_dir_via`/`set_data_dir_via`);
  `tauri/src/state.rs` (`DataDir(pub PathBuf)`, the managed value fixed at
  startup — this is why `restart_required` is a real condition);
  `tauri/src/commands/catalog.rs` in full (the established `_via`-suffixed
  idiom this file follows: a thin `#[tauri::command]` over a plain function
  taking paths, `From<core::X>` impls for response DTOs, the test module's
  `temp_root()` helper pattern — copy its shape, do not invent a new one);
  `tauri/src/lib.rs` in full (the `handler()` function's
  `tauri::generate_handler![...]` list — add this task's four commands at
  the end); `app/src-tauri/src/lib.rs` (how `app.path().app_data_dir()`/
  `app_config_dir()` are called today, via `tauri::Manager` — you need the
  same trait import in `app.rs`); `app/src/routes/pages/Settings/ipcStubs.ts`
  (the `AppSettings`/`DataDirInfo` TS shapes this task's Rust DTOs must
  match field-for-field — read-only, do not edit).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never
override with `-j`). While working: `cargo test -p idl-rs-tauri
commands::app::`, foreground, non-zero `passed`. Do not run the lane's
four-task checkpoint or full-suite gate yourself unless the dispatch
explicitly says this is the fourth task in a batch. No `cargo fmt`, no
`cargo tarpaulin`, no `cargo doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-tauri` (new command file,
four new commands registered in `handler()`). No `core` `pub` signature
changes in this task (nothing in `rust/core/src` is touched), so
`cargo check -p idl-rs-cli --tests` is not required for this task alone.

## C3 §3.10 (quoted — this is the contract you implement)

> **`get_settings()` / `set_settings(settings: AppSettings)`**
> Satisfies wave-2 need L7-6 (ruling R53 Settings Q1).
> ```ts
> interface AppSettings {
>   data_dir: string | null;
>   rider_name: string;                  // "" = not set (C4 §1)
>   unit_system: "imperial" | "metric";  // engine default "imperial"
> }
> ```
> Both return `AppSettings` (the state after the call).
> `get_settings` calls `store::settings::load(app_config_dir()/settings.json)`,
> which never fails — a missing or malformed file yields defaults (C4 §1).
> `set_settings` calls `store::settings::save`, a whole-document replace
> through C4 §4's primitive, staged in the file's own directory.
> `set_settings` ignores the `data_dir` field of its argument and echoes the
> current value in its response — `set_data_dir` below is the sole writer of
> that key (ruling R59 Q5).
> Errors: `io`, `internal` (`SettingsErrorKind::Encode` folds to `internal`
> per §2's folding rule; `load` never fails).
>
> **`get_data_dir()` / `set_data_dir(path: string | null)`**
> Satisfies wave-2 need L7-7 (ruling R53 Settings Q4).
> ```ts
> interface DataDirInfo {
>   resolved_path: string;
>   override_path: string | null;
>   restart_required: boolean;
> }
> ```
> Both return `DataDirInfo`.
> `resolved_path` is the managed `state::DataDir`, resolved once at startup
> and cached for the process lifetime (C4 §1) — which is precisely why
> `restart_required` is a real condition and not defensive coding.
> `set_data_dir` writes only the `data_dir` key, read-modify-write,
> preserving `rider_name` and `unit_system` (ruling R59 Q5); it does not
> move existing files.
> Errors: `invalid_argument` (a relative path, or one the app cannot
> create), `io`, `internal`.

## Deviation from the plan's sketch, flagged and reasoned

The plan's own interface sketch types `AppSettingsDto`/`AppSettingsArg`'s
`unit_system` as a plain `String`, with a comment "`UnitSystem ->
"imperial"|"metric"`" implying a hand-written mapping function in each
direction, and leaves unstated what happens if `set_settings`'s argument
carries an unrecognised `unit_system` string. **This brief specifies
instead:** type both DTOs' `unit_system` field as
`idl_rs::store::settings::UnitSystem` directly, not `String`. That enum
already derives `Serialize`/`Deserialize` with `#[serde(rename_all =
"snake_case")]`, so it already serialises to exactly `"imperial"` /
`"metric"` and deserialises from exactly those two strings with no
translation code needed on either side. This is not a scope change — the
wire bytes are identical either way — and it sidesteps a real ambiguity
the plan's sketch left unresolved (CLAUDE.md §1: what should an
unrecognised `unit_system` string do — silently default, or reject?) by
making an invalid string a Tauri-level argument-deserialisation failure
before the command body ever runs, rather than inventing fallback
behaviour. **Document this substitution in your report** so the reviewer
checks the wire strings match C3 exactly (they do — verified against
`UnitSystem`'s own derive above) rather than assuming a silent deviation.

## Interfaces (as specified, incorporating the deviation above)

```rust
use idl_rs::store::settings::{AppSettings, SettingsErrorKind, UnitSystem};

/// C3 §3.10 `AppSettings` — `get_settings`'s return and (as `AppSettingsArg`
/// below) `set_settings`'s argument shape.
#[derive(Debug, Clone, serde::Serialize)]
pub struct AppSettingsDto {
    pub data_dir: Option<String>,
    pub rider_name: String,
    pub unit_system: UnitSystem,
}
impl From<AppSettings> for AppSettingsDto { /* field-for-field */ }

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<AppSettingsDto, IpcError>;

/// `set_settings`'s argument. Same fields as `AppSettingsDto` — `data_dir`
/// is present on the wire (C3's `AppSettings` is one TS interface for both
/// directions) but ignored server-side; see `set_settings_via` below.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct AppSettingsArg {
    pub data_dir: Option<String>,
    pub rider_name: String,
    pub unit_system: UnitSystem,
}
#[tauri::command]
pub fn set_settings(app: tauri::AppHandle, settings: AppSettingsArg) -> Result<AppSettingsDto, IpcError>;

/// C3 §3.10 `DataDirInfo`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DataDirInfo {
    pub resolved_path: String,
    pub override_path: Option<String>,
    pub restart_required: bool,
}
#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle, data_dir: tauri::State<'_, DataDir>) -> Result<DataDirInfo, IpcError>;
#[tauri::command]
pub fn set_data_dir(app: tauri::AppHandle, data_dir: tauri::State<'_, DataDir>, path: Option<String>) -> Result<DataDirInfo, IpcError>;
```

## Key logic — the `_via`-suffixed idiom (matching `commands/catalog.rs`)

Each command resolves `app.path().app_config_dir()`/`app_data_dir()` (via
`use tauri::Manager;`) and delegates to a plain, transport-agnostic
function this module's own tests call directly with temp paths —
`tauri::AppHandle`/`tauri::State` cannot be constructed outside a running
app. Map any `tauri::Error` from `app.path()...` itself to
`IpcErrorKind::Internal` (a launch-time path-resolution failure surfacing
at command time is an unexpected condition, not the caller's fault — no
C3 §3.10 error row names it because it should never actually happen once
`.setup()` has run once at launch).

```rust
fn settings_path(app_config_dir: &Path) -> PathBuf {
    app_config_dir.join("settings.json")
}

fn map_settings_error(e: idl_rs::store::settings::SettingsError) -> IpcError {
    match e.kind {
        SettingsErrorKind::Io => IpcError::new(IpcErrorKind::Io, e.message),
        SettingsErrorKind::Encode => IpcError::new(IpcErrorKind::Internal, e.message),
    }
}

fn get_settings_via(settings_path: &Path) -> AppSettingsDto {
    idl_rs::store::settings::load(settings_path).into()
}

fn set_settings_via(settings_path: &Path, arg: AppSettingsArg) -> Result<AppSettingsDto, IpcError> {
    let mut current = idl_rs::store::settings::load(settings_path);
    // R59 Q5: arg.data_dir is deliberately not applied — set_data_dir is
    // the sole writer of that key.
    current.rider_name = arg.rider_name;
    current.unit_system = arg.unit_system;
    idl_rs::store::settings::save(settings_path, &current).map_err(map_settings_error)?;
    // Re-load so the response reflects what's actually on disk (same
    // pattern Task 5's save_session_metadata uses).
    Ok(idl_rs::store::settings::load(settings_path).into())
}

fn get_data_dir_via(
    settings_path: &Path,
    app_data_dir: &Path,
    app_config_dir: &Path,
    resolved_data_dir: &Path,
) -> Result<DataDirInfo, IpcError> {
    let settings = idl_rs::store::settings::load(settings_path);
    let fresh = crate::paths::resolve_data_dir(app_data_dir, app_config_dir)?;
    Ok(DataDirInfo {
        resolved_path: resolved_data_dir.display().to_string(),
        override_path: settings.data_dir,
        restart_required: fresh != resolved_data_dir,
    })
}

fn set_data_dir_via(
    settings_path: &Path,
    app_data_dir: &Path,
    app_config_dir: &Path,
    resolved_data_dir: &Path,
    path: Option<String>,
) -> Result<DataDirInfo, IpcError> {
    if let Some(p) = &path {
        if !Path::new(p).is_absolute() {
            return Err(IpcError::new(IpcErrorKind::InvalidArgument, format!("'{p}' is not an absolute path")));
        }
        // Create before writing settings — if this fails, nothing is
        // written (plan's own ordering rule).
        std::fs::create_dir_all(Path::new(p).join("data"))
            .map_err(|e| IpcError::new(IpcErrorKind::InvalidArgument, format!("cannot create '{p}': {e}")))?;
    }
    let mut current = idl_rs::store::settings::load(settings_path);
    current.data_dir = path.clone();
    idl_rs::store::settings::save(settings_path, &current).map_err(map_settings_error)?;
    let fresh = crate::paths::resolve_data_dir(app_data_dir, app_config_dir)?;
    Ok(DataDirInfo {
        resolved_path: resolved_data_dir.display().to_string(),
        override_path: path,
        restart_required: fresh != resolved_data_dir,
    })
}
```

`resolved_path` in both functions is always `resolved_data_dir` (the
managed `DataDir`, fixed at startup) — **never** `fresh` — that is the
entire point of `restart_required` existing: the response tells the caller
what is actually in effect right now versus what would take effect after a
restart. `crate::paths::resolve_data_dir` returns `Result<PathBuf,
IpcError>` already (it can fail on `create_dir_all` inside the new root's
tree) — propagate its `Err` with `?`, do not remap it.

Command wrappers thread `app.path()` results through, e.g.:
```rust
#[tauri::command]
pub fn get_data_dir(app: tauri::AppHandle, data_dir: tauri::State<'_, DataDir>) -> Result<DataDirInfo, IpcError> {
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir().map_err(|e| IpcError::new(IpcErrorKind::Internal, e.to_string()))?;
    let app_config_dir = app.path().app_config_dir().map_err(|e| IpcError::new(IpcErrorKind::Internal, e.to_string()))?;
    get_data_dir_via(&settings_path(&app_config_dir), &app_data_dir, &app_config_dir, &data_dir.0)
}
```
`get_settings`/`set_settings` only need `app_config_dir()`, not
`app_data_dir()`.

## Tests (`_via` functions, temp settings file + temp data-dir paths)

- `get_settings_via` — missing file returns defaults; a present file
  round-trips every field.
- `set_settings_via` — ignores `data_dir` in the argument (existing
  override on disk is unchanged after the call), writes `rider_name`/
  `unit_system` from the argument, and the returned `AppSettingsDto`
  reflects what was actually written (re-read, not echoed from the
  argument).
- `get_data_dir_via` — no-override case: `resolved_data_dir` equals what
  `resolve_data_dir` would compute fresh from the same `app_data_dir`/
  `app_config_dir` with no `settings.json` override → `restart_required ==
  false`. Override-just-changed case: `resolved_data_dir` passed in is the
  *old* value, `settings.json` already carries a *different* override
  written directly (simulating "changed on disk, app not yet restarted")
  → `restart_required == true`.
- `set_data_dir_via` — relative path → `invalid_argument`, nothing written
  (settings file unchanged or absent); absolute path to a fresh temp dir →
  succeeds, `<path>/data` exists on disk afterward, `override_path` echoes
  the path, `restart_required == true` (the managed `resolved_data_dir`
  passed in is still the old one); `path: None` clears an existing
  override (`settings.json`'s `data_dir` reads back `null`/absent).

Match `commands/catalog.rs`'s test module conventions: a `temp_root()`-style
helper per test (or a small helper building a `(settings_path, app_data_dir,
app_config_dir)` tuple of temp dirs), A/A/A with blank lines, names `thing —
condition — result`.

## The task, in order

- [ ] **Step 1: Confirm the gate** and open/reuse the worktree.
- [ ] **Step 2: Write the failing tests** for all four `_via` functions.
- [ ] **Step 3: Implement `tauri/src/commands/app.rs`** — DTOs, `From`
      impls, `_via` functions, `#[tauri::command]` wrappers, doc comments on
      every public symbol, units on every numeric value (none here beyond
      booleans/strings — say so if a reviewer expects one).
- [ ] **Step 4: Register** — `pub mod app;` in `commands/mod.rs`;
      `commands::app::get_settings, commands::app::set_settings,
      commands::app::get_data_dir, commands::app::set_data_dir,` added to
      `lib.rs`'s `handler()` list.
- [ ] **Step 5: Test** — `cargo test -p idl-rs-tauri commands::app::`,
      confirm non-zero `passed`.
- [ ] **Step 6: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 7: Commit** — explicit paths (not `git add -A`):
      `git add tauri/src/commands/app.rs tauri/src/commands/mod.rs tauri/src/lib.rs`
      — message
      `tauri: App group -- get_settings/set_settings, get_data_dir/set_data_dir (C3 3.10, R59 Q5)`.
      Single line, no AI attribution trailer.

## Do not

- Do not let `set_settings` write `arg.data_dir` anywhere, even if a test
  seems to want it — `set_data_dir` is the sole writer (R59 Q5).
- Do not invent a `String`-based hand-rolled mapping for `unit_system` —
  use `idl_rs::store::settings::UnitSystem` directly as the deviation above
  specifies, and say so in your report.
- Do not write `settings.json` before `set_data_dir_via`'s `create_dir_all`
  check succeeds — ordering matters (a failed create must leave nothing
  written).
- Do not touch `rust/core/src` — everything this task needs is already
  landed in `store::settings`.
- Do not edit `app/src/routes/pages/Settings/ipcStubs.ts` — the UI swap is
  a lead shell task after this lane merges.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.

## Style / hygiene

Doc comment on every public symbol; units on every numeric value; typed
errors only (`Result<T, IpcError>`, never `Err(String)`); A/A/A tests named
`thing — condition — result`; match this crate's established `_via`-function
idiom exactly. No `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.10 already fixes these four commands'
shape; this task implements it as specified, with the `unit_system`-typing
deviation documented above (a Rust-side simplification, not a wire-shape
change).

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::app::` result line with its `passed` count; `cargo check -p
idl-rs-tauri` result; explicit confirmation of the `unit_system`-typing
deviation and that the wire strings still match C3 exactly; confirmation
`set_settings` never writes `data_dir`; confirmation `Settings/ipcStubs.ts`
was not touched; anything else ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

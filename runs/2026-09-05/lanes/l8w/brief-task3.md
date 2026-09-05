# L8w Task 3 — implementer brief (App group: profile commands, C3 §3.10)

You are the implementer for L8w Task 3: `list_profiles`, `save_profile`,
`delete_profile` — the remaining three §3.10 App commands, thin wrappers
over already-landed `idl_rs::store::profile`. Satisfies wave-2 need L7-11.
TDD, ONE commit, then report.

## GATE — verify before opening the worktree

Same gate as Tasks 1–2:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`, on top of Task 2's commit (verify
  `git log --oneline -3` shows Task 2's `app: App group -- get_settings/...`
  commit before starting; if it's missing, stop and report — this task
  extends the same `tauri/src/commands/app.rs` file Task 2 created).
- Work ONLY there. Do NOT touch the shared checkout beyond reading files
  named below. Do NOT edit `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/app.rs` (extend, do not replace —
  Task 2's `get_settings`/`set_settings`/`get_data_dir`/`set_data_dir` stay
  exactly as landed), `tauri/src/lib.rs` (register the three new commands).

- Read first: `CLAUDE.md`; the plan's Task 3 section
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  `runs/2026-09-05/lanes/l8w/BRIEF.md`/`review-STANDING.md`; C3 §3.10's
  profile-commands entry (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`)
  — quoted below; ruling R59's "F1–F3 accepted" line
  (`runs/2026-09-03/decisions.md`, "F1–F3 accepted (`create_workbook`
  suffixes per C4 §2, `delete_profile` → `not_found`, `ProfileLoadReport.skipped`
  as objects)") — F2/F3 are this task's; the landed `idl_rs::store::profile`
  module (`rust/core/src/store/profile.rs`, on `main`) in full —
  `BikeProfile`, `ProfileLoad { profiles, skipped: Vec<(PathBuf, String)> }`,
  `load_all` (sorted by `profile_name`, malformed files land in `skipped`,
  never fail the whole load), `save` (last-write-wins via
  `write_atomic_with_retry`), `delete` (idempotent — no-ops on a missing
  file; **the command layer, not core, is what raises `not_found`** for a
  delete of an unknown id, per F2); the `tauri/src/commands/app.rs` file
  Task 3 is extending — read Task 2's landed `_via` idiom, `DataDir` usage,
  and doc-comment style, and match it exactly; `app/src/routes/pages/Device/ipcStubs.ts`'s
  `listProfiles`/`saveProfile`/`deleteProfile` stubs (read-only — the TS
  shapes your Rust DTOs must match field-for-field; do not edit).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never
override with `-j`). While working: `cargo test -p idl-rs-tauri
commands::app::`, foreground, non-zero `passed` (this filter now covers
Task 2's four tests plus this task's new ones — expect a larger combined
count, that's correct). No `cargo fmt`, no `cargo tarpaulin`, no `cargo
doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-tauri` (three new commands
registered in `handler()`). No `core` changes in this task, so `cargo check
-p idl-rs-cli --tests` is not required alone.

## C3 §3.10 (quoted — the entry this task implements)

> **`list_profiles()` / `save_profile(profile: BikeProfile)` /
> `delete_profile(profile_id: string)`**
> Satisfies wave-2 need L7-11.
> ```ts
> interface BikeProfile {
>   profile_id: string; profile_name: string;
>   created_at_ms: number; updated_at_ms: number;   // i64
>   /** The SPEC §8 device-config document, stored and pushed verbatim. */
>   config: Record<string, unknown>;
> }
> interface ProfileLoadReport {
>   profiles: BikeProfile[];                        // sorted by profile_name ascending
>   /** Files that failed to parse — never a failure of the whole load. */
>   skipped: { path: string; reason: string }[];
> }
> ```
> `list_profiles` returns `ProfileLoadReport`; `save_profile` returns the
> `BikeProfile` as written; `delete_profile` returns `void`. Thin over
> `store::profile::{load_all, save, delete}` against
> `<data>/profiles/*.idl0p` (C4 §2).
> Core's `profile::delete` is idempotent — it no-ops on a missing file —
> but the command layer raises `not_found` when the file is absent, so a
> delete of a stale id doesn't silently succeed.
> Errors: `not_found` (delete of an unknown id), `invalid_argument` (a
> `config` that is not a JSON object), `io`, `internal`.

## Interfaces

```rust
/// C3 §3.10 `BikeProfile` — mirrors `idl_rs::store::profile::BikeProfile`
/// field for field (that core type is not `Serialize`, so it never crosses
/// IPC directly).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BikeProfileDto {
    pub profile_id: String,
    pub profile_name: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub config: serde_json::Value,
}
impl From<idl_rs::store::profile::BikeProfile> for BikeProfileDto { /* field-for-field */ }
impl From<BikeProfileDto> for idl_rs::store::profile::BikeProfile { /* field-for-field, for save_profile_via */ }

/// C3 §3.10 `ProfileLoadReport.skipped` element.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

/// C3 §3.10 `ProfileLoadReport`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProfileLoadReport {
    pub profiles: Vec<BikeProfileDto>,
    pub skipped: Vec<SkippedFile>,
}

#[tauri::command]
pub fn list_profiles(data_dir: tauri::State<'_, DataDir>) -> Result<ProfileLoadReport, IpcError>;
#[tauri::command]
pub fn save_profile(data_dir: tauri::State<'_, DataDir>, profile: BikeProfileDto) -> Result<BikeProfileDto, IpcError>;
#[tauri::command]
pub fn delete_profile(data_dir: tauri::State<'_, DataDir>, profile_id: String) -> Result<(), IpcError>;
```

`BikeProfileDto` derives both `Serialize` (for `list_profiles`/
`save_profile`'s return) and `Deserialize` (for `save_profile`'s argument)
— one struct, both directions, matching C3's single `BikeProfile` TS
interface used both ways. This is the one place in this task that reuses a
single DTO for request and response (unlike Task 2's
`AppSettingsDto`/`AppSettingsArg` split) — fine either way; note in your
report if you split it instead and why.

## Key logic (`_via`-suffixed idiom, matching Task 2's file)

```rust
fn list_profiles_via(data_root: &Path) -> ProfileLoadReport {
    let loaded = idl_rs::store::profile::load_all(data_root);
    ProfileLoadReport {
        profiles: loaded.profiles.into_iter().map(BikeProfileDto::from).collect(),
        skipped: loaded
            .skipped
            .into_iter()
            .map(|(path, reason)| SkippedFile { path: path.display().to_string(), reason })
            .collect(),
    }
}

fn save_profile_via(data_root: &Path, profile: BikeProfileDto) -> Result<BikeProfileDto, IpcError> {
    if !profile.config.is_object() {
        return Err(IpcError::new(IpcErrorKind::InvalidArgument, "profile.config must be a JSON object"));
    }
    let core_profile: idl_rs::store::profile::BikeProfile = profile.into();
    idl_rs::store::profile::save(data_root, &core_profile).map_err(map_profile_error)?;
    Ok(core_profile.into())
}

fn delete_profile_via(data_root: &Path, profile_id: &str) -> Result<(), IpcError> {
    let path = data_root.join("profiles").join(format!("{profile_id}.idl0p"));
    if !path.is_file() {
        return Err(IpcError::new(IpcErrorKind::NotFound, format!("profile '{profile_id}' not found")));
    }
    idl_rs::store::profile::delete(data_root, profile_id).map_err(map_profile_error)?;
    Ok(())
}

fn map_profile_error(e: idl_rs::store::profile::ProfileError) -> IpcError {
    use idl_rs::store::profile::ProfileErrorKind;
    match e.kind {
        ProfileErrorKind::Io => IpcError::new(IpcErrorKind::Io, e.message),
        ProfileErrorKind::Encode => IpcError::new(IpcErrorKind::Internal, e.message),
    }
}
```

`delete_profile_via`'s existence check must happen **before** calling core's
`delete` (which would otherwise silently no-op on the same missing file) —
this is the command layer adding the check core deliberately omits (F2).
Building the profile file path directly (`profiles_dir(...).join(...)`)
duplicates one line of `profile.rs`'s private `profiles_dir` helper (which
is not `pub`) — this is expected and matches the plan's own text ("check
the file exists first"), not a finding; do not make `profiles_dir` `pub`
in `core` for this one call site (that would be a `pub`-surface change for
a single caller's convenience — CLAUDE.md's "thin" principle argues the
other way here).

## Tests (`_via` functions, temp data-dir)

- `list_profiles_via` — round-trip: save two profiles with different
  `profile_name`s, assert `list_profiles_via` returns both sorted by name
  ascending, `skipped` empty.
- `list_profiles_via` — a malformed `*.idl0p` file alongside a good one
  lands in `skipped` (path + reason), the good profile still loads, the
  call does not fail.
- `save_profile_via` — a `config` that is not a JSON object (e.g.
  `serde_json::json!([1,2,3])` or a bare string) → `invalid_argument`,
  nothing written to disk.
- `save_profile_via` — a valid object `config` succeeds and returns the
  profile as written; re-reading via `load_all` confirms it landed.
- `delete_profile_via` — deleting an existing profile removes its file and
  it no longer appears in `load_all`.
- `delete_profile_via` — deleting an unknown id → `not_found` (and does
  not touch any other file on disk — assert nothing else in `profiles/`
  changed, if convenient).

Match `commands/catalog.rs`'s test module conventions: a `temp_root()`
helper, A/A/A with blank lines, names `thing — condition — result`.

## The task, in order

- [ ] **Step 1: Confirm the gate** and that Task 2's commit is present on
      the worktree branch.
- [ ] **Step 2: Write the failing tests** for all three `_via` functions.
- [ ] **Step 3: Extend `tauri/src/commands/app.rs`** — DTOs, `From` impls
      (both directions for `BikeProfileDto`), `_via` functions,
      `#[tauri::command]` wrappers, doc comments, units on the two `i64`
      millisecond fields.
- [ ] **Step 4: Register** — `commands::app::list_profiles,
      commands::app::save_profile, commands::app::delete_profile,` added to
      `lib.rs`'s `handler()` list (alongside Task 2's four, same file).
- [ ] **Step 5: Test** — `cargo test -p idl-rs-tauri commands::app::`,
      confirm non-zero `passed` (Task 2's tests plus this task's, all
      green).
- [ ] **Step 6: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 7: Commit** — explicit paths (not `git add -A`):
      `git add tauri/src/commands/app.rs tauri/src/lib.rs`
      — message
      `tauri: App group -- list_profiles/save_profile/delete_profile (C3 3.10, F2/F3)`.
      Single line, no AI attribution trailer.

## Do not

- Do not rewrite or reorder Task 2's `get_settings`/`set_settings`/
  `get_data_dir`/`set_data_dir` code — extend the file, don't touch their
  bodies.
- Do not skip the existence check in `delete_profile_via` and rely on
  core's idempotent `delete` alone — that would silently succeed on a
  stale id, which F2 explicitly rejects.
- Do not make `profiles_dir` `pub` in `core` — duplicate the one-line path
  join instead (see Key logic above).
- Do not touch `rust/core/src` — everything this task needs is already
  landed in `store::profile`.
- Do not edit `app/src/routes/pages/Device/ipcStubs.ts`.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.

## Style / hygiene

Doc comment on every public symbol; units on every numeric value
(`created_at_ms`/`updated_at_ms` are milliseconds — say so); typed errors
only; A/A/A tests named `thing — condition — result`; match this crate's
established `_via`-function idiom and Task 2's file style exactly. No
`cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.10 already fixes this entry's shape; F2/F3
(ruling R59) are already resolved, this task implements them as ruled.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::app::` result line with its `passed` count (Task 2 + Task 3
combined); `cargo check -p idl-rs-tauri` result; confirmation
`delete_profile_via`'s pre-check actually raises `not_found` (not core's
idempotent no-op); confirmation `Device/ipcStubs.ts` was not touched;
anything else ambiguous you resolved (say how) or that needs a lead ruling
(stop and report instead of guessing — CLAUDE.md §1).

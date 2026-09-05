# L8w Task 2 review — App group commands (`get_settings`/`set_settings`/`get_data_dir`/`set_data_dir`, C3 §3.10)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`. Commit under review: `7a43eaa3673b0222a0b43aad30ebb2772b486e1a`
("tauri: App group -- get_settings/set_settings, get_data_dir/set_data_dir (C3 3.10, R59 Q5)").
Files touched: `tauri/src/commands/app.rs` (new, 424 lines), `tauri/src/commands/mod.rs`
(+1 line, `pub mod app;`), `tauri/src/lib.rs` (+4 lines, registration). `Cargo.lock` unchanged.
Out of scope, noted but not reviewed: a later follow-up commit `cf46dde` ("add BOM-prefixed
invalid JSON fallback test to resolve_data_dir") on the same branch — this is `paths.rs`-only
and post-dates the reviewed commit; not part of Task 2's diff.

## Test command and result

Not run (reviewer is read-only per CLAUDE.md §8 / review-STANDING.md — reviewers do not build
or test). Verified the implementer's reported command and count statically instead.

Implementer reported: `cargo test -p idl-rs-tauri commands::app::` → 9 passed; `cargo check -p
idl-rs-tauri` clean.

Static count of `#[test]` functions in `tauri/src/commands/app.rs`'s `tests` module: 9
(`get_settings_via_missing_file_returns_defaults`,
`get_settings_via_present_file_round_trips_every_field`,
`set_settings_via_ignores_data_dir_in_the_argument`,
`set_settings_via_writes_rider_name_and_unit_system_and_reflects_the_reread_value`,
`get_data_dir_via_no_override_matches_a_fresh_resolve_and_restart_is_not_required`,
`get_data_dir_via_override_changed_on_disk_reports_restart_required`,
`set_data_dir_via_relative_path_is_rejected_and_nothing_is_written`,
`set_data_dir_via_absolute_path_succeeds_and_creates_the_data_subdir`,
`set_data_dir_via_none_clears_an_existing_override`). Count matches the reported 9. Every test
calls a `_via`-suffixed plain function only (never a bare `#[tauri::command]` wrapper), uses
temp dirs via a `temp_root()` helper matching `commands/catalog.rs`'s pattern, and is
Arrange/Act/Assert with blank lines and named `thing — condition — result`. Each test's
assertions are traceable to the behaviour its name claims (traced against `idl_rs::store::
settings::{load, save, AppSettings, UnitSystem}` and `crate::paths::resolve_data_dir`, both
landed on `main`) — none would pass if its named rule broke. This reproduces what was reported;
no full-suite or extra cargo invocation was run.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `tauri/src/commands/app.rs:19` (module doc) / no test present | The module doc comment and `AppSettingsDto`'s field doc assert `unit_system` "already serialises to exactly `\"imperial\"`/`\"metric\"`", which is the entire justification for the plan-deviation (typing `unit_system` as `UnitSystem` rather than `String`) — but no test in this diff, nor in the already-landed `core/src/store/settings.rs`, asserts the actual JSON string via `serde_json::to_string`/`to_value`. The reviewer dispatch explicitly named this check ("`unit_system` serialises exactly `imperial`/`metric` (test proves it)"). By inspection the claim is correct (`UnitSystem` derives `Serialize` with `#[serde(rename_all = "snake_case")]`, and `Imperial`/`Metric` snake-case to `imperial`/`metric`), so this is not a wire-format bug, but the wire-critical assumption the whole deviation rests on is unverified by any test. | Add one test asserting `serde_json::to_string(&AppSettingsDto{..unit_system: UnitSystem::Metric})` (or a direct `UnitSystem` serialization test) contains `"unit_system":"metric"` byte-for-byte — the same style as `error.rs`'s existing `ipc_error_kind_serialises_snake_case_matching_c3` test. |
| Important | `tauri/src/commands/app.rs:415-424` (`set_data_dir_via_absolute_path_succeeds_and_creates_the_data_subdir`) | The dispatch asked to verify `set_data_dir` "creates the C4 §2 tree via the same code `resolve_data_dir` uses (no duplicated tree list)". By reading the code, this is true: `set_data_dir_via` only pre-creates `<path>/data` (a creatability check run *before* the settings write, correctly satisfying the "nothing written on a failed create" ordering rule), and the full C4 §2 tree (`blobs/sha256/`, `sessions/`, `workbooks/`, `tracks/`, `tmp/quarantine/`) is actually created afterward as a side effect of the subsequent `crate::paths::resolve_data_dir(app_data_dir, app_config_dir)` call, which re-reads the just-written `settings.json` and creates the tree at the new override root. This is correct and does avoid a duplicated subdirectory list. But the test only asserts `new_root.join("data").is_dir()` — it does not assert any of the C4 §2 subdirectories (e.g. `new_root.join("data/blobs/sha256").is_dir()`) exist. A future edit that removed or reordered the `resolve_data_dir` call (e.g. someone "optimizing" by inlining just `fresh` without the tree-creation side effect) would not be caught by this test even though it would break the documented C4 §2 guarantee. | Extend the test (or add a new one) to assert at least one C4 §2 subdirectory exists under the new root, e.g. `assert!(new_root.join("data/blobs/sha256").is_dir())`, so the tree-creation guarantee is actually test-enforced, not just true by inspection. |

No Critical findings.

## Checks performed (all pass)

- C3 §3.10 field-for-field: `AppSettingsDto`/`AppSettingsArg` = `{data_dir: Option<String>,
  rider_name: String, unit_system: UnitSystem}` matches C3's `AppSettings` TS interface
  (`data_dir: string | null; rider_name: string; unit_system: "imperial" | "metric"`) exactly,
  and matches `app/src/routes/pages/Settings/ipcStubs.ts`'s `AppSettings` interface field for
  field (read-only, confirmed untouched by this commit). `DataDirInfo` = `{resolved_path:
  String, override_path: Option<String>, restart_required: bool}` matches both C3's
  `DataDirInfo` and the TS stub's `DataDirInfo` field for field.
- Plan deviation (typing `unit_system` as `idl_rs::store::settings::UnitSystem` rather than a
  hand-rolled `String` mapping) is documented in the module doc comment, in `AppSettingsDto`'s
  and `AppSettingsArg`'s field docs, and matches exactly what the implementer brief specified
  and required to be flagged — not a silent deviation.
- **R59 Q5**: `set_settings_via_ignores_data_dir_in_the_argument` genuinely proves an existing
  on-disk override survives a `set_settings` call carrying a *different* `data_dir` value in
  its argument (`"D:\\existing-override"` on disk vs. `"D:\\attempted-override"` in the
  argument; assertion is against the returned DTO's `data_dir`, which is re-read from disk
  after the write, not echoed from the argument) — this is a real, dedicated proof, not a
  coincidental pass.
- `set_settings_via` never assigns `arg.data_dir` anywhere in its body — confirmed by reading
  the full function; only `rider_name`/`unit_system` are copied onto `current` before `save`.
- `set_data_dir_via` validates the path is absolute before touching disk, creates the target
  tree before writing `settings.json` (ordering rule respected — the relative-path test also
  asserts `!path.exists()`, i.e. nothing was written), writes only the `data_dir` key via
  read-modify-write (`rider_name`/`unit_system` come from `idl_rs::store::settings::load`,
  never touched), and does not move existing files (no file-move code present).
- `restart_required` is computed as `fresh != resolved_data_dir` where `resolved_data_dir` is
  always the caller-supplied managed value (the running `state::DataDir`), never `fresh` itself
  — confirmed in both `get_data_dir_via` and `set_data_dir_via`; the response never claims an
  override took effect before a restart.
- `get_data_dir` reports both `resolved_path` (the running managed value) and `override_path`
  (`settings.data_dir` as currently on disk), matching C3's wording exactly.
- Settings file writes go through the already-landed `idl_rs::store::settings::save`, which
  uses `write_atomic_with_retry` (C4 §4's primitive) — no direct `std::fs::write` of
  `settings.json` anywhere in `app.rs`. No BOM-prefixing concern: this module only ever reads
  via `idl_rs::store::settings::load` (which itself doesn't strip a BOM, but that's an existing,
  out-of-scope property of `store::settings`, not something this task introduces or regresses;
  `resolve_data_dir`'s independent BOM-stripping in `paths.rs` was Task 1's fix, unmodified
  here).
- Error kinds used are exactly `IpcErrorKind::{InvalidArgument, Io, Internal}`, matching C3
  §3.10's stated error rows (`invalid_argument`/`io`/`internal` for `set_data_dir`; `io`/
  `internal` for the settings commands) with no unlisted kind introduced.
- `map_settings_error` folds `SettingsErrorKind::Encode` → `Internal` per C3 §2's folding rule;
  `Io` → `Io`; comment correctly notes `load` never fails so this function only ever sees
  `save`'s errors.
- `AppHandle<R: tauri::Runtime>` generic pattern: no other command module in this crate
  currently takes `AppHandle`, so there's no existing precedent to literally copy, but the
  choice is internally consistent with `lib.rs`'s own `pub fn handler<R: tauri::Runtime>()`
  being generic over `R` — a non-generic `tauri::AppHandle` (fixed to the default runtime)
  would not satisfy `tauri::generate_handler!`'s requirements for an arbitrary `R`. The four
  commands are registered in `handler()`'s `generate_handler!` list, appended after
  `commands::import::import_file` matching every other group's registration style.
  `cargo check -p idl-rs-tauri` reported clean per the implementer; `core` was not touched, so
  no `cargo check -p idl-rs-cli --tests` was required for this task (correctly not run).
- Doc comments present on every public symbol (`AppSettingsDto`, `AppSettingsArg`,
  `DataDirInfo`, every field, every function including private helpers); units on numeric
  values — none exist beyond booleans/strings, consistent with the brief's own note that none
  were expected here. No `Err(String)` anywhere; no unexplained `.unwrap()`/`.expect()` in any
  non-test code path (test-only `.unwrap()`s on temp-dir setup are the established pattern
  elsewhere in this crate, e.g. `catalog.rs`). No bare `// TODO`.
- No reformatting: diff is additive/surgical, limited to the three named files; `mod.rs`'s and
  `lib.rs`'s diffs are one line and four lines respectively, both pure additions at the
  appropriate list position — no reordering of existing entries.
- Repo hygiene: single-line commit message, no AI attribution trailer; `git show --stat`
  confirms exactly the three files the brief named, no `Cargo.lock` change; nothing under
  `docs/` touched; nothing under `app/src/` touched (confirmed `ipcStubs.ts` untouched by this
  commit); the shared checkout `idl1-app\rust` was not the worktree used (a separate worktree
  was used, per the lane's standing convention) and was not touched by this review.
- Cross-task consistency: the `_via`-suffixed function idiom, `From<core::X>` mapping impls,
  and `temp_root()`-per-test helper all match `commands/catalog.rs`'s established shape rather
  than inventing a new one.

## Verdict rationale

The implementation is correct against C3 §3.10 and ruling R59 Q5: wire shapes match the
contract and the TS stub field for field, `set_settings` never writes `data_dir`, the R59 Q5
override-survival behaviour has a genuine dedicated test, `restart_required` is computed
against the running managed value exactly as specified, ordering (create-before-write) is
respected and tested, and the crate's established `_via`/`From`/temp-dir conventions are
followed throughout with proper docs and typed errors. The two Important findings are both
test-coverage gaps rather than logic bugs: by static inspection, `unit_system` genuinely does
serialise to `"imperial"`/`"metric"` and the C4 §2 tree genuinely does get created at the new
override root, but neither claim — both explicitly named in the reviewer dispatch — is proven
by an assertion in this diff. Both are small, mechanical additions (one `serde_json::to_string`
assertion; one extra subdirectory-existence assertion in an already-passing test), not a
rework of any logic.

VERDICT: NEEDS_FIXES

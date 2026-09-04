# L5 Tauri Scaffold — Task 2 review (`<data>` resolution + `settings.json` bootstrap, C4 §1)

Two repos, two commits, as the plan requires:

- `idl-rs-worktrees\wave1-l5-tauri` commit `23167fc` ("tauri: resolve <data> from app_data_dir +
  settings.json override (C4 §1)")
- `idl1-app-worktrees\wave1-l5-tauri` commit `8757929` ("app: wire <data> resolution into Tauri
  setup, managed as DataDir state") — includes the `rust` submodule-pointer bump from the stale
  resync.

## Test commands and results

```
cd C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri
cargo test -p idl-rs-tauri
```
```
running 8 tests
test commands::tests::encode_f32_le_four_values_roundtrips_bytes ... ok
test commands::tests::engine_version_matches_core_crate_version ... ok
test error::tests::ipc_error_kind_serialises_snake_case_matching_c3 ... ok
test error::tests::transport_error_converts_kind_preserving_message ... ok
test error::tests::ipc_error_with_detail_serialises_the_detail_object ... ok
test paths::tests::no_settings_file_present_resolves_to_app_data_dir_slash_data ... ok
test paths::tests::corrupt_settings_json_falls_back_to_platform_default ... ok
test paths::tests::settings_json_data_dir_override_is_honoured ... ok

test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```
8/8 — 3 new `paths::tests::*` plus the 5 prior (2 `commands::tests::*` from M0, 3 `error::tests::*`
from Task 1). Reproduced independently, matches the review brief's expectation exactly.

```
cd C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l5-tauri/app/src-tauri
cargo build
```
```
Finished `dev` profile [unoptimized + debuginfo] target(s) in 32.86s
```
Succeeds. Also re-ran `cargo build --locked` in the same directory: succeeds with **zero**
modification to the committed `Cargo.lock` (no "note: to update Cargo.lock..." occurs, no diff
after) — confirms the committed lockfile is genuinely consistent, not merely "built once and got
lucky."

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `rust/tauri/src/paths.rs:38` (plan-inherited) | `resolve_data_dir`'s created tree is `blobs/sha256`, `sessions`, `workbooks`, `tracks`, `tmp/quarantine` — C4 §2's layout also lists `profiles/` (added post-sign, ruling R6, wave-1 L1) as a top-level `<data>` directory. It's missing from both the doc comment and the `for sub in [...]` list. This is inherited verbatim from the plan's own Step 1 code listing (not an implementer deviation — the diff matches the plan character-for-character) so it isn't this commit's bug to fix, but it is a real gap against C4 §2 today. | Either the plan should have included `"profiles"` in the list (lead/L5 follow-up), or L1's profile-store code creates it lazily on first write — flag for whoever lands L1's profile persistence to confirm one or the other happens before shipping. |
| Minor | shared checkout `idl1-app/app/src-tauri/Cargo.toml` | `git status` in the shared `idl1-app` checkout shows this file modified, but `git diff` is empty — a CRLF/LF autocrlf artifact, not real content, not caused by this task (the task's own commits are worktree-isolated per the plan's Global Constraints). Same pre-existing noise the Task 1 reviewer already flagged. | No action needed for this task; housekeeping (`git checkout -- app/src-tauri/Cargo.toml`) for whoever owns the shared checkout. |

No other findings. Specifically checked and clean:

- **Spec compliance (C4 §1):** `<data> = app_data_dir()/data` — `resolve_data_dir` does
  `data_root.join("data")` where `data_root` is either `app_data_dir` or the `settings.json`
  override root, i.e. `<data>` is always one level below the resolved root. The subdirectory
  distinction C4 §1 calls load-bearing is honoured, not collapsed into `app_data_dir()` itself —
  verified both by reading the code and by the `settings_json_data_dir_override_is_honoured` test
  asserting `data == override_root.join("data")` (not `override_root` itself).
- **`settings.json` read via plain `std::fs`:** `std::fs::read_to_string`, no new I/O crate;
  `serde_json` (already a normal dependency since Task 1) does the parsing, exactly per the
  Interfaces note ("no new crate"). Missing file, unreadable file, and malformed JSON (`unwrap_or_default`
  on parse failure) all fall back to the platform default per C4 §1's "absent or missing key → use
  the platform default" rule — covered by the `corrupt_settings_json_falls_back_to_platform_default`
  test, which is a real behavioural check, not just a read-through.
- **Idempotent tree creation:** `std::fs::create_dir_all` for each subdirectory — safe to call on
  every launch, matches the doc comment's claim; not separately tested for a second call, but
  `create_dir_all` on an existing dir is a documented no-op in `std`, an acceptable case to not
  duplicate-test.
- **Interfaces match the plan exactly:** `resolve_data_dir(app_data_dir: &Path, app_config_dir: &Path)
  -> Result<PathBuf, IpcError>` (pure `std::fs`, no `AppHandle`) and `state::DataDir(pub PathBuf)`,
  both present verbatim.
- **`.setup()` hook (`app/src-tauri/src/lib.rs`):** resolves `app_data_dir`/`app_config_dir` via
  Tauri's path resolver, calls `paths::resolve_data_dir`, `app.manage(...)`s the result as `DataDir` —
  matches the plan's snippet field-for-field, including the deliberate `panic!` on setup-time
  failure, which the plan's own Global Constraints note explicitly carves out as acceptable (not a
  violation of the command-boundary `IpcError` contract, since `.setup()` runs before any window/command exists).
- **No new `app/src-tauri/Cargo.toml` dependency** — confirmed no diff to that file; `Manager`/`path`
  API used is already in the `tauri` pin, as the plan's Interfaces note states.
- **`tempfile` dev-dependency:** added as `tempfile = "3.27.0"` (the concrete `cargo add --dev`-resolved
  version, self-documenting directly in `Cargo.toml` — matches project convention of pinning exact
  versions rather than loose ranges, e.g. `serde_json = "1.0.151"`, `notify = "8.2.0"`). Satisfies the
  plan's "record the resolved version" instruction by making it visible in the diff itself.
- **Tests:** Arrange/Act/Assert with blank lines, names read as `thing — condition — result`
  (`no_settings_file_present_resolves_to_app_data_dir_slash_data`, etc.) — CLAUDE.md §4 compliant.
  All three test logic this repo owns (path resolution, override precedence, corrupt-input fallback),
  not `serde_json`/`tempfile` internals.
- **Doc comments / units:** every public symbol (`resolve_data_dir`, `DataDir`, the module docs) has
  a doc comment; no bare numeric values needing units in this task's code.
- **No `cargo fmt` reformatting:** diff is exactly the plan's listed code plus the minimal `lib.rs`
  module-registration lines; no unrelated whitespace churn.
- **No AI attribution trailer** on either commit; verified via `git log -1 --format=%B` on both.
- **`TASKS.md` untouched** by this commit (correctly deferred to Task 15).
- **`CHANGELOG.md`:** the app-repo commit carries both Task 1's and Task 2's bullets (Task 1 never
  had its own app-repo commit per the plan, so its pending bullet correctly rides along with this
  task's app-repo commit) — both bullet texts match the plan verbatim, including the plan's own
  trailing stray `**` typo in the Task 2 bullet, transcribed faithfully.
- **Lane boundaries:** rust-repo commit touches only `rust/tauri/*` + `Cargo.lock`; app-repo commit
  touches only `app/src-tauri/{src/lib.rs,Cargo.lock}`, `CHANGELOG.md`, and the `rust` submodule
  pointer — no edits to `rust/core` or `rust/transport` source.

## Process-hiccup verification

1. **Stale nested `rust` submodule, `fetch` + `checkout -B` resync.** Confirmed genuinely fixed, not
   worked around: in the app worktree, `git -C rust branch -vv` shows `wave1-l5-tauri` tracking
   `local-wave1/wave1-l5-tauri`, and `git -C rust rev-parse HEAD` (`23167fc9c4fc30c657c39ceb83b61a2ae85320df`)
   is byte-identical to the standalone rust worktree's `HEAD`. The committed submodule pointer in
   `idl1-app-worktrees/.../rust` (`git ls-tree HEAD rust`) is also `23167fc9c4...`, matching exactly —
   the branch ref genuinely moved, not just the working tree.
2. **Second `cargo build` to regenerate `Cargo.lock`.** Confirmed the committed lockfile is
   consistent, not "built once and got lucky": `cargo build --locked` in `app/src-tauri` succeeds
   with no lockfile modification. The large `Cargo.lock` diff (btleplug/dbus/tokio/windows-\* additions)
   traces to L4's already-merged transport work (`4b726b1`, present on `main` before this task's
   submodule resync picked it up) rather than anything introduced by this task itself — cross-checked
   against `idl1-app-worktrees/.../rust`'s prior commit history.

## Shared checkouts

- `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`: on `main`, `git status --porcelain` clean,
  `HEAD` = `5535e9c` ("merge: L4 idl-transport desktop"), untouched by this task.
- `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`: on `main`, `HEAD` = `8204240` ("docs: rule on
  L1 Task 6 fixture blocker..."), untouched by this task's commits. `git status` shows the
  pre-existing CRLF-only `Cargo.toml` artifact (see Findings) and untracked review `.md` files from
  unrelated sibling lane reviews — neither originates from this task's implementer.

## Verdict

CLEAN. Both commits implement C4 §1 exactly as specified (subdirectory distinction honoured,
`std::fs`-only settings read, idempotent tree creation), tests reproduce 8/8, `cargo build` and
`cargo build --locked` both succeed, no AI trailers, no `cargo fmt` churn, shared checkouts
untouched, and both reported process hiccups (submodule resync, lockfile regeneration) are verified
genuinely resolved rather than merely worked around. The two Minor findings above are pre-existing
plan/environment artifacts, not implementer defects in this commit pair.

# L5 Tauri Scaffold — Task 1 review (`IpcError`/`IpcErrorKind`, C3 §2)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`, branch
`wave1-l5-tauri`, commit `9252553` ("tauri: IpcError/IpcErrorKind (C3 §2), transport conversion").

## Test command and result

```
cd C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l5-tauri
cargo test -p idl-rs-tauri
```

```
running 5 tests
test commands::tests::encode_f32_le_four_values_roundtrips_bytes ... ok
test error::tests::transport_error_converts_kind_preserving_message ... ok
test commands::tests::engine_version_matches_core_crate_version ... ok
test error::tests::ipc_error_kind_serialises_snake_case_matching_c3 ... ok
test error::tests::ipc_error_with_detail_serialises_the_detail_object ... ok

test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

5/5 — the 3 new `error` tests plus the 2 existing M0 tests (`commands::tests::*`), as the plan
predicted. Reproduced independently.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `idl1-app-worktrees/wave1-l5-tauri/rust` (nested submodule checkout, no source line) | After Task 1's rust-side commit (`9252553`), the app worktree's nested `rust/` submodule checkout was never re-fetched/re-checked-out from `local-wave1` — it still sat at the pre-Task-1 commit (`5535e9c`) at review time, so `git -C .../rust log -1` did **not** match the standalone rust worktree's tip until I ran the fetch myself. Not a Task 1 defect (Task 1 touches only `rust/tauri`, no app-repo build depends on it yet), but it will bite Task 2 (which does `cargo build` against the app-repo checkout and expects the new `IpcError` types to be visible) if not synced first. | Before starting Task 2 (or any task that builds against the app-worktree's nested `rust/`), run `git -C rust fetch local-wave1 wave1-l5-tauri && git -C rust checkout wave1-l5-tauri` (or equivalent) in the app worktree to pick up new rust-worktree commits. |
| Minor | `idl1-app/app/src-tauri/Cargo.toml` (shared checkout) | Shared app checkout shows `Cargo.toml` as modified in `git status`, but `git diff` is empty — a CRLF/LF autocrlf artifact, not real content, and not caused by this task (Task 1 never touches this file; the worktree is isolated). Pre-existing environment noise, also two untracked `runs/.../review-*.md` files from unrelated lane reviews sitting in the shared checkout. | No action needed for Task 1; worth a `git checkout -- app/src-tauri/Cargo.toml` housekeeping pass by whoever owns the shared checkout, unrelated to this lane. |

No other findings. Specifically checked and clean:

- **Spec compliance (C3 §2):** `IpcError { kind, message, detail }` and `IpcErrorKind`
  (`#[serde(rename_all = "snake_case")]`) match C3 §2's shape exactly. The seeded variants are
  exactly the four cross-cutting kinds (`NotFound`, `InvalidArgument`, `Io`, `Internal`) and the
  four `TransportErrorKind`-sourced ones (`Ble`, `Wifi`, `Config`, `Sync`) — nothing extra, nothing
  missing, matching the plan's stated scope ("this task seeds only the variants nothing else gates
  on").
- **Unprefixed transport kinds preserved:** `From<idl_transport::TransportError>` maps
  `Ble→Ble, Wifi→Wifi, Config→Config, Sync→Sync` 1:1 — no re-prefixing, matching C3 §2's explicit
  rule that these four stay unprefixed (already-shipped `TransportError` JSON spelling,
  `{"kind":"wifi",...}`, is preserved verbatim). Verified `transport/src/error.rs`'s
  `TransportErrorKind` variants (`Ble`/`Wifi`/`Config`/`Sync`) line up 1:1 with the match arms, no
  drift.
- **Serialization:** `#[serde(skip_serializing_if = "Option::is_none")]` on `detail` — matches C3
  §2's "absent when there is nothing structured to add." Test assertions (`{"kind":"not_found",...}`
  with no `detail` key; `{"kind":"invalid_argument",...,"detail":{...}}` when present) confirm this
  behaviourally, not just by inspection.
- **`serde_json` pin:** `1.0.151` in `Cargo.toml`, matches the M0 ecosystem report's pin exactly.
- **Tests:** Arrange/Act/Assert with blank lines, names read as `thing — condition — result`
  (`ipc_error_kind_serialises_snake_case_matching_c3`, etc.) — compliant with CLAUDE.md §4. All
  three test what the repo owns (its own serialization shape and its own `From` conversion), not
  serde/sha2 internals.
- **No `cargo fmt` reformatting:** diff is exactly the plan's listed code; surrounding
  `tauri/src/lib.rs` and `tauri/Cargo.toml` edits are minimal, additive, hand-styled consistent
  with the existing file (no wholesale re-wrap).
- **No AI attribution trailer** in the commit message.
- **Doc comments / units:** every public symbol (`IpcErrorKind`, its variants, `IpcError`, its
  fields, `IpcError::new`, `IpcError::with_detail`, the `From` impl) has a doc comment. No bare
  numeric values needing units in this file (all fields are strings/enums/`Option<Value>`).
- **`TASKS.md`** untouched by this commit (correctly deferred to Task 15, per plan).
- **`CHANGELOG.md`** entry present in the app worktree matching the plan's specified bullet
  verbatim, correctly left **uncommitted** in the app repo — Task 1's own commit step (Step 5) only
  commits the rust submodule, matching the plan exactly (Task 1 has no other app-repo work to
  batch it with; it will ride along with a later task's app-repo commit).
- **Lane boundaries:** commit touches only `rust/tauri/*` and `Cargo.lock`; no edits to `rust/core`
  or `rust/transport` source.
- **Shared checkouts (`idl1-app/rust`, `idl1-app`):** both on `main`, no local branch switch;
  `idl1-app/rust` fully clean; `idl1-app` has only the harmless artifacts noted above, none of
  which originate from this task's implementer (worktree-isolated per the plan's Global
  Constraints).
- **Worktree setup:** both `idl-rs-worktrees\wave1-l5-tauri` and
  `idl1-app-worktrees\wave1-l5-tauri` exist, both on branch `wave1-l5-tauri`. The scary
  `remote error: upload-pack: not our ref` during `git submodule update --init -- rust` is
  confirmed harmless — the subsequent `remote add local-wave1` / `fetch` / `checkout -B
  wave1-l5-tauri FETCH_HEAD` steps did complete correctly (nested submodule checkout has the
  `local-wave1` remote, is on `wave1-l5-tauri`, and — after a fresh fetch — has `9252553`
  available); the only issue is the nested checkout wasn't re-synced to that fetched commit after
  Task 1 landed it (see the Minor finding above).

# L8x Task 7 — quarantine + verify commands

Three thin commands over Task 6's core module, in a new
`commands/maintenance.rs`. TDD, ONE commit.

**Depends on Task 6.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
grep -c "pub fn quarantine_file" core/src/store/quarantine.rs
grep -c "pub fn verify_and_repair" core/src/store/verify.rs
```
All must succeed / return `>= 1`. If any fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §2, §5, Q1/Q2/Q8; C3 §3.2's
`list_quarantine`/`resolve_quarantine` and §3.10's `verify_data_dir` as Task
1 wrote them; `tauri/src/commands/mod.rs` (how a module is declared) and
`tauri/src/lib.rs`'s `handler()`; `tauri/src/commands/app.rs` — the §3.10
group's existing idiom, including how it resolves the data directory;
`tauri/src/error.rs` (**no new `IpcErrorKind`** — confirm and say so);
`tauri/src/commands/catalog.rs`'s `rebuild_catalog` for the `elapsed_ms`
timing pattern.

## Where

- **Files:** `tauri/src/commands/maintenance.rs` (new),
  `tauri/src/commands/mod.rs`, `tauri/src/lib.rs`, `CHANGELOG.md`.

## Interfaces

```rust
/// C3 §3.2 `QuarantineEntry` — mirrors `idl_rs::store::quarantine`'s
/// field for field.
#[derive(Debug, Clone, serde::Serialize)]
pub struct QuarantineEntry { /* entry_id, path, original_path, reason, quarantined_at_ms */ }

/// C3 §3.10 `VerifyReport`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct VerifyReport {
    pub findings: Vec<VerifyFinding>,   // severity: "info" | "warning" | "error"
    /// Empty unless `repair` was true.
    pub quarantined: Vec<QuarantineEntry>,
    pub elapsed_ms: u32,
}

#[tauri::command] pub fn list_quarantine(data_dir: State<'_, DataDir>)
    -> Result<Vec<QuarantineEntry>, IpcError>;
#[tauri::command] pub fn resolve_quarantine(entry_id: String, action: String,
    data_dir: State<'_, DataDir>) -> Result<(), IpcError>;
#[tauri::command] pub fn verify_data_dir(repair: bool, data_dir: State<'_, DataDir>)
    -> Result<VerifyReport, IpcError>;
```
`*_via` seams as elsewhere in the crate; `verify_data_dir_via` takes the
injected id generator and `now_ms` Task 6's `verify_and_repair` requires.

## Key logic

- `action` maps `"restore"` / `"discard"` to `ResolveAction`; **anything
  else is `invalid_argument`** with the received value in `detail`. Do not
  accept `"retry"` — PLAN Q2 renamed it, and silently aliasing it would hide
  a stale caller.
- Map `QuarantineErrorKind` through `IpcError::from`: `NotFound` →
  `not_found`, `Occupied` → `invalid_argument` (the caller can free the path
  and retry — it is not an I/O failure), `Io` → `io`, `Encode` → `internal`.
  Add the `From` impl in `tauri/src/error.rs` beside the existing ones.
- `Severity` → the C3 strings `"info" | "warning" | "error"`, mapped
  explicitly, never via `Debug` formatting.
- `verify_data_dir(repair: false)` must perform **no** writes — assert it.
- Time the whole call for `elapsed_ms`, as `rebuild_catalog` does.
- Declare the module in `commands/mod.rs` and register all three in
  `handler()`.

## Tests

- `list_quarantine_via — an empty directory — an empty list`.
- `list_quarantine_via — two entries — both, newest first`.
- `resolve_quarantine_via — "restore" — the file is back`.
- `resolve_quarantine_via — "discard" — both files are gone`.
- `resolve_quarantine_via — "retry" — invalid_argument` (locks Q2 in).
- `resolve_quarantine_via — an unknown entry_id — not_found`.
- `resolve_quarantine_via — restore onto an occupied path —
  invalid_argument`.
- `verify_data_dir_via — repair false on a corrupt blob — the finding is
  reported, quarantined is empty, and the blob is untouched on disk`.
- `verify_data_dir_via — repair true on the same tree — the blob is
  quarantined and appears in both `quarantined` and `list_quarantine`.
- `verify_data_dir_via — a healthy tree — no error-severity findings`.
- `verify_data_dir_via — serialised VerifyReport — severity strings match
  C3` (assert on `serde_json::to_value`).

## COMPUTE RULES

While working: `cargo test -p idl-rs-tauri commands::maintenance::`,
foreground, non-zero `passed`. `cargo check -p idl-rs-tauri`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `maintenance.rs` + the three commands.
      4. `QuarantineError` → `IpcError` in `error.rs`. 5. `mod.rs` +
      `handler()` registration. 6. Filter green. 7. `cargo check
      -p idl-rs-tauri` clean. 8. NUL check. 9. `CHANGELOG.md` bullet.
      10. Commit `tauri: quarantine and verify commands (C3 3.2, 3.10)`.

## Do not

- Do not add an `IpcErrorKind`.
- Do not alias `"retry"` to `"restore"`.
- Do not let `verify_data_dir(repair: false)` write anything.
- Do not edit `app/src/`.

## Spec discipline

**No spec change needed** — Task 1 wrote all three entries. Report any
divergence for the lead to amend.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the test result line with its `passed`
count; the `cargo check` result; confirmation no `IpcErrorKind` was added
and the exact `QuarantineErrorKind` → kind mapping shipped; the serialised
`VerifyReport` of one run (compact); the exact
`app/src/ipc/maintenance.ts` declarations the lead must add; anything
needing a ruling.

# L2b Task 8 — implementer brief (`rescan_tracks` command) — **LANE MERGE GATE**

The last task: a Tauri command over `reindex_laps` so a rider who adds a track
after importing can get laps for older sessions, then the lane gate.
TDD, ONE commit, then the gate, then report.

**Depends on Task 7.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "pub fn reindex_laps" core/src/store/lap_index.rs
grep -c "overlay" core/src/math/eval.rs
```
All must succeed / return `>= 1`. If any fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §4 (what this unblocks) and Q8;
`tauri/src/commands/catalog.rs` in full — the command idiom, how `data_root` is
resolved, how core errors map through `IpcError::from`, and how
`rebuild_catalog` reports its four fields and timing at the command boundary
(`rescan_tracks` mirrors that pattern); `tauri/src/error.rs` (you should need
**no** new `IpcErrorKind` — confirm and say so); `tauri/src/lib.rs`'s
`handler()`; C3 §3.2's command list and the `rebuild_catalog` entry;
Tasks 2 and 4 commits (`reindex_laps`, `index_session`); operating brief §2's
"lead-owned shared files" list — `app/src/` is not yours.

## Where

- Same worktree/branch. Do NOT push.
- **Files:** `tauri/src/commands/catalog.rs`, `tauri/src/lib.rs`,
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, `TASKS.md`,
  `CHANGELOG.md`.

## Interfaces

```rust
/// C3 §3.2 `rescan_tracks(session_id)` — IDL0_SPEC §17.4's "Rescan Tracks".
/// Re-runs visit and lap detection for one session against the current track
/// library, rewrites its `session.json`, and re-indexes its catalog rows.
#[tauri::command]
pub async fn rescan_tracks(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<RescanReport, IpcError>;

#[derive(Debug, Clone, serde::Serialize)]
pub struct RescanReport {
    pub session_id: String,
    pub visits_indexed: u32,
    pub laps_indexed: u32,
    /// Lap-flag fields cleared because their lap number no longer exists
    /// (PLAN Q3) — the UI warns the rider that a starred or ignored lap
    /// was dropped.
    pub flags_cleared: Vec<String>,
    pub warnings: Vec<String>,
    pub elapsed_ms: u32,
}
```

## Key logic

- Resolve `data_root` exactly as the other catalog commands do — reuse their
  helper, do not re-derive it.
- Call `reindex_laps(data_root, &session_id)` (which forces recomputation), then
  `index_session` against the catalog **when `catalog.sqlite` exists**, matching
  Task 4's import-side rule. A missing catalog is not an error.
- Map `LapIndexError`'s kinds through the existing `IpcError::from`: `Io` → `io`,
  `Track`/parse failures → whichever landed kind already covers a bad artifact.
  If no existing kind fits, STOP and report rather than adding one — a new kind
  is a C3 §2 amendment and needs a lead ruling.
- An unknown `session_id` (no session directory) → `not_found`, matching
  `get_session`/`list_laps`.
- Time the whole call for `elapsed_ms` the way `rebuild_catalog` already does.
- Register in `lib.rs`'s `handler()`.
- **Report the TypeScript for the lead.** `app/src/ipc/catalog.ts` needs the new
  command and `RescanReport` type, and the Data tab's maintenance panel needs a
  button. Both are lead shell tasks. Write the exact type declaration in your
  report; do not edit `app/src/`.

## Tests

Follow the existing command tests' `_via`-style seam if `commands/catalog.rs`
has one; otherwise test `reindex_laps` + `index_session` composition directly
against a tempdir and keep the `#[tauri::command]` wrapper trivially thin.

- `rescan_tracks` on a session imported before any track existed, after a track
  is added → laps appear in `session.json` and in `list_laps`.
- `rescan_tracks` twice → same result, no duplicate catalog rows.
- `rescan_tracks` on an unknown session id → `not_found`.
- `rescan_tracks` on a root with no `catalog.sqlite` → `Ok`, no catalog created.
- `rescan_tracks` clears a now-invalid `main_lap_number` and names it in
  `flags_cleared`.

## COMPUTE RULES

While working: `cargo test -p idl-rs-tauri commands::catalog::`, foreground,
non-zero `passed`. `cargo check -p idl-rs-tauri`.

**LANE MERGE GATE, after the commit**, foreground, once, tee'd:
```
cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4
cargo test -p idl-rs-tauri
```
Report all result lines verbatim. A failure is STOP-and-report.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. Implement `rescan_tracks` + `RescanReport`.
      4. Register in `handler()`. 5. Targeted filter green.
      6. `cargo check -p idl-rs-tauri` clean. 7. C3 §3.2 amendment.
      8. `TASKS.md` — remove the "no wave-1 import path indexes
      `laps`/`lap_summary`" parity note and the R73 deferral note; `CHANGELOG.md`
      bullet for the lane. 9. Commit
      `tauri: rescan_tracks over reindex_laps (C3 3.2, SPEC 17.4)`.
- [ ] 10. Run the lane merge gate and report every result line.

## Do not

- Do not add an `IpcErrorKind`.
- Do not edit `app/src/` or `app/src-tauri/`.
- Do not create `catalog.sqlite` as a side effect.
- Do not skip the `TASKS.md` / `CHANGELOG.md` cleanup — stale "lap tables are
  empty" claims outliving the lane is exactly the L5 lesson.

## Spec discipline

**spec-during.** Add `rescan_tracks` to C3 §3.2 with its argument, return
shape, and error kinds, and to §2's per-kind command lists where `io` and
`not_found` are enumerated. Note that it is the only C3 command that writes
`session.json` outside the workbook/metadata paths, and why that is a read of
the track library rather than a track edit (PLAN Q8).

## Report back (≤15 lines)

Commit hash + `git show --stat`; the targeted test result line with its `passed`
count; `cargo check -p idl-rs-tauri` result; every lane-gate result line
verbatim; confirmation no new `IpcErrorKind` was added; the exact
`app/src/ipc/catalog.ts` declaration and the Data-tab button the lead must add;
the `TASKS.md`/`CHANGELOG.md` claims you removed; anything needing a ruling.

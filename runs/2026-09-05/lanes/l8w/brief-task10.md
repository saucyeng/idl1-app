# L8w Task 10 — implementer brief (`create_workbook`, C3 §3.4)

You are the implementer for L8w Task 10: mints a UUIDv4 workbook id, writes
a minimal valid v3 document (front matter only, no cells), reusing this
file's **already-landed** filename sanitiser and collision-suffix helpers
verbatim. TDD, ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Do NOT touch `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/workbook.rs`, `tauri/src/lib.rs`.

- Read first: `CLAUDE.md`; plan Task 10
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  C3 §3.4's `create_workbook` entry (quoted below); the landed
  `tauri/src/commands/workbook.rs`'s `save_workbook_via` **in full**
  (lines ~300–360) — this is the pattern to copy, not reinvent: it already
  resolves a brand-new workbook's file name via `sanitize_file_name_stem`
  (private fn, line ~174 of this same file) + `idl_rs::session::filename::
  unique_file_base` (`rust/core/src/session/filename.rs`) for the `-2`/
  `-3`… collision suffix — **both already exist and are already tested**;
  this task's job is to call them, not port a new sanitiser. Also read
  `save_workbook_via`'s test
  `save_workbook_creating_two_new_workbooks_with_the_same_front_matter_name_the_second_gets_a_collision_suffix`
  (confirms the exact collision behaviour this task must match) and
  `sanitize_file_name_stem_a_windows_reserved_device_name_case_insensitively_falls_back_to_workbook`
  (confirms the sanitiser's own edge-case handling — an all-symbols name
  presumably sanitises to something non-empty already; verify this in Step
  1 below rather than assuming); `idl_rs::workbook::v3::front_matter`'s
  writer/format for a minimal document (check whether a "write minimal
  front matter" helper already exists in `rust/core/src/workbook/v3/` before
  hand-building a YAML string); `WorkbookHandle` (this file, ~line 30) — the
  existing return type, reuse it.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs-tauri
commands::workbook::create_workbook`, foreground, non-zero `passed`. No
`cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo process at a
time.

**`pub`-change check:** `cargo check -p idl-rs-tauri`.

## C3 §3.4 (quoted)

> **`create_workbook(name: string)`**
> Return: `WorkbookHandle`. Mints a UUIDv4 id, writes a minimal valid v3
> document (front matter with `id`, `name` and `version: 3`; no cells), and
> returns the existing `WorkbookHandle`. The file name derives from `name`,
> filesystem-sanitised — not from the id. A `file_name` collision on create
> follows the `session_filename.dart` convention (SPEC §15.1) and appends
> `-2`, `-3`, … (C4 §2) — not an error.
> Errors: `invalid_argument` (empty `name`, or a name that sanitises to an
> empty filename), `io`, `internal`.

## Interface

```rust
#[tauri::command]
pub fn create_workbook(name: String, data_dir: tauri::State<'_, DataDir>) -> Result<WorkbookHandle, IpcError>;
```

## Key logic — `create_workbook_via(data_dir: &Path, name: &str) -> Result<WorkbookHandle, IpcError>`

1. `name.trim().is_empty()` → `invalid_argument` before anything else.
2. `let stem = sanitize_file_name_stem(name);` (the existing private fn) —
   if `stem.is_empty()` → `invalid_argument` ("name sanitises to an empty
   filename" or similar, matching C3's own wording).
3. Collision suffix, identical pattern to `save_workbook_via`'s Step 2:
   ```rust
   let workbooks_dir = data_dir.join("workbooks");
   let file_base = idl_rs::session::filename::unique_file_base(&stem, |candidate| {
       workbooks_dir.join(format!("{candidate}.idl1wb")).exists()
   });
   let target = workbooks_dir.join(format!("{file_base}.idl1wb"));
   ```
4. Mint `let id = uuid::Uuid::new_v4().to_string();` (`uuid` is already a
   dependency, used elsewhere in this crate — confirm the exact import path
   this file/crate already uses, e.g. `commands/device.rs`'s
   `uuid::Uuid::new_v4()`).
5. Build the minimal v3 document text: YAML front matter with `id: <uuid>`,
   `name: <original, unsanitised name>`, `version: 3`, no cells, no
   constants, then write it. Check first whether
   `idl_rs::workbook::v3::front_matter` (or `mod.rs`) already exposes a
   constructor for an empty/minimal `WorkbookDoc`/front-matter serialiser —
   if one exists, use it; if not, hand-build the minimal markdown string
   here (a YAML front-matter block between `---` fences, nothing else) and
   say so in your report, since a hand-built string that must stay in sync
   with C2's front-matter grammar by hand is a maintenance note worth
   flagging.
6. Write via `write_atomic(data_dir, &target, bytes, None)` — `None` is
   correct here: the collision-suffix loop in step 3 already guarantees
   `target` cannot exist (barring the same theoretical race
   `write_atomic`'s own docs describe elsewhere in this lane, not worth a
   dedicated test), so `write_atomic`'s "must not already exist" semantics
   for `based_on_hash: None` fit directly — do not use a bare
   `std::fs::write` (`write_atomic`'s fsync-then-rename gives the same
   crash-safety C4 §4 mandates for every other workbook write; a
   non-atomic write here would be an unexplained inconsistency with
   `save_workbook_via`'s own path).
7. Return `WorkbookHandle { id, name: name.to_string(), path:
   target.display().to_string(), cell_count: 0 }`.

## Tests

- Happy path: file exists after the call at the expected sanitised path;
  reading it back through `idl_rs::workbook::v3::parse_workbook` succeeds
  and its front matter's `id`/`name`/`version` match what was written;
  `cell_count == 0`.
- Empty `name` (`""` and `"   "`) → `invalid_argument`, nothing written.
- A name that sanitises to an empty stem (confirm what actually triggers
  this against the landed `sanitize_file_name_stem` — an all-symbols input
  like `"???"` if that's what the existing sanitiser reduces to empty; read
  its test module first rather than guessing) → `invalid_argument`, nothing
  written.
- Two `create_workbook` calls with the same `name` → the second gets a
  `-2` suffix on its file name, not an error, and both files exist
  afterward with distinct `id`s.
- The returned `WorkbookHandle.path` matches the file actually written
  (not a guessed path).

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the worktree. Read
      `sanitize_file_name_stem`'s existing tests to know exactly which
      input reduces to an empty stem before writing your own test for it.
- [ ] **Step 2: Write failing tests.**
- [ ] **Step 3: Implement** `create_workbook_via`/`create_workbook`.
- [ ] **Step 4: Register** in `lib.rs`'s `handler()`.
- [ ] **Step 5: Test** — `cargo test -p idl-rs-tauri
      commands::workbook::create_workbook`, confirm non-zero `passed`.
- [ ] **Step 6: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 7: Commit** — `git add tauri/src/commands/workbook.rs
      tauri/src/lib.rs` — message
      `tauri: create_workbook, reuses save_workbook's sanitiser/collision suffix (C3 3.4)`.

## Do not

- Do not write a second filename sanitiser — `sanitize_file_name_stem` in
  this same file already exists and is already tested; call it.
- Do not use a bare `std::fs::write` in place of `write_atomic`.
- Do not derive the file name from the minted `id` — C3 is explicit the
  file name comes from `name`, sanitised, never the id.
- Do not touch `rust/core/src` — everything needed (`unique_file_base`,
  `write_atomic`, the workbook parser) is already landed.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol; A/A/A tests named `thing — condition —
result`; match `workbook.rs`'s existing idiom exactly. No `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.4 already fully specifies this command.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::workbook::create_workbook` result line with its `passed` count;
`cargo check -p idl-rs-tauri` result; confirmation `sanitize_file_name_stem`/
`unique_file_base` were reused, not reimplemented; which input you found
actually sanitises to an empty stem (quote it); whether a minimal-document
constructor already existed in `workbook/v3/` or you hand-built the
markdown string; anything else ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

# L8w Task 4 — implementer brief (`read_workbook`, C3 §3.4, L6's hard blocker)

You are the implementer for L8w Task 4: `read_workbook(id_or_path) ->
{ markdown, hash, path }` — the command that closes the gap making
`save_workbook` usable as specified (nothing previously let the editor read
the file it's about to save `based_on_hash` against). Satisfies wave-2 need
L6-N1 (ruling R59, ruling R52 Q6). TDD, ONE commit, then report.

## GATE — verify before opening the worktree

Same gate as Tasks 1–3:
```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`. This task does not depend on Tasks
  2/3's commits (different file), but if they're already on the branch,
  build on top of them rather than starting fresh.
- Work ONLY there. Do NOT touch the shared checkout beyond reading files
  named below. Do NOT edit `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/workbook.rs`, `tauri/src/lib.rs`.

- Read first: `CLAUDE.md`; the plan's Task 4 section
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  `runs/2026-09-05/lanes/l8w/BRIEF.md`/`review-STANDING.md`; C3 §3.4's
  `read_workbook` entry (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`)
  — quoted below, and read `save_workbook`'s entry immediately below it for
  the `based_on_hash` this command's `hash` field feeds; ruling R52 Q6 and
  R59 (`runs/2026-09-03/decisions.md`) for context on why this command was
  missing; the landed `tauri/src/commands/workbook.rs` in full (you are
  extending this file — read `open_workbook_via`, `resolve_workbook_path`
  (you reuse this **unmodified**, it already turns an `id_or_path` into an
  absolute `PathBuf`, `not_found` on no match), `save_workbook`'s own
  `sha256_hex`/`write_atomic` usage (the same hash function you use here,
  so a hash `read_workbook` returns is byte-identical to what
  `save_workbook` would compute over the same content), and this file's
  test module conventions — `WorkbookHandle`, the fixture-writing helpers
  already in the test module, if any (check before adding your own));
  `idl_rs::store::atomic::sha256_hex`'s signature (`rust/core/src/store/atomic.rs`,
  already imported in this file via `use idl_rs::store::atomic::{sha256_hex,
  write_atomic, AtomicWriteErrorKind};`).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never
override with `-j`). While working: `cargo test -p idl-rs-tauri
commands::workbook::read_workbook`, foreground, non-zero `passed`. No
`cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo process at a
time.

**`pub`-change check:** `cargo check -p idl-rs-tauri` (one new command
registered in `handler()`). No `core` changes in this task, so `cargo check
-p idl-rs-cli --tests` is not required alone.

## C3 §3.4 (quoted — the entry this task implements)

> **`read_workbook(id_or_path: string)`**
> Added post-sign (2026-09-05, lead ruling R59, wave-2 write lane).
> Satisfies wave-2 need L6-N1 — closes the gap that made `save_workbook`
> unusable as specified: no command let the editor read the file it was
> about to save `based_on_hash` against.
> ```ts
> interface WorkbookSource {
>   markdown: string;   // the file's UTF-8 text, verbatim
>   hash: string;       // sha256 of those bytes, hex — the `based_on_hash` a later save passes
>   path: string;       // absolute, under <data>/workbooks/
> }
> ```
> Return: `WorkbookSource`.
> Returns bytes and **does not parse**. Deliberately does not raise the four
> document-fatal `workbook_*` kinds: a document whose front matter is
> malformed must still be readable in order to be repaired in the editor.
> That separation from `open_workbook` is the entire point of the command.
> Errors: `not_found`, `io`, `internal`.

## Interface

```rust
/// C3 §3.4 `WorkbookSource` — `read_workbook`'s return.
#[derive(Debug, Clone, serde::Serialize)]
pub struct WorkbookSource {
    /// The file's UTF-8 text, verbatim — never parsed by this command.
    pub markdown: String,
    /// sha256 of `markdown`'s bytes, hex — the `based_on_hash` a later
    /// `save_workbook` call passes.
    pub hash: String,
    /// Absolute path, under `<data>/workbooks/`.
    pub path: String,
}

#[tauri::command]
pub fn read_workbook(id_or_path: String, data_dir: tauri::State<'_, DataDir>) -> Result<WorkbookSource, IpcError>;
```

Note the argument order matches this file's existing convention
(`id_or_path` before `data_dir: State`, same as `open_workbook`) — check
`open_workbook`'s actual parameter order in the landed file and mirror it
exactly rather than the order written here, if they differ.

## Key logic

```rust
fn read_workbook_via(data_dir: &Path, id_or_path: &str) -> Result<WorkbookSource, IpcError> {
    let path = resolve_workbook_path(data_dir, id_or_path)?;
    let markdown = std::fs::read_to_string(&path)
        .map_err(|e| IpcError::new(IpcErrorKind::Io, format!("reading {}: {e}", path.display())))?;
    let hash = sha256_hex(markdown.as_bytes());
    Ok(WorkbookSource { markdown, hash, path: path.display().to_string() })
}
```

This reuses `resolve_workbook_path` **exactly as `open_workbook_via` does**
— same not-found behaviour, same "literal path or scan `workbooks/*.idl1wb`
by front-matter id" resolution, unmodified. The only difference from
`open_workbook_via` is what happens after resolution: `open_workbook_via`
calls `parse_workbook` and can fail with a document-fatal `workbook_*`
kind; `read_workbook_via` calls neither `parse_workbook` nor
`parse_front_matter` — it reads bytes and stops. This is the command's
entire reason to exist (a malformed document must still be readable to be
repaired), so do not add any parse/validation step "just to be safe."

`std::fs::read_to_string` (not `std::fs::read` + a separate UTF-8 check) is
deliberate: it fails with an `io::Error` on invalid UTF-8 exactly as it
does on any other read failure, collapsing both into this command's single
`io` error kind — matching `open_workbook_via`'s own precedent line for
line. Hashing `markdown.as_bytes()` after a successful `read_to_string`
reproduces the file's on-disk bytes exactly (UTF-8 round-trips losslessly
through `String` when the read already succeeded as UTF-8), so this
command's `hash` is byte-identical to what `save_workbook`'s own
`sha256_hex` would compute over the same file content — the property the
whole command exists to provide.

## Tests (`_via` function, temp `<data>` with a `workbooks/` dir)

- `read_workbook_via` — an existing workbook, looked up **by id** (front
  matter `id:` matching the argument) — returns the exact markdown text,
  `path` pointing at the real file, `hash` equal to a hand-computed
  `sha256_hex` of the same bytes.
- `read_workbook_via` — the same workbook, looked up **by literal path**
  (the file's own absolute path as the argument) — same result.
- `read_workbook_via` — an unknown id/path → `IpcErrorKind::NotFound`.
- `read_workbook_via` — a workbook whose front matter is malformed enough
  that `open_workbook_via` would reject it (document-fatal, e.g. missing
  `id:`) still succeeds here, returning the raw text unchanged — this is
  the test that actually proves the "does not parse" behaviour the
  contract requires, not just an assertion of absence of a specific error
  kind.
- `read_workbook_via`'s `hash` matches a hand-computed
  `idl_rs::store::atomic::sha256_hex` of the fixture bytes exactly (not
  just "is a 64-char hex string").

Match `commands/workbook.rs`'s existing test module conventions (its own
`open_workbook_*` tests already build a `workbooks/` dir with a hand-written
`.idl1wb` file — reuse that fixture-writing pattern rather than inventing a
new one).

## The task, in order

- [ ] **Step 1: Confirm the gate** and open/reuse the worktree.
- [ ] **Step 2: Write the failing tests** above.
- [ ] **Step 3: Implement `read_workbook_via`/`read_workbook`** in
      `tauri/src/commands/workbook.rs`, next to `open_workbook_via`/
      `open_workbook` (or wherever this file's existing ordering groups
      related commands — match it).
- [ ] **Step 4: Register** — `commands::workbook::read_workbook,` added to
      `lib.rs`'s `handler()` list.
- [ ] **Step 5: Test** — `cargo test -p idl-rs-tauri
      commands::workbook::read_workbook`, confirm non-zero `passed`.
- [ ] **Step 6: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 7: Commit** — explicit paths (not `git add -A`):
      `git add tauri/src/commands/workbook.rs tauri/src/lib.rs`
      — message
      `tauri: read_workbook -- unparsed source + hash for save_workbook's based_on_hash (C3 3.4, L6-N1)`.
      Single line, no AI attribution trailer.

## Do not

- Do not call `parse_workbook`, `parse_front_matter`, or raise any
  `workbook_*` `IpcErrorKind` from `read_workbook_via` — that is
  `open_workbook`'s job, and doing so here defeats the command's purpose.
- Do not write a second copy of `resolve_workbook_path` or change its
  existing behaviour — reuse it as-is.
- Do not touch `rust/core/src` — this task is pure `idl-rs-tauri`
  plumbing over already-landed `sha256_hex` and filesystem reads.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `cargo test --workspace`,
  or a bare `cargo test`.

## Style / hygiene

Doc comment on every public symbol, explicitly noting "does not parse" on
`read_workbook`/`read_workbook_via`'s own doc comment so a future reader
doesn't "fix" it into calling `parse_workbook`; typed errors only; A/A/A
tests named `thing — condition — result`; match this file's established
`_via`-function idiom exactly. No `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.4 already fixes `read_workbook`'s shape;
this task implements it as specified.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::workbook::read_workbook` result line with its `passed` count;
`cargo check -p idl-rs-tauri` result; confirmation the malformed-front-matter
test actually exercises a fixture `open_workbook_via` would reject (proving
the "does not parse" behaviour, not just asserting an error kind's
absence); confirmation the hash matches a hand-computed `sha256_hex` byte
for byte; anything else ambiguous you resolved (say how) or that needs a
lead ruling (stop and report instead of guessing — CLAUDE.md §1).

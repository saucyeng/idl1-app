# L8w Task 4 review — `read_workbook`

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
branch `wave2-l8w-write-amendment`, commit `874fbecbaa0e85196df2046fac3d260f8d6d231d`.
Files touched: `tauri/src/commands/workbook.rs` (+108), `tauri/src/lib.rs` (+1).
In scope: this commit only. Out of scope: any later Task 2 follow-up or Task 5
commits landing on the branch after this one (none present at review time
beyond this commit at HEAD... actually HEAD was `4f0bd2a` App group work
below it in history, i.e. this commit is the tip; nothing later has landed).

## Test command and result

Implementer reported `cargo test -p idl-rs-tauri read_workbook_via` → 4 passed.
Not re-run (CLAUDE.md §8, reviewers do not build). Verified statically instead:

- `grep -rn "read_workbook_via|fn read_workbook"` outside `commands/workbook.rs`
  returns nothing, so the substring filter `read_workbook_via` cannot match
  any test but this task's four (all four new test fns are named
  `read_workbook_via_...`). The brief's suggested filter,
  `commands::workbook::read_workbook`, would **not** match any test's fully
  qualified path (`commands::workbook::tests::read_workbook_via_...` has
  `tests::` in between), so the implementer's substitution is necessary and
  sound.
- Each of the four new `#[test]` fns compiles against types landed in this
  same commit (`WorkbookSource`, `read_workbook_via`) and against
  pre-existing helpers (`temp_root`, `write_workbook`, `two_cell_markdown`,
  `WB_ID`, `sha256_hex` already imported at the top of the file) — no new
  imports needed, no plausible compile error.
- Each test's assertion would fail if its named behaviour broke: the by-id
  and by-path tests assert `markdown`/`path`/`hash` all three; the
  not-found test asserts the exact `IpcErrorKind::NotFound`; the
  malformed-front-matter test asserts the read succeeds and returns the
  unmodified fixture text plus a matching hash, using **the identical
  fixture string** (`"---\nname: No id\nversion: 3\n---\n\n\`\`\`math
  id=aaaaaaaa\nx = 1\n\`\`\`\n"`) that the pre-existing
  `open_workbook_front_matter_without_an_id_workbook_missing_front_matter_id`
  test (line 591) proves `open_workbook_via` rejects with
  `IpcErrorKind::WorkbookMissingFrontMatterId`. That is a real proof of the
  "does not parse" contract, not just an absence-of-error-kind assertion.

## Findings

No Critical, Important, or Minor findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings | — |

## Checks performed (all pass)

- **C3 §3.4 field-for-field**: `WorkbookSource { markdown: String, hash:
  String, path: String }` matches the `WorkbookSource` TS interface exactly
  — same three fields, same names, same order documented in C3, no extra
  or missing field.
- **Hash identity with `save_workbook`**: `read_workbook_via` computes
  `sha256_hex(markdown.as_bytes())` where `markdown` is the `String`
  returned by `std::fs::read_to_string(&path)`. `save_workbook_via`
  (`tauri/src/commands/workbook.rs:371`) computes `sha256_hex(markdown.as_bytes())`
  over the caller-supplied markdown `String` the identical way. Both call
  the same `idl_rs::store::atomic::sha256_hex` over UTF-8 bytes with no
  re-encoding step in between (`read_to_string` performs no line-ending or
  BOM normalization — it validates UTF-8 and returns the file's bytes
  verbatim as a `String`; if the file had a BOM or CRLF, those bytes are
  preserved in `markdown` and hashed as-is). So a `read_workbook` round
  trip's `hash` is byte-identical to what a subsequent `save_workbook`
  would compute over the same content, satisfying the contract's whole
  purpose (`based_on_hash` comparison).
- **Does not parse**: confirmed by reading the function body — no call to
  `parse_workbook` or `parse_front_matter` anywhere in `read_workbook_via`,
  and confirmed behaviourally by the malformed-front-matter test described
  above using the exact fixture `open_workbook_via` rejects.
- **`path` resolution**: `resolve_workbook_path` is called unmodified and
  identically to `open_workbook_via`'s own call (`tauri/src/commands/workbook.rs:206`
  vs `:235`) — same by-id-or-literal-path resolution, same `not_found`
  behaviour, no second lookup implementation, no edits to
  `resolve_workbook_path` itself (diff shows only additions, no changes to
  lines 142–163).
- **Error kinds**: only `IpcErrorKind::NotFound` (via `resolve_workbook_path`)
  and `IpcErrorKind::Io` (via the `read_to_string` map_err) are reachable
  from `read_workbook_via`; no `workbook_*` document-fatal kind can be
  raised since `parse_workbook`/`parse_front_matter` are never called. No
  `internal` path is exercised but none exists to raise one here either
  (matches C3's stated `not_found`, `io`, `internal` set — `internal` is
  simply unreachable in this straight-line function, same as other
  file-read commands in this module).
- **Registration**: `commands::workbook::read_workbook` added to
  `handler()`'s list in `lib.rs`, positioned directly after
  `commands::workbook::open_workbook` — matches this file's existing
  ordering convention.
- **Argument order**: `read_workbook(id_or_path: String, data_dir:
  tauri::State<'_, DataDir>)` matches `open_workbook`'s own parameter order.
- **Scope**: only `tauri/src/commands/workbook.rs` and `tauri/src/lib.rs`
  touched; nothing under `docs/`; nothing under `app/src/`; `Cargo.lock`
  untouched; shared checkout not touched.
- **Tests**: Arrange/Act/Assert with blank lines between each section in
  all four new tests; each removes its temp dir at the end, matching the
  file's existing cleanup convention; no duplicated fixture-writing helper
  — all four reuse `temp_root`/`write_workbook`/`two_cell_markdown`/`WB_ID`
  already in the test module.
- **Doc comments**: `WorkbookSource` and each of its three fields
  documented; `read_workbook_via` and `read_workbook` both explicitly state
  "does not parse" / "must not call parse_workbook" in their doc comments,
  satisfying the brief's specific ask that a future reader not "fix" this
  into calling `parse_workbook`.
- **Hygiene**: single-line commit message, no AI attribution trailer,
  explicit paths in the commit's tree (only the two named files present).
- **Hand-formatting**: no reformatting of surrounding lines — the diff is
  purely additive at three insertion points (after `open_workbook_via`,
  after `open_workbook`, after the last test in the file).

## Verdict rationale

The implementation matches the brief and C3 §3.4 exactly: the DTO's three
fields, the deliberate omission of any parse step, reuse of
`resolve_workbook_path` unmodified, and a hash computed identically to
`save_workbook_via`'s so `based_on_hash` round-trips correctly. The
malformed-front-matter test is a genuine proof of the "does not parse"
contract, using the identical fixture bytes the neighboring
`open_workbook_via` test proves are document-fatal. Registration, argument
order, error-kind set, doc comments, test naming/structure, and repo
hygiene all check out; the diff is scoped to exactly the two files named in
the brief with no stray edits. The implementer's test-filter substitution
(`read_workbook_via` in place of the brief's non-matching
`commands::workbook::read_workbook`) is verified sound — it can only match
this task's four tests. Nothing here rises even to Minor.

VERDICT: CLEAN

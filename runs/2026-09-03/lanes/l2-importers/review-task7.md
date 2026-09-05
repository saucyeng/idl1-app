# L2 Task 7 — importer registry (R51 Q2) — review

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
branch `wave1-l2-importers`. Commit under review: `dcf6681ca7539b110513f379f1df14dec2402816`
("core: importer registry -- core::import::importers(), importer_for_extension
derived from one table (R51 Q2)"). Files touched: `core/src/import/mod.rs`,
`core/src/session/mod.rs` — matches the brief's file list exactly; `git status
--porcelain` in the worktree is clean (no other in-flight work from L5 Task 9
present at review time).

## Test command and result

Implementer reported: `cargo test -p idl-rs import::` → 47 passed (42 prior +
5 new). Per CLAUDE.md §8 and the standing brief, reviewers do not build; I
verified the count statically instead of re-running cargo. `import::` is a
substring filter over the fully-qualified test path, so it matches every test
under `core::import::*` (`mod.rs`, `csv.rs`, `fit.rs`, `gpx.rs`, `hook.rs`)
**and** `core::store::import::*` (a different module that happens to contain
the substring `import::`). Counted `#[test]` attributes directly:

- `import/mod.rs`: 9 now (4 in parent commit `b10d846`, +5 new — matches the
  five tests this commit adds).
- `import/csv.rs`: 6, `import/fit.rs`: 4, `import/gpx.rs`: 11, `import/hook.rs`: 1.
- `store/import.rs`: 16.

Sum: 9+6+4+11+1+16 = 47. This exactly reproduces the reported 47 (42 prior +
5 new), confirming the count is genuine and not inflated/deflated, and
confirming the filter isn't accidentally matching zero or an implausible
number (L3-R8).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `core/src/import/mod.rs:118-120` (`ImporterInfo.extensions` doc comment) | The doc comment says extensions are given "without the leading dot" but doesn't say *why* — that the Tauri layer (L5 Task 9) is expected to dot-prefix them to match C3 §3.3's wire shape (`extensions: string[]` example `[".idl0"]`). A Task 9 implementer reading only this file could plausibly ship bare extensions on the wire. | Non-blocking; a one-clause addition ("the Tauri `list_importers` command adds the leading dot for the wire, R60 forward reference") would close the gap for the next reader, but nothing here is wrong and Task 9 has its own brief to carry this. |
| Minor | `core/src/import/mod.rs:198-200` (`importers()` / `OnceLock<Vec<ImporterInfo>>`) | The `OnceLock`-backed `Vec` is runtime indirection where a second `const` array of `ImporterInfo` (built directly from `IMPORTER_TABLE`'s literals, since `ImporterInfo` is `Copy` and heap-free) would have been possible without a lazy-init step. Not a defect — the brief explicitly left the mechanism open ("your call... not a specific mechanism") and this shape correctly keeps `IMPORTER_TABLE` the single source (no drift risk), it just adds one avoidable `OnceLock::get_or_init` call per first invocation. | None required; if it matters, a plain `const INFOS: &[ImporterInfo]` populated by copying `IMPORTER_TABLE[i].info` per entry removes the runtime lazy-init at the cost of one more line per importer. |

No Critical or Important findings.

## Checks performed (all pass)

- **Gate.** `git log --oneline` confirms `dcf6681`'s parent is `b10d846`
  (Task 6, hook/import_file/Time-synthesis) whose parent is `af4cd99` (Task 5,
  CSV) — both required commits are landed under HEAD, per the brief's GATE.
- **R51 Q2 shape.** `ImporterInfo { id, label, extensions }` is the single
  table (`IMPORTER_TABLE`); `importer_for_extension` is rewritten to search
  `IMPORTER_TABLE` and the old hand-written `match ext { "gpx" => ..., ... }`
  is fully deleted — confirmed by reading the diff hunk removing that match
  block. `grep`'d the whole `core/src/import/` tree and `store/import.rs` for
  bare `"gpx"`/`"fit"`/`"csv"` string literals: the only remaining ones are
  unrelated vocabulary (channel `source_kind` string args to
  `Channel::from_f64_with_times`, and CLI-style test fixture args to
  `import_file`'s own `extension` parameter) — no second copy of the
  extension→importer mapping exists anywhere.
- **Table contents.** Exactly three entries — gpx, fit, csv — and
  `importers_does_not_include_idl0` plus a direct read of `IMPORTER_TABLE`
  confirm `.idl0` is absent, per R51 Q1.
- **Id vocabulary.** Each entry's `id` is `SourceFormat::{Gpx,Fit,Csv}.as_str()`,
  not a bare literal — ids are derived from, not duplicated against, the C3
  `importer_id` vocabulary `SourceFormat` already owns. Doc comment on `id`
  states this explicitly.
- **`as_str()` → `const fn`.** One-line, additive change in
  `core/src/session/mod.rs:113`; the match body is a `Copy`-enum match
  returning `&'static str` literals only, which is const-fn-eligible as
  written; doc comment updated to explain why; no existing call site's
  signature or behaviour changes (call syntax `x.as_str()` is unaffected by
  adding `const` to the `fn`). Correctly used option (a), the brief's
  preferred path.
- **`construct: fn() -> Box<dyn Importer>` coercion.** `|| Box::new(gpx::
  GpxImporter)` (and fit/csv) are non-capturing closures; the struct-literal
  field's declared type `fn() -> Box<dyn Importer>` provides the expected-type
  context Rust uses to perform the `Box<GpxImporter>` → `Box<dyn Importer>`
  unsizing coercion on the closure body and then coerce the closure itself to
  a function pointer — a standard, compiling pattern. Traced
  `GpxImporter`/`FitImporter`/`CsvImporter` to their `pub struct` declarations
  and confirmed each implements `Importer` (via `source_format`/`import`).
- **Five new tests — traced statically, would compile and would fail if
  broken:**
  - `importers_every_registered_extension_resolves_via_importer_for_extension`:
    A/A/A (arrange table, act+assert per extension). Iterates the real
    `importers()` table (not a hard-coded copy), round-trips every extension
    through `importer_for_extension`, and cross-checks the returned
    importer's own `source_format().as_str()` against the table's `id` — this
    would catch a `construct` closure wired to the wrong importer.
  - `importers_ids_are_unique` / `importers_extensions_are_unique_across_entries`:
    both iterate `importers()` itself (not a copy), sort+dedup and compare
    lengths — a genuine uniqueness check that fails if a future entry
    collides.
  - `importers_does_not_include_idl0`: direct negative-space assertion over
    the live table.
  - `importer_for_extension_unknown_extension_still_returns_none`: regression
    guard against the rewritten lookup silently becoming an always-match.
  All five are named `thing — condition — result` (as valid Rust
  identifiers), have blank-line-separated Arrange/Act/Assert (or
  Arrange/Act+Assert where the act and assert are the same expression, e.g.
  the `assert!`/`assert_eq!` calls immediately after arrange — consistent
  with this module's existing test style), and test only this task's own
  code (the registry and its derived lookup), not re-testing GPX/FIT/CSV's
  own parsing logic.
- **Doc comments.** `ImporterInfo` and all three of its fields, `importers()`,
  the private `ImporterEntry` and `IMPORTER_TABLE` (not required to be
  documented since private, but documented anyway) — all present. No numeric
  unit needed (no physical quantity in this struct), consistent with the
  brief.
- **No `unwrap()`/`expect()` on the production path** — the only `panic!`
  usage is inside a test body's `unwrap_or_else`, which is test-only per
  CLAUDE.md §5's exception.
- **Hand style / no reformatting.** The diff is purely additive plus one
  block replacement (the old `match` deleted, replaced in place) — no
  whitespace/import-order churn on untouched lines. Indentation and brace
  style match the surrounding file.
- **Hygiene.** Single-line commit subject, no AI-attribution trailer;
  `git show --stat` confirms exactly the two named files touched, nothing
  pulled in by an `-A` add; `docs/` untouched; shared checkout
  `idl1-app\rust` and other worktrees untouched.
- **`cargo check -p idl-rs-cli --tests` correctly skipped.** `importer_for_extension`'s
  signature (`fn(&str) -> Option<Box<dyn Importer>>`) is unchanged; `as_str()`
  gains `const` but its call-site syntax and return type are identical, so no
  downstream caller's compilation is affected — the R18-addendum condition
  (a *changed* `pub` signature) is not triggered by a net-new item or a
  const-only addition to an existing one.
- **Labels (Note only, non-blocking per the brief):** "GPX track", "FIT
  activity", "CSV import" — plain, consistent register, reasonable defaults
  for a UI importer picker; flagged for the lead to bless final copy before
  it reaches C3 §3.3, per the brief's own instruction, not a review finding.

## Verdict rationale

The commit does exactly what R51 Q2 and the task-7 brief specify: one table
(`IMPORTER_TABLE`) is now the sole source of importer ids, labels, and
extensions; the previously hand-written `match` in `importer_for_extension`
is gone, not left duplicated; ids are derived from `SourceFormat::as_str()`
(now correctly a minimal, behaviour-preserving `const fn` change) rather than
re-typed as literals; `.idl0` is correctly excluded and pinned by a dedicated
test; and all five new tests are genuine, table-driven checks that would fail
if the rule they name broke. The reported 47-passed count is independently
reproducible by counting `#[test]` attributes across every module the
substring filter reaches, so there is no reason to doubt it. The only two
observations — a doc comment that could be one clause more explicit about
the Tauri-side dot-prefixing convention, and an `OnceLock` indirection that a
plain const array could have avoided — are both Minor, non-blocking, and
explicitly left as implementer's-choice by the brief itself. This ships as
is.

VERDICT: CLEAN

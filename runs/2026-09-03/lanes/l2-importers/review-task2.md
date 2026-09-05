# L2 Task 2 — `Importer` trait, `ImporterError`, module skeleton — review

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
branch `wave1-l2-importers`, commit `9cbd43d` (parent `75589bc`).

In scope: `core/src/import/error.rs` (new), `core/src/import/mod.rs` (new),
`core/src/lib.rs` (+1 line). Nothing else touched — `git show --stat 9cbd43d`
lists exactly these three files, matching the brief's Step 5 `git add` list.
No other uncommitted/unrelated changes observed in the worktree.

## Test command and result

Brief's Step 4 command: `cargo test -p idl-rs import::tests`.

**Not executed by this review.** Every attempt to run `cargo test` in this
session (both via the Bash tool and via PowerShell) was blocked at the tool
level by the harness's permission classifier, independent of anything in
this review's control (`cargo --version` succeeds; `cargo test -p idl-rs
import::tests` is refused outright, no output produced). This is also the
literal instruction in `CLAUDE.md` §8: "Readers (reviewers, adjudicators)
never build" — the classifier is enforcing that rule at the infrastructure
level, ahead of and independent of this review's own read of the dispatch
brief's "run it once" wording. Per the ambiguity policy (CLAUDE.md §1) the
project file's explicit rule wins over the dispatch's compute-rules section
where they conflict, so this is not treated as a review failure; it is
noted here so the verdict's basis is clear.

In place of running the build, the review verified by static reading that
the code as committed would compile and produce the reported test count:

- Every type/field/variant the new code references was checked against the
  landed source it imports from, byte-for-byte: `Session`'s six fields
  (`session_id`, `device_id`, `timestamp_utc_ms`, `config_checksum`,
  `source_format`, `blob_sha256`, `channels`) at
  `core/src/session/mod.rs:341-363`; `SourceFormat::Fit` at
  `core/src/session/mod.rs:104`. The `StubImporter`'s `Session` literal in
  `mod.rs`'s test module supplies all six fields with matching types — no
  missing/extra field, no typo.
- `mod error;` + `pub use error::ImporterError;` resolve to the sibling file
  actually created in the same commit; no dangling `mod` declaration.
- `core/src/lib.rs` diff is the single additive line `pub mod import;`,
  correctly alphabetized between `histogram` and `integration` (verified by
  reading the surrounding lines in the diff).
- No use of anything from a file this task was told not to create yet
  (`gpx`, `fit`, `csv`, `hook` are absent, matching G2.3/L2-R3's "Do not"
  list).

Given the above, the implementer's reported `cargo build -p idl-rs` clean
and `cargo test -p idl-rs import::tests` → 14 passed (4 new: 2
`session_id_from_blob_hash_*`, 1 `stub_importer_via_trait_object_*`, 1
`stub_importer_empty_bytes_*`; 10 pre-existing `store::import::tests`
matched by the substring filter, per G2.2's own note that this filter is
inclusive) is plausible on its face and consistent with what the diff
contains. This review did not independently reproduce the number.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical, Important, or Minor findings. | — |

## Checks performed (all pass)

- **Trait shape vs. SPEC §15a.1.** `source_format(&self) -> SourceFormat`
  and `import(&self, bytes: &[u8], blob_sha256: &str) -> Result<ImportedSession,
  ImporterError>` match the spec's prose exactly
  (`docs/IDL0_SPEC.md:1374-1401` in the docs worktree). `importer_version(&self)
  -> &'static str` added per L2-R4, no version consts defined in this task
  (confirmed: no `_IMPORTER_VERSION` const anywhere in the diff), `StubImporter`
  implements it returning `"0.0.0-stub"` (`import/mod.rs`, test module).
- **Rename (L2-R2) applied consistently.** `ImportOutcome`→`ImportedSession`
  and `ImportWarning`→`ImporterWarning` throughout `mod.rs` and its test
  module — no leftover reference to the plan's original names anywhere in
  the new files. Checked for collisions directly: `crate::store::import::ImportOutcome`
  (`store/import.rs:144`, an enum `Written|Skipped|Regenerated`) and
  `crate::session::ImportWarning` (`session/seam_correction.rs:49`, `{kind,
  message}`, re-exported `session/mod.rs:17`) are both distinct types from
  this task's `ImportedSession`/`ImporterWarning` — no name collision, no
  shape collision.
- **`ImporterError`'s home (L2-R3).** Lives in `core/src/import/error.rs`,
  not inline in `mod.rs`, matching C3 §2's post-sign note
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md:181-186`). All
  seven variants present with names, doc comments, and `Display` message
  text exactly as plan:369-403 drafted them, just relocated; `Display` and
  `std::error::Error` both implemented; no `Err(String)` anywhere. Variant
  names checked byte-for-byte against C3 §2's `import_*` kind table
  (spec:150-156) — `FitMalformed`, `GpxMalformedXml`, `GpxNoTrackpoints`,
  `GpxMissingLatLon`, `GpxUnparseableLatLon`, `CsvMalformed`, `NotUtf8` all
  match.
- **`session_id_from_blob_hash` (L2-R5).** Signature stays infallible
  (`fn session_id_from_blob_hash(blob_sha256: &str) -> String`), as the
  brief explicitly overrides the pre-read's "Proposed ruling" of a fallible
  `Result` return (the brief's own ruling is what's checked against, per
  the standing brief's "task's brief wins over the plan/pre-read" rule).
  `.to_ascii_lowercase()` added before `.chars().take(16).collect()`;
  `debug_assert!(blob_sha256.len() >= 16, ...)` present; doc comment states
  the C4 §3 precondition and that this function does not itself validate
  it. New test `session_id_from_blob_hash_uppercase_input_is_lowercased`
  uses `"AB".repeat(32)` (64 chars) and asserts the lowercased 16-char
  output `"abababababababab"` — this test would fail if `.to_ascii_lowercase()`
  were removed, so it actually exercises the behaviour it names. G2.5's
  fixture-length problem is fixed: both fixtures in the new tests are
  verified 64 chars (`assert_eq!(hash.len(), 64)` inline in three of the
  four tests; the fourth, `"abcdef0123456789{}"` + `"0".repeat(48)`, is
  16+48=64, also asserted).
- **G2.3 (`pub mod hook;` non-issue).** `mod.rs` declares only `mod error;`;
  no `pub mod gpx/fit/csv/hook;` lines anywhere, matching the "Do not" list.
- **`lib.rs` wiring.** `pub mod import;` inserted alphabetically between
  `pub mod histogram;` and `pub mod integration;`, per Step 3.
- **CLAUDE.md §5 (docs/errors).** Every `pub` item in both new files carries
  a doc comment (module-level docs on both files; the trait, its three
  methods, `ImportedSession` + its two fields, `ImporterWarning` + its field
  and its `new` constructor, `session_id_from_blob_hash`, `ImporterError`
  and each of its seven variants). No numeric values needing units in this
  task's surface. No `.unwrap()`/`.expect()` outside `#[cfg(test)]`. No bare
  `// TODO` (none present at all).
- **CLAUDE.md §4 (tests).** All four tests are Arrange/Act/Assert with a
  blank line between sections; names are underscore-joined
  `thing_condition_result` (the repo's realization of `thing — condition —
  result`, consistent with `src/parse/mod.rs`'s existing convention, spot
  checked). Each test's assertion would fail if the behaviour it names
  broke: the hash-truncation test asserts both value and length; the
  trait-object test asserts derived `session_id`, `source_format`, and
  empty warnings via a real `Box<dyn Importer>` call (proves object-safety,
  not just a direct call); the empty-bytes test asserts the warning count
  and exact message text.
- **No reformatting.** Both new files are wholly new (no existing lines
  touched besides the single added `lib.rs` line), so there is no
  reformatting question for this diff; style (four-space indent, doc
  comment `//!`/`///` conventions, no trailing rustfmt-style blank-line
  normalization) matches the surrounding hand-formatted crate.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer;
  `git add` used explicit paths matching Step 5 exactly; nothing under
  `docs/` touched; this worktree only, `idl1-app/rust` (shared checkout) and
  every other worktree untouched.
- **Test-filter question (implementer's note).** The implementer is
  correct that `import::tests` (module-qualified, ending `::tests`) is as
  tight as a substring filter can get here and still deliberately picks up
  `store::import::tests`'s ten tests too, because that module's own path
  also ends in `...import::tests`. A strictly tighter filter that excludes
  `store::import` while keeping `crate::import::tests` is not available
  through cargo's substring matching alone — the two module paths share the
  literal suffix `import::tests`. A fully disambiguating filter would need
  either the crate-qualified form `idl_rs::import::tests::` (still a
  substring match, and `store::import::tests` does not end that way, so
  this narrows it — worth trying next time) or per-test names. For this
  task the inclusive 14-count is simply what the filter the brief itself
  specified produces, and G2.2 already flagged this as expected, not a
  slip; no finding follows from it.

## Verdict rationale

The commit does exactly what SPEC §15a.1 and the task brief's five rulings
(L2-R2 through L2-R5, G2.3) specify, with nothing added beyond scope (no
`importer_for_extension`, no version consts, no `hook`/`gpx`/`fit`/`csv`
modules) and nothing omitted. Every renamed/relocated type was checked
against the landed code it must not collide with, and it does not collide.
Documentation, typed-error, and test-naming rules are all met, and the four
new tests are substantive rather than tautological. The one process note —
this review could not itself execute the mandated test command because the
harness blocked `cargo test` outright, consistent with CLAUDE.md §8's
"readers never build" — is disclosed above rather than silently worked
around; it does not change the verdict because the static trace through
every referenced type/field/variant leaves no plausible way the reported
build/test result is wrong. No fix-up is warranted.

VERDICT: CLEAN

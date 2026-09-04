# L2 Task 2 — implementer brief (`Importer` trait, `ImporterError`, module skeleton)

You are the implementer for L2 Task 2 of the idl1 rewrite — the first
Rust-touching task of the core importers lane, and the foundation every
later task in this lane builds on. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`. If it does not already exist, create it:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
  git worktree add -b wave1-l2-importers "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l2-importers" main
  ```
  HEAD on `main` (post L1 merge `76b640a`), status clean. Verify first; if
  not, stop and report. The worktree inherits `.cargo/config.toml` (shared
  target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout — must stay on `main`), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`
  beyond READING the files named below, or any other worktree. Do NOT edit
  anything under `docs/`. Do NOT push.
- **Gate check first (Global Constraints).** Do not proceed past it if either
  grep returns `0`:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l2-importers/core"
  grep -c "pub t_us: Vec<i64>" src/session/mod.rs
  grep -c "pub source_format: SourceFormat" src/session/mod.rs
  ```
  Both must be `>= 1` (they are, on landed `main` — this just confirms your
  worktree is current).
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the
  L2 plan's Global Constraints (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`,
  lines 25–65) and `### Task 2` (277–516 — your starting point, **with the
  corrections below applied**, not transcribed verbatim); contract C3 §2
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, the
  `import_*` rows and the "Added post-sign... R7... `ImporterError`
  (`rust/core/src/import/error.rs`, L2)" note — this fixes the file this
  task creates); the pre-read
  `runs/2026-09-03/lanes/l2-importers/pre-read-tasks1-6.md`'s Task 2 section
  (G2.1–G2.5) and Cross-cutting section (G0.2, G0.3); the landed
  `src/session/mod.rs` — `Session`/`Channel`/`SourceFormat` (already contain
  every field this task's code references; no gate surprises expected).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). `cargo build -p idl-rs` once, then
`cargo test -p idl-rs import::tests` — **not** `import::` (a substring
filter that would also match `store::import::tests`' 10 landed tests,
inflating the count you report — G2.2). Every run must report a non-zero
`passed` count — a targeted filter matching nothing is a failed gate, not a
pass (standing rule, L3-R8). No full suite, no tarpaulin, no `-j`, no
`.cargo/` edits, never `cargo fmt`. One cargo process at a time, foreground.
`cargo check -p idl-rs-cli --tests` is NOT required for this task (nothing
outside `core` can reference these brand-new types yet).

## The task (plan Task 2, Steps 1–5) with these rulings

**Ruling — L2-R2 (rename to end two collisions with landed public types).**
The plan's `ImportOutcome` (a struct: `{session, warnings}`) collides with
landed `crate::store::import::ImportOutcome` (an enum:
`Written|Skipped|Regenerated`); the plan's `ImportWarning` (`{message}`)
collides with landed `crate::session::ImportWarning` (`{kind, message}`,
re-exported at `session/mod.rs:17`). Rename throughout this module (and every
later task's code that references them): `ImportOutcome` → `ImportedSession`,
`ImportWarning` → `ImporterWarning`. `Importer::import`'s return type becomes
`Result<ImportedSession, ImporterError>`.

**Ruling — L2-R3 (`ImporterError`'s home, per C3 §2's own post-sign note).**
Create `src/import/error.rs` holding `ImporterError` (all seven variants,
`Display`, `std::error::Error` impl) — not inline in `mod.rs` as the plan's
Step 2 code block drafts it. `mod.rs` gets `mod error;` and
`pub use error::ImporterError;`. Variant names/messages/doc comments are
otherwise exactly as plan:369–403 drafts them (`FitMalformed(String)`,
`GpxMalformedXml(String)`, `GpxNoTrackpoints`, `GpxMissingLatLon(String)`,
`GpxUnparseableLatLon(String)`, `CsvMalformed(String)`, `NotUtf8(String)`) —
just relocated to their own file.

**Ruling — L2-R4 (per-importer version + trait method).** Add
`fn importer_version(&self) -> &'static str` to the `Importer` trait (below
`import`). Each of Tasks 3–5's importers implements it returning its own
version const (`import::gpx::GPX_IMPORTER_VERSION`,
`import::fit::FIT_IMPORTER_VERSION`, `import::csv::CSV_IMPORTER_VERSION`,
each `"0.1.0"`, doc-commented per C1 §4.3) — this task does not define those
consts (they don't exist until Tasks 3–5), only the trait method. Your
`StubImporter` test double implements it too (e.g. returns `"0.0.0-stub"`).

**Ruling — L2-R5 (`session_id_from_blob_hash` — lowercase, documented
precondition, no `Result`).** Keep the function infallible
(`fn session_id_from_blob_hash(blob_sha256: &str) -> String`) — every real
caller passes a value it just computed via `sha2`/`write_blob`, always
already-valid lowercase hex, so a fallible signature would ripple `?`
through every importer for a case that cannot occur in practice. Add
`.to_ascii_lowercase()` to the existing `.chars().take(16).collect()` body;
add a doc-comment precondition naming C4 §3 (`blob_sha256` must already be a
valid SHA-256 hex digest — this function does not itself validate that, only
normalizes case); add a `debug_assert!` that the input is at least 16 hex
characters (cheap, catches a caller bug in debug builds without costing
release-mode callers anything). Add one test with an **uppercase** input
proving the output is lowercased. Fix G2.5: both existing test fixtures in
plan:448/462 are not real 64-char SHA-256s (62/63 chars) — replace with
genuine 64-char hex strings (`"ab".repeat(32)` is 64 chars; use distinct
repeated-pair patterns per test the way the plan's own examples do, just at
the correct length).

**G2.3 — ignore plan:488–496 entirely.** That block is the plan's own
self-contradicting note about a `pub mod hook;` line; there is nothing to
reconcile. Just write `mod.rs`'s Step 2 code block with no `pub mod hook;`
line (hook.rs doesn't exist until Task 6) and no `pub mod gpx/fit/csv;`
lines either (those don't exist until Tasks 3–5) — this task's `mod.rs`
declares only `mod error;` (per L2-R3 above) and compiles standalone.

**Everything else** in plan:297–486 (the trait shape, `ImportedSession`/
`ImporterWarning` structs after the L2-R2 rename, `session_id_from_blob_hash`
after the L2-R5 change, the module doc comment, the three tests after
renaming `ImportOutcome`→`ImportedSession` and adjusting the
`StubImporter`/fixture details above) stands as drafted.

- [ ] **Step 1: Gate check** (above) — confirm both greps `>= 1`.
- [ ] **Step 2: Write `src/import/error.rs`** (L2-R3) and **`src/import/mod.rs`**
  (plan:297–486 code, with L2-R2/R4/R5 applied and G2.3's note ignored).
- [ ] **Step 3: Wire into `lib.rs`** — `pub mod import;` alphabetically
  between `pub mod histogram;` and `pub mod integration;` (plan Step 3,
  unchanged).
- [ ] **Step 4: Build and test** — `cargo build -p idl-rs`, then
  `cargo test -p idl-rs import::tests` per COMPUTE RULES. Expect `Finished`;
  non-zero `passed`, `0 failed` (the plan's "three tests" is now four after
  L2-R5's new test).
- [ ] **Step 5: Commit** — explicit paths (NOT `git add -A`):
  `git add src/import/error.rs src/import/mod.rs src/lib.rs` — message
  `core: Importer trait, ImporterError, session_id_from_blob_hash (C1 §2 skeleton)`.
  Single line, no AI attribution trailer.

## Do not

- Do not leave `ImporterError` inline in `mod.rs` — C3 §2's own post-sign
  note names `import/error.rs` as its home; a reviewer checks this file
  path directly.
- Do not make `session_id_from_blob_hash` fallible — see L2-R5's reasoning.
- Do not add `pub mod gpx;`/`pub mod fit;`/`pub mod csv;`/`pub mod hook;` —
  none of those files exist yet; each is added by its own task.
- Do not add `importer_for_extension` — that's Task 3's Step 3 (needs at
  least one real importer to return).

## Style / hygiene

Doc comment on every public symbol; units on every numeric value (none
here); typed errors only; A/A/A tests named `thing — condition — result`;
match surrounding hand-formatted style (see `src/parse/mod.rs`'s test names
for this repo's existing convention).

## Spec discipline (say it out loud in your report)

"no spec change needed" — Task 1's `docs/IDL0_SPEC.md` §15a already fixes
this trait's shape and its rename rationale; this task is pure
transcription into code, no new contract text.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(with `passed` count); per-step done/deviated; confirmation
`ImporterError` lives in `error.rs` (not `mod.rs`); confirmation
`importer_version()` is on the trait with no consts defined yet;
confirmation `session_id_from_blob_hash` lowercases and both fixtures are
now real 64-char hex; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

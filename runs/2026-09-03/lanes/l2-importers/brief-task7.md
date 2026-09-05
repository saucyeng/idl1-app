# L2 Task 7 — implementer brief (the importer registry — R51 Q2)

You are the implementer for L2 Task 7 of the idl1 rewrite — a new task,
inserted between the landed Tasks 1–6 and the lane's wrap-up (the plan's
own "Task 7," CHANGELOG/TASKS, is renumbered **Task 8** by this same
ruling — do not confuse the two). This task ships `core::import::importers()`,
the single table `list_importers` (C3 §3.3) and L5 Task 9's `import_file`
`importer_id` routing will both read. TDD, ONE commit, then report.

## GATE — verify before starting

This task needs Task 5 (CSV) and Task 6 (hook/`import_file`/`Time`
synthesis fallback) **landed as commits** — it enumerates the real importer
set, which is incomplete without CSV, and its own test suite runs inside
the same `import::` filter Task 6's work also populates. As of this brief's
writing (2026-09-05), **neither is committed**: `git log --oneline -5` in
the worktree shows HEAD at `275267e` (Task 3's review follow-ups), and the
working tree carries an **uncommitted** `core/src/import/csv.rs` plus a
modified `core/src/import/mod.rs` (Task 5's in-flight work, not yet
reviewed or committed) with no Task 6 work present at all.

**Do not dispatch this task until both land.** When they have, re-run:
```bash
git log --oneline -5
```
and confirm the two most recent commits are Task 5's and Task 6's own
(their exact subjects are given in Task 6's own report — check against
that, not against this brief, which was written before either existed).
If HEAD does not show both, STOP and report rather than guessing at CSV's
final shape.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`, HEAD must be Task 6's commit (per the GATE
  above), status clean. Verify first; if not, stop and report.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`), `idl1-app`
  beyond READING files named below, or any other worktree. Do NOT edit
  `docs/`. Do NOT push. Do NOT touch `rust/tauri/` or `rust/cli/` — this
  task is `core`-only; L5 Task 9 consumes what you ship, in a separate
  worktree/task.

- Read first: `CLAUDE.md`; ledger ruling **R51** (`runs/2026-09-03/decisions.md`,
  search "R51: L2 briefs refreshed") — Q2's exact ruling: *"`core::import::
  importers() -> &'static [ImporterInfo { id, label, extensions }]` is the
  single table; `importer_for_extension` derives from it"*; the brief-refresh
  report `lanes/l2-importers/brief-refresh-2026-09-05.md` section (b) and
  Q2 for the full reasoning (a UI-adjacent registry with a second hand-kept
  extension list would be exactly the drift `review-STANDING.md` already
  calls a finding); `docs/IDL0_SPEC.md` §15a.1's own forward-reference
  ("A future importer registry making importers enumerable is Task 7's
  scope, ledger ruling R51 Q2 — not specified here and not part of this
  trait's shape") in the L2 docs worktree
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l2-importers\docs\IDL0_SPEC.md`,
  read-only — this task makes no SPEC edit, see Spec discipline below);
  contract C3 §3.3's `ImporterInfo` shape
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`, lines
  453–463: `{ id: string, label: string, extensions: string[] }`, with the
  worked example `id` values `"idl0"`, `"fit"`, `"gpx"`, `"csv"`); the
  landed `core/src/import/mod.rs` in full — `Importer` trait (already has
  `importer_version(&self) -> &'static str`, no change needed),
  `importer_for_extension` (the function this task's registry feeds),
  `SourceFormat::as_str()` in `core/src/session/mod.rs` (`"idl0"`, `"fit"`,
  `"gpx"`, `"csv"` — **not** `const fn`, so it cannot be called to build a
  `const` table; see the ruling below on how ids are sourced instead); each
  importer's own module (`gpx.rs`, `fit.rs`, `csv.rs`, once Task 5 lands)
  for their `*_IMPORTER_VERSION` consts and struct names
  (`GpxImporter`, `FitImporter`, `CsvImporter`).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). Targeted filter while working and at the end:
`cargo test -p idl-rs import::` — a substring filter, so it also re-runs
Tasks 2–6's existing `import::`/`store::import::` tests; a large combined
`passed` count is expected and correct (same note as Task 6's brief), not
evidence something leaked. Non-zero `passed`, standing rule. **No**
`cargo check -p idl-rs-cli --tests`: this task adds new items
(`pub struct ImporterInfo`, `pub fn importers`) but changes **no existing**
`pub` signature — `importer_for_extension`'s own signature
(`fn(&str) -> Option<Box<dyn Importer>>`) is unchanged, only its
implementation is refactored to read from the new table internally. The
R18-addendum rule (CLAUDE.md §8) triggers on a changed `pub` signature, not
a net-new one; say this explicitly in your report rather than skipping the
check silently. No `cargo fmt`, no `-j`, no `.cargo/` edits, no full-suite
run (that is Task 8's merge-gate line, unaffected by this task). One cargo
process at a time, foreground.

## Ruling — R51 Q2 (the registry table and its shape)

Add to `core/src/import/mod.rs`:

```rust
/// One importer this module can run, enumerable for C3 §3.3's
/// `list_importers()`. Deliberately does **not** include `.idl0` — that
/// source has its own entry point (`crate::store::import::import_idl0`),
/// outside this trait's scope (SPEC §15a.1) and outside `core::import`'s
/// dispatch; L5's `import_file` Tauri command adds an `"idl0"` row of its
/// own when building the full `list_importers()` response (ledger R51 Q1).
pub struct ImporterInfo {
    /// Stable id, matching `SourceFormat::as_str()` for the format this
    /// importer produces (e.g. `"gpx"`) — the vocabulary `import_file`'s
    /// `importer_id` argument is validated against (C3 §3.3).
    pub id: &'static str,
    /// Human-readable label (C3 §3.3, e.g. `"GPX track"`) — this task's own
    /// invention, no contract or design-doc text fixes exact wording
    /// (non-blocking, same treatment C1 §4.2 gives the `csv` `source_kind`
    /// token: revisit if Isaac wants different copy).
    pub label: &'static str,
    /// Lowercase file extensions this importer covers, without the leading
    /// dot (e.g. `&["gpx"]`) — `import_file`'s auto-detect path and
    /// `list_importers`'s own display both read this list.
    pub extensions: &'static [&'static str],
}
```

**Id sourcing.** Do not hand-write `"gpx"`/`"fit"`/`"csv"` as bare string
literals disconnected from `SourceFormat` — that is a second, driftable
copy of the same vocabulary `SourceFormat::as_str()` already owns. Since
`as_str()` is not `const fn`, a `const` table cannot call it directly.
Resolve this either by (a) making `SourceFormat::as_str()` a `const fn`
(a one-line, behaviour-preserving change — a `match` over a `Copy` enum
returning `&'static str` is const-fn-eligible as written) so
`SourceFormat::Gpx.as_str()` can appear inside the table's initializer, or
(b) keeping the table as a plain (non-`const`) static built once, e.g. via
a `fn importers() -> &'static [ImporterInfo]` backed by a
`std::sync::OnceLock`. Prefer (a): it is the smaller, more local change,
and it turns `id` correctness into "the compiler enforces it matches
`SourceFormat`" rather than "a test checks it matches." **This edits
`session/mod.rs`, a file outside this task's own module** — CLAUDE.md §7
requires cross-lane touches to go through the lead; this ruling **is** that
authorisation for this one, additive, non-behaviour-changing edit (adding
`const` to an existing `fn` signature; call sites are unaffected). If you
judge (a) riskier than it reads (e.g. the match body turns out not to be
const-evaluable for a reason not visible from the read-only inspection
above), fall back to (b) and say so in your report — do not force it.

**Deriving `importer_for_extension` from the table.** The table alone
cannot construct a `Box<dyn Importer>` (`GpxImporter`, `FitImporter`,
`CsvImporter` are different concrete types) — carry a private factory
alongside the public fields, not exposed to callers outside this module:

```rust
struct ImporterEntry {
    info: ImporterInfo,
    construct: fn() -> Box<dyn Importer>,
}

const IMPORTER_TABLE: &[ImporterEntry] = &[
    ImporterEntry {
        info: ImporterInfo { id: SourceFormat::Gpx.as_str(), label: "GPX track", extensions: &["gpx"] },
        construct: || Box::new(gpx::GpxImporter),
    },
    // fit, csv likewise
];

pub fn importers() -> &'static [ImporterInfo] {
    // built once from IMPORTER_TABLE's own `info` fields — see note below
}

pub fn importer_for_extension(ext: &str) -> Option<Box<dyn Importer>> {
    IMPORTER_TABLE.iter().find(|e| e.info.extensions.contains(&ext)).map(|e| (e.construct)())
}
```

(`|| Box::new(gpx::GpxImporter)` is a non-capturing closure, coercible to
`fn() -> Box<dyn Importer>` — confirm this compiles as written; if the
compiler rejects the coercion for a reason not visible from this read-only
brief, an explicit `fn` item per importer, referenced by name, is the
fallback — say which you used.) `importers()`'s exact construction (a
`const` array of just the `info` fields built alongside `IMPORTER_TABLE`,
vs. a `OnceLock`-backed `Vec` leaked to `'static`, vs. some other shape) is
your call — the requirement is one source of extensions/ids/labels, not a
specific mechanism. **Do not** leave `importer_for_extension`'s existing
`match ext { "gpx" => ..., "fit" => ..., "csv" => ..., _ => None }` body in
place unchanged alongside the new table — that is the exact duplication
this ruling exists to remove.

## The task, in order

- [ ] **Step 1: Confirm the gate** (Tasks 5 and 6 committed — see GATE above).
- [ ] **Step 2: `SourceFormat::as_str()` → `const fn`** (or the `OnceLock`
      fallback), in `core/src/session/mod.rs` — one line, no test needed
      beyond the existing `SourceFormat` tests continuing to pass (they are
      not in this task's own `import::` filter; a compile failure here
      surfaces immediately in Step 5's run regardless, since `core` is one
      crate).
- [ ] **Step 3: `ImporterInfo` + `IMPORTER_TABLE` + `importers()`** in
      `core/src/import/mod.rs`, doc comments per the ruling above, three
      entries (gpx, fit, csv).
- [ ] **Step 4: Rewrite `importer_for_extension`** to read `IMPORTER_TABLE`
      per the ruling — delete the old hand-written `match`.
- [ ] **Step 5: Tests** (see below), then run `cargo test -p idl-rs
      import::`, confirm non-zero `passed`, no regressions in the existing
      `importer_for_extension`/registry-adjacent tests already in this
      module (Task 2's `session_id_from_blob_hash`/stub-importer tests, and
      whatever Tasks 3–5 added to this same `tests` module, if any).
- [ ] **Step 6: Commit** — explicit paths (NOT `git add -A`):
      `git add core/src/import/mod.rs core/src/session/mod.rs` (only if
      Step 2 touched it) — message
      `core: importer registry -- core::import::importers(), importer_for_extension derived from one table (R51 Q2)`.
      Single line, no AI attribution trailer.

## Tests to add

- `importers_every_registered_extension_resolves_via_importer_for_extension`:
  for every `ImporterInfo` in `importers()`, for every extension in its
  `extensions`, `importer_for_extension(ext)` is `Some`, and the returned
  importer's `.source_format().as_str()` equals that `ImporterInfo.id` —
  this is the cross-check that catches a table entry whose `construct`
  closure returns the wrong type.
- `importers_ids_are_unique`: no two entries in `importers()` share an
  `id`.
- `importers_extensions_are_unique_across_entries`: no two entries share an
  extension (a real bug this would catch: two importers both claiming
  `"csv"`).
- `importers_does_not_include_idl0`: `importers().iter().all(|i| i.id !=
  "idl0")` — the negative-space assertion for R51 Q1's "core refuses idl0"
  rule, cheap and worth pinning explicitly since a future importer added
  here by habit could violate it silently otherwise.
- `importer_for_extension_unknown_extension_still_returns_none` — regression
  guard: an extension not in the table (e.g. `"xyz"`) still returns `None`,
  proving the rewritten lookup didn't accidentally become "always match."

## Do not

- Do not hand-write a second copy of the extension list anywhere (the
  `match` this task deletes was that second copy).
- Do not add `"idl0"` to `IMPORTER_TABLE`/`importers()` — R51 Q1 keeps core
  `import_file`/this registry `.idl0`-free; L5 Task 9 adds it at the Tauri
  layer.
- Do not touch `rust/tauri/` or `rust/cli/` in this task.
- Do not run `cargo test --workspace` or a bare `cargo test` anywhere.
- Do not run `cargo check -p idl-rs-cli --tests` unless Step 2's
  `const fn` change (or anything else in this task) turns out to actually
  change an existing `pub` signature's behaviour visibly to callers — it
  does not, per the COMPUTE RULES note above; if you disagree after
  implementing, say why in your report rather than silently adding the run.

## Style / hygiene

Doc comment on every public symbol (`ImporterInfo` and both its fields,
`importers()`); no unit needed (this struct carries no physical quantity);
typed only — this task adds no new error type, so CLAUDE.md §5's "never
`Err(String)`" is not in play, but do not introduce an `unwrap()`/`expect()`
on the new construction path outside tests. A/A/A tests named
`thing — condition — result`. Match `import/mod.rs`'s existing hand-formatted
style exactly (it is landed L2 code as of Task 6) — no `cargo fmt`.

## Spec discipline (say it out loud in your report)

**"No spec change needed."** `docs/IDL0_SPEC.md` §15a.1 already carries the
forward-reference to this task ("A future importer registry... is Task 7's
scope, ledger ruling R51 Q2 — not specified here and not part of this
trait's shape") — read it, confirm your landed shape (`ImporterInfo { id,
label, extensions }`, table excludes `.idl0`) matches what that sentence
anticipates, and say so in your report. If your landed shape diverges from
that one-sentence anticipation in any way a future reader would need to
know, say so explicitly — that is Task 8's SPEC-consistency pass to
reconcile, not something to fix here (this task's own file scope is
`core/src/import/mod.rs` and, conditionally, `core/src/session/mod.rs` —
not `docs/`).

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs import::` result
line with its `passed` count; confirmation of each new test's outcome;
which id-sourcing option you used (Step 2's `const fn` vs. `OnceLock`
fallback) and why, if you diverged from the recommended (a); confirmation
`importer_for_extension`'s existing tests (Tasks 2–6's) all still pass
unchanged; confirmation `cargo check -p idl-rs-cli --tests` was correctly
skipped (or, if you judge it necessary, why); the exact `label` strings you
chose for gpx/fit/csv (non-blocking, but the lead should see them before
they reach C3 §3.3's UI-facing `ImporterInfo.label`); the Spec-discipline
confirmation above; anything else ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

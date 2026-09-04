# L2 Task 6 — implementer brief (post-import hook; the `store::import::import_file` entry point; `Time` synthesis fallback)

You are the implementer for L2 Task 6 of the idl1 rewrite — the last task of
this lane. It ships three things the plan's Task 6 doesn't fully cover:
the hook shape (L2-R12), the generalized entry point nothing has called
GPX/FIT/CSV importers through yet (L2-R13 — without this, the whole lane
ships three importers nothing stores), and the `Time`/`Distance` synthesizer
fallback (Q2) that makes every FIT/GPX/CSV session actually get a `Time`
channel. TDD, ONE commit, then report. This is the lane's merge-gate task —
run the full end-of-lane checks at the end, once.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`, HEAD must be Task 5's commit (given in the
  dispatch message), status clean. Verify first; if not, stop and report.
  Leave `.cargo/config.toml` alone.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`), `idl1-app`
  beyond READING files named below, or any other worktree. Do NOT edit
  `docs/`. Do NOT push. **Exception, explicitly authorized by ledger R23**
  (cross-lane authorization through the lead, CLAUDE.md §7): this task edits
  `src/store/import.rs` and `src/session/synthesis.rs`, both landed L1
  files, per L2-R13 and Q2 below. Do NOT touch `rust/cli/` — no CLI wiring
  in this lane (that stays L1's/L5's, this task only adds the core function
  a caller will eventually reach).

- Read first: `CLAUDE.md`; the L2 plan's `### Task 6`
  (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`, lines
  1609–1757 — the hook's *shape* only, plan:1620–1729's code, minus
  `import_with_hook`, see L2-R12 below); contract C3 §2's seven `import_*`
  rows (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`); the
  pre-read `pre-read-tasks1-6.md`'s Task 6 section (G6.1–G6.3) and "The
  structural one — L2-R13" section (the recommended `import_file` shape);
  ledger `R23`; the landed `src/store/import.rs` in full (`plan_import`,
  `ImportErrorKind`, `ImportError`, `ImportOutcome`, `ImportReport`,
  `import_idl0` — you extend this file, you don't replace it; note its own
  R18-addendum ordering rule: parse before writing the blob, so a failed
  import leaves nothing in the CAS); `src/store/blob.rs`
  (`write_blob`/`blob_path`) and `src/store/atomic.rs`'s public
  `sha256_hex` (you need the hash *before* writing, to hand to the
  importer, but must not write to the CAS until after a successful parse —
  see L2-R13 below); `src/session/mod.rs`'s `ParseResult.import_warnings`
  field (`crate::session::ImportWarning{kind, message}`, distinct from this
  lane's own `import::ImporterWarning{message}` — G0.2) and its doc comment
  explaining it must never be silently dropped (G0.6 — `import_idl0`
  currently does exactly that); `src/session/synthesis.rs`'s
  `synthesize_base_channels` in full (Q2 below).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). While working, per-group filters in order:
`cargo test -p idl-rs import::`, then `cargo test -p idl-rs store::import::`,
then `cargo test -p idl-rs session::synthesis::` — each non-zero `passed`
(standing rule, L3-R8; note `import::` as a substring filter also matches
`store::import::tests`, same as G2.2 — expect a large combined count, that's
correct, not a bug to "fix"). Then, **once, at the end**: the lane's own
merge gate,
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` — **never**
`cargo test --workspace`, which the plan's own Step 4 wrongly specifies
(G6.1 — R13/R19's standing rule: the merge gate is `-p idl-rs -p idl-rs-cli`
only; `--workspace` drags in `idl-rs-tauri`'s full Tauri dependency graph,
which OOM-killed this machine once already, ledger R13 addendum). Then
`cargo check -p idl-rs-cli --tests` (mandatory — this task adds a new `pub
fn import_file`, a new `pub import_warnings` field on `ImportReport`, and
new `ImportErrorKind` variants; the R18-addendum standing rule requires this
check whenever a `core` `pub` signature changes). No tarpaulin, no `-j`, no
`.cargo/` edits, never `cargo fmt`. One cargo process at a time, foreground.

## Ruling — L2-R12 (hook: shape only, no `import_with_hook`)

Ship `PostImportHook` + `NoopPostImportHook` only, exactly as plan:1630–1648
drafts them (unchanged). **Do not** write `import_with_hook` — the plan's
own drafted version (plan:1654–1663) takes `importer: &I where I: Importer`,
which can't accept `importer_for_extension`'s `Box<dyn Importer>` without an
awkward deref at the one real call site (G6.3), and R23 approved dropping it
outright. The "wiring" `PostImportHook`'s own doc comment forward-references
("the extension point L1's store... uses to trigger materialised-channel
computation") happens directly inside `import_file` below — that's this
task's actual wiring, not a separate `import_with_hook` function. Drop the
plan's `import_with_hook_calls_hook_exactly_once_on_success` and
`import_with_hook_does_not_call_hook_on_failure` tests entirely (there's no
such function to test); keep `noop_post_import_hook_runs_without_panicking`
(plan:1711–1727, unchanged) as the module's only hook test.

## Ruling — L2-R13 (`store::import::import_file` — the entry point)

Add, in `src/store/import.rs`:

```
pub fn import_file(data_root: &Path, extension: &str, bytes: &[u8]) -> Result<ImportReport, ImportError>
```

Behaviour, preserving the R18-addendum ordering invariant (parse before any
CAS write, so a bad file leaves nothing behind):

1. `crate::import::importer_for_extension(extension)` — `None` means no
   importer covers this extension (this function does **not** handle
   `"idl0"`; that stays `import_idl0`'s own entry point, unchanged, still
   called separately by whoever routes `.idl0` files — out of this lane's
   scope to rewire). Return a new error kind (below) naming the extension.
2. Compute `blob_sha256 = crate::store::atomic::sha256_hex(bytes)` — needed
   *before* parsing, since `Importer::import` takes it as an argument (to
   derive `session_id`) and does not write to the CAS itself. This is one
   extra hash computation beyond what `import_idl0` needs (that path only
   hashes once, inside `write_blob`, after parsing) — an accepted,
   documented cost of this trait's pure signature, not a bug.
3. `importer.import(bytes, &blob_sha256)` — on `Err`, return immediately;
   **nothing has been written to the CAS yet** (ordering preserved).
4. On success: `crate::session::synthesis::synthesize_base_channels(&mut
   session)` — **required**, this is what makes Q2's fallback (below)
   actually reach FIT/GPX/CSV sessions; `import_idl0` already does this same
   call, this path was simply missing it until now.
5. `crate::import::hook::NoopPostImportHook.on_imported(&session)` —
   immediately after a successful import, matching `PostImportHook::
   on_imported`'s own doc comment ("called with the imported `session`...
   the extension point... uses to trigger materialised-channel
   computation"). This **is** L2-R12's "wired by whoever adds the non-.idl0
   path to `store::import`" — no hook parameter on `import_file`'s own
   signature; a real hook replaces this no-op call at a future task, not
   this one.
6. `blob::write_blob(data_root, bytes)` — now writes; its returned digest is
   guaranteed identical to step 2's (same bytes, same hash function) — use
   it as the canonical `blob_sha256` from here on.
7. From here, the sequence is identical in shape to `import_idl0`'s own
   tail (`plan_import` → `Write`/`Regenerate`/`Skip`/`Collision` →
   `write_session_parquet(data_root, &session, importer.importer_version())`
   → create `session.json` if absent). **Factor this shared tail into one
   private helper** both `import_idl0` and `import_file` call (e.g. `fn
   finish_import(data_root: &Path, session: Session, blob_sha256: String,
   importer_version: &str, warnings: Vec<String>) -> Result<ImportReport,
   ImportError>`) — do not duplicate the `plan_import`/`ImportPlan` match
   arms a second time. `import_idl0`'s own public signature and behaviour
   are unchanged; only its internals are refactored to share this tail.

**New `ImportErrorKind` variants.** Add the seven C3 §2 `import_*` rows,
named to mirror the existing `Parse*`/`Collision` variant-naming convention
(`ImportFitMalformed`, `ImportGpxMalformedXml`, `ImportGpxNoTrackpoints`,
`ImportGpxMissingLatLon`, `ImportGpxUnparseableLatLon`, `ImportCsvMalformed`,
`ImportNotUtf8`), plus one more this function needs that C3 §2 doesn't name
(it's a core-internal condition, not an IPC error kind — L5's Tauri layer
maps it to C3's cross-cutting `invalid_argument` at that layer, not this
one): `UnknownExtension` (doc comment: `importer_for_extension` returned
`None` — no importer covers this file extension). **All eight new variants
stay fieldless**, exactly like the existing five (`Io`,
`ParseInvalidMagicBytes`, `ParseUnsupportedSchemaVersion`,
`ParseTruncatedRecord`, `Collision`) — `ImportErrorKind` derives `Copy` and
carries no message data itself; the message lives on the outer
`ImportError.message` field, set via `ImportError::new(kind, message)`. Add
`impl From<crate::import::ImporterError> for ImportError`, mapping each of
`ImporterError`'s seven variants to its matching new (fieldless)
`ImportErrorKind` one and calling `ImportError::new(kind, e.to_string())` —
same pattern as the existing `From<ParseError>` impl in this file, which
does exactly this (match on the source enum's variant to pick a `kind`,
`e.to_string()` for the `message`) — so `importer.import(..)?` inside
`import_file` works via `?` directly.

**Fix G0.6 — `import_warnings` is no longer discarded, on both paths.** Add
`pub import_warnings: Vec<String>` to `ImportReport`. In `import_idl0`,
populate it from `result.import_warnings.iter().map(|w|
w.message.clone()).collect()` (today this field is read nowhere in the
function body — silently dropped, despite `ParseResult::import_warnings`'s
own doc comment warning exactly this must not happen). In `import_file`,
populate it from `outcome.warnings.into_iter().map(|w|
w.message).collect()` (the importer's own `ImporterWarning`s). One field,
both entry points, plumbed through the shared `finish_import` helper's
`warnings` parameter above.

## Ruling — Q2 (`session::synthesis::synthesize_base_channels` fallback)

Today, the function's channel-selection loop only considers channels with
`nominal_rate_hz > 0.0`; if none qualifies, it returns `[]` immediately —
meaning every FIT/GPX/CSV session (every channel `nominal_rate_hz: 0.0`)
gets **no** `Time` channel at all (G1.3). Fix, in `synthesize_base_channels`:

- When the existing loop finds no channel with a positive rate
  (`time_source_idx` is still `None` after the loop), fall back to the
  channel with the **largest `len()`** among **all** of `session.channels`
  (not filtered by rate — there are none with a positive rate in this
  branch by construction), ties broken by keeping the first one encountered
  (same tie-breaking precedent as the existing `>`/`==`-with-longer-`len`
  logic above it). Use that channel's own real `t_us` for `Time`'s `t_us`
  and values, exactly as the primary path already does
  (`time_values[i] = t_us[i] as f64 / 1_000_000.0`).
- The synthesized `Time` channel's `nominal_rate_hz` is **`0.0`** in this
  fallback path — never a fabricated rate. This is the whole point of the
  ruling (ledger R23 Q2): "declaring a fake 1 Hz would make `channel_kind`
  lie about an irregular source" (`channel_kind` is `event` iff
  `nominal_rate_hz == 0.0`, `store/parquet.rs:158` — an honest `Time`
  channel for event-driven data must itself read `event`, not
  `fixed-rate`).
- The existing bail-out guard below the selection loop,
  `if max_rate <= 0.0 || max_rate_len == 0 { return Vec::new(); }`, must no
  longer treat `max_rate == 0.0` as "nothing to synthesize" when the
  fallback found a winner by sample count — that condition is now expected
  and correct in the fallback branch. Narrow the guard to only
  `max_rate_len == 0` (every channel is empty, or `session.channels` is
  empty — genuinely nothing to build `Time` from).
- `Distance` is **unaffected** — it still requires `GPS_SpeedKmh` at
  `nominal_rate_hz > 0.0` (`synthesize_distance_base`'s existing filter,
  unchanged). None of Tasks 3–5's importers produce `GPS_SpeedKmh` at all
  (deferred to Task 8 — Task 1's brief, point 5) — `Distance` correctly
  stays absent for every FIT/GPX/CSV session landed by this lane. Do not
  add any fallback to `synthesize_distance_base`.

**Test.** A session built from two event-driven channels
(`nominal_rate_hz: 0.0`, via `Channel::from_f64_with_times`) of different
lengths and different `t_us` gets a `Time` channel whose `t_us` equals the
**longer** channel's own `t_us` exactly (not `i / rate`, not a synthesized
ramp), and whose `nominal_rate_hz` is `0.0`. Add this alongside the existing
`session::synthesis` test module — do not duplicate its existing
fixed-rate-path tests.

## The task, in order

- [ ] **Step 1: Write `src/import/hook.rs`** per L2-R12 above (shape only,
  no `import_with_hook`).
- [ ] **Step 2: Wire `hook` into `import/mod.rs`** — `pub mod hook;`
  alongside the other `pub mod` lines (`csv`, `fit`, `gpx`, `hook` —
  alphabetical, plan:1731–1733, unchanged).
- [ ] **Step 3: Edit `src/session/synthesis.rs`** per Q2 above, plus its
  test.
- [ ] **Step 4: Edit `src/store/import.rs`** per L2-R13 above: the new
  `ImportErrorKind` variants + `From<ImporterError>` impl, `ImportReport`'s
  new field, the shared `finish_import` helper, `import_idl0` refactored to
  use it (behaviour unchanged, confirm with the existing `store::import`
  test suite still passing untouched), and the new `import_file` function.
- [ ] **Step 5: Per-group test runs** (COMPUTE RULES) — `import::`,
  `store::import::`, `session::synthesis::`, each confirmed non-zero
  `passed` before moving on.
- [ ] **Step 6: End-of-lane checks** (COMPUTE RULES) — the single
  `-p idl-rs -p idl-rs-cli -- --test-threads=4` run, then
  `cargo check -p idl-rs-cli --tests`.
- [ ] **Step 7: Commit** — explicit paths (NOT `git add -A`):
  `git add src/import/mod.rs src/import/hook.rs src/session/synthesis.rs src/store/import.rs`
  — message
  `core: post-import hook shape; store::import::import_file entry point (L2-R13); Time synthesis fallback for event-driven sessions (Q2)`.
  Single line, no AI attribution trailer.

## Tests to add/update, beyond Q2's (above)

- `import_file`: one success test per format (gpx/fit/csv, using a small
  fixture bytes buffer per format — reuse each importer's own golden fixture
  bytes if convenient) proving a `data.parquet`/`session.json` land under
  `data_root/sessions/<session_id>/`, `ImportReport.import_warnings`
  reflects the importer's own warnings (not empty/dropped), and the
  resulting session (read back) has a `Time` channel (proving Q2's fallback
  actually engages end-to-end through this entry point, not just in
  isolation).
- `import_file`: an unknown extension (e.g. `"xyz"`) returns
  `ImportErrorKind::UnknownExtension`.
- `import_file`: a malformed buffer for a known extension (e.g. non-UTF8
  bytes for `"gpx"`) returns the correctly-mapped `ImportErrorKind` (e.g.
  `ImportNotUtf8`) **and** leaves the CAS empty (ordering test, same shape
  as `import_idl0`'s own existing "bad magic bytes leaves nothing in the
  CAS" test — mirror it here for the non-.idl0 path).
- `import_idl0`: one existing test, or a new one, confirming
  `ImportReport.import_warnings` is populated when
  `crate::parse::parse`'s `ParseResult.import_warnings` is non-empty (G0.6's
  fix) — use a fixture that actually exercises burst-seam correction's
  warning path if one already exists in this module's test fixtures;
  otherwise a direct unit test on the new plumbing (constructing a
  `ParseResult` with a non-empty `import_warnings` and confirming it survives
  into the returned `ImportReport`) is acceptable.

## Do not

- Do not write `import_with_hook` in any form (L2-R12).
- Do not make `import_file` handle `"idl0"` — that stays `import_idl0`'s job,
  unchanged; do not touch `rust/cli/` to rewire anything.
- Do not write to the CAS (`blob::write_blob`) before `importer.import(..)`
  succeeds (ordering — R18 addendum).
- Do not duplicate the `plan_import`/`ImportPlan` match arms a second time
  for `import_file` — factor the shared tail.
- Do not declare a fabricated `nominal_rate_hz` (e.g. `1.0`) for the Q2
  fallback `Time` channel — `0.0`, always, in that branch.
- Do not add a `Distance` fallback — it still requires `GPS_SpeedKmh` at a
  positive rate, absent from every importer this lane ships.
- Do not run `cargo test --workspace` anywhere (G6.1).

## Style / hygiene

Doc comment on every public symbol; units on every numeric value; typed
errors only (`ImportErrorKind::UnknownExtension` included); A/A/A tests
named `thing — condition — result`; match surrounding hand-formatted style
(this file — `store/import.rs` — is landed L1 code; match its existing
conventions exactly, don't introduce a new house style for the parts you
add).

## Spec discipline (say it out loud in your report)

"no spec change needed" — Task 1's §15a.5 ("Post-import materialisation
hook", "What is not covered here") already states this task's scope; C1
§4.1/§4.2's already-amended text is what Q2's synthesizer fallback and
L2-R13's warning-plumbing implement; C3 §2's seven `import_*` rows (already
signed) are what the new `ImportErrorKind` variants mirror. `UnknownExtension`
is a core-internal kind with no C3 §2 row of its own — flag this explicitly
in your report so the lead can decide at L5's `import_file` Tauri-command
task whether it needs one (likely mapping to C3's cross-cutting
`invalid_argument`), rather than silently assuming.

## Report back (concise)

Commit hash + `git show --stat`; every test command and result line
(per-group filters, the end-of-lane `-p idl-rs -p idl-rs-cli` run, and the
`cargo check -p idl-rs-cli --tests` result), each with its `passed` count;
per-step done/deviated; confirmation `import_idl0`'s existing tests all
still pass unchanged after the `finish_import` refactor (behaviour
preserved); confirmation of the ordering test (bad file → empty CAS) for
the new path; confirmation `import_warnings` reaches `ImportReport` on both
entry points; confirmation of Q2's fallback test and that `Distance` stays
absent; the `UnknownExtension`/C3 §2 flag above; anything else ambiguous you
resolved (say how) or that needs a lead ruling (stop and report instead of
guessing — CLAUDE.md §1).

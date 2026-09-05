# L2 Task 8 — implementer brief (wrap-up: CHANGELOG, TASKS, SPEC consistency pass, merge gate)

You are the implementer for L2 Task 8 — the plan's original "Task 7"
(CHANGELOG/TASKS wrap-up), renumbered by ledger ruling R51 Q2 once the new
Task 7 (the importer registry) was inserted ahead of it. This is the
lane's **last** task: it closes the lane with CHANGELOG/TASKS entries, a
SPEC §15a consistency re-check against what actually landed (Task 3's
review found real drift here once already — don't skip this), and the
lane's own merge gate. Not TDD in the usual sense (docs + a test run, no
new Rust code) — ONE commit for the docs half, then report; the merge gate
itself produces no commit of its own.

## GATE — verify before starting

Needs Tasks 1–7 landed as commits in the idl-rs worktree. As of this
brief's writing, **none of Tasks 5, 6, 7 exist yet** (Task 5 is
uncommitted working-tree state, Tasks 6–7 haven't started) — this task
cannot be dispatched until all three land. When they have:
```bash
cd C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers
git log --oneline -8
git status --short
```
Confirm seven task commits since the L5 merge base (`75589bc`) and a clean
tree. If not, STOP and report — do not guess at what Tasks 5–7 shipped from
this brief's own (necessarily speculative) description of them below.

## Where

- **Docs half (this task's own commit):** working directory
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l2-importers`,
  branch `wave1-l2-importers`. **This is a deliberate correction to the
  plan's own text**, which says "Working directory:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`" (the shared main
  checkout) — every other docs commit this lane has made (Task 1's SPEC
  section, the R51 brief-refresh, the two SPEC review-fix commits) landed
  in this same docs worktree, on this same branch, not on the shared
  checkout directly (`git log --oneline -5` there shows `7a74ac8`,
  `dc639f5`, `b49b9ca`, `33c8a6b`, `f00254e` — all docs commits on
  `wave1-l2-importers`). Follow that established pattern, not the plan's
  literal (and, on this evidence, stale) working-directory line. Verify
  HEAD/clean status there first.
- **Merge-gate half (no commit):** worktree
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l2-importers`,
  same branch, run from Task 7's own commit.
- Do NOT touch the shared checkout `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`
  itself (read-only, if you need to re-check anything against `main`). Do
  NOT push either worktree.

- Read first: `CLAUDE.md`; the plan's own `### Task 7: CHANGELOG, TASKS,
  wrap-up` section
  (`docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`, lines
  1759–1817 in the shared checkout — the CHANGELOG paragraph text there is
  **stale** in three ways this brief corrects below: `fitparser 0.11.0` →
  `0.9` per L2-R9, no mention of the R27 decimal-degree ruling, no mention
  of Tasks 6/7's own work, which postdate that draft) and its "Open
  questions" section (items 1–10, the numbered rulings/deferrals); ledger
  `R51` in full (`runs/2026-09-03/decisions.md`) for the Task 7 renumbering
  and Q1–Q5; `BRIEF.md` in this directory for the lane's actual scope
  statement and "Done when"; `brief-task6.md` and (once it exists)
  `brief-task7.md`'s own report for what Tasks 6–7 actually shipped —
  **use their reports, not this brief's speculative description, for exact
  wording** (this brief cannot know Task 6/7's exact commit hashes or any
  deviation they reported); `docs/IDL0_SPEC.md` §15a in full, in the docs
  worktree (same path as above) — this is what Step 2 checks against
  landed code.

## COMPUTE RULES — non-negotiable

The merge gate is the one place in this lane the full suite runs (CLAUDE.md
§8): `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`. **Run it in
the foreground** — the L2 four-task gate (2026-09-05, after Tasks 1–4)
already recorded a gate agent stalling twice on a background run; the
lesson was carried forward explicitly ("gate steps should run in the
foreground"). Never `cargo test --workspace`, never a bare `cargo test`
(both denied by the §8 hook since `de3cf95`). Also run, once, foreground:
`cargo check -p idl-rs-cli --tests` and `cargo check -p idl-rs-tauri` (the
latter is a cold Tauri dependency graph — the L2 four-task gate's own run
of it took 16 minutes; budget for that, do not treat a long-running but
still-progressing build as stuck). No `cargo fmt`, no `cargo tarpaulin`, no
`cargo doc`, no `-j`. One cargo process at a time. If the machine shows
memory pressure from another concurrent session (the L5 gate's own
precedent: free RAM near 1.5 GB from an unrelated cross-compile, no OOM but
told to report a killed gate as *killed*), report a killed run as killed,
not as pass or fail.

## Step 1: `CHANGELOG.md`

Directly under `## [Unreleased]` / `### Added` (it currently has entries
above it from L7c — insert this lane's entry in the same position the
plan's draft used, immediately under the heading, above the existing L7c
entries, since this work landed chronologically alongside/after L7c but the
plan's own convention for this file is newest-lane-on-top under `###
Added` — confirm against the file's current head before inserting, since
that ordering convention is inferred from precedent, not written down
anywhere; if the actual file head has settled on oldest-on-top by the time
you run this, follow the file's own established order instead of this
brief's assumption).

Corrected text (do not use the plan's own draft verbatim — it predates
L2-R9, R27, and Tasks 6–7):

```markdown

- **L2 importers (wave 1, <date>).** `GpxImporter` (port of
  `gpx_parser.dart`), `FitImporter` (`fitparser` 0.9 — L2-R9), `CsvImporter`
  (trivial, D4) behind a shared `Importer` trait producing C1 §2's
  `Session`/`Channel` model, with a `core::import::importers()` registry
  (R51 Q2) enumerating all three for C3 §3.3's `list_importers`. GPS
  coordinates are physical decimal degrees for every source (ruling R27,
  superseding an earlier `deg_e7` draft). `store::import::import_file`
  (L2-R13) generalises `import_idl0`'s pipeline to the three new formats;
  `synthesize_base_channels` gained a fallback (ledger R23 Q2) so every
  event-driven FIT/GPX/CSV session still gets a `Time` channel, derived
  from its longest channel's real recorded time rather than a fabricated
  rate. `docs/IDL0_SPEC.md` §15a. Golden tests against hand-built FIT/GPX/CSV
  fixtures — no real device archive used yet; FIT/GPX `GPS_SpeedKmh`/
  `GPS_Heading` direct-path population is a deferred follow-on pending
  Isaac's real archive (ledger R23 Q4) — **not** referred to as "Task 8"
  anywhere in this entry (see this brief's own note to the lead on the
  numbering collision, below).
```

Fill in `<date>` with the day this step actually runs.

**Naming collision, flagged not fixed:** the plan's own Open Question 1 and
SPEC §15a.3/§15a.5 both call the deferred `GPS_SpeedKmh`/`GPS_Heading`
follow-on "Task 8." Since ledger R51 Q2 renumbered *this* wrap-up task to
Task 8, that name is now taken by two different things — this task's own
CHANGELOG text above avoids the collision by describing the deferred work
without naming it "Task 8," but `docs/IDL0_SPEC.md` §15a.3/§15a.5 still say
"Task 8" for the speed/heading follow-on, and this task's own file scope
(`CHANGELOG.md`, `TASKS.md` only, per the plan's File Structure) does not
extend to fixing that. **Say this explicitly in your report** — it needs
either a lead-authorised SPEC edit (a fourth file this task would then
touch, needing sign-off) or a separate follow-up task, and it is a real,
if small, source of future confusion (a reader following "Task 8" from
SPEC into `runs/`/`TASKS.md` would land on the wrong work). Do not decide
which; ask.

## Step 2: `TASKS.md`

**Do not tick a plain `- [x]`.** Per the lesson explicitly carried forward
from ledger ruling R50 (L5's own TASKS.md line was graded Critical for
ticking two items that weren't actually done), qualify the line the same
way L5's own entry now reads:

```markdown
- [x] L2 importers — GPX/FIT/CSV via a shared Importer trait, golden-tested
      against hand-built fixtures; core registry (R51 Q2); import_file/
      list_importers Tauri wiring is L5 Task 9 (rides with this lane, see
      below); FIT/GPX GPS_SpeedKmh/GPS_Heading direct-path population
      deferred pending Isaac's real archive (ledger R23 Q4).
```

This is correct to tick `[x]` (not `[ ]`) because L2's own scope — the
importers themselves, golden-tested — really is complete once Tasks 1–7
land; BRIEF.md's own "Done when" section already scopes end-to-end IPC
wiring to L5's directory, out of this lane. The qualifier states that
boundary explicitly rather than letting a bare tick imply more than L2
itself shipped. **If L5 Task 9 has already landed by the time you run this
step** (check `runs/2026-09-03/lanes/l5-tauri-scaffold/` for a Task 9
report or a ledger entry), drop the "rides with L2" clause and state it
landed instead — don't leave a stale forward-reference to something that
already happened.

## Step 3: SPEC §15a consistency pass (read-only check, not an edit)

**This task's file scope is `CHANGELOG.md`/`TASKS.md` only** (matching the
plan's own File Structure for this task) — you do **not** edit
`docs/IDL0_SPEC.md` in this step. Read §15a against Tasks 6–7's actual
landed diffs and report every mismatch found; a real SPEC fix is then
either explicitly authorised by the lead as an addition to this task's
scope, or a separate dispatched task, per CLAUDE.md §6 ("no spec change
needed" must be said out loud, and this task is saying the opposite —
mismatches found, not fixed here).

**Two mismatches already visible from this brief's own read of the code as
of 2026-09-05 (before Tasks 5–7 exist) — confirm these are still live once
Tasks 6–7 land, don't assume they were incidentally fixed:**

1. **§15a.5 "Post-import materialisation hook" describes a function that
   does not exist.** It reads: *"`rust/core/src/import/hook.rs` defines
   `PostImportHook`..., a no-op default (`NoopPostImportHook`), and
   `import_with_hook` (runs an `Importer` then the hook, on success
   only)."* Ledger ruling L2-R12 (in `brief-task6.md`) explicitly kills
   `import_with_hook` — the plan's own drafted signature couldn't accept
   `importer_for_extension`'s `Box<dyn Importer>` without an awkward
   deref, and R23 approved dropping it outright; the hook is wired
   directly inside `import_file` instead (a no-op call, today). §15a.5's
   sentence needs `import_with_hook` struck and one sentence added
   describing where the hook is actually invoked (`import_file`'s own
   pipeline, L2-R13's Step 5). Confirm this is still the shape Task 6
   actually shipped (its own report is authoritative, not this brief) and
   include the exact correction text in your report even though you don't
   apply it here.
2. **§15a.5 "Error kinds" bullet is stale on the prefix.** It reads:
   *"`ImporterError`'s variants... need new `parse_*`-prefixed rows in C3
   §2's kind vocabulary table before L5 wires `import_file` to IPC."* This
   is wrong on two counts, independently of Tasks 6/7: the seven rows
   already exist in C3 §2 (added under lead ruling R7,
   `import_fit_malformed` through `import_not_utf8`), and they are
   `import_*`-prefixed, not `parse_*` (C3 §2's own post-sign note is
   explicit: `ImporterError` is prefixed `import_*`, "distinct from
   `parse_*` (`ParseError`, `.idl0`-only, unchanged)"). Both the "still
   needed" framing and the prefix are wrong. Report the correction; do not
   apply it.

**Also check, and report either "confirmed correct" or a finding for
each:**

3. §15a.1's registry forward-reference ("A future importer registry...
   Task 7's scope... not specified here") against Task 7's actual landed
   `ImporterInfo { id, label, extensions }` shape and its explicit exclusion
   of `"idl0"` — should read as fulfilled, not contradicted.
4. §15a.5's `Time`/`Distance` synthesis paragraph against Task 6's actual
   diff to `synthesize_base_channels` — in particular, re-read the *real*
   pre-Task-6 code structure yourself
   (`core/src/session/synthesis.rs`, the lines around the channel-selection
   loop) rather than trusting `brief-task6.md`'s own description of "the
   existing bail-out guard below the selection loop." As of this brief's
   own read (2026-09-05, pre-Task-6), the actual early return is
   `let Some(time_source_idx) = time_source_idx else { return Vec::new();
   };`, immediately after the loop — a different shape than "a guard
   `if max_rate <= 0.0 || max_rate_len == 0`" alone would suggest, though a
   second, redundant check with that exact condition does also follow it.
   If Task 6's landed diff handled this differently than its own brief's
   literal wording implied (e.g. restructured both early-return points
   rather than "narrowing" one), that is not itself a defect — Task 6's
   own review is where correctness against the *ruling's intent* (Q2: fall
   back to the longest channel by sample count, `nominal_rate_hz` stays
   `0.0`) gets checked. Your job here is narrower: does §15a.5's *prose*
   still accurately describe what Task 6 actually shipped? If the prose
   and the code disagree on a fact (not just phrasing), report it as a
   SPEC drift finding.
5. §15a.2/§15a.3's GPS decimal-degree claims (R27) — spot-checked already
   in this lane's own R51 brief-refresh; re-confirm only if Tasks 6/7
   touched anything GPS-adjacent (they should not have).

## Step 4: Commit (docs half)

In the docs worktree, explicit paths:
```bash
git add CHANGELOG.md TASKS.md
git commit -m "docs: L2 importers complete -- CHANGELOG, TASKS (Task 8, formerly plan Task 7 per R51 Q2)"
```
Single line, no AI attribution trailer.

## Step 5: The lane merge gate (no commit)

In the idl-rs worktree, from Task 7's own commit, foreground, in order:
1. `cargo check -p idl-rs-cli --tests` — expect `Finished` clean (the L2
   four-task gate's own prior run took 21s from a warm target dir).
2. `cargo check -p idl-rs-tauri` — expect `Finished`, only pre-existing
   warnings (budget up to ~16 minutes cold, per the four-task gate's own
   precedent).
3. `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` — report every
   `test result: ok. N passed; ...` line verbatim, including the
   integration-test line if one appears (the four-task gate's own run
   showed a `real_session_odr_validation` integration test alongside the
   main `idl-rs` unit-test line — expect something similar, not
   necessarily identical).

Report the total passed count across all three commands' `test result`
lines (not just the last one), matching the L2 four-task gate's own
"Total 932, no OOM" reporting style.

## STATUS

State **PASS**, **FAIL**, or **KILLED** for the merge gate explicitly, as
its own line, separate from the docs commit's own success/failure. A
killed run (memory pressure from a concurrent, unrelated session — the L5
gate's own precedent) is reported as killed, not guessed at as pass/fail.

## Do not

- Do not tick `TASKS.md`'s L2 line as a bare `- [x] L2 importers` — the
  qualifier in Step 2 is mandatory, per the R50 lesson.
- Do not edit `docs/IDL0_SPEC.md` in this task — Step 3 is read-only,
  findings-only.
- Do not run `cargo test --workspace` or a bare `cargo test` anywhere.
- Do not run the merge gate in the background.
- Do not guess at Task 6/7's exact commit hashes, test counts, or any
  deviation they reported — read their own reports (or, if unavailable,
  `git log`/`git show` directly in the worktree) rather than inventing
  plausible-sounding specifics for the CHANGELOG entry.

## Style / hygiene

Single-line commit message, no AI attribution trailer; `git add` with
explicit paths only.

## Spec discipline (say it out loud in your report)

This task itself makes **no SPEC edit** — Step 3 is a findings-only pass.
State this plainly, and list every finding from Step 3 (the two known
mismatches plus anything else found) as its own itemised list in your
report, each tagged with whether it needs a lead-authorised SPEC edit now
or a separate follow-up task.

## Report back (concise)

CHANGELOG/TASKS commit hash + `git show --stat` (docs worktree); the
Naming-collision note (Step 1) as its own line; the three merge-gate
commands' full result lines and total passed count, plus the explicit
PASS/FAIL/KILLED status line; every Step 3 finding (confirmed-correct items
named as such, not just omitted); anything else ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing
— CLAUDE.md §1).

## Lead ruling 2026-09-05 (R60) -- scope widened to SPEC 15a edits

This task MAY and MUST edit `docs/IDL0_SPEC.md` section 15a in the idl1-app L2 worktree (`C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l2-importers`): (a) rename the deferred speed/heading follow-on from "Task 8" to "L2 follow-on S/H (post-archive)" everywhere it appears in 15a (leave the plan file alone unless you touch it anyway); (b) remove the `import_with_hook` residue in 15a.5 (killed by L2-R12; describe `import_file` per L2-R13 as landed in Task 6); (c) fix the "need new `parse_*`-prefixed rows" sentence -- the seven C3 section 2 rows exist and are `import_*`-prefixed. Docs commits go in the idl1-app worktree; idl-rs CHANGELOG/code in the idl-rs worktree, as the brief already says. Report each 15a passage before/after.

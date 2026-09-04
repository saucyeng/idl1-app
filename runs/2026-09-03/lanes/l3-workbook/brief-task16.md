# L3 Task 16 — implementer brief (lane close-out: full run, CHANGELOG, TASKS, BRIEF)

You are the implementer for L3 Task 16 of the idl1 rewrite — the lane's close-out.
One full test run, three documentation edits, one commit, then report. **No Rust
code changes at all.**

## Scope change you must read first (ruling R30)

**Ruling R30 (`runs/2026-09-03/decisions.md:1733-1743`) cut Task 13
(`migrate-workbook`) from wave 1**, and Task 14 keeps only its non-migration half.
The plan's CHANGELOG text (plan 1186–1193) claims `idl-rs migrate-workbook` and
"C2 §6 Stage 1" as delivered — **they are not, and must not appear under `Added`.**
Step 1 below gives the corrected wording. `_migrate_charts` / `_migrate_math`
(named in L3-R42's proposed CHANGELOG line) are likewise **not delivered** and are
dropped from it.

**Step 3 is PROVISIONAL** pending the lead's answer to Q5 in
`runs/2026-09-03/lanes/l3-workbook/questions.md` (the lane's Done-when (1) is
worded around migration parity, which R30 made unprovable; Task 15 Step 1 ships a
v3-vs-direct-evaluator parity test in its place). Write it as directed below; if
Q5 comes back differently, only the two "Done when" lines in the appended section change.

## Where
- Worktree (Step 0 only): `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 15 (given in the dispatch
  message), status clean. Verify first; if not, stop and report. Leave `.cargo/config.toml`
  alone. **Nothing in the worktree is edited or committed by this task.**
- Repo (Steps 1–3): `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`. **This task is the
  one deliberate exception to the standing "do not touch the idl1-app repo" rule**, and it
  is narrow: you may edit exactly three files —
  `CHANGELOG.md`, `TASKS.md`, `runs/2026-09-03/lanes/l3-workbook/BRIEF.md`. Do NOT touch
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` (shared checkout / submodule
  pointer), anything under `docs/`, any other worktree, or any other file. Do NOT push
  (CLAUDE.md §7 — Isaac pushes). The repo working tree currently holds unrelated modified
  and untracked files: commit with **explicit paths only**, never `git add -A`.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md` (§6, §7, §8);
  the L3 plan
  `docs\superpowers\plans\2026-09-03-idl1-wave1-l3-workbook.md` — `### Task 16` (1176–1210,
  superseded as above); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`, Task 16 section
  (G16.1–G16.3, **L3-R42**); ledger `runs\2026-09-03\decisions.md` — **R30** (migration cut),
  **R31** (cursor `null` outside the recorded span), **R25** (tile layout v2, contract batch 3,
  deferrals recorded), R13/§8 (compute rules). Existing state, verified while writing this brief:
  - `CHANGELOG.md:5-7` — `## [Unreleased]` → `### Added`; L1's entry (`CHANGELOG.md:19-38`)
    is the length and level of detail to match.
  - `TASKS.md:23` — `- [ ] L3 core workbook v3`, under `## Wave 1 (after M0)` (`TASKS.md:19`).
  - `runs/2026-09-03/lanes/l3-workbook/BRIEF.md` **already exists** (42 lines, written by
    the lead for this run). G16.3: **do not create or overwrite it.**

## COMPUTE RULES — non-negotiable
Step 0 is the lane's **one** full run, and it is the only cargo command this task runs:

    cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4

Run it in the worktree, foreground, once. Never `--workspace` (R13(c), L3-R27 — and a
PreToolUse hook denies it). No tarpaulin, no `cargo doc`, no `cargo fmt`, no `-j`. If a
test fails, **stop and report** — do not fix it here and do not rerun to hunt flakiness
(if the failure is one of the two known-flaky Windows timing tests, rerun that test alone
by name, once, and say so).

## The task

### Step 0: the lane's full run (L3-R42)
Run the command above in the worktree. Record the `test result:` lines and the total
`passed` count — they go in the report and in Step 3's appended section. This replaces
Task 15's forbidden `cargo test --workspace` (G16.1/G15.5).

### Step 1: `CHANGELOG.md`
Under `## [Unreleased]` → `### Added`, append one bullet after the L1 entry. Claim only
what landed; the plan's own text over-claims (see the scope note above) and L3-R42 drops
"a 69-function builtin catalog" (consumed unmodified, not added). Write:

```markdown
- **Workbook v3 (`.idl1wb`) lands in idl-rs core (L3, 2026-09-04).** Markdown/front-matter
  parsing and cell-id assignment (C2 §1–§2); the math-cell definition grammar with a flat,
  document-wide constants table and a deps-first resolver whose per-definition results are
  never swallowed (C2 §2.4, §3.1–§3.2); table-cell bodies wired onto the existing
  `table::model::TableModel` (C2 §4); Rust-side host-variable data for JS cells —
  `channel()`, `laps`, `session`, `constants` — and `${…}` inline-expression extraction
  (C2 §5); one evaluation result per cell (C3 §3.4); tile bytes at layout **version 2**
  with per-column stats and a per-column recorded `t_us` region, plus `MAX_TIER` as C3
  §3.5's "engine's configured range" (C3 §3.5); spectrogram and 2-D-histogram RGBA rasters
  with a `raster_meta` axis/colour-scale side-channel (C3 §3.6); cursor readout, `null`
  outside a channel's recorded span (C3 §3.7). Resolves the C1 §8 item 5 `t` naming
  collision (µs storage axis vs. seconds host-variable field). SPEC §17a rewritten for v3.
  Workbook migration from v2 (`migrate-workbook`, C2 §6) is deliberately **not**
  implemented — dropped from wave 1 by ruling R30; C2 §6 stays written and unimplemented.
```

Before committing, reconcile that bullet against what actually landed: read the lane's
commit subjects (`git log --oneline` in the worktree, Tasks 1–15) and **delete any clause
you cannot point at a commit for**. An over-claiming CHANGELOG is the failure mode this
step exists to avoid (G16.2). In particular, confirm against Task 14's landed diff whether
SPEC §17a's migration subsection (§17a.6) was written or dropped with R30, and keep only
"SPEC §17a rewritten for v3" either way.

### Step 2: `TASKS.md`
`TASKS.md:23`: `- [ ] L3 core workbook v3` becomes

```markdown
- [x] L3 core workbook v3 — complete; v2 workbook migration (C2 §6) dropped per R30; tier
  cache (design §4 L3 row) and Stage 2 chart conversion (L6) deferred
```

The parenthetical is required by L3-R42 — ticking the box without it reads as delivering
the tier cache and Stage 2, which no task built.

### Step 3: append to `BRIEF.md` (PROVISIONAL — Q5)
**Append** a `## Delivered` section to the existing
`runs/2026-09-03/lanes/l3-workbook/BRIEF.md`. Do not edit or delete lines 1–42 — the
header's Scope and Done-when predate R30 and R25, and correcting them in place is the
lead's call, not this task's (L3-R42). Say so in the first line of the appended section,
and cover:

- **Landed:** one line per task 1–15, task number + commit subject, from the worktree's
  `git log --oneline`.
- **Full-run result:** Step 0's command and its `passed`/`failed` totals, with the date.
- **Done when, as met:** (2) tile sample-region stats verified against `decimate_channel`
  at the unit level (Task 10 Step 4) and against a real evaluated math-cell result
  (Task 15 Step 2) — met. (1) migration parity is **not** met and cannot be: Task 13 was
  cut by R30. In its place, Task 15 Step 1 proves every v3 math-cell value equals a direct
  `math::evaluate` on the same expression against the same session, bit-for-bit. State
  this as the substituted criterion and cite Q5 in `questions.md` as the lead's open
  confirmation.
- **Functions L5 needs** (the header's list at `BRIEF.md:37-39` is stale — the signatures
  changed under R25/L3-R32/L3-R35/R31). Re-state it by **reading the landed signatures out
  of the worktree** (`core/src/tile.rs`, `core/src/raster.rs`, `core/src/cursor.rs`) and
  pasting them verbatim, each with its `file:line`. Expect roughly `tile::build_tile_bytes`
  (now taking `t_us`, layout v2), `tile::column_stats` / `tile::column_times_us`,
  `chart_decimation::MAX_TIER` (L5 validates `tier` against it *before* returning bytes),
  `raster::build_spectrogram_raster_bytes` / `raster::build_histogram2d_raster_bytes`
  (+ whatever `raster_meta` shape Task 11 landed), `cursor::cursor_readout` — but **verify
  every one against the source; do not copy this list.**
- **Deferrals, recorded not delivered:** tier cache (design §4 L3 row, line 187); Stage 2
  chart-slot → `plotForm` conversion (L6); v2 workbook migration (R30).
- **Open questions parked on defaults:** the lane's entries in `questions.md` and the
  ledger's open list (Q1 DSP nominal rate, Q3 migration report policy — now moot under R30,
  Q5 the substituted done-criterion).

### Step 4: Commit (idl1-app repo, one commit, explicit paths)
```
git add CHANGELOG.md TASKS.md runs/2026-09-03/lanes/l3-workbook/BRIEF.md
git commit -m "docs: L3 workbook v3 complete — CHANGELOG, TASKS, lane brief (migration dropped per R30)"
```
Single line, no AI attribution trailer. Do not stage `rust` (the submodule pointer) or any
of the repo's other pending changes. Do not push.

## Do not
- Do not run `cargo test --workspace` (plan 1168, and G16.1's missing gate) — Step 0's
  two-package form is the lane's only full run.
- Do not claim `migrate-workbook`, C2 §6 Stage 1, `_migrate_charts` or `_migrate_math` in
  the CHANGELOG (plan 1186–1193; L3-R42's draft line) — R30 cut them.
- Do not list "a 69-function builtin catalog" under `Added` (plan 1189) — it was consumed
  unmodified, not added (G16.2).
- Do not create or overwrite `BRIEF.md` (plan 1199–1204) — it exists; append only (G16.3).
- Do not tick `TASKS.md` without the deferrals parenthetical (L3-R42).
- Do not edit any Rust file, anything under `docs/`, the `rust` submodule pointer, or any
  repo file other than the three named.
- Do not fix a failing test found in Step 0 — stop and report it.

## Style / hygiene
Match `CHANGELOG.md`'s existing bullet style (bold lead sentence with a date, then a
semicolon-separated list of what landed with contract section refs — see `CHANGELOG.md:19-38`).
Wrap prose at the file's existing width. No `cargo fmt`.

## Spec discipline (say it out loud in your report)
"no spec change needed" — SPEC §17a was rewritten by Task 14; this task only records
shipped behaviour in `CHANGELOG.md`/`TASKS.md` and closes the lane brief (CLAUDE.md §6).

## Report back (concise)
Commit hash + `git show --stat` (idl1-app repo); Step 0's exact command and its
`test result:` lines with total `passed`/`failed`; any clause you deleted from the
CHANGELOG draft for lack of a commit to point at, and why; confirmation `BRIEF.md` was
appended to and lines 1–42 are unchanged (`git diff` shows additions only); confirmation
nothing migration-related is claimed as delivered; the L5 function list exactly as you
read it from the landed source, with `file:line`; anything ambiguous you resolved (say
how) or that needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

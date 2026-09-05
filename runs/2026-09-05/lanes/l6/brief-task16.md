# L6 Task 16 — implementer brief (SPEC section, CHANGELOG, TASKS, and the contract-amendment filing)

You are the implementer for L6 Task 16 of the idl1 rewrite — this lane's spec
discipline discharge (**spec-during**, CLAUDE.md §6): writing
`docs/IDL0_SPEC.md`'s new "Tab — Notebook" section, ticking `TASKS.md` only
if design §10's done-criteria genuinely hold, and filing every question this
lane got ruled on as **proposed** C2/C3 amendment text for the lead to apply.
This is also the lane merge gate. ONE commit, then report.

## Before anything else: verify Task 15 landed, and that this is genuinely the last task

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need a commit adding `Notebook/components/EditorPanes.tsx` and
`Notebook/components/CellFrame.tsx` (Task 15), and every task before it back
to Task 1. **If Task 15 is missing — STOP and report.** Read every prior
task's actual commit message and CHANGELOG bullet (`git log --oneline` plus
`git show <hash> -- ../CHANGELOG.md` for each) rather than assuming the
plan's task list matches what actually landed — this task's SPEC section and
parity-gap list must describe the **real** lane, including every deviation
a prior implementer reported (npm dependency confirmations, the `channel()`
shape settled by R52 Q2, the `Float64Array` fix from `review-task7.md`, the
inline-span best-effort reactivity from Task 13, N1/N3/N4's stub status from
Tasks 13–14, whatever `isSelfWrite` heuristic Task 14 actually landed).

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in this worktree. Do NOT touch the shared checkout, the `rust/`
  submodule, or any other worktree. Do NOT push.
- **This task DOES edit `docs/`** — it is the one exception in the whole
  lane, because it is the spec-discharge task the plan names explicitly
  ("spec-during — this is the task that discharges it").
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 16` and the **Parity gaps** table near the top
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`, lines
  163–200, 1019–1059); the plan's **Performance budget** section (lines
  126–162) — this becomes spec text, not just a review checklist; the plan's
  **IPC needs** and **Open questions** sections (lines 1061–1193); ruling
  R52 (`runs/2026-09-03/decisions.md`, search "R52") for every Q1–Q9
  resolution as ruled (your amendment filings restate these as **contract
  text**, they do not re-litigate them); R53 Data Q3 (the `selection` slice
  shape L6 reads); design §10's L6 row (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`,
  line 190) — the exact done-criteria you must check, not paraphrase:
  "Pan/zoom/hover on a real session at 60 fps desktop; `plotForm` round-trips
  its subset."
- **Look at `docs/IDL0_SPEC.md`'s current §25 and §26** before writing —
  read both in full so your replacement text is a genuine supersession, not
  a guess at what they currently say. Also skim L5's §11 rewrite (find it by
  `git log --oneline -- docs/IDL0_SPEC.md` on `main`) as the stated precedent
  for "this is a first draft; L10's cross-lane pass runs after L7 also
  lands" phrasing.

## The App.tsx shim deletion — NOT this task's file edit

Per the operating brief and this lane's Task 1, `App.tsx` is lead-owned. The
plan's Task 16 file list names deleting `app/src/routes/pages/NotebookPage.tsx`
(the Task 1 re-export shim) "paired with the lead's one-line `App.tsx`
import change applied as a shell task at the merge gate." **This task does
NOT edit `App.tsx` and does NOT delete the shim itself** — both happen
together, in one lead-owned shell task, at the lane merge, after this task's
commit lands. State this explicitly in your report so the lead knows exactly
what shell-task diff to apply (`App.tsx`'s import changes from
`./routes/pages/NotebookPage` to `./routes/pages/Notebook`, and
`NotebookPage.tsx` is deleted, in the same commit).

## The task

**Files:**
- Modify: `docs/IDL0_SPEC.md` (§25, §26), `CHANGELOG.md`, `TASKS.md`
- Create: `runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md`

**Spec discipline:** **spec-during — this is the task that discharges it.**

- [ ] **Step 1: Rewrite `docs/IDL0_SPEC.md` §26 as "Tab — Notebook"**

  Cover, as the plan directs: the cell kinds (prose/math/table/js) and how
  each renders (cite the actual components Task 13 built); the two editing
  panes (Properties/Code) and the custom-code rule (parse returns null →
  grey + Reset to form, verbatim from design §6 and as Task 12 actually
  implemented it); the interaction rules and point budget (restate this
  plan's Performance budget P1–P8 as spec prose, in the SPEC's own voice, not
  a pasted table); the sandbox boundary and what the cell API exposes
  (`channel`, `laps`, `session`, `constants`, `Plot`, `d3`, `Inputs`, `html`
  — per C2 §5.1, and the settled `channel()` return shape from R52 Q2 —
  array of `{t, v}` records, not the originally-proposed `{length, t, v}`
  SoA object); what a conflict looks like to the user (Task 14's
  `ConflictBanner`, reload-or-overwrite, with the honest note that the
  per-cell merge is L11's, not yet built).

  Replace §25 (*Tab — Maths*) with a two-line pointer to §26 — idl1 has no
  separate maths tab, math cells live in the notebook.

  State explicitly, as L5's §11 rewrite did: this is a **first draft**;
  L10's cross-lane consistency pass over the app-side SPEC parts runs after
  L7 also lands.

- [ ] **Step 2: Write the parity-gap list into the SPEC section**

  Port the plan's "Parity gaps" table (every idl0 Analyze/Maths feature not
  delivered, with its reason) into §26 itself — a reader asking "where did
  the FFT chart go" must find the answer in the spec, not only in a plan
  file under `docs/superpowers/plans/`. Update any entry a later ruling
  changed since the plan was written (e.g. if Q7/Q8's status moved) —
  cross-check against R52 before transcribing verbatim.

- [ ] **Step 3: File the contract-amendment text**

  `runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md` — **proposed** text only,
  for the lead to apply; this lane never edits a contract directly. For
  every question R52 ruled that produces contract text, write the exact
  diff-ready wording:
  - **C2 §5.1 amendment (R52 Q2).** `channel()`'s documented return shape
    changes from `{length, t, v}` (SoA) to an array of `{t, v}` records,
    materialized inside the sandbox from the two transferred buffers; C2
    §5.3's grammar (`x: "t", y: "v"` as literal field-name strings) is
    **unchanged** — only the object `channel()` returns changes. Cite the
    actual landed `materializeHostVar`/`channelLookup` code (Task 5,
    `sandbox/main.ts`) as the reference implementation.
  - **C3 §3.4 amendment, `read_workbook` (N1, R52 Q4).** The exact
    `read_workbook(id) → { markdown, hash, path }` signature and error kinds
    from `runs/2026-09-05/lanes/l6/IPC-NEEDS.md`'s N1 entry — confirm against
    that file rather than re-deriving from memory, then state its **current
    status**: landed, or still a stub, as of this task's commit (check
    `app/src/ipc/workbook.ts` yourself; do not assume the plan's IPC-needs
    list is still accurate).
  - **C3 §3.4 amendment, `eval_workbook`'s `lap_context` (N4, R52 Q5).** The
    exact additive `lap_context: { main_lap, overlay_laps[] } | null`
    argument, and its current status (landed or still absent — check
    `evalWorkbook`'s real signature in `app/src/ipc/workbook.ts`).
  - **C3 §3.4 amendment, the host-channel byte path (N3, R52 Q6).** The
    layout L6 designed (per `IPC-NEEDS.md`'s N3 table — magic `IDLH`,
    version, flags, length, t_length, reserved, then `t`/`v` as `f64`
    arrays) — restate it here as the proposed contract text verbatim, since
    C3 has not yet absorbed it, and its current implementation status
    (almost certainly still unimplemented — this lane cannot touch `rust/`).
  - **C3 §3.6 amendment, FFT (N5, R52 Q7 → in).** If the Rust write-amendment
    lane has not yet added `fetch_fft`, restate N5's proposed signature from
    `IPC-NEEDS.md` here as still-pending; if it has landed, say so and this
    entry becomes informational only (no amendment left to file).
  - Any other question this lane surfaced as a genuine ambiguity during
    Tasks 9–15 that a prior task's report flagged as "needs a lead ruling" —
    check every prior task's report/commit for one before assuming R52's
    list is exhaustive; a lane running eight more tasks after the plan was
    adjudicated may have surfaced something R52 didn't anticipate (e.g.
    Task 14's `WorkbookEvent`-has-no-hash finding, if it was in fact real —
    confirm from Task 14's actual commit/report rather than assuming).

  For each entry, state plainly: proposed text, current implementation
  status, and which C2/C3 section it amends. This file is **read by the
  lead**, not applied by this task.

- [ ] **Step 4: `TASKS.md`**

  Tick `L6 notebook UI` **only if both** design §10 done-criteria hold:
  1. Pan/zoom/hover on a **real** session at 60 fps desktop — this must be
     **observed in the running dev app**, not inferred from passing unit
     tests (the L5 lesson, explicitly named in the plan). If you cannot run
     the dev app from within this task's scope (no cargo, and the app needs
     a Tauri build to run as a desktop app — check whether the lead's own
     merge-gate eyeball pass is the actual point this gets observed, per the
     operating brief's "the lead merges to `main` and eyeballs the tab in
     the running dev app"), **do not tick the line yourself** — leave it
     unticked and say explicitly in your report that this criterion is
     observed at the lead's merge-gate eyeball pass, not by this task, per
     the operating brief §4's own sequencing ("per UI lane merge: ...then
     the lead merges and eyeballs the tab").
  2. `plotForm` round-trips its subset — Task 3's exhaustive
     generator-based test. This one **is** checkable from this task: confirm
     it's still passing as part of Step 5's whole-suite gate below.

  If either does not hold (or criterion 1 is genuinely not observable from
  this task's position, per above), say which and leave the line unticked
  (R50's precedent) — do not tick speculatively.

- [ ] **Step 5: Gate**

  ```
  npx tsc --noEmit && npx vitest run
  ```
  This is also the **lane merge gate** (whole TS suite, no filter). Report
  the exact `passed`/`failed` counts. A `0 failed` with a non-zero `passed`
  count is required; if anything fails, this is not a "fix it yourself and
  keep going" situation for a cross-cutting failure outside this task's own
  files — STOP and report which test(s) fail and in which prior task's
  module, since Task 16 is documentation/wrap-up and should not be silently
  absorbing a real regression from an earlier task.

- [ ] **Step 6: Commit**

  ```
  git add ../docs/IDL0_SPEC.md ../CHANGELOG.md ../TASKS.md runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md
  ```
  (paths relative to the worktree root, not `app/` — `docs/IDL0_SPEC.md`,
  `CHANGELOG.md`, `TASKS.md`, and `runs/` all live above `app/` in this
  repo's layout; adjust the exact relative paths to match where you're
  running `git add` from, and confirm with `git status` before committing
  that nothing under `app/src/` is staged by this commit — Task 16 touches
  no application code)
  Message, single line, no AI attribution trailer:
  ```
  docs: SPEC §26 Tab -- Notebook; L6 lane wrap-up
  ```

## Do not

- Do not edit `App.tsx` or delete `NotebookPage.tsx` — that shim deletion is
  a lead-owned shell task paired with the `App.tsx` import change, applied
  at the merge, not by this task.
- Do not tick `TASKS.md`'s `L6 notebook UI` line based on unit tests alone
  for the 60 fps desktop pan/zoom/hover criterion — that needs the running
  dev app, which this task cannot itself launch (no cargo, no Tauri build in
  a UI worktree).
- Do not apply any of `CONTRACT-AMENDMENTS.md`'s proposed text to
  `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` or
  `...-c3-ipc-surface.md` yourself — this lane never edits a contract
  (operating brief §3). The file is a proposal for the lead.
- Do not silently reconcile a whole-suite gate failure that traces to a
  prior task's module — report it instead of patching another task's file
  from within this one (that would be editing outside this task's own scope
  without a fresh brief).
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Prose sections in `docs/IDL0_SPEC.md` follow the existing document's voice
and heading style (check a couple of neighbouring sections before writing);
`CONTRACT-AMENDMENTS.md` uses the same "proposed text / status / section"
structure for every entry so the lead can scan it uniformly.

## Report back (concise)

Commit hash + `git show --stat`; the exact whole-suite gate command and
result line (`passed`/`failed` counts); which of design §10's two
done-criteria you ticked, which you left unticked and why (be precise about
the 60fps-observation criterion's status); the full list of contract
amendments filed in `CONTRACT-AMENDMENTS.md` with each one's current
implementation status (landed vs. still-stubbed) as you found it by reading
the actual `app/src/ipc/workbook.ts` at this commit; explicit confirmation
`App.tsx`/`NotebookPage.tsx` were untouched by this commit and a one-line
statement of exactly what shell-task diff the lead needs to apply at merge;
anything ambiguous you resolved (say how) or that needs a lead ruling (stop
and report instead of guessing — CLAUDE.md §1).

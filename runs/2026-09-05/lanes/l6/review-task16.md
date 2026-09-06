# Review — L6 Task 16 (SPEC §26 Tab — Notebook; lane wrap-up)

**Commit reviewed:** `774066e13014f19f81f0af05b55e31a770635648` on branch
`wave2-l6-notebook`, worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`.

**Files touched:** `CHANGELOG.md`, `TASKS.md`,
`app/src/routes/pages/Notebook/model/editorEcho.ts`, `docs/IDL0_SPEC.md`,
`runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md` (new).

**Test command:** none run — dispatch marked this review read-only ("run
nothing"); the lane's whole-suite gate (78 files / 590 tests) already passed
before this review per the dispatch message. No test command executed.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Major | `app/src/routes/pages/Notebook/model/editorEcho.ts:1-8` | Task 16's own brief (`runs/2026-09-05/lanes/l6/brief-task16.md`) lists exactly four files this task may touch: `docs/IDL0_SPEC.md`, `CHANGELOG.md`, `TASKS.md`, and the new `CONTRACT-AMENDMENTS.md`. This commit also edits `editorEcho.ts`'s doc comment (correcting a wrong citation of ruling R74 — confirmed wrong: R74 (`decisions.md:3410`) is about `CellList`'s per-cell `frame` hook, unrelated to `isEditorEcho`) to instead cite "Task 15's own brief." The correction itself is accurate (Task 15's brief, `brief-task15.md:83-89`, does ask for a loop-avoidance mechanism and says nothing about R74), but it is an undisclosed scope deviation: unlike R74's own precedent ("a brief's file list is scope guidance … the deviation is named in the commit message"), this commit's message (`docs: SPEC §26 Tab -- Notebook; L6 lane wrap-up`) and its `CHANGELOG.md` bullet say nothing about touching `app/src/`, and the brief's step 6 explicitly asks the implementer to "confirm with `git status` … that nothing under `app/src/` is staged." | Name the `editorEcho.ts` fix in the commit message/CHANGELOG bullet (one clause), matching the disclosure standard the lane itself set with R74. |
| Note | `docs/IDL0_SPEC.md:3324` (Controls table, elsewhere in the SPEC) | Broken/silently-wrong cross-reference not in the implementer's own disclosed list. The Controls section still reads "mirrors `kDefaultChartBindings` + `wheelModeFor`, §26.7" — §26.7 used to be "Chart context menu" (default keybindings); it is now "IPC needs this tab is standing on," an unrelated section. This is worse than a reference to a since-deleted number (which at least renders as obviously wrong) because §26.7 exists, so a reader following it lands on the wrong content with no signal anything is off. The implementer's CHANGELOG bullet names `§26.8`, `§26.11`-`§26.13` as the known gap but does not mention this one. | Add `§26.7` (Controls-table sense) to the known-gap list, or leave for L10 but note the semantic (not just numeric) mismatch so L10's pass knows to check meaning, not just existence. |
| Note | `docs/IDL0_SPEC.md:1067,1375,2111,2147,2187,2213` | Confirmed as the implementer's own disclosed cross-reference gap (§26.8, §26.11, §26.12, §26.13, referenced from §21/§26.11-context/§19-area text that predates this rewrite) — verified these six call sites still exist and still point at now-removed subsections. Correctly out of this task's declared scope (§25/§26 only) and correctly deferred to L10, as CLAUDE.md §6 and the brief allow. No fix required from this task; recorded here only to confirm completeness of the implementer's own disclosure (mostly complete — see the Note above for the one omission). | None (informational; L10's job). |

## Verification detail

**§26 claims spot-checked against the landed code (ten+):**
1. `channel()` returns `{t, v}[]`, not `{length, t, v}` — confirmed at `sandbox/main.ts`'s `materializeHostVar` (builds `records: {t,v}[]`) and `channelLookup`'s return type `{ t: number; v: number }[]`. Matches SPEC §26.4 and `CONTRACT-AMENDMENTS.md` entry 1.
2. `read_workbook` (N1) still a stub — confirmed: `app/src/ipc/workbook.ts` exports only `openWorkbook`/`evalWorkbook`/`saveWorkbook`/`watchWorkbook`; `Notebook/ipcStubs/readWorkbook.ts` throws `NotImplementedError` unconditionally; `index.tsx` imports the stub, not the real wrapper.
3. `eval_workbook`'s `lap_context` (N4) absent — confirmed: `evalWorkbook(id: string, sessionId: string | null)` has no third parameter; `index.tsx` reads `AppState.selection.lapContext`, discards it via `void lapContext;`, and marks the call site `// TODO(idl0): thread lapContext into evalWorkbook's call below once N4 lands`. Matches SPEC §26.6/§26.7 and `CONTRACT-AMENDMENTS.md` entry 3 exactly.
4. `fetch_host_channel` (N3) — confirmed zero call sites/stubs anywhere in `app/src` (`fetch_host_channel`, `fetchHostChannel`, `IDLH` all grep-empty). Matches §26.7's claim of "no call site at all yet, stub or otherwise."
5. `fetch_fft` (N5) — confirmed zero call sites/stubs. R52 Q7 (`decisions.md:2580`) does rule FFT "in" for wave 2; the CONTRACT-AMENDMENTS entry correctly states this lane built no consumer for it, consistent with N5 blocking on the (still-absent) Rust command.
6. Settle constant — confirmed `CURSOR_SETTLE_MS = 150` in `model/cursorReadoutDriver.ts`, matching §26.3's "150 ms, ruling R62" claim.
7. `CellList`'s `frame?:` hook — confirmed present at `components/CellList.tsx:61`, signature matches §26.1's description and R74's ruling text.
8. `plotForm.generate`/`.parse` round-trip claim (§26.2, done-criterion 2) — Task 3's exhaustive generator-based test is real (referenced consistently across CHANGELOG history); not independently re-run per the read-only dispatch, but the TASKS.md bullet's phrasing ("passes as part of Task 16's whole-suite gate") is consistent with the dispatch's own statement that the whole-suite gate (590 tests) already passed.
9. §25 replacement — confirmed reduced to a two-line pointer ("idl1 has no separate Maths tab… see §26"), as the brief required.
10. `App.tsx`/`NotebookPage.tsx`/`rust/` submodule — confirmed untouched by this commit (`git show 774066e --stat` lists only the five files above; no `App.tsx`, no `rust` pointer change). Matches the report's explicit statement and the operating brief's shell-task split.
11. `WorkbookEvent`/prose-HTML "already ruled, not re-filed" entries (CONTRACT-AMENDMENTS §6) — confirmed `WorkbookEvent` interface has no `hash` field, and `WorkbookEventWithHash`/`isSelfWrite`'s "missing hash ⇒ reload" behavior exists in `saveFlow.ts`; confirmed `CellOutput`/`ProseSpan.tsx` still use the interim TS regex scanner, not `prose_spans`.

**Parity-gap table (§26.6) vs. old §25/§26 content:** every idl0 Analyze/Maths
feature identified by diffing the removed text against the new table is
accounted for with a stated reason (FFT chart, 1-D histogram, scatter
point-cloud, GPS basemap, lap table Main/Overlay, lap progression/variance
chart, x-axis modes, worksheets, several per-chart cosmetic fields, non-linear
y-scale variants, the Maths chip editor, math-channel metadata bar, unit
inference, expression live preview, Drive sync, per-axis zoom/context menu,
workbook migration Stage 2, mobile paper view). No idl0 feature found dropped
silently — the "Delivered in wave 2" summary list is also consistent with
what Tasks 1-15's SPEC-relevant claims describe.

**Cross-reference audit (item 3 of the dispatch):** full list of `§26.`
references in the SPEC outside the new §26 body: lines 1067, 1375, 2111 (×2),
2147, 2187, 2213, 3324. The first six point at now-removed subsections
(§26.8, §26.11, §26.12, §26.13) and are disclosed in the CHANGELOG bullet.
Line 3324 (§26.7, Controls table) is not disclosed — see the Note finding
above; it is a semantic drift rather than a dangling number, so a grep for
"does this section number still exist" would not catch it. Both are
appropriately Note-severity per the dispatch's own framing (informational
for L10, not blocking this gate).

**CONTRACT-AMENDMENTS.md vs. already-ruled contract state:** entries 1-5 are
each consistent with R52's rulings and do not re-propose anything the ledger
or L8w's landed commands already settled; entry 6 correctly declines to
re-file `WorkbookEvent.hash` (R67) and the prose-HTML fields (R70), citing
their existing ledger text instead of duplicating it. Entry 5 (`fetch_fft`,
N5) plainly states R52 Q7 ruled FFT in for wave 2 and that no L6 task built a
consumer — accurate and undersold rather than oversold.

**TASKS.md / CHANGELOG:** the `L6 notebook UI` line is left unticked with an
honest, specific account of both design §10 done-criteria (one passing as
part of the gate, one deferred to the lead's dev-app eyeball pass per R50
precedent) and a correct summary of N1/N3/N4 status. `CHANGELOG.md`'s bullet
is long but accurate against the diff and the code as verified above,
including its own disclosed cross-reference gap (albeit incomplete by one
entry, per the Note finding).

## Verdict rationale

The SPEC section's claims all check out against the landed code — every
sampled assertion (channel shape, IPC stub/absent status, the 150 ms settle
constant, the frame hook, App.tsx/rust untouched, the already-ruled
contract entries) matches what is actually in the tree, and the parity-gap
table omits nothing found by diffing old §25/§26 against the new text. The
one Important finding is a process violation, not a content error: an
undisclosed edit outside the task's declared file list, made worse by the
fact that this exact lane already has a written precedent (R74) requiring
disclosure of exactly this kind of deviation in the commit message. The two
Note findings are appropriately low-severity, cross-reference completeness
gaps explicitly deferred to L10 by the operating brief and CLAUDE.md §6 —
one of the six broken references was simply missed in the implementer's own
otherwise-accurate disclosure. None of these rise to blocking the merge gate
this task also constitutes; the whole-suite gate already passed per the
dispatch, and no code path changed here.

VERDICT: FINDINGS 0 Critical, 1 Major, 2 Minor

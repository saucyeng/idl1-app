# L6 Task 12 review — Properties pane over plotForm

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `186d499` ("app: Properties
pane over plotForm, self-contained for wave 3's node host"). In scope: that
commit's diff only (`CHANGELOG.md`, `PropertiesForm.tsx`,
`PropertiesForm.types.ts`, `model/propertiesForm.ts` +
`model/propertiesForm.test.ts`, `plotForm/types.ts`, `plotForm/parse.ts`).

Out of scope, explicitly per dispatch: at review time the worktree's working
tree carried uncommitted edits to `PropertiesForm.tsx`,
`PropertiesForm.types.ts`, `model/propertiesForm.ts`, and
`model/propertiesForm.test.ts` (the R65 unit-suggestion follow-up landing
mid-review). These were ignored; the gate below was run against `186d499` in
a disposable detached worktree (`git worktree add -d`), not against the
dirty working tree, so the follow-up work does not contaminate this
commit's result.

## Gate command and result

Run from a disposable worktree at `186d499` (node_modules junctioned from
the reviewed worktree, no install):

```
npx tsc --noEmit && npx vitest run --coverage --coverage.reporter=json-summary src/routes/pages/Notebook/plotForm src/routes/pages/Notebook/model/propertiesForm.test.ts
```

Result: `tsc` silent (no errors). Vitest: `Test Files 4 passed (4)` /
`Tests 49 passed (49)`. This reproduces the implementer's reported
27 (plotForm) + 22 (propertiesForm) = 49 passed. Coverage summary for
`model/propertiesForm.ts`: `lines: 34/34, pct: 100`, matching the reported
100% line coverage. `coverage/` deleted after.

Also ran `npx vite build` from the same disposable worktree: built cleanly
(773 modules, no errors, only the pre-existing >500kB chunk-size warning
unrelated to this task). `dist/` deleted after.

Both the disposable worktree and its `node_modules` junction were removed
(`git worktree remove --force`) after the runs; the reviewed worktree and
the shared checkout were never touched.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `PropertiesForm.tsx:262-263` (`MarkRow`'s prop type) | `channels`/`laps` are redeclared inline as `{ id: string; label: string }[]` / `{ number: number }[]` instead of importing `PropertiesFormChannelOption`/`PropertiesFormLapOption` from `PropertiesForm.types.ts`. Structurally identical so no behavioural risk, but it's a second copy of the same shape in the same file the component's own types file defines. | Import and reuse the two exported interfaces in `MarkRow`'s prop type. |

No Critical or Important findings.

## Checks performed (all pass)

- **R65 axis-label suggestion absence excused.** Per the dispatch and
  `runs/2026-09-03/decisions.md` R65, the implementer correctly stopped
  (CLAUDE.md §1) rather than guessing when it found `channels` carries no
  quantity metadata to key C2 §3.4's unit table on. The commit's doc
  comments (`PropertiesForm.tsx`'s file-level comment and
  `PropertiesForm.types.ts`'s `unitsPreference` doc) state this plainly and
  point at the report/ruling rather than silently shipping a half feature.
  Confirmed this is explicitly out of scope for this review per the
  dispatch — not treated as a finding.
- **Self-contained prop surface.** `git show 186d499` for
  `PropertiesForm.tsx`, `PropertiesForm.types.ts`, and `model/propertiesForm.ts`
  greps clean for `useContext`, `invoke(`, `AppState`, `document.`,
  `window.`, `localStorage` — no context/store/IPC/router/DOM-global access
  anywhere in the new code. `PropertiesFormProps` has exactly the five
  specified fields (`code`, `channels`, `laps`, `unitsPreference`,
  `onChange`), no more.
- **Ownership.** `git show --stat 186d499` touches only
  `CHANGELOG.md` and four new files under
  `app/src/routes/pages/Notebook/**`, plus the two small, in-scope diffs to
  `plotForm/parse.ts`/`plotForm/types.ts` (the `MARK_NAMES` dedupe). No
  `package.json`/`package-lock.json` touch — no new dependency. Single
  commit, single-line message, no AI attribution trailer.
- **Thin component / pure logic module split.** `PropertiesForm.tsx` only
  wires DOM events to `model/propertiesForm.ts` functions
  (`advanceFormState`, `addMark`/`removeMark`/`updateMark`/`moveMark`,
  `updateXAxis`/`updateYAxis`, `setColorLegend`, `resetToFormCode`) plus
  `plotForm`'s `generate`; it holds no independent props-mapping or
  dirty-detection logic of its own. `propertiesForm.ts` is React-free (no
  `react`/DOM import) and covered 100% by `propertiesForm.test.ts`.
- **`parse(code) === null` ⇒ greyed custom state with a real confirm step.**
  `PropertiesForm.tsx`'s render branch on `view.isCustom || view.props ===
  null` shows "Custom code" and a "Reset to form" button; clicking it sets
  `confirmingReset` and renders an explicit warning
  ("Resetting to form will discard this custom code. This can't be undone.")
  with separate "Discard custom code and reset" / "Cancel" buttons —
  `handleResetConfirmed` (the only thing that calls `onChange`) fires only
  from the former, never automatically. This is a genuine two-click
  confirm, not a silent overwrite, matching the brief's Step 1.
- **Reset fallback chain.** `resetToFormCode(lastKnownProps, channels)` is
  `generate(lastKnownProps ?? defaultPlotProps(channels))` — proven directly
  by `propertiesForm.test.ts`'s two `resetToFormCode` tests (with and
  without `lastKnownProps`) and by `advanceFormState`'s tests confirming
  `lastKnownProps` survives a run of custom-code renders rather than being
  cleared. `defaultPlotProps` seeds `channels[0]?.id ?? ""` with mark
  `lineY`, matching C2 §5.3's "the form always seeds one [mark]" and never
  producing a value `generate` cannot render (tested for both the
  channel-available and no-channel cases).
- **Round-trip: every edit commits `generate → onChange(code)` and
  re-parses cleanly.** Every control handler in `PropertiesForm.tsx`
  (`MarkRow`'s channel/mark/scope/stroke/strokeWidth pickers, the x/y axis
  label and domain fields, the y-scale select, the colour-legend checkbox)
  routes through the single `commit(nextProps) { onChange(generate(nextProps)); }`
  path — no control ever calls `onChange` with a hand-built string. On the
  next render, `code !== prevCode` triggers `advanceFormState`, re-deriving
  `view` from the freshly generated code; since `generate`'s output is
  always inside the subset its own `parse` recognises (Tasks 2–3, unchanged
  by this commit), this reparse succeeds and the pane reflects the same
  props that were just committed — no drift between what the form shows
  and what the code says.
- **State-adjustment-during-render is the React-sanctioned pattern and free
  of render loops.** `PropertiesForm.tsx`'s `if (code !== prevCode) {
  setPrevCode(code); setState(...) }` matches React's own documented
  "adjusting state when a prop changes" pattern (calling `setState`
  unconditionally guarded by a comparison, during render, not in an
  effect). `code`/`prevCode` are plain strings compared by value (`!==` on
  primitives), so a re-render with an unchanged string value never
  re-triggers the branch even if the parent passes a new string object each
  time — no possible infinite loop from this pattern as written. Checked
  specifically for the tightened IPC-effect rule in the standing brief: this
  component starts no IPC/postMessage work in an effect at all (no
  `useEffect` in the file), so that rule doesn't apply here.
- **`MARK_NAMES`/`Y_AXIS_TYPES` dedupe.** `plotForm/types.ts` gains the two
  exported runtime arrays; `plotForm/parse.ts`'s previously-local
  `MARK_NAMES` constant is deleted and the import switched to the shared
  one (`import { MARK_NAMES, type MarkProps, ... }`) — single source, no
  drift risk. `PropertiesForm.tsx`'s `MarkRow` mark-type `<select>` and the
  y-scale `<select>` both map over these same exports rather than a second
  hardcoded list. Confirmed the reported 27 (plotForm) tests still pass
  unchanged (see gate above) — the dedupe did not alter `parse.ts`'s
  behaviour, only where the constant is declared.
- **Domain fields commit only a full `[min, max]`.** `DomainFields` only
  calls `onChange` with a `[number, number]` once both min/max text fields
  hold a finite number, or `undefined` when either is cleared — never a
  half-specified single bound, matching `XAxisProps.domain`/
  `YAxisProps.domain`'s `[number, number]` type. This is the brief's
  accepted judgment call (dispatch note), not re-litigated here.
- **Doc comments.** Every exported symbol in `PropertiesForm.types.ts` and
  `model/propertiesForm.ts` carries a doc comment; numeric fields note units
  where applicable (`strokeWidth` in px, domain values in the channel's
  native unit, per the brief). `PropertiesForm.tsx`'s file-level comment
  documents the component's contract and the R65 gap.
- **Tests.** `propertiesForm.test.ts`'s 22 tests are named
  `thing — condition — result` and structured Arrange (module-level
  `ONE_MARK`/`ONE_MARK_PARSED` fixtures or a local `const`) / Act / Assert
  with blank lines separating sections; each asserts behaviour specific to
  its name (e.g. the two `removeMark`/`updateMark`/`moveMark`
  out-of-range tests assert reference equality, `toBe(ONE_MARK)`, proving a
  true no-op rather than merely an unchanged-by-value result). No
  `PropertiesForm.test.ts` was added, per the brief's explicit instruction
  and CLAUDE.md §4 (UI rendering not unit-tested) — the commit message
  states this is deliberate.
- **CHANGELOG.** The added bullet is byte-for-byte the line specified in
  the task brief's Step 4.
- **No cargo invocation** anywhere in the commit or in this review.

## Verdict rationale

The commit does exactly what the brief specifies: a thin `PropertiesForm.tsx`
over a pure, 100%-covered `model/propertiesForm.ts`, a five-field prop
surface with no context/store/IPC, a genuinely two-step "Reset to form"
confirm, a fallback chain proven by tests down to the never-parsed case, a
render-time re-parse pattern that is the correct React idiom and provably
loop-free, and a clean dedupe of the two runtime constant arrays that
leaves the plotForm suite's count unchanged. The one finding is cosmetic
(an inline type duplicate in `MarkRow` that happens to already match its
own types file) and would not change behaviour if left as is. The
documented absence of an axis-label suggestion is a stopped-and-reported
ambiguity resolved by ruling R65, not a defect in this commit's scope.

VERDICT: CLEAN

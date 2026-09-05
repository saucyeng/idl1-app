# L6 Task 12 — implementer brief (the Properties pane — a self-contained form over `plotForm`)

You are the implementer for L6 Task 12 of the idl1 rewrite — the Properties
form component that generates and parses `plotForm` code, built with a fully
self-contained prop surface because wave 3's React Flow graph view re-hosts
this exact component inside a node. No new pure module logic — `plotForm`
(Tasks 2–3) is already the whole logic surface; this task is the component.
ONE commit, then report.

## Before anything else: verify Task 11 landed

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
git log --oneline -20
```

You need a commit adding `Notebook/model/mathMode.ts`,
`Notebook/model/functionCatalog.ts`, `Notebook/components/CodePane.tsx`
(Task 11). **If it is missing — STOP and report.** This task does not import
Task 11's exports, but the lane is strictly sequenced in one worktree — if
HEAD isn't Task 11's commit, something is out of order.

Also read, before writing anything:
- `Notebook/plotForm/index.ts`, `types.ts`, `generate.ts`, `parse.ts` (Tasks
  2–3) — this task's **entire** logic surface. Read `parse.ts`'s doc comment
  on what `null` means (custom code) and `types.ts`'s `PlotProps`/
  `MarkProps`/`XAxisProps`/`YAxisProps` field-by-field; this form's controls
  are a one-to-one mapping onto those fields, nothing more, nothing less.
- C2 §3.4 "Unit table" (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
  lines 440–477) — the axis-label suggestion source under `unitsPreference`.
- Design §6's Properties-pane paragraph, quoted below — the custom-code
  greying and "Reset to form" behaviour is design-mandated, not this task's
  invention.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. Status clean before starting.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.**

## The binding constraint (design §6, verbatim)

> **Editor — Properties + Code (D13).** Every chart cell's source of truth is
> its code. The *Properties* pane is a form (channels, lap/session scope,
> mark type, axes and domains, colours, y-scale, units) that **generates
> idiomatic Plot code** and **parses back the subset it generates** plus
> literal edits — bidirectional inside that subset. Code outside it (computed
> values, custom D3 marks) greys the pane to *custom code* with a *Reset to
> form* that regenerates from the last known props and warns that custom
> code will be discarded. The `plotForm` module (`parse(code) → props |
> null`, `generate(props) → code`) is a pure, heavily-tested TypeScript
> unit.

And the operating brief's own binding call (2026-09-05, Isaac): "the React
Flow graph view is wave 3 and **hosts the same Properties form component
inside a node** — React Flow ships no property inspector, so the form is
built once and re-homed later. Two editing surfaces, not three." This is why
`PropertiesFormProps` below has **no** context, store, IPC, or router access
— every value it needs must arrive as a prop, or wave 3's re-homing breaks.

## Interfaces (from the plan, Task 12)

```ts
interface PropertiesFormProps {
  code: string;                                 // the cell's current code
  channels: { id: string; label: string }[];    // available channel/definition names
  laps: { number: number }[];
  unitsPreference: "si" | "imperial";           // C2 §1, label suggestion only
  onChange(nextCode: string): void;             // generate() output
}
```
Consumes `plotForm/` only.

## The task

**Files:**
- Create: `Notebook/components/PropertiesForm.tsx`,
  `Notebook/components/PropertiesForm.types.ts`

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Implement the form**

  Call `parse(code)` on every render (not on mount only — the code prop can
  change from an external edit in the Code pane, and the form must reflect
  that, per design §6's "bidirectional inside that subset").

  - **Non-null** → populate every control from the returned `PlotProps` and
    enable them.
  - **Null** → the pane **greys out**, shows "custom code", and shows a
    **"Reset to form"** button. Clicking it regenerates from **the last
    known props** — component state (e.g. `useState<PlotProps | null>`)
    seeded the last time `parse` succeeded on this cell — and **warns that
    the custom code will be discarded** before calling `onChange(generate(
    lastKnownProps))`. If `parse` has never once succeeded for this cell
    (e.g. the cell started as hand-written custom code), "last known props"
    falls back to **the default single-mark props the form always seeds**
    (C2 §5.3: "the form always seeds one") — do not leave "Reset to form"
    disabled or a no-op in that case; it must produce *something* generatable
    rather than silently doing nothing.

  Controls, one per grammar production in `types.ts`:
  - Mark list: add/remove/reorder, channel picker (from `channels` prop),
    mark type (the five names `plotForm`'s grammar admits — read them off
    `MarkProps.mark`'s union type, don't hardcode a list that could drift),
    lap scope (from `laps` prop, or "session" for `null`), stroke colour,
    stroke width.
  - X axis: label, domain (two numbers).
  - Y axis: label, domain (two numbers), type (`linear`/`log`/`sqrt`).
  - Colour legend toggle.

  Axis-label suggestions: when a channel is picked for a mark (or the first
  mark's channel, if that's the simpler wiring — document which), look up
  C2 §3.4's unit table entry for that channel under `unitsPreference` and
  **write the suggestion into the label field as its current value** — this
  is a **suggestion**, editable like any other field value, never a locked
  or computed display (C2 §1: "no v3 construct converts units" — this form
  must not silently convert a value between SI and imperial, only suggest
  which unit string to show in the label).

  Every control writes through the same path: control changes → build the
  next `PlotProps` → `generate(nextProps)` → `onChange(nextCode)`. The form
  never mutates `code` directly; `generate` is the only thing that produces
  the string this component emits.

- [ ] **Step 2: No unit tests for the component** (CLAUDE.md §4 — UI
  rendering is not unit-tested)

  State this explicitly in the commit message: the form's whole logic
  surface is `plotForm`, already covered above 80% by Tasks 2–3's tests
  (7 + 15 = 22 passed at last count — confirm the current count from
  `git log`/the Task 11 gate output rather than assuming this number is
  still current), so the absence of a `PropertiesForm.test.ts` is a stated
  design choice, not an oversight the reviewer needs to flag.

- [ ] **Step 3: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm
  ```
  Expected: the plotForm suite's existing count, unchanged (proves this task
  did not break the module it stands on — it adds no new test file of its
  own). Report the exact number from your run.

- [ ] **Step 4: CHANGELOG**

  ```
  - **Properties pane over plotForm (L6 Task 12).** Self-contained prop surface (no context/store/IPC/router) so wave 3's React Flow node can host the same component; greys to "custom code" and offers "Reset to form" when `parse` returns null (design §6, D13).
  ```

- [ ] **Step 5: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/components/PropertiesForm.tsx src/routes/pages/Notebook/components/PropertiesForm.types.ts ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer:
  ```
  app: Properties pane over plotForm, self-contained for wave 3's node host
  ```

## Do not

- Do not add a single prop to `PropertiesFormProps` beyond `code`,
  `channels`, `laps`, `unitsPreference`, `onChange` without flagging it as a
  question — every additional prop is one more thing wave 3's React Flow
  node wiring has to also supply, and the operating brief's binding call is
  explicit that this component's whole input is props. If you find you
  genuinely need something else (a callback for "which lap is active", a
  formatting helper), name it in your report rather than adding it silently.
- Do not read `AppState`, any React context beyond what you define locally
  for the form's own internal state, or call `invoke`/any `ipc/*` function
  from this component.
- Do not silently convert a value between `si`/`imperial` — `unitsPreference`
  only steers which label *string* is suggested (C2 §1).
- Do not hardcode the five mark names or the three y-axis types as string
  literals separate from `plotForm/types.ts`'s own union types — derive the
  control's option list from the type, or from a small exported constant in
  `plotForm/` if the type alone isn't enough to enumerate values at runtime
  (a TS union isn't reflectable — if `plotForm/` doesn't already export a
  runtime array of mark names, that's worth a note in your report, not a
  second hardcoded list to drift against the first).
- Do not write a `PropertiesForm.test.ts` — CLAUDE.md §4 excludes rendering
  from unit tests; a reviewer seeing zero new tests for a new `.tsx` file
  should not need to guess this was deliberate.
- Do not build or run any cargo command in this worktree.

## Style / hygiene

Doc comment on every exported symbol/prop, with units where numeric
(`strokeWidth` in px, domain values in the channel's native unit); `//
TODO(idl0):` never bare `// TODO`.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(state the plotForm suite's passed count, unchanged from before this task);
confirmation `PropertiesFormProps` has exactly the five fields specified (or
what you found you needed to add and why — flag it, don't just note it in
passing); how "Reset to form" behaves when `parse` has never once succeeded
for a cell (confirm it falls back to the form's default single-mark props,
not a no-op); where the five mark names / three y-axis types come from at
runtime (a `plotForm/` export, or a locally hardcoded list — say which);
per-step done/deviated; anything ambiguous you resolved (say how) or that
needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

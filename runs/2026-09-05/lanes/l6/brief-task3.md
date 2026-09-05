# L6 Task 3 — implementer brief (`plotForm.parse(code) → props | null`, and the round trip)

You are the implementer for L6 Task 3 of the idl1 rewrite — the parsing
half of `plotForm` and the exhaustive round-trip proof that design §10's
L6 done-criterion "`plotForm` round-trips its subset" holds. TDD, ONE
commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. HEAD must be Task 2's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout,
  the `rust/` submodule, or any other worktree. Do NOT edit `docs/`. Do NOT
  push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.** See "Never eval" below — this is the specific
  reason a JS parser library is also wrong here, not just an economy
  measure.
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l6/BRIEF.md`; the plan's
  `## Task 3` (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`,
  lines 332–397); C2 §5.3 in full (already quoted in
  `runs/2026-09-05/lanes/l6/brief-task2.md` — read that copy, it is
  byte-identical to the contract); **Task 2's landed `types.ts` and
  `generate.ts`** — read them before writing anything, this task imports
  both and must match Task 2's exact indentation/key-order/trailing-newline
  policy (reported in Task 2's commit message) for the round-trip tests to
  pass.

## Never eval, never regex the whole source

Design §6 and the whole point of the sandbox iframe is that untrusted cell
text never executes in the host realm. `parse()` runs in the host (it reads
every `js` cell's code to decide whether to show the Properties form) — so:

- **Never `eval`, never `new Function`** on the cell's code. Either would
  execute it in the host realm, exactly what the sandbox exists to prevent.
- **Never a regex over the whole source.** C2 §5.3's rule is "any object key
  not in the grammar → custom": a regex cannot express "reject if there is
  an extra key I don't already know the name of" without effectively
  re-implementing a parser badly, and it cannot enforce "no statement before
  or after the `Plot.plot(...)` call."

Write a small **hand-rolled recursive-descent reader** instead: a tokenizer
(identifiers, string literals, numbers, punctuation, comment detection —
roughly 80 lines) feeding `readPlotCall → readOptions → readMarks →
readMark → readChannelCall → readMarkOptions`, each function returning
`null` the instant it sees something outside the grammar. This is "the
honest way to satisfy 'no partial match: a cell either parses fully into
props or is entirely custom'" (plan's own words) — a best-effort partial
parse that silently drops unknown fields is a correctness bug here, not a
convenience: it would show the form as if the code were representable when
some of it would be silently discarded on the next `generate()`.

## The task

**Files:**
- Create: `Notebook/plotForm/parse.ts`, `Notebook/plotForm/parse.test.ts`,
  `Notebook/plotForm/roundTrip.test.ts`, `Notebook/plotForm/index.ts`
  (re-exports `generate`, `parse`, and every type from `types.ts`).

**Interfaces:**
- Produces `parse(code: string): PlotProps | null`. `null` means the code is
  **custom** — the Properties pane greys out (design §6, C2 §5.3's exact
  rule, quoted below).
- Consumes `types.ts` (Task 2) and, in `roundTrip.test.ts` only,
  `generate.ts` (Task 2).

**Spec discipline:** no spec change needed.

## The exact "custom" rule you are enforcing (C2 §5.3, verbatim)

A `js` cell is custom (`parse` returns `null`) when **any** of:
- The cell's code is not a single top-level expression matching
  `plot_call` (extra statements, variable assignments, comments, multiple
  `Plot.plot(...)` calls, anything before/after the call).
- Any object key not in the grammar (e.g. `fx`, `facet`, `style`, a
  computed/variable value in place of a grammar-defined literal).
  `x.type`/`y.type` outside the closed enum.
- A mark whose `mark_name` is not one of the five listed, or whose
  `mark_options` supply anything beyond `x`/`y`/`stroke`/`strokeWidth`, or
  whose `x`/`y` are not the literal strings `"t"`/`"v"`.
- A `channel_call` with more than a `name` and an optional `{lap}` object
  (no `session`, no extra keys).
- Any non-literal value where the grammar requires a literal (a computed
  `stroke` from a variable, a spread, a template literal used for anything
  other than a plain string).

There is no partial match: a cell either parses fully into `props` or is
entirely custom.

**Order-insensitivity.** Recognised keys in a hand-reordered document still
**parse** successfully — `parse` is order-insensitive even though
`generate` always emits a fixed order. A cell will not byte-round-trip
until the form regenerates it (expected and harmless), but it must still
*parse*.

- [ ] **Step 1: Write the failing tests**

  `parse.test.ts`:
  - The four worked examples (from `brief-task2.md`, byte-identical to C2
    §5.3) parse back to props **deep-equal** to the originals shown there —
    four tests, named:
    - `parse — C2 §5.3 example 1 — returns props deep-equal to the original`
    - `parse — C2 §5.3 example 2 — returns props deep-equal to the original`
    - `parse — C2 §5.3 example 3 — returns props deep-equal to the original`
    - `parse — C2 §5.3 example 4 — returns props deep-equal to the original`
  - One test per bullet of the "custom" rule above, each asserting `null`:
    - `parse — code with a statement before the Plot.plot call — returns null (custom)`
    - `parse — an unrecognised plot option key such as facet — returns null (custom)`
    - `parse — y.type outside the linear|log|sqrt enum — returns null (custom)`
    - `parse — a mark name outside the five in the grammar — returns null (custom)`
    - `parse — mark options carrying a key beyond x/y/stroke/strokeWidth — returns null (custom)`
    - `parse — mark x or y not the literal strings t and v — returns null (custom)`
    - `parse — a channel call with a session key — returns null (custom)`
    - `parse — a computed stroke read from a variable — returns null (custom)`
    - `parse — two top-level Plot.plot calls — returns null (custom)`
  - The order-insensitivity rule:
    - `parse — recognised keys in a hand-reordered order — parses successfully`

  19 tests in `parse.test.ts`.

  `roundTrip.test.ts`:
  - `generate then parse — every combination of the props grammar — returns props deep-equal to the input`

    A **hand-rolled exhaustive enumeration** over the closed grammar — do
    not randomise, enumerate every combination explicitly with nested loops
    or a Cartesian-product helper you write inline:
    5 mark names × {lap: null, lap: 3} × {no stroke, stroke: "#123456"} ×
    {no strokeWidth, strokeWidth: 2} × {no x, x: {label}, x: {label, domain}}
    × {no y, y: {label}, y: {domain}, y: {type: "linear"}, y: {type: "log"},
    y: {type: "sqrt"}} × {no color, color: {legend: true}}.
    This is `5 × 2 × 2 × 2 × 3 × 6 × 2 = 1440` cases (a single mark per plot
    is sufficient to exercise every field; you do not additionally need to
    vary the *number* of marks per case — that combinatorial dimension adds
    no new code path since `marks` is just an array of the same production).
    Runs in well under a second. **Report the exact case count you actually
    enumerate in the commit message** — if your enumeration differs from the
    1440 above, say why.
  - `parse then generate — code the form itself produced — returns byte-identical code`
    (take a handful of `generate()` outputs, `parse` them, `generate` the
    result again, assert the string is unchanged).

  21 total tests across both files (19 + 2), plus Task 2's 7 = 28 for the
  `plotForm/` directory as a whole after this task.

- [ ] **Step 2: Implement `parse.ts`**

  Tokenizer first (identifiers, string literals via `JSON.parse` on the
  matched quoted span or a hand-rolled string-literal reader, numbers,
  punctuation `{ } [ ] ( ) , :`, and comment detection so a `//`-commented
  line inside the call correctly triggers "not a single top-level
  expression" rather than being silently skipped — a comment is not part of
  the grammar at all, so its presence makes the cell custom). Then the
  recursive-descent chain named above. Each `read*` function takes the
  token stream position and either advances it and returns a value, or
  returns `null` without advancing (so a caller can try an alternative,
  though this grammar has few enough alternatives that backtracking is
  rarely needed — `mark_name`'s five options are the main place a caller
  matches one string against a fixed set).

- [ ] **Step 3: Write `index.ts`**

  ```ts
  export * from "./types";
  export { generate } from "./generate";
  export { parse } from "./parse";
  ```

- [ ] **Step 4: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm
  ```
  Expected: 7 (Task 2) + 21 (this task) = 28 passed, 0 failed.

- [ ] **Step 5: CHANGELOG**

  ```
  - **plotForm.parse and the round trip (L6 Task 3).** Bidirectional over the C2 §5.3 subset; every custom-code rule in the contract has its own test. Design §10's "plotForm round-trips its subset" holds.
  ```

- [ ] **Step 6: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/plotForm/parse.ts src/routes/pages/Notebook/plotForm/parse.test.ts src/routes/pages/Notebook/plotForm/roundTrip.test.ts src/routes/pages/Notebook/plotForm/index.ts ../CHANGELOG.md
  ```
  Message, single line, no AI attribution trailer, including the exhaustive
  round-trip's actual case count:
  ```
  app: plotForm.parse, custom-code detection, exhaustive round-trip (1440 cases)
  ```
  (replace `1440` with your actual enumerated count if different, per Step 1).

## Do not

- Do not use `eval`, `new Function`, or the `Function` constructor anywhere
  — see "Never eval, never regex" above. A reviewer greps for both literal
  strings and flags any occurrence as Critical.
- Do not use a whole-source regex to implement any part of the "custom"
  decision — a regex used only inside the tokenizer (e.g. to match a number
  literal's character class) is fine; a regex that tries to match the whole
  `Plot.plot({...})` shape is not.
- Do not add a JS parser dependency (acorn, esprima, meriyah, etc.) — the
  grammar is closed and small enough that a hand-written reader is the
  correct-weight tool, and `package.json` is lead-owned regardless.
- Do not let `parse` throw on malformed input — every failure path returns
  `null`, never an exception. A cell with a syntax error in its `js` fence
  is legal input (an author mid-edit) and must simply show as custom, not
  crash the Properties pane.
- Do not silently accept a superset of the grammar "because it seems
  harmless" — an extra key you don't recognize must return `null`, not be
  ignored. Silently dropping data on the next `generate()` is exactly the
  failure mode C2 §5.3's "no partial match" rule exists to prevent.

## Style / hygiene

Doc comment on every exported symbol; `// TODO(idl0):` never bare `// TODO`;
A/A/A tests with blank lines between sections; keep the tokenizer and the
recursive-descent reader in the one file (`parse.ts`) as the plan specifies
— this is not large enough to warrant splitting, and splitting it would
scatter the "no partial match" invariant across files.

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts, expect 28); the exhaustive round-trip's
actual case count and how it was enumerated, if it differs from the 1440
worked out above; confirmation no `eval`/`new Function`/whole-source-regex
appears anywhere in `parse.ts` (grep it yourself and paste the negative
result); per-step done/deviated; anything ambiguous you resolved (say how)
or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).

# L6 Task 2 review — `plotForm.generate(props) → code`

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`
Branch: `wave2-l6-notebook`
Commit under review: `f28eeec` ("app: plotForm.generate over the C2 §5.3 subset")
Scope: the three new files under `app/src/routes/pages/Notebook/plotForm/` (`types.ts`,
`generate.ts`, `generate.test.ts`) plus the one `CHANGELOG.md` bullet. Working tree is
otherwise clean (`git status` reports nothing to commit); no unrelated changes present.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm
```

Output:
```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  541ms
```
`tsc` was silent (no errors). This reproduces the implementer's reported result: 8 passed,
0 failed (7 tests from the brief plus one extra shape test the implementer added — see
Findings).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `generate.ts:16` (`renderXAxis`), `generate.ts:24` (`renderYAxis`) | `XAxisProps`/`YAxisProps` are structurally satisfied by `{}` (every field optional), so `PlotProps` legally admits `x: {}` or `y: {}`. `generate` then emits `x: {}` / `y: {}` verbatim. But C2 §5.3's grammar defines `x_scale ::= "{" x_field ("," x_field)* "}"` — at least one `x_field` is mandatory once the production is used at all; an empty `{}` is not a string the grammar's `x_scale`/`y_scale` productions generate. So for this legal (type-admitted) input, `generate` emits a string outside the grammar it and `parse` are supposed to "agree on **exactly**" (C2 §5.3 opening sentence). This is exactly the class of bug the brief's "must not throw on any value the type system admits" rule is guarding against, except here the failure mode is silently-wrong output rather than a throw, and it is untested (no test constructs `x: {}`/`y: {}`; the "no x, y or color" test omits the key entirely rather than passing an empty object). | Either (a) narrow `XAxisProps`/`YAxisProps` so an all-undefined object cannot satisfy them (harder in TS without a "at least one key" utility type), or (b) treat an axis object with zero populated fields the same as an absent key — `generate` should omit the `x`/`y` option entirely when every field is `undefined`, matching the grammar's requirement that `x_scale`/`y_scale` never appear empty. (b) is the smaller, more idiomatic fix given the existing "omit when undefined" pattern already used for individual fields. |
| Minor | `generate.test.ts:1-166` | The brief and plan both specify exactly 7 tests; the implementer added an 8th (`generate — an empty marks array — emits marks: [] without throwing`), not in either list. This is in-scope, not scope creep: it directly tests a behaviour the brief's "Do not" section mandates ("a plot with no marks is legal but pointless... must still generate, not throw") but that none of the 7 specified tests actually exercises (the closest, "no x, y or color", still has one mark). Naming follows the `thing — condition — result` convention correctly. No fix needed; flagging only because the standing brief treats deviation from the specified test list as reviewable — this deviation is additive and beneficial. |
| Minor | `types.ts:22` (`YAxisProps.domain`) | `XAxisProps.domain`'s doc comment states its unit ("seconds since session start, per §5.1"); `YAxisProps.domain` has no comparable per-field comment (only the interface-level "C2 §5.3's `y_scale` production" note) — CLAUDE.md §5 asks for units on every numeric value. Y-axis unit is channel-dependent so a fixed unit can't be stated the way x's can, but a one-line comment saying so would close the asymmetry. | Add a short doc comment on `YAxisProps.domain` noting its unit is the plotted channel's native unit (channel-dependent, unlike x's fixed seconds). |

No Critical findings.

## Checks performed (all pass)

- All four C2 §5.3 worked examples reproduced byte-for-byte: read `generate.test.ts`'s
  expected strings against the contract's inline code blocks character by character —
  identical, including key order (`x`, `y`, `color`, `marks` at top level; `x`, `y`,
  `stroke`, `strokeWidth` within `mark_options`), the `channel(...)` args, and the
  `{ lap: n }` shape. Vitest confirms all four pass via `toBe` (exact match, not `toContain`).
- Formatting policy (two-space indent, `Plot.plot({` at column 0, options at column 2,
  `marks: [` entries at column 4, no trailing newline) is stated explicitly in a comment
  above `generate()` in `generate.ts`, as the brief requires, and is consistent with how
  C2 §5.3 renders its own examples (C2 doesn't stipulate trailing-newline, so any
  consistent choice is compliant — this one is reasonable and Task 3's round-trip tests
  need only match it, which is a Task 3 concern, not a Task 2 defect).
- `x.type` does not appear anywhere in `types.ts`'s `XAxisProps`, and `generate.ts` never
  emits an `x.type` field — confirmed by reading `renderXAxis` (only `label`/`domain`) and
  by grepping the commit diff for `x.type` (only doc-comment prose hits, no code).
  `"linear"` appears only in `YAxisProps.type`'s union and in doc-comment prose — never as
  a value `generate` writes for `x`.
- `PlotProps`/`MarkProps`/`XAxisProps`/`YAxisProps` cover exactly the C2 §5.3 subset: no
  extra fields beyond the grammar (`fx`, `facet`, `style`, `session`-scoped channel calls,
  etc. are all correctly absent) — matches CLAUDE.md §3's "no renderer-only parameters."
- Empty `marks: []` generates `"marks: []"` inline (not a multi-line empty block) rather
  than throwing — verified by reading `generate()`'s ternary and by the (extra) test that
  asserts this.
- `lap: null`/`lap: undefined` both correctly omit the `{ lap: ... }` object from
  `channel_call` (checked via `===` against both `null` and `undefined` in
  `renderChannelCall`, and via the corresponding test using `toContain`/`not.toContain`).
- Identifier handling: channel names, colors, and axis labels are all serialized with
  `JSON.stringify` (`jsString`), never string-interpolated raw — a channel name or label
  containing a quote, backslash, or arbitrary Unicode cannot produce invalid or injected
  JS. Numbers (`domain`, `strokeWidth`, `lap`) go through `String(n)`, matching the
  grammar's unconstrained `js_number`/`js_int` (no special formatting rule to violate).
- No `eval`, no `new Function`, no import of `@observablehq/plot` (or any Plot symbol),
  and no execution of generated code anywhere in the diff — `generate.ts` only builds and
  returns a string.
- Purity: no import from `react`, `@tauri-apps/api`, or any DOM global (`document`,
  `window`) in `plotForm/` — grepped the full diff.
- Doc comment present on every exported symbol (`MarkProps`, `XAxisProps`, `YAxisProps`,
  `PlotProps`, `generate`); non-exported helpers (`jsString`, `renderXAxis`, `renderYAxis`,
  `renderChannelCall`, `renderMarkOptions`, `renderMark`) also carry doc comments, which
  exceeds the requirement.
- Tests are Arrange/Act/Assert with blank lines between each section in every case; names
  match the brief's specified strings exactly for all 7 required tests; the 8th test's name
  follows the same `thing — condition — result` convention (see Findings, Minor).
- Ownership: `git show --stat f28eeec` touches only
  `app/src/routes/pages/Notebook/plotForm/{types,generate,generate.test}.ts` and
  `CHANGELOG.md` — nothing in `rust/`, `app/src-tauri/`, `App.tsx`, `package.json`,
  `vite.config.ts`, or any other lane's files. No `package.json`/lockfile touch (grep of
  `git show --stat` confirms) — no new npm dependency, matching the brief's hard
  requirement.
- No `invoke(`, no `onPointerMove|onWheel|onTouchMove|requestAnimationFrame` anywhere in
  the diff — no IPC surface, no gesture handler, consistent with a pure Step-2-of-the-lane
  module.
- Coverage tooling (`vitest run --coverage`) is not installed in this worktree (a lead
  shell task is adding it, per the dispatch) — not run, per instruction; by inspection
  every branch in `generate.ts` other than the empty-axis-object `{}` fallback (see
  Findings) has a corresponding test.
- Commit is a single line, no AI attribution trailer; `CHANGELOG.md` bullet text matches
  the brief's Step 5 verbatim; nothing under `docs/` touched; shared checkout untouched.
- `node_modules` present in the worktree (not missing), so no `npm install` was needed or
  run for this review.

## Verdict rationale

The four contract worked examples are reproduced byte-for-byte, the type surface is
exactly the C2 §5.3 subset with no widening, identifier/string handling is safe
(`JSON.stringify` throughout, no `eval`), ownership and hygiene are clean, and the extra
8th test is a genuine (if unrequested) improvement rather than scope creep. The one real
defect is that the `PlotProps` type — as literally written in both the plan and the
brief — admits an empty `{}` for `x`/`y`, and `generate` will happily emit that `{}` even
though C2 §5.3's `x_scale`/`y_scale` grammar productions never produce an empty object;
that is untested and would produce output outside the grammar `generate`/`parse` must
agree on, which is a real correctness gap with a small, mechanical fix (treat all-fields-
undefined the same as the key being absent). That, plus the missing unit note on
`YAxisProps.domain`, are the only things keeping this from CLEAN — both are small and
mechanical, not a rework of the approach.

VERDICT: NEEDS_FIXES

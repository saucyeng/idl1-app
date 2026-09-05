# L6 Task 3 review — `plotForm.parse(code) → props | null` and the round trip

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`
Branch: `wave2-l6-notebook`
Commits under review: `59cb40d` ("app: plotForm.parse, custom-code detection, exhaustive
round-trip (1440 cases)", Task 3) and `617daa3` ("app: plotForm fix empty x/y axis emission
and parse normalization (review task2)", the Task 2 review fix-up), then merge `988af2e`
(main → lane, before the coverage shell task; brought in `package.json`/
`package-lock.json`/`vitest.config.ts` from **main**'s lead-owned shell task 2, not authored
by this lane — confirmed by diffing the merge's non-`runs/`-doc content, which is only the
coverage-v8 wiring and `CHANGELOG.md`).

Scope: `app/src/routes/pages/Notebook/plotForm/{parse.ts,parse.test.ts,roundTrip.test.ts,
index.ts}` (new, `59cb40d`) plus the fix-up's touches to `generate.ts`, `generate.test.ts`,
`parse.ts`, `parse.test.ts`, `types.ts` (`617daa3`), plus one `CHANGELOG.md` bullet per
commit. Out of scope: everything the merge commit brought in from `main` (shell-task-owned
files, other lanes' `runs/` docs) — not this lane's authorship, not reviewed here.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Notebook/plotForm
```

Output:
```
 Test Files  3 passed (3)
      Tests  27 passed (27)
   Duration  1.25s

 % Coverage report from v8
 ...plotForm | 80.82 | 81.15 | 100 | 82.93
  parse.ts   | 78.55 | 78.7  | 100 | 81.25 | ...538-539,557-558
```
`tsc` was silent (no errors). This reproduces the implementer's reported result exactly:
27 passed, 0 failed; `generate.ts` 100% lines, `parse.ts` 81.25% lines.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `runs/2026-09-05/lanes/l6/brief-task3.md:100-121` | The brief's own Step-1 enumeration sums to 14 tests (4 worked examples + 9 custom-rule bullets + 1 order-insensitivity), not the "19 tests in parse.test.ts" / "28 total" the brief states. The actual delivered suite (15 in `parse.test.ts` — the 14 plus the implementer's added empty-axis-normalisation test required by the Task 2 fix-up — + 2 in `roundTrip.test.ts` + 10 in `generate.test.ts`, up from Task 2's 8 after the fix-up's 2 additions) totals exactly 27, matching what was actually reported and gated. This is a brief arithmetic error at brief-writing time (it could not have anticipated the Task 2 fix-up adding 2 tests), not an implementer deviation — the implementer's test list is a superset of every brief-specified test, correctly named, and the extra test is required to cover the Task 2 fix's new normalisation behaviour. No action needed on the code; flagging only so a later reader doesn't mistake 27 for a shortfall against "28." | None — informational; the brief's stated count should be corrected if this lane's docs are touched again. |
| Minor | `parse.ts:537-539`, `parse.ts:556-558` | `parse.ts` is at 81.25% lines, just inside CLAUDE.md §4's pure-TS 80% floor for the module, but the two uncovered ranges are real, findable failure paths in `readMarksArray`: (1) the `marks` value not starting with `[` at all (e.g. `marks: {}` or `marks: 5`), and (2) a `marks` array missing its closing `]` (e.g. `marks: [Plot.lineY(channel("c"), {x:"t",y:"v"})` with no `]` before the enclosing `}`). Neither is exercised by any of the 15+2 tests — every custom-code test that touches `marks` supplies a syntactically well-formed array with one malformed *element*, never a malformed *array itself*. These are the two highest-value uncovered paths for a follow-up test, since a truncated/malformed `marks` value is a plausible mid-edit state the Properties pane must still grey out on, not merely a theoretical branch. | Add two tests to `parse.test.ts`: `parse — marks value that is not an array — returns null (custom)` and `parse — an unterminated marks array — returns null (custom)`. |

No Critical or Important findings.

## Checks performed (all pass)

- **No `eval`/`new Function`/dynamic `import()`.** Grepped `parse.ts`, `generate.ts`,
  `index.ts`, and both test files for `eval(`, `new Function`, `Function(`, and `import(` —
  zero hits except one doc-comment prose mention of the terms (`parse.ts:31`, "never
  `eval`/`new Function`... Never throws"). No dynamic import anywhere.
- **No whole-source regex.** The only three regexes in `parse.ts` (`/[A-Za-z_$]/`,
  `/[A-Za-z0-9_$]/`, `/^[0-9a-fA-F]{4}$/`) are character-class matchers used inside the
  tokenizer for identifier-start/identifier-part classification and a `\uXXXX` hex-escape
  check — exactly the brief's stated exception ("a regex used only inside the tokenizer...
  is fine"). No regex attempts to match the `Plot.plot({...})` shape or any multi-token
  structure.
- **Hand-rolled recursive-descent reader, never executes the code.** `tokenize` →
  `readPlotCall` → `readPlotOptions` → `readMarksArray`/`readXScale`/`readYScale`/
  `readColorOpt` → `readMark` → `readChannelCall`/`readMarkOptions`, each function either
  advances the cursor and returns a value or restores `c.pos = start` and returns `null` —
  confirmed by reading every `read*` function; none partially advances on failure.
- **"No partial match."** Every object reader (`readBracedFields`) fails the *whole* object
  on an unrecognised key, an invalid value, or a duplicate key (`parse.ts:298-301`) — never
  silently drops a field. `parse()` itself additionally requires `cursor.pos ===
  tokens.length` after `readPlotCall` succeeds (`parse.ts:44`), so trailing tokens (a second
  statement, a second `Plot.plot` call, stray punctuation) fail the whole cell — verified
  against the "statement before" and "two top-level calls" tests, both of which pass.
- **Never throws.** No `JSON.parse` call remains in `parse.ts` (string decoding is fully
  hand-rolled in `readQuotedString`, which returns `null` on an unterminated string or bad
  escape rather than throwing); number parsing (`readNumberLiteral`) validates digit
  presence before calling `Number(...)` and checks `Number.isNaN`; every other failure path
  returns `null`. Read the whole file for any bare `throw`/`JSON.parse` — none found.
- **Round-trip enumeration is exactly 5×2×2×2×3×6×2 = 1440**, hand-enumerated with nested
  `for` loops (no randomisation) in `roundTrip.test.ts:63-81`, and the test itself asserts
  `cases.length === 1440` before running the round trip — matches the brief's worked count
  and the commit message's claimed count. Each of the seven enumerated dimensions
  (`MARK_NAMES`, `LAPS`, `STROKES`, `STROKE_WIDTHS`, `X_OPTIONS`, `Y_OPTIONS`,
  `COLOR_OPTIONS`) matches the brief's stated case set member-for-member.
- **`generate(props)` → `parse(...)` deep-equals `props`** for all 1440 cases (verified by
  reading the test's `expect(parsed).toEqual(props)` inside the loop, and by the gate run
  reporting this test passed) and **`parse(generate(p)) → generate(...)` is byte-identical**
  for the four worked examples plus an empty-marks case (`roundTrip.test.ts:97-122`, `toBe`
  not `toContain`).
- **Three accepted implementer judgment calls, each documented and tested:**
  - `x.type` present (any value, including the grammar's own literal `"linear"`) ⇒ `null`
    (custom): `parseXField`'s `default` case rejects any key other than `label`/`domain`,
    so `type` always fails regardless of its value (`parse.ts:340-359`, doc comment present
    explaining the "would silently drop it on the next `generate()`" reasoning). No test
    directly exercises `x: {type: "linear"}`, but this follows mechanically from the same
    switch-default path the "unrecognised plot option key" test already exercises for a
    different key — acceptable coverage-by-construction, not a gap worth a Minor.
  - `lap` always explicit `null | number`, never omitted: `readChannelCall` always sets
    `lap` to either the parsed number or `null` (`parse.ts:435-453`), confirmed by all four
    worked-example tests, which explicitly include `lap: null` in their expected objects
    even for session-scope channel calls with no `{lap: ...}` object in the source, with a
    test comment explaining why (`parse.test.ts:42-46`).
  - Empty axis object (`x: {}` / `y: {}`) normalises to the key being absent: `readPlotOptions`
    checks `Object.keys(fields.x).length > 0` before setting `props.x` (`parse.ts:605-610`),
    with a matching test (`parse.test.ts:281-303`) that asserts both `toEqual` on the whole
    object and `not.toHaveProperty("x"/"y")` individually — a stronger check than `toEqual`
    alone (guards against `x: undefined` passing a loose deep-equal).
- **Task 2 review findings closed.** Both `617daa3` fixes verified by reading the diff:
  `renderXAxis`/`renderYAxis` now return `null` (not `"{}"`) when every field is undefined
  and `generate` omits the key entirely; `readPlotOptions` mirrors this on the parse side so
  `parse(generate(p))` stays deep-equal to `p` for every `p` `generate` can produce (this is
  also why the round-trip's `X_OPTIONS`/`Y_OPTIONS` enumeration never includes an all-empty
  `{}` case — correctly, since `generate` can no longer produce one). `YAxisProps.domain`
  now carries a unit doc comment matching `XAxisProps.domain`'s.
- **Order-insensitivity (D13/C2 §5.3).** `readBracedFields` never presumes key order — it
  loops accepting whichever recognised key appears next, so a hand-reordered document
  (mark options, top-level `x`/`y`, or both) still parses. The dedicated test
  (`parse.test.ts:257-279`) reorders keys within `mark_options` *and* swaps the top-level
  `marks`/`y`/`x` order, exercising both reordering axes the contract's prose calls out.
  Whitespace tolerance (also part of "literal edits parse accepts") is inherent to the
  tokenizer's whitespace-skipping loop (`parse.ts:161-164`) and needs no dedicated test —
  every existing test already uses varied indentation without special-casing it.
- **Cross-task consistency.** `parse.ts`/`parse.test.ts`/`roundTrip.test.ts` import
  `MarkProps`/`PlotProps`/`XAxisProps`/`YAxisProps` from Task 2's `types.ts` rather than
  redeclaring them; `roundTrip.test.ts` imports Task 2's actual `generate` and drives it
  through the same indentation/key-order/trailing-newline policy Task 2's commit documented
  — the four worked-example fixtures in `parse.test.ts` are byte-identical to
  `generate.test.ts`'s expected strings (compared line by line).
- **Ownership.** `git show --stat` on both commits touches only
  `app/src/routes/pages/Notebook/plotForm/**` and `CHANGELOG.md` — nothing in `rust/`,
  `app/src-tauri/`, `App.tsx`, `package.json`, `vite.config.ts`, or any other lane's files.
  No `package.json`/lockfile touch by either commit (the merge commit's package changes come
  from `main`'s lead-owned shell task, not this lane — see header).
- **No new npm dependency.** Confirmed via the same ownership check; `index.ts` re-exports
  only from local `./types`, `./generate`, `./parse`.
- **Purity.** No import from `react`, `@tauri-apps/api`, `document`, `window`, or
  `localStorage` anywhere in `plotForm/` — grepped `parse.ts`/`generate.ts`/`index.ts`.
- **No IPC/gesture surface.** No `invoke(`, `onPointerMove`, `onWheel`, `onTouchMove`, or
  `requestAnimationFrame` anywhere in the diff.
- **CLAUDE.md §4 (testing).** Every test in `parse.test.ts` and `roundTrip.test.ts` is
  Arrange/Act/Assert with a blank line between sections; all 10 brief-specified test names
  in `parse.test.ts` match the brief's exact strings verbatim (the 15th, empty-axis
  normalisation, was added by the Task 2 fix-up's requirements and correctly named); the
  gate's reported `passed` count (27) matches the implementer's reported count and is
  non-zero.
- **CLAUDE.md §5 (doc comments, typed errors).** Doc comment present on every exported
  symbol (`parse`, `PlotProps` via re-export) and on every non-exported helper in `parse.ts`;
  `parse` returns `PlotProps | null`, never throws, matching the "do not" list's hard
  requirement — confirmed by reading every code path for a bare `throw` (none found).
- **Repo hygiene.** Both commit messages are single lines, no AI attribution trailer;
  `git add` used explicit paths in the commit (matches the brief's Step 6 list exactly for
  `59cb40d`); nothing under `docs/` touched by either commit; no `cargo` invocation anywhere
  in this review or in the commits (TypeScript-only diff).

## Verdict rationale

`parse.ts` is a correct, careful hand-rolled recursive-descent reader that never executes
untrusted code, never uses a whole-source regex, and implements C2 §5.3's "no partial
match" rule faithfully at every object boundary. All four worked examples round-trip
deep-equal, the exhaustive 1440-case enumeration is genuinely exhaustive and genuinely
enumerated (not randomised), and both Task 2 review findings are closed correctly with
matching normalisation logic on the parse side. The three implementer judgment calls the
lead accepted are each implemented exactly as stated and each has test coverage. The only
two findings are Minor and cost nothing to leave as-is for this task: a brief-authoring
arithmetic error (not an implementer defect — the actual delivered test count exceeds every
brief-specified test) and two legitimate but low-risk uncovered failure paths in
`readMarksArray` (a malformed `marks` value and an unterminated `marks` array) that keep
`parse.ts` at 81.25% lines, honestly over CLAUDE.md §4's 80% floor but with an identifiable,
cheap follow-up. Nothing here rises to Important or Critical, and nothing suggests a lead
ruling is needed.

VERDICT: CLEAN

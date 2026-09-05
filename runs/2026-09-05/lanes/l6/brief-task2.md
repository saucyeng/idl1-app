# L6 Task 2 — implementer brief (`plotForm.generate(props) → code`)

You are the implementer for L6 Task 2 of the idl1 rewrite — the first
logic-bearing task of the Notebook tab lane: the pure code-generation half
of `plotForm`, over the C2 §5.3 Plot subset. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
  branch `wave2-l6-notebook`. HEAD must be Task 1's commit, status clean.
  Verify first; if not, stop and report.
- Work ONLY in `app/` inside this worktree. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`), the `rust/`
  submodule, or any other worktree. Do NOT edit anything under `docs/`. Do
  NOT push.
- **No cargo, ever, in this worktree.**
- **No new npm dependency.** This task is a hand-written string builder,
  not a JS-AST printer — the grammar below is closed and small, and a
  printer library would be a dependency this lane may not add
  (`package.json` is lead-owned). If you find yourself wanting one, stop and
  report rather than adding it.
- Read first: `CLAUDE.md`; this lane's `runs/2026-09-05/lanes/l6/BRIEF.md`;
  the plan's Global Constraints and `## Task 2`
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md`, lines
  255–330 — this brief transcribes and completes it, read the plan section
  too); contract C2 §5.3 in full
  (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`, lines
  615–776 — the whole grammar, the "Custom" rule, and all four worked
  examples are quoted below so you do not need to re-derive them, but read
  the source section anyway for the surrounding prose).

## The grammar you are implementing (C2 §5.3, verbatim)

```ebnf
plot_call     ::= "Plot.plot(" plot_options ")"
plot_options  ::= "{" option ("," option)* "}"
option        ::= "x" ":" x_scale
                | "y" ":" y_scale
                | "color" ":" color_opt
                | "marks" ":" marks_array
x_scale       ::= "{" x_field ("," x_field)* "}"
x_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" "\"linear\""
y_scale       ::= "{" y_field ("," y_field)* "}"
y_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" ("\"linear\"" | "\"log\"" | "\"sqrt\"")
color_opt     ::= "{" "legend" ":" "true" "}"
marks_array   ::= "[" mark ("," mark)* "]"
mark          ::= "Plot." mark_name "(" channel_call "," mark_options ")"
mark_name     ::= "lineY" | "dot" | "areaY" | "rectY" | "ruleY"
channel_call  ::= "channel(" js_string ("," "{" "lap" ":" js_int "}")? ")"
mark_options  ::= "{" "x" ":" "\"t\"" "," "y" ":" "\"v\""
                       ("," "stroke" ":" css_color)?
                       ("," "strokeWidth" ":" js_number)? "}"
css_color     ::= js_string                (* any valid CSS color literal *)
```

Every key in every object is optional except `marks` (the form always seeds
one mark) and each mark's `x`/`y` (always the literal pair `"t"`/`"v"`).
`x.type` accepts only the literal `"linear"` and **the generator never
emits it** (§8-2 records this as provisional, reserved for a future
non-time x-axis). Object keys may appear in any order when hand-edited, but
`generate()` always emits them in the order **`x`, `y`, `color`, `marks`**
at the top level, and within each mark's options `x`, `y`, then optionally
`stroke`, then optionally `strokeWidth` — this fixed order is the condition
for `parse(generate(props))` and `generate(parse(code)) === code` to
byte-round-trip (Task 3 tests this).

## The four worked examples (C2 §5.3, byte-exact — your Step 1 tests assert these)

*Example 1 — single channel, axis labels only.*
```
props = {
  marks: [ { channel: "fork_velocity", lap: null, mark: "lineY" } ],
  x: { label: "Time (s)" },
  y: { label: "Velocity (m/s)" }
}
```
```js
Plot.plot({
  x: { label: "Time (s)" },
  y: { label: "Velocity (m/s)" },
  marks: [
    Plot.lineY(channel("fork_velocity"), { x: "t", y: "v" })
  ]
})
```

*Example 2 — two channels, explicit colors, manual log-scale y domain, legend.*
```
props = {
  marks: [
    { channel: "IMU1_AccelX", mark: "lineY", stroke: "#2196F3" },
    { channel: "IMU2_AccelY", mark: "lineY", stroke: "#4CAF50" }
  ],
  y: { domain: [-2, 2], type: "log" },
  color: { legend: true }
}
```
```js
Plot.plot({
  y: { domain: [-2, 2], type: "log" },
  color: { legend: true },
  marks: [
    Plot.lineY(channel("IMU1_AccelX"), { x: "t", y: "v", stroke: "#2196F3" }),
    Plot.lineY(channel("IMU2_AccelY"), { x: "t", y: "v", stroke: "#4CAF50" })
  ]
})
```

*Example 3 — lap-scoped dot mark, thicker stroke.*
```
props = {
  marks: [ { channel: "fork_bottom_out", lap: 3, mark: "dot", strokeWidth: 2 } ],
  y: { label: "Bottom-out event" }
}
```
```js
Plot.plot({
  y: { label: "Bottom-out event" },
  marks: [
    Plot.dot(channel("fork_bottom_out", { lap: 3 }), { x: "t", y: "v", strokeWidth: 2 })
  ]
})
```

*Example 4 — `areaY` mark, explicit `x` window (`label` + `domain`).*
```
props = {
  marks: [ { channel: "fork_travel", mark: "areaY", stroke: "#9C27B0" } ],
  x: { label: "Session time (s)", domain: [120, 180] },
  y: { label: "Travel (mm)" }
}
```
```js
Plot.plot({
  x: { label: "Session time (s)", domain: [120, 180] },
  y: { label: "Travel (mm)" },
  marks: [
    Plot.areaY(channel("fork_travel"), { x: "t", y: "v", stroke: "#9C27B0" })
  ]
})
```

Indentation is two spaces per nesting level, exactly as shown above
(`Plot.plot({` at column 0, its option keys at column 2, `marks: [` items at
column 4, each mark's own object literal inline on one line). The generator
you write fixes the indentation, key order, and trailing-newline policy
(pick one and apply it consistently — document your choice in a comment
above `generate()`); the tests below assert whatever that policy is, since
the examples above are shown without a trailing-newline stipulation.

## The task

**Files:**
- Create: `Notebook/plotForm/types.ts`, `Notebook/plotForm/generate.ts`,
  `Notebook/plotForm/generate.test.ts`.

**Interfaces:**
- Produces `PlotProps`, `MarkProps`, `AxisProps`-equivalent types (see
  `types.ts` below) and `generate(props: PlotProps): string`.
- Consumes nothing. Pure — no React, no DOM, no IPC.

**Spec discipline:** no spec change needed — C2 §5.3 is the spec.

- [ ] **Step 1: Write the failing tests**

  `generate.test.ts` — four tests, one per worked example above, each
  asserting the **byte-identical** string (including your chosen indent and
  trailing-newline policy, and the fixed key order `x`, `y`, `color`,
  `marks`):
  - `generate — C2 §5.3 example 1, single channel with axis labels — emits the contract's exact code`
  - `generate — C2 §5.3 example 2, two marks with strokes, log y domain and legend — emits the contract's exact code`
  - `generate — C2 §5.3 example 3, lap-scoped dot mark with strokeWidth — emits the contract's exact code`
  - `generate — C2 §5.3 example 4, areaY with an explicit x window — emits the contract's exact code`

  Plus three shape tests:
  - `generate — a props with no x, y or color — emits marks only`
  - `generate — a mark with lap null — omits the lap options object entirely`
  - `generate — five mark names in turn — each emits Plot.<name>(channel(...), ...)`

  Seven tests total. Arrange/Act/Assert with a blank line between each
  section; names exactly as above (`thing — condition — result`).

- [ ] **Step 2: Write `types.ts`**

  ```ts
  /** One mark in the Properties form's state (C2 §5.3's `mark` production).
   *  `lap` is a 1-based lap number (C3 §3.2's `LapSummary.number`) or null
   *  for session scope; `strokeWidth` is in CSS pixels. */
  export interface MarkProps {
    channel: string;
    mark: "lineY" | "dot" | "areaY" | "rectY" | "ruleY";
    lap?: number | null;
    stroke?: string;      // any valid CSS colour literal
    strokeWidth?: number; // px
  }

  /** C2 §5.3's `x_scale` production. `type` is intentionally absent — see
   *  the note below. */
  export interface XAxisProps {
    label?: string;
    /** [min, max] in the channel's native x unit (seconds since session
     *  start, per §5.1). */
    domain?: [number, number];
  }

  /** C2 §5.3's `y_scale` production. */
  export interface YAxisProps {
    label?: string;
    domain?: [number, number];
    type?: "linear" | "log" | "sqrt";
  }

  /** C2 §5.3's `plot_options` production — the Properties pane's whole
   *  internal state for one `js` cell in the `plotForm` subset.
   *
   *  `x.type` is deliberately absent from `XAxisProps`: C2 §5.3 says the
   *  generator never emits it (the grammar's `x_field` allows only the
   *  literal `"linear"`, reserved for a future non-time x-axis, C2 §8-2).
   *  Admitting a field the generator cannot write would make round-trip
   *  (Task 3) provably false for any props carrying it. */
  export interface PlotProps {
    /** Required; the form always seeds one mark (C2 §5.3). */
    marks: MarkProps[];
    x?: XAxisProps;
    y?: YAxisProps;
    color?: { legend: true };
  }
  ```

- [ ] **Step 3: Implement `generate.ts`**

  A string builder, not a JS-AST printer. Emission order is fixed
  (`x`, `y`, `color`, `marks`) because C2 §5.3 makes that order the
  condition for byte-identical round-trip. Strings are emitted with
  `JSON.stringify` (never manual quote-wrapping) so a label containing a
  quote or backslash cannot produce invalid code. Numbers are emitted with
  plain `String(n)` (the grammar's `js_number` has no special formatting
  rule). A mark's `lap` key is omitted entirely from the `channel(...)` call
  when `lap` is `null` or `undefined` — the grammar's `channel_call` marks
  the `{lap: js_int}` object as fully optional, not "present with a null
  value."

- [ ] **Step 4: Gate**

  ```
  npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm
  ```
  Expected: 7 passed, 0 failed.

- [ ] **Step 5: CHANGELOG**

  ```
  - **plotForm.generate (L6 Task 2).** Emits the C2 §5.3 Plot subset byte-identically for all four of the contract's worked examples.
  ```

- [ ] **Step 6: Commit**

  Explicit paths:
  ```
  git add src/routes/pages/Notebook/plotForm/types.ts src/routes/pages/Notebook/plotForm/generate.ts src/routes/pages/Notebook/plotForm/generate.test.ts ../CHANGELOG.md
  ```
  (verify the `CHANGELOG.md` relative path with `git status` before
  committing). Message, single line, no AI attribution trailer:
  ```
  app: plotForm.generate over the C2 §5.3 subset
  ```

## Do not

- Do not add any npm dependency (no AST printer, no template library) — see
  "Where" above. If the string-builder approach feels insufficient, stop
  and report rather than reaching for a package.
- Do not emit `x.type` under any circumstances — see the `types.ts` doc
  comment above; the type system already prevents a caller from passing it,
  keep it that way.
- Do not let `generate` throw on a well-formed `PlotProps` — every field
  the type system admits must produce valid code. Malformed input (e.g. an
  empty `marks` array) is legal per the grammar ("a plot with no marks is
  legal but pointless") and must still generate, not throw.
- Do not hand-round-trip against `parse` in this task's tests — `parse`
  doesn't exist until Task 3. Task 2's tests only check `generate`'s output
  string.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value where
applicable (`strokeWidth` in px, domain values in the channel's native
unit); `// TODO(idl0):` never bare `// TODO`; A/A/A tests with blank lines
between sections; match surrounding hand-formatted style (no `cargo fmt`
equivalent needed here since this is TypeScript, but do not run a
formatter that reformats unrelated files — keep the diff to the three new
files plus the CHANGELOG line).

## Report back (concise)

Commit hash + `git show --stat`; the exact gate command and result line
(with `passed`/`failed` counts); per-step done/deviated; the indentation
and trailing-newline policy you chose for `generate`'s output (state it
explicitly, since Task 3 and the reviewer both need to match it exactly);
confirmation `x.type` does not appear anywhere in `types.ts`'s `XAxisProps`;
anything ambiguous you resolved (say how) or that needs a lead ruling (stop
and report instead of guessing — CLAUDE.md §1).

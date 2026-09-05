# L6 Task 11 review — CodeMirror Code pane and math mode

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook`,
branch `wave2-l6-notebook`. Commit under review: `c8f42d3` ("app: CodeMirror
Code pane with markdown/js/math modes; C2 §8-4 math tokenizer"), on top of
merge `53ebea2`. Scope: the four new files (`model/mathMode.ts`,
`model/mathMode.test.ts`, `model/functionCatalog.ts`,
`components/CodePane.tsx`) plus the one `CHANGELOG.md` line. Out of scope:
any later Task 9/10/R62 follow-up commits landing after `c8f42d3`.

## Gate command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/mathMode
```

`tsc` produced no output (silent, no errors). Vitest:

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

Reproduces the implementer's reported 10 passed / 0 failed.

Also ran, once, as permitted by the dispatch:
- `npx vitest run --coverage.reporter=json-summary src/routes/pages/Notebook/model` —
  11 test files / 78 tests passed (no regressions elsewhere in `model/`); no
  `coverage/coverage-summary.json` was produced (the coverage provider
  appears not wired into this project's vitest config, or the flag didn't
  take effect) — coverage graded by inspection instead, per the standing
  brief's fallback. No `coverage/` directory was left behind (nothing was
  created to delete).
- `npx vite build` — succeeded, 773 modules transformed, no errors. `dist/`
  deleted afterward.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical, Important, or Minor findings. | — |

## Checks performed (all pass)

- **Ownership / no new dependency.** `git show --stat c8f42d3` touches only
  the four named files under `Notebook/**` plus `CHANGELOG.md`. Diffed
  `app/package.json` and `app/package-lock.json` at this commit — empty
  diff, confirmed untouched. `grep -n "codemirror" app/package.json`
  confirms the three Q1 packages were already present pre-commit.
- **Transitive-dependency claim verified, not assumed.** `CodePane.tsx`
  imports from `@codemirror/autocomplete`, `@codemirror/commands`,
  `@codemirror/language`, `@codemirror/state`, `@codemirror/view`, and
  `@lezer/highlight` — none newly added to `package.json`. Confirmed all
  six exist as folders under `app/node_modules/@codemirror` and
  `@lezer/highlight` under `app/node_modules/@lezer`, i.e. genuinely
  transitive from the three pinned packages, not silently missing
  dependencies papered over by a stale `node_modules`.
- **C2 §8-4 grammar conformance (§3.1/§3.2).** `KEYWORDS` = `const, and, or,
  not` matches C2 §3.1's `const` and §3.2's keyword operators exactly; all
  four tagged `"keyword"`, never `"identifier"`/`"function"` — verified in
  code and by the "const line" and "and/or/not" tests. `[Channel Name]`
  bracketed refs captured as one token including embedded spaces (matches
  §3.1's "names may contain spaces" carve-out), verified by the dedicated
  spaced-channel-ref test. `{name}`/`{col[]}` table-cell refs (C2 §4)
  tokenized as a distinct `cellRef` kind, not conflated with `[...]`.
  `# label: ...` recognized via `LABEL_COMMENT_RE` distinct from a plain
  `#` comment, matching §3.1's display-name form. Two-char comparison
  operators (`<= >= == !=`) checked before single-char, so `<=` isn't
  split. Function-vs-identifier disambiguation ("immediately before `(`
  and in the catalog") matches the plan's Step 1 test list exactly (both
  the positive "butter(" and negative "foo(" cases are tested).
- **`MATH_FUNCTIONS` catalog vs. C2 §3.3.** Counted 69 `{ name: ... }`
  entries by direct grep of the array literal (not trusting the test's own
  assertion of `toHaveLength(69)`); counted exactly 6 entries with
  `status: "notImplemented"` (`sosfilt`, `spectrogram`, `hilbert`,
  `correlate`, `convolve`, `resample`) — matches C2 §3.3's stated 63/6
  split verbatim. Spot-checked signatures for several multi-shape rows
  against the contract table (`rms`, `min`/`max`, `detrend`, `butter`,
  `attitude`) — transcribed correctly, including the `|`-separated call
  shapes. `and`/`or`/`not` correctly excluded from the catalog (they are
  §3.2 grammar operators, not `call_function` dispatch entries) — the
  brief's explicit trap. `main(col[])` correctly excluded (table-cell-only,
  documented in the file's own header comment as living in C2 §4 instead).
  This is a manually transcribed second copy of the Rust catalog with no
  cross-check test against `rust/core/src/math/eval.rs` — but the task
  brief explicitly forbids reading `rust/` for this task ("do not open
  `rust/` to cross-check; that crosses the... boundary"), so an
  automated drift check against Rust is out of scope by ruling, not an
  omission. Flagging as a Note rather than a finding since the brief
  pre-empts it.
- **Byte-offset convention (the brief's specific ask).** `mathMode.ts`'s
  module doc comment and both `MathToken.start`/`end` field doc comments
  explicitly state the offsets are UTF-16 code units into the single
  `line` argument, name the reason (CodeMirror's own `StringStream`/
  `StreamLanguage` API is line-oriented and JS-string-indexed), and
  explicitly contrast this with `model/cells.ts`'s UTF-8 whole-document
  byte-range convention — this is the single named, documented boundary
  the brief required, not silent drift or an accidental reuse of Task 4's
  convention.
- **Debounce.** `CODE_CHANGE_DEBOUNCE_MS = 400` is a named constant with a
  unit (ms) in its identifier and a doc comment stating its rationale
  (comparison to `Settings/ProfileSection.tsx`'s 500ms) and citing P6 (no
  IPC on the interaction path). `onChange` fires with `update.state.doc.
  toString()` — the pane's own cell text, not any larger document; `code`
  is documented as "the cell's current source text (one cell's body, not
  the whole document)".
- **No IPC anywhere.** `git show c8f42d3 | grep -n "invoke("` — no hits.
  `CodePane.tsx` never imports from `@tauri-apps/api` or `ipc/*`; its two
  effects only construct/tear down an `EditorView` and sync a debounce
  timer — no async work is started at all, so the tightened
  IPC-effects rule (operating brief §4, "every effect that starts IPC or
  postMessage work") does not apply to this task; confirmed rather than
  assumed by reading both `useEffect` bodies in full.
- **`table` cells use JS mode.** `languageFor`'s `case "table": case "js":
  return javascript();` with a comment citing C2 §4's JSON body, matching
  the brief's explicit ruling.
- **`@lezer/highlight`'s `tags` usage is transitive, not new** — see
  dependency check above; `MATH_TOKEN_TAGS` maps each `MathTokenKind` to a
  real `tags.*` export (`tags.keyword`, `tags.variableName`, `tags.special
  (...)`, `tags.number`, `tags.operator`, `tags.function(...)`, `tags.
  lineComment`, `tags.docComment`) — all nine `MathTokenKind` values are
  covered in `MATH_TOKEN_TAGS`, none missing (Object literal typed
  `Record<MathTokenKind, Tag>`, so `tsc` itself would have caught an
  omission — confirmed the gate is silent).
- **`StreamLanguage`/`StreamParser`/`LanguageSupport` API verified against
  the vendored doc**, not memory: `docs/vendor/codemirror-6/
  reference-index.md` lines 3351–3397 confirm `StreamLanguage.define(spec:
  StreamParser<State>)`, `StreamParser.token(stream, state) → string |
  null` (fewer params in the implementation's `token(stream)` is a valid
  narrowing, TS allows a function with fewer declared parameters to
  satisfy a wider call signature), and `tokenTable` accepting a `Tag`-
  valued object exactly as used. `LanguageSupport` constructor at line
  2879 (`language, support?`) matches `new LanguageSupport(mathLanguage)`.
  No deviation from the vendored doc's API shape was needed or claimed.
- **Purity.** `mathMode.ts` and `functionCatalog.ts` import nothing but
  each other (`mathMode.ts` imports `MATH_FUNCTIONS` from
  `functionCatalog.ts`) — no React, no CodeMirror, no DOM global. The
  module doc comment explicitly states this design intent ("this file has
  no CodeMirror import so it stays unit-testable in isolation").
  `CodePane.tsx` (the impure, React/CodeMirror-importing file) is correctly
  the untested `.tsx` per CLAUDE.md §4.
- **CLAUDE.md §4 testing.** All 10 test names match the brief's Step 1
  list verbatim, character for character. Every test follows Arrange /
  Act / Assert with a blank line between sections. Test file location
  (`Notebook/model/mathMode.test.ts`, beside `mathMode.ts`) matches
  convention; the two `MATH_FUNCTIONS` tests are in `mathMode.test.ts` per
  the brief's explicit mechanical-convenience ruling, not split into
  `functionCatalog.test.ts`.
- **CLAUDE.md §5 documentation/errors.** Doc comment present on every
  exported symbol in all three model/component files (`MathTokenKind`,
  `MathToken`, `tokenizeMath`, `CatalogStatus`, `CatalogEntry`,
  `MATH_FUNCTIONS`, `CodePaneProps`, `CodePane`, plus the private consts).
  No `// TODO` of any form appears in the diff. `tokenizeMath` never
  throws — confirmed by reading the full function: every branch either
  advances `pos` and continues, or pushes a token; no `throw`, no
  unguarded array/string indexing that could throw on malformed input.
  No numeric value lacking a stated unit — `CODE_CHANGE_DEBOUNCE_MS`'s
  doc comment states "ms" in its identifier and prose; `MathToken.start`/
  `end`'s units are covered by the offset-convention doc comment above.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer.
  `git add` used explicit paths per the brief (confirmed by `git show
  --stat` matching the brief's exact file list, nothing extra pulled in).
  Nothing under `docs/` touched. No cargo/fmt/tarpaulin/doc invocation
  anywhere in the commit or reported by the implementer.
- **CHANGELOG.** The added bullet's text is byte-identical to the brief's
  Step 4 text, correctly placed under `[Unreleased] / Added`, appended
  above the prior top entry (Task 10's), not disturbing any other line.

## Verdict rationale

The math tokenizer is pure, hand-rolled per-token regex/scan logic exactly
as the brief permits (a highlighter, not a validity-deciding parser), and
correctly implements every C2 §3.1/§3.2 grammar distinction the brief's
ten tests exercise: keyword vs. identifier, channel-ref vs. cell-ref,
comment vs. label-comment, function vs. plain identifier. The 69-entry
catalog transcription is verified correct against the contract table by
independent count and spot-check, correctly excludes the `and/or/not`
grammar operators and the table-only `main` function per the brief's
explicit traps, and is exempt from a Rust cross-check by the brief's own
ruling. The one place this task could most easily have gone wrong — the
UTF-16-vs-UTF-8 offset convention the brief flagged as needing an explicit
documented boundary — is done exactly as asked, in both the module and
field doc comments, with a stated reason. `CodePane.tsx`'s CodeMirror
wiring matches the vendored API doc precisely (verified against
`reference-index.md`, not assumed), introduces no new dependency (six
`@codemirror`/`@lezer` imports all confirmed transitive), starts no IPC
and thus falls outside the tightened self-cancelling-effect rule, and
`table` cells correctly reuse the JS mode per the plan's ruling. Gate
reproduces the implementer's reported 10/10 pass with a silent `tsc`.
Nothing here needs a fix.

VERDICT: CLEAN

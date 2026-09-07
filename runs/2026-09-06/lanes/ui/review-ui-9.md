# Review: UI-9 — CodeMirror brand theme

Commit: `21f3df8` on branch `ui-notebook`
(`app: CodeMirror brand theme for md/js/math (UI-9)`)

Files touched: `CHANGELOG.md`, `app/src/routes/pages/Notebook/components/CodePane.tsx`,
`app/src/routes/pages/Notebook/editor/cmTheme.ts` (new),
`app/src/routes/pages/Notebook/editor/cmTheme.test.ts` (new).
Matches the brief's "Where" section exactly — nothing else touched.

## Gate

Ran once, whole suite, per the dispatch (not the brief's Notebook-only filter):

```
cd app && npx tsc --noEmit && npx vitest run
```

`tsc --noEmit`: clean, no output.
`vitest run`: **Test Files 116 passed (116), Tests 1086 passed (1086)**.
Non-zero `passed`. Implementer's reported "Notebook 498 passed / 46 files" is
consistent with a Notebook-only subset of this run; tsc-clean claim confirmed.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `cmTheme.test.ts:96` (`observedKinds.size).toBeGreaterThanOrEqual(8)`) | The test meant to prove "every `MathTokenKind` the mode emits has a role" only asserts **at least 8** of the 9 kinds were observed, not all 9. By hand-trace all 9 (`keyword identifier channelRef cellRef number operator function comment labelComment`) are in fact hit by the three fixture lines today, so the assignment is currently correct — but the assertion as written would still pass if a future regression stopped emitting one kind (e.g. broke the "function name before `(`" detection), silently losing the exact guarantee the brief and the module's own doc comment ("adding a math token kind without a colour fails the suite") promise. | Assert `observedKinds.size === 9` (or diff against the literal 9-member set), so a dropped kind fails the suite instead of passing at 8. |
| Minor | `cmTheme.ts:44-45` (`SYNTAX_ROLE_VARS`) | `operator` (`--chart-7`, rose `#e86fa6`) and `labelComment` (`--chart-8`, coral `#e05a63`) sit next to each other in the 8-hue cycle and are both pink/red hues, closer to each other than to the rest of the palette. Low practical impact — `operator` is common and `labelComment` is rare (only `# label:` comments) so they seldom appear adjacent on screen — but worth a note since the brief asked for one. | No action required; flagging for the record per the brief's ask. |

## Checks passed

- Every colour resolved through the injected `CssVarReader` from UI-8's
  `theme/series.ts`; no second resolver defined, no hex literal in
  `cmTheme.ts` itself (only in the test's stub map and in the doc-comment
  hue names). `tokenSheet.test.ts`-style existence check
  (`cmTheme.test.ts:26-40`) confirms all ten referenced var names really
  exist in `tokens.css`.
- `MissingThemeTokenError` (`cmTheme.ts:74-90`) mirrors
  `MissingChartTokenError`'s shape (message, `tokenName` field) and
  `resolveToken` throws rather than defaulting — verified by reading both
  classes side by side.
- All 9 `MathTokenKind`s (`mathMode.ts:39-48`) have a role in
  `SYNTAX_ROLE_VARS`; `SyntaxRole` is a superset (adds `string`, used only
  by the JS/markdown modes) so `Record<SyntaxRole, …>`'s compile-time
  totality already covers `MathTokenKind` structurally. Traced the test's
  three fixture lines token-by-token against `tokenizeMath` — all 9 kinds
  are exercised (see Important finding above re: the assertion's strength).
- `defaultHighlightStyle`: grepped the whole `app/src` tree — the only
  remaining occurrence is inside a doc comment in `cmTheme.ts` ("Replaces
  `@codemirror/language`'s `defaultHighlightStyle`"); no import, no runtime
  reference anywhere.
- Chrome tokens: background `--bg`, gutter `--surface-2` + `--rule`
  hairline, active line/gutter `--control`, selection `--control-active`,
  cursor `--fg`, focus via `outline: 2px solid var(--focus)` (never
  `box-shadow` — grepped, zero hits under `Notebook/`). Matches the
  interface doc's chrome list.
- `CodePane.tsx` diff is exactly the swap the brief specified: two removed
  lines (`defaultHighlightStyle` import + its `syntaxHighlighting` call),
  three added (two new imports, `brandHighlightStyle`/`brandEditorTheme`
  wired into the same extensions array). Debounce, `completionSource`,
  `languageFor`, `MATH_TOKEN_TAGS`, and the keymap are byte-identical —
  confirmed by reading the full pre/post file, not just the diff hunk.
- The dormant matching-bracket CSS (`.cm-matchingBracket`) is disclosed as
  a parity gap in both the module doc comment and the CHANGELOG entry,
  correctly stating `bracketMatching()` is not wired up in `CodePane.tsx`.
- Role→hue legibility otherwise reasonable: keyword/azure, function/green,
  string/amber, number/orange, channelRef/violet, cellRef/teal are all
  visually distinct; `identifier`/`comment` stay neutral per the brief's
  own recommendation (open question 1), which is a reasoned deviation
  disclosed in both the module doc comment and CHANGELOG, not a silent one.
- Tests are Arrange/Act/Assert with blank-line separation and named
  `thing — condition — result` per CLAUDE.md §4.
- CHANGELOG entry is accurate against the diff, including the parity gap.
- NUL-byte scan on all four touched files: none found (ASCII/UTF-8 text
  only, spot-checked by reading full file contents above).

## Verdict rationale

The implementation is scoped exactly to the brief, reuses UI-8's resolver
with no second one, removes `defaultHighlightStyle` cleanly, covers all 9
math token kinds today, and discloses its one deliberate deviation (neutral
identifier/comment) and its one parity gap (dormant bracket-match CSS)
honestly in both code and CHANGELOG. The one real gap is that the coverage
test's assertion (`>= 8`) is weaker than the guarantee it and the brief
claim to provide (all 9, provably) — a regression that drops a kind from
the tokenizer's actual output would not be caught. That is a real but
narrow test-quality gap, not a spec violation or a behavioural bug; nothing
here blocks the merge, but it should be tightened.

VERDICT: NEEDS_FIXES (0 Critical, 1 Important, 1 Minor)

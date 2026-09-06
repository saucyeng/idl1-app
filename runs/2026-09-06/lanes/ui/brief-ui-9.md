# UI-9 — CodeMirror brand theme

The editor stops looking like a default CodeMirror and starts looking like the
rest of the app: token colours from the 8-hue series cycle, chrome from the
brand tokens, for all three modes (markdown, JavaScript, math). ONE commit.

Worktree: `…/idl1-app-worktrees/ui-8` (the Notebook worktree).
**Depends on UI-8 committed in this worktree.** Merge `main` first (R19).

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/ui-8"
git merge-base --is-ancestor <UI-8 commit hash> HEAD && echo GATE-OK
test -f app/src/routes/pages/Notebook/theme/series.ts && echo SERIES-OK
```
Both must print, else STOP and report.

## Files to read first

This lane's `PLAN.md`; `UI-DIRECTION.md` decision 32; `app/src/styles/tokens.css`;
`app/src/routes/pages/Notebook/theme/series.ts` (UI-8's palette reader);
`app/src/routes/pages/Notebook/components/CodePane.tsx` in full — it already
builds the three modes, wires `syntaxHighlighting(defaultHighlightStyle)`, and
maps this lane's math token kinds to `@lezer/highlight` tags in
`MATH_TOKEN_TAGS`; `app/src/routes/pages/Notebook/model/mathMode.ts`
(`MathTokenKind`); `docs/vendor/codemirror-6/system-guide.md` and
`reference-index.md` (`EditorView.theme`, `HighlightStyle.define`,
`StreamParser.tokenTable`).

## Where

- **New:** `app/src/routes/pages/Notebook/editor/cmTheme.ts` + `cmTheme.test.ts`.
- **Edited:** `components/CodePane.tsx` — swap `defaultHighlightStyle` for the
  brand highlight style and add the editor theme extension. Nothing else in
  that file changes; the debounce, the completion source and the math parser
  stay exactly as they are.
- `CHANGELOG.md`.

## Interfaces

```ts
/** Which brand colour each syntax role takes. The eight roles map onto the
 *  series cycle (decision 32) so code and charts share one palette; chrome
 *  (gutter, selection, active line, cursor) comes from the surface ladder.
 *  A record, not a function, so the test can assert it is total. */
export type SyntaxRole =
  | "keyword" | "identifier" | "channelRef" | "cellRef"
  | "number" | "operator" | "function" | "comment" | "string" | "labelComment";
export const SYNTAX_ROLE_VARS: Record<SyntaxRole, string>;   // CSS var names only
/** The highlight style for all three modes, built from the resolved tokens. */
export function brandHighlightStyle(read: CssVarReader): HighlightStyle;
/** Editor chrome: background `--bg`, gutter `--surface-2` with a `--rule`
 *  hairline, selection `--control-active`, cursor `--fg`, focus ring
 *  `--focus`, mono at the body-small size with tabular figures. */
export function brandEditorTheme(read: CssVarReader): Extension;
```

Reuse UI-8's `CssVarReader`/`documentVars` — do not define a second reader.

## Tests (pure only; the editor is rendering)

- `SYNTAX_ROLE_VARS — every role — a CSS variable name defined in tokens.css`
  (read `tokens.css` from disk, as `styles/tokenSheet.test.ts` does, and assert
  each referenced name exists — this is the test that catches a typo'd token).
- `SYNTAX_ROLE_VARS — the record — total over SyntaxRole and free of hex`.
- `SYNTAX_ROLE_VARS — every MathTokenKind in mathMode.ts — has a role`
  (import the union's key list from `CodePane`'s `MATH_TOKEN_TAGS` domain or
  re-derive it; the point is that adding a math token kind without a colour
  fails the suite rather than rendering grey).
- `brandHighlightStyle — a stub reader — assigns distinct colours to keyword,
  number, string and comment`.

## Gate

```bash
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook
```
Non-zero `passed`; pre-existing Notebook tests unchanged.

## Steps

- [ ] 1. Entry gate. 2. `cmTheme.ts` + tests. 3. `CodePane.tsx`: brand
      highlight style and theme extension in place of the defaults. 4. Gate.
      5. `tokenSheet.test.ts` green. 6. NUL check. 7. CHANGELOG. 8. Commit
      `app: CodeMirror brand theme for md/js/math (UI-9)`.

## Do not

- Do not change the debounce, the completion source, the math tokenizer, or
  any keymap — UI-11 owns keyboard bindings.
- Do not add a CodeMirror package; `@lezer/highlight` is already transitive
  (`CodePane.tsx`'s doc comment records this) and nothing new is needed.
- Do not write a hex literal outside `tokens.css`.
- Do not restyle the surrounding panes — UI-10.

## Spec discipline

**No spec change needed.**

## Report back (≤15 lines)

Commit hash + `git show --stat`; `tsc` result; the filter's `passed` count and
that pre-existing counts are unchanged; the ten role→token assignments in one
compact line each or a short table; whether any `MathTokenKind` lacked a role;
whether `defaultHighlightStyle` is fully removed or still used as a base;
parity gaps; anything needing a ruling.

## Open questions

1. **Series hues for syntax, or the surface ladder?** Decision 32 says the
   series cycle. *Recommendation:* follow it, but keep comments on `--fg-faint`
   and identifiers on `--fg` — an eight-colour rainbow with nothing neutral is
   harder to read than idl0's chrome, and the decision is about where colour
   comes from, not that everything must be coloured.
2. **Line numbers on every mode?** `CodePane` enables `lineNumbers()` for all.
   *Recommendation:* keep them on JS and math, drop them for markdown prose
   cells if it is a one-line change; otherwise leave as is and note it.
3. **Light theme.** *Recommendation:* none — the theme reads variables, so a
   later `[data-theme=light]` block moves it for free. Do not build a second
   `HighlightStyle`.

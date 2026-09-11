/**
 * The Code pane's brand theme (UI-9, `UI-DIRECTION.md` decision 32): the
 * editor stops looking like default CodeMirror and starts sharing this
 * app's palette — syntax colours from the 8-hue chart series cycle
 * (`theme/series.ts`), chrome from the surface/rule ladder
 * (`styles/tokens.css`, UI-1). No hex literal lives in this file; every
 * colour is resolved at build time from a document's own custom properties
 * through the same {@link CssVarReader} contract `theme/series.ts` defines,
 * so the theme can never drift from `tokens.css` (enforced the same way
 * `tokenSheet.test.ts` enforces it repo-wide) and this module stays DOM-free
 * for testing (a stub reader in `cmTheme.test.ts`, `documentVars()` at real
 * call sites, `CodePane.tsx`).
 *
 * Two colour families, deliberately: the eight roles that map onto
 * `--chart-1`…`--chart-8` are the "paint" — keyword/function/string/number/
 * the two idl-specific reference kinds/operator/the label-comment form.
 * `identifier` and the plain `comment` role stay neutral (`--fg`/
 * `--fg-faint`) rather than joining the cycle: an eight-colour rainbow with
 * nothing neutral to rest the eye on reads as noisier than idl0's chrome,
 * and decision 32 says syntax colour *comes from* the series cycle, not
 * that literally every token must be coloured by it (brief-ui-9.md open
 * question 1).
 */
import { HighlightStyle } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags, type Tag } from "@lezer/highlight";

import type { CssVarReader } from "../theme/series";

/**
 * Which brand colour each syntax role takes. The eight roles that are not
 * `identifier`/`comment` map onto the series cycle (decision 32) so code
 * and charts share one palette; `identifier` and `comment` stay on the
 * neutral foreground ladder (see the module doc comment). A record, not a
 * function, so `cmTheme.test.ts` can assert it is total over
 * {@link SyntaxRole} at compile time (a missing key fails `tsc`) and can
 * read every referenced token name back out for its "exists in
 * `tokens.css`" check.
 */
export type SyntaxRole =
  | "keyword"
  | "identifier"
  | "channelRef"
  | "cellRef"
  | "number"
  | "operator"
  | "function"
  | "comment"
  | "string"
  | "labelComment";

/** {@link SyntaxRole} → the `tokens.css` custom-property name (UI-1) that
 *  colours it. CSS variable names only — never a hex literal — so this
 *  module has nothing for `tokenSheet.test.ts`'s repo-wide colour-literal
 *  scan to catch, and so `cmTheme.test.ts` can check each name really
 *  exists in `tokens.css`. */
export const SYNTAX_ROLE_VARS: Record<SyntaxRole, string> = {
  keyword: "--chart-1", // azure
  function: "--chart-2", // green
  string: "--chart-3", // amber
  number: "--chart-4", // orange
  channelRef: "--chart-5", // violet — idl1's own reference syntax, given the most distinct hue
  cellRef: "--chart-6", // teal
  operator: "--chart-7", // rose
  labelComment: "--chart-8", // coral
  identifier: "--fg", // neutral — see module doc comment
  comment: "--fg-faint", // neutral — see module doc comment
};

/**
 * Thrown when {@link CssVarReader} returns an empty string for a theme
 * token. Mirrors `theme/series.ts`'s `MissingChartTokenError`: a missing
 * token here is a build-time wiring bug (the token sheet not loaded, or a
 * renamed variable), never a value this module silently defaults, because
 * any hardcoded fallback would itself be the hex-literal-outside-
 * `tokens.css` problem this file exists to avoid.
 */
export class MissingThemeTokenError extends Error {
  /** The CSS custom property name that resolved to an empty value. */
  readonly tokenName: string;

  constructor(tokenName: string) {
    super(`Theme token "${tokenName}" resolved to an empty value — is tokens.css loaded in this document?`);
    this.name = "MissingThemeTokenError";
    this.tokenName = tokenName;
  }
}

/** Reads `tokenName` through `read`, throwing {@link MissingThemeTokenError}
 *  on an empty result — the same resolve-or-throw shape as `theme/
 *  series.ts`'s `seriesColor`, reused here rather than a second resolver
 *  with different (silently-defaulting) behaviour. */
function resolveToken(tokenName: string, read: CssVarReader): string {
  const value = read(tokenName).trim();
  if (value === "") {
    throw new MissingThemeTokenError(tokenName);
  }
  return value;
}

/** {@link SyntaxRole} → the `@lezer/highlight` tag(s) it colours, across
 *  all three of `CodePane.tsx`'s modes: `@codemirror/lang-javascript` and
 *  `@codemirror/lang-markdown` emit the general tags on the left
 *  (`variableName`, `comment`, `keyword`, `number`, `operator`, `string`,
 *  a `function`-wrapped `variableName`); the math `StreamLanguage`'s own
 *  `tokenTable` (`CodePane.tsx`'s `MATH_TOKEN_TAGS`) emits the two
 *  `special(...)` tags and `docComment` for idl1's own reference/label
 *  syntax. Kept in exact correspondence with `MATH_TOKEN_TAGS` so every
 *  `MathTokenKind` the math mode can emit has a coloured role here. */
const ROLE_TAGS: Record<SyntaxRole, Tag | readonly Tag[]> = {
  identifier: tags.variableName,
  comment: tags.comment,
  keyword: tags.keyword,
  number: tags.number,
  operator: tags.operator,
  string: tags.string,
  function: tags.function(tags.variableName),
  channelRef: tags.special(tags.variableName),
  cellRef: tags.special(tags.atom),
  labelComment: tags.docComment,
};

/** `HighlightStyle.define`'s own precedence rule ("styles defined further
 *  down in the list have higher CSS precedence") means the more specific
 *  math tags must be listed after the general tags they nest under —
 *  `channelRef`/`function` after `identifier`, `labelComment` after
 *  `comment` — so a math cell's reference/label tokens get their own
 *  colour rather than inheriting `identifier`'s or `comment`'s. */
const ROLE_ORDER: readonly SyntaxRole[] = [
  "identifier",
  "comment",
  "keyword",
  "number",
  "operator",
  "string",
  "function",
  "channelRef",
  "cellRef",
  "labelComment",
];

/** The highlight style for all three of `CodePane.tsx`'s modes (markdown,
 *  JavaScript, math), built from {@link SYNTAX_ROLE_VARS} resolved through
 *  `read`. Replaces `@codemirror/language`'s `defaultHighlightStyle`. */
export function brandHighlightStyle(read: CssVarReader): HighlightStyle {
  return HighlightStyle.define(
    ROLE_ORDER.map((role) => ({
      tag: ROLE_TAGS[role],
      color: resolveToken(SYNTAX_ROLE_VARS[role], read),
    })),
  );
}

/** The body-small text size (`tokens.css`'s `--text-body-small`, 12px) the
 *  editor's own text renders at — one step down from the app's default
 *  `--text-body`, matching a code pane's usual density relative to prose. */
const EDITOR_FONT_SIZE_VAR = "--text-body-small";

/**
 * Editor chrome for all three `CodePane.tsx` modes: background `--bg`,
 * gutter `--surface-2` with a `--rule` hairline, active line/gutter
 * `--control`, selection `--control-active`, cursor `--fg`, a matching-
 * bracket highlight (dormant until a later task adds `bracketMatching()`;
 * styled now so the class name is already covered by a token, not a
 * literal), and the `--focus` ring on focus via `outline` — never
 * `box-shadow` (UI-DIRECTION: depth/emphasis is a token, not elevation).
 * Mono at {@link EDITOR_FONT_SIZE_VAR} with tabular figures, matching
 * `tokens.css`'s root rule for the rest of the app.
 */
export function brandEditorTheme(read: CssVarReader): Extension {
  const bg = resolveToken("--bg", read);
  const fg = resolveToken("--fg", read);
  const surface2 = resolveToken("--surface-2", read);
  const rule = resolveToken("--rule", read);
  const control = resolveToken("--control", read);
  const controlActive = resolveToken("--control-active", read);
  const focus = resolveToken("--focus", read);
  const fontMono = resolveToken("--font-mono", read);
  const fontSize = resolveToken(EDITOR_FONT_SIZE_VAR, read);

  return EditorView.theme(
    {
      "&": {
        backgroundColor: bg,
        color: fg,
        fontFamily: fontMono,
        fontSize,
        fontVariantNumeric: "tabular-nums",
      },
      ".cm-content": {
        caretColor: fg,
      },
      ".cm-gutters": {
        backgroundColor: surface2,
        color: fg,
        border: "none",
        borderRight: `1px solid ${rule}`,
      },
      ".cm-activeLineGutter": {
        backgroundColor: control,
      },
      ".cm-activeLine": {
        backgroundColor: control,
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: fg,
      },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: controlActive,
      },
      "&.cm-focused": {
        outline: `2px solid ${focus}`,
        outlineOffset: "-1px",
      },
      ".cm-matchingBracket, .cm-nonmatchingBracket": {
        backgroundColor: controlActive,
        outline: `1px solid ${rule}`,
      },
      // The builtin hover (ruling R222 item 2). Themed here with the rest
      // of the editor's chrome rather than in a stylesheet, so it takes the
      // same resolved tokens the surrounding editor took.
      ".cm-tooltip": {
        backgroundColor: surface2,
        border: `1px solid ${rule}`,
        color: fg,
      },
      ".cm-builtin-tooltip": {
        display: "flex",
        flexDirection: "column",
        gap: "2px",
        maxWidth: "42ch",
        padding: "6px 8px",
      },
      ".cm-builtin-tooltip-signature": {
        fontFamily: fontMono,
      },
      ".cm-builtin-tooltip-description, .cm-builtin-tooltip-unit, .cm-builtin-tooltip-hint": {
        opacity: "0.75",
      },
    },
    { dark: true },
  );
}

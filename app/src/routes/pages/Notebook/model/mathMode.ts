/**
 * A pure, line-oriented tokenizer for the C2 §3.1/§3.2 math grammar
 * (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`), assigned to
 * this lane by C2 §8-4's open question 4 ("CodeMirror math-mode
 * tokenizer"). It exists to drive a CodeMirror `StreamLanguage`
 * highlighter — `CodePane.tsx` wraps {@link tokenizeMath} in a
 * `StreamLanguage`/`LanguageSupport` (`@codemirror/language`); this file
 * has no CodeMirror import so it stays unit-testable in isolation.
 *
 * This is a highlighter, not the evaluator's parser: `rust/core/src/
 * math/{token,parse,eval}.rs` remains the sole authority on whether a
 * math cell is valid or what it evaluates to (C3 §3.4). A tokenizer that
 * mis-highlights a rare or malformed construct is a cosmetic bug here, not
 * a silent-wrong-value bug — this module never rejects a line, it just
 * does its best to classify each recognisable run of characters. Any
 * character this tokenizer does not recognise as the start of one of the
 * kinds below (whitespace, parentheses, commas, string-literal quotes, a
 * bare `.`) is simply skipped and produces no token; a caller wanting
 * complete line coverage does not get it from this module.
 *
 * **Offset convention.** {@link MathToken.start}/{@link MathToken.end} are
 * **UTF-16 code unit offsets into the single `line` string argument** —
 * *not* the UTF-8 byte offsets `Notebook/model/cells.ts` uses for
 * whole-document cell ranges. The two conventions are deliberately
 * different here: `tokenizeMath` operates one line at a time through
 * CodeMirror's own `StreamLanguage`/`StringStream` API, whose `pos`/`start`
 * fields are themselves JS-string (UTF-16) offsets into that one line, and
 * `CodePane.tsx` sets `stream.pos` directly from `MathToken.end` — so this
 * file matches `StringStream`'s own unit rather than `cells.ts`'s
 * document-wide byte-offset convention.
 */

import { MATH_FUNCTIONS } from "./functionCatalog";

/** C2 §3.1's identifier/number/operator/comment tokens for one line of a
 *  math cell's source, for CodeMirror's StreamLanguage highlighting. Pure
 *  — no CodeMirror imports in this file; StreamLanguage wraps it in
 *  CodePane.tsx. */
export type MathTokenKind =
  | "keyword" // const, and, or, not
  | "identifier"
  | "channelRef" // [Channel Name] (C2 §3.1)
  | "cellRef" // {cell} or {col[]} (table-cell reference, C2 §4)
  | "number"
  | "operator" // + - * / < > <= >= == != and the definition/const '='
  | "function" // a MATH_FUNCTIONS name immediately before '('
  | "comment" // # ... (not a label comment)
  | "labelComment"; // # label: ... (C2 §3.1's display-name form)

/** Every {@link MathTokenKind} value, exactly once. The `Record<MathTokenKind,
 *  true>` below is total over the union by construction — TypeScript
 *  rejects this file if a kind is ever added to {@link MathTokenKind}
 *  without a matching entry here — so callers (notably
 *  `cmTheme.test.ts`'s coverage test) can treat {@link ALL_MATH_TOKEN_KINDS}
 *  as the type's own canonical member list rather than re-typing it and
 *  risking drift. */
const ALL_MATH_TOKEN_KINDS_MAP: Record<MathTokenKind, true> = {
  keyword: true,
  identifier: true,
  channelRef: true,
  cellRef: true,
  number: true,
  operator: true,
  function: true,
  comment: true,
  labelComment: true,
};

/** {@link MathTokenKind}'s full member set, derived from {@link
 *  ALL_MATH_TOKEN_KINDS_MAP}'s compile-time totality — see that constant's
 *  doc comment. */
export const ALL_MATH_TOKEN_KINDS: readonly MathTokenKind[] = Object.keys(
  ALL_MATH_TOKEN_KINDS_MAP,
) as MathTokenKind[];

/** One classified run of characters within a single tokenized line. */
export interface MathToken {
  kind: MathTokenKind;
  text: string;
  /** UTF-16 code unit offset into the tokenized `line`, inclusive. See the
   *  module doc comment's "Offset convention". */
  start: number;
  /** UTF-16 code unit offset into the tokenized `line`, exclusive. */
  end: number;
}

/** C2 §3.1's `const` and C2 §3.2's `and`/`or`/`not` keyword operators —
 *  grouped under {@link MathTokenKind}'s `"keyword"` per that type's own
 *  doc comment. C2 §3.2 calls `and`/`or`/`not` "binary/unary, keyword"
 *  operators at the grammar level, but this tokenizer's `MathTokenKind`
 *  union has one `"keyword"` kind covering all four names, not a separate
 *  kind for keyword-operators versus `const` — so all four are tagged
 *  `"keyword"`, never `"identifier"` and never `"function"`. */
const KEYWORDS = new Set(["const", "and", "or", "not"]);

/** Every C2 §3.3 catalog name, for the "immediately before `(`" function
 *  lookup below. Built once from {@link MATH_FUNCTIONS} rather than
 *  duplicated here. */
const FUNCTION_NAMES = new Set(MATH_FUNCTIONS.map((entry) => entry.name));

/** Matches a `# label: <text>` display-name comment (C2 §3.1): the literal
 *  word `label` (case-sensitive, matching the grammar's own spelling)
 *  immediately after `#` (optional surrounding whitespace), then a colon.
 *  Anything else starting with `#` is a plain comment. */
const LABEL_COMMENT_RE = /^#\s*label\s*:/;

/** C2 §3.1's `number` literal shape, without the leading `-?` (a leading
 *  minus is tokenized as a separate `"operator"` token here — this
 *  tokenizer does not attempt the unary-vs-binary-minus disambiguation the
 *  real parser performs, since a highlighting mis-classification of a
 *  literal's sign is cosmetic, per the module doc comment). */
const NUMBER_RE = /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/;

/** C2 §3.1's `identifier` shape, reused for both channel-definition names
 *  and keyword/function/plain-identifier lookups below. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

/** C2 §3.2's two-character comparison operators, checked before the
 *  single-character set so `<=` is not mis-split into `<` and `=`. */
const TWO_CHAR_OPERATORS = ["<=", ">=", "==", "!="];

/** C2 §3.2's single-character arithmetic/comparison operators, plus the
 *  definition/const line's `=` (C2 §3.1's `const_line`/`def_line` grammar
 *  — not itself part of the §3.2 expression grammar, but tokenized here as
 *  an ordinary `"operator"` token since `MathTokenKind` has no separate
 *  "assignment" kind). */
const SINGLE_CHAR_OPERATORS = new Set(["+", "-", "*", "/", "<", ">", "="]);

/**
 * Tokenizes one line of a math cell's source into classified runs, per C2
 * §3.1/§3.2's grammar. Never throws: an unrecognised character is skipped
 * (see the module doc comment) rather than raised as an error, since this
 * is a highlighter, not a validator.
 *
 * @param line one line of math-cell source, with no trailing `\n`.
 */
export function tokenizeMath(line: string): MathToken[] {
  const tokens: MathToken[] = [];
  let pos = 0;

  while (pos < line.length) {
    const ch = line[pos];

    if (ch === " " || ch === "\t") {
      pos += 1;
      continue;
    }

    if (ch === "#") {
      const rest = line.slice(pos);
      const kind: MathTokenKind = LABEL_COMMENT_RE.test(rest) ? "labelComment" : "comment";
      tokens.push({ kind, text: rest, start: pos, end: line.length });
      break; // a comment runs to end of line; nothing follows it
    }

    if (ch === "[") {
      const close = line.indexOf("]", pos + 1);
      const end = close === -1 ? line.length : close + 1;
      tokens.push({ kind: "channelRef", text: line.slice(pos, end), start: pos, end });
      pos = end;
      continue;
    }

    if (ch === "{") {
      const close = line.indexOf("}", pos + 1);
      const end = close === -1 ? line.length : close + 1;
      tokens.push({ kind: "cellRef", text: line.slice(pos, end), start: pos, end });
      pos = end;
      continue;
    }

    const numberMatch = NUMBER_RE.exec(line.slice(pos));
    if (numberMatch) {
      const text = numberMatch[0];
      const end = pos + text.length;
      tokens.push({ kind: "number", text, start: pos, end });
      pos = end;
      continue;
    }

    const identifierMatch = IDENTIFIER_RE.exec(line.slice(pos));
    if (identifierMatch) {
      const text = identifierMatch[0];
      const end = pos + text.length;
      let kind: MathTokenKind;
      if (KEYWORDS.has(text)) {
        kind = "keyword";
      } else if (line[end] === "(" && FUNCTION_NAMES.has(text)) {
        kind = "function";
      } else {
        kind = "identifier";
      }
      tokens.push({ kind, text, start: pos, end });
      pos = end;
      continue;
    }

    const twoChar = line.slice(pos, pos + 2);
    if (TWO_CHAR_OPERATORS.includes(twoChar)) {
      tokens.push({ kind: "operator", text: twoChar, start: pos, end: pos + 2 });
      pos += 2;
      continue;
    }

    if (SINGLE_CHAR_OPERATORS.has(ch)) {
      tokens.push({ kind: "operator", text: ch, start: pos, end: pos + 1 });
      pos += 1;
      continue;
    }

    // Punctuation with no highlighted MathTokenKind (parentheses, commas,
    // string-literal quotes, a bare '.') — advance past it untokenized.
    pos += 1;
  }

  return tokens;
}

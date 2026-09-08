/**
 * A narrow, **non-authoritative** C2 §3.2 scan of one `def_line`/`const_line`
 * right-hand side (an `expression`), for the maths graph view: what it
 * references, and — when the whole expression is exactly one catalog-function
 * call — that call's name and its literal argument text.
 * `rust/core/src/math/{token,parse,eval}.rs` remains the sole authority on
 * whether an expression is valid or what it evaluates to (C3 §3.4, C2 §3.2);
 * this module's job is only to feed the graph's edges and a node card's
 * parameter display, on the same "fast and good-enough" footing `cells.ts`
 * documents for `scanCells` (ruling R52 Q3(a)).
 *
 * **Reuses `tokenizeMath` rather than re-tokenizing.** Reference extraction
 * ({@link scanMathExpr}'s `refs`) is built entirely on `mathMode.ts`'s
 * `tokenizeMath` — the same tokenizer `CodePane.tsx` highlights with — so
 * the graph's edges and the editor's highlighting can never disagree about
 * what a `[Name]` reference is. `tokenizeMath` does not classify parentheses,
 * commas, or string-literal quotes at all (its own doc comment: they are
 * "punctuation with no highlighted `MathTokenKind`"), so the outer-call and
 * argument-splitting logic below tracks bracket depth and quote state
 * directly over the character stream — this is call *structure*, a
 * different grammar layer than token *classification*, and not a second
 * implementation of anything `tokenizeMath` already does.
 */

import { MATH_FUNCTIONS } from "./functionCatalog";
import { tokenizeMath } from "./mathMode";

/** The outer call of an expression that is, in its entirety, exactly one
 *  catalog-function call (`name(arg, arg, ...)`) — nothing before it, nothing
 *  after its closing paren but whitespace. */
export interface MathExprCall {
  /** The function name, as it appears immediately before `(` (C2 §3.3). */
  name: string;
  /** Each top-level argument's raw source text, trimmed, in order — "literal"
   *  in the sense of "the literal characters written", not "a JS literal
   *  value"; an argument may itself be a nested call, a `[Name]` reference,
   *  or an arbitrary sub-expression. */
  args: string[];
}

/** One expression's non-authoritative C2 §3.2 scan result. */
export interface MathExprInfo {
  /** Every `[Name]` reference in the expression, in first-appearance order,
   *  deduplicated. A reference may name another math definition or a raw
   *  session channel — this module does not distinguish the two (that needs
   *  the document-wide namespace, built by `graphModel.ts`). */
  refs: string[];
  /** The outer call, or `null` for an **opaque expression** — anything that
   *  is not, as a whole, a single catalog-function call: an operator
   *  expression (`x + y`), a bare reference (`[Speed]`), a call wrapped in
   *  more than itself (`butter(...) * 2`), or a call to a name outside the
   *  §3.3 catalog. Mirrors the `plotForm` "custom code" precedent: an opaque
   *  expression is still wired into the graph by its `refs`, it just has no
   *  parameter card of its own. */
  call: MathExprCall | null;
}

/** Every C2 §3.3 catalog function name — the outer-call check accepts only
 *  these, matching `tokenizeMath`'s own `"function"` token kind (an
 *  identifier immediately followed by `(` that is also in this set). */
const FUNCTION_NAMES = new Set(MATH_FUNCTIONS.map((entry) => entry.name));

/** Extracts every `[Name]` reference from `expr`, in first-appearance order,
 *  deduplicated, via {@link tokenizeMath}'s `"channelRef"` tokens. A
 *  malformed/unterminated `[...]` (no closing `]`) is skipped — it is not a
 *  well-formed reference this module can name. */
function extractRefs(expr: string): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const token of tokenizeMath(expr)) {
    if (token.kind !== "channelRef") continue;
    if (!token.text.startsWith("[") || !token.text.endsWith("]") || token.text.length < 2) continue;
    const name = token.text.slice(1, -1);
    if (seen.has(name)) continue;
    seen.add(name);
    refs.push(name);
  }
  return refs;
}

/** Finds the index of the character matching the `(` at `openIndex`, tracking
 *  depth across `()`/`[]`/`{}` uniformly (this only needs to know when
 *  nesting returns to zero, not which bracket kind closed which — the
 *  expression is assumed well-formed, since a malformed one is Rust's error
 *  to report, not this module's to diagnose) and skipping the contents of
 *  `"..."` string literals (C2 §3.3's quoted axis/mode arguments) so a comma
 *  or bracket inside a string never perturbs depth. Returns `null` if the
 *  brackets never balance (again: not this module's problem to report, just
 *  a signal that this expression isn't a clean outer call). */
function findMatchingClose(text: string, openIndex: number): number | null {
  let depth = 0;
  let inString = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

/** Splits the text strictly between a call's parentheses into its top-level
 *  arguments, trimmed, respecting nested brackets and `"..."` string
 *  literals exactly as {@link findMatchingClose} does. `""` (a zero-argument
 *  call) yields `[]`, not `[""]`. */
function splitTopLevelArgs(argsText: string): string[] {
  if (argsText.trim().length === 0) return [];

  const args: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";

  for (const ch of argsText) {
    if (inString) {
      current += ch;
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  args.push(current.trim());
  return args;
}

/** Recognises `expr` as a single outer catalog-function call spanning the
 *  whole (trimmed) expression, or returns `null` (opaque). */
function scanOuterCall(trimmed: string): MathExprCall | null {
  if (trimmed.length === 0) return null;

  const tokens = tokenizeMath(trimmed);
  const first = tokens[0];
  if (first === undefined) return null;
  if (first.kind !== "identifier" && first.kind !== "function") return null;
  if (first.start !== 0) return null;
  if (!FUNCTION_NAMES.has(first.text)) return null;
  if (trimmed[first.end] !== "(") return null;

  const openIndex = first.end;
  const closeIndex = findMatchingClose(trimmed, openIndex);
  if (closeIndex === null) return null;
  if (closeIndex !== trimmed.length - 1) return null; // something follows the call — not the whole expression

  const argsText = trimmed.slice(openIndex + 1, closeIndex);
  return { name: first.text, args: splitTopLevelArgs(argsText) };
}

/**
 * Scans one `def_line`/`const_line` expression's right-hand side text for
 * its `[Name]` references and, if it is exactly one catalog-function call,
 * that call's name and arguments. Never throws; an expression this module
 * can't fully make sense of degrades to `{ refs, call: null }` (opaque) —
 * never a guess.
 */
export function scanMathExpr(expr: string): MathExprInfo {
  return { refs: extractRefs(expr), call: scanOuterCall(expr.trim()) };
}

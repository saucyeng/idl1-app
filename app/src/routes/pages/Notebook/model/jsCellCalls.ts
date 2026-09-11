/**
 * Finds every `channel(...)`/`spectrum(...)`/`histogram(...)`/`scatter(...)`
 * call a `js` cell's source text makes, without requiring the cell to be one recognised
 * `Plot.plot({...})` form (ruling R148 part 2, `runs/2026-09-03/decisions.md`).
 * `plotForm/parse.ts`'s `parse` demands the whole cell match a closed
 * grammar — a `height:` key, an extra statement, a `stroke: "var(...)"`, or
 * any token outside that grammar makes it return `null`, and until this
 * module existed that also meant "the host cannot see this cell's
 * `channel(...)` calls", so a hand-written cell was guaranteed to bind no
 * data at all. This module answers a much narrower question — "which
 * `channel`/`spectrum` calls does this text make, syntactically" — over the
 * *whole* source, not over one recognised call structure.
 *
 * **Two passes, matching `mathExpr.ts`'s precedent** ("extracts references
 * from an arbitrary expression using the shared tokenizer instead of
 * demanding a fixed shape"): a lenient, string/comment-aware character scan
 * ({@link findCallSpans}) locates each top-level `channel(`/`spectrum(`
 * *call site* in the raw text — skipping identifiers found inside a string
 * literal, a template literal, a `//`/`/* *‍/` comment, or after a `.`
 * (a property access, e.g. some other object's own `.channel(...)` method,
 * is not this grammar's `channel_call`) — and then each call's own text
 * span (from the identifier to its matching `)`) is handed to
 * `plotForm/parse.ts`'s existing tokenizer and `readChannelCall`/
 * `readSpectrumCall` readers. **No second JS parser**: the call-site scan
 * only tracks bracket depth and string/comment boundaries (the same kind of
 * character-level structure `mathExpr.ts`'s `findMatchingClose`/
 * `splitTopLevelArgs` already track), never argument grammar — recognising
 * `channel("x", {lap: 1})` itself is entirely `parse.ts`'s job, reused
 * as-is.
 *
 * A call whose own span doesn't tokenize (e.g. `channel(\`x\`)`, a template
 * literal argument — outside the grammar `readChannelCall` accepts) or
 * doesn't fully match `readChannelCall`/`readSpectrumCall` is simply
 * omitted, exactly as an unresolvable reference is omitted elsewhere in
 * this lane (`mathExpr.ts`'s `extractRefs` skips a malformed `[...]` the
 * same way) — never a guess at what the author meant.
 */
import { readChannelCall, readHistogramCall, readScatterCall, readSpectrumCall, tokenize, type Cursor } from "../plotForm/parse";
import type { FftParams, HistogramParams, ScatterParams } from "../plotForm/types";

/** One `channel(...)` call this scan found, decoded exactly as
 *  `readChannelCall` would from a full parse. */
export interface ChannelCallRef {
  channel: string;
  lap: number | null;
}

/** One `spectrum(...)` call this scan found, decoded exactly as
 *  `readSpectrumCall` would from a full parse. */
export interface SpectrumCallRef {
  channel: string;
  fft: FftParams;
}

/** One `histogram(...)` call this scan found (ruling R215 item 2), decoded
 *  exactly as `readHistogramCall` would from a full parse. */
export interface HistogramCallRef {
  channel: string;
  histogram: HistogramParams;
}

/** One `scatter(...)` call this scan found (ruling R215 item 3), decoded
 *  exactly as `readScatterCall` would from a full parse. Two channel names,
 *  not one — the only data call in this grammar that names two. */
export interface ScatterCallRef {
  xChannel: string;
  yChannel: string;
  scatter: ScatterParams;
}

/** One `name(` call site the raw-text scan located: `name` is the
 *  identifier text (`"channel"` or `"spectrum"`), `start` is its first
 *  character's index, `end` is the index just past its matching `)`. */
interface CallSpan {
  name: string;
  start: number;
  end: number;
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_$]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$]/.test(c);
}

/** Advances past a string/template literal starting at `code[start]`
 *  (the opening quote), honouring backslash escapes, to the index just
 *  past the matching closing quote. An unterminated literal advances to
 *  the end of `code` — nothing further to skip. Does not resolve
 *  `${...}` interpolation inside a template literal (matching `parse.ts`'s
 *  tokenizer, which rejects backticks outright): a `channel(...)` call
 *  written inside a template interpolation is not found by this scan. */
function skipStringLiteral(code: string, start: number): number {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === "\\") {
      i += 2;
      continue;
    }
    if (code[i] === quote) return i + 1;
    i++;
  }
  return code.length;
}

/** If `code[i]` opens a `//` line comment, a `/* *‍/` block comment, or a
 *  string/template literal, returns the index to resume scanning from
 *  (past it); otherwise returns `null` and the caller advances by one
 *  ordinary character. Shared by {@link findCallSpans}'s call-site scan and
 *  {@link findMatchingParen}'s depth count, so the two never disagree about
 *  what counts as "not code structure". */
function skipNonStructural(code: string, i: number): number | null {
  const c = code[i];
  if (c === "/" && code[i + 1] === "/") {
    const nl = code.indexOf("\n", i);
    return nl === -1 ? code.length : nl;
  }
  if (c === "/" && code[i + 1] === "*") {
    const end = code.indexOf("*/", i + 2);
    return end === -1 ? code.length : end + 2;
  }
  if (c === '"' || c === "'" || c === "`") {
    return skipStringLiteral(code, i);
  }
  return null;
}

/** Finds the `)` matching the `(` at `code[openIndex]`, tracking `()`
 *  depth only (this scan doesn't need to know a call's *argument*
 *  structure, only where it ends) and skipping comments/string literals
 *  via {@link skipNonStructural} so a `)` inside either never perturbs
 *  depth. `null` if the parens never balance before `code` ends. */
function findMatchingParen(code: string, openIndex: number): number | null {
  let depth = 0;
  let i = openIndex;
  while (i < code.length) {
    const skip = skipNonStructural(code, i);
    if (skip !== null) {
      i = skip;
      continue;
    }
    const c = code[i];
    if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return null;
}

/** The last non-whitespace character before index `i`, or `undefined` if
 *  `code[0..i)` is empty or all whitespace. Used to reject `obj.channel(...)`
 *  — a property access on some other value, not this grammar's bare
 *  `channel_call` — without needing a real property-access grammar. */
function precedingNonSpace(code: string, i: number): string | undefined {
  let k = i - 1;
  while (k >= 0 && /\s/.test(code[k])) k--;
  return k >= 0 ? code[k] : undefined;
}

/** Scans `code` end to end for every top-level call site named `name`
 *  (`"channel"` or `"spectrum"`): a bare identifier (not preceded by `.`,
 *  not itself part of a longer identifier — the whole-word match already
 *  guarantees the latter), immediately followed (whitespace allowed) by
 *  `(`, outside any string literal or comment. */
function findCallSpans(code: string, name: string): CallSpan[] {
  const spans: CallSpan[] = [];
  let i = 0;
  while (i < code.length) {
    const skip = skipNonStructural(code, i);
    if (skip !== null) {
      i = skip;
      continue;
    }

    const c = code[i];
    if (!isIdentStart(c)) {
      i++;
      continue;
    }

    let j = i + 1;
    while (j < code.length && isIdentPart(code[j])) j++;
    const word = code.slice(i, j);

    if (word !== name || precedingNonSpace(code, i) === ".") {
      i = j;
      continue;
    }

    let k = j;
    while (k < code.length && /\s/.test(code[k])) k++;
    if (code[k] !== "(") {
      i = j;
      continue;
    }

    const closeIndex = findMatchingParen(code, k);
    if (closeIndex === null) {
      i = j;
      continue;
    }

    spans.push({ name, start: i, end: closeIndex + 1 });
    i = closeIndex + 1;
  }
  return spans;
}

/**
 * Every `channel(...)` call `code` makes, in source order, decoded via
 * `plotForm/parse.ts`'s existing tokenizer and `readChannelCall` reader —
 * each call's own text span is re-tokenized in isolation, so a call
 * elsewhere in the cell that doesn't fit that grammar (or any surrounding
 * code the whole-cell `parse` would reject) has no bearing on this one.
 * A call whose span doesn't tokenize or doesn't fully match
 * `readChannelCall` is omitted. Pure; never throws.
 */
export function extractChannelCalls(code: string): ChannelCallRef[] {
  const calls: ChannelCallRef[] = [];
  for (const span of findCallSpans(code, "channel")) {
    const tokens = tokenize(code.slice(span.start, span.end));
    if (tokens === null) continue;
    const cursor: Cursor = { tokens, pos: 0 };
    const result = readChannelCall(cursor);
    if (result === null || cursor.pos !== tokens.length) continue;
    calls.push({ channel: result.channel, lap: result.lap });
  }
  return calls;
}

/**
 * Every `spectrum(...)` call `code` makes, in source order — same
 * mechanism as {@link extractChannelCalls}, via `readSpectrumCall`.
 */
export function extractSpectrumCalls(code: string): SpectrumCallRef[] {
  const calls: SpectrumCallRef[] = [];
  for (const span of findCallSpans(code, "spectrum")) {
    const tokens = tokenize(code.slice(span.start, span.end));
    if (tokens === null) continue;
    const cursor: Cursor = { tokens, pos: 0 };
    const result = readSpectrumCall(cursor);
    if (result === null || cursor.pos !== tokens.length) continue;
    calls.push({ channel: result.channel, fft: result.fft });
  }
  return calls;
}

/**
 * Every `histogram(...)` call `code` makes, in source order (ruling R215
 * item 2) — same mechanism as {@link extractChannelCalls}, via
 * `readHistogramCall`.
 */
export function extractHistogramCalls(code: string): HistogramCallRef[] {
  const calls: HistogramCallRef[] = [];
  for (const span of findCallSpans(code, "histogram")) {
    const tokens = tokenize(code.slice(span.start, span.end));
    if (tokens === null) continue;
    const cursor: Cursor = { tokens, pos: 0 };
    const result = readHistogramCall(cursor);
    if (result === null || cursor.pos !== tokens.length) continue;
    calls.push({ channel: result.channel, histogram: result.histogram });
  }
  return calls;
}

/**
 * Every `scatter(...)` call `code` makes, in source order (ruling R215 item
 * 3) — same mechanism as {@link extractChannelCalls}, via `readScatterCall`.
 */
export function extractScatterCalls(code: string): ScatterCallRef[] {
  const calls: ScatterCallRef[] = [];
  for (const span of findCallSpans(code, "scatter")) {
    const tokens = tokenize(code.slice(span.start, span.end));
    if (tokens === null) continue;
    const cursor: Cursor = { tokens, pos: 0 };
    const result = readScatterCall(cursor);
    if (result === null || cursor.pos !== tokens.length) continue;
    calls.push({ xChannel: result.xChannel, yChannel: result.yChannel, scatter: result.scatter });
  }
  return calls;
}

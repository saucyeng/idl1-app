import {
  FFT_DETRENDS,
  FFT_SCALINGS,
  FFT_WINDOW_FUNCTIONS,
  FFT_AVERAGINGS,
  HISTOGRAM_BIN_MODES,
  HISTOGRAM_NORMALISATIONS,
  MARK_NAMES,
  SPECTRUM_MARK_NAMES,
  type FftParams,
  type FftPlotProps,
  type FftXAxisProps,
  type HistogramMarkProps,
  type HistogramParams,
  type HistogramPlotProps,
  type MarkProps,
  type PlotProps,
  type ScatterMarkProps,
  type ScatterParams,
  type ScatterPlotProps,
  type SpectrumMarkProps,
  type TimePlotProps,
  type XAxisProps,
  type YAxisProps,
} from "./types";

/** A lexical token produced by {@link tokenize}: an identifier (bare word),
 *  a decoded string literal, a decoded numeric literal, or one of the
 *  grammar's punctuation characters (`{ } [ ] ( ) , : .`). Exported so
 *  {@link tokenize}'s callers outside this module (`model/jsCellCalls.ts`,
 *  ruling R148 part 2) can type a `Cursor` over it. */
export type Token =
  | { kind: "ident"; value: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "punct"; value: string };

/** The reader's position in a token stream. Every `read*`/`consume*`
 *  function below either advances `pos` and returns a value, or leaves
 *  `pos` unchanged and returns `null` (never a partial advance), so a
 *  caller can safely try an alternative production. */
export interface Cursor {
  tokens: Token[];
  pos: number;
}

/** The outcome of parsing one recognised object field: either the decoded
 *  value, or `{ ok: false }` when the key is unrecognised or its value does
 *  not match the grammar. Both cases make the whole cell custom (C2 §5.3's
 *  "no partial match" rule) rather than a silently dropped field. */
type FieldResult = { ok: true; value: unknown } | { ok: false };

/** Parses one `js` cell's source into `plotForm`'s Properties-pane state,
 *  or `null` when the code falls outside C2 §5.3's closed grammar (the
 *  "custom code" signal, design §6). Never executes the code: a
 *  hand-rolled recursive-descent reader over a hand-rolled tokenizer,
 *  never `eval`/`new Function`, never a whole-source regex. Never throws:
 *  a syntax error in an author's mid-edit cell is legal input and simply
 *  parses to `null`. */
export function parse(code: string): PlotProps | null {
  const tokens = tokenize(code);
  if (tokens === null) return null;

  const cursor: Cursor = { tokens, pos: 0 };
  const props = readPlotCall(cursor);
  if (props === null) return null;

  // No leftover tokens: a second statement, a second Plot.plot call, or
  // trailing punctuation after the recognised call all make the cell custom.
  if (cursor.pos !== tokens.length) return null;

  return props;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

function isIdentStart(c: string): boolean {
  return /[A-Za-z_$]/.test(c);
}

function isIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$]/.test(c);
}

/** Decodes a single- or double-quoted string literal starting at
 *  `code[start]` (the opening quote). Handles the standard JS backslash
 *  escapes plus `\uXXXX`. Returns `null` on an unterminated string or an
 *  unrecognised escape; never throws. */
function readQuotedString(code: string, start: number): { value: string; next: number } | null {
  const quote = code[start];
  let i = start + 1;
  let out = "";

  const escapes: Record<string, string> = {
    n: "\n",
    t: "\t",
    r: "\r",
    b: "\b",
    f: "\f",
    '"': '"',
    "'": "'",
    "\\": "\\",
    "/": "/",
  };

  while (i < code.length) {
    const c = code[i];
    if (c === quote) return { value: out, next: i + 1 };

    if (c === "\\") {
      const next = code[i + 1];
      if (next === undefined) return null;
      if (next === "u") {
        const hex = code.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      const decoded = escapes[next];
      if (decoded === undefined) return null;
      out += decoded;
      i += 2;
      continue;
    }

    out += c;
    i++;
  }
  return null; // unterminated string
}

/** Reads a `js_number` literal (optionally negative, optionally
 *  fractional, optionally exponential) starting at `code[start]`. Returns
 *  `null` if no digits follow the optional sign. */
function readNumberLiteral(code: string, start: number): { value: number; next: number } | null {
  let i = start;
  if (code[i] === "-") i++;

  const digitsStart = i;
  while (isDigit(code[i])) i++;
  if (i === digitsStart) return null;

  if (code[i] === ".") {
    i++;
    const fracStart = i;
    while (isDigit(code[i])) i++;
    if (i === fracStart) return null;
  }

  if (code[i] === "e" || code[i] === "E") {
    let j = i + 1;
    if (code[j] === "+" || code[j] === "-") j++;
    const expStart = j;
    while (isDigit(code[j])) j++;
    if (j === expStart) return null;
    i = j;
  }

  const value = Number(code.slice(start, i));
  if (Number.isNaN(value)) return null;
  return { value, next: i };
}

/** Splits `code` into tokens over the grammar's tiny vocabulary
 *  (identifiers, string literals, number literals, and the punctuation
 *  `{ } [ ] ( ) , : .`). Returns `null` (making the whole cell custom) on
 *  a `//` or block comment (a comment is not part of the grammar at all,
 *  so its mere presence disqualifies the cell), a backtick template
 *  literal (this subset does not distinguish a plain template from an
 *  interpolated one, so both are rejected), or any character outside the
 *  supported set. Exported (unchanged) for {@link Cursor}'s other
 *  consumer, `model/jsCellCalls.ts` (ruling R148 part 2): a `channel(...)`/
 *  `spectrum(...)` call span extracted from a larger, otherwise-unparseable
 *  cell is itself well within this grammar, so it re-tokenizes with this
 *  same function rather than a second one. */
export function tokenize(code: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const n = code.length;

  while (i < n) {
    const c = code[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (c === "/" && (code[i + 1] === "/" || code[i + 1] === "*")) {
      return null;
    }

    if (c === '"' || c === "'") {
      const result = readQuotedString(code, i);
      if (result === null) return null;
      tokens.push({ kind: "string", value: result.value });
      i = result.next;
      continue;
    }

    if (c === "`") {
      return null;
    }

    if (c === "-" && isDigit(code[i + 1])) {
      const result = readNumberLiteral(code, i);
      if (result === null) return null;
      tokens.push({ kind: "number", value: result.value });
      i = result.next;
      continue;
    }

    if (isDigit(c)) {
      const result = readNumberLiteral(code, i);
      if (result === null) return null;
      tokens.push({ kind: "number", value: result.value });
      i = result.next;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(code[j])) j++;
      tokens.push({ kind: "ident", value: code.slice(i, j) });
      i = j;
      continue;
    }

    if ("{}[](),:.".includes(c)) {
      tokens.push({ kind: "punct", value: c });
      i++;
      continue;
    }

    return null; // outside the grammar's supported character set
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Cursor primitives, each either advances and returns a value, or leaves
// the cursor untouched and returns null/false.
// ---------------------------------------------------------------------------

function consumeIdent(c: Cursor, expected: string): boolean {
  const t = c.tokens[c.pos];
  if (t !== undefined && t.kind === "ident" && t.value === expected) {
    c.pos++;
    return true;
  }
  return false;
}

function consumeAnyIdent(c: Cursor): string | null {
  const t = c.tokens[c.pos];
  if (t !== undefined && t.kind === "ident") {
    c.pos++;
    return t.value;
  }
  return null;
}

function consumePunct(c: Cursor, expected: string): boolean {
  const t = c.tokens[c.pos];
  if (t !== undefined && t.kind === "punct" && t.value === expected) {
    c.pos++;
    return true;
  }
  return false;
}

function consumeString(c: Cursor): string | null {
  const t = c.tokens[c.pos];
  if (t !== undefined && t.kind === "string") {
    c.pos++;
    return t.value;
  }
  return null;
}

function consumeNumber(c: Cursor): number | null {
  const t = c.tokens[c.pos];
  if (t !== undefined && t.kind === "number") {
    c.pos++;
    return t.value;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Recursive-descent reader: readPlotCall -> readPlotOptions -> readMarksArray
// -> readMark -> readChannelCall -> readMarkOptions, plus the x/y/color
// option readers. The FFT branch mirrors this shape one level down:
// readFftMarksArray -> readSpectrumMark -> readSpectrumCall -> readSpectrumOptions.
// ---------------------------------------------------------------------------

type FieldParser = (key: string, c: Cursor) => FieldResult;

/** Reads a brace-delimited, comma-separated `key: value` object body,
 *  order-insensitive (C2 §5.3: object keys may appear in any order when
 *  hand-edited). `parseField` decides, per key, whether it is recognised
 *  and whether its value matches the grammar; an unrecognised key, an
 *  invalid value, or a repeated key all fail the whole object, never a
 *  partial result. */
function readBracedFields(c: Cursor, parseField: FieldParser): Record<string, unknown> | null {
  const start = c.pos;
  if (!consumePunct(c, "{")) {
    c.pos = start;
    return null;
  }

  const result: Record<string, unknown> = {};
  if (consumePunct(c, "}")) return result;

  for (;;) {
    const key = consumeAnyIdent(c);
    if (key === null || !consumePunct(c, ":")) {
      c.pos = start;
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      c.pos = start;
      return null;
    }

    const field = parseField(key, c);
    if (!field.ok) {
      c.pos = start;
      return null;
    }
    result[key] = field.value;

    if (consumePunct(c, ",")) continue;
    break;
  }

  if (!consumePunct(c, "}")) {
    c.pos = start;
    return null;
  }
  return result;
}

function readDomain(c: Cursor): [number, number] | null {
  const start = c.pos;
  if (!consumePunct(c, "[")) {
    c.pos = start;
    return null;
  }
  const a = consumeNumber(c);
  if (a === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const b = consumeNumber(c);
  if (b === null || !consumePunct(c, "]")) {
    c.pos = start;
    return null;
  }
  return [a, b];
}

/** Fields of a time cell's `x_scale` object. `type` is syntactically part
 *  of C2 §5.3's grammar for a time cell, but `XAxisProps` has no field for
 *  it (§8-2, never emitted by `generate` for a time cell — an FFT cell's
 *  x axis is the distinct {@link FftXAxisProps} instead), so admitting it
 *  here would silently drop it on the next `generate()` call. Its mere
 *  presence therefore makes the whole cell custom, regardless of its
 *  value — this is also how a time cell's `x.type: "log"` (legal only on
 *  an FFT cell, C2 §5.3) is rejected. */
function parseXField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "label": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "domain": {
      const v = readDomain(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

function readXScale(c: Cursor): XAxisProps | null {
  const fields = readBracedFields(c, parseXField);
  if (fields === null) return null;
  const x: XAxisProps = {};
  if (fields.label !== undefined) x.label = fields.label as string;
  if (fields.domain !== undefined) x.domain = fields.domain as [number, number];
  return x;
}

/** Fields of an FFT cell's `x_scale` object (C2 §5.3): `label`, `domain`,
 *  and `type` (required, closed to `"linear"`/`"log"` — `FFT_X_AXIS_TYPES`). */
function parseFftXField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "label": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "domain": {
      const v = readDomain(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "type": {
      const v = consumeString(c);
      return v === "linear" || v === "log" ? { ok: true, value: v } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

/** Reads an FFT cell's `x_scale`, requiring `type` to be present (R80 Q1:
 *  an FFT cell's `x` is required and always carries `type` — an FFT `x`
 *  object without `type` is not a shorter valid form, it is custom code). */
function readFftXScale(c: Cursor): FftXAxisProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseFftXField);
  if (fields === null || fields.type === undefined) {
    c.pos = start;
    return null;
  }
  const x: FftXAxisProps = { type: fields.type as "linear" | "log" };
  if (fields.label !== undefined) x.label = fields.label as string;
  if (fields.domain !== undefined) x.domain = fields.domain as [number, number];
  return x;
}

function parseYField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "label": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "domain": {
      const v = readDomain(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "type": {
      const v = consumeString(c);
      if (v === "linear" || v === "log" || v === "sqrt" || v === "pow") return { ok: true, value: v };
      return { ok: false };
    }
    case "exponent": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

/** Reads a `y_scale` object. `exponent` and `type: "pow"` are required to
 *  appear **together** (ruling R215 item 5): a `"pow"` scale with no
 *  exponent has no defined shape, and an `exponent` on any other scale type
 *  would be silently dropped by the next `generate()` call — both are
 *  custom code, not shorter valid forms. That mutual requirement is why
 *  this reader checks after `readBracedFields` rather than in
 *  `parseYField`, which sees one key at a time. */
function readYScale(c: Cursor): YAxisProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseYField);
  if (fields === null) return null;
  if ((fields.type === "pow") !== (fields.exponent !== undefined)) {
    c.pos = start;
    return null;
  }
  const y: YAxisProps = {};
  if (fields.label !== undefined) y.label = fields.label as string;
  if (fields.domain !== undefined) y.domain = fields.domain as [number, number];
  if (fields.type !== undefined) y.type = fields.type as NonNullable<YAxisProps["type"]>;
  if (fields.exponent !== undefined) y.exponent = fields.exponent as number;
  return y;
}

function parseColorField(key: string, c: Cursor): FieldResult {
  if (key !== "legend") return { ok: false };
  if (!consumeIdent(c, "true")) return { ok: false };
  return { ok: true, value: true };
}

/** Reads a `color_opt` object: `{ legend: true }`, and only that. The
 *  grammar admits no other field, and `legend` is required, not
 *  optional. */
function readColorOpt(c: Cursor): { legend: true } | null {
  const fields = readBracedFields(c, parseColorField);
  if (fields === null || fields.legend !== true) return null;
  return { legend: true };
}

/** Reads a mark's `channel_call`: `channel("name")` or
 *  `channel("name", { lap: n })`. Session scope (no `{lap: ...}` object)
 *  is always reported as `lap: null`, the canonical, always-present form
 *  matching `MarkProps.lap`'s doc comment ("null for session scope"),
 *  never an omitted key, so a caller can always deep-equal against an
 *  explicit `lap: null | number`. Exported for `model/jsCellCalls.ts`
 *  (ruling R148 part 2), which tokenizes one extracted `channel(...)` call
 *  span at a time and runs this same reader over it, rather than requiring
 *  the whole cell to match {@link readPlotCall}'s grammar. */
export function readChannelCall(c: Cursor): { channel: string; lap: number | null } | null {
  const start = c.pos;
  if (!consumeIdent(c, "channel") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const name = consumeString(c);
  if (name === null) {
    c.pos = start;
    return null;
  }

  let lap: number | null = null;
  if (consumePunct(c, ",")) {
    if (!consumePunct(c, "{") || !consumeIdent(c, "lap") || !consumePunct(c, ":")) {
      c.pos = start;
      return null;
    }
    const lapValue = consumeNumber(c);
    if (lapValue === null || !Number.isInteger(lapValue) || !consumePunct(c, "}")) {
      c.pos = start;
      return null;
    }
    lap = lapValue;
  }

  if (!consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }
  return { channel: name, lap };
}

function parseMarkOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "x": {
      // `"t"` (session time) or `"tr"` (lap-relative time, ruling R215
      // items 4-5). Any other literal makes the cell custom.
      const v = consumeString(c);
      return v === "t" || v === "tr" ? { ok: true, value: v } : { ok: false };
    }
    case "y": {
      const v = consumeString(c);
      return v === "v" ? { ok: true, value: v } : { ok: false };
    }
    case "stroke": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "strokeWidth": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

/** Reads a mark's `mark_options`: `x` (required, `"t"` or `"tr"`) and
 *  `y` (required, always `"v"`), order-insensitive with the optional
 *  fields, plus optional `stroke`/`strokeWidth`. Any other key, an `x`
 *  outside those two literals, or a `y` that is not `"v"`, makes the cell
 *  custom. */
function readMarkOptions(c: Cursor): { xField?: "tr"; stroke?: string; strokeWidth?: number } | null {
  const fields = readBracedFields(c, parseMarkOptionField);
  if (fields === null || (fields.x !== "t" && fields.x !== "tr") || fields.y !== "v") return null;

  const options: { xField?: "tr"; stroke?: string; strokeWidth?: number } = {};
  // `"t"` normalises to the field being absent — `MarkProps.xField`'s one
  // spelling for "session time" (see its doc comment), which is what keeps
  // `parse(generate(p))` deep-equal to `p` with no second normalisation.
  if (fields.x === "tr") options.xField = "tr";
  if (fields.stroke !== undefined) options.stroke = fields.stroke as string;
  if (fields.strokeWidth !== undefined) options.strokeWidth = fields.strokeWidth as number;
  return options;
}

/** Reads one `mark` production: `Plot.<mark_name>(channel_call, mark_options)`. */
function readMark(c: Cursor): MarkProps | null {
  const start = c.pos;
  if (!consumeIdent(c, "Plot") || !consumePunct(c, ".")) {
    c.pos = start;
    return null;
  }

  const markName = consumeAnyIdent(c);
  if (markName === null || !(MARK_NAMES as readonly string[]).includes(markName)) {
    c.pos = start;
    return null;
  }

  if (!consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const channelResult = readChannelCall(c);
  if (channelResult === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const markOptions = readMarkOptions(c);
  if (markOptions === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }

  const mark: MarkProps = {
    channel: channelResult.channel,
    mark: markName as MarkProps["mark"],
    lap: channelResult.lap,
  };
  if (markOptions.xField !== undefined) mark.xField = markOptions.xField;
  if (markOptions.stroke !== undefined) mark.stroke = markOptions.stroke;
  if (markOptions.strokeWidth !== undefined) mark.strokeWidth = markOptions.strokeWidth;
  return mark;
}

/** Reads a `marks_array`: `[]` or a comma-separated list of `mark`
 *  productions. An empty array is legal (mirrors `generate`'s handling of
 *  `marks: []`). */
/** Reads C2 §5.3's `zero_rule` production — `Plot.ruleY([0])`, exactly
 *  (ruling R215 item 5). Told apart from a `ruleY` *channel* mark by the
 *  `[` where that production has `channel(`, so no lookahead is needed
 *  beyond this reader's own cursor reset. Returns `false` without moving
 *  the cursor when the next tokens are not this literal call. */
function readZeroRule(c: Cursor): boolean {
  const start = c.pos;
  if (
    consumeIdent(c, "Plot") &&
    consumePunct(c, ".") &&
    consumeIdent(c, "ruleY") &&
    consumePunct(c, "(") &&
    consumePunct(c, "[") &&
    consumeNumber(c) === 0 &&
    consumePunct(c, "]") &&
    consumePunct(c, ")")
  ) {
    return true;
  }
  c.pos = start;
  return false;
}

/** Reads a `marks_array`: `[]`, or an optional leading `zero_rule`
 *  followed by a comma-separated list of `mark` productions. An empty array
 *  is legal (mirrors `generate`'s handling of `marks: []`). Returns the
 *  marks plus whether the zero line was present, since `TimePlotProps`
 *  carries the latter as its own `zeroLine` flag rather than as a mark
 *  nothing else in the form could edit. */
function readMarksArray(c: Cursor): { marks: MarkProps[]; zeroLine: boolean } | null {
  const start = c.pos;
  if (!consumePunct(c, "[")) {
    c.pos = start;
    return null;
  }

  const marks: MarkProps[] = [];
  if (consumePunct(c, "]")) return { marks, zeroLine: false };

  const zeroLine = readZeroRule(c);
  if (zeroLine) {
    // `[Plot.ruleY([0])]` alone: a zero line and no data marks. Legal, the
    // same way `marks: []` is.
    if (consumePunct(c, "]")) return { marks, zeroLine };
    if (!consumePunct(c, ",")) {
      c.pos = start;
      return null;
    }
  }

  for (;;) {
    const mark = readMark(c);
    if (mark === null) {
      c.pos = start;
      return null;
    }
    marks.push(mark);
    if (consumePunct(c, ",")) continue;
    break;
  }

  if (!consumePunct(c, "]")) {
    c.pos = start;
    return null;
  }
  return { marks, zeroLine };
}

// ---------------------------------------------------------------------------
// FFT branch: window_size/hop_size, fft_params, spectrum_call, spectrum_mark,
// fft_marks (C2 §5.3, added 2026-09-06).
// ---------------------------------------------------------------------------

/** Reads a `window_size`/`hop_size` value (C2 §5.3): a `js_int`, or the
 *  literal string `"all"`. Any other string, or a non-integer number,
 *  fails. */
function readWindowOrHop(c: Cursor): number | "all" | null {
  const start = c.pos;
  const asString = consumeString(c);
  if (asString !== null) {
    if (asString === "all") return "all";
    c.pos = start;
    return null;
  }
  const asNumber = consumeNumber(c);
  if (asNumber !== null && Number.isInteger(asNumber)) return asNumber;
  c.pos = start;
  return null;
}

function parseFftParamsField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "windowSize":
    case "hopSize": {
      const v = readWindowOrHop(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "window": {
      const v = consumeString(c);
      return v !== null && (FFT_WINDOW_FUNCTIONS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false };
    }
    case "detrend": {
      const v = consumeString(c);
      return v !== null && (FFT_DETRENDS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false };
    }
    case "scaling": {
      const v = consumeString(c);
      return v !== null && (FFT_SCALINGS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false };
    }
    case "averaging": {
      const v = consumeString(c);
      return v !== null && (FFT_AVERAGINGS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

/** The six keys `fft_params` requires, all of them, per C2 §5.3 ("a missing
 *  key is custom code, not a default"). */
const FFT_PARAMS_KEYS = ["windowSize", "hopSize", "window", "detrend", "scaling", "averaging"] as const;

/** Reads a `spectrum_call`'s `fft_params` object, requiring every key in
 *  {@link FFT_PARAMS_KEYS} to be present (an extra key is already rejected
 *  by `readBracedFields`'s "unrecognised key" path; a missing one is
 *  rejected here). */
function readFftParams(c: Cursor): FftParams | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseFftParamsField);
  if (fields === null || !FFT_PARAMS_KEYS.every((k) => fields[k] !== undefined)) {
    c.pos = start;
    return null;
  }
  return {
    windowSize: fields.windowSize as number | "all",
    hopSize: fields.hopSize as number | "all",
    window: fields.window as FftParams["window"],
    detrend: fields.detrend as FftParams["detrend"],
    scaling: fields.scaling as FftParams["scaling"],
    averaging: fields.averaging as FftParams["averaging"],
  };
}

/** Reads a `spectrum_call`: `spectrum("name", {fft_params})`. `lap` is
 *  never expressible here (C2 §5.3: "`lap` is not expressible on
 *  `spectrum_call`") — there is no third argument in this production at
 *  all, so a hand-written third argument (of any shape, including
 *  `{ lap: n }`) simply fails to match `)` immediately after `fft_params`
 *  and makes the whole cell custom. Exported for `model/jsCellCalls.ts`
 *  (ruling R148 part 2) — same reuse rationale as {@link readChannelCall}. */
export function readSpectrumCall(c: Cursor): { channel: string; fft: FftParams } | null {
  const start = c.pos;
  if (!consumeIdent(c, "spectrum") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const name = consumeString(c);
  if (name === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const fft = readFftParams(c);
  if (fft === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }
  return { channel: name, fft };
}

function parseSpectrumOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "x": {
      const v = consumeString(c);
      return v === "f" ? { ok: true, value: v } : { ok: false };
    }
    case "y": {
      const v = consumeString(c);
      return v === "m" ? { ok: true, value: v } : { ok: false };
    }
    case "stroke": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "strokeWidth": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

/** Reads a `spectrum_mark`'s `spectrum_options`: the fixed literal pair
 *  `x: "f"`, `y: "m"` (C2 §5.3: "Mark options bind `"f"`/`"m"`, never
 *  `"t"`/`"v"`"), plus optional `stroke`/`strokeWidth`. */
function readSpectrumOptions(c: Cursor): { stroke?: string; strokeWidth?: number } | null {
  const fields = readBracedFields(c, parseSpectrumOptionField);
  if (fields === null || fields.x !== "f" || fields.y !== "m") return null;

  const options: { stroke?: string; strokeWidth?: number } = {};
  if (fields.stroke !== undefined) options.stroke = fields.stroke as string;
  if (fields.strokeWidth !== undefined) options.strokeWidth = fields.strokeWidth as number;
  return options;
}

/** Reads one `spectrum_mark` production:
 *  `Plot.<spectrum_mark_name>(spectrum_call, spectrum_options)`. */
function readSpectrumMark(c: Cursor): SpectrumMarkProps | null {
  const start = c.pos;
  if (!consumeIdent(c, "Plot") || !consumePunct(c, ".")) {
    c.pos = start;
    return null;
  }

  const markName = consumeAnyIdent(c);
  if (markName === null || !(SPECTRUM_MARK_NAMES as readonly string[]).includes(markName)) {
    c.pos = start;
    return null;
  }

  if (!consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const call = readSpectrumCall(c);
  if (call === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const options = readSpectrumOptions(c);
  if (options === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }

  const mark: SpectrumMarkProps = {
    channel: call.channel,
    mark: markName as SpectrumMarkProps["mark"],
    fft: call.fft,
  };
  if (options.stroke !== undefined) mark.stroke = options.stroke;
  if (options.strokeWidth !== undefined) mark.strokeWidth = options.strokeWidth;
  return mark;
}

/** Reads an `fft_marks` array: `[` one `spectrum_mark` `]`, exactly one —
 *  no comma, no second element (C2 §5.3: "An FFT cell has exactly one
 *  mark"). A second mark of either kind after a comma fails this reader,
 *  which is the correct "two spectrum marks ⇒ null" / "mixing ⇒ null"
 *  behaviour: this reader is only ever tried once {@link detectChartKind}
 *  has seen the array's first element call `spectrum(`. */
function readFftMarksArray(c: Cursor): SpectrumMarkProps | null {
  const start = c.pos;
  if (!consumePunct(c, "[")) {
    c.pos = start;
    return null;
  }
  const mark = readSpectrumMark(c);
  if (mark === null || !consumePunct(c, "]")) {
    c.pos = start;
    return null;
  }
  return mark;
}

// ---------------------------------------------------------------------------
// Histogram branch: histogram_params, histogram_call, histogram_mark,
// histogram_marks (C2 §5.3, ruling R215 item 2, added 2026-09-11).
// ---------------------------------------------------------------------------

/** Reads a bare `true`/`false` identifier as a boolean (C2 §5.3's
 *  `js_bool`). The tokenizer has no boolean token kind — `true` and
 *  `false` arrive as plain identifiers, the same way `color_opt`'s
 *  `legend: true` already does — so this is the one place that mapping
 *  lives, rather than two call sites each spelling out `consumeIdent`. */
function readBool(c: Cursor): boolean | null {
  const start = c.pos;
  if (consumeIdent(c, "true")) return true;
  c.pos = start;
  if (consumeIdent(c, "false")) return false;
  c.pos = start;
  return null;
}

function parseHistogramParamsField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "binMode": {
      const v = consumeString(c);
      return v !== null && (HISTOGRAM_BIN_MODES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false };
    }
    case "binValue": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "symmetric": {
      const v = readBool(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "normalise": {
      const v = consumeString(c);
      return v !== null && (HISTOGRAM_NORMALISATIONS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false };
    }
    default:
      return { ok: false };
  }
}

/** The four keys `histogram_params` requires, all of them, per C2 §5.3
 *  ("a missing key is custom code, not a default"). */
const HISTOGRAM_PARAMS_KEYS = ["binMode", "binValue", "symmetric", "normalise"] as const;

/** Reads a `histogram_call`'s `histogram_params` object, requiring every key
 *  in {@link HISTOGRAM_PARAMS_KEYS} (an extra key is already rejected by
 *  `readBracedFields`'s "unrecognised key" path; a missing one here).
 *  `symmetric` is read through {@link readBool} rather than a truthiness
 *  check, so a `symmetric: false` cell is recognised rather than falling
 *  out of the grammar. */
function readHistogramParams(c: Cursor): HistogramParams | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseHistogramParamsField);
  if (fields === null || !HISTOGRAM_PARAMS_KEYS.every((k) => fields[k] !== undefined)) {
    c.pos = start;
    return null;
  }
  return {
    binMode: fields.binMode as HistogramParams["binMode"],
    binValue: fields.binValue as number,
    symmetric: fields.symmetric as boolean,
    normalise: fields.normalise as HistogramParams["normalise"],
  };
}

/** Reads a `histogram_call`: `histogram("name", {histogram_params})`.
 *  `lap` is not expressible here, for the same reason it is not on
 *  `spectrum_call` (C2 §5.3): the window a histogram is binned over is the
 *  caller's selection, not a token in the document. Exported for
 *  `model/jsCellCalls.ts`, which re-tokenizes one extracted call span at a
 *  time — same reuse rationale as {@link readChannelCall} and
 *  {@link readSpectrumCall}. */
export function readHistogramCall(c: Cursor): { channel: string; histogram: HistogramParams } | null {
  const start = c.pos;
  if (!consumeIdent(c, "histogram") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const name = consumeString(c);
  if (name === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const histogram = readHistogramParams(c);
  if (histogram === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }
  return { channel: name, histogram };
}

function parseHistogramOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "x1": {
      const v = consumeString(c);
      return v === "v0" ? { ok: true, value: v } : { ok: false };
    }
    case "x2": {
      const v = consumeString(c);
      return v === "v1" ? { ok: true, value: v } : { ok: false };
    }
    case "y": {
      const v = consumeString(c);
      return v === "n" ? { ok: true, value: v } : { ok: false };
    }
    case "fill": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "fillOpacity": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

/** Reads a `histogram_mark`'s `histogram_options`: the fixed literal triple
 *  `x1: "v0"`, `x2: "v1"`, `y: "n"` (all three required, order-insensitive
 *  with the optional fields), plus optional `fill`/`fillOpacity`. */
function readHistogramOptions(c: Cursor): { fill?: string; fillOpacity?: number } | null {
  const fields = readBracedFields(c, parseHistogramOptionField);
  if (fields === null || fields.x1 !== "v0" || fields.x2 !== "v1" || fields.y !== "n") return null;

  const options: { fill?: string; fillOpacity?: number } = {};
  if (fields.fill !== undefined) options.fill = fields.fill as string;
  if (fields.fillOpacity !== undefined) options.fillOpacity = fields.fillOpacity as number;
  return options;
}

/** Reads one `histogram_mark` production:
 *  `Plot.rectY(histogram_call, histogram_options)`. The mark name is fixed
 *  (C2 §5.3, ruling R215 item 2) — `Plot.lineY(histogram(...), ...)` is
 *  custom code, not a second legal spelling, because `lineY` has no `x2`
 *  channel to bind a bin's far edge to. */
function readHistogramMark(c: Cursor): HistogramMarkProps | null {
  const start = c.pos;
  if (!consumeIdent(c, "Plot") || !consumePunct(c, ".") || !consumeIdent(c, "rectY") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const call = readHistogramCall(c);
  if (call === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const options = readHistogramOptions(c);
  if (options === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }

  const mark: HistogramMarkProps = { channel: call.channel, histogram: call.histogram };
  if (options.fill !== undefined) mark.fill = options.fill;
  if (options.fillOpacity !== undefined) mark.fillOpacity = options.fillOpacity;
  return mark;
}

/** Reads a `histogram_marks` array: `[` one `histogram_mark` `]`, exactly
 *  one — same "exactly one mark" rule as `fft_marks`, and for the same
 *  reason (one `fetch_histogram` call resolves one distribution). */
function readHistogramMarksArray(c: Cursor): HistogramMarkProps | null {
  const start = c.pos;
  if (!consumePunct(c, "[")) {
    c.pos = start;
    return null;
  }
  const mark = readHistogramMark(c);
  if (mark === null || !consumePunct(c, "]")) {
    c.pos = start;
    return null;
  }
  return mark;
}

// ---------------------------------------------------------------------------
// Scatter branch: scatter_params, scatter_call, scatter_mark, scatter_marks
// (C2 §5.3, ruling R215 item 3, added 2026-09-11).
// ---------------------------------------------------------------------------

function parseScatterParamsField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "pointBudget": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "equalAspect": {
      const v = readBool(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

/** The two keys `scatter_params` requires, both of them, per C2 §5.3. */
const SCATTER_PARAMS_KEYS = ["pointBudget", "equalAspect"] as const;

/** Reads a `scatter_call`'s `scatter_params` object, requiring both keys. */
function readScatterParams(c: Cursor): ScatterParams | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseScatterParamsField);
  if (fields === null || !SCATTER_PARAMS_KEYS.every((k) => fields[k] !== undefined)) {
    c.pos = start;
    return null;
  }
  return { pointBudget: fields.pointBudget as number, equalAspect: fields.equalAspect as boolean };
}

/** Reads a `scatter_call`: `scatter("x", "y", {scatter_params})`. Two
 *  channel names, not one — the only data call in this grammar that names
 *  two, which is also what makes a scatter cell recognisable. Exported for
 *  `model/jsCellCalls.ts`, same reuse rationale as {@link readChannelCall}. */
export function readScatterCall(c: Cursor): { xChannel: string; yChannel: string; scatter: ScatterParams } | null {
  const start = c.pos;
  if (!consumeIdent(c, "scatter") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const xChannel = consumeString(c);
  if (xChannel === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const yChannel = consumeString(c);
  if (yChannel === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const scatter = readScatterParams(c);
  if (scatter === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }
  return { xChannel, yChannel, scatter };
}

function parseScatterOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "x": {
      const v = consumeString(c);
      return v === "x" ? { ok: true, value: v } : { ok: false };
    }
    case "y": {
      const v = consumeString(c);
      return v === "y" ? { ok: true, value: v } : { ok: false };
    }
    case "fill": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "r": {
      const v = consumeNumber(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false };
  }
}

/** Reads a `scatter_mark`'s `scatter_options`: the fixed literal pair
 *  `x: "x"`, `y: "y"` (both required), plus optional `fill`/`r`. */
function readScatterOptions(c: Cursor): { fill?: string; r?: number } | null {
  const fields = readBracedFields(c, parseScatterOptionField);
  if (fields === null || fields.x !== "x" || fields.y !== "y") return null;

  const options: { fill?: string; r?: number } = {};
  if (fields.fill !== undefined) options.fill = fields.fill as string;
  if (fields.r !== undefined) options.r = fields.r as number;
  return options;
}

/** Reads one `scatter_mark` production:
 *  `Plot.dot(scatter_call, scatter_options)`. The mark name is fixed (C2
 *  §5.3, ruling R215 item 3) — a cloud has no ordering along either axis,
 *  so a line mark over it would draw a scribble that looks like a path. */
function readScatterMark(c: Cursor): ScatterMarkProps | null {
  const start = c.pos;
  if (!consumeIdent(c, "Plot") || !consumePunct(c, ".") || !consumeIdent(c, "dot") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }
  const call = readScatterCall(c);
  if (call === null || !consumePunct(c, ",")) {
    c.pos = start;
    return null;
  }
  const options = readScatterOptions(c);
  if (options === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }

  const mark: ScatterMarkProps = { xChannel: call.xChannel, yChannel: call.yChannel, scatter: call.scatter };
  if (options.fill !== undefined) mark.fill = options.fill;
  if (options.r !== undefined) mark.r = options.r;
  return mark;
}

/** Reads a `scatter_marks` array: `[` one `scatter_mark` `]`, exactly one. */
function readScatterMarksArray(c: Cursor): ScatterMarkProps | null {
  const start = c.pos;
  if (!consumePunct(c, "[")) {
    c.pos = start;
    return null;
  }
  const mark = readScatterMark(c);
  if (mark === null || !consumePunct(c, "]")) {
    c.pos = start;
    return null;
  }
  return mark;
}

/**
 * Looks ahead in `tokens` (from `from`, without moving any cursor) for the
 * `marks` key's value and decides whether this cell's `plot_options` is a
 * time cell or an FFT cell, so the caller can pick the matching set of
 * field parsers for `x` before parsing it (an FFT `x` requires `type`; a
 * time `x` forbids it — the two cannot share one reader, C2 §5.3: "A cell
 * is a time cell or an FFT cell, never both").
 *
 * Widened by **ruling R215** to every chart kind the grammar has a
 * production for: the callee name after the first mark's `Plot.<name>(` is
 * the discriminant (`channel` ⇒ time, `spectrum` ⇒ fft, `histogram` ⇒
 * histogram), which is exactly why each chart kind's data call is a
 * distinct host-variable name rather than an argument to a shared one.
 *
 * This is deliberately a heuristic, not a validating parse: `marks` is the
 * one identifier this closed grammar never uses as anything but the
 * top-level key (never a value, never nested), so a plain token scan for
 * the `ident "marks"` token, followed by the fixed `":" "[" …` shape every
 * non-empty `marks_array` alternative shares up to its first mark's callee
 * name (`Plot.<name>(<channel|spectrum|histogram>`), is enough to route
 * correctly.
 * If the surrounding structure is not actually well-formed, the reader this
 * function's answer selects will simply fail on it and `parse` returns
 * `null` regardless of which one was tried — the same end result either
 * reader would reach, so a wrong guess here costs nothing.
 *
 * An empty `marks: []` and a missing `marks` key both resolve to `"time"`:
 * an empty marks array "keeps parsing as a time cell with no marks, as
 * today" (C2 §5.3), and a missing key fails `readPlotOptions` for both
 * chart kinds identically (`marks`/`mark` is the one required key), so
 * routing it to either produces the same `null`.
 */
function detectChartKind(tokens: Token[], from: number): PlotProps["chart"] {
  let marksIdx = -1;
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === "ident" && t.value === "marks") {
      marksIdx = i;
      break;
    }
  }
  if (marksIdx === -1) return "time";

  const colon = tokens[marksIdx + 1];
  const openBracket = tokens[marksIdx + 2];
  if (colon?.kind !== "punct" || colon.value !== ":" || openBracket?.kind !== "punct" || openBracket.value !== "[") {
    return "time";
  }

  const firstInArray = tokens[marksIdx + 3];
  if (firstInArray?.kind === "punct" && firstInArray.value === "]") {
    return "time"; // empty marks array
  }

  // Plot . <markName> ( <calleeIdent>
  const calleeIdent = tokens[marksIdx + 7];
  if (calleeIdent?.kind !== "ident") return "time";
  if (calleeIdent.value === "spectrum") return "fft";
  if (calleeIdent.value === "histogram") return "histogram";
  if (calleeIdent.value === "scatter") return "scatter";
  return "time";
}

function parsePlotOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "title": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "x": {
      const v = readXScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "y": {
      const v = readYScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "color": {
      const v = readColorOpt(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "marks": {
      const v = readMarksArray(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false }; // any key outside x/y/color/marks -> custom
  }
}

function parseFftPlotOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "title": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "x": {
      const v = readFftXScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "y": {
      const v = readYScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "color": {
      const v = readColorOpt(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "marks": {
      const v = readFftMarksArray(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false }; // any key outside x/y/color/marks -> custom
  }
}

/** Reads a time cell's `plot_options`: `{ ... }`, requiring `marks` to be
 *  present (the form always seeds one mark; C2 §5.3 leaves `marks` as the
 *  one non-optional top-level key for a time cell).
 *
 *  A hand-typed `x: {}` or `y: {}` (every field undefined) normalises to
 *  the key being absent from the returned props, never `{}` — matching
 *  `generate`, which never emits an empty axis object (review finding,
 *  L6 Task 2). This keeps `parse(generate(p))` deep-equal to `p` for any
 *  `p` `generate` can actually produce, since `generate` can never
 *  produce `x: {}`/`y: {}` in the first place. */
function readTimePlotOptions(c: Cursor): TimePlotProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parsePlotOptionField);
  if (fields === null || fields.marks === undefined) {
    c.pos = start;
    return null;
  }

  const marksField = fields.marks as { marks: MarkProps[]; zeroLine: boolean };
  const props: TimePlotProps = { chart: "time", marks: marksField.marks };
  if (fields.title !== undefined) props.title = fields.title as string;
  if (marksField.zeroLine) props.zeroLine = true;
  if (fields.x !== undefined && Object.keys(fields.x as XAxisProps).length > 0) {
    props.x = fields.x as XAxisProps;
  }
  if (fields.y !== undefined && Object.keys(fields.y as YAxisProps).length > 0) {
    props.y = fields.y as YAxisProps;
  }
  if (fields.color !== undefined) props.color = fields.color as { legend: true };
  return props;
}

/** Reads an FFT cell's `plot_options`: `{ ... }`, requiring both `marks`
 *  (the one spectrum mark) and `x` (with its required `type`) to be
 *  present (R80 Q1). */
function readFftPlotOptions(c: Cursor): FftPlotProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseFftPlotOptionField);
  if (fields === null || fields.marks === undefined || fields.x === undefined) {
    c.pos = start;
    return null;
  }

  const props: FftPlotProps = {
    chart: "fft",
    mark: fields.marks as SpectrumMarkProps,
    x: fields.x as FftXAxisProps,
  };
  if (fields.title !== undefined) props.title = fields.title as string;
  if (fields.y !== undefined && Object.keys(fields.y as YAxisProps).length > 0) {
    props.y = fields.y as YAxisProps;
  }
  if (fields.color !== undefined) props.color = fields.color as { legend: true };
  return props;
}

function parseHistogramPlotOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "title": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "x": {
      const v = readXScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "y": {
      const v = readYScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "color": {
      const v = readColorOpt(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "marks": {
      const v = readHistogramMarksArray(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false }; // any key outside x/y/color/marks -> custom
  }
}

/** Reads a histogram cell's `plot_options` (ruling R215 item 2), requiring
 *  `marks` (the one bar mark). `x` is optional and reuses the *time* cell's
 *  `x_scale` reader: a histogram's x axis carries `label`/`domain` and no
 *  `type`, exactly as a time cell's does — the two differ in what the axis
 *  *means* (the channel's own unit rather than seconds), which is a label,
 *  not a grammar distinction. */
function readHistogramPlotOptions(c: Cursor): HistogramPlotProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseHistogramPlotOptionField);
  if (fields === null || fields.marks === undefined) {
    c.pos = start;
    return null;
  }

  const props: HistogramPlotProps = { chart: "histogram", mark: fields.marks as HistogramMarkProps };
  if (fields.title !== undefined) props.title = fields.title as string;
  if (fields.x !== undefined && Object.keys(fields.x as XAxisProps).length > 0) {
    props.x = fields.x as XAxisProps;
  }
  if (fields.y !== undefined && Object.keys(fields.y as YAxisProps).length > 0) {
    props.y = fields.y as YAxisProps;
  }
  if (fields.color !== undefined) props.color = fields.color as { legend: true };
  return props;
}

function parseScatterPlotOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
    case "title": {
      const v = consumeString(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "x": {
      const v = readXScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "y": {
      const v = readYScale(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "color": {
      const v = readColorOpt(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    case "marks": {
      const v = readScatterMarksArray(c);
      return v === null ? { ok: false } : { ok: true, value: v };
    }
    default:
      return { ok: false }; // any key outside x/y/color/marks -> custom
  }
}

/** Reads a scatter cell's `plot_options` (ruling R215 item 3), requiring
 *  `marks` (the one dot mark). Both axes reuse the time cell's own
 *  `x_scale`/`y_scale` readers: each carries a channel's unit rather than
 *  seconds, which is a label, not a grammar distinction. */
function readScatterPlotOptions(c: Cursor): ScatterPlotProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parseScatterPlotOptionField);
  if (fields === null || fields.marks === undefined) {
    c.pos = start;
    return null;
  }

  const props: ScatterPlotProps = { chart: "scatter", mark: fields.marks as ScatterMarkProps };
  if (fields.title !== undefined) props.title = fields.title as string;
  if (fields.x !== undefined && Object.keys(fields.x as XAxisProps).length > 0) {
    props.x = fields.x as XAxisProps;
  }
  if (fields.y !== undefined && Object.keys(fields.y as YAxisProps).length > 0) {
    props.y = fields.y as YAxisProps;
  }
  if (fields.color !== undefined) props.color = fields.color as { legend: true };
  return props;
}

/** Reads `plot_options`, dispatching to the reader for the chart kind
 *  {@link detectChartKind}'s lookahead over the `marks` key's value picked
 *  (C2 §5.3: "A cell is a time cell or an FFT cell, never both", widened by
 *  ruling R215 to every chart kind). A `switch`, not a ternary chain, for
 *  the same reason `generate`'s dispatch is one. */
function readPlotOptions(c: Cursor): PlotProps | null {
  switch (detectChartKind(c.tokens, c.pos)) {
    case "fft":
      return readFftPlotOptions(c);
    case "histogram":
      return readHistogramPlotOptions(c);
    case "scatter":
      return readScatterPlotOptions(c);
    case "time":
      return readTimePlotOptions(c);
  }
}

/** Reads a `plot_call`: `Plot.plot(plot_options)`. This must match the
 *  entire token stream (checked by `parse`) for the cell to be
 *  recognised: anything before or after is a second statement, which
 *  makes the cell custom. */
function readPlotCall(c: Cursor): PlotProps | null {
  const start = c.pos;
  if (!consumeIdent(c, "Plot") || !consumePunct(c, ".") || !consumeIdent(c, "plot") || !consumePunct(c, "(")) {
    c.pos = start;
    return null;
  }

  const options = readPlotOptions(c);
  if (options === null || !consumePunct(c, ")")) {
    c.pos = start;
    return null;
  }
  return options;
}

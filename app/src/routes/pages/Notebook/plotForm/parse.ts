import { MARK_NAMES, type MarkProps, type PlotProps, type XAxisProps, type YAxisProps } from "./types";

/** A lexical token produced by {@link tokenize}: an identifier (bare word),
 *  a decoded string literal, a decoded numeric literal, or one of the
 *  grammar's punctuation characters (`{ } [ ] ( ) , : .`). */
type Token =
  | { kind: "ident"; value: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "punct"; value: string };

/** The reader's position in a token stream. Every `read*`/`consume*`
 *  function below either advances `pos` and returns a value, or leaves
 *  `pos` unchanged and returns `null` (never a partial advance), so a
 *  caller can safely try an alternative production. */
interface Cursor {
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
 *  supported set. */
function tokenize(code: string): Token[] | null {
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
// option readers.
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

/** Fields of an `x_scale` object. `type` is syntactically part of C2
 *  §5.3's grammar, but `XAxisProps` has no field for it (reserved for a
 *  future non-time x-axis, C2 §8-2, and never emitted by `generate`), so
 *  admitting it here would silently drop it on the next `generate()` call.
 *  Its mere presence therefore makes the whole cell custom, regardless of
 *  its value. */
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
      if (v === "linear" || v === "log" || v === "sqrt") return { ok: true, value: v };
      return { ok: false };
    }
    default:
      return { ok: false };
  }
}

function readYScale(c: Cursor): YAxisProps | null {
  const fields = readBracedFields(c, parseYField);
  if (fields === null) return null;
  const y: YAxisProps = {};
  if (fields.label !== undefined) y.label = fields.label as string;
  if (fields.domain !== undefined) y.domain = fields.domain as [number, number];
  if (fields.type !== undefined) y.type = fields.type as "linear" | "log" | "sqrt";
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
 *  explicit `lap: null | number`. */
function readChannelCall(c: Cursor): { channel: string; lap: number | null } | null {
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
      const v = consumeString(c);
      return v === "t" ? { ok: true, value: v } : { ok: false };
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

/** Reads a mark's `mark_options`: the fixed literal pair `x: "t"`,
 *  `y: "v"` (both required, order-insensitive with the optional fields),
 *  plus optional `stroke`/`strokeWidth`. Any other key, or `x`/`y` not
 *  exactly the literal strings `"t"`/`"v"`, makes the cell custom. */
function readMarkOptions(c: Cursor): { stroke?: string; strokeWidth?: number } | null {
  const fields = readBracedFields(c, parseMarkOptionField);
  if (fields === null || fields.x !== "t" || fields.y !== "v") return null;

  const options: { stroke?: string; strokeWidth?: number } = {};
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
  if (markOptions.stroke !== undefined) mark.stroke = markOptions.stroke;
  if (markOptions.strokeWidth !== undefined) mark.strokeWidth = markOptions.strokeWidth;
  return mark;
}

/** Reads a `marks_array`: `[]` or a comma-separated list of `mark`
 *  productions. An empty array is legal (mirrors `generate`'s handling of
 *  `marks: []`). */
function readMarksArray(c: Cursor): MarkProps[] | null {
  const start = c.pos;
  if (!consumePunct(c, "[")) {
    c.pos = start;
    return null;
  }

  const marks: MarkProps[] = [];
  if (consumePunct(c, "]")) return marks;

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
  return marks;
}

function parsePlotOptionField(key: string, c: Cursor): FieldResult {
  switch (key) {
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

/** Reads `plot_options`: `{ ... }`, requiring `marks` to be present (the
 *  form always seeds one mark; C2 §5.3 leaves `marks` as the one
 *  non-optional top-level key).
 *
 *  A hand-typed `x: {}` or `y: {}` (every field undefined) normalises to
 *  the key being absent from the returned props, never `{}` — matching
 *  `generate`, which never emits an empty axis object (review finding,
 *  L6 Task 2). This keeps `parse(generate(p))` deep-equal to `p` for any
 *  `p` `generate` can actually produce, since `generate` can never
 *  produce `x: {}`/`y: {}` in the first place. */
function readPlotOptions(c: Cursor): PlotProps | null {
  const start = c.pos;
  const fields = readBracedFields(c, parsePlotOptionField);
  if (fields === null || fields.marks === undefined) {
    c.pos = start;
    return null;
  }

  const props: PlotProps = { marks: fields.marks as MarkProps[] };
  if (fields.x !== undefined && Object.keys(fields.x as XAxisProps).length > 0) {
    props.x = fields.x as XAxisProps;
  }
  if (fields.y !== undefined && Object.keys(fields.y as YAxisProps).length > 0) {
    props.y = fields.y as YAxisProps;
  }
  if (fields.color !== undefined) props.color = fields.color as { legend: true };
  return props;
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

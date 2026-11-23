/**
 * The overlay readouts' half of the Properties form grammar (C2 §5.3
 * `readout_cell`, video overlay spec §7c): `parseReadout(code) → props |
 * null` and `generateReadout(props) → code`, agreeing on exactly the cell
 * shapes below. Kept beside `parse`/`generate` rather than inside
 * `PlotProps`: a readout has no axes, title, colour or marks, which every
 * `PlotProps` consumer (reports, the graph view, axis editors) assumes.
 *
 * Same rules as the chart grammar: never executes the code, never throws,
 * one call and nothing else, object keys in any order when hand-edited,
 * generated in the fixed order C2 states.
 */
import { tokenize, type Cursor, type Token } from "./parse";

/** A gauge's range: typed, in the channel's **recorded** unit (Isaac,
 *  2026-11-15; the form shows display units), or the whole ride's exact
 *  extent (C3 §3.7.1). */
export type GaugeRange = { kind: "fixed"; min: number; max: number } | { kind: "ride" };

/** `Readout.gauge(channel, { … })`. */
export interface GaugeReadoutProps {
  readout: "gauge";
  /** A session channel or `math` definition name. */
  channel: string;
  range: GaugeRange;
  label?: string;
  /** Decimals on the number; absent = 0. */
  digits?: number;
  /** Absent = `"speedo"`. */
  style?: "speedo" | "tach";
  icon?: "heart";
  /** Heart-rate zones on the dial (2026-11-23). */
  zones?: "hr";
  /** Seconds averaged, > 0 (2026-11-23). */
  smoothS?: number;
}

/** `Readout.number(channel, { … })`. */
export interface NumberReadoutProps {
  readout: "number";
  channel: string;
  label?: string;
  digits?: number;
  icon?: "heart";
}

/** `Readout.gg(x, y, { … })`: x lateral, y longitudinal, both g. */
export interface GgReadoutProps {
  readout: "gg";
  xChannel: string;
  yChannel: string;
  /** g at the edge, > 0. */
  limit: number;
  /** Ring spacing, g, > 0. */
  rings: number;
  /** Tail length, s, >= 0 (0 = no tail). */
  tailS: number;
  label?: string;
  /** A third channel drawn as a vertical-g bar (2026-11-23). */
  vertical?: string;
  /** g at the bar's top, > 0. */
  verticalLimit?: number;
}

/** One readout cell's Properties-form state. */
export type ReadoutProps = GaugeReadoutProps | NumberReadoutProps | GgReadoutProps;

/** The three readout kinds, in the order the chart-type control shows them. */
export const READOUT_KINDS: readonly ReadoutProps["readout"][] = ["gauge", "number", "gg"];

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

function peek(c: Cursor): Token | undefined {
  return c.tokens[c.pos];
}

function punct(c: Cursor, v: string): boolean {
  const t = peek(c);
  if (t?.kind === "punct" && t.value === v) {
    c.pos++;
    return true;
  }
  return false;
}

function ident(c: Cursor, v?: string): string | null {
  const t = peek(c);
  if (t?.kind === "ident" && (v === undefined || t.value === v)) {
    c.pos++;
    return t.value;
  }
  return null;
}

function str(c: Cursor): string | null {
  const t = peek(c);
  if (t?.kind === "string") {
    c.pos++;
    return t.value;
  }
  return null;
}

function num(c: Cursor): number | null {
  const t = peek(c);
  if (t?.kind === "number") {
    c.pos++;
    return t.value;
  }
  return null;
}

/** The value of one option, or `undefined` for a malformed one. */
type OptionValue = string | number;

/** Reads `{ key: value, … }` with string or number values, any order, no
 *  repeats. `null` on anything else. */
function readOptions(c: Cursor): Map<string, OptionValue> | null {
  if (!punct(c, "{")) return null;
  const out = new Map<string, OptionValue>();
  if (punct(c, "}")) return out;
  for (;;) {
    const key = ident(c);
    if (key === null || !punct(c, ":") || out.has(key)) return null;
    const s = str(c);
    const n = s === null ? num(c) : null;
    if (s === null && n === null) return null;
    out.set(key, s ?? (n as number));
    if (punct(c, ",")) continue;
    break;
  }
  return punct(c, "}") ? out : null;
}

/** Takes `key` from `opts` as a string among `allowed`; `false` when present but invalid. */
function takeString(opts: Map<string, OptionValue>, key: string, allowed?: readonly string[]): string | undefined | false {
  if (!opts.has(key)) return undefined;
  const v = opts.get(key);
  opts.delete(key);
  if (typeof v !== "string") return false;
  if (allowed !== undefined && !allowed.includes(v)) return false;
  return v;
}

/** Takes `key` as a number passing `ok`; `false` when present but invalid. */
function takeNumber(opts: Map<string, OptionValue>, key: string, ok: (n: number) => boolean): number | undefined | false {
  if (!opts.has(key)) return undefined;
  const v = opts.get(key);
  opts.delete(key);
  if (typeof v !== "number" || !Number.isFinite(v) || !ok(v)) return false;
  return v;
}

const isDigits = (n: number) => Number.isInteger(n) && n >= 0 && n <= 6;

/** Parses a readout cell, or `null` when `code` is anything else. */
export function parseReadout(code: string): ReadoutProps | null {
  const tokens = tokenize(code);
  if (tokens === null) return null;
  const c: Cursor = { tokens, pos: 0 };
  if (ident(c, "Readout") === null || !punct(c, ".")) return null;
  const kind = ident(c);
  if (kind === null || !punct(c, "(")) return null;

  const first = str(c);
  if (first === null || !punct(c, ",")) return null;
  let second: string | null = null;
  if (kind === "gg") {
    second = str(c);
    if (second === null || !punct(c, ",")) return null;
  }
  const opts = readOptions(c);
  if (opts === null || !punct(c, ")")) return null;
  punct(c, ";");
  if (c.pos !== tokens.length) return null;

  const props = buildProps(kind, first, second, opts);
  // Every option must have been understood: an unknown key makes the cell custom.
  return props !== null && opts.size === 0 ? props : null;
}

function buildProps(kind: string, first: string, second: string | null, opts: Map<string, OptionValue>): ReadoutProps | null {
  const label = takeString(opts, "label");
  if (label === false) return null;
  if (kind === "gauge") {
    const min = takeNumber(opts, "min", () => true);
    const max = takeNumber(opts, "max", () => true);
    const range = takeString(opts, "range", ["ride"]);
    if (min === false || max === false || range === false) return null;
    let r: GaugeRange;
    if (range === "ride" && min === undefined && max === undefined) r = { kind: "ride" };
    else if (range === undefined && min !== undefined && max !== undefined && max > min) r = { kind: "fixed", min, max };
    else return null;
    const digits = takeNumber(opts, "digits", isDigits);
    const style = takeString(opts, "style", ["speedo", "tach"]);
    const icon = takeString(opts, "icon", ["heart"]);
    const zones = takeString(opts, "zones", ["hr"]);
    const smoothS = takeNumber(opts, "smooth_s", (n) => n > 0);
    if (digits === false || style === false || icon === false || zones === false || smoothS === false) return null;
    return {
      readout: "gauge",
      channel: first,
      range: r,
      ...(label !== undefined ? { label } : {}),
      ...(digits !== undefined ? { digits } : {}),
      ...(style !== undefined ? { style: style as "speedo" | "tach" } : {}),
      ...(icon !== undefined ? { icon: "heart" as const } : {}),
      ...(zones !== undefined ? { zones: "hr" as const } : {}),
      ...(smoothS !== undefined ? { smoothS } : {}),
    };
  }
  if (kind === "number") {
    const digits = takeNumber(opts, "digits", isDigits);
    const icon = takeString(opts, "icon", ["heart"]);
    if (digits === false || icon === false) return null;
    return {
      readout: "number",
      channel: first,
      ...(label !== undefined ? { label } : {}),
      ...(digits !== undefined ? { digits } : {}),
      ...(icon !== undefined ? { icon: "heart" as const } : {}),
    };
  }
  if (kind === "gg" && second !== null) {
    const limit = takeNumber(opts, "limit", (n) => n > 0);
    const rings = takeNumber(opts, "rings", (n) => n > 0);
    const tailS = takeNumber(opts, "tail_s", (n) => n >= 0);
    if (limit === false || rings === false || tailS === false) return null;
    if (limit === undefined || rings === undefined || tailS === undefined) return null;
    const vertical = takeString(opts, "vertical");
    const verticalLimit = takeNumber(opts, "vertical_limit", (n) => n > 0);
    if (vertical === false || verticalLimit === false) return null;
    return {
      readout: "gg",
      xChannel: first,
      yChannel: second,
      limit,
      rings,
      tailS,
      ...(label !== undefined ? { label } : {}),
      ...(vertical !== undefined ? { vertical } : {}),
      ...(verticalLimit !== undefined ? { verticalLimit } : {}),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/** A JS string literal for `s`. */
function lit(s: string): string {
  return JSON.stringify(s);
}

/** A number as JS source: no trailing zeros, at most 6 decimals. */
function n(v: number): string {
  return String(Number(v.toFixed(6)));
}

/** The cell source for `props`, in C2 §5.3's fixed option order. */
export function generateReadout(props: ReadoutProps): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => parts.push(`${k}: ${v}`);
  switch (props.readout) {
    case "gauge": {
      if (props.range.kind === "ride") add("range", lit("ride"));
      else {
        add("min", n(props.range.min));
        add("max", n(props.range.max));
      }
      if (props.label !== undefined) add("label", lit(props.label));
      if (props.digits !== undefined) add("digits", n(props.digits));
      if (props.style !== undefined) add("style", lit(props.style));
      if (props.icon !== undefined) add("icon", lit(props.icon));
      if (props.zones !== undefined) add("zones", lit(props.zones));
      if (props.smoothS !== undefined) add("smooth_s", n(props.smoothS));
      return `Readout.gauge(${lit(props.channel)}, { ${parts.join(", ")} })`;
    }
    case "number": {
      if (props.label !== undefined) add("label", lit(props.label));
      if (props.digits !== undefined) add("digits", n(props.digits));
      if (props.icon !== undefined) add("icon", lit(props.icon));
      return `Readout.number(${lit(props.channel)}, ${parts.length === 0 ? "{}" : `{ ${parts.join(", ")} }`})`;
    }
    case "gg": {
      add("limit", n(props.limit));
      add("rings", n(props.rings));
      add("tail_s", n(props.tailS));
      if (props.label !== undefined) add("label", lit(props.label));
      if (props.vertical !== undefined) add("vertical", lit(props.vertical));
      if (props.verticalLimit !== undefined) add("vertical_limit", n(props.verticalLimit));
      return `Readout.gg(${lit(props.xChannel)}, ${lit(props.yChannel)}, { ${parts.join(", ")} })`;
    }
  }
}

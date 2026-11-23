/**
 * A readout cell's call, read from its source so the host can draw it
 * outside the sandbox (the overlay canvas and export, 2026-11-23). C2 §5.3's
 * readout grammar: the cell's whole value is one `Readout.<kind>(names…,
 * options)` call with string-literal names and a literal options object.
 * Pure.
 */
import type { GaugeOptions, GgOptions, NumberOptions, SpectrogramOptions, TraceOptions } from "./frame";

/** One parsed readout cell. */
export type ReadoutCall =
  | { kind: "gauge"; name: string; opts: GaugeOptions }
  | { kind: "number"; name: string; opts: NumberOptions }
  | { kind: "trace"; name: string; opts: TraceOptions }
  | { kind: "spectrogram"; name: string; opts: SpectrogramOptions }
  | { kind: "gg"; x: string; y: string; opts: GgOptions };

const STR = String.raw`"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'`;
const CALL = new RegExp(String.raw`\bReadout\s*\.\s*(gauge|number|gg|trace|spectrogram)\s*\(\s*(?:${STR})\s*(?:,\s*(?:${STR})\s*)?(?:,\s*(\{[\s\S]*?\})\s*)?\)`);

/** A literal options object as JSON: keys quoted, single quotes made double, trailing commas dropped. `null` if it isn't one. */
export function parseOptions(literal: string): Record<string, unknown> | null {
  const json = literal
    .replace(/'((?:[^'\\]|\\.)*)'/g, (_m, s: string) => JSON.stringify(s.replace(/\\'/g, "'")))
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*}/g, "}");
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const unescape = (s: string) => s.replace(/\\(.)/g, "$1");

/** The readout call in `code`, or `null` when the cell is not one. */
export function parseReadoutCall(code: string): ReadoutCall | null {
  const m = CALL.exec(code);
  if (m === null) return null;
  const kind = m[1] as "gauge" | "number" | "gg" | "trace" | "spectrogram";
  const first = m[2] ?? m[3];
  const second = m[4] ?? m[5];
  const opts = m[6] === undefined ? {} : parseOptions(m[6]);
  if (first === undefined || opts === null) return null;
  if (kind === "gg") {
    if (second === undefined) return null;
    return { kind, x: unescape(first), y: unescape(second), opts: opts as GgOptions };
  }
  if (kind === "trace") return { kind, name: unescape(first), opts: opts as TraceOptions };
  if (kind === "spectrogram") return { kind, name: unescape(first), opts: opts as SpectrogramOptions };
  return { kind, name: unescape(first), opts: opts as GaugeOptions };
}

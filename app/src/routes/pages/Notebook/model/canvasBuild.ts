/**
 * The canvas's "build on this" edits (Isaac, 2026-11-04): starting a
 * workbook from nothing on the maths graph — apply a function to a channel
 * or definition, append a fresh math/table cell or a note, and pick the
 * channel a new chart starts from. Pure: every function takes the document
 * and returns the next one; `GraphCanvas.tsx` only decides *when*.
 *
 * Fresh cell ids are passed in by the caller (C2 §2.2's assignment rule
 * lets the app mint one: 4 random bytes as lowercase hex), so every
 * function here stays deterministic under test.
 */

import type { SessionDetail } from "../../../../ipc/catalog";
import { addDefinition } from "./graphEdits";
import { definitionCellIds } from "./graphModel";
import type { GraphModel } from "./graphModel";

/** One entry of the "apply a function" picker: a builtin with a starter
 *  call that is valid as inserted, so the new node evaluates at once. Every
 *  literal in a template is a starting value the author edits on the card
 *  (`editLiteralArg`); none is a recommendation. */
export interface FunctionTemplate {
  /** The C2 §3.3 builtin this template calls (checked against the
   *  generated catalog by this module's test). */
  fn: string;
  /** What the picker shows. */
  label: string;
  /** The picker's group heading. */
  group: string;
  /** Suffix for the new definition's name: `<input>_<suffix>`. */
  suffix: string;
  /** The right-hand side, given the input's bracket reference `[name]`. */
  rhs: (ref: string) => string;
  /** Needs a fixed sample rate: not offered for an event channel (GPS, wheel
   *  pulses — C1 §4.2 rate 0), where it can only fail (`butter`'s Nyquist
   *  check, a spectrum's bin spacing). */
  fixedRateOnly?: boolean;
}

const unary = (fn: string, group: string, label = fn): FunctionTemplate => ({ fn, label, group, suffix: fn, rhs: (ref) => `${fn}(${ref})` });

/** The picker's list: builtins that take one channel as their input. Two-
 *  input builtins (`atan2`, `resample`, the vector family) need a second
 *  operand the canvas can't guess and are written in the code view. */
export const FUNCTION_TEMPLATES: readonly FunctionTemplate[] = [
  { fn: "butter", label: "butter — low-pass 10 Hz", group: "Filter", suffix: "lowpass", fixedRateOnly: true, rhs: (ref) => `butter(4, 10, "low", ${ref})` },
  { fn: "butter", label: "butter — high-pass 1 Hz", group: "Filter", suffix: "highpass", fixedRateOnly: true, rhs: (ref) => `butter(4, 1, "high", ${ref})` },
  unary("differentiate", "Time-domain"),
  unary("gradient", "Time-domain"),
  unary("cumulative_trapezoid", "Time-domain", "cumulative_trapezoid (integrate)"),
  unary("detrend", "Time-domain"),
  unary("declip", "Time-domain"),
  { fn: "rms", label: "rms — rolling, 100 samples", group: "Time-domain", suffix: "rms100", rhs: (ref) => `rms(${ref}, 100)` },
  { fn: "mean", label: "mean — rolling, 100 samples", group: "Time-domain", suffix: "mean100", rhs: (ref) => `mean(${ref}, 100)` },
  unary("rms", "Aggregate", "rms (whole window)"),
  unary("mean", "Aggregate", "mean (whole window)"),
  unary("std", "Aggregate", "std (whole window)"),
  unary("max", "Aggregate", "max (whole window)"),
  unary("min", "Aggregate", "min (whole window)"),
  unary("median", "Aggregate"),
  { fn: "percentile", label: "percentile — 95th", group: "Aggregate", suffix: "p95", rhs: (ref) => `percentile(${ref}, 95)` },
  unary("count", "Aggregate"),
  { ...unary("welch", "Frequency", "welch (spectrum)"), fixedRateOnly: true },
  { ...unary("periodogram", "Frequency"), fixedRateOnly: true },
  unary("abs", "Elementwise"),
  unary("sqrt", "Elementwise"),
  { fn: "pow", label: "pow — squared", group: "Elementwise", suffix: "sq", rhs: (ref) => `pow(${ref}, 2)` },
  unary("sign", "Elementwise"),
  unary("round", "Elementwise"),
  unary("deg2rad", "Elementwise"),
  unary("rad2deg", "Elementwise"),
];

/** The templates offered for `inputName`: all of them, less the
 *  fixed-rate-only ones when it is an event channel. */
export function templatesFor(inputName: string, eventChannels: ReadonlySet<string>): readonly FunctionTemplate[] {
  return eventChannels.has(inputName) ? FUNCTION_TEMPLATES.filter((t) => t.fixedRateOnly !== true) : FUNCTION_TEMPLATES;
}

/** Not a valid C2 §3.1 identifier character. */
const INVALID_IDENTIFIER_CHAR_RE = /[^A-Za-z0-9_]/g;

/** `name` as a valid identifier: invalid characters become `_`, a leading
 *  digit gets a `_` prefix. */
export function sanitiseIdentifier(name: string): string {
  const replaced = name.replace(INVALID_IDENTIFIER_CHAR_RE, "_");
  return /^[0-9]/.test(replaced) ? `_${replaced}` : replaced;
}

/** `base`, or `base_2`, `base_3`, … — the first not in `taken`. */
export function dedupeName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** The separator that puts a new block on its own paragraph after `markdown`. */
function blockSeparator(markdown: string): string {
  return markdown.length === 0 || markdown.endsWith("\n\n") ? "" : markdown.endsWith("\n") ? "\n" : "\n\n";
}

/** Appends a `math` cell with id `id` and body `body` (each line
 *  newline-terminated) at the end of `markdown`. */
export function appendMathCell(markdown: string, id: string, body: string): string {
  const text = body.endsWith("\n") || body.length === 0 ? body : `${body}\n`;
  return `${markdown}${blockSeparator(markdown)}\`\`\`math id=${id}\n${text}\`\`\`\n`;
}

/** The starter table: one column named `value` with an empty template, one
 *  authored row (C2 §4). The author fills it in the Properties pane. */
export const STARTER_TABLE_BODY = '{ "columns": [ { "id": "c0", "name": "value" } ], "rows": [ { "id": "r0" } ], "cells": [ [ {} ] ] }';

/** Appends a starter `table` cell with id `id`. */
export function appendTableCell(markdown: string, id: string): string {
  return `${markdown}${blockSeparator(markdown)}\`\`\`table id=${id}\n${STARTER_TABLE_BODY}\n\`\`\`\n`;
}

/** The placeholder text of a note added from the canvas. */
export const STARTER_NOTE = "New note.";

/** Appends a prose paragraph (C2 §2.4: prose is the text between cells). */
export function appendNote(markdown: string, text: string = STARTER_NOTE): string {
  return `${markdown}${blockSeparator(markdown)}${text}\n`;
}

/** {@link applyFunction}'s result. */
export interface ApplyResult {
  markdown: string;
  /** The new definition's name. */
  newDefName: string;
  /** The cell it landed in — `newCellId` when a cell had to be created. */
  cellId: string;
}

/**
 * Adds `<input>_<suffix> = <template>([input])` to the document — the
 * "apply a function" gesture on a channel or definition node.
 *
 * **Target cell.** A definition input: its own cell, so the new node sits
 * in the same subgraph. A channel input: the last math cell in the
 * document. No math cell at all: a new one, id `newCellId`, appended at the
 * end — this is how the first math cell of a new workbook is made.
 */
export function applyFunction(markdown: string, model: GraphModel, inputName: string, template: FunctionTemplate, newCellId: string): ApplyResult {
  const taken = new Set(model.nodes.filter((n) => n.kind === "definition").map((n) => n.name));
  const newDefName = dedupeName(sanitiseIdentifier(`${inputName}_${template.suffix}`), taken);
  const rhs = template.rhs(`[${inputName}]`);

  const ownCell = definitionCellIds(markdown).get(inputName);
  const targetCellId = ownCell ?? (model.groups.length > 0 ? model.groups[model.groups.length - 1].id : undefined);
  if (targetCellId === undefined) {
    return { markdown: appendMathCell(markdown, newCellId, `${newDefName} = ${rhs}\n`), newDefName, cellId: newCellId };
  }
  return { markdown: addDefinition(markdown, targetCellId, newDefName, rhs), newDefName, cellId: targetCellId };
}

/** The channel a chart added from empty canvas starts with (Isaac,
 *  2026-11-04: "start out with some starter channels, like gps speed"):
 *  `GPS_SpeedKmh` when any selected session has it, else the first channel
 *  of the first session, else `null` (no session selected — the caller
 *  says so instead of inserting an empty chart). */
export function starterChartChannel(sessionDetails: ReadonlyMap<string, SessionDetail>): string | null {
  const PREFERRED = "GPS_SpeedKmh";
  let first: string | null = null;
  for (const detail of sessionDetails.values()) {
    if (detail.channels.some((c) => c.channel_id === PREFERRED)) return PREFERRED;
    if (first === null && detail.channels.length > 0) first = detail.channels[0].channel_id;
  }
  return first;
}

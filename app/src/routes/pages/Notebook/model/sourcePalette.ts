/**
 * The maths graph's source palette (ruling R160): the three droppable
 * source kinds a canvas gesture can mint a node from — a raw channel of
 * the current selection's session(s), a workbook constant, or a
 * definition already declared elsewhere in the document — grouped,
 * searched, and scoped to the selection. Pure — no `@/components/*`, no
 * `@xyflow/react` (vitest's node env cannot resolve either, per this
 * module's own dispatch); `GraphCanvas.tsx`/`SourcePaletteRail.tsx` render
 * what this module decides.
 *
 * **Union, honestly (decision 44).** Channels exist per session, so with
 * several selected windows this module unions their channel lists and
 * marks a channel `partial` when it is missing from at least one
 * *resolved* session — never hidden. A session whose `SessionDetail`
 * hasn't resolved yet contributes nothing to the union and is *not* read
 * as "this session has no channels" (the same convention `graphStatus.ts`
 * already applies) — {@link SourcePalette.channelsAvailability}/{@link
 * SourcePalette.pendingSessionCount} say so explicitly (R153: an
 * unresolved selection must say it is unresolved, not render as an empty
 * — and therefore ordinary-looking — list).
 *
 * **Two non-authoritative mirrors, same pattern as `graphModel.ts` and
 * `cells.ts`.** A math cell's own `const NAME = value` lines are read via
 * `mathMode.ts`'s `tokenizeMath`, exactly as `graphModel.ts` reads
 * `def_line`s. Front-matter `constants:` (C2 §1/§3.1, a YAML map of name →
 * bare number or `"<number> <unit>"` string) has no existing TS reader —
 * `cells.ts` deliberately parses only its byte range, "front-matter
 * *content* is Rust's to parse" — so {@link scanFrontMatterConstants} is a
 * narrow, display-only mirror of `core`'s `ConstantRaw` deserialisation
 * (ledger precedent: `cells.ts`'s own doc comment on `scanFrontMatter`),
 * covering the flow (`constants: { g: 9.80665 }`) and block
 * (`constants:\n  g: 9.80665`) YAML shapes `render_front_matter` actually
 * emits. It is never used to evaluate anything — only to list a
 * constant's name and display value in the palette — so a value this scan
 * cannot parse (nested YAML, an anchor, …) is simply omitted, not guessed.
 *
 * **Rate is honest about what's on the wire (R147/R152).** A channel row
 * always has a rate (`ChannelSummary.nominal_rate_hz`). A definition row's
 * `sampleRateHz` is `null` until `CellDefResult` gains the field the
 * ruling describes — this module never fabricates one.
 */

import type { SessionDetail } from "../../../../ipc/catalog";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import type { GraphModel } from "./graphModel";
import { scanCells } from "./cells";
import { tokenizeMath, type MathToken } from "./mathMode";

/** Decodes a `scanCells`/`ScannedCell` UTF-8 byte range out of `markdown`
 *  — the same conversion `graphEdits.ts`'s own `cellBody` does (`.slice`
 *  alone is wrong here: `ScannedCell.bodyRange`/`ScannedDoc.frontMatterRange`
 *  are byte offsets, not UTF-16 code-unit offsets, so a non-ASCII byte
 *  before the range would desync a plain string slice). */
function decodeByteRange(markdown: string, range: [number, number]): string {
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(range[0], range[1]));
}

/** One raw-channel row — a session channel, unioned across the current
 *  selection. */
export interface PaletteChannelRow {
  kind: "channel";
  /** The channel id — identical to the string a `[Name]` reference and
   *  `graphEdits.ts`'s `addNodeFromChannel` both use. */
  name: string;
  /** Hz, `ChannelSummary.nominal_rate_hz` (0 for an event channel). */
  rateHz: number;
  /** True when this channel is present on at least one resolved selected
   *  session but absent from at least one other — decision 44's grey rule.
   *  Never true for a channel present on every resolved session. */
  partial: boolean;
}

/** One workbook-constant row (front matter `constants:` or a math cell's
 *  own `const NAME = value` line, C2 §3.1). Referenced bare (`g`), never
 *  bracketed — see the module doc comment. */
export interface PaletteConstantRow {
  kind: "constant";
  name: string;
  value: number;
}

/** One already-declared definition row, so a new node can reference it
 *  without hunting the canvas (R160). */
export interface PaletteDefinitionRow {
  kind: "definition";
  name: string;
  /** The owning math cell's `hex8` id — `addNodeFromChannel`'s bracket-ref
   *  path works for a definition exactly as it does for a channel (C2:
   *  both are bracket references; only a constant is bare), so a
   *  definition row never needs `cellId` for its own drag — kept here only
   *  because every other node-shaped row in this app carries it. */
  cellId: string | null;
  /** Hz, or `null` — see the module doc comment's "rate" paragraph. */
  sampleRateHz: number | null;
}

export type PaletteRow = PaletteChannelRow | PaletteConstantRow | PaletteDefinitionRow;

/** One collapsible group of same-kind rows (decision 42: search-first,
 *  collapsible groups, not a flat scroll). */
export interface PaletteGroup<Row extends PaletteRow> {
  /** Channel groups: the prefix before the first `_` (`"IMU0"`, `"GPS"`,
   *  …), or `"Other"` when a channel id has none. Constants/definitions:
   *  one fixed group each (`"Constants"`/`"Definitions"`) — this module
   *  never sub-groups by prefix for a kind decision 42 didn't ask for. */
  label: string;
  rows: Row[];
}

/** Whether the channel groups reflect the current selection yet (R153: an
 *  unresolved selection must say so, never look like a session with no
 *  channels). `"no-selection"` — no window is selected; an empty channel
 *  list is the honest, ordinary state. `"loading"` — one or more windows
 *  are selected but none of their sessions has resolved yet. `"ready"` —
 *  at least one selected session has resolved; {@link
 *  SourcePalette.pendingSessionCount} may still be positive if others
 *  haven't. */
export type ChannelsAvailability = "no-selection" | "loading" | "ready";

/** The full palette, as {@link buildSourcePalette} computes it from state
 *  the caller already holds. */
export interface SourcePalette {
  channelsAvailability: ChannelsAvailability;
  /** Count of distinct selected sessions with no resolved `SessionDetail`
   *  yet — positive alongside `channelsAvailability === "ready"` means the
   *  shown union may still grow. */
  pendingSessionCount: number;
  channelGroups: PaletteGroup<PaletteChannelRow>[];
  constants: PaletteGroup<PaletteConstantRow>[];
  definitions: PaletteGroup<PaletteDefinitionRow>[];
}

const CHANNEL_PREFIX_RE = /^[^_]+(?=_)/;

/** A channel id's display group — the prefix before its first `_`, or
 *  `"Other"` for a channel id with none (decision: "grouping naturally by
 *  prefix (`IMU0_`, `IMU1_`, `IMU2_`, `GPS_`, `HR_`)"). */
function channelGroupLabel(channelId: string): string {
  const match = CHANNEL_PREFIX_RE.exec(channelId);
  return match !== null ? match[0] : "Other";
}

/** Builds the union-across-selection channel rows (decision 44). Only
 *  *resolved* sessions (present in `sessionDetails`) participate — an
 *  unresolved session contributes neither a row nor a `partial` mark, per
 *  the module doc comment. */
function buildChannelGroups(selectedWindows: SelectedWindow[], sessionDetails: Map<string, SessionDetail>): PaletteGroup<PaletteChannelRow>[] {
  const resolvedSessionIds = [...new Set(selectedWindows.map((w) => w.session_id))].filter((id) => sessionDetails.has(id));

  const rateByName = new Map<string, number>();
  const presentCountByName = new Map<string, number>();
  for (const sessionId of resolvedSessionIds) {
    const detail = sessionDetails.get(sessionId) as SessionDetail;
    const seenInThisSession = new Set<string>();
    for (const channel of detail.channels) {
      if (seenInThisSession.has(channel.channel_id)) continue; // a session's own channel list has no duplicate ids
      seenInThisSession.add(channel.channel_id);
      rateByName.set(channel.channel_id, channel.nominal_rate_hz);
      presentCountByName.set(channel.channel_id, (presentCountByName.get(channel.channel_id) ?? 0) + 1);
    }
  }

  const groups = new Map<string, PaletteChannelRow[]>();
  for (const [name, rateHz] of rateByName) {
    const row: PaletteChannelRow = { kind: "channel", name, rateHz, partial: (presentCountByName.get(name) ?? 0) < resolvedSessionIds.length };
    const label = channelGroupLabel(name);
    const list = groups.get(label);
    if (list) list.push(row);
    else groups.set(label, [row]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, rows]) => ({ label, rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }));
}

/** One `const NAME = value` line's value, or `null` if this module's
 *  narrow scan can't read it (anything but a single trailing number
 *  literal — matches `graphModel.ts`'s own "non-authoritative, best
 *  effort" contract). */
function constLineValue(tokens: MathToken[]): number | null {
  const numberToken = tokens.find((t) => t.kind === "number");
  if (numberToken === undefined) return null;
  const parsed = Number(numberToken.text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Scans every math cell's body for `const NAME = value` lines (C2 §3.1) —
 *  a workbook-scoped scalar, same namespace as front-matter `constants`. */
function scanConstLines(markdown: string): PaletteConstantRow[] {
  const rows: PaletteConstantRow[] = [];
  for (const cell of scanCells(markdown).cells) {
    if (cell.kind !== "math") continue;
    const body = decodeByteRange(markdown, cell.bodyRange);
    for (const raw of body.split("\n")) {
      const line = raw.replace(/\r$/, "");
      if (line.trim().length === 0) continue;
      const tokens = tokenizeMath(line);
      const first = tokens[0];
      if (first === undefined || first.kind !== "keyword" || first.text !== "const") continue;
      const nameToken = tokens.find((t) => t.kind === "identifier");
      if (nameToken === undefined) continue;
      const value = constLineValue(tokens);
      if (value === null) continue;
      rows.push({ kind: "constant", name: nameToken.text, value });
    }
  }
  return rows;
}

/** A bare YAML number, e.g. `9.80665` or `82`. */
const YAML_NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/** A `"<number> <unit>"` constant string (C2 §3.1's unit-suffix grammar,
 *  `core`'s `parse_unit_suffix`) — only the leading number is read; the
 *  unit is display metadata this module doesn't need (R160: no unit
 *  column yet). */
const YAML_NUMBER_WITH_UNIT_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?=\s)/;

/** Parses one `name: value` YAML scalar entry's value into a display
 *  number, or `null` if it's neither `ConstantRaw` shape this module
 *  mirrors (see the module doc comment). */
function parseConstantValue(rawValue: string): number | null {
  const trimmed = rawValue.trim();
  const unquoted = (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")) ? trimmed.slice(1, -1) : trimmed;

  if (YAML_NUMBER_RE.test(unquoted)) return Number(unquoted);
  const withUnitMatch = YAML_NUMBER_WITH_UNIT_RE.exec(unquoted);
  return withUnitMatch !== null ? Number(withUnitMatch[0]) : null;
}

/** Reads a single `name: value` pair, `name` unquoted, out of a flow-style
 *  `{ ... }` entry text (already split on top-level commas by the caller). */
function parseFlowEntry(entry: string): PaletteConstantRow | null {
  const colon = entry.indexOf(":");
  if (colon === -1) return null;
  const name = entry.slice(0, colon).trim().replace(/^["']|["']$/g, "");
  const value = parseConstantValue(entry.slice(colon + 1));
  return name.length > 0 && value !== null ? { kind: "constant", name, value } : null;
}

/**
 * Narrow, non-authoritative mirror of front-matter `constants:` (see the
 * module doc comment) — reads only what `core`'s own `render_front_matter`
 * ever writes: a flow map on the `constants:` line itself, or a
 * block-style indented map on the following lines. Anything else (a
 * nested map, nulls, nonstandard indentation) yields no rows for those
 * entries rather than a guess.
 */
function scanFrontMatterConstants(markdown: string): PaletteConstantRow[] {
  const { frontMatterRange } = scanCells(markdown);
  if (frontMatterRange === null) return [];
  const frontMatter = decodeByteRange(markdown, frontMatterRange);
  const lines = frontMatter.split("\n");

  const constantsLineIndex = lines.findIndex((l) => /^constants\s*:/.test(l));
  if (constantsLineIndex === -1) return [];
  const constantsLine = lines[constantsLineIndex];

  // Flow style: `constants: { a: 1, b: "2 kg" }`, all on one line.
  const flowMatch = /:\s*\{(.*)\}\s*$/.exec(constantsLine);
  if (flowMatch !== null) {
    return flowMatch[1]
      .split(",")
      .map((entry) => parseFlowEntry(entry))
      .filter((row): row is PaletteConstantRow => row !== null);
  }

  // Block style: subsequent more-indented `  name: value` lines.
  const rows: PaletteConstantRow[] = [];
  const baseIndent = /^(\s*)/.exec(constantsLine)?.[1].length ?? 0;
  for (let i = constantsLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const indent = /^(\s*)/.exec(line)?.[1].length ?? 0;
    if (indent <= baseIndent) break; // back to `constants:`'s own indent or shallower — the map has ended
    const entry = parseFlowEntry(line.trim());
    if (entry !== null) rows.push(entry);
  }
  return rows;
}

/** All workbook constants (front matter plus every cell's own `const`
 *  lines, C2 §3.1's shared namespace), one `"Constants"` group. A name
 *  declared both ways is listed once per declaration site — this module
 *  doesn't adjudicate the collision Rust itself rejects as `ReservedName`/
 *  a duplicate (C3 is the source of truth for whether the document is
 *  actually valid; this is a display list, not a validator). */
function buildConstantGroups(markdown: string): PaletteGroup<PaletteConstantRow>[] {
  const rows = [...scanFrontMatterConstants(markdown), ...scanConstLines(markdown)];
  if (rows.length === 0) return [];
  return [{ label: "Constants", rows: rows.sort((a, b) => a.name.localeCompare(b.name)) }];
}

/** Every declared definition, one `"Definitions"` group, in the graph
 *  model's own node order. */
function buildDefinitionGroups(model: GraphModel): PaletteGroup<PaletteDefinitionRow>[] {
  const rows: PaletteDefinitionRow[] = model.nodes
    .filter((n) => n.kind === "definition")
    .map((n) => ({ kind: "definition" as const, name: n.name, cellId: n.cellId, sampleRateHz: null }));
  return rows.length === 0 ? [] : [{ label: "Definitions", rows }];
}

/** Everything {@link buildSourcePalette} needs — the same values
 *  `GraphCanvas.tsx` already threads through `graphStatus.ts`'s
 *  `computeNodeStatuses`. */
export interface SourcePaletteInputs {
  markdown: string;
  model: GraphModel;
  selectedWindows: SelectedWindow[];
  sessionDetails: Map<string, SessionDetail>;
}

/**
 * Computes the graph canvas's source palette (ruling R160) — see the
 * module doc comment for the union/grey and rate rules.
 */
export function buildSourcePalette({ markdown, model, selectedWindows, sessionDetails }: SourcePaletteInputs): SourcePalette {
  const selectedSessionIds = new Set(selectedWindows.map((w) => w.session_id));
  const resolvedSessionCount = [...selectedSessionIds].filter((id) => sessionDetails.has(id)).length;

  const channelsAvailability: ChannelsAvailability = selectedSessionIds.size === 0 ? "no-selection" : resolvedSessionCount === 0 ? "loading" : "ready";

  return {
    channelsAvailability,
    pendingSessionCount: selectedSessionIds.size - resolvedSessionCount,
    channelGroups: buildChannelGroups(selectedWindows, sessionDetails),
    constants: buildConstantGroups(markdown),
    definitions: buildDefinitionGroups(model),
  };
}

/** Case-insensitive substring match on a row's own name — decision 42's
 *  search-first behaviour. */
function rowMatches(row: PaletteRow, query: string): boolean {
  return row.name.toLowerCase().includes(query);
}

/** Filters every group in `palette` down to rows matching `query`,
 *  dropping groups left with none. `query === ""` returns `palette`
 *  unchanged (every group, every row) rather than an equivalent-but-new
 *  object, so a caller memoising on this result's identity isn't defeated
 *  by an empty search box. Availability/pending-count fields pass through
 *  untouched — search narrows *which* rows show, not whether the
 *  selection has resolved. */
export function filterSourcePalette(palette: SourcePalette, query: string): SourcePalette {
  if (query.trim().length === 0) return palette;
  const needle = query.trim().toLowerCase();

  function filterGroups<Row extends PaletteRow>(groups: PaletteGroup<Row>[]): PaletteGroup<Row>[] {
    return groups.map((g) => ({ ...g, rows: g.rows.filter((r) => rowMatches(r, needle)) })).filter((g) => g.rows.length > 0);
  }

  return {
    ...palette,
    channelGroups: filterGroups(palette.channelGroups),
    constants: filterGroups(palette.constants),
    definitions: filterGroups(palette.definitions),
  };
}

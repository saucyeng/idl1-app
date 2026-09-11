/**
 * Builds the maths graph's structure — nodes, edges, and cell groups — from
 * a workbook's markdown and its latest evaluation. **The file is the source
 * of truth; the graph is an editor over its math cells** (decision 40): a
 * node exists because a `def_line` exists in the document, not because it
 * has evaluated yet. `CellOutput[]` is consulted only to attach a
 * definition's display `label` when core has already computed one (§3.1's
 * `# label:` comment) — this module never re-derives a value, a shape, or a
 * status; that is `graphStatus.ts`'s job (Task 7) reading `CellDefResult`
 * directly. This module computes no number and is never called on the
 * interaction path (CLAUDE.md §2: "Rust = numbers, JS = pictures").
 *
 * **Def-line scan, not a second `tokenizeMath`.** Splitting a math cell's
 * body into `def_line`s (C2 §3.1) is a coarser grammar layer than
 * `tokenizeMath` covers — the same relationship `cells.ts`'s fence scan has
 * to Rust's `scan_cells` (ruling R52 Q3(a)): a fast, non-authoritative,
 * line-oriented mirror of `math_cell.rs::parse_math_cell_body`, built
 * entirely on top of `mathMode.ts`'s `tokenizeMath` for the actual token
 * classification (keyword/identifier/comment/labelComment/operator), never
 * re-implementing it. Rust remains the sole authority on whether a math
 * cell is valid (C3 §3.4).
 */

import type { CellOutput } from "../../../../ipc/workbook";
import { scanCells } from "./cells";
import { extractChannelCalls, extractSpectrumCalls } from "./jsCellCalls";
import { scanMathExpr } from "./mathExpr";
import { tokenizeMath } from "./mathMode";
import { cellLabelFromBody } from "../graph/cellDisplayName";
import { parse as parsePlotForm } from "../plotForm/parse";
import type { MarkProps } from "../plotForm/types";

/** One graph node: a math-cell definition, or a source node standing in for
 *  a name referenced but not defined anywhere in the document (§3.7.3's
 *  "another cell's definition, or a session channel" — this module cannot
 *  tell which without the session's channel list, so every undefined
 *  reference becomes a `"channel"` node; `graphStatus.ts` (Task 7) is what
 *  tells a real channel apart from a typo). */
export interface GraphNode {
  /** Stable across re-renders and reorders as long as the name itself does
   *  not change (§3.7.3: renaming a definition is the one gesture that
   *  intentionally moves a node's identity, handled by `graphEdits.ts`). */
  id: string;
  /**
   * Which of ruling R214 item 1's three kinds this node is, in this
   * module's own vocabulary: `"channel"` is R214's **source** (a device
   * channel, or any name referenced but never defined), `"definition"` is
   * its **derived** (a maths definition), and `"chart"` is its **chart**
   * (one `js` cell's plotted output). The R214 words are the *display*
   * vocabulary — `graph/NodeCard.tsx` maps these three values to the shape
   * and glyph a reader sees; the model keeps the names the rest of this
   * lane already uses rather than renaming two existing kinds for it.
   */
  kind: "definition" | "channel" | "chart";
  /** The definition's `identifier` (C2 §3.1), the referenced name for a
   *  `"channel"` node, or the owning cell's id for a `"chart"` node (which
   *  has no name of its own in the document — what a reader sees is
   *  `graph/cellDisplayName.ts`'s display name, resolved by the view). */
  name: string;
  /** The `# label:` display name (§3.1), preferring a completed
   *  evaluation's `CellDefResult.label` and falling back to this module's
   *  own markdown scan when no evaluation has run yet — never guessed
   *  beyond what one of those two sources states. `null` for a `"channel"`
   *  node and for a definition with no `# label:` comment. */
  label: string | null;
  /** The owning math cell's `hex8` id (C2 §2.2), or a `"chart"` node's own
   *  `js` cell. `null` for a `"channel"` node — it has no cell of its own. */
  cellId: string | null;
  /** The `def_line`'s right-hand-side expression text, verbatim. `null` for
   *  a `"channel"` and a `"chart"` node. */
  exprText: string | null;
  /** A `"chart"` node's Plot mark (C2 §5.3), when the cell's code matches
   *  `plotForm/parse.ts`'s closed grammar — the pictogram
   *  `graph/chartTypeIcons.tsx` draws in its header. `null` for every other
   *  kind, and for a hand-written `js` cell outside that grammar: R214 asks
   *  for "a chart-type icon", and a cell whose type cannot be read states
   *  that rather than being drawn as a line chart on a guess. */
  mark: MarkProps["mark"] | null;
}

/** One dependency wire: `source` is referenced by `target`'s expression. */
export interface GraphEdge {
  /** `${source}->${target}`, stable given stable node ids. */
  id: string;
  source: string;
  target: string;
}

/** One math cell's subgraph frame (§3.7.3). */
export interface GraphGroup {
  /** The cell's `hex8` id. */
  id: string;
  /** The cell's `# label:` display name (§3.7.3), or `null` when the cell's
   *  first non-blank line isn't one. */
  label: string | null;
  /** This group's node ids, in `def_line` source order. */
  nodeIds: string[];
}

/** A workbook's graph structure, as {@link buildGraphModel} sees it from the
 *  current document text and evaluation. */
export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
}

/** One `def_line` as this module's non-authoritative scan sees it — see the
 *  module doc comment. */
interface DefLine {
  name: string;
  exprText: string;
  label: string | null;
}

/** Strips a trailing `\r` from a line already split on `\n`. */
function stripCr(line: string): string {
  return line.replace(/\r$/, "");
}

/** Splits a math cell's body into its `def_line`s (C2 §3.1), skipping
 *  `blank_line`, `comment_line`, and `const_line` — a `const` line is a
 *  workbook-scoped scalar, not a graph node. Built entirely on
 *  {@link tokenizeMath}; see the module doc comment. */
function parseDefLines(body: string): DefLine[] {
  const defs: DefLine[] = [];

  for (const raw of body.split("\n")) {
    const line = stripCr(raw);
    if (line.trim().length === 0) continue;

    const tokens = tokenizeMath(line);
    const first = tokens[0];
    if (first === undefined) continue;
    if (first.kind === "comment" || first.kind === "labelComment") continue; // comment_line
    if (first.kind === "keyword" && first.text === "const") continue; // const_line
    if (first.kind !== "identifier") continue; // not a def_line this scan recognises

    const eqToken = tokens.find((t) => t.kind === "operator" && t.text === "=");
    if (eqToken === undefined) continue;

    const trailing = tokens.find((t) => t.kind === "comment" || t.kind === "labelComment");
    const exprEnd = trailing !== undefined ? trailing.start : line.length;
    const exprText = line.slice(eqToken.end, exprEnd).trim();
    const label = trailing !== undefined && trailing.kind === "labelComment"
      ? trailing.text.replace(/^#\s*label\s*:\s*/, "").trim()
      : null;

    defs.push({ name: first.text, exprText, label });
  }

  return defs;
}

const definitionNodeId = (name: string): string => `def:${name}`;
const channelNodeId = (name: string): string => `channel:${name}`;
/** A `"chart"` node's id — keyed by cell, since a `js` cell is the whole
 *  node (R214 item 1's third kind), not one definition inside one. */
const chartNodeId = (cellId: string): string => `chart:${cellId}`;

/** The Plot mark one `js` cell's code charts with, when the whole cell
 *  matches `plotForm/parse.ts`'s grammar — a time chart's first mark, or a
 *  spectrum chart's single one. `null` for anything that grammar rejects
 *  (see {@link GraphNode.mark}), and for a chart kind whose mark name is
 *  fixed by the grammar rather than chosen: a histogram cell is always
 *  `Plot.rectY` (C2 §5.3, ruling R215 item 2), so reporting `"rectY"` here
 *  would put the *time* bar mark's pictogram on a card whose picture is a
 *  distribution — `null` gets the neutral placeholder glyph instead, which
 *  is the honest answer to "which mark did the author pick". */
function chartMarkOf(code: string): MarkProps["mark"] | null {
  const props = parsePlotForm(code);
  if (props === null) return null;
  if (props.chart === "time") return props.marks[0]?.mark ?? null;
  if (props.chart === "fft") return props.mark.mark;
  return null;
}

/**
 * Every `def_line` identifier declared anywhere in `markdown`'s `math`
 * cells — regardless of whether it evaluated successfully (ruling R150's
 * amendment: `CellDefResult`'s own doc comment says a structural problem
 * "keeps it out of `defs` entirely", so a definition whose `def_line` is
 * itself malformed, e.g. a bare `channel(...)` argument instead of
 * `[Name]`, has no `CellDefResult` at all — this scan is the only source
 * that still knows the name was declared). Used by `Notebook/index.tsx`'s
 * `jsCellNote` wiring to tell "this name was never declared" apart from
 * "this name is declared, but its own math cell errored" for a `js` cell's
 * unresolved `channel(...)`/`spectrum(...)` reference. Same first-pass scan
 * {@link buildGraphModel} runs internally, exposed standalone so a caller
 * that only needs the name set isn't required to also pass `CellOutput[]`
 * or build the full graph.
 */
export function declaredDefinitionNames(markdown: string): ReadonlySet<string> {
  const doc = scanCells(markdown);
  const bytes = new TextEncoder().encode(markdown);
  const decoder = new TextDecoder();

  const names = new Set<string>();
  for (const cell of doc.cells) {
    if (cell.kind !== "math" || cell.id === null) continue;
    const body = decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
    for (const def of parseDefLines(body)) names.add(def.name);
  }
  return names;
}

/**
 * Maps every `def_line` name to the `math` cell that declares it (decision
 * 58's "Fix" affordance, `model/fixTarget.ts`): the same scan as
 * {@link declaredDefinitionNames}, keeping the owning `cellId` instead of
 * discarding it. A name declared twice (a document error C3 §3.4 already
 * rejects at eval time) keeps whichever cell this scan visits last — this
 * module makes no attempt to pick a "correct" one, since the document
 * itself is already invalid in that case.
 */
export function definitionCellIds(markdown: string): ReadonlyMap<string, string> {
  const doc = scanCells(markdown);
  const bytes = new TextEncoder().encode(markdown);
  const decoder = new TextDecoder();

  const cellIds = new Map<string, string>();
  for (const cell of doc.cells) {
    if (cell.kind !== "math" || cell.id === null) continue;
    const body = decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
    for (const def of parseDefLines(body)) cellIds.set(def.name, cell.id);
  }
  return cellIds;
}

/**
 * Builds the graph's nodes, edges, and groups from `markdown`'s math cells
 * and (optionally) the latest `CellOutput[]` for display labels. One node
 * per `def_line`; one additional `"channel"` node per name referenced but
 * not defined anywhere in the document; one edge per reference; one group
 * per math cell, in document order.
 */
export function buildGraphModel(markdown: string, outputs: CellOutput[]): GraphModel {
  const doc = scanCells(markdown);
  const bytes = new TextEncoder().encode(markdown);
  const decoder = new TextDecoder();

  const outputsByCellId = new Map(outputs.map((o) => [o.cell_id, o]));

  // First pass: every definition name in the document, so a reference can
  // be classified definition-vs-channel before any node is built — C2
  // §3.1's flat namespace is document-wide, not per-cell.
  const perCellDefs = new Map<string, DefLine[]>();
  const definitionNames = new Set<string>();
  for (const cell of doc.cells) {
    if (cell.kind !== "math" || cell.id === null) continue;
    const body = decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
    const defs = parseDefLines(body);
    perCellDefs.set(cell.id, defs);
    for (const def of defs) definitionNames.add(def.name);
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const groups: GraphGroup[] = [];
  const channelNames = new Set<string>();

  for (const cell of doc.cells) {
    if (cell.kind !== "math" || cell.id === null) continue;
    const body = decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
    const defs = perCellDefs.get(cell.id) ?? [];
    const output = outputsByCellId.get(cell.id);
    const resultsByName = new Map((output?.defs ?? []).map((d) => [d.name, d]));
    const nodeIds: string[] = [];

    for (const def of defs) {
      const result = resultsByName.get(def.name);
      const id = definitionNodeId(def.name);
      nodes.push({
        id,
        kind: "definition",
        name: def.name,
        label: result?.label ?? def.label,
        cellId: cell.id,
        exprText: def.exprText,
        mark: null,
      });
      nodeIds.push(id);

      const { refs } = scanMathExpr(def.exprText);
      for (const ref of refs) {
        const isDefinition = definitionNames.has(ref);
        const targetId = isDefinition ? definitionNodeId(ref) : channelNodeId(ref);
        if (!isDefinition && !channelNames.has(ref)) {
          channelNames.add(ref);
          nodes.push({ id: targetId, kind: "channel", name: ref, label: null, cellId: null, exprText: null, mark: null });
        }
        edges.push({ id: `${targetId}->${id}`, source: targetId, target: id });
      }
    }

    groups.push({ id: cell.id, label: cellLabelFromBody(body), nodeIds });
  }

  // R214 item 1's third kind: one node per `js` cell — the chart its code
  // draws. Its inputs are every name the cell's `channel(...)`/
  // `spectrum(...)` calls read (`jsCellCalls.ts`, which sees them in a
  // hand-written cell the `plotForm` grammar rejects too), resolved against
  // the same document-wide definition namespace a math reference is: a name
  // no math cell declares is a source, exactly as in the loop above. A `js`
  // cell gets no subgraph frame — frames are math cells' own boundary
  // boxes (C2 §3.7.3) and a chart cell holds no definitions to enclose.
  for (const cell of doc.cells) {
    if (cell.kind !== "js" || cell.id === null) continue;
    const code = decoder.decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
    const id = chartNodeId(cell.id);
    nodes.push({ id, kind: "chart", name: cell.id, label: null, cellId: cell.id, exprText: null, mark: chartMarkOf(code) });

    const refs = [...extractChannelCalls(code).map((c) => c.channel), ...extractSpectrumCalls(code).map((c) => c.channel)];
    for (const ref of new Set(refs)) {
      const isDefinition = definitionNames.has(ref);
      const sourceId = isDefinition ? definitionNodeId(ref) : channelNodeId(ref);
      if (!isDefinition && !channelNames.has(ref)) {
        channelNames.add(ref);
        nodes.push({ id: sourceId, kind: "channel", name: ref, label: null, cellId: null, exprText: null, mark: null });
      }
      edges.push({ id: `${sourceId}->${id}`, source: sourceId, target: id });
    }
  }

  return { nodes, edges, groups };
}

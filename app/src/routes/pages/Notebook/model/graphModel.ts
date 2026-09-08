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
import { scanMathExpr } from "./mathExpr";
import { tokenizeMath } from "./mathMode";

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
  kind: "definition" | "channel";
  /** The definition's `identifier` (C2 §3.1), or the referenced name for a
   *  `"channel"` node. */
  name: string;
  /** The `# label:` display name (§3.1), preferring a completed
   *  evaluation's `CellDefResult.label` and falling back to this module's
   *  own markdown scan when no evaluation has run yet — never guessed
   *  beyond what one of those two sources states. `null` for a `"channel"`
   *  node and for a definition with no `# label:` comment. */
  label: string | null;
  /** The owning math cell's `hex8` id (C2 §2.2). `null` for a `"channel"`
   *  node — it has no cell of its own. */
  cellId: string | null;
  /** The `def_line`'s right-hand-side expression text, verbatim. `null` for
   *  a `"channel"` node. */
  exprText: string | null;
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

/** The cell-level display name (§3.7.3): the cell's first non-blank line,
 *  when it is a whole-line `# label: <text>` comment and nothing else. */
function cellLabel(body: string): string | null {
  for (const raw of body.split("\n")) {
    const line = stripCr(raw);
    if (line.trim().length === 0) continue;
    const tokens = tokenizeMath(line);
    if (tokens.length === 1 && tokens[0].kind === "labelComment") {
      return tokens[0].text.replace(/^#\s*label\s*:\s*/, "").trim();
    }
    return null; // first non-blank line is something other than a label comment
  }
  return null;
}

const definitionNodeId = (name: string): string => `def:${name}`;
const channelNodeId = (name: string): string => `channel:${name}`;

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
      });
      nodeIds.push(id);

      const { refs } = scanMathExpr(def.exprText);
      for (const ref of refs) {
        const isDefinition = definitionNames.has(ref);
        const targetId = isDefinition ? definitionNodeId(ref) : channelNodeId(ref);
        if (!isDefinition && !channelNames.has(ref)) {
          channelNames.add(ref);
          nodes.push({ id: targetId, kind: "channel", name: ref, label: null, cellId: null, exprText: null });
        }
        edges.push({ id: `${targetId}->${id}`, source: targetId, target: id });
      }
    }

    groups.push({ id: cell.id, label: cellLabel(body), nodeIds });
  }

  return { nodes, edges, groups };
}

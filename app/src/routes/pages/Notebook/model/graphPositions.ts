/**
 * Where a maths-graph node sits on the canvas — **renderer state, per
 * machine** (ruling R212 item 3), a sibling of `notebookColumns.ts` and
 * stored the same way.
 *
 * This is a deliberate reversal of UI-DIRECTION-2 decision 45b, which put
 * canvas positions in the workbook file (C2 §3.7.1's `graph` front-matter
 * key). R212: "Node positions are renderer state, per machine …, never
 * written to the workbook file (§3 'the workbook is a file'; positions are
 * not maths)." Two people opening the same synced workbook on two monitors
 * want two arrangements, and a drag must never mark a document dirty.
 *
 * **The file's `graph` key is still read, never written.** A workbook that
 * already carries positions keeps them: {@link effectiveGraphLayout} merges
 * this machine's stored positions *over* the file's, so an existing layout
 * is the starting point and every drag from then on is local. Nothing here
 * writes markdown, and `graphLayout.ts`'s `writeGraphLayout` now has just
 * one caller left — `graphEdits.ts`, keeping an existing `graph` key's keys
 * consistent when a definition is renamed or deleted, rather than leaving
 * stale entries in a file it did not create.
 *
 * **Keying.** R212 says "keyed by workbook id + cell id". The stored map is
 * keyed by workbook id and then by *node* — definition name for a node,
 * `hex8` cell id for a subgraph frame — because that is what a position
 * belongs to: one cell holds many definitions, each with its own card, and
 * a cell-keyed map could not hold them. Same two-level shape as C2
 * §3.7.1's own `graph.nodes` / `graph.cells` split, which is why
 * {@link GraphLayout} is reused unchanged as the value type and
 * `computeAutoLayoutPositions` needs no edit at all.
 */

import { EMPTY_GRAPH_LAYOUT, type GraphLayout } from "./graphLayout";

/** Same storage convention as `notebookColumns.ts` and `columnPrefs.ts`:
 *  `idl1.<area>.<thing>.v<n>`, a sibling key rather than an overloaded one. */
const STORAGE_KEY = "idl1.notebook.graphPositions.v1";

/** Every workbook this machine has arranged, keyed by workbook id. */
export type StoredGraphPositions = Record<string, GraphLayout>;

/** Narrows `raw` to a plain JSON object, or `undefined` for anything else. */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

/** Narrows one entry to an `[x, y]` pair of finite numbers, or `undefined`. */
function asPoint(raw: unknown): [number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const [x, y] = raw;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return [x, y];
}

/** Clamps one workbook's stored entry to a usable {@link GraphLayout}.
 *  Total over `raw`: a hand-edited or stale value drops the entries it
 *  cannot read and keeps the ones it can, rather than throwing away a whole
 *  arrangement over one bad number. */
export function sanitizeGraphLayout(raw: unknown): GraphLayout {
  const record = asRecord(raw);
  if (record === undefined) return EMPTY_GRAPH_LAYOUT;
  const pick = (from: unknown): Record<string, [number, number]> => {
    const source = asRecord(from) ?? {};
    const out: Record<string, [number, number]> = {};
    for (const [key, value] of Object.entries(source)) {
      const point = asPoint(value);
      if (point !== undefined) out[key] = point;
    }
    return out;
  };
  return { nodes: pick(record.nodes), cells: pick(record.cells) };
}

/** Clamps the whole stored document. */
export function sanitizeStoredGraphPositions(raw: unknown): StoredGraphPositions {
  const record = asRecord(raw);
  if (record === undefined) return {};
  const out: StoredGraphPositions = {};
  for (const [workbookId, value] of Object.entries(record)) out[workbookId] = sanitizeGraphLayout(value);
  return out;
}

/** Reads this machine's stored positions for `workbookId`. Never throws: a
 *  WebView that refuses storage, an absent value, or unparsable JSON all
 *  yield the empty layout — which `computeAutoLayoutPositions` reads as
 *  "auto-place everything", not "everything at the origin". */
export function readGraphPositions(workbookId: string | null): GraphLayout {
  if (workbookId === null) return EMPTY_GRAPH_LAYOUT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return EMPTY_GRAPH_LAYOUT;
    return sanitizeStoredGraphPositions(JSON.parse(raw))[workbookId] ?? EMPTY_GRAPH_LAYOUT;
  } catch {
    return EMPTY_GRAPH_LAYOUT;
  }
}

/** Persists `layout` as `workbookId`'s arrangement, leaving every other
 *  workbook's entry untouched. Never throws — a refused write is silently
 *  dropped, same as `notebookColumns.ts`'s own writer (a remembered layout
 *  is a convenience, not a correctness requirement). */
export function writeGraphPositions(workbookId: string | null, layout: GraphLayout): void {
  if (workbookId === null) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const all = raw === null ? {} : sanitizeStoredGraphPositions(JSON.parse(raw));
    all[workbookId] = layout;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage refused (private mode, cleared site data, a policy).
  }
}

/** `layout` with one definition node moved to `(x, y)`, rounded to whole
 *  canvas units — the same rounding the file-backed `commitDrag` applied,
 *  so a position does not accumulate sub-pixel drift over many drags. Pure:
 *  returns a new layout, writes nothing. */
export function setNodePosition(layout: GraphLayout, name: string, x: number, y: number): GraphLayout {
  return { ...layout, nodes: { ...layout.nodes, [name]: [Math.round(x), Math.round(y)] } };
}

/** `layout` with one subgraph frame moved, by `hex8` cell id. Pure. */
export function setCellPosition(layout: GraphLayout, cellId: string, x: number, y: number): GraphLayout {
  return { ...layout, cells: { ...layout.cells, [cellId]: [Math.round(x), Math.round(y)] } };
}

/**
 * What the canvas should actually draw: this machine's stored positions
 * laid over whatever the file already carried.
 *
 * The merge is per entry, not whole-layout: a workbook that shipped with
 * positions for ten nodes and has had one dragged here keeps the file's
 * nine and this machine's one. The file is never written back (see the
 * module doc comment), so its entries stay as the shared starting point
 * forever.
 *
 * @param fromFile `graphLayout.ts`'s `readGraphLayout(markdown)`.
 * @param stored {@link readGraphPositions} for the open workbook.
 */
export function effectiveGraphLayout(fromFile: GraphLayout, stored: GraphLayout): GraphLayout {
  return {
    nodes: { ...fromFile.nodes, ...stored.nodes },
    cells: { ...fromFile.cells, ...stored.cells },
  };
}

/**
 * The layout "Tidy" writes (R212 item 3: "a 'Tidy' button that re-runs it …
 * Tidy overwrites"). Every definition node in `positions` gets an explicit
 * stored entry at its freshly computed place, so the arrangement is
 * recorded rather than merely displayed — otherwise a workbook whose file
 * carries old positions would snap back to them on the next render, since
 * {@link effectiveGraphLayout} would find nothing stored to lay over.
 *
 * @param positions `computeAutoLayoutPositions`' result, keyed by node id.
 * @param nodeNameById Definition node id → its definition name. A node absent from this map (a `"channel"` node) has no stored-position home and is skipped.
 */
export function tidiedLayout(positions: Record<string, [number, number]>, nodeNameById: Map<string, string>): GraphLayout {
  const nodes: Record<string, [number, number]> = {};
  for (const [id, [x, y]] of Object.entries(positions)) {
    const name = nodeNameById.get(id);
    if (name !== undefined) nodes[name] = [Math.round(x), Math.round(y)];
  }
  // Frames are derived from their members' positions every render
  // (`graphSubgraphFrame.ts`), so Tidy clears any stored frame position
  // rather than pinning a box that no longer bounds anything.
  return { nodes, cells: {} };
}

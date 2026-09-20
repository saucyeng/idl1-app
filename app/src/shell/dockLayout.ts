/**
 * The studio's tiling layout, as a value (ruling R239, closing R227).
 *
 * R213's four presets were four writes over the column mechanism
 * (`layoutPresets.ts`). R239 replaces that mechanism with Dockview: the
 * three studio panels — Notebook, Maths, Code — are dock panels in a split
 * tree that the user drags, splits and resizes, and the arrangement is a
 * serialisable document rather than a visibility record plus one width.
 * The four presets survive as **named layouts** expressed in exactly that
 * document and applied through exactly the same path a restored layout
 * takes, so there is one way for an arrangement to reach the screen.
 *
 * Pure and dependency-free, `layoutPresets.ts`'s and `aspectClass.ts`'s
 * pattern: no `react` import, no DOM, no storage, and no value imported
 * from `dockview` — only its `SerializedDockview` *type*, which is erased.
 * `shell/dockFrame.ts` owns the live component; `columnPrefs.ts` owns the
 * per-machine document this is stored in.
 *
 * ## The layout document
 *
 * {@link SerializedDockview} is Dockview's own shape and this module never
 * invents a parallel one — a layout the user dragged into place comes back
 * from `api.toJSON()` in that shape, and a named layout has to be
 * indistinguishable from it or "applied through the same path" would be a
 * lie. What this module adds is the {@link DOCK_LAYOUT_VERSION} envelope
 * and {@link sanitizeDockLayout}: a stored document from an older version,
 * a hand-edited one, or one naming a panel this build no longer has falls
 * back to the default layout and never throws (R239's brief, item 3).
 *
 * ## Grid geometry
 *
 * Dockview's grid is a `gridview`: a tree of branch and leaf nodes whose
 * root carries an {@link Orientation}, alternating at every level. A
 * branch laid out `"HORIZONTAL"` distributes *width* among its children
 * (`BranchNode.width === size` when horizontal), so a child's `size` is
 * its width there and its height one level down. The nominal
 * {@link NOMINAL_GRID_WIDTH_PX}/{@link NOMINAL_GRID_HEIGHT_PX} a named
 * layout is written at are never the real viewport: Dockview scales the
 * tree to the container it is handed, so only the *ratios* between sibling
 * sizes carry over.
 */

import type { SerializedDockview } from "dockview";

import type { AspectClass } from "./aspectClass";
import { DEFAULT_PRESET_BY_CLASS, OUTPUT_COLUMN_MIN_WIDTH_PX, type LayoutPresetId } from "./layoutPresets";

/**
 * The three dock panels (R239; R225 item 2's words for them).
 *
 * The ids are `routes/pages/Notebook/model/notebookColumns.ts`'s
 * `NotebookColumnId`s, restated here rather than imported for the reason
 * `layoutPresets.ts` restates `PresetColumnVisibility`: `shell/` never
 * imports from `routes/pages/`. They are deliberately the same strings, so
 * the ribbon's three toggles (which are that module's ids) map to panels
 * without a translation table in between — a toggle *is* a panel's
 * presence (R239, brief item 2).
 */
export type DockPanelId = "graph" | "properties" | "cells";

/** {@link DockPanelId}'s members in the studio's reference left-to-right
 *  order — `columnPrefs.ts`'s `COLUMN_IDS` order with the never-rendered
 *  `library` column dropped and `output` under its panel name. */
export const DOCK_PANEL_IDS: readonly DockPanelId[] = ["graph", "properties", "cells"];

/** What each panel's tab says. Full words, R225 item 2: "Graph/Properties/
 *  Cells deserve full words: Maths, Code, Notebook" — the same three
 *  labels `commandTiers.ts` puts on the ribbon buttons, so a tab and the
 *  button that closes it can never disagree. */
export const DOCK_PANEL_TITLES: Readonly<Record<DockPanelId, string>> = {
  graph: "Maths",
  properties: "Code",
  cells: "Notebook",
};

/** The `contentComponent` every panel is registered under in
 *  `DockFrame.tsx`'s component map. One component serves all three (each
 *  panel is an empty slot container, R109), so the id is the panel's own
 *  and the component reads which slot it is from `props.api.id`. */
export const DOCK_PANEL_COMPONENT = "slot";

/** The envelope version. Bumped whenever a stored document's meaning
 *  changes; an older or newer number restores the default layout rather
 *  than guessing (R239, brief item 3: "a corrupt or older layout falls
 *  back to the default, never throws"). */
export const DOCK_LAYOUT_VERSION = 1;

/** Width a named layout's sizes are written against, in CSS px. Nominal:
 *  Dockview rescales the tree to the real container, so this only fixes
 *  the ratios between siblings. */
export const NOMINAL_GRID_WIDTH_PX = 1600;

/** Height a named layout's sizes are written against, in CSS px. Nominal
 *  for {@link NOMINAL_GRID_WIDTH_PX}'s reason. */
export const NOMINAL_GRID_HEIGHT_PX = 900;

/** How tall the Stacked layout opens its Maths row, in CSS px — R213 item
 *  1's row height, carried over from `ColumnFrame.tsx`'s
 *  `MATHS_ROW_DEFAULT_HEIGHT_PX` so the named layout reproduces the
 *  arrangement the preset had. */
export const STACKED_MATHS_ROW_HEIGHT_PX = 300;

/** The Code panel's reference width, in CSS px —
 *  `columnPrefs.ts`'s `properties` default. */
const CODE_PANEL_WIDTH_PX = 320;

/** The Maths panel's reference width, in CSS px — `columnPrefs.ts`'s
 *  `maths` default. */
const MATHS_PANEL_WIDTH_PX = 480;

/** A stored layout with the version it was written under. */
export interface DockLayoutDocument {
  /** {@link DOCK_LAYOUT_VERSION} at the time of writing. */
  version: number;
  /** Dockview's own serialised form, as `api.toJSON()` returns it. */
  layout: SerializedDockview;
}

/** One leaf of the grid tree: a group holding one panel. Dockview allows
 *  several panels per group (tabs); a named layout never writes one,
 *  because none of the four presets stacks two panels behind tabs — the
 *  user makes those by dragging, and a restored layout carries them. */
function leaf(id: DockPanelId, sizePx: number) {
  return {
    type: "leaf" as const,
    data: { views: [id], activeView: id, id: `group-${id}` },
    size: sizePx,
  };
}

/** One branch of the grid tree, laid out along its parent's orthogonal
 *  axis (Dockview alternates orientation per level; see the module doc). */
function branch(children: ReturnType<typeof leaf>[], sizePx: number) {
  return { type: "branch" as const, data: children, size: sizePx };
}

/** The `panels` record for `ids` — every panel present in a layout must
 *  have an entry here or Dockview has nothing to construct.
 *
 *  `renderer: "always"` on all three, deliberately and load-bearing: it
 *  puts a panel's content in Dockview's overlay render container, which is
 *  repositioned rather than reparented when the panel moves group or its
 *  tab goes inactive. A reparented element loses its descendants' scroll
 *  offsets and reloads any iframe inside it, which is exactly what R239's
 *  brief item 4 asks not to happen on a re-dock. */
function panelStates(ids: readonly DockPanelId[]): SerializedDockview["panels"] {
  const panels: SerializedDockview["panels"] = {};
  for (const id of ids) {
    panels[id] = {
      id,
      contentComponent: DOCK_PANEL_COMPONENT,
      title: DOCK_PANEL_TITLES[id],
      renderer: "always",
    };
  }
  return panels;
}

/** Assembles a whole document from a root node and the panels it names. */
function dockview(root: SerializedDockview["grid"]["root"], ids: readonly DockPanelId[]): SerializedDockview {
  return {
    grid: {
      root,
      width: NOMINAL_GRID_WIDTH_PX,
      height: NOMINAL_GRID_HEIGHT_PX,
      // A string enum in Dockview (`Orientation.HORIZONTAL === "HORIZONTAL"`),
      // written as the literal so this module imports no value from the
      // package and stays pure.
      orientation: "HORIZONTAL" as SerializedDockview["grid"]["orientation"],
    },
    panels: panelStates(ids),
    activeGroup: `group-${ids.includes("cells") ? "cells" : ids[0]}`,
  };
}

/**
 * The four named layouts (R239: "the R218/R227 aspect-ratio presets become
 * named saved layouts applied through the same serialiser"), keyed by the
 * preset id they replace so `layoutPresets.ts`'s cycle, picker and
 * per-class defaults keep working unchanged.
 *
 * Each reproduces the arrangement `ColumnFrame.tsx` built for that preset:
 *
 * - **Output** — the Notebook alone, full width. Maths and Code are absent
 *   from the tree, which is what R213 item 1's "notebook output full
 *   width" means and what `visibleColumnIds` did by dropping the column.
 * - **Maths** — Maths | Code | Notebook left to right, the Notebook at
 *   {@link OUTPUT_COLUMN_MIN_WIDTH_PX} ("output narrow (min width, still
 *   live)").
 * - **Split** — the same three, the Notebook taking the width the other
 *   two do not.
 * - **Stacked** — Code beside, and Maths as a row above the Notebook
 *   ({@link STACKED_MATHS_ROW_HEIGHT_PX}) rather than a column beside it.
 */
export function namedDockLayout(id: LayoutPresetId): SerializedDockview {
  switch (id) {
    case "output":
      return dockview(branch([leaf("cells", NOMINAL_GRID_WIDTH_PX)], NOMINAL_GRID_WIDTH_PX), ["cells"]);

    case "maths":
      return dockview(
        branch(
          [
            leaf("graph", NOMINAL_GRID_WIDTH_PX - CODE_PANEL_WIDTH_PX - OUTPUT_COLUMN_MIN_WIDTH_PX),
            leaf("properties", CODE_PANEL_WIDTH_PX),
            leaf("cells", OUTPUT_COLUMN_MIN_WIDTH_PX),
          ],
          NOMINAL_GRID_WIDTH_PX
        ),
        DOCK_PANEL_IDS
      );

    case "split":
      return dockview(
        branch(
          [
            leaf("graph", MATHS_PANEL_WIDTH_PX),
            leaf("properties", CODE_PANEL_WIDTH_PX),
            leaf("cells", NOMINAL_GRID_WIDTH_PX - MATHS_PANEL_WIDTH_PX - CODE_PANEL_WIDTH_PX),
          ],
          NOMINAL_GRID_WIDTH_PX
        ),
        DOCK_PANEL_IDS
      );

    case "stacked":
      return dockview(
        {
          type: "branch",
          data: [
            leaf("properties", CODE_PANEL_WIDTH_PX),
            // One level down the axis flips, so these two sizes are
            // heights: the Maths row above, the Notebook below it.
            branch(
              [
                leaf("graph", STACKED_MATHS_ROW_HEIGHT_PX),
                leaf("cells", NOMINAL_GRID_HEIGHT_PX - STACKED_MATHS_ROW_HEIGHT_PX),
              ],
              NOMINAL_GRID_WIDTH_PX - CODE_PANEL_WIDTH_PX
            ),
          ],
          size: NOMINAL_GRID_WIDTH_PX,
        },
        DOCK_PANEL_IDS
      );
  }
}

/** The layout a viewport of shape `cls` opens with before anything has
 *  been stored for it — R213 item 2's per-class default, unchanged
 *  ("ultrawide → Split, wide → Stacked, narrow → Output"), now expressed
 *  as a layout rather than a preset id. */
export function defaultDockLayoutFor(cls: AspectClass): SerializedDockview {
  return namedDockLayout(DEFAULT_PRESET_BY_CLASS[cls]);
}

/** Whether `raw` names one of the three panels. */
export function isDockPanelId(raw: unknown): raw is DockPanelId {
  return typeof raw === "string" && (DOCK_PANEL_IDS as readonly string[]).includes(raw);
}

/** Narrows `raw` to a plain JSON object, or `undefined` for anything else
 *  (including `null` and arrays) — `columnPrefs.ts`'s own guard. */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

/** A positive, finite number, or `undefined`. */
function asSize(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

/** How deep a stored grid tree may nest before it is rejected as
 *  unusable. Three panels can be arranged at most three levels deep by
 *  hand; the bound is generous and exists to terminate, not to constrain
 *  (see {@link collectPanelIds}). */
const MAX_GRID_DEPTH = 32;

/**
 * Walks a grid node, collecting the panel ids its leaves name, and returns
 * `false` the moment anything is not a node this build can construct: an
 * unknown `type`, a branch with no children, a leaf with no views, a view
 * that is not a {@link DockPanelId}, or the same panel in two leaves
 * (Dockview would build one and silently drop the other).
 *
 * Recursion is bounded by {@link MAX_GRID_DEPTH} rather than trusting the
 * document to be a tree: a hand-edited file is the input this function
 * exists for, and a cyclic one would otherwise hang the render thread
 * (R201 — nothing blocks the main thread).
 */
function collectPanelIds(node: unknown, found: Set<DockPanelId>, depth: number): boolean {
  if (depth > MAX_GRID_DEPTH) return false;
  const record = asRecord(node);
  if (record === undefined) return false;

  if (record.type === "branch") {
    if (!Array.isArray(record.data) || record.data.length === 0) return false;
    return record.data.every((child) => collectPanelIds(child, found, depth + 1));
  }

  if (record.type !== "leaf") return false;
  const data = asRecord(record.data);
  if (data === undefined || !Array.isArray(data.views) || data.views.length === 0) return false;
  for (const view of data.views) {
    if (!isDockPanelId(view) || found.has(view)) return false;
    found.add(view);
  }
  return true;
}

/**
 * The panels a layout actually shows, in {@link DOCK_PANEL_IDS} order, or
 * `null` when the layout is not one this build can construct.
 *
 * This is what the ribbon's three toggles read: "the toggles reflect panel
 * presence" (R239, brief item 2) is this function applied to the live
 * layout, so a panel dragged shut by its tab and one closed from the
 * ribbon leave the toggles saying the same thing.
 */
export function dockLayoutPanelIds(layout: unknown): DockPanelId[] | null {
  const record = asRecord(layout);
  const grid = asRecord(record?.grid);
  if (grid === undefined) return null;
  if (grid.orientation !== "HORIZONTAL" && grid.orientation !== "VERTICAL") return null;
  if (asSize(grid.width) === undefined || asSize(grid.height) === undefined) return null;

  const found = new Set<DockPanelId>();
  if (!collectPanelIds(grid.root, found, 0)) return null;
  if (found.size === 0) return null;

  // Every panel the grid names must have a `panels` entry, or Dockview has
  // no component to build it from and throws mid-deserialise.
  const panels = asRecord(record?.panels);
  if (panels === undefined) return null;
  for (const id of found) {
    if (asRecord(panels[id]) === undefined) return null;
  }

  return DOCK_PANEL_IDS.filter((id) => found.has(id));
}

/**
 * A restored document as a layout this build can apply.
 *
 * Total over `raw`: a document from another {@link DOCK_LAYOUT_VERSION}, a
 * missing or malformed grid, a panel this build no longer has, or storage
 * handing back something that is not an object at all, all yield
 * `fallback`. Never throws — a remembered arrangement is a convenience,
 * and losing it must not cost the user their session (`columnPrefs.ts`'s
 * own storage discipline).
 *
 * @param raw The parsed stored document, of unknown shape.
 * @param fallback The layout to use when `raw` is unusable — normally
 *   {@link defaultDockLayoutFor} for the current viewport shape.
 */
export function sanitizeDockLayout(raw: unknown, fallback: SerializedDockview): SerializedDockview {
  const record = asRecord(raw);
  if (record === undefined || record.version !== DOCK_LAYOUT_VERSION) return fallback;
  const layout = asRecord(record.layout);
  if (layout === undefined) return fallback;
  return dockLayoutPanelIds(layout) === null ? fallback : (layout as unknown as SerializedDockview);
}

/** `layout` wrapped in the version envelope it is stored under. */
export function dockLayoutDocument(layout: SerializedDockview): DockLayoutDocument {
  return { version: DOCK_LAYOUT_VERSION, layout };
}

/**
 * Which named layout `layout` currently *is*, or `null` for an arrangement
 * the user has since dragged into something else — `layoutPresets.ts`'s
 * `"custom"`, decided by comparing the document rather than by tracking
 * every gesture.
 *
 * Panel presence and the tree's *shape* are compared, never its sizes:
 * dragging a divider is resizing a layout, not leaving it
 * (`presetMatches`' own rule, kept). Without the shape, Split and Stacked
 * would be indistinguishable; with it, Maths and Split still are, because
 * they differ only in the Notebook's width. That is why `candidates` is a
 * list the caller orders rather than {@link LAYOUT_PRESET_CYCLE}: passing
 * the active layout first reproduces `presetAfterColumnChange`'s rule that
 * a change still matching the active layout is not a departure from it.
 *
 * @param layout The live layout, from `api.toJSON()`.
 * @param candidates The named layouts to test, most-preferred first.
 */
export function matchingNamedLayout(layout: unknown, candidates: readonly LayoutPresetId[]): LayoutPresetId | null {
  const ids = dockLayoutPanelIds(layout);
  if (ids === null) return null;
  const shape = gridShape(asRecord(layout)?.grid);
  for (const candidate of candidates) {
    const named = namedDockLayout(candidate);
    const namedIds = dockLayoutPanelIds(named);
    if (namedIds === null || namedIds.join(",") !== ids.join(",")) continue;
    if (shape !== null && shape === gridShape(named.grid as unknown)) return candidate;
  }
  return null;
}

/** Where a panel being re-opened is inserted: beside `referencePanel`, on
 *  its `direction` side. `referencePanel` is `null` when the dock is empty
 *  and the panel simply becomes the whole grid. */
export interface DockPanelInsertion {
  referencePanel: DockPanelId | null;
  direction: "left" | "right";
}

/**
 * Where to put `id` when its ribbon toggle turns back on, given the panels
 * already docked.
 *
 * The rule is "back where it belongs": {@link DOCK_PANEL_IDS} is the
 * studio's reference left-to-right order, so a re-opened panel goes to the
 * left of the leftmost panel that follows it in that order, or — if it
 * follows all of them — to the right of the rightmost that precedes it.
 * Re-opening Maths into a Notebook-only dock therefore reproduces the
 * arrangement it had before it was closed, rather than landing wherever
 * Dockview's default would put it.
 *
 * A panel already in `present` still gets an answer (the caller checks
 * presence first); it is excluded from its own reference so the result is
 * never "beside itself".
 *
 * @param id The panel being opened.
 * @param present The panels currently docked, in any order.
 */
export function dockPanelInsertion(id: DockPanelId, present: readonly DockPanelId[]): DockPanelInsertion {
  const others = DOCK_PANEL_IDS.filter((candidate) => candidate !== id && present.includes(candidate));
  const index = DOCK_PANEL_IDS.indexOf(id);

  const after = others.find((candidate) => DOCK_PANEL_IDS.indexOf(candidate) > index);
  if (after !== undefined) return { referencePanel: after, direction: "left" };

  const before = others[others.length - 1];
  if (before !== undefined) return { referencePanel: before, direction: "right" };

  return { referencePanel: null, direction: "right" };
}

/** What has to change for the docked panels to be `desired`: the ids to
 *  add and the ids to remove, both in {@link DOCK_PANEL_IDS} order. Empty
 *  arrays when the two already agree, which is the common case — a
 *  reconcile runs on every visibility notification and most of them are
 *  about a panel that is already where it should be. */
export function dockPanelDiff(
  present: readonly DockPanelId[],
  desired: readonly DockPanelId[]
): { add: DockPanelId[]; remove: DockPanelId[] } {
  return {
    add: DOCK_PANEL_IDS.filter((id) => desired.includes(id) && !present.includes(id)),
    remove: DOCK_PANEL_IDS.filter((id) => present.includes(id) && !desired.includes(id)),
  };
}

/** A node tree's shape as a string, ignoring every size: `"[graph|properties|cells]"`
 *  for Split, `"[properties|[graph|cells]]"` for Stacked. Panel ids are
 *  included because two trees of the same shape holding different panels
 *  are different arrangements. `null` for a tree {@link collectPanelIds}
 *  would reject. */
function gridShape(grid: unknown): string | null {
  const record = asRecord(grid);
  if (record === undefined) return null;
  return nodeShape(record.root, 0);
}

/** {@link gridShape}'s recursion. Bounded for {@link collectPanelIds}'s
 *  reason. */
function nodeShape(node: unknown, depth: number): string | null {
  if (depth > MAX_GRID_DEPTH) return null;
  const record = asRecord(node);
  if (record === undefined) return null;

  if (record.type === "branch") {
    if (!Array.isArray(record.data) || record.data.length === 0) return null;
    const parts: string[] = [];
    for (const child of record.data) {
      const part = nodeShape(child, depth + 1);
      if (part === null) return null;
      parts.push(part);
    }
    return `[${parts.join("|")}]`;
  }

  if (record.type !== "leaf") return null;
  const data = asRecord(record.data);
  if (data === undefined || !Array.isArray(data.views)) return null;
  return data.views.filter(isDockPanelId).join("+");
}

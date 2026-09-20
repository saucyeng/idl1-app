/**
 * Notebook-local column visibility for the CAD-style top toolbar (ruling
 * R161): the maths-graph, properties/code and notebook-cells panes each
 * show or hide independently — generalising the old binary Graph/Cells
 * toggle (`graphViewOpen`), which could only show one of the two at a
 * time. Pure decision logic only; `Notebook/index.tsx` owns the toggle
 * buttons and the panel list this drives.
 *
 * **Persistence (R161: "beside the widths [`columnPrefs.ts`] already
 * stores... renderer-only, never in a workbook, never synced").** This
 * module keeps its own `localStorage` key rather than editing
 * `shell/columnPrefs.ts` directly -- that file's `ColumnId`/`ColumnPrefs`
 * describe the *outer app shell's* four docked columns (`library`/`maths`/
 * `properties`/`output`, where `output` is the whole Notebook page and is
 * never collapsed), a different concept from these three *inside* the
 * Notebook page's own content area. Same storage convention
 * (`idl1.<area>.<thing>.v<n>`, `columnPrefs.ts`'s own doc comment), a
 * sibling key rather than an overloaded one.
 */

/** The three toggleable panes inside the Notebook page's own content area
 *  (R161 item 2), in toolbar left-to-right order. */
export type NotebookColumnId = "graph" | "properties" | "cells";

/** {@link NotebookColumnId}'s members, in the toolbar's reference order. */
export const NOTEBOOK_COLUMN_IDS: readonly NotebookColumnId[] = ["graph", "properties", "cells"];

/** Which of the three panes are currently on. */
export type NotebookColumnVisibility = Readonly<Record<NotebookColumnId, boolean>>;

/** Byte-identical to pre-R161 behaviour on first render: `graphViewOpen`
 *  defaulted to `false` (cell list showing, graph hidden); properties was
 *  always shown whenever a cell was selected. Only `cells` and `properties`
 *  start on. */
export const DEFAULT_NOTEBOOK_COLUMN_VISIBILITY: NotebookColumnVisibility = {
  graph: false,
  properties: true,
  cells: true,
};

const STORAGE_KEY = "idl1.notebook.columns.v1";

/** Narrows `raw` to a plain JSON object, or `undefined` for anything else. */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

/** Clamps a restored document to a usable shape: each id independently
 *  `boolean`, anything else (missing, wrong type, an unrecognised extra
 *  key) falls back to that id's own default -- so a hand-edited or stale
 *  `localStorage` value can never produce a `NotebookColumnVisibility`
 *  this module's own type doesn't allow. Total over `raw`. */
export function sanitizeNotebookColumnVisibility(raw: unknown): NotebookColumnVisibility {
  const record = asRecord(raw);
  const result = {} as Record<NotebookColumnId, boolean>;
  for (const id of NOTEBOOK_COLUMN_IDS) {
    const value = record?.[id];
    result[id] = typeof value === "boolean" ? value : DEFAULT_NOTEBOOK_COLUMN_VISIBILITY[id];
  }
  return result;
}

/**
 * Flips `id`'s visibility.
 *
 * **The never-all-off guard is gone (ruling R244).** Until the dock, this
 * function and {@link notebookColumnVisibilityFrom} refused a change that
 * would hide every pane, because an empty preview was a worse regression
 * than the letterboxing R161 existed to fix. It refused by returning
 * `prev` **by reference**, which under R239's dock became a silent
 * disagreement: Dockview had already closed the panel, nothing changed
 * here, so `shell/studioColumns.ts` never notified and the dock was left
 * empty with the ribbon still saying that panel was on (reviewer,
 * 2026-09-20).
 *
 * R244 removes the reason for the guard rather than papering over it:
 * every panel may close, and an empty dock shows the Welcome panel
 * (`shell/WelcomePanel.tsx`) through Dockview's watermark slot — never a
 * blank. So "all off" is now a real, recoverable state with somewhere to
 * click, and this function is a plain flip whose answer the dock can
 * always be trusted to match.
 */
export function toggleNotebookColumn(prev: NotebookColumnVisibility, id: NotebookColumnId): NotebookColumnVisibility {
  return { ...prev, [id]: !prev[id] };
}

/**
 * The visibility `ids` describes — every id present reads as on, every
 * absent one as off. The inverse of {@link visibleNotebookColumnIds}'s
 * `availability`-free half, for a caller handed the whole next set at once
 * (`components/ui/toggle-group.tsx`'s `type="multiple"` `onValueChange`)
 * rather than the one id that changed.
 *
 * An empty `ids` turns every pane off, which ruling R244 makes a real
 * state rather than one to refuse — see {@link toggleNotebookColumn} on
 * why the guard that used to sit here had to go. Unknown strings are
 * ignored (the toggle group's values are this module's own ids, but
 * nothing in its type says so).
 *
 * The previous visibility is no longer a parameter: `ids` is the whole
 * next selection, so with the guard gone there is nothing left to carry
 * over from it. A caller inside a state updater simply stops reading its
 * `prev`.
 *
 * @param ids The ids that should now be on, in any order.
 */
export function notebookColumnVisibilityFrom(ids: readonly string[]): NotebookColumnVisibility {
  const on = new Set(ids);
  // Written out per id rather than built from `NOTEBOOK_COLUMN_IDS` with a
  // cast: this way the compiler checks the record is complete, so adding a
  // fourth column to `NotebookColumnId` fails here instead of silently
  // producing a record missing that key.
  const next: Record<NotebookColumnId, boolean> = {
    graph: on.has("graph"),
    properties: on.has("properties"),
    cells: on.has("cells"),
  };
  return next;
}

/** `NOTEBOOK_COLUMN_IDS` filtered to those both toggled on in `visibility`
 *  and currently available (`availability[id]`, e.g. `graph` unavailable
 *  on a narrow/`"sheet"` layout, decision 29 -- "no columns to toggle" --
 *  or `properties` unavailable with no cell selected), in the fixed
 *  toolbar order. What `Notebook/index.tsx` maps over to build its panel
 *  list -- a pane both off and unavailable, or on but unavailable, never
 *  renders either way. */
export function visibleNotebookColumnIds(visibility: NotebookColumnVisibility, availability: NotebookColumnVisibility): NotebookColumnId[] {
  return NOTEBOOK_COLUMN_IDS.filter((id) => visibility[id] && availability[id]);
}

/** Reads this machine's Notebook column visibility. Never throws: a
 *  WebView that refuses storage, an absent value, or unparsable JSON all
 *  yield {@link DEFAULT_NOTEBOOK_COLUMN_VISIBILITY}. */
export function readNotebookColumnVisibility(): NotebookColumnVisibility {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_NOTEBOOK_COLUMN_VISIBILITY;
    return sanitizeNotebookColumnVisibility(JSON.parse(raw));
  } catch {
    return DEFAULT_NOTEBOOK_COLUMN_VISIBILITY;
  }
}

/** Persists `visibility`. Never throws -- a refused write is silently
 *  dropped, same as `columnPrefs.ts`'s own `writeColumnPrefs` (a
 *  remembered layout is a convenience, not a correctness requirement). */
export function writeNotebookColumnVisibility(visibility: NotebookColumnVisibility): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
  } catch {
    // Storage refused (private mode, cleared site data, a policy).
  }
}

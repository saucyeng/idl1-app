import type { RouteId } from "../routes/types";
import { ROUTES } from "../routes/types";
import { ASPECT_CLASSES, type AspectClass } from "./aspectClass";
import { asActivePreset, DEFAULT_PRESET_BY_CLASS, OUTPUT_COLUMN_MIN_WIDTH_PX, type ActivePreset } from "./layoutPresets";
import { DEFAULT_SIDEBAR_PREFS, sanitizeSidebarPrefs, type SidebarPrefs } from "./sidebarPrefs";

/** The wide-layout column frame's four docked columns, left to right
 *  (UI-DIRECTION "App shell and navigation"): the Data/library filter, the
 *  reserved React Flow maths graph, chart/cell properties, and the
 *  Notebook output. */
export type ColumnId = "library" | "maths" | "properties" | "output";

/** `ColumnId`'s members, in the reference left-to-right order. */
export const COLUMN_IDS: readonly ColumnId[] = ["library", "maths", "properties", "output"];

/** The output column is never collapsible (UI-DIRECTION "App shell and
 *  navigation": "the Notebook output column is never collapsed"). */
const COLLAPSIBLE_COLUMN_IDS: readonly ColumnId[] = ["library", "maths", "properties"];

/** A column's allowed width range, in CSS px. No source states exact
 *  bounds; picked narrowly around the direction's reference sizes (280 for
 *  `library`, 320 for `properties`) so a hand-edited document cannot shrink
 *  a column to unusable or grow it to swallow the frame — the same kind of
 *  undocumented-but-necessary constant as `statusPoll.ts`'s
 *  `LINK_LOST_AFTER_FAILURES`. */
const COLUMN_WIDTH_BOUNDS_PX: Record<ColumnId, { min: number; max: number; defaultPx: number }> = {
  library: { min: 200, max: 480, defaultPx: 280 },
  maths: { min: 240, max: 900, defaultPx: 480 },
  properties: { min: 240, max: 480, defaultPx: 320 },
  output: { min: OUTPUT_COLUMN_MIN_WIDTH_PX, max: 1200, defaultPx: 480 },
};

/** Per-machine column widths and collapsed flags, plus the remembered
 *  launch route (`launchLayout.ts`'s `initialRoute` "remembered" argument —
 *  UI-DIRECTION Open questions: "one `localStorage` key for all per-machine
 *  shell state, not two", ruled R93). `localStorage` under
 *  `idl1.shell.columns.v1` (the `idl1.<area>.<thing>.v<n>` shape
 *  `Settings/prefs.ts` and `Notebook/model/notebookPrefs.ts` already use).
 *  Never throws: a WebView that refuses storage yields the defaults, and a
 *  refused write is dropped — a remembered width is a convenience. */
export interface ColumnPrefs {
  widths: Record<ColumnId, number>;
  collapsed: ColumnId[];
  lastRoute: RouteId | null;
  /** The layout preset remembered for each viewport shape (ruling R213
   *  item 2: "stored per class in the existing per-machine prefs store,
   *  beside `columnPrefs`"). A field here rather than a second
   *  `localStorage` key, because R93 already ruled this document is "one
   *  key for all per-machine shell state, not two" — the same reason
   *  `lastRoute` lives here. `"custom"` is a real stored value: a class
   *  whose columns were last thrown by hand recalls exactly that. */
  presets: Record<AspectClass, ActivePreset>;
  /** The sidebar's width and collapsed state per viewport shape (ruling
   *  R220 item 2: "the sidebar's width and collapsed state are per aspect
   *  class like presets"). Another field in this same document rather than
   *  a fourth `localStorage` key, for the reason `presets` and `lastRoute`
   *  already are — R93's "one key for all per-machine shell state". The
   *  shape and its bounds live in `sidebarPrefs.ts`. */
  sidebar: SidebarPrefs;
}

const STORAGE_KEY = "idl1.shell.columns.v1";

/** `ColumnPrefs`'s value before anything has been stored, or when storage is
 *  unavailable/unparsable. */
export const DEFAULT_COLUMN_PREFS: ColumnPrefs = {
  widths: Object.fromEntries(COLUMN_IDS.map((id) => [id, COLUMN_WIDTH_BOUNDS_PX[id].defaultPx])) as Record<ColumnId, number>,
  collapsed: [],
  lastRoute: null,
  presets: { ...DEFAULT_PRESET_BY_CLASS },
  sidebar: DEFAULT_SIDEBAR_PREFS,
};

/** Narrows `raw` to a plain JSON object, or `undefined` for anything else
 *  (including `null` and arrays). */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

/** Clamps `value` into `[min, max]`; `undefined`/non-finite falls back to
 *  `defaultPx`. */
function clampWidth(value: unknown, bounds: { min: number; max: number; defaultPx: number }): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return bounds.defaultPx;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

function sanitizeWidths(raw: unknown): Record<ColumnId, number> {
  const record = asRecord(raw) ?? {};
  const widths = {} as Record<ColumnId, number>;
  for (const id of COLUMN_IDS) {
    widths[id] = clampWidth(record[id], COLUMN_WIDTH_BOUNDS_PX[id]);
  }
  return widths;
}

function sanitizeCollapsed(raw: unknown): ColumnId[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(COLLAPSIBLE_COLUMN_IDS);
  const seen = new Set<ColumnId>();
  for (const entry of raw) {
    if (typeof entry === "string" && known.has(entry)) seen.add(entry as ColumnId);
  }
  return COLLAPSIBLE_COLUMN_IDS.filter((id) => seen.has(id));
}

/** Every aspect class gets a preset, independently: an absent, stale or
 *  hand-edited entry falls back to that class's own default
 *  (`layoutPresets.ts`'s `DEFAULT_PRESET_BY_CLASS`), never to another
 *  class's. */
function sanitizePresets(raw: unknown): Record<AspectClass, ActivePreset> {
  const record = asRecord(raw);
  const presets = {} as Record<AspectClass, ActivePreset>;
  for (const cls of ASPECT_CLASSES) {
    presets[cls] = asActivePreset(record?.[cls], DEFAULT_PRESET_BY_CLASS[cls]);
  }
  return presets;
}

function sanitizeLastRoute(raw: unknown): RouteId | null {
  if (typeof raw !== "string") return null;
  return ROUTES.some((r) => r.id === raw) ? (raw as RouteId) : null;
}

/** Clamps a restored document to a usable shape: every width to its
 *  column's `[min, max]`, drops unknown/uncollapsible column ids from
 *  `collapsed`, drops an unrecognised `lastRoute`, and falls every
 *  per-class preset back to that class's default — so a hand-edited or
 *  stale document can never produce an unusable layout. Total over `raw`:
 *  anything that is not a plain object yields {@link DEFAULT_COLUMN_PREFS}. */
export function sanitizeColumnPrefs(raw: unknown): ColumnPrefs {
  const record = asRecord(raw);
  if (record === undefined) return DEFAULT_COLUMN_PREFS;
  return {
    widths: sanitizeWidths(record.widths),
    collapsed: sanitizeCollapsed(record.collapsed),
    lastRoute: sanitizeLastRoute(record.lastRoute),
    presets: sanitizePresets(record.presets),
    sidebar: sanitizeSidebarPrefs(record.sidebar),
  };
}

/** Reads this machine's shell column prefs. Never throws: a WebView that
 *  refuses storage, absent values and unparsable JSON all yield
 *  {@link DEFAULT_COLUMN_PREFS}. */
export function readColumnPrefs(): ColumnPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_COLUMN_PREFS;
    return sanitizeColumnPrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_COLUMN_PREFS;
  }
}

/** Persists `prefs`. Never throws — a refused write is silently dropped,
 *  because a remembered layout is a convenience, not a correctness
 *  requirement. */
export function writeColumnPrefs(prefs: ColumnPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage refused (private mode, cleared site data, a policy).
  }
}

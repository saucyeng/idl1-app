import { ASPECT_CLASSES, type AspectClass } from "./aspectClass";

/**
 * The sidebar's remembered width and collapsed state, per viewport shape
 * (ruling R220 item 2: "the sidebar's width and collapsed state are per
 * aspect class like presets").
 *
 * Pure: sanitisation and defaults only. The document itself lives inside
 * `columnPrefs.ts`'s single `idl1.shell.columns.v1` key, because R93 ruled
 * that one key holds all per-machine shell state, not two — this is a
 * separate *module* for a separate concept, not a separate store, the same
 * split `toolbarSlot.ts` made against `editorSlot.ts`.
 */

/** One viewport shape's sidebar state. */
export interface SidebarState {
  /** Width in CSS px, clamped to [{@link SIDEBAR_MIN_WIDTH_PX},
   *  {@link SIDEBAR_MAX_WIDTH_PX}]. Kept while collapsed, so reopening the
   *  sidebar restores the width it had rather than the default. */
  widthPx: number;
  collapsed: boolean;
}

/** Narrowest the sidebar may be dragged, in CSS px (R220 item 1: "resizable,
 *  200-480"). Below this the session names and workbook titles it exists to
 *  show are all ellipsis. */
export const SIDEBAR_MIN_WIDTH_PX = 200;

/** Widest the sidebar may be dragged, in CSS px (R220 item 1). */
export const SIDEBAR_MAX_WIDTH_PX = 480;

/** The width a machine that has never dragged the sidebar gets, in CSS px.
 *  The same 280 `columnPrefs.ts` gives the library column, whose content
 *  this sidebar now holds. */
export const SIDEBAR_DEFAULT_WIDTH_PX = 280;

/** Every shape's sidebar state before anything has been stored: open, at
 *  the default width. An ultrawide and a 16:9 panel start the same; they
 *  diverge the first time one of them is dragged. */
export const DEFAULT_SIDEBAR_STATE: SidebarState = {
  widthPx: SIDEBAR_DEFAULT_WIDTH_PX,
  collapsed: false,
};

/** The sidebar state for each viewport shape. */
export type SidebarPrefs = Readonly<Record<AspectClass, SidebarState>>;

/** {@link SidebarPrefs} before anything has been stored. */
export const DEFAULT_SIDEBAR_PREFS: SidebarPrefs = Object.fromEntries(
  ASPECT_CLASSES.map((cls) => [cls, DEFAULT_SIDEBAR_STATE])
) as SidebarPrefs;

/** Clamps `widthPx` into the sidebar's allowed range; a non-finite or
 *  missing value falls back to {@link SIDEBAR_DEFAULT_WIDTH_PX}. */
export function clampSidebarWidth(widthPx: unknown): number {
  if (typeof widthPx !== "number" || !Number.isFinite(widthPx)) return SIDEBAR_DEFAULT_WIDTH_PX;
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(widthPx)));
}

/**
 * Clamps a restored document to a usable shape: every shape gets a state,
 * every width is in range, and anything that is not a plain object yields
 * {@link DEFAULT_SIDEBAR_PREFS}. Total over `raw` — a hand-edited or stale
 * document can never produce a sidebar too narrow to read or wider than the
 * window.
 */
export function sanitizeSidebarPrefs(raw: unknown): SidebarPrefs {
  const record = raw === null || typeof raw !== "object" || Array.isArray(raw) ? undefined : (raw as Record<string, unknown>);
  const prefs = {} as Record<AspectClass, SidebarState>;
  for (const cls of ASPECT_CLASSES) {
    const entry = record?.[cls];
    const stored = entry === null || typeof entry !== "object" || Array.isArray(entry) ? undefined : (entry as Record<string, unknown>);
    prefs[cls] = {
      widthPx: clampSidebarWidth(stored?.widthPx),
      collapsed: stored?.collapsed === true,
    };
  }
  return prefs;
}

/** `prefs` with `cls`'s entry replaced — the whole document a width drag or
 *  a `Ctrl+B` writes back, leaving every other shape's entry alone. */
export function withSidebarState(prefs: SidebarPrefs, cls: AspectClass, next: SidebarState): SidebarPrefs {
  return { ...prefs, [cls]: { widthPx: clampSidebarWidth(next.widthPx), collapsed: next.collapsed } };
}

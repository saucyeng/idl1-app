/**
 * "Show occasional commands as buttons" (ruling R225 item 4).
 *
 * The ribbon's default is the core tier and nothing else — the bare minimum
 * that will not overwhelm someone opening the app for the first time. Every
 * occasional command is still one click away, behind the chevron of the
 * core button it belongs to. This preference is for the opposite reader:
 * someone who knows the app and wants Export, Rescan and the rest on screen
 * as small buttons rather than behind a menu.
 *
 * Per machine, in `localStorage`, in the shape and under the key convention
 * `Notebook/model/denseMode.ts` and `shell/columnPrefs.ts` already use
 * (`idl1.<area>.<thing>.v<n>`). It is a renderer-only view preference: it
 * changes which controls are visible and nothing else, so it is never in a
 * workbook and never synced.
 */

/** `idl1.<area>.<thing>.v<n>`, the convention `idl1.notebook.dense.v1` and
 *  `idl1.shell.columns.v1` already set. */
const STORAGE_KEY = "idl1.ribbon.showOccasional.v1";

/** Off until this machine turns it on — R225 item 4: "default off". */
export const DEFAULT_SHOW_OCCASIONAL = false;

/**
 * This machine's remembered setting. Any stored value that is not the
 * literal `"true"` or `"false"` — a key written by a future build, a
 * half-written value, storage that throws in a private window — reads as
 * {@link DEFAULT_SHOW_OCCASIONAL} rather than throwing or guessing.
 */
export function readShowOccasional(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_SHOW_OCCASIONAL;
  } catch {
    return DEFAULT_SHOW_OCCASIONAL;
  }
}

const listeners = new Set<() => void>();

/** Remembers `show` for this machine and tells every mounted reader. A
 *  storage failure is silent: a view preference that cannot be saved is
 *  still one that works for this session, and the ribbon must still update
 *  the instant the Settings switch is flipped. */
export function writeShowOccasional(show: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, show ? "true" : "false");
  } catch {
    // Storage refused (private mode, cleared site data, a policy).
  }
  for (const listener of listeners) listener();
}

/** Subscribes `listener` to {@link writeShowOccasional}. Returns an
 *  unsubscribe. The same publish/subscribe shape as
 *  `shell/commandRegistry.ts`, for the same reason: Settings and the ribbon
 *  are mounted at once (R93's mount-and-hide), so the switch and the row it
 *  changes are two live components, not a write followed by a reload. */
export function subscribeShowOccasional(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

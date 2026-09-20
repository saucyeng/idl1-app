/**
 * The Welcome panel's "Recent workbooks" list (ruling R244).
 *
 * Nothing in the app kept one: the Notebook sidebar and the Open dialog
 * both render the *catalog's* workbook list, which is every workbook in
 * the library in catalog order, not the handful this machine last opened.
 * R244 asks for the handful, so this is the small pure store its own
 * wording allows ("use an existing recent list if one exists, else a small
 * pure store").
 *
 * **Per machine, and only per machine.** A most-recently-opened list is
 * renderer state about one person at one desk — it is not a fact about the
 * library, so it is never written into a workbook and never synced
 * (CLAUDE.md §3: "no renderer-only parameters" in the document; the
 * catalog is an index, and this is not even that). `localStorage` under
 * `idl1.shell.recentWorkbooks.v1`, the `idl1.<area>.<thing>.v<n>` shape
 * `columnPrefs.ts` and `notebookColumns.ts` already use, in a key of its
 * own rather than inside `columnPrefs`' document: R93's "one key for all
 * per-machine *shell layout* state" is about the layout, and a list that
 * grows on every open would rewrite the layout document every time.
 *
 * Pure apart from the two storage functions at the bottom, which never
 * throw — a WebView that refuses storage yields an empty list and a
 * dropped write, because a remembered list is a convenience.
 */

/** One entry: which workbook, what to call it, and when it was last
 *  opened. */
export interface RecentWorkbook {
  /** The catalog's workbook id — what `workbook.open` is given, and the
   *  identity two entries are deduplicated by. */
  id: string;
  /** The workbook's display name at the time it was opened. Stored rather
   *  than looked up so the list can render before the catalog has loaded;
   *  a rename is picked up the next time it is opened. */
  name: string;
  /** The workbook's file name inside the library — what the catalog
   *  reports (`WorkbookChoice.file_name`). Not an absolute path: the
   *  renderer never learns one, and the library root is printed once at
   *  the foot of the Welcome panel instead. Shown under the name so two
   *  workbooks called the same thing can be told apart, and carried into
   *  the greyed-out "missing" state R244 asks for. */
  fileName: string;
  /** When it was last opened, as epoch milliseconds (`Date.now()`). Used
   *  only to order the list; never displayed as an absolute time. */
  openedAtMs: number;
}

/** How many entries are kept. Small on purpose: the Welcome panel shows
 *  the list without scrolling, and a longer memory is what the Open dialog
 *  and the sidebar's full catalog list are for. */
export const RECENT_WORKBOOK_LIMIT = 8;

const STORAGE_KEY = "idl1.shell.recentWorkbooks.v1";

/** Narrows `raw` to a plain JSON object, or `undefined` for anything else
 *  (including `null` and arrays) — `columnPrefs.ts`'s own guard. */
function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

/** One entry as this build can use it, or `undefined` for anything that is
 *  not a complete entry. Total over `raw`. */
function asEntry(raw: unknown): RecentWorkbook | undefined {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const { id, name, fileName, openedAtMs } = record;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof name !== "string" || typeof fileName !== "string") return undefined;
  if (typeof openedAtMs !== "number" || !Number.isFinite(openedAtMs)) return undefined;
  return { id, name, fileName, openedAtMs };
}

/**
 * A restored document as a usable list: every complete entry, newest
 * first, deduplicated by id and cut to {@link RECENT_WORKBOOK_LIMIT}.
 *
 * Total over `raw` — anything that is not an array of entries yields an
 * empty list, and one malformed entry costs only itself. A hand-edited or
 * stale document can therefore never produce a list this module's own type
 * does not allow.
 */
export function sanitizeRecentWorkbooks(raw: unknown): RecentWorkbook[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: RecentWorkbook[] = [];
  for (const candidate of raw) {
    const entry = asEntry(candidate);
    if (entry === undefined || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  // Sorted here rather than trusted from storage: the write below already
  // puts the newest first, but a document edited by hand (or written by a
  // build that ordered them differently) must still render in a sensible
  // order.
  entries.sort((a, b) => b.openedAtMs - a.openedAtMs);
  return entries.slice(0, RECENT_WORKBOOK_LIMIT);
}

/**
 * `entries` with `opened` moved to the front.
 *
 * An id already in the list is *moved*, not duplicated, and its stored
 * name and file name are replaced by the ones just used — a workbook
 * renamed since it was last opened should show what it is called now.
 *
 * @param entries The list before this open, newest first.
 * @param opened The workbook just opened, with `openedAtMs` already set by
 *   the caller (this module never reads the clock, so it stays pure and
 *   its tests need no fake timers).
 */
export function withRecentWorkbook(entries: readonly RecentWorkbook[], opened: RecentWorkbook): RecentWorkbook[] {
  return [opened, ...entries.filter((entry) => entry.id !== opened.id)].slice(0, RECENT_WORKBOOK_LIMIT);
}

/** Reads this machine's recent-workbook list, newest first. Never throws:
 *  a WebView that refuses storage, an absent value and unparsable JSON all
 *  yield an empty list. */
export function readRecentWorkbooks(): RecentWorkbook[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    return sanitizeRecentWorkbooks(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Persists `entries`. Never throws — a refused write is silently dropped,
 *  same as `columnPrefs.ts`'s own `writeColumnPrefs`. */
export function writeRecentWorkbooks(entries: readonly RecentWorkbook[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, RECENT_WORKBOOK_LIMIT)));
  } catch {
    // Storage refused (private mode, cleared site data, a policy).
  }
}

/** Records that `opened` was just opened: reads, moves it to the front,
 *  writes back. The one call site is the Notebook page's workbook-select
 *  handler. */
export function noteWorkbookOpened(opened: RecentWorkbook): void {
  writeRecentWorkbooks(withRecentWorkbook(readRecentWorkbooks(), opened));
}

/**
 * This machine's Notebook-only UI preferences (L6 Task 21, R66 item 3): the
 * remembered workbook choice, persisted through `localStorage` under a
 * Notebook-local key rather than `Settings/prefs.ts`'s `UiPrefs` block —
 * `app/src/routes/pages/Settings/**` belongs to the L7c lane (wave-2
 * operating brief §2), so this lane keeps its own tiny document rather than
 * making a cross-lane edit (ruling R81 Q2).
 *
 * // TODO(idl0): consolidate this into `Settings/prefs.ts`'s `UiPrefs` once
 * one lane owns app-wide UI prefs, reading it through
 * `Settings/prefsStore.ts`'s `PrefsBackend` instead of a second
 * `localStorage` key.
 */

/** This machine's Notebook UI preferences. Never leaves the machine, never
 *  reaches the engine — the same "UI-only half" the Settings tab's `ui`
 *  block is (`Settings/prefs.ts`'s `UiPrefs`), kept under the Notebook's own
 *  key because `Settings/**` belongs to another lane. */
export interface NotebookPrefs {
  /** `workbook_id` of the last workbook opened here, or `null`. */
  last_workbook_id: string | null;
}

/** `idl1.<area>.<thing>.v<n>` — the same shape `Settings`'s
 *  `idl1.settings.prefs.v1` already established. */
const STORAGE_KEY = "idl1.notebook.ui.v1";

/** `NotebookPrefs`'s value when nothing has been stored yet, or storage is
 *  unavailable/unparsable. */
const DEFAULT_PREFS: NotebookPrefs = { last_workbook_id: null };

/** `true` when `value` has the shape of a `NotebookPrefs` document. */
function isNotebookPrefs(value: unknown): value is NotebookPrefs {
  return (
    typeof value === "object" &&
    value !== null &&
    "last_workbook_id" in value &&
    (typeof (value as Record<string, unknown>).last_workbook_id === "string" ||
      (value as Record<string, unknown>).last_workbook_id === null)
  );
}

/** Reads this machine's Notebook prefs. Never throws: a WebView that
 *  refuses storage (private mode, cleared site data, a policy), absent
 *  values and unparsable JSON all yield the defaults. */
export function readNotebookPrefs(): NotebookPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    return isNotebookPrefs(parsed) ? parsed : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Persists `prefs`. Never throws — a refused write is silently dropped,
 *  because a remembered selection is a convenience and losing it must never
 *  break opening a workbook. */
export function writeNotebookPrefs(prefs: NotebookPrefs): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage refused (private mode, cleared site data, a policy) — the
    // remembered choice is a convenience, not a correctness requirement.
  }
}

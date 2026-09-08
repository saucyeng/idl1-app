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
import { resolveXMode, type XMode } from "./xMode";

/** This machine's Notebook UI preferences. Never leaves the machine, never
 *  reaches the engine — the same "UI-only half" the Settings tab's `ui`
 *  block is (`Settings/prefs.ts`'s `UiPrefs`), kept under the Notebook's own
 *  key because `Settings/**` belongs to another lane. */
export interface NotebookPrefs {
  /** `workbook_id` of the last workbook opened here, or `null`. */
  last_workbook_id: string | null;
  /**
   * `InputMapPreset.id` of the last-selected gesture input-map preset
   * (ruling R137, `interaction/inputMap.ts`), or `null` before any choice
   * has been made — the caller falls back to a default preset id in that
   * case, never a guessed one (`findInputMapPreset` itself returns `null`
   * for an id from a build that has since dropped that preset, which reads
   * the same way). A renderer-only preference (CLAUDE.md §3): never part of
   * a workbook, never synced — this machine's own choice.
   */
  input_map_preset_id: string | null;
  /**
   * Decision 54's worksheet-level X-axis mode (`model/xMode.ts`).
   * `readNotebookPrefs` always resolves this through `resolveXMode` before
   * returning it — a document missing the field (written before it
   * existed), an unparsable value, or a value this build can't honour yet
   * (`"distance"` while R136 keeps it disabled) all read as `"time"`, never
   * `null` and never a guess, so every reader downstream sees only the two
   * real `XMode` values.
   */
  x_mode: XMode;
}

/** `idl1.<area>.<thing>.v<n>` — the same shape `Settings`'s
 *  `idl1.settings.prefs.v1` already established. */
const STORAGE_KEY = "idl1.notebook.ui.v1";

/** `NotebookPrefs`'s value when nothing has been stored yet, or storage is
 *  unavailable/unparsable. */
const DEFAULT_PREFS: NotebookPrefs = { last_workbook_id: null, input_map_preset_id: null, x_mode: "time" };

/** `true` when `value` has the shape of a `NotebookPrefs` document.
 *  `input_map_preset_id`/`x_mode` are read as absent-tolerant (a document
 *  written before either field existed) rather than rejecting the whole
 *  document — the same forward-compatible reading `last_workbook_id`
 *  already gets; `x_mode` itself is left unvalidated here (any string
 *  passes) because `readNotebookPrefs` runs it through `resolveXMode`
 *  below, which is the one place that predicate lives (R138's "one
 *  definition, shared by the gate and the consumer" applied to this
 *  reader/writer pair). */
function isNotebookPrefs(value: unknown): value is NotebookPrefs {
  if (typeof value !== "object" || value === null || !("last_workbook_id" in value)) return false;
  const record = value as Record<string, unknown>;
  const lastWorkbookIdOk = typeof record.last_workbook_id === "string" || record.last_workbook_id === null;
  const presetIdOk = !("input_map_preset_id" in record) || typeof record.input_map_preset_id === "string" || record.input_map_preset_id === null;
  const xModeOk = !("x_mode" in record) || typeof record.x_mode === "string";
  return lastWorkbookIdOk && presetIdOk && xModeOk;
}

/** Reads this machine's Notebook prefs. Never throws: a WebView that
 *  refuses storage (private mode, cleared site data, a policy), absent
 *  values and unparsable JSON all yield the defaults. */
export function readNotebookPrefs(): NotebookPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!isNotebookPrefs(parsed)) return DEFAULT_PREFS;
    // A document written before `input_map_preset_id`/`x_mode` existed has
    // no such key at all -- normalized here (`null`, and `resolveXMode`'s
    // own default) rather than left `undefined`, so every reader downstream
    // only ever sees the states this module's own doc comment promises.
    return {
      last_workbook_id: parsed.last_workbook_id,
      input_map_preset_id: parsed.input_map_preset_id ?? null,
      x_mode: resolveXMode(typeof parsed.x_mode === "string" ? parsed.x_mode : null),
    };
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

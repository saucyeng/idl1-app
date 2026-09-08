/**
 * Decision 54: X is a **worksheet-level** setting, `"time"` or `"distance"`
 * — never per chart, and never a silent choice: the control always shows
 * every mode it names, and a mode that cannot run yet says why rather than
 * being omitted or quietly falling back (plan §5 Q5). Persisted alongside
 * every other Notebook UI preference in `model/notebookPrefs.ts`'s
 * `idl1.notebook.ui.v1` document (plan Task 13).
 *
 * **Distance ships present and disabled, per ruling R136** (which supersedes
 * plan §5 Q5's own original recommendation — R134 item 5's "ship it
 * disabled" mechanism stands, only the reason changed): a naive cumulative
 * distance axis is *wrong for the thing it exists to do* — comparing two
 * laps — because line choice makes each lap's arc length differ, so lap 2's
 * "400 m" and lap 3's "400 m" are not the same point on the track. Aligning
 * laps by track position needs a per-venue reference-path projection, which
 * is core signal-processing work (CLAUDE.md §2: physics of the bike →
 * `core`) and its own lane. Shipping the naive axis would look correct and
 * mislead; shipping no axis and saying why does not.
 */

/** The worksheet's X-axis mode (decision 54). */
export type XMode = "time" | "distance";

/** One entry in the worksheet's X-mode picker. */
export interface XModeOption {
  /** The mode this option selects. */
  value: XMode;
  /** Display label. */
  label: string;
  /**
   * Present, with the reason stated, when this mode cannot be selected yet
   * (R136's "distance-on-X stays disabled"). `undefined` for a mode that is
   * fully selectable today — the only such mode is `"time"`.
   */
  disabledReason?: string;
}

/** Distance's own disabled reason (R136) — named once here so the UI
 *  control and any test asserting it stay in sync with a single string. */
export const DISTANCE_X_MODE_DISABLED_REASON =
  "Needs per-lap track-position alignment (a core feature, not yet built — see ruling R136); a naive cumulative-distance axis would silently misalign laps that took different lines through the same corner.";

/** Every mode the worksheet's X-mode control offers, in display order —
 *  decision 54's "worksheet level" setting is this whole list, not a
 *  toggle over a single hidden default. */
export const X_MODE_OPTIONS: readonly XModeOption[] = [
  { value: "time", label: "Time" },
  { value: "distance", label: "Distance", disabledReason: DISTANCE_X_MODE_DISABLED_REASON },
];

/** Whether `mode` can be selected right now — `true` only for the one entry
 *  in {@link X_MODE_OPTIONS} carrying no `disabledReason`. */
export function isXModeSelectable(mode: XMode): boolean {
  return X_MODE_OPTIONS.find((o) => o.value === mode)?.disabledReason === undefined;
}

/**
 * Resolves a persisted/stored X-mode value to one this build can actually
 * run — `"time"` for anything that isn't exactly `"time"` or `"distance"`
 * (an unparsable/future document), *and* for `"distance"` while it remains
 * unselectable (a value written by a future build that did ship it, then
 * read by this one after a downgrade). This is a defensive read-time
 * clamp against data from *outside* this build's own control, not the
 * "silent fallback" plan §5 Q5 forbids — that rule is about the control
 * itself never hiding that distance exists or why it can't be chosen
 * (`X_MODE_OPTIONS` always lists it, with its reason); a stored value this
 * build cannot honour is a different case, and it must not leave the
 * worksheet's actual axis disagreeing with what {@link X_MODE_OPTIONS}
 * tells the reader is selected.
 *
 * @param stored The persisted value (`NotebookPrefs.x_mode`, or `null`
 *   before any document has ever recorded one).
 */
export function resolveXMode(stored: string | null): XMode {
  if (stored !== "time" && stored !== "distance") return "time";
  return isXModeSelectable(stored) ? stored : "time";
}

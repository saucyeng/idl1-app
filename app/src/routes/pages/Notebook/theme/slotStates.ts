/**
 * The two non-blank states a chart slot shows instead of rendering nothing
 * (`FLUTTER-UI-SURVEY.md` §8; `UI-DIRECTION.md` "Chart style rules for
 * Plot"): an empty slot names the next action, in one dim mono sentence; an
 * error slot shows `--accent` mono text in place. Pure message builders only
 * — colour/typography is applied by the caller's own styling (`--fg-dim`/
 * `--accent` respectively), matching how {@link seriesColor} resolves colour
 * separately from this module's text.
 *
 * This is a general-purpose chart-slot vocabulary, distinct from
 * `model/jsCellNote.ts`'s existing "no session"/"unresolved channel" note
 * (already wired into `JsCellFrame`'s note slot for the whole `js` cell,
 * before a chart is even attempted). This module's `EmptyReason` covers the
 * cases a *rendered* chart slot can find itself with no data to draw even
 * once a cell is validly bound — e.g. the settled viewport has no samples.
 */

/** Why a chart slot has nothing to draw yet. */
export type EmptyReason =
  /** The cell resolved to a chart, but its settled viewport contains no
   *  recorded samples (e.g. a lap or time range with a data gap). */
  | "no-data-in-range"
  /** The cell's raster kind (spectrogram/histogram2d) has not yet returned
   *  its first fetch — distinct from an outright fetch failure, which is
   *  {@link errorSlotMessage}'s concern. */
  | "raster-pending"
  /** No lap is selected for a cell whose binding requires one (`lap_context`,
   *  C2 §5.1's `channel(name, {lap})`), so there is nothing to look up yet. */
  | "no-lap-selected";

/** One dim mono sentence per {@link EmptyReason}, naming the next action —
 *  the idl0 convention (`FLUTTER-UI-SURVEY.md` §8's own two examples: "No
 *  sessions selected — pick runs or laps in the Data tab to load data."). */
export function emptySlotMessage(reason: EmptyReason): string {
  switch (reason) {
    case "no-data-in-range":
      return "No samples in this range — zoom out or pick a different lap.";
    case "raster-pending":
      return "Loading raster — this fills in once the fetch settles.";
    case "no-lap-selected":
      return "No lap is selected — pick one in the worksheet bar.";
  }
}

/** `--accent` mono text in place of the slot's usual picture — never a blank
 *  slot (`FLUTTER-UI-SURVEY.md` §8). Falls back to a generic sentence when
 *  `error.message` is empty, so an error with no message still names itself
 *  as an error rather than rendering an empty string in the accent slot. */
export function errorSlotMessage(error: { message: string }): string {
  const trimmed = error.message.trim();
  return trimmed === "" ? "This chart failed to render." : trimmed;
}

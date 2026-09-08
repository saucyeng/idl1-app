import type { SessionSummary } from "../ipc/catalog";
import type { Selection } from "../state/AppState";
import { describeWindow, windowKey, type SelectionWindow } from "../state/selection";

/**
 * Past this many selected windows, {@link TopBar} collapses to one "n
 * windows" chip instead of n individually dismissable chips (S1 Task 13).
 *
 * **Chosen as 4.** The top bar is a fixed-height, 11-row strip shared with
 * the wordmark, the nav tabs, the playback transport slot and the palette
 * trigger (`TopBar.tsx`) — it has no room to grow. Four chips at this
 * bar's own label width comfortably fit the medium/wide layouts this bar
 * renders in (`shell/layout.ts`'s `navPlacement`; narrow widths get the
 * bottom bar instead, which carries no chips at all). A 5th window is
 * already an overlay comparison dense enough that per-window dismiss
 * buttons stop being the useful control — decision 61's "uncheck one and
 * it all disappears" model means a user comparing five-plus laps is far
 * more likely to want "clear the selection" than to hunt one chip among
 * five to close.
 */
export const CHIP_COLLAPSE_THRESHOLD = 4;

/** One top-bar selection chip — a display projection of one
 *  `AppState.selection` entry, keyed by its position so a dismiss click can
 *  find its way back to `state/selection.ts`'s array. */
export interface SelectionChip {
  /** React key: `windowKey` is not unique alone (R117 item 2: the same
   *  session/lap may be selected twice, in two colours), so this combines
   *  it with the entry's array index, the same convention `windowKey`'s own
   *  doc comment calls for. */
  key: string;
  label: string;
  /** The window's `colour` token (`--chart-1…8`) — the chip's own accent,
   *  never a hex literal. */
  colour: string;
  /** This window's position in `AppState.selection` — what a dismiss click
   *  passes to {@link removeWindowAt}. */
  index: number;
}

/** Formats `s` as a short human label for its top-bar chip: `venue_name`
 *  (or the shared "(none)" synthetic label) plus the local calendar date,
 *  omitted when `timestamp_utc_ms` is 0 (C1 §3.1: 0 means unknown). Kept as
 *  this module's own minimal formatter rather than importing
 *  `routes/pages/Data/sessionRow.ts`'s `venueLabel`/`format.ts` — those are
 *  that lane's own display layer, and the shell owes them no coupling for
 *  one short label. */
export function sessionLabel(s: SessionSummary): string {
  const venue = s.venue_name === "" ? "(none)" : s.venue_name;
  if (s.timestamp_utc_ms === 0) return venue;
  const d = new Date(s.timestamp_utc_ms);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${venue} · ${date}`;
}

/**
 * Projects `selection` into the top bar's chips, in selection order
 * (decision 61/R111: order is meaningful — it is the same order every
 * other consumer reads `AppState.selection` in). `sessionNameFor` resolves
 * each window's `sessionId` to a display name — **the caller's
 * responsibility**: a raw 32-char session id must never reach a label
 * (`state/selection.ts`'s `describeWindow` takes the same contract), so
 * this module has no path to leak one even if `sessionNameFor` is wired
 * wrong upstream — the worst it can do is pass a bad string through.
 */
export function selectionChips(selection: Selection, sessionNameFor: (sessionId: string) => string): SelectionChip[] {
  return selection.map((w, index) => ({
    key: `${windowKey(w)}::${index}`,
    label: describeWindow(w, sessionNameFor(w.sessionId)),
    colour: w.colour,
    index,
  }));
}

/** Whether {@link TopBar} should render the collapsed "n windows" chip
 *  instead of one chip per window, per {@link CHIP_COLLAPSE_THRESHOLD}. */
export function shouldCollapseChips(count: number): boolean {
  return count > CHIP_COLLAPSE_THRESHOLD;
}

/** The collapsed chip's label. */
export function collapsedChipLabel(count: number): string {
  return `${count} windows`;
}

/** Drops the window at `index` — a chip's dismiss button's whole job. Plain
 *  array removal (unlike `nextWindows`'s `"toggle"`, this always removes
 *  exactly the clicked chip's own window, never every window sharing its
 *  `windowKey` — R117 item 2's "the same lap twice, in two colours" case
 *  must let a user dismiss just one of the two). */
export function removeWindowAt(windows: readonly SelectionWindow[], index: number): SelectionWindow[] {
  return windows.filter((_, i) => i !== index);
}

/**
 * What a chart cell's chrome shows, and when (ruling R216 item 2). Isaac,
 * 2026-09-11: "the (JS 01 · Settled · Show code) shell should merge into
 * the plot so the plot is as big as possible".
 *
 * The strip stops existing as a row. Everything it carried either becomes
 * an overlay inside the plot's own margins (the status glyph, a title, a
 * legend) or moves off the surface entirely (Show code, into the plot's
 * right-click menu and a keyboard shortcut). This module decides all of
 * that; `components/CellFrame.tsx` draws it.
 *
 * Pure and dependency-free apart from the `CellStatus` type it switches on
 * (`toolbarLayout.ts`'s pattern): no `react`, no DOM, no clock — the caller
 * passes elapsed milliseconds in.
 */
import type { CellStatus } from "./cellStatus";

/** Which chrome a cell kind gets (ruling R216 item 2). */
export type CellChromeMode =
  /** Overlaid inside the output: chart cells, whose output fills the frame. */
  | "overlay"
  /** The R210 status band above the output: every other kind. */
  | "band";

/**
 * `js` cells render a plot that wants every pixel; everything else
 * (`math`, `table`) renders a line or two of text that the R210 band sits
 * above without costing anything. R216 item 2: "the R210 gutter band goes
 * away for chart cells (it stays for non-chart cells)".
 *
 * Keyed on the cell *kind* rather than on whether a particular `js` cell
 * resolved to a bound `ChartCell` or to the plain-mount `JsCellFrame`: a
 * cell that is a chart when a session is selected and a note when it is not
 * would otherwise grow and lose a header row as the selection changes,
 * moving everything below it on the page.
 *
 * @param kind A `ScannedCell.kind` — `"js"`, `"math"` or `"table"`.
 */
export function cellChromeMode(kind: string): CellChromeMode {
  return kind === "js" ? "overlay" : "band";
}

/** The status overlay's four states. `"none"` draws nothing at all — the
 *  resting state of a settled plot, which is the whole point. */
export type PlotStatusGlyph = "none" | "spinner" | "tick" | "cross";

/** How long a settled plot keeps its green ✓ before it fades out, in
 *  milliseconds (ruling R216 item 2: "fading out 2 s after a settle"). */
export const SETTLE_FADE_MS = 2000;

/**
 * The glyph to overlay on a plot's top-left corner.
 *
 * An error is shown **persistently** — it is the one state a reader must
 * not miss, and it is the one with something to say (the tooltip on hover,
 * R216 item 2). A settle is shown briefly and then gets out of the way. The
 * two waiting states spin for as long as they last.
 *
 * @param status The cell's evaluation state (`model/cellStatus.ts`).
 * @param msSinceSettle Milliseconds since this cell last settled, or `null`
 *   when it has not settled since it was mounted — treated as "just now",
 *   so a cell that settles before its first frame still flashes its ✓.
 */
export function plotStatusGlyph(status: CellStatus, msSinceSettle: number | null): PlotStatusGlyph {
  if (status === "error") return "cross";
  if (status === "queued" || status === "evaluating") return "spinner";
  if (msSinceSettle !== null && msSinceSettle >= SETTLE_FADE_MS) return "none";
  return "tick";
}

/**
 * One line of a plot's legend: a series' name and the colour it is drawn
 * in (ruling R216 item 2).
 */
export interface PlotLegendEntry {
  /** Stable React key — the series name, which is unique within a plot. */
  key: string;
  /** What the reader sees: the channel or definition label, with its unit
   *  in parentheses when there is one. */
  label: string;
  /** The CSS custom property holding this series' colour, e.g.
   *  `"--chart-3"` — a token name, never a resolved colour, so the legend
   *  re-themes with everything else. */
  colour: string;
}

/** How many `--chart-N` tokens `tokens.css` defines. Series past the eighth
 *  wrap round rather than falling off the palette. */
export const CHART_COLOUR_COUNT = 8;

/** One series as its caller knows it, before this module names it. */
export interface PlotSeries {
  /** The channel id or definition name. */
  name: string;
  /** The display label, when the binding resolved one; `name` is used
   *  otherwise (R117 item 6: a raw id may reach a label, a raw *32-char*
   *  id may not — a channel id is a readable name, not a hash). */
  label?: string | null;
  /** `CellDefResult.unit`, when the definition carries one. */
  unit?: string | null;
}

/**
 * The legend for a plot of `series` (ruling R216 item 2).
 *
 * **Empty for a single-series plot**: one line in one colour needs no key,
 * and the axis label already names it. Two or more and the reader has to be
 * told which trace is which, so every series is listed — including the
 * first, because a legend that omits one entry is worse than none.
 *
 * Colours are assigned by position in `--chart-N` order, matching the
 * selection swatches and the report's own palette (R174's print rule is the
 * same token set, so a legend that is right on screen is right on paper).
 *
 * @param series The plot's series, in the order their marks are drawn.
 */
export function plotLegendEntries(series: readonly PlotSeries[]): PlotLegendEntry[] {
  if (series.length < 2) return [];
  return series.map((one, index) => {
    const name = one.label !== undefined && one.label !== null && one.label !== "" ? one.label : one.name;
    const unit = one.unit !== undefined && one.unit !== null && one.unit !== "" ? ` (${one.unit})` : "";
    return { key: one.name, label: `${name}${unit}`, colour: `--chart-${(index % CHART_COLOUR_COUNT) + 1}` };
  });
}

/** The keyboard-event fields {@link isShowCodeShortcut} reads — a plain
 *  object so the test needs no `KeyboardEvent` constructor. */
export interface ShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Whether `event` is the show/hide-code shortcut (ruling R216 item 2:
 * "Show code moves to the right-click context menu ... and to a keyboard
 * shortcut").
 *
 * `Alt`+`C`, chosen for what it does *not* collide with: the shell already
 * owns `Ctrl/⌘-K` (palette) and `Ctrl/⌘-Shift-L` (layout presets), the
 * editor owns the `Ctrl/⌘` letter space generally, and `Alt` alone reaches
 * no CodeMirror binding. Case-insensitive, because `Alt` plus a letter
 * reports differently across keyboard layouts.
 */
export function isShowCodeShortcut(event: ShortcutEvent): boolean {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key.toLowerCase() === "c";
}

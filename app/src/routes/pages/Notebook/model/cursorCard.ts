/**
 * Pure row-building for the cursor value card (direction-2 decision 55:
 * "a small card at the cursor showing each series' Y at that X"; plan
 * `runs/2026-09-08/w32-time-plan.md` Task 7). No React, no DOM, no IPC
 * (P2 -- hover never calls `cursor_readout`; only a pin does, via the
 * existing `model/cursor.ts`/R62 readout path, unchanged by this module).
 *
 * **Scope, stated rather than silently narrowed.** Decision 55's full
 * shape is one row per series *and* per overlaid window. `ChartCell.tsx`
 * itself is documented as plotting "exactly one channel" at the host level
 * (its own `channelLabel` doc comment, predating this task) and tracks
 * decoded tiles for only the **primary** selected window
 * (`chartWindow`/`primaryWindowSpan` -- every other window's data is
 * combined into the sandbox's own host-var payload and never surfaces back
 * to the host; R69(d)'s own open TODO). This module therefore builds
 * **one row**, for that one channel/window pair, and names which window it
 * is (R132) whenever more than one is selected -- reusing
 * `jsCellNote.ts`'s own `primaryWindowNote` rather than re-deriving that
 * labelling rule a second time (R138's lesson: one definition, shared).
 * A true per-series-per-window card needs per-window/per-channel tiles
 * plumbed to the host (`channelBindDriver.ts`/`Notebook/index.tsx`), which
 * is a larger change than this task's own file list names and is left for
 * that follow-on.
 */
import { primaryWindowNote } from "./jsCellNote";
import { cursorTimeInWindow, type AbsoluteSpan } from "./viewportWindows";

/** The one already-decoded reading this module formats -- `model/hover.ts`'s
 *  own `hoverAt` result (or its `mean` field alone), reused rather than a
 *  second tile read. */
export interface CursorCardReading {
  mean: number;
}

/** One row of the cursor value card. */
export interface CursorCardRow {
  /** Which window this row describes, or `null` when exactly one window is
   *  selected (R127 item 3: no marker, byte-identical to a single-window
   *  card) -- `jsCellNote.ts`'s `primaryWindowNote` supplies this. */
  windowLabel: string | null;
  /** This window's chart token colour (`--chart-1`…`--chart-8`), never a hex literal (R117 item 6). */
  colour: string;
  /** This chart's own plotted series label (`ChartCell`'s existing `channelLabel` prop). */
  seriesLabel: string;
  /** `ChannelSummary.unit` (C1 §4.1), or `""` when unknown. */
  unit: string;
  /** The reading's mean value at the cursor, or `null` -- no data at this
   *  instant (a gap, or the reading fell outside the plotted tiles). */
  value: number | null;
}

/**
 * Builds this chart's one cursor-card row at `offsetUs` (an elapsed µs
 * offset since the primary window's own start -- `cursorBus.ts`'s frame,
 * task 6), or `null` when the cursor has run past `primaryWindowSpan`'s own
 * end (decision 55's "renders absence": no card at all past a window's own
 * end, never one holding a stale value).
 *
 * @param offsetUs `cursorBus.ts`'s current `CursorState.tUs`.
 * @param primaryWindowSpan The chart's own bound window (today, always the primary window -- see this module's own scope note).
 * @param reading The already-decoded tile reading at the cursor's pixel
 *   position (`ChartCell.tsx`'s own `hoverAt` call), or `null` if the
 *   cursor doesn't land on a plotted column.
 * @param seriesLabel This chart's own plotted series label.
 * @param unit This channel's own display unit, or `""`.
 * @param colour This window's chart token colour.
 * @param windowCount The total number of selected windows (R132's naming trigger).
 * @param primaryWindowLabel The primary window's own display label (`state/selection.ts`'s `describeWindow`).
 */
export function cursorCardRow(
  offsetUs: number,
  primaryWindowSpan: AbsoluteSpan,
  reading: CursorCardReading | null,
  seriesLabel: string,
  unit: string,
  colour: string,
  windowCount: number,
  primaryWindowLabel: string
): CursorCardRow | null {
  if (cursorTimeInWindow(offsetUs, primaryWindowSpan) === null) return null;
  return {
    windowLabel: primaryWindowNote(windowCount, primaryWindowLabel),
    colour,
    seriesLabel,
    unit,
    value: reading === null ? null : reading.mean,
  };
}

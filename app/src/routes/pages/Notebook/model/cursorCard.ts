/**
 * Pure row-building for the cursor value card (direction-2 decision 55:
 * "a small card at the cursor showing each series' Y at that X, one row
 * per series and per overlaid lap"; plan `runs/2026-09-08/w32-time-plan.md`
 * Task 7; ruling **R139**). No React, no DOM, no IPC (P2 -- hover never
 * calls `cursor_readout`; only a pin does, via the existing `model/cursor.ts`
 * /R62 readout path, unchanged by this module -- R134 item 7).
 *
 * **R139's data source.** `channelBindDriver.ts` already builds one
 * combined `{t, v, w, windows}` payload per (cell, channel) -- every
 * selected window's own decimated samples, concatenated, `w[i]` naming
 * which window sample `i` belongs to (R127/R129) -- immediately before
 * handing it to the sandbox and dropping it. The caller now **retains**
 * that payload (`CombinedChannelPayload`, `channelBindDriver.ts`) instead,
 * so this module reads rows straight out of already-decoded, already-
 * decimated host memory: no new fetch, no per-window tile retention, and
 * correct for however many windows are selected by construction (the
 * combined payload already covers every one of them, not only the
 * primary).
 */
import type { WindowDescriptor } from "../host/protocol";
import { primaryWindowNote } from "./jsCellNote";
import { cursorTimeInWindow, type AbsoluteSpan } from "./viewportWindows";
import { wireWindowKey } from "./workbookState";

/** The combined per-window payload `channelBindDriver.ts`'s `CombinedChannelPayload` is -- re-exported here as a type-only alias so this module's own public signature doesn't force every caller to import from `channelBindDriver.ts` for one type. */
export interface CombinedChannelPayload {
  length: number;
  t: Float64Array;
  v: Float64Array;
  w: Float64Array;
  windows: WindowDescriptor[];
  /** `windows[k]`'s own already-resolved `AbsoluteSpan`, aligned 1:1 with `windows` by index. */
  spans: AbsoluteSpan[];
}

/** One row of the cursor value card. */
export interface CursorCardRow {
  /** Which window this row describes, or `null` when exactly one window is
   *  selected (R127 item 3: no marker, byte-identical to a single-window
   *  card) -- `jsCellNote.ts`'s `primaryWindowNote` supplies this, reused
   *  for *every* row (not only the primary window's) since a multi-row
   *  card is, by construction, already showing more than one window and
   *  every row must say which one (R132's rule, generalised to N rows). */
  windowLabel: string | null;
  /** This window's chart token colour (`--chart-1`…`--chart-8`, never a hex literal, R117 item 6) -- `WindowDescriptor.colour` verbatim. */
  colour: string;
  /** This chart's own plotted series label (`ChartCell`'s existing `channelLabel` prop). */
  seriesLabel: string;
  /** `ChannelSummary.unit` (C1 §4.1), or `""` when unknown. */
  unit: string;
  /** The nearest sample's value at the cursor within this window's own
   *  contiguous run of `payload`, or `null` -- no nearby sample (a gap, or
   *  the cursor sits past the window's own end and no row is built at all,
   *  see {@link cursorCardRows}'s own doc comment). */
  value: number | null;
}

/**
 * The nearest sample's value in `payload` for window index `windowIndex`,
 * at `tSec` (seconds since that window's own session start, matching
 * `WindowSeries.t`'s own units) -- a linear nearest-neighbour scan
 * restricted to that window's own contiguous run (`combineChannelWindows`
 * concatenates windows in order, one run per window, R127 item 4's break
 * rows the only gaps between them), so cost is proportional to one
 * window's own point budget, never the whole payload. `null` when
 * `payload` has no samples at all for `windowIndex` (every selected window
 * with no overlap is already excluded from `payload` entirely, per
 * `channelBindDriver.ts`'s own doc comment -- this only fires for a
 * genuinely empty run, which the *count* of rows never claims in the
 * first place).
 */
function nearestValue(payload: CombinedChannelPayload, windowIndex: number, tSec: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < payload.length; i++) {
    if (payload.w[i] !== windowIndex) continue;
    const distance = Math.abs(payload.t[i] - tSec);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = payload.v[i];
    }
  }
  return best;
}

/**
 * Builds one cursor-card row per window in `payload.windows`, at
 * `offsetUs` (an elapsed µs offset since the primary window's own start --
 * `cursorBus.ts`'s frame, task 6). A window is **skipped entirely** --
 * not a row with `value: null` -- once `offsetUs` runs past that window's
 * own recorded end (`cursorTimeInWindow`, decision 55's "renders absence":
 * no card at all for that lap past where it stopped, never one holding a
 * stale value). A row *is* built with `value: null` when the cursor sits
 * within the window's own span but no nearby sample exists there (a real
 * gap in the data, R31's "no data" convention) -- the two `null`s mean
 * different things and this function keeps them apart by including or
 * omitting the row, not by a second field.
 *
 * @param offsetUs `cursorBus.ts`'s current `CursorState.tUs`.
 * @param payload This chart's own retained combined payload (R139).
 * @param seriesLabel This chart's own plotted series label.
 * @param unit This channel's own display unit, or `""`.
 * @param totalWindowCount The total number of selected windows (`AppState.selection.length`) -- R132's naming trigger, `<= 1` renders no marker on any row.
 * @param selectedWindowKeys Decision 61: `AppState.selection`'s own windows,
 *   as `model/workbookState.ts`'s `wireWindowKey` strings -- `payload` is a
 *   *retained* map keyed by (cell, channel), not by window (see
 *   `channelBindDriver.ts`'s `CombinedChannelPayload` doc comment), so a
 *   window unchecked in the Data tab can still be sitting in `payload`
 *   until the next successful bind overwrites it. This card must never
 *   show that window's row in the meantime -- every window in
 *   `payload.windows` is checked against the *current* selection here,
 *   independent of whether the retained cache itself has caught up yet, so
 *   this is correct even during that gap. `undefined` keeps every window
 *   from before this parameter existed, for callers not yet passing it.
 */
export function cursorCardRows(
  offsetUs: number,
  payload: CombinedChannelPayload,
  seriesLabel: string,
  unit: string,
  totalWindowCount: number,
  selectedWindowKeys?: ReadonlySet<string>
): CursorCardRow[] {
  const rows: CursorCardRow[] = [];
  payload.windows.forEach((descriptor, windowIndex) => {
    if (selectedWindowKeys !== undefined && !selectedWindowKeys.has(wireWindowKey({ session_id: descriptor.sessionId, span: descriptor.span, colour: descriptor.colour }))) {
      return;
    }
    const span = payload.spans[windowIndex];
    if (span === undefined) return;
    const tUs = cursorTimeInWindow(offsetUs, span);
    if (tUs === null) return;
    rows.push({
      windowLabel: primaryWindowNote(totalWindowCount, descriptor.label),
      colour: descriptor.colour,
      seriesLabel,
      unit,
      value: nearestValue(payload, windowIndex, tUs / 1_000_000),
    });
  });
  return rows;
}

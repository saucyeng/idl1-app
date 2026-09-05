import type { CursorReadout } from "../../../../ipc/cursor";
import type { Viewport } from "./viewport";

/**
 * Pure pixel→time conversion and response formatting for the Notebook
 * chart's cross-channel cursor readout (C3 §3.7 "Cursor"; C3 §4
 * "Interaction budget"; ledger R31). This is the *settle-time* numeric
 * panel — distinct from `model/hover.ts`'s per-pointer-move tile-column
 * tooltip, which never calls IPC (P2). Nothing here calls `cursorReadout`
 * itself or touches the DOM; `components/ChartCell.tsx`'s settle callback
 * calls {@link cursorRequestFor} to decide whether/what to request, then
 * (on settle only) calls `ipc/cursor.ts`'s `cursorReadout` and hands the
 * result to {@link formatReadout} for `components/CursorReadout.tsx` to render.
 */

/** One `fetch_raster`-style request built by {@link cursorRequestFor}: the
 *  instant and channel set to pass to `cursorReadout` (`ipc/cursor.ts`). */
export interface CursorRequest {
  /** The pointer's converted time instant, in µs since session start (C1 §3.1). */
  tUs: number;
  /** The channels to read at `tUs` — echoed from the caller's `channels` argument. */
  channels: string[];
}

/**
 * Converts a pointer's CSS-px `pixelX` position within the chart's plotted
 * area to a `t_us` instant on the session's `t` axis (C1 §3.1), using the
 * same linear pixel→time mapping as `viewport.ts`'s `panBy`/`zoomAt`:
 * `viewport.startUs + (pixelX / viewport.pixelWidth) * (viewport.endUs -
 * viewport.startUs)`.
 *
 * Returns `null` when `pixelX` falls outside `[0, viewport.pixelWidth]` — in
 * which case the caller issues no `cursorReadout` request at all, rather
 * than requesting an out-of-range time.
 *
 * @param viewport The settled viewport (µs time window + CSS px plotting width).
 * @param pixelX Pointer position, in CSS px, relative to the plot's left edge.
 * @param channels The channel ids to request at the converted instant.
 */
export function cursorRequestFor(viewport: Viewport, pixelX: number, channels: string[]): CursorRequest | null {
  if (pixelX < 0 || pixelX > viewport.pixelWidth) {
    return null;
  }

  const tUs = viewport.startUs + (pixelX / viewport.pixelWidth) * (viewport.endUs - viewport.startUs);
  return { tUs, channels };
}

/** One formatted row for the cursor readout panel. `value` is `null` exactly
 *  when `CursorReadout.values[channel]` is `null` (R31: past the channel's
 *  recorded span, or the channel has no samples/no time axis) — never
 *  coerced to `0`. Rendering `null` as the text "no data" (rather than `0`,
 *  `"—"`, or a blank cell indistinguishable from a real `0` reading) is
 *  `components/CursorReadout.tsx`'s job, not this module's. */
export interface ReadoutRow {
  /** The channel id, as sent in the `cursorReadout` request. */
  channel: string;
  /** Display label for `channel` (`labels[channel]`, or `channel` itself
   *  when absent from the map — see {@link formatReadout}'s doc comment). */
  label: string;
  /** The nearest recorded sample at the readout's `t_us`, or `null` (R31). */
  value: number | null;
}

/**
 * Builds display rows from a `cursorReadout` response.
 *
 * Iterates `Object.keys(readout.values)` — the channels **present** in the
 * response — so a channel the caller requested but that is entirely absent
 * from `readout.values` (e.g. an unknown channel, distinct from R31's
 * "known channel, no data here" `null`) never appears as a row, rather than
 * rendering blank; per the plan's own test list this "absent entirely" case
 * is simply omitted, not distinguished from any other omission in the
 * `ReadoutRow` shape itself.
 *
 * Each row's `label` is `labels[channel]`; when `channel` is missing from
 * `labels`, the raw channel id is used as a fallback instead of throwing —
 * document this at any call site that expects every plotted channel to have
 * a label.
 *
 * @param readout The `cursorReadout` response to format.
 * @param labels Channel id → display label map.
 */
export function formatReadout(readout: CursorReadout, labels: Record<string, string>): ReadoutRow[] {
  return Object.keys(readout.values).map((channel) => ({
    channel,
    label: labels[channel] ?? channel,
    value: readout.values[channel],
  }));
}

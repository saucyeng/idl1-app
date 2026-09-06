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

/** The shape a rejected `cursorReadout` promise carries when it's a typed
 *  IPC failure (C3 §2) — kept local, like `ipc/workbook.ts`'s `IpcError`
 *  and `Device/errors.ts`'s `DeviceIpcError`; this module only ever sees it
 *  as a caught rejection, never nested in a success payload. */
export interface CursorReadoutErrorLike {
  /** Machine-readable failure class (e.g. `invalid_argument` for an unknown
   *  requested channel, C3 §3.7). Never routed on `message` (C3 §2). */
  kind: string;
  message: string;
}

/** `true` when `value` has the shape of a typed IPC rejection (a `kind`
 *  string property) rather than an untyped/generic thrown value. */
function isCursorReadoutErrorLike(value: unknown): value is CursorReadoutErrorLike {
  return typeof value === "object" && value !== null && "kind" in value && typeof (value as { kind: unknown }).kind === "string";
}

/**
 * Turns a rejected `cursorReadout` promise into fixed, user-facing text —
 * never swallowed silently (lead ruling, 2026-09-05, `review-task10.md`):
 * an `invalid_argument` rejection (an unknown requested channel, C3 §3.7),
 * any other typed `IpcError`-shaped rejection, and a plain untyped
 * rejection (e.g. a network-level failure with no `kind`) all set a
 * visible "readout unavailable" state instead of leaving the panel showing
 * a stale reading. `kind` is surfaced (never `message`, matching C3 §2's
 * "never route on message") because it is the one machine-readable,
 * always-safe-to-show piece of a rejection; there is no `cursor_readout`
 * analogue of `Device/errors.ts`'s `kind: "config"` carve-out (no
 * `cursor_readout` error kind's `message` is documented as user-safe
 * device-stated text), so `message` is never shown here. Never throws.
 *
 * @param error The rejection value caught from a `cursorReadout` promise.
 */
export function describeCursorReadoutError(error: unknown): string {
  if (isCursorReadoutErrorLike(error)) {
    return `readout unavailable: ${error.kind}`;
  }
  return "readout unavailable";
}

/** The cursor readout panel's full display state, produced by a settle
 *  dispatch (either `ChartCell`'s viewport settle or the independent
 *  pointer-stop cursor settle, ruling R62 — see
 *  `model/cursorReadoutDriver.ts`): a set of formatted rows, a fixed error
 *  message (see {@link describeCursorReadoutError}), or `null` (nothing to
 *  show — no settle has resolved a readout yet, or the pointer is off the
 *  chart). `components/CursorReadout.tsx` renders this discriminated union
 *  directly. */
export type ReadoutPanelState = { kind: "rows"; rows: ReadoutRow[] } | { kind: "error"; message: string } | null;

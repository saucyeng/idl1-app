/**
 * `fetch_gps_trace_v2`'s app-side mirror and `IDLG` v1 decoder, plus
 * `fetch_gps_trace_meta` (C3 §3.5, ruling R217 item 1) — the map cell's two
 * halves: the projected trace as bytes, and the track underlay with the axis
 * domains as JSON.
 *
 * **Everything here is metres.** The engine projects into one local ENU frame
 * and no latitude crosses this boundary (C2 §5.3): the trace and the underlay
 * share one frame and origin, so the sandbox draws a plane and derives
 * nothing.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Window } from "./workbook";

/** The largest `budget` `fetch_gps_trace_v2` accepts (C3 §3.5; the Rust
 *  `MAX_GPS_TRACE_POINTS`). Mirrored so a caller clamps its own budget rather
 *  than surfacing the engine's `invalid_argument` as a chart error. */
export const MAX_GPS_TRACE_POINTS = 65_536;

/** C2 §5.3's own sizing rule for a map cell's budget: four points per CSS
 *  pixel of width, clamped to this range. Wider than a tile's "2 per pixel
 *  column" because a path is geometric — it doubles back, and the budget has
 *  to cover both passes. */
export const GPS_BUDGET_MIN = 1024;
/** See {@link GPS_BUDGET_MIN}. */
export const GPS_BUDGET_MAX = 8000;

/** The point budget for a map of `cssWidth` CSS pixels (C2 §5.3). */
export function gpsBudgetForWidth(cssWidth: number): number {
  const raw = Math.round(cssWidth * 4);
  return Math.min(GPS_BUDGET_MAX, Math.max(GPS_BUDGET_MIN, Number.isFinite(raw) ? raw : GPS_BUDGET_MIN));
}

/** A decoded `fetch_gps_trace_v2` response (C3 §3.5) — one window's trace. */
export interface DecodedGpsTrace {
  /** Metres east of the ENU origin, one per point. */
  xs: Float64Array;
  /** Metres north, index-aligned with {@link xs}. */
  ys: Float64Array;
  /** Seconds, session-relative, index-aligned with {@link xs}. */
  ts: Float64Array;
  /** The colour-by channel resampled onto the fix times, `NaN` where the
   *  channel has no sample near a fix. `null` — not an array of `NaN` — when
   *  the request named no colour channel: an uncoloured trace has no colour
   *  column at all, and the flag says so without scanning for it. */
  cs: Float64Array | null;
}

const GPS_MAGIC = "IDLG";
const GPS_SUPPORTED_VERSION = 1;
const GPS_HEADER_LEN = 16;
const FLAG_HAS_C = 1;

/**
 * Decodes a `fetch_gps_trace_v2` response per C3 §3.5's `IDLG` v1 layout: a
 * fixed 16-byte little-endian header (`magic`, `version`, `flags`,
 * `point_count`, `reserved`), then `point_count` `f64` values for `x`, then
 * `y`, then `t`, then `c` when `flags` bit 0 is set.
 *
 * Values are copied into fresh `Float64Array`s rather than viewed in place,
 * for the reason `ipc/scatter.ts` gives: a transferred `ArrayBuffer`'s own
 * `byteOffset` is not guaranteed 8-byte aligned across every host.
 *
 * @throws Error on bad magic, an unsupported `version`, or a buffer too short
 *  for the header or its declared `point_count`.
 */
export function decodeGpsTrace(buf: ArrayBuffer): DecodedGpsTrace {
  if (buf.byteLength < GPS_HEADER_LEN) {
    throw new Error(`gps trace buffer ${buf.byteLength} bytes, header needs ${GPS_HEADER_LEN} bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== GPS_MAGIC) {
    throw new Error(`gps trace magic bytes "${magic}" != "${GPS_MAGIC}"`);
  }
  const version = view.getUint16(4, true);
  if (version !== GPS_SUPPORTED_VERSION) {
    throw new Error(`gps trace version ${version} != supported version ${GPS_SUPPORTED_VERSION}`);
  }
  const hasC = (view.getUint16(6, true) & FLAG_HAS_C) !== 0;
  const pointCount = view.getUint32(8, true);
  const perPoint = hasC ? 32 : 24;
  const total = GPS_HEADER_LEN + pointCount * perPoint;
  if (buf.byteLength < total) {
    throw new Error(`gps trace buffer ${buf.byteLength} bytes too short for point_count=${pointCount} (need ${total})`);
  }

  const block = (index: number): Float64Array => {
    const out = new Float64Array(pointCount);
    const base = GPS_HEADER_LEN + index * pointCount * 8;
    for (let i = 0; i < pointCount; i++) out[i] = view.getFloat64(base + i * 8, true);
    return out;
  };

  return { xs: block(0), ys: block(1), ts: block(2), cs: hasC ? block(3) : null };
}

/** One projected point, metres (C3 §3.5). */
export interface GpsPoint {
  x: number;
  y: number;
}

/** One projected gate, metres — a segment, because a gate is a line the
 *  rider crosses (C3 §3.5). */
export interface GpsGateSegment {
  name: string;
  kind: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** `fetch_gps_trace_meta`'s return (C3 §3.5) — the map cell's underlay and
 *  axis domains, in the same frame as every trace for the same session. */
export interface GpsTraceMeta {
  /** The frame's anchor, decimal degrees — the one place a latitude appears,
   *  so a caller can report where it is looking. */
  origin: { lat: number; lon: number };
  x_domain: [number, number];
  y_domain: [number, number];
  /** Empty when the request named no track, or the track has no polyline. */
  polyline: GpsPoint[];
  gates: GpsGateSegment[];
}

/** One window's GPS trace, projected and decimated in the engine (C3 §3.5).
 *  Settle-bound only (C3 §4) — never a hover/pan/zoom handler. */
export async function fetchGpsTrace(
  workbookId: string,
  window: Window,
  colourBy: string | null,
  budget: number
): Promise<DecodedGpsTrace> {
  const buf = await invoke<ArrayBuffer>("fetch_gps_trace_v2", { workbookId, window, colourBy, budget });
  return decodeGpsTrace(buf);
}

/** The map cell's track underlay and axis domains (C3 §3.5). Resolved once
 *  per selection, never per frame — it is the same for every window of one
 *  session, which is what keeps the trace and the track in one frame. */
export async function fetchGpsTraceMeta(sessionId: string, trackId: string | null): Promise<GpsTraceMeta> {
  return invoke<GpsTraceMeta>("fetch_gps_trace_meta", { sessionId, trackId });
}

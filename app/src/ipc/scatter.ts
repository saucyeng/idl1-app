/**
 * `fetch_scatter`'s app-side mirror and `IDLS` v1 decoder (C3 §3.5, ruling
 * R215 item 3) — two channels paired against each other over a selected
 * window, decimated in the engine.
 *
 * Binary, unlike `ipc/histogram.ts`: a cloud is up to `point_budget` points,
 * each two `f64`s, so it belongs with `ipc/tiles.ts` and `decodeFft` rather
 * than with the histogram's few hundred JSON numbers.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Window } from "./workbook";

/** The largest `point_budget` `fetch_scatter` accepts (C3 §3.5; the Rust
 *  `MAX_SCATTER_POINTS`). Mirrored so a caller can clamp its own budget
 *  rather than surfacing the engine's `invalid_argument` as a chart error. */
export const MAX_SCATTER_POINTS = 65_536;

/** A decoded `fetch_scatter` response (C3 §3.5): the decimated cloud plus
 *  the **pre-decimation** extent of the finite cloud over the window. */
export interface DecodedScatter {
  /** x values, one per point, in `xChannel`'s own unit. */
  xs: Float64Array;
  /** y values, index-aligned with {@link xs}. */
  ys: Float64Array;
  /** The finite cloud's extent over the window *before* decimation — what
   *  an equal-aspect caller squares its axes from. Never the thinned
   *  cloud's own min/max. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const SCATTER_MAGIC = "IDLS";
const SCATTER_SUPPORTED_VERSION = 1;
const SCATTER_HEADER_LEN = 48;

/**
 * Decodes a `fetch_scatter` response per C3 §3.5's `IDLS` v1 layout: a fixed
 * 48-byte little-endian header (`magic`, `version`, `reserved`,
 * `point_count`, `reserved`, then the four `f64` bounds), then `point_count`
 * `f64` x values, then `point_count` `f64` y values.
 *
 * Values are copied into fresh `Float64Array`s rather than viewed in place:
 * the header's trailing `u32` pad means offset 48 *is* 8-byte aligned within
 * the buffer, but only when the buffer's own `byteOffset` is — which a
 * transferred `ArrayBuffer` does not guarantee across every host. A
 * zero-copy decoder is a layout-version bump, exactly as `ipc/tiles.ts` says
 * of `IDLT`.
 *
 * @throws Error on bad magic, an unsupported `version`, or a buffer too
 *  short for the header or its declared `point_count`.
 */
export function decodeScatter(buf: ArrayBuffer): DecodedScatter {
  if (buf.byteLength < SCATTER_HEADER_LEN) {
    throw new Error(`scatter buffer ${buf.byteLength} bytes, header needs ${SCATTER_HEADER_LEN} bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== SCATTER_MAGIC) {
    throw new Error(`scatter magic bytes "${magic}" != "${SCATTER_MAGIC}"`);
  }
  const version = view.getUint16(4, true);
  if (version !== SCATTER_SUPPORTED_VERSION) {
    throw new Error(`scatter version ${version} != supported version ${SCATTER_SUPPORTED_VERSION}`);
  }
  const pointCount = view.getUint32(8, true);
  const total = SCATTER_HEADER_LEN + pointCount * 16;
  if (buf.byteLength < total) {
    throw new Error(`scatter buffer ${buf.byteLength} bytes too short for point_count=${pointCount} (need ${total})`);
  }

  const xMin = view.getFloat64(16, true);
  const xMax = view.getFloat64(24, true);
  const yMin = view.getFloat64(32, true);
  const yMax = view.getFloat64(40, true);

  const xs = new Float64Array(pointCount);
  const ys = new Float64Array(pointCount);
  const ysOffset = SCATTER_HEADER_LEN + pointCount * 8;
  for (let i = 0; i < pointCount; i++) {
    xs[i] = view.getFloat64(SCATTER_HEADER_LEN + i * 8, true);
    ys[i] = view.getFloat64(ysOffset + i * 8, true);
  }

  return { xs, ys, xMin, xMax, yMin, yMax };
}

/**
 * The one square range that makes a cloud's two axes equal-aspect (idl0's
 * G-G circle default, `scatter_chart.dart`): a range wide enough for both
 * extents, centred on zero when the data straddles zero on either axis.
 *
 * **Why zero-centred matters.** A G-G diagram's reference is the friction
 * circle, centred at the origin. Squaring the axes about the *data*'s centre
 * instead would draw a circle off-centre from the plotted points and make a
 * biased cloud look symmetric. When neither axis straddles zero (an
 * always-positive pair, e.g. travel against travel), the square fits the
 * union extent instead, since there is no origin in view to centre on.
 *
 * Returns `null` when the cloud has no extent to square (both axes
 * degenerate) — the caller leaves Plot to pick its own domains rather than
 * passing a zero-width one.
 *
 * Pure; this is axis geometry for a picture, not a number the sync model
 * depends on (CLAUDE.md §2), which is why it lives here and not in `core`.
 */
export function equalAspectDomain(scatter: DecodedScatter): [number, number] | null {
  const { xMin, xMax, yMin, yMax } = scatter;
  if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return null;

  const straddlesZero = (lo: number, hi: number): boolean => lo <= 0 && hi >= 0;
  if (straddlesZero(xMin, xMax) || straddlesZero(yMin, yMax)) {
    const m = Math.max(Math.abs(xMin), Math.abs(xMax), Math.abs(yMin), Math.abs(yMax));
    return m > 0 ? [-m, m] : null;
  }

  const lo = Math.min(xMin, yMin);
  const hi = Math.max(xMax, yMax);
  return hi > lo ? [lo, hi] : null;
}

/** Pairs `xChannel` against `yChannel` over `window`, decimated to
 *  `pointBudget` points in the engine (C3 §3.5, ruling R215 item 3).
 *  Settle-bound only (C3 §4) — never a hover/pan/zoom handler. */
export async function fetchScatter(
  window: Window,
  xChannel: string,
  yChannel: string,
  pointBudget: number
): Promise<DecodedScatter> {
  const buf = await invoke<ArrayBuffer>("fetch_scatter", { window, xChannel, yChannel, pointBudget });
  return decodeScatter(buf);
}

/**
 * `fetch_histogram`'s app-side mirror (C3 §3.6, ruling R215 item 2) — one
 * channel's value distribution over a selected window.
 *
 * Unlike `ipc/tiles.ts` and `ipc/rasters.ts`, this module has **no decoder**:
 * the command returns JSON, not `IDLx` bytes, because a histogram is a few
 * hundred numbers at most (C3 §3.6's own "JSON, not `IDLx` bytes" note). The
 * types below are the wire shape verbatim, `snake_case` included — nothing is
 * renamed on the way in, so a field here is greppable against the Rust
 * `HistogramResponse` it came from.
 */
import { invoke } from "@tauri-apps/api/core";

import type { Window } from "./workbook";

/** How `HistogramParams.bin_value` is read (C3 §3.6). */
export type HistogramBinMode = "count" | "width";

/** What `HistogramResponse.values` carries (C3 §3.6). */
export type HistogramNormalise = "counts" | "fraction";

/** The largest bin count `fetch_histogram` accepts, and the cap a
 *  `bin_mode: "width"` request resolves against (C3 §3.6; the Rust
 *  `MAX_HISTOGRAM_BINS`). Mirrored here so the Properties pane can refuse a
 *  bin count before a round trip rather than surfacing the engine's
 *  `invalid_argument` as a chart error. */
export const MAX_HISTOGRAM_BINS = 4096;

/** `fetch_histogram`'s `params` argument (C3 §3.6). Every field is required:
 *  a histogram's picture is fully determined by these four values plus the
 *  window, and a default living outside the document would be a parameter of
 *  the picture the document does not state (CLAUDE.md §3). */
export interface HistogramParams {
  bin_mode: HistogramBinMode;
  /** A bin count (integer, `1..=MAX_HISTOGRAM_BINS`) under `bin_mode:
   *  "count"`; a bin width in the channel's own unit under `"width"`. */
  bin_value: number;
  /** Widen the auto range to `[-m, m]` so zero sits on a bin boundary — the
   *  natural frame for a signed suspension-velocity distribution. */
  symmetric: boolean;
  normalise: HistogramNormalise;
}

/** `fetch_histogram`'s result (C3 §3.6). */
export interface HistogramResponse {
  /** Bin boundaries, ascending, length `counts.length + 1`. Bin `i` spans
   *  `bin_edges[i]..bin_edges[i + 1]`; the last bin is closed on the right. */
  bin_edges: number[];
  /** Finite-sample count per bin — always the **raw** count, whatever
   *  `params.normalise` was, so a reader can recover the sample count behind
   *  a bar. Sums to `total`. */
  counts: number[];
  /** What the chart plots, per `params.normalise`. Computed in the engine,
   *  never derived here from `counts`/`total` (CLAUDE.md §2: no number the
   *  picture depends on is computed in JavaScript). All zeros, never `NaN`,
   *  when `total` is zero. */
  values: number[];
  /** Total finite samples binned over the window. */
  total: number;
  /** The bin count actually used — under `bin_mode: "width"` this is what
   *  the engine derived, which the caller cannot compute for itself. */
  bins: number;
}

/** `true` when `response` is the degenerate result C3 §3.6 documents: a
 *  window with no finite sample, a constant channel, or a `"width"` too wide
 *  to resolve a bin. Not an error — the chart shows an empty state. A named
 *  predicate rather than a `bins === 0` check scattered across callers, so
 *  every caller agrees on what "nothing to draw" means. */
export function isEmptyHistogram(response: HistogramResponse): boolean {
  return response.bins === 0;
}

/** Bins one channel's values over `window` (C3 §3.6, ruling R215 item 2).
 *  Settle-bound only (C3 §4) — never a hover/pan/zoom handler; the binning
 *  pass runs over every sample in the window, in the engine. */
export async function fetchHistogram(window: Window, channel: string, params: HistogramParams): Promise<HistogramResponse> {
  return invoke<HistogramResponse>("fetch_histogram", { window, channel, params });
}

import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";

/**
 * The flat host-transfer buffers for one channel's visible window, built
 * from one or more {@link DecodedTile}s (design §6; C2 §5.1's settled
 * `channel()` shape — see `runs/2026-09-05/lanes/l6/brief-task7.md`). `t` is
 * in **seconds** since session start (µs → s, matching `to_host_channel`'s
 * convention) — computed from `columnTUs` with the `COLUMN_T_US_EMPTY`
 * sentinel dropped, never plotted as zero. `v` is `columnMean` (the coarse
 * per-pixel-column stat — a chart-width-resolution rendering, not the raw
 * samples); a column whose stats are all-`NaN` (a real time but no useful
 * value) surfaces as `NaN` in `v` at that index rather than a parallel
 * validity mask — Observable Plot's line mark already skips a `NaN` `y`
 * value instead of drawing it as zero, so this is sufficient without extra
 * bookkeeping. Length of both arrays is at most `budget` (performance
 * budget P5); this is the **host-side transfer buffer** shape, a different
 * thing from the array of `{t, v}` records the sandbox materialises from it
 * for `channel()` to return to cell code (see `sandbox/main.ts`).
 *
 * Both `t` and `v` are `Float64Array` (8 bytes/element) — matching, byte
 * for byte, what Task 5's already-landed `sandbox/main.ts`'s
 * `materializeHostVar` does on receipt (`new Float64Array(payload.t)`,
 * `new Float64Array(payload.v)`). A `Float32Array` `v` was tried first but
 * reviewed as an Important finding (review-task7.md): the sandbox side
 * reinterprets whatever bytes arrive as `Float64Array` unconditionally, so
 * a narrower host-side type would silently corrupt every value (half as
 * many records, each one's bits reinterpreted as an unrelated double) once
 * wired — not a type this task is free to choose independently of the
 * already-committed sandbox side. C1 channels are natively `f64`, and at
 * the point budget's ~2 points/pixel-column the extra bytes over
 * `Float32Array` are negligible.
 */
export interface ChannelData {
  /** Number of records actually populated (`t.length === v.length === length`). */
  length: number;
  /** Time of each record, in seconds since session start. */
  t: Float64Array;
  /** Value of each record (`columnMean`, widened from the tile's `f32` to
   *  match the sandbox's `Float64Array` reinterpretation of the
   *  transferred buffer); `NaN` where the source column carried no real
   *  stat. */
  v: Float64Array;
}

/**
 * Converts one or more `tiles`' column regions, restricted to
 * `[startUs, endUs)`, into the flat transfer buffers `channelPayload`
 * (`host/protocol.ts`) sends into the sandbox. `tiles` is assumed sorted in
 * ascending time order (the caller's tile-range fetch order, `model/tiers.ts`).
 *
 * A column carrying `COLUMN_T_US_EMPTY` is dropped entirely — never plotted
 * at time zero (checked as `bigint`, before any conversion to `Number`, so
 * the exact sentinel value survives the comparison). A column whose time
 * exactly repeats the previous emitted column's time (the seam between two
 * tiles whose ranges touch) is skipped as a duplicate rather than emitted
 * twice.
 *
 * When more columns pass the window/sentinel/dedupe filters than `budget`
 * allows, the result is downsampled by an even stride across the full
 * filtered range — never a truncation to the first `budget` columns, which
 * would silently drop the tail of the visible window.
 *
 * @param tiles Decoded tiles covering (at least) `[startUs, endUs)`, in ascending time order.
 * @param startUs Start of the visible window, in µs since session start (inclusive).
 * @param endUs End of the visible window, in µs since session start (exclusive).
 * @param budget Maximum number of records to emit (Task 6's `pointBudget`).
 */
export function tileToChannelData(
  tiles: DecodedTile[],
  startUs: number,
  endUs: number,
  budget: number
): ChannelData {
  const startUsBig = BigInt(Math.trunc(startUs));
  const endUsBig = BigInt(Math.trunc(endUs));

  const times: bigint[] = [];
  const means: number[] = [];
  let lastTUs: bigint | null = null;

  for (const tile of tiles) {
    for (let j = 0; j < tile.columnTUs.length; j++) {
      const tUs = tile.columnTUs[j];
      if (tUs === COLUMN_T_US_EMPTY) {
        continue;
      }
      if (tUs < startUsBig || tUs >= endUsBig) {
        continue;
      }
      if (lastTUs !== null && tUs === lastTUs) {
        continue;
      }
      times.push(tUs);
      means.push(tile.columnMean[j]);
      lastTUs = tUs;
    }
  }

  const total = times.length;
  const length = budget > 0 ? Math.min(total, budget) : 0;
  const t = new Float64Array(length);
  const v = new Float64Array(length);

  if (length === total) {
    for (let i = 0; i < length; i++) {
      t[i] = Number(times[i]) / 1_000_000;
      v[i] = means[i];
    }
  } else {
    const stride = total / length;
    for (let i = 0; i < length; i++) {
      const sourceIndex = Math.min(Math.floor(i * stride), total - 1);
      t[i] = Number(times[sourceIndex]) / 1_000_000;
      v[i] = means[sourceIndex];
    }
  }

  return { length, t, v };
}

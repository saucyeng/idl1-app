/**
 * Shapes a `{kind: "channel"}` host-variable payload's parallel columns into
 * the record array a cell actually reads (C2 §5.1, §3.6.5), split out of
 * `main.ts` — which has import-time `window`/`iframe` side effects and cannot
 * be unit-tested (CLAUDE.md §4) — so the one rule that matters here can be.
 *
 * **The rule (ruling R233, C2 §3.6.5's rank-1 row).** A rank-1 value binds its
 * axis under that axis's own key: a `time` axis binds `t` (seconds), a `lap`
 * axis binds `lap` (1-based lap numbers). It is not a rename for tidiness —
 * `t` is seconds everywhere else in this realm, so publishing lap numbers
 * under it would draw lap 3 at three seconds on any mark bound `x: "t"`, a
 * picture that looks like real data and is not. Binding them under `lap`
 * instead means a mistaken `x: "t"` finds `undefined` and draws nothing.
 *
 * `tr` (seconds since this sample's own window began, ruling R215) exists only
 * for a time axis: a lap number has no sub-window offset to rebase, so a
 * `lap` record carries no `tr` at all rather than a zero-filled column that
 * would plot.
 */
import { AxisKind, type AxisKindValue } from "../../../../ipc/hostChannel";

/** One sample of a `Time`-axis channel — the shape every `js` cell and every
 *  `plotForm` time mark has read since L6 Task 7 (`x: "t"` or `x: "tr"`,
 *  `y: "v"`, faceted/coloured by `w`). */
export interface TimeChannelRecord {
  /** Seconds since this sample's session start. `NaN` on a window break row (ruling R127 item 4). */
  t: number;
  /** The channel's value in its own unit. */
  v: number;
  /** Seconds since this sample's own window began (ruling R215 items 4-5). */
  tr: number;
  /** Index into the payload's `windows` descriptor array; `NaN` on a break row. */
  w: number;
}

/** One entry of a `[lap]` value (C2 §3.6.5): one number per lap, keyed by
 *  the lap ordinal rather than by time. No `tr` — see this module's own doc
 *  comment. */
export interface LapChannelRecord {
  /** 1-based lap number (C1 `laps[]`, C2 §3.6.1). `NaN` on a window break row. */
  lap: number;
  /** The per-lap value in its own unit. */
  v: number;
  /** Index into the payload's `windows` descriptor array; `NaN` on a break row. */
  w: number;
}

/** What {@link channelRecords} returns — one record per sample, in payload order. */
export type ChannelRecord = TimeChannelRecord | LapChannelRecord;

/**
 * Builds the record array for one decoded channel payload: `{t, v, tr, w}`
 * per sample for {@link AxisKind.Time} (and for every other axis kind — a
 * `Frequency` or axis-less payload never reaches this path, and defaulting
 * them to the long-standing time shape keeps this function total), `{lap, v,
 * w}` for {@link AxisKind.Lap}.
 *
 * `length` is the payload's own declared sample count, not any column's
 * `.length`: the columns are built to it by `combineChannelWindows` and a
 * reader that trusted a column instead would disagree with the payload on a
 * malformed message. Reading past a shorter column yields `undefined`, which
 * lands in the record as `undefined` rather than throwing — Plot skips such a
 * point, which is the same treatment a `NaN` break row gets.
 */
export function channelRecords(
  length: number,
  t: Float64Array,
  v: Float64Array,
  tr: Float64Array,
  w: Float64Array,
  axisKind: AxisKindValue
): ChannelRecord[] {
  const records = new Array<ChannelRecord>(length);
  if (axisKind === AxisKind.Lap) {
    for (let i = 0; i < length; i++) {
      records[i] = { lap: t[i], v: v[i], w: w[i] };
    }
    return records;
  }
  for (let i = 0; i < length; i++) {
    records[i] = { t: t[i], v: v[i], tr: tr[i], w: w[i] };
  }
  return records;
}

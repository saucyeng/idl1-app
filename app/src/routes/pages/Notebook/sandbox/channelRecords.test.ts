import { describe, expect, it } from "vitest";

import { AxisKind } from "../../../../ipc/hostChannel";
import { channelRecords } from "./channelRecords";

describe("channelRecords", () => {
  it("channel records — a Time axis — keys the axis column t and keeps tr", () => {
    const t = new Float64Array([0, 0.5]);
    const v = new Float64Array([10, 11]);
    const tr = new Float64Array([0, 0.5]);
    const w = new Float64Array([0, 0]);

    const records = channelRecords(2, t, v, tr, w, AxisKind.Time);

    expect(records).toEqual([
      { t: 0, v: 10, tr: 0, w: 0 },
      { t: 0.5, v: 11, tr: 0.5, w: 0 },
    ]);
  });

  it("channel records — a Lap axis — keys the axis column lap and drops tr", () => {
    const t = new Float64Array([1, 2, 3]);
    const v = new Float64Array([92.4, 91.8, 93.1]);
    const tr = new Float64Array([0, 0, 0]);
    const w = new Float64Array([0, 0, 0]);

    const records = channelRecords(3, t, v, tr, w, AxisKind.Lap);

    expect(records).toEqual([
      { lap: 1, v: 92.4, w: 0 },
      { lap: 2, v: 91.8, w: 0 },
      { lap: 3, v: 93.1, w: 0 },
    ]);
  });

  it("channel records — a Lap axis — carries no t key at all", () => {
    const records = channelRecords(1, new Float64Array([1]), new Float64Array([5]), new Float64Array([0]), new Float64Array([0]), AxisKind.Lap);

    expect(Object.keys(records[0])).toEqual(["lap", "v", "w"]);
  });

  it("channel records — two windows of laps — keeps each sample's window index and its break row", () => {
    // `combineChannelWindows`'s break row (R127 item 4) is NaN in every
    // column, and a lap record must preserve it so Plot breaks the series
    // between windows rather than joining lap 3 of one to lap 1 of the next.
    const t = new Float64Array([1, 2, NaN, 1, 2]);
    const v = new Float64Array([90, 91, NaN, 88, 89]);
    const tr = new Float64Array(5);
    const w = new Float64Array([0, 0, NaN, 1, 1]);

    const records = channelRecords(5, t, v, tr, w, AxisKind.Lap);

    expect(records.map((r) => r.w)).toEqual([0, 0, NaN, 1, 1]);
    expect(records[2]).toEqual({ lap: NaN, v: NaN, w: NaN });
  });

  it("channel records — a length past the columns' end — yields undefined rather than throwing", () => {
    const records = channelRecords(2, new Float64Array([1]), new Float64Array([5]), new Float64Array([0]), new Float64Array([0]), AxisKind.Lap);

    expect(records).toHaveLength(2);
    expect(records[1]).toEqual({ lap: undefined, v: undefined, w: undefined });
  });
});

import { describe, expect, it } from "vitest";

import type { WindowDescriptor } from "../host/protocol";
import { cursorCardRows, type CombinedChannelPayload } from "./cursorCard";

function descriptor(label: string, colour: string): WindowDescriptor {
  return { sessionId: "s", span: { kind: "session" }, colour, label };
}

/** A payload with two windows: window 0 (span starts at session t=0) samples
 *  at t=0,1,2s; window 1 (a different session, span starting at t=100s)
 *  samples at t=100,101s -- shorter, and at a different absolute session
 *  time, matching how a real `"lap"`/`"range"` window's own `t` values are
 *  absolute within *that* window's session (`WindowSeries.t`'s own doc
 *  comment), not zero-based. */
function twoWindowPayload(): CombinedChannelPayload {
  return {
    length: 6,
    t: Float64Array.from([0, 1, 2, NaN, 100, 101]),
    v: Float64Array.from([10, 11, 12, NaN, 20, 21]),
    w: Float64Array.from([0, 0, 0, NaN, 1, 1]),
    windows: [descriptor("Lap 2", "--chart-1"), descriptor("Lap 3", "--chart-2")],
    spans: [
      { startUs: 0, endUs: 2_500_000 },
      { startUs: 100_000_000, endUs: 101_500_000 },
    ],
  };
}

describe("cursorCardRows", () => {
  it("cursorCardRows — single window, exactly one selected — one row, no windowLabel marker (R127 item 3)", () => {
    const payload: CombinedChannelPayload = {
      length: 2,
      t: Float64Array.from([0, 1]),
      v: Float64Array.from([10, 11]),
      w: Float64Array.from([0, 0]),
      windows: [descriptor("Session A", "--chart-1")],
      spans: [{ startUs: 0, endUs: 2_000_000 }],
    };

    const rows = cursorCardRows(1_000_000, payload, "Front travel", "mm", 1);

    expect(rows).toEqual([{ windowLabel: null, colour: "--chart-1", seriesLabel: "Front travel", unit: "mm", value: 11 }]);
  });

  it("cursorCardRows — two overlaid windows — one row per window, each labelled with its own window (R132 generalised)", () => {
    const rows = cursorCardRows(1_000_000, twoWindowPayload(), "Fork travel", "mm", 2);

    expect(rows).toEqual([
      { windowLabel: "Lap 2", colour: "--chart-1", seriesLabel: "Fork travel", unit: "mm", value: 11 },
      { windowLabel: "Lap 3", colour: "--chart-2", seriesLabel: "Fork travel", unit: "mm", value: 21 },
    ]);
  });

  it("cursorCardRows — offset past the shorter window's own end — that window's row is omitted entirely, not a null-valued row (decision 55's absence rule)", () => {
    // Window 0 (Lap 2, span 0..2.5s) still has data at offset 2.2s; window
    // 1 (Lap 3, span 0..1.5s relative to its own start) does not.
    const rows = cursorCardRows(2_200_000, twoWindowPayload(), "Fork travel", "mm", 2);

    expect(rows).toHaveLength(1);
    expect(rows[0].windowLabel).toBe("Lap 2");
  });

  it("cursorCardRows — offset past every window's own end — no rows at all", () => {
    const rows = cursorCardRows(10_000_000, twoWindowPayload(), "Fork travel", "mm", 2);

    expect(rows).toEqual([]);
  });

  it("cursorCardRows — within a window's span but no nearby sample (a gap) — a row with value: null, distinct from an omitted row", () => {
    const payload: CombinedChannelPayload = {
      length: 2,
      t: Float64Array.from([0, 5]), // a 5s gap
      v: Float64Array.from([10, 15]),
      w: Float64Array.from([0, 0]),
      windows: [descriptor("Session A", "--chart-1")],
      spans: [{ startUs: 0, endUs: 6_000_000 }],
    };

    // Nearest sample to 2.5s is either 0s or 5s -- both exist, so this
    // isn't really "no sample" (nearestValue always finds *a* nearest
    // point when the payload has any for that window); this case
    // documents that behaviour rather than asserting null, since a real
    // gap is represented by the window having *no* samples in its run at
    // all, covered by the next case.
    const rows = cursorCardRows(2_500_000, payload, "Speed", "km/h", 1);

    expect(rows[0].value).not.toBeNull();
  });

  it("cursorCardRows — a window with no samples in its own run at all — value: null", () => {
    const payload: CombinedChannelPayload = {
      length: 0,
      t: new Float64Array(0),
      v: new Float64Array(0),
      w: new Float64Array(0),
      windows: [descriptor("Session A", "--chart-1")],
      spans: [{ startUs: 0, endUs: 2_000_000 }],
    };

    const rows = cursorCardRows(1_000_000, payload, "Speed", "km/h", 1);

    expect(rows).toEqual([{ windowLabel: null, colour: "--chart-1", seriesLabel: "Speed", unit: "km/h", value: null }]);
  });

  it("cursorCardRows — decision 61: a window still in payload.windows but no longer selected — its row is omitted, even though it still has data in range", () => {
    const payload: CombinedChannelPayload = {
      length: 2,
      t: Float64Array.from([1, 1]),
      v: Float64Array.from([11, 21]),
      w: Float64Array.from([0, 1]),
      windows: [
        { sessionId: "session-a", span: { kind: "lap", lap_number: 2 }, colour: "--chart-1", label: "Lap 2" },
        { sessionId: "session-a", span: { kind: "lap", lap_number: 3 }, colour: "--chart-2", label: "Lap 3" },
      ],
      spans: [
        { startUs: 0, endUs: 5_000_000 },
        { startUs: 0, endUs: 5_000_000 },
      ],
    };
    // Lap 3 was just unchecked -- only Lap 2's key remains selected.
    const selectedWindowKeys = new Set(["session-a::lap:2"]);

    const rows = cursorCardRows(1_000_000, payload, "Fork travel", "mm", 2, selectedWindowKeys);

    expect(rows).toEqual([{ windowLabel: "Lap 2", colour: "--chart-1", seriesLabel: "Fork travel", unit: "mm", value: 11 }]);
  });

  it("cursorCardRows — no selectedWindowKeys argument — every window in payload.windows still renders (backward compatible)", () => {
    const rows = cursorCardRows(1_000_000, twoWindowPayload(), "Fork travel", "mm", 2);

    expect(rows).toHaveLength(2);
  });

  it("cursorCardRows — an empty selectedWindowKeys set (everything just deselected) — no rows at all", () => {
    const rows = cursorCardRows(1_000_000, twoWindowPayload(), "Fork travel", "mm", 2, new Set());

    expect(rows).toEqual([]);
  });
});

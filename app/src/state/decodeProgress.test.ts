import { describe, expect, it } from "vitest";

import type { DecodeProgressEvent } from "../ipc/decode_progress";
import {
  applyDecodeProgress,
  cellDecodeFraction,
  decodeKey,
  decodeSummary,
  describeDecodeSummary,
  NO_DECODES,
  type DecodeProgressState,
} from "./decodeProgress";

/** One `decode_progress` payload, defaults overridden per test. */
function event(over: Partial<DecodeProgressEvent> = {}): DecodeProgressEvent {
  return { session_id: "s1", channel: "IMU0_AccelX", done_rows: 100, total_rows: 1000, finished: false, ...over };
}

/** Folds `events` in from empty. */
function fold(...events: DecodeProgressEvent[]): DecodeProgressState {
  return events.reduce(applyDecodeProgress, NO_DECODES);
}

describe("applyDecodeProgress", () => {
  it("a first observation — nothing tracked yet — the channel appears with its counts", () => {
    const state = fold(event());

    expect(state.size).toBe(1);
    expect(state.get(decodeKey("s1", "IMU0_AccelX"))).toEqual({
      sessionId: "s1",
      channel: "IMU0_AccelX",
      doneRows: 100,
      totalRows: 1000,
      finished: false,
    });
  });

  it("a second observation of the same channel — later counts — replaces rather than adds", () => {
    const state = fold(event(), event({ done_rows: 400 }));

    expect(state.size).toBe(1);
    expect(state.get(decodeKey("s1", "IMU0_AccelX"))?.doneRows).toBe(400);
  });

  it("the same channel of two sessions — both decoding — is tracked as two decodes", () => {
    const state = fold(event(), event({ session_id: "s2" }));

    expect(state.size).toBe(2);
  });

  it("the last running decode finishes — nothing left in flight — the state empties", () => {
    const state = fold(event(), event({ done_rows: 1000, finished: true }));

    expect(state.size).toBe(0);
    expect(decodeSummary(state)).toBeNull();
  });

  it("one of two decodes finishes — the other still running — the finished one is kept and counted", () => {
    const state = fold(event(), event({ channel: "GPS_SpeedKmh" }), event({ done_rows: 1000, finished: true }));

    expect(state.size).toBe(2);
    expect(decodeSummary(state)?.channelsDone).toBe(1);
    expect(decodeSummary(state)?.channelsTotal).toBe(2);
  });

  it("an event with no rows to decode — a total of zero — is ignored rather than stored", () => {
    const state = fold(event({ total_rows: 0 }));

    expect(state).toBe(NO_DECODES);
  });

  it("an observation past its own total — a miscount — is clamped rather than rendered over 100 %", () => {
    const state = fold(event({ done_rows: 5000, total_rows: 1000 }));

    expect(state.get(decodeKey("s1", "IMU0_AccelX"))?.doneRows).toBe(1000);
  });

  it("a fold — several events — never mutates the state it was handed", () => {
    const first = fold(event());

    const second = applyDecodeProgress(first, event({ done_rows: 900 }));

    expect(first.get(decodeKey("s1", "IMU0_AccelX"))?.doneRows).toBe(100);
    expect(second).not.toBe(first);
  });
});

describe("cellDecodeFraction", () => {
  it("a cell whose channels are all resident — none being reported — has no fraction at all", () => {
    const state = fold(event());

    expect(cellDecodeFraction(state, [decodeKey("s1", "Speed")])).toBeNull();
  });

  it("a cell with two channels of very different lengths — one done — is weighted by rows, not by channel", () => {
    const state = fold(
      event({ channel: "IMU0_AccelX", done_rows: 0, total_rows: 1_000_000 }),
      event({ channel: "GPS_SpeedKmh", done_rows: 9_000, total_rows: 9_000, finished: true }),
    );

    const fraction = cellDecodeFraction(state, [decodeKey("s1", "IMU0_AccelX"), decodeKey("s1", "GPS_SpeedKmh")]);

    expect(fraction).toBeCloseTo(9_000 / 1_009_000, 6);
  });

  it("a cell's own channels only — another cell's decode running too — ignores what it did not bind", () => {
    const state = fold(event({ channel: "A", done_rows: 500, total_rows: 1000 }), event({ channel: "B", done_rows: 0, total_rows: 1000 }));

    expect(cellDecodeFraction(state, [decodeKey("s1", "A")])).toBe(0.5);
  });
});

describe("decodeSummary / describeDecodeSummary", () => {
  it("nothing decoding — the empty state — has no summary, so the chip is absent rather than zeroed", () => {
    expect(decodeSummary(NO_DECODES)).toBeNull();
  });

  it("a burst part-way through — three of nine finished — reads as the chip's own sentence", () => {
    // Nine channels start decoding, then three of them land — the order a
    // notebook full of cells actually produces. Finishing the first three
    // before the rest had started would empty the burst, which is its own
    // test above.
    let state: DecodeProgressState = NO_DECODES;
    for (let i = 0; i < 9; i += 1) {
      state = applyDecodeProgress(state, event({ channel: `c${i}`, done_rows: 100, total_rows: 1000 }));
    }
    for (let i = 0; i < 3; i += 1) {
      state = applyDecodeProgress(state, event({ channel: `c${i}`, done_rows: 1000, total_rows: 1000, finished: true }));
    }

    const summary = decodeSummary(state);

    expect(summary).toEqual({ channelsDone: 3, channelsTotal: 9, fraction: (3 * 1000 + 6 * 100) / 9000 });
    expect(describeDecodeSummary(summary!)).toBe("Loading session · 3 of 9 channels · 40 %");
  });

  it("a decode one row short of done — 99.9 % — floors rather than rounding to a finished-looking 100", () => {
    const summary = { channelsDone: 0, channelsTotal: 1, fraction: 999 / 1000 };

    expect(describeDecodeSummary(summary)).toBe("Loading session · 0 of 1 channels · 99 %");
  });
});

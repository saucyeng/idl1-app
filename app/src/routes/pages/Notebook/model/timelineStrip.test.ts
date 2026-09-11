import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { SelectionWindow } from "../../../../state/selection";
import {
  MIN_RANGE_US,
  bracketForLane,
  dragCandidate,
  handlePositionsFor,
  hitTestHandle,
  lanePixelX,
  pxForTimeUs,
  stripLanesFor,
  timeUsForPx,
  timelineCommit,
  type StripLane,
} from "./timelineStrip";

function detailWithLaps(laps: Array<{ lap_number: number; start_time_secs: number; end_time_secs: number }>): SessionDetail {
  return {
    session_id: "s",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "0".repeat(64),
    channels: [],
    rider: "",
    bike: "",
    bike_comment: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    long_comment: "",
    tag: "",
    bike_profile_snapshot: null,
    laps: laps.map((l) => ({ ...l, sectors: [], neutral_zone_visits: [], start_timestamp_ms: 0, end_timestamp_ms: 0, raw_elapsed_ms: 0, lap_time_ms: 0 })),
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
    main_lap_number: null,
    overlay_lap_key: null,
    starred_lap_number: null,
    track_visits_library_hash: null,
  };
}

const SESSION_WINDOW: SelectionWindow = { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" };
const LAP_WINDOW: SelectionWindow = { sessionId: "s2", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-2" };

describe("lanePixelX", () => {
  it("lanePixelX — a pointer on the lane's own left edge — is zero, the origin the handle positions are measured from", () => {
    const clientX = 120;

    const x = lanePixelX(clientX, 120);

    expect(x).toBe(0);
  });

  it("lanePixelX — the padded container's left instead of the lane's — is the R221 bug: a pointer on a handle tests a padding's width away from it", () => {
    // Arrange — a lane whose start handle sits at lane px 0, inside a
    // container padded by `px-2` (8 CSS px), so the lane element starts 8 px
    // right of the container. The hit tolerance is 6 px.
    const lane: StripLane = { key: "k", windowIndex: 0, colour: "--chart-1", sessionSpanUs: 10_000_000, windowSpan: { startUs: 0, endUs: 10_000_000 } };
    const containerLeftPx = 100;
    const laneLeftPx = containerLeftPx + 8;
    const pointerOnTheStartHandle = laneLeftPx;

    // Act
    const correct = lanePixelX(pointerOnTheStartHandle, laneLeftPx);
    const wrong = lanePixelX(pointerOnTheStartHandle, containerLeftPx);

    // Assert — measured from the lane the handle is hit; measured from the
    // padded container it is 8 px away, past the 6 px tolerance, and no
    // drag ever starts.
    expect(hitTestHandle(lane, 600, correct, 6)).toBe("start");
    expect(hitTestHandle(lane, 600, wrong, 6)).toBeNull();
  });
});

describe("stripLanesFor", () => {
  it("stripLanesFor — a resolved session window — one lane, background span equals the session's own recorded duration", () => {
    const detailsByWindow = new Map([["s1::session", detailWithLaps([])]]);
    const spanUsByWindow = new Map([["s1::session", 10_000_000]]);

    const lanes = stripLanesFor([SESSION_WINDOW], detailsByWindow, spanUsByWindow);

    expect(lanes).toEqual([{ key: "s1::session", windowIndex: 0, colour: "--chart-1", sessionSpanUs: 10_000_000, windowSpan: { startUs: 0, endUs: 10_000_000 } }]);
  });

  it("stripLanesFor — a lap window — the lane's background is the whole session, not the lap's own duration", () => {
    const detailsByWindow = new Map([["s2::lap:2", detailWithLaps([{ lap_number: 2, start_time_secs: 30, end_time_secs: 70 }])]]);
    const spanUsByWindow = new Map([["s2::lap:2", 10_000_000]]);

    const lanes = stripLanesFor([LAP_WINDOW], detailsByWindow, spanUsByWindow);

    expect(lanes[0].sessionSpanUs).toBe(10_000_000);
    expect(lanes[0].windowSpan).toEqual({ startUs: 30_000_000, endUs: 70_000_000 });
  });

  it("stripLanesFor — window session span unresolved — excluded, not treated as whole session", () => {
    const detailsByWindow = new Map([["s1::session", detailWithLaps([])]]);
    const spanUsByWindow = new Map<string, number | null>([["s1::session", null]]);

    const lanes = stripLanesFor([SESSION_WINDOW], detailsByWindow, spanUsByWindow);

    expect(lanes).toEqual([]);
  });

  it("stripLanesFor — two windows, one resolved and one not — only the resolved one gets a lane, preserving its own windowIndex", () => {
    const detailsByWindow = new Map([
      ["s1::session", detailWithLaps([])],
      ["s2::lap:2", null],
    ]);
    const spanUsByWindow = new Map<string, number | null>([
      ["s1::session", 10_000_000],
      ["s2::lap:2", null],
    ]);

    const lanes = stripLanesFor([SESSION_WINDOW, LAP_WINDOW], detailsByWindow, spanUsByWindow);

    expect(lanes).toHaveLength(1);
    expect(lanes[0].windowIndex).toBe(0);
  });
});

describe("pxForTimeUs / timeUsForPx", () => {
  it("pxForTimeUs — the midpoint of the session — the midpoint of the strip", () => {
    expect(pxForTimeUs(5_000_000, 10_000_000, 200)).toBe(100);
  });

  it("pxForTimeUs — a time past the session's own end — clamped to the strip's right edge", () => {
    expect(pxForTimeUs(20_000_000, 10_000_000, 200)).toBe(200);
  });

  it("pxForTimeUs — a negative time — clamped to the strip's left edge", () => {
    expect(pxForTimeUs(-1, 10_000_000, 200)).toBe(0);
  });

  it("timeUsForPx — the strip's right edge — the session's own end", () => {
    expect(timeUsForPx(200, 10_000_000, 200)).toBe(10_000_000);
  });

  it("timeUsForPx / pxForTimeUs — round-trip through the middle of the strip", () => {
    const tUs = timeUsForPx(150, 10_000_000, 200);
    expect(pxForTimeUs(tUs, 10_000_000, 200)).toBe(150);
  });
});

function laneOf(windowSpan: { startUs: number; endUs: number } | null, sessionSpanUs = 10_000_000): StripLane {
  return { key: "k", windowIndex: 0, colour: "--chart-1", sessionSpanUs, windowSpan };
}

describe("handlePositionsFor / hitTestHandle", () => {
  it("handlePositionsFor — a lap window's own span — handles sit at the lap's own bounds, not the strip's edges", () => {
    const lane = laneOf({ startUs: 3_000_000, endUs: 7_000_000 });

    expect(handlePositionsFor(lane, 200)).toEqual({ startPx: 60, endPx: 140 });
  });

  it("handlePositionsFor — an unresolved window span — null, not a guessed placeholder", () => {
    expect(handlePositionsFor(laneOf(null), 200)).toBeNull();
  });

  it("hitTestHandle — a pixel within tolerance of the start handle — 'start'", () => {
    const lane = laneOf({ startUs: 3_000_000, endUs: 7_000_000 });

    expect(hitTestHandle(lane, 200, 61, 4)).toBe("start");
  });

  it("hitTestHandle — a pixel within tolerance of the end handle — 'end'", () => {
    const lane = laneOf({ startUs: 3_000_000, endUs: 7_000_000 });

    expect(hitTestHandle(lane, 200, 138, 4)).toBe("end");
  });

  it("hitTestHandle — a pixel far from both handles — null", () => {
    const lane = laneOf({ startUs: 3_000_000, endUs: 7_000_000 });

    expect(hitTestHandle(lane, 200, 100, 4)).toBeNull();
  });
});

describe("dragCandidate", () => {
  it("dragCandidate — dragging the start handle inward — narrows startUs, leaves endUs untouched", () => {
    const lane = laneOf({ startUs: 2_000_000, endUs: 8_000_000 });

    const candidate = dragCandidate(lane, 200, "start", 80); // 80/200 * 10e6 = 4_000_000

    expect(candidate).toEqual({ startUs: 4_000_000, endUs: 8_000_000 });
  });

  it("dragCandidate — dragging the end handle past the session's own end — clamped to sessionSpanUs", () => {
    const lane = laneOf({ startUs: 2_000_000, endUs: 8_000_000 });

    const candidate = dragCandidate(lane, 200, "end", 500);

    expect(candidate).toEqual({ startUs: 2_000_000, endUs: 10_000_000 });
  });

  it("dragCandidate — dragging a handle past the other handle — clamped to MIN_RANGE_US, never inverted (R120)", () => {
    const lane = laneOf({ startUs: 2_000_000, endUs: 8_000_000 });

    const candidate = dragCandidate(lane, 200, "start", 200); // would-be startUs = 10_000_000, past endUs

    expect(candidate).not.toBeNull();
    expect(candidate!.startUs).toBeLessThan(candidate!.endUs);
    expect(candidate!.endUs - candidate!.startUs).toBeGreaterThanOrEqual(MIN_RANGE_US);
  });

  it("dragCandidate — an unresolved window span — null, nothing to drag", () => {
    expect(dragCandidate(laneOf(null), 200, "start", 50)).toBeNull();
  });
});

describe("timelineCommit", () => {
  it("timelineCommit — a session window's boundary is dragged — becomes a range window, sessionId/colour unchanged", () => {
    const windows = [SESSION_WINDOW];

    const next = timelineCommit(windows, 0, { startUs: 1_000_000, endUs: 5_000_000 });

    expect(next).toEqual([{ sessionId: "s1", colour: "--chart-1", span: { kind: "range", t0Us: 1_000_000, t1Us: 5_000_000 } }]);
  });

  it("timelineCommit — a lap window's boundary is dragged — converts the span from 'lap' to 'range' (R134 item 3)", () => {
    const windows = [LAP_WINDOW];

    const next = timelineCommit(windows, 0, { startUs: 30_000_000, endUs: 60_000_000 });

    expect(next[0].span.kind).toBe("range");
  });

  it("timelineCommit — a second, unrelated window in the selection — left unchanged", () => {
    const windows = [SESSION_WINDOW, LAP_WINDOW];

    const next = timelineCommit(windows, 0, { startUs: 1_000_000, endUs: 5_000_000 });

    expect(next[1]).toBe(LAP_WINDOW);
  });
});

describe("bracketForLane", () => {
  it("bracketForLane — the primary window's own viewport — bracket sits exactly where the viewport says (single-window identity)", () => {
    const lane = laneOf({ startUs: 0, endUs: 10_000_000 });
    const viewport = { startUs: 2_000_000, endUs: 6_000_000 };

    const bracket = bracketForLane(lane, 200, viewport, 0);

    expect(bracket).toEqual({ startPx: 40, endPx: 120 });
  });

  it("bracketForLane — a sibling lap window shorter than the viewport — bracket clamps to that lap's own end, never past it", () => {
    // Primary window starts at 0; this lane's own window is a lap running
    // 30_000_000..40_000_000 (10s), and the shared viewport, re-based from
    // the primary's own start, requests 0..8_000_000 (8s) of elapsed time --
    // longer than this lap.
    const lane = laneOf({ startUs: 30_000_000, endUs: 40_000_000 }, 60_000_000);
    const viewport = { startUs: 0, endUs: 8_000_000 };

    const bracket = bracketForLane(lane, 200, viewport, 0);

    // Mapped span is [30_000_000, 38_000_000) out of a 60s background.
    expect(bracket).toEqual({ startPx: 100, endPx: pxForTimeUs(38_000_000, 60_000_000, 200) });
  });

  it("bracketForLane — an unresolved window span — null", () => {
    expect(bracketForLane(laneOf(null), 200, { startUs: 0, endUs: 1 }, 0)).toBeNull();
  });
});

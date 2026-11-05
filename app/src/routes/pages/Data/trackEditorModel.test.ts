import { describe, expect, it } from "vitest";

import type { Gate, GpsFix, TrackDetail } from "../../../ipc/catalog";
import {
  formatRunDuration,
  formatSessionTime,
  initialEditorState,
  lapTimingOf,
  nextSectorName,
  saveBlocker,
  toTrackDraft,
  trackEditorReducer,
  type TrackEditorState,
} from "./trackEditorModel";

const gateA: Gate = { lat1: 42.1, lon1: -76.1, lat2: 42.1001, lon2: -76.1001 };
const gateB: Gate = { lat1: 42.2, lon1: -76.2, lat2: 42.2001, lon2: -76.2001 };
const line: GpsFix[] = [
  { timestamp_ms: 1, lat: 42.1, lon: -76.1 },
  { timestamp_ms: 2, lat: 42.2, lon: -76.2 },
];

function track(over: Partial<TrackDetail> = {}): TrackDetail {
  return {
    track_id: "t-1",
    name: "Fork Lift",
    venue_name: "Beacon",
    created_at_ms: 1,
    updated_at_ms: 2,
    lap_timing: { kind: "point_to_point", start: gateA, finish: gateB },
    neutral_zones: [],
    sector_gates: [],
    reference_polyline: [{ timestamp_ms: 0, lat: 1, lon: 1 }],
    ...over,
  };
}

/** Places `target` with two clicks at `a` then `b`. */
function place(state: TrackEditorState, target: Parameters<typeof trackEditorReducer>[1] & { type: "PLACE" }, a: [number, number], b: [number, number]) {
  let s = trackEditorReducer(state, target);
  s = trackEditorReducer(s, { type: "MAP_CLICK", at: { lat: a[0], lon: a[1] } });
  return trackEditorReducer(s, { type: "MAP_CLICK", at: { lat: b[0], lon: b[1] } });
}

describe("trackEditorReducer", () => {
  it("placing a start — two clicks — a gate between them and placement over", () => {
    // Arrange
    const empty = initialEditorState(null);

    // Act
    const once = trackEditorReducer(trackEditorReducer(empty, { type: "PLACE", target: { kind: "start" } }), {
      type: "MAP_CLICK",
      at: { lat: 1, lon: 2 },
    });
    const twice = trackEditorReducer(once, { type: "MAP_CLICK", at: { lat: 3, lon: 4 } });

    // Assert
    expect(once.start).toBeNull();
    expect(once.placing?.first).toEqual({ lat: 1, lon: 2 });
    expect(twice.start).toEqual({ lat1: 1, lon1: 2, lat2: 3, lon2: 4 });
    expect(twice.placing).toBeNull();
  });

  it("map click — nothing being placed — state unchanged", () => {
    // Arrange
    const s = initialEditorState(track());

    // Act
    const after = trackEditorReducer(s, { type: "MAP_CLICK", at: { lat: 9, lon: 9 } });

    // Assert
    expect(after).toBe(s);
  });

  it("new sectors — added in order — named S1, S2", () => {
    // Act
    let s = place(initialEditorState(null), { type: "PLACE", target: { kind: "new-sector" } }, [1, 1], [2, 2]);
    s = place(s, { type: "PLACE", target: { kind: "new-sector" } }, [3, 3], [4, 4]);

    // Assert
    expect(s.sectors.map((x) => x.name)).toEqual(["S1", "S2"]);
  });

  it("re-placing a sector — keeps its name, moves its gate", () => {
    // Arrange
    const s = place(initialEditorState(null), { type: "PLACE", target: { kind: "new-sector" } }, [1, 1], [2, 2]);

    // Act
    const moved = place(s, { type: "PLACE", target: { kind: "sector", index: 0 } }, [5, 5], [6, 6]);

    // Assert
    expect(moved.sectors).toEqual([{ name: "S1", gate: { lat1: 5, lon1: 5, lat2: 6, lon2: 6 } }]);
  });

  it("delete finish — point-to-point track — becomes a circuit on its start", () => {
    // Arrange
    const s = initialEditorState(track());

    // Act
    const after = trackEditorReducer(s, { type: "DELETE", target: { kind: "finish" } });

    // Assert
    expect(lapTimingOf(after)).toEqual({ kind: "circuit", start_finish: gateA });
  });

  it("cancel placing — half-placed gate — nothing placed", () => {
    // Arrange
    const s = trackEditorReducer(trackEditorReducer(initialEditorState(null), { type: "PLACE", target: { kind: "start" } }), {
      type: "MAP_CLICK",
      at: { lat: 1, lon: 1 },
    });

    // Act
    const after = trackEditorReducer(s, { type: "CANCEL_PLACING" });

    // Assert
    expect(after.placing).toBeNull();
    expect(after.start).toBeNull();
  });
});

describe("nextSectorName", () => {
  it("nextSectorName — S1 and S3 left after a delete — S4, never a reused name", () => {
    expect(nextSectorName([{ name: "S1", gate: gateA }, { name: "S3", gate: gateB }])).toBe("S4");
  });
});

describe("lapTimingOf", () => {
  it("lapTimingOf — finish without a start — no timing", () => {
    expect(lapTimingOf({ start: null, finish: gateB })).toBeNull();
  });

  it("lapTimingOf — start and finish — point-to-point", () => {
    expect(lapTimingOf({ start: gateA, finish: gateB })).toEqual({ kind: "point_to_point", start: gateA, finish: gateB });
  });
});

describe("saveBlocker", () => {
  it("saveBlocker — no name — asks for one first", () => {
    expect(saveBlocker({ ...initialEditorState(track()), name: "  " }, 1)).toBe("Name the track.");
  });

  it("saveBlocker — gates that catch no run on the ride — blocked", () => {
    expect(saveBlocker(initialEditorState(track()), 0)).toMatch(/no run/);
  });

  it("saveBlocker — no session to check against — allowed", () => {
    expect(saveBlocker(initialEditorState(track()), null)).toBeNull();
  });
});

describe("toTrackDraft", () => {
  it("toTrackDraft — new track — takes the preview's line and trims the name", () => {
    // Arrange
    const s = { ...place(initialEditorState(null), { type: "PLACE", target: { kind: "start" } }, [1, 1], [2, 2]), name: " Fork Lift " };

    // Act
    const draft = toTrackDraft(s, null, line);

    // Assert
    expect(draft.track_id).toBeNull();
    expect(draft.name).toBe("Fork Lift");
    expect(draft.reference_polyline).toEqual(line);
  });

  it("toTrackDraft — edit with the ends unmoved — keeps the track's own line", () => {
    // Arrange
    const base = track();
    const s = place(initialEditorState(base), { type: "PLACE", target: { kind: "new-sector" } }, [1, 1], [2, 2]);

    // Act
    const draft = toTrackDraft(s, base, line);

    // Assert
    expect(draft.track_id).toBe("t-1");
    expect(draft.reference_polyline).toEqual(base.reference_polyline);
    expect(draft.sector_gates).toHaveLength(1);
  });

  it("toTrackDraft — edit with the finish moved and a run caught — takes the new line", () => {
    // Arrange
    const base = track();
    const s = place(initialEditorState(base), { type: "PLACE", target: { kind: "finish" } }, [7, 7], [8, 8]);

    // Act
    const draft = toTrackDraft(s, base, line);

    // Assert
    expect(draft.reference_polyline).toEqual(line);
  });

  it("toTrackDraft — edit with the finish moved but no session — keeps the old line", () => {
    // Arrange
    const base = track();
    const s = place(initialEditorState(base), { type: "PLACE", target: { kind: "finish" } }, [7, 7], [8, 8]);

    // Act
    const draft = toTrackDraft(s, base, null);

    // Assert
    expect(draft.reference_polyline).toEqual(base.reference_polyline);
  });
});

describe("formatting", () => {
  it("formatRunDuration — 83.25 s — 1:23.3", () => {
    expect(formatRunDuration(83.25)).toBe("1:23.3");
  });

  it("formatSessionTime — 3599.6 s — 60:00", () => {
    expect(formatSessionTime(3599.6)).toBe("60:00");
  });
});

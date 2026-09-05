import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../../../ipc/catalog";
import type { Progress } from "../../../ipc/import";
import { importQueueReducer, initialImportQueueState, overallPercent, type ImportQueueState } from "./importQueue";

function withOneQueued(path = "C:/rides/one.idl0"): ImportQueueState {
  return importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path, importerId: null });
}

const sampleSession: SessionSummary = {
  session_id: "s1",
  blob_sha256: "a".repeat(64),
  source_format: "idl0",
  device_id: null,
  config_checksum: null,
  importer_version: "0.1.0",
  seam_correction_version: "v1",
  engine_version: "0.1.0",
  timestamp_utc_ms: 0,
  created_at_ms: 0,
  rider: "",
  bike: "",
  venue_name: "",
  event_name: "",
  event_session: "",
  short_comment: "",
  tag: "",
  lap_count: null,
  duration_ms: null,
};

describe("importQueueReducer", () => {
  it("importQueue — PROGRESS with total null — item shows a phase and a count, overallPercent is null", () => {
    let state = withOneQueued();
    state = importQueueReducer(state, { type: "START", index: 0 });

    const progress: Progress = { done: 12, total: null, phase: "reading" };
    state = importQueueReducer(state, { type: "PROGRESS", index: 0, progress });

    expect(state.items[0].phase).toBe("reading");
    expect(state.items[0].done).toBe(12);
    expect(overallPercent(state)).toBeNull();
  });

  it("importQueue — PROGRESS then SUCCEEDED — status done, session id recorded, progress no longer advances", () => {
    let state = withOneQueued();
    state = importQueueReducer(state, { type: "START", index: 0 });
    state = importQueueReducer(state, {
      type: "PROGRESS",
      index: 0,
      progress: { done: 5, total: 10, phase: "decoding" },
    });
    state = importQueueReducer(state, { type: "SUCCEEDED", index: 0, session: sampleSession });

    expect(state.items[0].status).toBe("done");
    expect(state.items[0].sessionId).toBe("s1");

    const afterFinish = importQueueReducer(state, {
      type: "PROGRESS",
      index: 0,
      progress: { done: 999, total: 10, phase: "indexing" },
    });

    expect(afterFinish.items[0].done).toBe(state.items[0].done);
    expect(afterFinish.items[0].phase).toBe(state.items[0].phase);
  });

  it("importQueue — FAILED with kind import_gpx_no_trackpoints — status failed, the kind's text is kept for display", () => {
    let state = withOneQueued("C:/rides/empty.gpx");
    state = importQueueReducer(state, { type: "START", index: 0 });
    state = importQueueReducer(state, {
      type: "FAILED",
      index: 0,
      error: { kind: "import_gpx_no_trackpoints", message: "no points" },
    });

    expect(state.items[0].status).toBe("failed");
    expect(state.items[0].error).toBe("This GPX file has no track points.");
  });

  it("importQueue — one file fails, another succeeds — the failure never cancels the other item", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b.idl0", importerId: null });

    state = importQueueReducer(state, { type: "START", index: 0 });
    state = importQueueReducer(state, {
      type: "FAILED",
      index: 0,
      error: { kind: "import_gpx_no_trackpoints", message: "no points" },
    });

    state = importQueueReducer(state, { type: "START", index: 1 });
    state = importQueueReducer(state, { type: "SUCCEEDED", index: 1, session: sampleSession });

    expect(state.items[0].status).toBe("failed");
    expect(state.items[1].status).toBe("done");
  });

  it("importQueue — PROGRESS for an item already done — ignored, no state change", () => {
    let state = withOneQueued();
    state = importQueueReducer(state, { type: "START", index: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", index: 0, session: sampleSession });
    const before = state.items[0];

    const after = importQueueReducer(state, {
      type: "PROGRESS",
      index: 0,
      progress: { done: 42, total: 100, phase: "reading" },
    });

    expect(after.items[0]).toEqual(before);
  });

  it("importQueue — DISMISS a failed item — removed; a running item — refused", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a.gpx", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b.idl0", importerId: null });
    state = importQueueReducer(state, { type: "START", index: 0 });
    state = importQueueReducer(state, {
      type: "FAILED",
      index: 0,
      error: { kind: "import_gpx_no_trackpoints", message: "no points" },
    });
    state = importQueueReducer(state, { type: "START", index: 1 });

    const dismissedFailed = importQueueReducer(state, { type: "DISMISS", index: 0 });
    expect(dismissedFailed.items.length).toBe(1);
    expect(dismissedFailed.items[0].path).toBe("b.idl0");

    const dismissRunning = importQueueReducer(state, { type: "DISMISS", index: 1 });
    expect(dismissRunning.items.length).toBe(2);
  });
});

describe("overallPercent", () => {
  it("overallPercent — three items, two done — reports progress across the queue, not per file", () => {
    let state = importQueueReducer(initialImportQueueState, { type: "ENQUEUE", path: "a", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "b", importerId: null });
    state = importQueueReducer(state, { type: "ENQUEUE", path: "c", importerId: null });

    state = importQueueReducer(state, { type: "START", index: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", index: 0, session: sampleSession });
    state = importQueueReducer(state, { type: "START", index: 1 });
    state = importQueueReducer(state, { type: "SUCCEEDED", index: 1, session: sampleSession });

    const percent = overallPercent(state);

    expect(percent).not.toBeNull();
    expect(percent as number).toBeGreaterThan(50);
    expect(percent as number).toBeLessThan(100);
  });
});

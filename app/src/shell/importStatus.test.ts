import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../ipc/catalog";
import type { ImportOutcome } from "../ipc/import";
import { importQueueReducer, initialImportQueueState, type ImportQueueState } from "../routes/pages/Data/importQueue";
import { DONE_CHIP_LINGER_MS, fileNameOf, importChip } from "./importStatus";

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

const sampleOutcome: ImportOutcome = { session: sampleSession, warnings: [] };

/** A queue holding `paths`, all still `"queued"`. */
function queued(paths: string[]): ImportQueueState {
  return paths.reduce<ImportQueueState>(
    (state, path) => importQueueReducer(state, { type: "ENQUEUE", path, importerId: null }),
    initialImportQueueState,
  );
}

describe("fileNameOf", () => {
  it("fileNameOf — a Windows path — returns the file's own name", () => {
    expect(fileNameOf("C:\\rides\\2026\\ride-03.idl0")).toBe("ride-03.idl0");
  });

  it("fileNameOf — a POSIX path — returns the file's own name", () => {
    expect(fileNameOf("/home/isaac/rides/ride-03.idl0")).toBe("ride-03.idl0");
  });

  it("fileNameOf — a bare name with no separator — returns it unchanged", () => {
    expect(fileNameOf("ride-03.idl0")).toBe("ride-03.idl0");
  });
});

describe("importChip", () => {
  it("importChip — an empty queue — no chip", () => {
    const chip = importChip(initialImportQueueState, null);

    expect(chip).toBeNull();
  });

  it("importChip — a running third file of three — counts the file in flight, not the ones finished", () => {
    let state = queued(["C:/r/a.idl0", "C:/r/b.idl0", "C:/r/c.idl0"]);
    state = importQueueReducer(state, { type: "START", id: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: 0, outcome: sampleOutcome });
    state = importQueueReducer(state, { type: "START", id: 1 });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: 1, outcome: sampleOutcome });
    state = importQueueReducer(state, { type: "START", id: 2 });

    const chip = importChip(state, null);

    expect(chip).toEqual({ text: "Importing 3 / 3 · c.idl0", fraction: null, tone: "running" });
  });

  it("importChip — a running file with a known total — carries that file's own fraction", () => {
    let state = queued(["C:/r/a.idl0"]);
    state = importQueueReducer(state, { type: "START", id: 0 });
    state = importQueueReducer(state, { type: "PROGRESS", id: 0, progress: { done: 25, total: 100, phase: "decoding" } });

    const chip = importChip(state, null);

    expect(chip?.fraction).toBe(0.25);
  });

  it("importChip — a drained queue within the linger window — reports the ok and failed counts", () => {
    let state = queued(["C:/r/a.idl0", "C:/r/b.idl0"]);
    state = importQueueReducer(state, { type: "START", id: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: 0, outcome: sampleOutcome });
    state = importQueueReducer(state, { type: "START", id: 1 });
    state = importQueueReducer(state, { type: "FAILED", id: 1, error: new Error("nope") });

    const chip = importChip(state, 1000);

    expect(chip).toEqual({ text: "Import done · 1 ok, 1 failed", fraction: null, tone: "failed" });
  });

  it("importChip — a drained queue with no failures — omits the failed count and reads as good", () => {
    let state = queued(["C:/r/a.idl0"]);
    state = importQueueReducer(state, { type: "START", id: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: 0, outcome: sampleOutcome });

    const chip = importChip(state, 0);

    expect(chip).toEqual({ text: "Import done · 1 ok", fraction: null, tone: "done" });
  });

  it("importChip — a drained queue past the linger window — no chip", () => {
    let state = queued(["C:/r/a.idl0"]);
    state = importQueueReducer(state, { type: "START", id: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: 0, outcome: sampleOutcome });

    const chip = importChip(state, DONE_CHIP_LINGER_MS);

    expect(chip).toBeNull();
  });

  it("importChip — a drained queue that never recorded a drain time — no chip", () => {
    let state = queued(["C:/r/a.idl0"]);
    state = importQueueReducer(state, { type: "START", id: 0 });
    state = importQueueReducer(state, { type: "SUCCEEDED", id: 0, outcome: sampleOutcome });

    const chip = importChip(state, null);

    expect(chip).toBeNull();
  });
});

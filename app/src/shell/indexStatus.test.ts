import { describe, expect, it } from "vitest";

import type { IndexProgressEvent } from "../ipc/index_job";
import { INDEX_DONE_CHIP_LINGER_MS, indexChip } from "./importStatus";

function progress(over: Partial<IndexProgressEvent> = {}): IndexProgressEvent {
  return { done: 11, total: 159, current_session_id: "2026-09-07_09-43-52", phase: "tracks", ...over };
}

describe("indexChip — a run in flight — names the session being worked on", () => {
  it("done 11 of 159 — reads 12 / 159 with that session's id", () => {
    const chip = indexChip(progress(), null);

    expect(chip).toEqual({
      text: "Indexing 12 / 159 · 2026-09-07_09-43-52",
      fraction: 11 / 159,
      tone: "running",
    });
  });
});

describe("indexChip — nothing observed yet — shows no chip", () => {
  it("null progress — returns null", () => {
    const chip = indexChip(null, null);

    expect(chip).toBeNull();
  });
});

describe("indexChip — a run with no sessions to consider — shows no chip", () => {
  it("total 0 — returns null rather than announcing an empty library", () => {
    const chip = indexChip(progress({ done: 0, total: 0, current_session_id: "" }), 0);

    expect(chip).toBeNull();
  });
});

describe("indexChip — the run has finished — says so, then expires", () => {
  it("done equals total — reads Index complete inside the linger window", () => {
    const finished = progress({ done: 159, total: 159, current_session_id: "", phase: "laps" });

    const chip = indexChip(finished, 1_000);

    expect(chip).toEqual({ text: "Index complete", fraction: null, tone: "done" });
  });

  it("done equals total past the linger window — returns null", () => {
    const finished = progress({ done: 159, total: 159, current_session_id: "", phase: "laps" });

    const chip = indexChip(finished, INDEX_DONE_CHIP_LINGER_MS + 1);

    expect(chip).toBeNull();
  });

  it("done equals total with no finish time yet — returns null", () => {
    const finished = progress({ done: 159, total: 159, current_session_id: "", phase: "laps" });

    const chip = indexChip(finished, null);

    expect(chip).toBeNull();
  });
});

describe("indexChip — a run that could not start — says so instead of nothing", () => {
  it("an error with no progress at all — reads the failure, not an empty chip", () => {
    const chip = indexChip(null, null, { message: "cannot read <data>/tracks/" });

    expect(chip).toEqual({
      text: "Indexing failed · cannot read <data>/tracks/",
      fraction: null,
      tone: "failed",
    });
  });

  it("an error alongside a finished run past its linger window — the error still shows", () => {
    const finished = progress({ done: 3, total: 3, current_session_id: "", phase: "laps" });

    const chip = indexChip(finished, INDEX_DONE_CHIP_LINGER_MS + 1, { message: "catalog.sqlite is locked" });

    expect(chip?.tone).toBe("failed");
  });
});

describe("indexChip — the last session — never counts past the total", () => {
  it("done 158 of 159 — reads 159 / 159, not 160", () => {
    const chip = indexChip(progress({ done: 158 }), null);

    expect(chip?.text).toBe("Indexing 159 / 159 · 2026-09-07_09-43-52");
  });
});

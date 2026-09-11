import { describe, expect, it } from "vitest";

import { REBUILD_DONE_CHIP_LINGER_MS, rebuildChip } from "./importStatus";

describe("rebuildChip — a run in flight — names the phase and counts the entity being worked on", () => {
  it("rebuildChip with the sessions phase part-way through — reads \"Rebuilding catalog 13 / 159 · sessions\"", () => {
    const progress = { done: 12, total: 159, phase: "sessions" };

    const chip = rebuildChip(progress, null);

    expect(chip?.text).toBe("Rebuilding catalog 13 / 159 · sessions");
    expect(chip?.tone).toBe("running");
    expect(chip?.fraction).toBeCloseTo(12 / 159);
  });
});

describe("rebuildChip — a phase that ended but is not the run's end — still reads as running", () => {
  it("rebuildChip with blobs at done === total and no finish stamp — does not claim the rebuild is over", () => {
    const progress = { done: 159, total: 159, phase: "blobs" };

    const chip = rebuildChip(progress, null);

    expect(chip?.tone).toBe("running");
    expect(chip?.text).toContain("blobs");
  });
});

describe("rebuildChip — a finished run — says so, then expires", () => {
  it("rebuildChip with a finish stamp inside and outside the linger window — \"Catalog rebuilt\", then nothing", () => {
    const progress = { done: 3, total: 3, phase: "workbooks" };

    const fresh = rebuildChip(progress, 1_000);
    const stale = rebuildChip(progress, REBUILD_DONE_CHIP_LINGER_MS);

    expect(fresh).toEqual({ text: "Catalog rebuilt", fraction: null, tone: "done" });
    expect(stale).toBeNull();
  });
});

describe("rebuildChip — nothing has happened — shows no chip", () => {
  it("rebuildChip with no observation, and with an empty phase — null both times", () => {
    const none = rebuildChip(null, null);
    const empty = rebuildChip({ done: 0, total: 0, phase: "tracks" }, null);

    expect(none).toBeNull();
    expect(empty).toBeNull();
  });
});

describe("rebuildChip — a run that failed outright — reports it and never expires", () => {
  it("rebuildChip with a last_error and a long-expired finish stamp — still the failure text", () => {
    const error = { message: "cannot read <data>/blobs/" };

    const chip = rebuildChip(null, REBUILD_DONE_CHIP_LINGER_MS * 10, error);

    expect(chip?.tone).toBe("failed");
    expect(chip?.text).toContain("cannot read <data>/blobs/");
  });
});

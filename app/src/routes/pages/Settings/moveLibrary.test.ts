import { describe, expect, it, vi } from "vitest";

import {
  describeMove,
  describeMoveProgress,
  describeMoveResult,
  moveProgressFraction,
  movePhaseLabel,
  pickLibraryFolder,
} from "./moveLibrary";

describe("pickLibraryFolder", () => {
  it("pickLibraryFolder — a non-empty starting folder — seeds defaultPath and asks for a single directory", async () => {
    const openDialog = vi.fn().mockResolvedValue("E:\\new-library");

    const chosen = await pickLibraryFolder("  D:\\race-data  ", openDialog);

    expect(chosen).toBe("E:\\new-library");
    expect(openDialog).toHaveBeenCalledWith({ defaultPath: "D:\\race-data", directory: true, multiple: false });
  });

  it("pickLibraryFolder — a blank starting folder — omits defaultPath", async () => {
    const openDialog = vi.fn().mockResolvedValue(null);

    await pickLibraryFolder("   ", openDialog);

    expect(openDialog).toHaveBeenCalledWith({ defaultPath: undefined, directory: true, multiple: false });
  });

  it("pickLibraryFolder — the user cancels — resolves null rather than rejecting", async () => {
    const openDialog = vi.fn().mockResolvedValue(null);

    const chosen = await pickLibraryFolder("", openDialog);

    expect(chosen).toBeNull();
  });
});

describe("describeMove", () => {
  it("describeMove — a chosen destination — names both paths and says the old one is kept", () => {
    const text = describeMove("D:\\race-data\\data", "E:\\new-library");

    expect(text).toContain("D:\\race-data\\data");
    expect(text).toContain("E:\\new-library");
    expect(text).toContain("Nothing is deleted");
  });
});

describe("movePhaseLabel", () => {
  it("movePhaseLabel — the three contract phases — reads as plain English", () => {
    const labels = ["copy", "verify", "catalog"].map(movePhaseLabel);

    expect(labels).toEqual(["Copying files", "Verifying checksums", "Rebuilding the index"]);
  });

  it("movePhaseLabel — an unrecognised phase — falls through as itself", () => {
    const label = movePhaseLabel("reindex");

    expect(label).toBe("reindex");
  });
});

describe("describeMoveProgress", () => {
  it("describeMoveProgress — no tick yet — returns null", () => {
    const line = describeMoveProgress(null);

    expect(line).toBeNull();
  });

  it("describeMoveProgress — a copy tick — names the phase and the file counts", () => {
    const line = describeMoveProgress({ done: 12, total: 40, phase: "copy" });

    expect(line).toBe("Copying files: 12 of 40 files");
  });

  it("describeMoveProgress — an unknown or zero total — prints the phase alone", () => {
    const unknown = describeMoveProgress({ done: 0, total: null, phase: "verify" });
    const empty = describeMoveProgress({ done: 0, total: 0, phase: "catalog" });

    expect(unknown).toBe("Verifying checksums…");
    expect(empty).toBe("Rebuilding the index…");
  });
});

describe("moveProgressFraction", () => {
  it("moveProgressFraction — a partial copy — is done over total", () => {
    const fraction = moveProgressFraction({ done: 1, total: 4, phase: "copy" });

    expect(fraction).toBe(0.25);
  });

  it("moveProgressFraction — no tick, or a zero or unknown total — is null", () => {
    const results = [
      moveProgressFraction(null),
      moveProgressFraction({ done: 0, total: 0, phase: "copy" }),
      moveProgressFraction({ done: 3, total: null, phase: "copy" }),
    ];

    expect(results).toEqual([null, null, null]);
  });

  it("moveProgressFraction — a done that overshoots total — clamps to 1", () => {
    const fraction = moveProgressFraction({ done: 9, total: 4, phase: "copy" });

    expect(fraction).toBe(1);
  });
});

describe("describeMoveResult", () => {
  it("describeMoveResult — a finished move — names the new root and the old copy left behind", () => {
    const text = describeMoveResult("E:\\new-library", "D:\\race-data\\data");

    expect(text).toContain("E:\\new-library");
    expect(text).toContain("D:\\race-data\\data");
    expect(text).toContain("restart");
  });
});

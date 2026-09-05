import { describe, expect, it } from "vitest";

import type { DeviceFile } from "../../../ipc/device";
import { downloadReducer, formatTransferRate, initialFilesState, newCount, toFileViews } from "./files";

describe("toFileViews", () => {
  it("toFileViews — a device file whose session_id is already in the catalog — isNew false", () => {
    // Arrange
    const files: DeviceFile[] = [{ name: "2026-09-05_08-00-00.idl0", size_bytes: 1024, session_id: "sess-1" }];
    const knownSessionIds = new Set(["sess-1"]);

    // Act
    const views = toFileViews(files, knownSessionIds);

    // Assert
    expect(views[0].isNew).toBe(false);
  });

  it("toFileViews — a device file with session_id null — isNew true (the device has not assigned one; it cannot already be imported)", () => {
    // Arrange
    const files: DeviceFile[] = [{ name: "2026-09-05_09-00-00.idl0", size_bytes: 2048, session_id: null }];
    const knownSessionIds = new Set(["sess-1"]);

    // Act
    const views = toFileViews(files, knownSessionIds);

    // Assert
    expect(views[0].isNew).toBe(true);
  });
});

describe("newCount", () => {
  it("newCount — a mixed list — counts only the new ones", () => {
    // Arrange
    const files: DeviceFile[] = [
      { name: "a.idl0", size_bytes: 1, session_id: "sess-1" },
      { name: "b.idl0", size_bytes: 2, session_id: "sess-2" },
      { name: "c.idl0", size_bytes: 3, session_id: null },
    ];
    const views = toFileViews(files, new Set(["sess-1"]));

    // Act
    const count = newCount(views);

    // Assert
    expect(count).toBe(2);
  });
});

describe("downloadReducer", () => {
  it("downloadReducer — PROGRESS then SUCCEEDED — the DownloadResult's sha256 and path recorded, status done", () => {
    // Arrange
    const enqueued = downloadReducer(initialFilesState, { type: "ENQUEUE", name: "a.idl0" });
    const progressed = downloadReducer(enqueued, {
      type: "PROGRESS",
      name: "a.idl0",
      progress: { done: 512, total: 1024, phase: "downloading" },
    });

    // Act
    const succeeded = downloadReducer(progressed, {
      type: "SUCCEEDED",
      name: "a.idl0",
      result: { path: "/data/blobs/sha256/abc123", sha256: "abc123", size_bytes: 1024 },
    });

    // Assert
    const item = succeeded.queue.find((q) => q.name === "a.idl0");
    expect(item?.status).toBe("done");
    expect(item?.sha256).toBe("abc123");
    expect(item?.path).toBe("/data/blobs/sha256/abc123");
  });

  it("downloadReducer — FAILED with kind not_found — status failed, the other queued files untouched", () => {
    // Arrange
    let state = downloadReducer(initialFilesState, { type: "ENQUEUE", name: "a.idl0" });
    state = downloadReducer(state, { type: "ENQUEUE", name: "b.idl0" });
    state = downloadReducer(state, {
      type: "PROGRESS",
      name: "b.idl0",
      progress: { done: 100, total: 200, phase: "downloading" },
    });

    // Act
    const failed = downloadReducer(state, {
      type: "FAILED",
      name: "a.idl0",
      error: "The device or file couldn't be found. It may have moved or been removed.",
    });

    // Assert
    const a = failed.queue.find((q) => q.name === "a.idl0");
    const b = failed.queue.find((q) => q.name === "b.idl0");
    expect(a?.status).toBe("failed");
    expect(a?.error).toBe("The device or file couldn't be found. It may have moved or been removed.");
    expect(b?.status).toBe("downloading");
    expect(b?.doneBytes).toBe(100);
  });

  it("downloadReducer — PROGRESS with total null — a byte count shown, no percentage invented", () => {
    // Arrange
    const enqueued = downloadReducer(initialFilesState, { type: "ENQUEUE", name: "a.idl0" });

    // Act
    const progressed = downloadReducer(enqueued, {
      type: "PROGRESS",
      name: "a.idl0",
      progress: { done: 4096, total: null, phase: "downloading" },
    });

    // Assert
    const item = progressed.queue.find((q) => q.name === "a.idl0");
    expect(item?.doneBytes).toBe(4096);
    expect(item?.totalBytes).toBeNull();
  });
});

describe("formatTransferRate", () => {
  it("formatTransferRate — a byte count over an elapsed span — reads in KB/s; a zero elapsed span — reads \"—\", never Infinity", () => {
    // Arrange
    const doneBytes = 10240; // 10 KB
    const elapsedMs = 1000;

    // Act
    const rate = formatTransferRate(doneBytes, elapsedMs);
    const zeroRate = formatTransferRate(doneBytes, 0);

    // Assert
    expect(rate).toBe("10.0 KB/s");
    expect(zeroRate).toBe("—");
    expect(zeroRate).not.toContain("Infinity");
  });
});

import { describe, expect, it } from "vitest";

import type { DeviceFileView } from "./files";
import { autoStep, bannerView, initialNewSessionsState, newSessionsReducer } from "./newSessions";
import type { NewSessionsAction, NewSessionsState } from "./newSessions";

function file(name: string, sizeBytes: number, isNew: boolean): DeviceFileView {
  return { name, size_bytes: sizeBytes, session_id: null, isNew };
}

function run(actions: NewSessionsAction[], from: NewSessionsState = initialNewSessionsState): NewSessionsState {
  return actions.reduce(newSessionsReducer, from);
}

const CHECKED: NewSessionsAction[] = [
  { type: "CHECK_START" },
  { type: "CHECK_DONE", files: [file("a.idl0", 2_000_000, true), file("old.idl0", 9, false), file("b.idl0", 1_000_000, true)] },
];

describe("newSessionsReducer", () => {
  it("check — mixed files — only the new ones are queued, offering Download", () => {
    // Arrange / Act
    const state = run(CHECKED);

    // Assert
    expect(state).toEqual({ phase: "ready", files: [{ name: "a.idl0", sizeBytes: 2_000_000 }, { name: "b.idl0", sizeBytes: 1_000_000 }] });
    expect(bannerView(state)).toMatchObject({ text: "2 new sessions on the logger", detail: "3.0 MB", action: { kind: "download" } });
  });

  it("check — nothing new — up to date, dismissable", () => {
    // Arrange / Act
    const state = run([{ type: "CHECK_START" }, { type: "CHECK_DONE", files: [file("old.idl0", 9, false)] }]);

    // Assert
    expect(bannerView(state)).toMatchObject({ text: "Everything on the logger is in your library", action: { kind: "dismiss" } });
    expect(run([{ type: "DISMISS" }], state)).toEqual({ phase: "idle" });
  });

  it("transfer — first file half downloaded — progress over the whole batch", () => {
    // Arrange / Act
    const state = run([...CHECKED, { type: "TRANSFER_START" }, { type: "PROGRESS", progress: { done: 1_000_000, total: 2_000_000, phase: "download" } }]);

    // Assert
    const view = bannerView(state);
    expect(view.text).toBe("Downloading 1 of 2");
    expect(view.fraction).toBeCloseTo(1 / 3);
    expect(view.action).toBeNull();
  });

  it("transfer — both files imported — done, counts and warnings carried", () => {
    // Arrange / Act
    const state = run([
      ...CHECKED,
      { type: "TRANSFER_START" },
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: ["a.idl0 was truncated"] },
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: [] },
    ]);

    // Assert
    expect(state).toEqual({ phase: "done", imported: 2, failed: [], warnings: ["a.idl0 was truncated"] });
    expect(bannerView(state)).toMatchObject({ text: "2 sessions added to your library", tone: "warn" });
  });

  it("transfer — first file fails — the next still runs and the failure is named", () => {
    // Arrange / Act
    const state = run([
      ...CHECKED,
      { type: "TRANSFER_START" },
      { type: "FILE_FAILED", error: "WiFi dropped" },
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: [] },
    ]);

    // Assert
    expect(state).toEqual({ phase: "done", imported: 1, failed: [{ name: "a.idl0", error: "WiFi dropped" }], warnings: [] });
    expect(bannerView(state).detail).toBe("1 file failed: a.idl0 (WiFi dropped)");
  });

  it("check — listing fails — Retry with the reason", () => {
    // Arrange / Act
    const state = run([{ type: "CHECK_START" }, { type: "CHECK_FAILED", error: "logger not in range" }]);

    // Assert
    expect(bannerView(state)).toMatchObject({ text: "Couldn't check the logger", detail: "logger not in range", action: { kind: "retry" }, tone: "bad" });
  });

  it("check start — during a transfer — ignored", () => {
    // Arrange
    const transferring = run([...CHECKED, { type: "TRANSFER_START" }]);

    // Act
    const state = newSessionsReducer(transferring, { type: "CHECK_START" });

    // Assert
    expect(state).toBe(transferring);
  });
});

describe("autoStep", () => {
  it("autoStep — idle and not yet checked — checks", () => {
    // Arrange
    const state = initialNewSessionsState;

    // Act
    const step = autoStep(state, false, false);

    // Assert
    expect(step).toBe("check");
  });

  it("autoStep — new files found and no transfer yet — downloads", () => {
    // Arrange
    const state = run(CHECKED);

    // Act
    const step = autoStep(state, true, false);

    // Assert
    expect(step).toBe("download");
  });

  it("autoStep — already checked, already transferred, or nothing new — does nothing", () => {
    // Arrange
    const empty = run([{ type: "CHECK_START" }, { type: "CHECK_DONE", files: [file("old.idl0", 9, false)] }]);
    const failed = run([{ type: "CHECK_START" }, { type: "CHECK_FAILED", error: "no" }]);

    // Act
    const steps = [autoStep(initialNewSessionsState, true, false), autoStep(run(CHECKED), true, true), autoStep(empty, true, false), autoStep(failed, true, false)];

    // Assert
    expect(steps).toEqual([null, null, null, null]);
  });
});

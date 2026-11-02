import { describe, expect, it } from "vitest";

import type { DeviceFileView } from "./files";
import { STOPPED_NOTE, autoStep, bannerView, initialNewSessionsState, newSessionsReducer, pickFiles, rideWhen, unreportedNote } from "./newSessions";
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

/** Starts a batch of every new file `CHECKED` found. */
const START_ALL: NewSessionsAction = {
  type: "TRANSFER_START",
  files: [
    { name: "a.idl0", sizeBytes: 2_000_000 },
    { name: "b.idl0", sizeBytes: 1_000_000 },
  ],
};

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
    const state = run([...CHECKED, START_ALL, { type: "PROGRESS", progress: { done: 1_000_000, total: 2_000_000, phase: "download" } }]);

    // Assert
    const view = bannerView(state);
    expect(view.text).toBe("Downloading 1 of 2");
    expect(view.fraction).toBeCloseTo(1 / 3);
    expect(view.action).toEqual({ kind: "cancel", label: "Cancel" });
  });

  it("transfer — both files imported — done, counts and warnings carried", () => {
    // Arrange / Act
    const state = run([
      ...CHECKED,
      START_ALL,
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: ["a.idl0 was truncated"] },
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: [] },
    ]);

    // Assert
    expect(state).toEqual({ phase: "done", imported: 2, failed: [], warnings: ["a.idl0 was truncated"] });
    expect(bannerView(state)).toMatchObject({ text: "2 rides added · notes in the Data tab", tone: "warn" });
  });

  it("transfer — first file fails — the next still runs and the failure is named", () => {
    // Arrange / Act
    const state = run([
      ...CHECKED,
      START_ALL,
      { type: "FILE_FAILED", name: "a.idl0", error: "WiFi dropped", step: "download" },
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: [] },
    ]);

    // Assert
    expect(state).toEqual({ phase: "done", imported: 1, failed: [{ name: "a.idl0", error: "WiFi dropped", step: "download" }], warnings: [] });
    expect(bannerView(state).detail).toBe("1 file failed: a.idl0 (WiFi dropped)");
  });

  it("transfer — one file picked of six — counts and names only the picked file, then done", () => {
    // Arrange
    const six = ["r1", "r2", "r3", "r4", "r5", "tmp_134175"].map((n) => file(`${n}.idl1`, 1_000_000, true));
    const ready = run([{ type: "CHECK_START" }, { type: "CHECK_DONE", files: six }]);
    const picked = [{ name: "r3.idl1", sizeBytes: 1_000_000 }];

    // Act
    const started = newSessionsReducer(ready, { type: "TRANSFER_START", files: picked });
    const finished = run([{ type: "FILE_FAILED", name: "r3.idl1", error: "WiFi dropped", step: "download" }], started);

    // Assert
    expect(bannerView(started)).toMatchObject({ text: "Downloading 1 of 1", detail: "r3.idl1 · 0.0 MB of 1.0 MB" });
    expect(finished).toEqual({ phase: "done", imported: 0, failed: [{ name: "r3.idl1", error: "WiFi dropped", step: "download" }], warnings: [] });
  });

  it("transfer — empty batch — ignored, still ready", () => {
    // Arrange
    const ready = run(CHECKED);

    // Act
    const state = newSessionsReducer(ready, { type: "TRANSFER_START", files: [] });

    // Assert
    expect(state).toBe(ready);
  });

  it("transfer ended — files never reported — done, with a note that they stay on the logger", () => {
    // Arrange
    const oneIn = run([...CHECKED, START_ALL, { type: "IMPORT_START" }, { type: "FILE_IMPORTED", warnings: [] }]);

    // Act
    const state = newSessionsReducer(oneIn, { type: "TRANSFER_ENDED" });

    // Assert
    expect(state).toEqual({ phase: "done", imported: 1, failed: [], warnings: [unreportedNote(1)] });
    expect(unreportedNote(1)).toBe("1 file wasn't downloaded; it stays on the logger for next time");
    expect(unreportedNote(2)).toBe("2 files weren't downloaded; they stay on the logger for next time");
  });

  it("transfer ended — after done or cancel — ignored", () => {
    // Arrange
    const done = run([...CHECKED, START_ALL, { type: "FILE_IMPORTED", warnings: [] }, { type: "FILE_IMPORTED", warnings: [] }]);
    const cancelled = run([...CHECKED, START_ALL, { type: "TRANSFER_CANCELLED" }]);

    // Act
    const states = [newSessionsReducer(done, { type: "TRANSFER_ENDED" }), newSessionsReducer(cancelled, { type: "TRANSFER_ENDED" })];

    // Assert
    expect(states[0]).toBe(done);
    expect(states[1]).toBe(cancelled);
  });

  it("transfer — import fails after the download — named as an import failure", () => {
    // Arrange / Act
    const state = run([
      ...CHECKED,
      START_ALL,
      { type: "IMPORT_START" },
      { type: "FILE_FAILED", name: "a.idl0", error: "truncated record", step: "import" },
      { type: "IMPORT_START" },
      { type: "FILE_IMPORTED", warnings: [] },
    ]);

    // Assert
    expect(bannerView(state).detail).toBe("1 file failed: a.idl0 (import failed: truncated record)");
  });

  it("check — listing fails — Retry with the reason", () => {
    // Arrange / Act
    const state = run([{ type: "CHECK_START" }, { type: "CHECK_FAILED", error: "logger not in range" }]);

    // Assert
    expect(bannerView(state)).toMatchObject({ text: "Couldn't check the logger", detail: "logger not in range", action: { kind: "retry" }, tone: "bad" });
  });

  it("check start — during a transfer — ignored", () => {
    // Arrange
    const transferring = run([...CHECKED, START_ALL]);

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

describe("rideWhen", () => {
  it("rideWhen — a first-fix name — the UTC instant in the given zone", () => {
    // Arrange
    const name = "2026-10-17_00-29-11.idl1";

    // Act
    const when = rideWhen(name, "America/Los_Angeles");

    // Assert
    expect(when).toContain("Oct 16, 2026");
    expect(when).toContain("5:29");
  });

  it("rideWhen — a boot-time name — No GPS time", () => {
    // Arrange
    const name = "tmp_156962.idl1";

    // Act
    const when = rideWhen(name);

    // Assert
    expect(when).toBe("No GPS time");
  });
});

describe("pickFiles", () => {
  it("pickFiles — a selection — only the picked files, in the logger's order", () => {
    // Arrange
    const files = [
      { name: "a.idl1", sizeBytes: 1 },
      { name: "b.idl1", sizeBytes: 2 },
      { name: "c.idl1", sizeBytes: 3 },
    ];

    // Act
    const picked = pickFiles(files, new Set(["c.idl1", "a.idl1"]));

    // Assert
    expect(picked.map((f) => f.name)).toEqual(["a.idl1", "c.idl1"]);
  });
});

describe("TRANSFER_CANCELLED", () => {
  it("newSessionsReducer — cancelled mid-batch — done with what came in and a stopped note", () => {
    // Arrange
    const transferring = run([...CHECKED, START_ALL, { type: "IMPORT_START" }, { type: "FILE_IMPORTED", warnings: [] }]);

    // Act
    const state = newSessionsReducer(transferring, { type: "TRANSFER_CANCELLED" });

    // Assert
    expect(state).toEqual({ phase: "done", imported: 1, failed: [], warnings: [STOPPED_NOTE] });
  });

  it("bannerView — transferring — offers Cancel", () => {
    // Arrange
    const transferring = run([...CHECKED, START_ALL]);

    // Act
    const view = bannerView(transferring);

    // Assert
    expect(view.action).toEqual({ kind: "cancel", label: "Cancel" });
  });
});

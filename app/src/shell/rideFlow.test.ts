import { describe, expect, it } from "vitest";

import { autoOpens, draftsToKeep, fileStartMs, draftsToSave, initialRideFlow, rideFlowReducer, sessionIdFor, sessionKey } from "./rideFlow";
import type { RideFlowAction, RideFlowState } from "./rideFlow";

function run(actions: RideFlowAction[], from: RideFlowState = initialRideFlow): RideFlowState {
  return actions.reduce(rideFlowReducer, from);
}

describe("rideFlowReducer", () => {
  it("BATCH_START — one ride — rows queued; the form opens on it, half height, once its first bytes arrive", () => {
    // Arrange
    const started = run([{ type: "BATCH_START", files: [{ name: "s1.idl1", sizeBytes: 100 }] }]);

    // Act
    const receiving = rideFlowReducer(started, { type: "PROGRESS", name: "s1.idl1", doneBytes: 10 });

    // Assert
    expect(started.rows.map((r) => [r.name, r.status])).toEqual([["s1.idl1", "queued"]]);
    expect(started.open).toBeNull();
    expect(receiving.open).toBe("s1.idl1");
    expect(receiving.expanded).toBe(false);
  });

  it("BATCH_START — one ride that fails before any bytes — the form never opens", () => {
    // Arrange
    const started = run([{ type: "BATCH_START", files: [{ name: "s1.idl1", sizeBytes: 100 }] }]);

    // Act
    const failed = rideFlowReducer(started, { type: "FAILED", name: "s1.idl1", error: "did not answer over WiFi" });
    const later = rideFlowReducer(failed, { type: "PROGRESS", name: "s1.idl1", doneBytes: 10 });

    // Assert
    expect(failed.open).toBeNull();
    expect(later.open).toBeNull();
  });

  it("BATCH_START — several rides — the form stays closed", () => {
    // Arrange
    const files = [{ name: "a", sizeBytes: 1 }, { name: "b", sizeBytes: 1 }];

    // Act
    const s = run([{ type: "BATCH_START", files }]);

    // Assert
    expect(autoOpens(files)).toBe(false);
    expect(s.open).toBeNull();
    expect(s.rows).toHaveLength(2);
  });

  it("autoOpens — rides all from one day — opens on the latest; across days or without times — stays closed", () => {
    // Arrange
    const sameDay = [{ name: "2026-10-16_10-20-00.idl1", sizeBytes: 1 }, { name: "2026-10-16_14-05-12.idl1", sizeBytes: 1 }];
    const twoDays = [{ name: "2026-10-12_10-00-00.idl1", sizeBytes: 1 }, { name: "2026-10-16_14-05-12.idl1", sizeBytes: 1 }];
    const untimed = [{ name: "tmp_12345.idl1", sizeBytes: 1 }, { name: "2026-10-16_14-05-12.idl1", sizeBytes: 1 }];

    // Act
    const s = run([{ type: "BATCH_START", files: sameDay }, { type: "PROGRESS", name: "2026-10-16_14-05-12.idl1", doneBytes: 1 }]);

    // Assert
    expect(fileStartMs("2026-10-16_14-05-12.idl1")).toBe(Date.UTC(2026, 9, 16, 14, 5, 12));
    expect(fileStartMs("tmp_12345.idl1")).toBeNull();
    expect(s.open).toBe("2026-10-16_14-05-12.idl1");
    expect(autoOpens(twoDays)).toBe(false);
    expect(autoOpens(untimed)).toBe(false);
  });

  it("row lifecycle — progress, import — status and session id follow, imported rows leave on the next batch", () => {
    // Arrange
    const actions: RideFlowAction[] = [
      { type: "BATCH_START", files: [{ name: "a", sizeBytes: 10 }, { name: "b", sizeBytes: 10 }] },
      { type: "PROGRESS", name: "a", doneBytes: 4 },
      { type: "IMPORTING", name: "a" },
      { type: "IMPORTED", name: "a", sessionId: "S" },
      { type: "FAILED", name: "b", error: "wifi" },
    ];

    // Act
    const s = run(actions);
    const next = rideFlowReducer(s, { type: "BATCH_START", files: [{ name: "c", sizeBytes: 1 }] });

    // Assert
    expect(s.rows.map((r) => r.status)).toEqual(["imported", "failed"]);
    expect(sessionIdFor(s, "a")).toBe("S");
    expect(next.rows.map((r) => r.name)).toEqual(["c"]);
  });

  it("drafts — typed before import — saved only once the session exists, and a stale save leaves it unsaved", () => {
    // Arrange
    const typed = run([
      { type: "BATCH_START", files: [{ name: "a", sizeBytes: 1 }] },
      { type: "PROGRESS", name: "a", doneBytes: 1 },
      { type: "DRAFT", key: "a", notes: "dry and dusty" },
    ]);
    const imported = rideFlowReducer(typed, { type: "IMPORTED", name: "a", sessionId: "S" });

    // Act
    const key = sessionKey("S");
    const stale = rideFlowReducer(rideFlowReducer(imported, { type: "DRAFT", key, notes: "dry and dusty, felt strong" }), {
      type: "DRAFT_SAVED",
      key,
      title: "",
      notes: "dry and dusty",
    });
    const done = rideFlowReducer(stale, { type: "DRAFT_SAVED", key, title: "", notes: "dry and dusty, felt strong" });

    // Assert
    expect(draftsToSave(typed)).toEqual([]);
    expect(imported.drafts.a).toBeUndefined();
    expect(imported.open).toBe(key);
    expect(draftsToSave(imported).map((d) => d.sessionId)).toEqual(["S"]);
    expect(stale.drafts[key].saved).toBe(false);
    expect(done.drafts[key].saved).toBe(true);
    expect(draftsToKeep(done)).toEqual({});
  });

  it("library ride — opened by session key — its session id is the key's", () => {
    // Arrange
    const key = sessionKey("X");

    // Act
    const s = run([{ type: "OPEN", key, expanded: true }, { type: "DRAFT", key, title: "Whistler" }]);

    // Assert
    expect(s.open).toBe(key);
    expect(sessionIdFor(s, key)).toBe("X");
    expect(draftsToSave(s)).toEqual([{ key, sessionId: "X", draft: { title: "Whistler", notes: "", saved: false } }]);
  });
});

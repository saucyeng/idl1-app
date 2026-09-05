import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("listSessions", () => {
  it("list_sessions resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const sessions = [{ session_id: "s1" }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);
    const { listSessions } = await import("./catalog");

    // Act
    const result = await listSessions();

    // Assert
    expect(result).toBe(sessions);
    expect(invoke).toHaveBeenCalledWith("list_sessions");
  });
});

describe("getSession", () => {
  it("get_session resolves — calls invoke with the session id named per C3 §1", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const detail = { session_id: "s1" };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    const { getSession } = await import("./catalog");

    // Act
    const result = await getSession("s1");

    // Assert
    expect(result).toBe(detail);
    expect(invoke).toHaveBeenCalledWith("get_session", { sessionId: "s1" });
  });
});

describe("listLaps", () => {
  it("list_laps resolves — calls invoke with the session id", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const laps = [{ lap_number: 1 }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(laps);
    const { listLaps } = await import("./catalog");

    // Act
    const result = await listLaps("s1");

    // Assert
    expect(result).toBe(laps);
    expect(invoke).toHaveBeenCalledWith("list_laps", { sessionId: "s1" });
  });
});

describe("rebuildCatalog", () => {
  it("rebuild_catalog resolves — calls invoke with no arguments", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const report = { sessions_indexed: 1, workbooks_indexed: 0, tracks_indexed: 0, duration_ms: 5 };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(report);
    const { rebuildCatalog } = await import("./catalog");

    // Act
    const result = await rebuildCatalog();

    // Assert
    expect(result).toBe(report);
    expect(invoke).toHaveBeenCalledWith("rebuild_catalog");
  });
});

describe("listWorkbooks", () => {
  it("list_workbooks resolves — calls invoke with no arguments", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const workbooks = [{ workbook_id: "w1" }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(workbooks);
    const { listWorkbooks } = await import("./catalog");

    // Act
    const result = await listWorkbooks();

    // Assert
    expect(result).toBe(workbooks);
    expect(invoke).toHaveBeenCalledWith("list_workbooks");
  });
});

describe("listTracks", () => {
  it("list_tracks resolves — calls invoke with no arguments", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const tracks = [{ track_id: "t1" }];
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(tracks);
    const { listTracks } = await import("./catalog");

    // Act
    const result = await listTracks();

    // Assert
    expect(result).toBe(tracks);
    expect(invoke).toHaveBeenCalledWith("list_tracks");
  });
});

describe("getTrack", () => {
  it("get_track resolves — calls invoke with the track id", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const detail = { track_id: "t1" };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    const { getTrack } = await import("./catalog");

    // Act
    const result = await getTrack("t1");

    // Assert
    expect(result).toBe(detail);
    expect(invoke).toHaveBeenCalledWith("get_track", { trackId: "t1" });
  });
});

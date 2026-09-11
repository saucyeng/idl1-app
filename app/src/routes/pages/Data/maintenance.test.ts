import { describe, expect, it } from "vitest";

import type { RescanReport } from "../../../ipc/catalog";
import type { RebuildRunSummary } from "../../../ipc/rebuild_job";
import {
  initialMaintenanceState,
  maintenanceReducer,
  runDeleteSession,
  runForgetSession,
  runRebuildCatalog,
  runRescanSessions,
  runRescanTracks,
  startMaintenanceAction,
  summarizeRebuildReport,
  summarizeRescanReport,
  summarizeRescanSessionsOutcomes,
  summarizeRescanSessionsReport,
  type MaintenanceAction,
  type MaintenanceState,
  type RescanSessionOutcome,
} from "./maintenance";

describe("summarizeRebuildReport", () => {
  it("summarizeRebuildReport — a report with every count nonzero — summary names every count", () => {
    const report: RebuildRunSummary = { sessions_indexed: 42, workbooks_indexed: 3, tracks_indexed: 1, blobs_carried: 158, blobs_hashed: 1, duration_ms: 1200 };

    const summary = summarizeRebuildReport(report);

    expect(summary).toContain("42 sessions");
    expect(summary).toContain("3 workbooks");
    expect(summary).toContain("1 track");
    expect(summary).toContain("1.2 s");
  });
});

describe("maintenance — rebuildCatalog succeeds — summary names every count from the RebuildReport", () => {
  it("startMaintenanceAction with a resolving rebuildCatalog — dispatches START then SUCCEEDED carrying the summary", async () => {
    const actions: MaintenanceAction[] = [];
    const report: RebuildRunSummary = { sessions_indexed: 42, workbooks_indexed: 3, tracks_indexed: 1, blobs_carried: 158, blobs_hashed: 1, duration_ms: 1200 };
    const run = runRebuildCatalog(() => Promise.resolve(true), () => Promise.resolve(report));

    startMaintenanceAction(initialMaintenanceState, "rebuild_catalog", run, (a) => actions.push(a));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(actions[0]).toEqual({ type: "START", action: "rebuild_catalog" });
    expect(actions[1].type).toBe("SUCCEEDED");
    const succeeded = actions[1] as { type: "SUCCEEDED"; action: string; result: string };
    expect(succeeded.result).toContain("42 sessions");
    expect(succeeded.result).toContain("3 workbooks");
    expect(succeeded.result).toContain("1 track");
  });
});

describe("maintenance — rebuildCatalog with zero of everything — summary says the store is empty, not \"0 0 0\"", () => {
  it("summarizeRebuildReport with every count zero — reads as an empty store, not \"0 sessions, 0 workbooks, 0 tracks\"", () => {
    const report: RebuildRunSummary = { sessions_indexed: 0, workbooks_indexed: 0, tracks_indexed: 0, blobs_carried: 0, blobs_hashed: 0, duration_ms: 400 };

    const summary = summarizeRebuildReport(report);

    expect(summary.toLowerCase()).toContain("empty");
    expect(summary).not.toContain("0 sessions");
  });
});

describe("maintenance — an action rejects with kind io — status failed, the error's text is kept", () => {
  it("startMaintenanceAction with a run rejecting an IpcError-shaped io error — reducer ends up failed with the described text", async () => {
    let state: MaintenanceState = initialMaintenanceState;
    const dispatch = (a: MaintenanceAction) => {
      state = maintenanceReducer(state, a);
    };
    const run = () => Promise.reject({ kind: "io", message: "disk full" });

    startMaintenanceAction(state, "rebuild_catalog", run, dispatch);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.status).toBe("failed");
    expect(state.error).toBe("A file could not be read. Try rebuilding the catalog.");
  });
});

describe("maintenance — a second START while one is running — refused, the running action is untouched", () => {
  it("startMaintenanceAction called again while the first run has not settled — the second call dispatches nothing", async () => {
    const actions: MaintenanceAction[] = [];
    let neverSettles: () => void = () => undefined;
    const runningRun = () => new Promise<string>((resolve) => { neverSettles = () => resolve("done"); });

    startMaintenanceAction(initialMaintenanceState, "rebuild_catalog", runningRun, (a) => actions.push(a));
    const runningState = maintenanceReducer(initialMaintenanceState, actions[0]);
    expect(runningState.status).toBe("running");

    const secondRun = () => Promise.resolve("should never run");
    startMaintenanceAction(runningState, "delete_session", secondRun, (a) => actions.push(a));

    expect(actions).toEqual([{ type: "START", action: "rebuild_catalog" }]);

    neverSettles();
    await Promise.resolve();
  });
});

describe("maintenance — an action rejects with a shape describeIpcError has never seen — status failed, never a crash", () => {
  it("startMaintenanceAction with a run rejecting a plain Error — status failed with the generic fallback text, no unhandled rejection", async () => {
    let state: MaintenanceState = initialMaintenanceState;
    const dispatch = (a: MaintenanceAction) => {
      state = maintenanceReducer(state, a);
    };
    const run = () => Promise.reject(new Error("boom"));

    startMaintenanceAction(state, "delete_session", run, dispatch);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.status).toBe("failed");
    expect(state.error).toBe("Something went wrong.");
  });
});

describe("maintenanceReducer — START while already running — the reducer's own guard leaves the running action untouched", () => {
  it("maintenanceReducer with a second START — returns the same running state, not the second action's name", () => {
    const running = maintenanceReducer(initialMaintenanceState, { type: "START", action: "rebuild_catalog" });

    const afterSecondStart = maintenanceReducer(running, { type: "START", action: "delete_session" });

    expect(afterSecondStart).toEqual(running);
  });
});

describe("runDeleteSession / runForgetSession — the real command's success path, once it lands", () => {
  it("runDeleteSession with deleteBlob true — resolves naming the source file as deleted", async () => {
    const run = runDeleteSession(() => Promise.resolve(undefined), "s1", true);

    const result = await run();

    expect(result).toContain("source file");
    expect(result).toContain("deleted");
  });

  it("runForgetSession — resolves naming the source file as kept, not deleted", async () => {
    const run = runForgetSession(() => Promise.resolve(undefined), "s1");

    const result = await run();

    expect(result).toContain("kept");
  });
});

describe("summarizeRescanReport", () => {
  it("summarizeRescanReport — no flags cleared, no warnings — names the counts only", () => {
    const report: RescanReport = { session_id: "s1", visits_indexed: 1, laps_indexed: 3, flags_cleared: [], warnings: [], elapsed_ms: 12 };

    const summary = summarizeRescanReport(report);

    expect(summary).toBe("Indexed 1 track visit, 3 laps.");
  });

  it("summarizeRescanReport — a cleared lap flag — names it, singular counts read correctly", () => {
    const report: RescanReport = {
      session_id: "s1",
      visits_indexed: 1,
      laps_indexed: 1,
      flags_cleared: ["main_lap_number"],
      warnings: [],
      elapsed_ms: 5,
    };

    const summary = summarizeRescanReport(report);

    expect(summary).toBe("Indexed 1 track visit, 1 lap. Cleared main_lap_number.");
  });

  it("summarizeRescanReport — a warning — named in the summary", () => {
    const report: RescanReport = {
      session_id: "s1",
      visits_indexed: 0,
      laps_indexed: 0,
      flags_cleared: [],
      warnings: ["catalog index failed: disk full"],
      elapsed_ms: 3,
    };

    const summary = summarizeRescanReport(report);

    expect(summary).toContain("1 warning");
    expect(summary).toContain("disk full");
  });
});

describe("runRescanTracks — the real command's success path", () => {
  it("runRescanTracks — resolves — the summary line names the indexed counts", async () => {
    const report: RescanReport = { session_id: "s1", visits_indexed: 2, laps_indexed: 5, flags_cleared: [], warnings: [], elapsed_ms: 8 };
    const run = runRescanTracks(() => Promise.resolve(report), "s1");

    const result = await run();

    expect(result).toContain("2 track visits");
    expect(result).toContain("5 laps");
  });
});

describe("summarizeRescanSessionsReport", () => {
  it("summarizeRescanSessionsReport — three reports, no flags or warnings — names the session count and the summed totals", () => {
    const reports: RescanReport[] = [
      { session_id: "s1", visits_indexed: 1, laps_indexed: 3, flags_cleared: [], warnings: [], elapsed_ms: 5 },
      { session_id: "s2", visits_indexed: 2, laps_indexed: 4, flags_cleared: [], warnings: [], elapsed_ms: 5 },
      { session_id: "s3", visits_indexed: 1, laps_indexed: 2, flags_cleared: [], warnings: [], elapsed_ms: 5 },
    ];

    const summary = summarizeRescanSessionsReport(reports);

    expect(summary).toBe("Rescanned 3 sessions: indexed 4 track visits, 9 laps total.");
  });

  it("summarizeRescanSessionsReport — one report, singular session/visit nouns", () => {
    const reports: RescanReport[] = [
      { session_id: "s1", visits_indexed: 1, laps_indexed: 1, flags_cleared: [], warnings: [], elapsed_ms: 5 },
    ];

    const summary = summarizeRescanSessionsReport(reports);

    expect(summary).toBe("Rescanned 1 session: indexed 1 track visit, 1 lap total.");
  });

  it("summarizeRescanSessionsReport — overlapping cleared flags across sessions — each flag named once", () => {
    const reports: RescanReport[] = [
      { session_id: "s1", visits_indexed: 1, laps_indexed: 1, flags_cleared: ["main_lap_number"], warnings: [], elapsed_ms: 5 },
      { session_id: "s2", visits_indexed: 1, laps_indexed: 1, flags_cleared: ["main_lap_number", "starred_lap_number"], warnings: [], elapsed_ms: 5 },
    ];

    const summary = summarizeRescanSessionsReport(reports);

    expect(summary).toContain("Cleared main_lap_number, starred_lap_number.");
  });

  it("summarizeRescanSessionsReport — warnings from more than one session — all named, counted together", () => {
    const reports: RescanReport[] = [
      { session_id: "s1", visits_indexed: 0, laps_indexed: 0, flags_cleared: [], warnings: ["disk full"], elapsed_ms: 5 },
      { session_id: "s2", visits_indexed: 0, laps_indexed: 0, flags_cleared: [], warnings: ["stale index"], elapsed_ms: 5 },
    ];

    const summary = summarizeRescanSessionsReport(reports);

    expect(summary).toContain("2 warnings");
    expect(summary).toContain("disk full");
    expect(summary).toContain("stale index");
  });
});

describe("runRescanSessions — the real command's success path, run per session id", () => {
  it("runRescanSessions with two ids — calls rescanTracks for each and aggregates the summary", async () => {
    const calls: string[] = [];
    const rescanTracks = (sessionId: string) => {
      calls.push(sessionId);
      return Promise.resolve<RescanReport>({
        session_id: sessionId,
        visits_indexed: 1,
        laps_indexed: 1,
        flags_cleared: [],
        warnings: [],
        elapsed_ms: 1,
      });
    };
    const run = runRescanSessions(rescanTracks, ["s1", "s2"]);

    const result = await run();

    expect(calls.sort()).toEqual(["s1", "s2"]);
    expect(result).toBe("Rescanned 2 sessions: indexed 2 track visits, 2 laps total.");
  });

  it("runRescanSessions with three ids and one rejecting — the two successes are still reported, not discarded", async () => {
    const rescanTracks = (sessionId: string): Promise<RescanReport> => {
      if (sessionId === "s2") return Promise.reject({ kind: "io", message: "disk full" });
      return Promise.resolve({
        session_id: sessionId,
        visits_indexed: 1,
        laps_indexed: 1,
        flags_cleared: [],
        warnings: [],
        elapsed_ms: 1,
      });
    };
    const run = runRescanSessions(rescanTracks, ["s1", "s2", "s3"]);

    const result = await run();

    expect(result).toContain("2 of 3 sessions rescanned.");
    expect(result).toContain("Rescanned 2 sessions: indexed 2 track visits, 2 laps total.");
    expect(result).toContain("1 session failed: s2 (A file could not be read. Try rebuilding the catalog.).");
  });

  it("runRescanSessions with every id rejecting — resolves (never rejects) naming every failed session", async () => {
    const rescanTracks = (): Promise<RescanReport> => Promise.reject({ kind: "internal", message: "boom" });
    const run = runRescanSessions(rescanTracks, ["s1", "s2"]);

    const result = await run();

    expect(result).toBe("0 of 2 sessions rescanned. 2 sessions failed: s1 (Something went wrong internally.); s2 (Something went wrong internally.).");
  });

  it("startMaintenanceAction driving runRescanSessions with a partial failure — dispatches SUCCEEDED, not FAILED, carrying the honest partial summary", async () => {
    const actions: MaintenanceAction[] = [];
    const rescanTracks = (sessionId: string): Promise<RescanReport> => {
      if (sessionId === "s2") return Promise.reject({ kind: "io", message: "disk full" });
      return Promise.resolve({ session_id: sessionId, visits_indexed: 1, laps_indexed: 1, flags_cleared: [], warnings: [], elapsed_ms: 1 });
    };

    startMaintenanceAction(initialMaintenanceState, "rescan_sessions", runRescanSessions(rescanTracks, ["s1", "s2"]), (a) => actions.push(a));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(actions.map((a) => a.type)).toEqual(["START", "SUCCEEDED"]);
    const succeeded = actions[1] as { type: "SUCCEEDED"; result: string };
    expect(succeeded.result).toContain("1 of 2 sessions rescanned.");
  });

  it("startMaintenanceAction — a second START while a rescan_sessions batch is still settling is refused, its eventual settle never overwrites the newer run's state", async () => {
    let resolveFirst: (reports: RescanReport[]) => void = () => {};
    const firstRun = () => new Promise<string>((resolve) => { resolveFirst = (reports) => resolve(summarizeRescanSessionsReport(reports)); });
    const actions: MaintenanceAction[] = [];

    startMaintenanceAction(initialMaintenanceState, "rescan_sessions", firstRun, (a) => actions.push(a));
    const runningState = maintenanceReducer(initialMaintenanceState, actions[0]);
    expect(runningState.status).toBe("running");

    const secondRun = () => Promise.resolve("second run's summary");
    startMaintenanceAction(runningState, "rebuild_catalog", secondRun, (a) => actions.push(a));
    await Promise.resolve();

    expect(actions).toHaveLength(1);

    resolveFirst([{ session_id: "s1", visits_indexed: 1, laps_indexed: 1, flags_cleared: [], warnings: [], elapsed_ms: 1 }]);
    await Promise.resolve();

    expect(actions).toHaveLength(2);
    expect(actions[1].type).toBe("SUCCEEDED");
    const finished = actions[1] as { type: "SUCCEEDED"; action: string; result: string };
    expect(finished.action).toBe("rescan_sessions");
    expect(finished.result).toBe("Rescanned 1 session: indexed 1 track visit, 1 lap total.");
  });
});

describe("summarizeRescanSessionsOutcomes", () => {
  it("summarizeRescanSessionsOutcomes with every session succeeding — same text as summarizeRescanSessionsReport, no partial-batch clause", () => {
    const outcomes: RescanSessionOutcome[] = [
      { sessionId: "s1", result: { status: "succeeded", report: { session_id: "s1", visits_indexed: 1, laps_indexed: 1, flags_cleared: [], warnings: [], elapsed_ms: 1 } } },
    ];

    const summary = summarizeRescanSessionsOutcomes(outcomes);

    expect(summary).toBe("Rescanned 1 session: indexed 1 track visit, 1 lap total.");
  });

  it("summarizeRescanSessionsOutcomes with a mix of succeeded and failed — names the failed session id and its error text", () => {
    const outcomes: RescanSessionOutcome[] = [
      { sessionId: "s1", result: { status: "succeeded", report: { session_id: "s1", visits_indexed: 1, laps_indexed: 1, flags_cleared: [], warnings: [], elapsed_ms: 1 } } },
      { sessionId: "s2", result: { status: "failed", error: "A file could not be read. Try rebuilding the catalog." } },
    ];

    const summary = summarizeRescanSessionsOutcomes(outcomes);

    expect(summary).toBe(
      "1 of 2 sessions rescanned. Rescanned 1 session: indexed 1 track visit, 1 lap total. 1 session failed: s2 (A file could not be read. Try rebuilding the catalog.).",
    );
  });
});

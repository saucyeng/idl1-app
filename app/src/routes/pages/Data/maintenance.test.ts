import { describe, expect, it } from "vitest";

import type { RebuildReport } from "../../../ipc/catalog";
import { NotImplementedError } from "./ipcStubs";
import {
  initialMaintenanceState,
  maintenanceReducer,
  runDeleteSession,
  runForgetSession,
  runListQuarantine,
  runRebuildCatalog,
  runResolveQuarantine,
  startMaintenanceAction,
  summarizeRebuildReport,
  type MaintenanceAction,
  type MaintenanceState,
} from "./maintenance";

describe("summarizeRebuildReport", () => {
  it("summarizeRebuildReport — a report with every count nonzero — summary names every count", () => {
    const report: RebuildReport = { sessions_indexed: 42, workbooks_indexed: 3, tracks_indexed: 1, duration_ms: 1200 };

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
    const report: RebuildReport = { sessions_indexed: 42, workbooks_indexed: 3, tracks_indexed: 1, duration_ms: 1200 };
    const run = runRebuildCatalog(() => Promise.resolve(report));

    startMaintenanceAction(initialMaintenanceState, "rebuild_catalog", run, (a) => actions.push(a));
    await Promise.resolve();
    await Promise.resolve();

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
    const report: RebuildReport = { sessions_indexed: 0, workbooks_indexed: 0, tracks_indexed: 0, duration_ms: 400 };

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

describe('maintenance — a stubbed action — status failed with the "not wired up yet" text, never a crash', () => {
  it("startMaintenanceAction with a run rejecting NotImplementedError — status failed naming the command, no unhandled rejection", async () => {
    let state: MaintenanceState = initialMaintenanceState;
    const dispatch = (a: MaintenanceAction) => {
      state = maintenanceReducer(state, a);
    };
    const run = () => Promise.reject(new NotImplementedError("delete_session"));

    startMaintenanceAction(state, "delete_session", run, dispatch);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.status).toBe("failed");
    expect(state.error).toContain("delete_session");
    expect(state.error).toContain("isn't wired up yet");
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

describe("runListQuarantine / runResolveQuarantine — the real commands' success path, once they land", () => {
  it("runListQuarantine with two entries — counts them", async () => {
    const run = runListQuarantine(() => Promise.resolve([{}, {}]));

    const result = await run();

    expect(result).toBe("2 items awaiting review.");
  });

  it("runListQuarantine with one entry — singular noun, not \"1 items\"", async () => {
    const run = runListQuarantine(() => Promise.resolve([{}]));

    const result = await run();

    expect(result).toBe("1 item awaiting review.");
  });

  it("runResolveQuarantine with action retry — resolves naming the retry", async () => {
    const run = runResolveQuarantine(() => Promise.resolve(undefined), "q1", "retry");

    const result = await run();

    expect(result).toContain("retried");
  });

  it("runResolveQuarantine with action discard — resolves naming the discard", async () => {
    const run = runResolveQuarantine(() => Promise.resolve(undefined), "q1", "discard");

    const result = await run();

    expect(result).toContain("discarded");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const listen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  listen.mockReset();
});

const idleStatus = { running: false, done: 0, total: 0, phase: null, last_run: null, last_error: null };
const summary = {
  sessions_indexed: 159,
  workbooks_indexed: 3,
  tracks_indexed: 0,
  blobs_carried: 158,
  blobs_hashed: 1,
  duration_ms: 420,
};

describe("startRebuildJob", () => {
  it("start_rebuild_job resolves — calls invoke with no arguments and returns whether it started", async () => {
    invoke.mockResolvedValue(true);

    const { startRebuildJob } = await import("./rebuild_job");
    const started = await startRebuildJob();

    expect(invoke).toHaveBeenCalledWith("start_rebuild_job");
    expect(started).toBe(true);
  });
});

describe("rebuildStatus", () => {
  it("rebuild_status resolves — returns the status object unchanged", async () => {
    const status = { ...idleStatus, running: true, done: 12, total: 159, phase: "sessions" };
    invoke.mockResolvedValue(status);

    const { rebuildStatus } = await import("./rebuild_job");
    const got = await rebuildStatus();

    expect(invoke).toHaveBeenCalledWith("rebuild_status");
    expect(got).toEqual(status);
  });
});

describe("onRebuildProgress", () => {
  it("a rebuild_progress event arrives — the handler gets the payload, not the envelope", async () => {
    const seen: unknown[] = [];
    const payload = { done: 1, total: 2, phase: "blobs" };
    listen.mockImplementation((_name: string, handler: (e: unknown) => void) => {
      handler({ payload });
      return Promise.resolve(() => {});
    });

    const { onRebuildProgress } = await import("./rebuild_job");
    await onRebuildProgress((event) => seen.push(event));

    expect(listen).toHaveBeenCalledWith("rebuild_progress", expect.any(Function));
    expect(seen).toEqual([payload]);
  });
});

describe("whenRebuildFinishes — nothing is running — resolves at once with the last run", () => {
  it("rebuild_status says idle — the last_run comes back without subscribing to anything", async () => {
    invoke.mockResolvedValue({ ...idleStatus, last_run: summary });

    const { whenRebuildFinishes } = await import("./rebuild_job");
    const got = await whenRebuildFinishes();

    expect(got).toEqual(summary);
    expect(listen).not.toHaveBeenCalled();
  });
});

describe("whenRebuildFinishes — a run in flight — resolves on the terminal workbooks event", () => {
  it("a blobs phase ending is ignored, the workbooks terminal event resolves — and the listener is dropped", async () => {
    const bus: { emit: (payload: { done: number; total: number; phase: string }) => void } = { emit: () => {} };
    const unlisten = vi.fn();
    listen.mockImplementation((_name: string, handler: (e: { payload: unknown }) => void) => {
      bus.emit = (payload) => handler({ payload });
      return Promise.resolve(unlisten);
    });
    invoke
      .mockResolvedValueOnce({ ...idleStatus, running: true, done: 0, total: 159, phase: "blobs" })
      .mockResolvedValueOnce({ ...idleStatus, running: true, done: 0, total: 159, phase: "blobs" })
      .mockResolvedValueOnce({ ...idleStatus, last_run: summary });

    const { whenRebuildFinishes } = await import("./rebuild_job");
    const pending = whenRebuildFinishes();
    await new Promise((resolve) => setTimeout(resolve, 0));
    bus.emit({ done: 159, total: 159, phase: "blobs" });
    bus.emit({ done: 3, total: 3, phase: "workbooks" });
    const got = await pending;

    expect(got).toEqual(summary);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("whenRebuildFinishes — the run ends before the subscription lands — does not wait forever", () => {
  it("rebuild_status says running, then idle, and no event ever arrives — still resolves", async () => {
    listen.mockResolvedValue(() => {});
    invoke
      .mockResolvedValueOnce({ ...idleStatus, running: true, done: 1, total: 159, phase: "blobs" })
      .mockResolvedValueOnce({ ...idleStatus, last_run: summary })
      .mockResolvedValueOnce({ ...idleStatus, last_run: summary });

    const { whenRebuildFinishes } = await import("./rebuild_job");
    const got = await whenRebuildFinishes();

    expect(got).toEqual(summary);
  });
});

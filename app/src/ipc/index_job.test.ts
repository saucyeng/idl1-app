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

describe("startIndexJob", () => {
  it("start_index_job resolves — calls invoke with no arguments and returns whether it started", async () => {
    invoke.mockResolvedValue(true);

    const { startIndexJob } = await import("./index_job");
    const started = await startIndexJob();

    expect(invoke).toHaveBeenCalledWith("start_index_job");
    expect(started).toBe(true);
  });
});

describe("indexStatus", () => {
  it("index_status resolves — returns the status object unchanged", async () => {
    const status = {
      running: true,
      done: 11,
      total: 159,
      current_session_id: "2026-09-07_09-43-52",
      phase: "tracks",
      last_run: null,
    };
    invoke.mockResolvedValue(status);

    const { indexStatus } = await import("./index_job");
    const got = await indexStatus();

    expect(invoke).toHaveBeenCalledWith("index_status");
    expect(got).toEqual(status);
  });
});

describe("cancelIndexJob", () => {
  it("cancel_index_job resolves — returns whether a run was stopped", async () => {
    invoke.mockResolvedValue(false);

    const { cancelIndexJob } = await import("./index_job");
    const stopped = await cancelIndexJob();

    expect(invoke).toHaveBeenCalledWith("cancel_index_job");
    expect(stopped).toBe(false);
  });
});

describe("onIndexProgress", () => {
  it("an index_progress event arrives — the handler gets the payload, not the envelope", async () => {
    const seen: unknown[] = [];
    const payload = { done: 1, total: 2, current_session_id: "s1", phase: "laps" };
    listen.mockImplementation((_name: string, handler: (e: unknown) => void) => {
      handler({ payload });
      return Promise.resolve(() => {});
    });

    const { onIndexProgress } = await import("./index_job");
    await onIndexProgress((event) => seen.push(event));

    expect(listen).toHaveBeenCalledWith("index_progress", expect.any(Function));
    expect(seen).toEqual([payload]);
  });
});

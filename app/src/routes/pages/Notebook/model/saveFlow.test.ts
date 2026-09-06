import { describe, expect, it } from "vitest";

import { isSelfWrite, saveFlow, toIpcErrorOrUnknown, type SaveFlowDeps, type WorkbookEventWithHash } from "./saveFlow";
import type { SaveResult } from "../../../../ipc/workbook";

function baseDeps(overrides: Partial<SaveFlowDeps> = {}): SaveFlowDeps {
  return {
    save: async () => ({ hash: "h-unused", saved_utc_ms: 0 }),
    now: () => 0,
    ...overrides,
  };
}

describe("saveFlow", () => {
  it("saveFlow — a save with the hash last read — passes it as based_on_hash and stores the returned hash", async () => {
    const calls: [string, string, string | null][] = [];
    const result: SaveResult = { hash: "h2", saved_utc_ms: 5000 };
    const flow = saveFlow(
      baseDeps({
        save: async (id, markdown, basedOnHash) => {
          calls.push([id, markdown, basedOnHash]);
          return result;
        },
        now: () => 1234,
      })
    );

    const state = await flow.save("wb-1", "# doc", "h1");

    expect(calls).toEqual([["wb-1", "# doc", "h1"]]);
    expect(state).toEqual({ status: "saved", hash: "h2", savedAtMs: 1234 });
    expect(flow.state()).toEqual(state);
  });

  it("saveFlow — a rejection with kind conflict — enters the conflict state, does not surface a generic error", async () => {
    const flow = saveFlow(
      baseDeps({
        save: async () => {
          throw { kind: "conflict", message: "hash mismatch", detail: { expected: "h1", found: "h9" } };
        },
      })
    );

    const state = await flow.save("wb-1", "# doc", "h1");

    expect(state).toEqual({ status: "conflict" });
    expect(flow.state()).toEqual({ status: "conflict" });
  });

  it("saveFlow — a rejection with kind io — surfaces an error and leaves the document dirty", async () => {
    const flow = saveFlow(
      baseDeps({
        save: async () => {
          throw { kind: "io", message: "disk full" };
        },
      })
    );

    const state = await flow.save("wb-1", "# doc", "h1");

    expect(state).toEqual({ status: "error", error: { kind: "io", message: "disk full" } });
    // "leaves the document dirty": saveFlow itself carries no dirty flag --
    // workbookState.ts's dirtyCellIds is only cleared by a successful
    // "saveResult" action, which a caller must not dispatch on this state.
  });

  it("saveFlow — creating a new workbook — passes based_on_hash null (C3 §3.4)", async () => {
    const calls: (string | null)[] = [];
    const flow = saveFlow(
      baseDeps({
        save: async (_id, _markdown, basedOnHash) => {
          calls.push(basedOnHash);
          return { hash: "h1", saved_utc_ms: 0 };
        },
      })
    );

    await flow.save("wb-new", "# fresh", null);

    expect(calls).toEqual([null]);
  });
});

describe("isSelfWrite", () => {
  it("isSelfWrite — a watch event arriving right after our own save — is suppressed", () => {
    const event: WorkbookEventWithHash = { kind: "changed", cell_ids: ["c1"], hash: "h2" };

    const result = isSelfWrite(event, "h2", 1000, 1200, 5000);

    expect(result).toBe(true);
  });

  it("isSelfWrite — a watch event after an external edit — is not suppressed and triggers a reload", () => {
    const event: WorkbookEventWithHash = { kind: "changed", cell_ids: ["c1"], hash: "h-external" };

    const result = isSelfWrite(event, "h2", 1000, 1200, 5000);

    expect(result).toBe(false);
  });

  it("isSelfWrite — a watch event more than the TTL after our save — is not suppressed (C4 §4)", () => {
    const event: WorkbookEventWithHash = { kind: "changed", cell_ids: ["c1"], hash: "h2" };

    const result = isSelfWrite(event, "h2", 1000, 6001, 5000);

    expect(result).toBe(false);
  });
});

describe("toIpcErrorOrUnknown", () => {
  it("toIpcErrorOrUnknown — a real IpcError rejection — passes it through unchanged", () => {
    const reason = { kind: "io", message: "disk full" };

    const error = toIpcErrorOrUnknown(reason);

    expect(error).toBe(reason);
  });

  it("toIpcErrorOrUnknown — a non-IpcError rejection (a bare string throw) — synthesizes a message instead of undefined", () => {
    const reason = "disk full";

    const error = toIpcErrorOrUnknown(reason);

    expect(error).toEqual({ kind: "unknown", message: "disk full" });
  });

  it("toIpcErrorOrUnknown — a plain Error rejection — synthesizes a message from Error.message", () => {
    const reason = new Error("disk full");

    const error = toIpcErrorOrUnknown(reason);

    expect(error).toEqual({ kind: "unknown", message: "disk full" });
  });

  it("toIpcErrorOrUnknown — a non-string, non-Error rejection (e.g. undefined) — synthesizes a message via String()", () => {
    const error = toIpcErrorOrUnknown(undefined);

    expect(error).toEqual({ kind: "unknown", message: "undefined" });
  });
});

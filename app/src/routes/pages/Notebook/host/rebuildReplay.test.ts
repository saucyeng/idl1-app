import { describe, expect, it } from "vitest";

import type { HostToSandboxMessage } from "./protocol";
import { replayAfterRebuild } from "./rebuildReplay";

describe("replayAfterRebuild", () => {
  it("replayAfterRebuild — neither init nor setCells was ever sent — posts nothing", () => {
    const posted: HostToSandboxMessage[] = [];

    replayAfterRebuild((message) => posted.push(message), { lastInitRuntimeVersion: null, lastCells: null });

    expect(posted).toEqual([]);
  });

  it("replayAfterRebuild — a prior init and cell set — resends init then setCells, in that order", () => {
    const posted: HostToSandboxMessage[] = [];
    const cells = [{ id: "cell-1", code: "1 + 1" }];

    replayAfterRebuild((message) => posted.push(message), {
      lastInitRuntimeVersion: "1.0.0",
      lastCells: cells,
    });

    expect(posted).toEqual([
      { type: "init", runtimeVersion: "1.0.0" },
      { type: "setCells", cells },
    ]);
  });

  it("replayAfterRebuild — only init was ever sent — resends init only", () => {
    const posted: HostToSandboxMessage[] = [];

    replayAfterRebuild((message) => posted.push(message), { lastInitRuntimeVersion: "1.0.0", lastCells: null });

    expect(posted).toEqual([{ type: "init", runtimeVersion: "1.0.0" }]);
  });
});

import { describe, expect, it } from "vitest";

import type { HostToSandboxMessage } from "./protocol";
import { replayAfterRebuild } from "./rebuildReplay";

describe("replayAfterRebuild", () => {
  it("replayAfterRebuild — neither init nor setCells was ever sent — posts nothing", () => {
    const posted: HostToSandboxMessage[] = [];

    replayAfterRebuild((message) => posted.push(message), {
      lastInitRuntimeVersion: null,
      lastCells: null,
      lastJsonHostVars: new Map(),
    });

    expect(posted).toEqual([]);
  });

  it("replayAfterRebuild — a prior init and cell set — resends init then setCells, in that order", () => {
    const posted: HostToSandboxMessage[] = [];
    const cells = [{ id: "cell-1", code: "1 + 1" }];

    replayAfterRebuild((message) => posted.push(message), {
      lastInitRuntimeVersion: "1.0.0",
      lastCells: cells,
      lastJsonHostVars: new Map(),
    });

    expect(posted).toEqual([
      { type: "init", runtimeVersion: "1.0.0" },
      { type: "setCells", cells },
    ]);
  });

  it("replayAfterRebuild — only init was ever sent — resends init only", () => {
    const posted: HostToSandboxMessage[] = [];

    replayAfterRebuild((message) => posted.push(message), {
      lastInitRuntimeVersion: "1.0.0",
      lastCells: null,
      lastJsonHostVars: new Map(),
    });

    expect(posted).toEqual([{ type: "init", runtimeVersion: "1.0.0" }]);
  });

  it("replayAfterRebuild — cached JSON host variables — resends each after init and before setCells", () => {
    const posted: HostToSandboxMessage[] = [];
    const cells = [{ id: "cell-1", code: "1 + 1" }];
    const lastJsonHostVars = new Map<string, unknown>([
      ["laps", [1, 2, 3]],
      ["session", { sessionId: "abc" }],
    ]);

    replayAfterRebuild((message) => posted.push(message), {
      lastInitRuntimeVersion: "1.0.0",
      lastCells: cells,
      lastJsonHostVars,
    });

    expect(posted).toEqual([
      { type: "init", runtimeVersion: "1.0.0" },
      { type: "setHostVar", name: "laps", value: { kind: "json", value: [1, 2, 3] } },
      { type: "setHostVar", name: "session", value: { kind: "json", value: { sessionId: "abc" } } },
      { type: "setCells", cells },
    ]);
  });

  it("replayAfterRebuild — a JSON host variable but no init or cells ever sent — resends only the host variable", () => {
    const posted: HostToSandboxMessage[] = [];
    const lastJsonHostVars = new Map<string, unknown>([["constants", { wheelCircumferenceM: 2.1 }]]);

    replayAfterRebuild((message) => posted.push(message), {
      lastInitRuntimeVersion: null,
      lastCells: null,
      lastJsonHostVars,
    });

    expect(posted).toEqual([{ type: "setHostVar", name: "constants", value: { kind: "json", value: { wheelCircumferenceM: 2.1 } } }]);
  });
});

import { describe, expect, it } from "vitest";

import type { HostToSandboxMessage } from "./protocol";
import { replayAfterRebuild, replayInitAndHostVars, replaySetCells } from "./rebuildReplay";

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

describe("replayInitAndHostVars + onChannelsInvalidated + replaySetCells (SandboxHost.rebuild()'s actual call sequence)", () => {
  it("a rebuild with a cached init, JSON host var, channel, and cell set — posts init, then the JSON host var, then the channel, then setCells, in that order", () => {
    // Arrange: mirrors SandboxHost.rebuild()'s three calls (review-task5c.md
    // Critical finding) against one shared recorder, standing in for
    // onChannelsInvalidated with a single setHostVar post the way Task 8's
    // rebindChannelsAfterRebuild-driven `send` callback would.
    const posted: HostToSandboxMessage[] = [];
    const cells = [{ id: "cell-1", code: "1 + 1" }];
    const state = {
      lastInitRuntimeVersion: "1.0.0",
      lastCells: cells,
      lastJsonHostVars: new Map<string, unknown>([["laps", [1, 2, 3]]]),
    };
    const post = (message: HostToSandboxMessage) => posted.push(message);
    const onChannelsInvalidated = () => {
      post({
        type: "setHostVar",
        name: "front-fork",
        value: { kind: "channel", length: 0, t: new ArrayBuffer(0), v: new ArrayBuffer(0), w: new ArrayBuffer(0), windows: [] },
      });
    };

    // Act
    replayInitAndHostVars(post, state);
    onChannelsInvalidated();
    replaySetCells(post, state);

    // Assert
    expect(posted).toEqual([
      { type: "init", runtimeVersion: "1.0.0" },
      { type: "setHostVar", name: "laps", value: { kind: "json", value: [1, 2, 3] } },
      { type: "setHostVar", name: "front-fork", value: { kind: "channel", length: 0, t: new ArrayBuffer(0), v: new ArrayBuffer(0), w: new ArrayBuffer(0), windows: [] } },
      { type: "setCells", cells },
    ]);
  });
});

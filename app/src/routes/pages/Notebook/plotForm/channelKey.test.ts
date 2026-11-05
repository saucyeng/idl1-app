import { describe, expect, it } from "vitest";

import { channelKey, scopeFromOptions } from "./channelKey";

describe("channelKey", () => {
  it("channelKey — the chart's own view — the bare name, as every cell published before scopes", () => {
    expect(channelKey("front_v", { kind: "view" })).toBe("front_v");
  });

  it("channelKey — a lap and a range of the same channel — distinct keys, neither the bare name", () => {
    // Act
    const lap = channelKey("front_v", { kind: "lap", lap: 6 });
    const range = channelKey("front_v", { kind: "range", from: 5827.27, to: 5829.77 });

    // Assert
    expect(lap).toBe("front_v@lap:6");
    expect(range).toBe("front_v@5827.27..5829.77");
  });
});

describe("scopeFromOptions", () => {
  it("scopeFromOptions — the sandbox's runtime options — the same scope the host parsed, so the keys agree", () => {
    // Act
    const key = channelKey("front_v", scopeFromOptions({ from: 5827.27, to: 5829.77 }));

    // Assert
    expect(key).toBe(channelKey("front_v", { kind: "range", from: 5827.27, to: 5829.77 }));
  });

  it("scopeFromOptions — nothing, a reversed range or a fractional lap — the chart's own view", () => {
    expect(scopeFromOptions(undefined)).toEqual({ kind: "view" });
    expect(scopeFromOptions({ from: 2, to: 1 })).toEqual({ kind: "view" });
    expect(scopeFromOptions({ lap: 1.5 })).toEqual({ kind: "view" });
  });
});

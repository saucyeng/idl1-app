import { describe, expect, it } from "vitest";

import { NODE_KIND_CUES, NODE_KINDS, nodeKindOf } from "./nodeKind";

describe("nodeKindOf", () => {
  it("kind — a channel node — is a source", () => {
    expect(nodeKindOf("channel")).toBe("source");
  });

  it("kind — a definition node — is derived", () => {
    expect(nodeKindOf("definition")).toBe("derived");
  });

  it("kind — a chart node — is a chart", () => {
    expect(nodeKindOf("chart")).toBe("chart");
  });
});

describe("NODE_KIND_CUES", () => {
  it("cues — every legend kind — has an entry", () => {
    const missing = NODE_KINDS.filter((kind) => NODE_KIND_CUES[kind] === undefined);

    expect(missing).toEqual([]);
  });

  it("cues — the three kinds — are each distinguishable without colour", () => {
    const structural = NODE_KINDS.map((kind) => {
      const cue = NODE_KIND_CUES[kind];
      return `${cue.cardShapeClass}|${cue.nameFaceClass}|${cue.glyph}|${cue.bottomRule}`;
    });

    expect(new Set(structural).size).toBe(NODE_KINDS.length);
  });

  it("cues — the three kinds — use three distinct stripe tokens", () => {
    const stripes = NODE_KINDS.map((kind) => NODE_KIND_CUES[kind].stripeVar);

    expect(new Set(stripes).size).toBe(NODE_KINDS.length);
  });
});

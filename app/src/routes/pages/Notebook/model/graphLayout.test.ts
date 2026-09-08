import { describe, expect, it } from "vitest";

import { EMPTY_GRAPH_LAYOUT, readGraphLayout, writeGraphLayout, type GraphLayout } from "./graphLayout";

const BASE_DOC =
  "---\n" +
  "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
  "name: Fork tuning\n" +
  "constants: { rider_mass_kg: 82 }\n" +
  "---\n" +
  "```math id=a1b2c3d4\n" +
  "fork_velocity = differentiate([fork_travel])\n" +
  "```\n";

describe("readGraphLayout", () => {
  it("readGraphLayout — no front matter — returns the empty layout", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const layout = readGraphLayout(markdown);

    // Assert
    expect(layout).toEqual(EMPTY_GRAPH_LAYOUT);
  });

  it("readGraphLayout — front matter with no graph key — returns the empty layout", () => {
    // Act
    const layout = readGraphLayout(BASE_DOC);

    // Assert
    expect(layout).toEqual(EMPTY_GRAPH_LAYOUT);
  });

  it("readGraphLayout — the §3.7.1 worked example — reads both nodes and cells entries", () => {
    // Arrange
    const markdown =
      "---\n" +
      "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
      "name: Fork tuning\n" +
      "graph:\n" +
      "  nodes:\n" +
      "    fork_spec: [120, 80]\n" +
      "    peak_freq: [320, 80]\n" +
      "  cells:\n" +
      "    7f3c9a12: [80, 40]\n" +
      "---\n" +
      "```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const layout = readGraphLayout(markdown);

    // Assert
    expect(layout).toEqual({
      nodes: { fork_spec: [120, 80], peak_freq: [320, 80] },
      cells: { "7f3c9a12": [80, 40] },
    });
  });

  it("readGraphLayout — nodes only, no cells sub-key — reads nodes and leaves cells empty", () => {
    // Arrange
    const markdown = "---\nid: x\nname: y\ngraph:\n  nodes:\n    a: [1, 2]\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const layout = readGraphLayout(markdown);

    // Assert
    expect(layout).toEqual({ nodes: { a: [1, 2] }, cells: {} });
  });

  it("readGraphLayout — a flow-style graph key on its own start line — reads as absent", () => {
    // Arrange
    const markdown = "---\nid: x\nname: y\ngraph: {nodes: {a: [1, 2]}}\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const layout = readGraphLayout(markdown);

    // Assert
    expect(layout).toEqual(EMPTY_GRAPH_LAYOUT);
  });

  it("readGraphLayout — a malformed graph block (unrecognised interior line) — reads as absent", () => {
    // Arrange
    const markdown = "---\nid: x\nname: y\ngraph:\n  nodes:\n    a: [1, 2]\n  extra: weird\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const layout = readGraphLayout(markdown);

    // Assert
    expect(layout).toEqual(EMPTY_GRAPH_LAYOUT);
  });

  it("readGraphLayout — an entry naming a definition/cell that no longer exists — is still read, not pruned at read time", () => {
    // Arrange — §3.7.1: orphaned entries are ignored by the *consumer*
    // (the graph auto-places the node), but this module itself has no way
    // to know which names are live, so it must hand every stored entry
    // through unchanged.
    const markdown = "---\nid: x\nname: y\ngraph:\n  nodes:\n    ghost_name: [1, 2]\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const layout = readGraphLayout(markdown);

    // Assert
    expect(layout).toEqual({ nodes: { ghost_name: [1, 2] }, cells: {} });
  });
});

describe("writeGraphLayout", () => {
  it("writeGraphLayout — writing then reading back — round-trips exactly", () => {
    // Arrange
    const layout: GraphLayout = { nodes: { fork_spec: [120, 80], peak_freq: [320, 80] }, cells: { "7f3c9a12": [80, 40] } };

    // Act
    const written = writeGraphLayout(BASE_DOC, layout);
    const readBack = readGraphLayout(written);

    // Assert
    expect(readBack).toEqual(layout);
  });

  it("writeGraphLayout — every byte outside the graph block is untouched", () => {
    // Arrange
    const layout: GraphLayout = { nodes: { fork_velocity: [10, 20] }, cells: {} };

    // Act
    const written = writeGraphLayout(BASE_DOC, layout);

    // Assert
    expect(written).toContain("constants: { rider_mass_kg: 82 }");
    expect(written).toContain("fork_velocity = differentiate([fork_travel])");
    expect(written.split("\n").filter((l) => l === "graph:")).toHaveLength(1);
  });

  it("writeGraphLayout — an empty layout on a document with no graph key — is a byte-for-byte no-op", () => {
    // Act
    const written = writeGraphLayout(BASE_DOC, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(written).toBe(BASE_DOC);
  });

  it("writeGraphLayout — an empty layout on a document that has a graph key — removes the key entirely", () => {
    // Arrange
    const withLayout = writeGraphLayout(BASE_DOC, { nodes: { a: [1, 2] }, cells: {} });

    // Act
    const written = writeGraphLayout(withLayout, EMPTY_GRAPH_LAYOUT);

    // Assert
    expect(written).toBe(BASE_DOC);
  });

  it("writeGraphLayout — replacing an existing well-formed block — overwrites it wholesale, not merged", () => {
    // Arrange
    const withOld = writeGraphLayout(BASE_DOC, { nodes: { a: [1, 2], b: [3, 4] }, cells: {} });

    // Act
    const written = writeGraphLayout(withOld, { nodes: { a: [9, 9] }, cells: {} });

    // Assert
    expect(readGraphLayout(written)).toEqual({ nodes: { a: [9, 9] }, cells: {} });
  });

  it("writeGraphLayout — replacing a malformed existing block — replaces it wholesale rather than duplicating the key", () => {
    // Arrange
    const malformed = "---\nid: x\nname: y\ngraph:\n  nodes:\n    a: [1, 2]\n  extra: weird\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const written = writeGraphLayout(malformed, { nodes: { b: [5, 6] }, cells: {} });

    // Assert
    expect(written.split("\n").filter((l) => l === "graph:")).toHaveLength(1);
    expect(readGraphLayout(written)).toEqual({ nodes: { b: [5, 6] }, cells: {} });
  });

  it("writeGraphLayout — a hand-edited flow-style graph key on its own start line — is found and replaced wholesale, not duplicated", () => {
    // Arrange — the malformed *start* line itself, not just its interior
    // (see the exact-interior-mismatch test above, which this complements).
    const malformed = "---\nid: x\nname: y\ngraph: {nodes: {a: [1, 2]}}\n---\n```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const written = writeGraphLayout(malformed, { nodes: { b: [5, 6] }, cells: {} });

    // Assert
    expect(written.split("\n").filter((l) => /^graph:/.test(l))).toHaveLength(1);
    expect(readGraphLayout(written)).toEqual({ nodes: { b: [5, 6] }, cells: {} });
  });

  it("writeGraphLayout — a document with no front matter — returns the markdown unchanged", () => {
    // Arrange
    const markdown = "```math id=a1b2c3d4\nx = 1\n```\n";

    // Act
    const written = writeGraphLayout(markdown, { nodes: { a: [1, 2] }, cells: {} });

    // Assert
    expect(written).toBe(markdown);
  });

  it("writeGraphLayout — a key naming neither a valid identifier nor a hex8 — is dropped, never written unrecognisably", () => {
    // Arrange
    const layout: GraphLayout = { nodes: { "not an identifier": [1, 2], ok_name: [3, 4] }, cells: {} };

    // Act
    const written = writeGraphLayout(BASE_DOC, layout);

    // Assert
    expect(readGraphLayout(written)).toEqual({ nodes: { ok_name: [3, 4] }, cells: {} });
  });
});

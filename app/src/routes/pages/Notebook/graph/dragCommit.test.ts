import { describe, expect, it } from "vitest";

import { readGraphLayout } from "../model/graphLayout";
import { commitDrag, commitTidy } from "./dragCommit";

const BASE_DOC =
  "---\n" +
  "id: 9f3c1e2d-4b6a-4f1c-9c3d-2a7e8f9b0c1d\n" +
  "name: Fork tuning\n" +
  "constants: { rider_mass_kg: 82 }\n" +
  "---\n" +
  "```math id=a1b2c3d4\n" +
  "fork_velocity = differentiate([fork_travel])\n" +
  "```\n";

describe("commitDrag", () => {
  it("commitDrag — a definition node — writes its position under graph.nodes, keyed by name", () => {
    // Act
    const written = commitDrag(BASE_DOC, { kind: "node", name: "fork_velocity" }, 120, 80);

    // Assert
    expect(readGraphLayout(written)).toEqual({ nodes: { fork_velocity: [120, 80] }, cells: {} });
  });

  it("commitDrag — a cell group — writes its position under graph.cells, keyed by hex8 id", () => {
    // Act
    const written = commitDrag(BASE_DOC, { kind: "group", cellId: "a1b2c3d4" }, 40, 60);

    // Assert
    expect(readGraphLayout(written)).toEqual({ nodes: {}, cells: { a1b2c3d4: [40, 60] } });
  });

  it("commitDrag — a fractional canvas position — rounds to the nearest integer before writing", () => {
    // Act
    const written = commitDrag(BASE_DOC, { kind: "node", name: "fork_velocity" }, 120.6, 79.4);

    // Assert — and the round-trip through readGraphLayout must not degrade
    // to EMPTY_GRAPH_LAYOUT, which is what a stray decimal point would do.
    expect(readGraphLayout(written)).toEqual({ nodes: { fork_velocity: [121, 79] }, cells: {} });
  });

  it("commitDrag — moving a node again — overwrites its own entry, not a second one", () => {
    // Arrange
    const oncePlaced = commitDrag(BASE_DOC, { kind: "node", name: "fork_velocity" }, 100, 100);

    // Act
    const movedAgain = commitDrag(oncePlaced, { kind: "node", name: "fork_velocity" }, 200, 200);

    // Assert
    expect(readGraphLayout(movedAgain)).toEqual({ nodes: { fork_velocity: [200, 200] }, cells: {} });
  });

  it("commitDrag — moving one node — leaves an existing sibling entry and every other front-matter byte untouched", () => {
    // Arrange
    const withOne = commitDrag(BASE_DOC, { kind: "node", name: "fork_velocity" }, 10, 10);

    // Act
    const withBoth = commitDrag(withOne, { kind: "group", cellId: "a1b2c3d4" }, 300, 400);

    // Assert
    expect(readGraphLayout(withBoth)).toEqual({ nodes: { fork_velocity: [10, 10] }, cells: { a1b2c3d4: [300, 400] } });
    expect(withBoth).toContain("constants: { rider_mass_kg: 82 }");
  });
});

describe("commitTidy", () => {
  const FRESH: Record<string, [number, number]> = { "def:fork_velocity": [0, 0], "def:shock_velocity": [256, 96], "channel:fork_travel": [0, 96] };
  const NAMES = new Map([
    ["def:fork_velocity", "fork_velocity"],
    ["def:shock_velocity", "shock_velocity"],
  ]);

  it("commitTidy — a fresh auto-layout — writes every definition's position in one settle", () => {
    // Act
    const written = commitTidy(BASE_DOC, FRESH, NAMES);

    // Assert
    expect(readGraphLayout(written)).toEqual({ nodes: { fork_velocity: [0, 0], shock_velocity: [256, 96] }, cells: {} });
  });

  it("commitTidy — a channel node — is skipped, having no stored-position home", () => {
    // Act
    const written = commitTidy(BASE_DOC, FRESH, NAMES);

    // Assert
    expect(Object.keys(readGraphLayout(written).nodes)).toEqual(["fork_velocity", "shock_velocity"]);
  });

  it("commitTidy — an existing position it recomputes — is overwritten", () => {
    // Arrange
    const placed = commitDrag(BASE_DOC, { kind: "node", name: "fork_velocity" }, 999, 999);

    // Act
    const written = commitTidy(placed, FRESH, NAMES);

    // Assert
    expect(readGraphLayout(written).nodes.fork_velocity).toEqual([0, 0]);
  });

  it("commitTidy — an orphaned entry it cannot place — is preserved, never pruned (§3.7.1)", () => {
    // Arrange -- a definition that no longer exists in the model, plus a
    // subgraph frame position Tidy has nothing to say about.
    const withOrphan = commitDrag(BASE_DOC, { kind: "node", name: "deleted_definition" }, 10, 20);
    const withFrame = commitDrag(withOrphan, { kind: "group", cellId: "a1b2c3d4" }, 30, 40);

    // Act
    const written = commitTidy(withFrame, FRESH, NAMES);

    // Assert
    expect(readGraphLayout(written)).toEqual({
      nodes: { deleted_definition: [10, 20], fork_velocity: [0, 0], shock_velocity: [256, 96] },
      cells: { a1b2c3d4: [30, 40] },
    });
  });

  it("commitTidy — a fractional canvas position — rounds before writing, like a drag does", () => {
    // Act
    const written = commitTidy(BASE_DOC, { "def:fork_velocity": [120.6, 79.4] }, NAMES);

    // Assert
    expect(readGraphLayout(written).nodes.fork_velocity).toEqual([121, 79]);
  });
});

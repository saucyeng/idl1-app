import { describe, expect, it } from "vitest";

import { readGraphLayout } from "../model/graphLayout";
import { commitDrag } from "./dragCommit";

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

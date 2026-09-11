import { describe, expect, it } from "vitest";

import {
  NOTEBOOK_TOOLBAR_GROUPS,
  TOOLBAR_COLLAPSE_ORDER,
  TOOLBAR_GROUP_GAP,
  TOOLBAR_GROUP_ORDER,
  TOOLBAR_OVERFLOW_WIDTH,
  toolbarLayout,
  type ToolbarGroupId,
} from "./toolbarLayout";

/** The width at which every group fits with its labels — the widest row
 *  this layout ever produces, computed from the specs rather than written
 *  out, so retuning a nominal width does not silently rot these tests. */
function labelledRowWidth(): number {
  const sum = NOTEBOOK_TOOLBAR_GROUPS.reduce((total, spec) => total + spec.labelledWidth, 0);
  return sum + (NOTEBOOK_TOOLBAR_GROUPS.length - 1) * TOOLBAR_GROUP_GAP;
}

/** Same, with every label dropped. */
function compactRowWidth(): number {
  const sum = NOTEBOOK_TOOLBAR_GROUPS.reduce((total, spec) => total + spec.compactWidth, 0);
  return sum + (NOTEBOOK_TOOLBAR_GROUPS.length - 1) * TOOLBAR_GROUP_GAP;
}

describe("toolbarLayout — a row wide enough for every label — keeps all six groups labelled", () => {
  it("returns every group inline, labelled, with nothing in the overflow menu", () => {
    // Arrange
    const width = labelledRowWidth();

    // Act
    const layout = toolbarLayout(width);

    // Assert
    expect(layout.labelled).toBe(true);
    expect(layout.inline).toEqual([...TOOLBAR_GROUP_ORDER]);
    expect(layout.overflow).toEqual([]);
  });

  it("a row one pixel too narrow for the labels drops the labels, not a group", () => {
    // Arrange
    const width = labelledRowWidth() - 1;

    // Act
    const layout = toolbarLayout(width);

    // Assert
    expect(layout.labelled).toBe(false);
    expect(layout.inline).toEqual([...TOOLBAR_GROUP_ORDER]);
    expect(layout.overflow).toEqual([]);
  });
});

describe("toolbarLayout — a row too narrow even unlabelled — collapses whole groups right to left", () => {
  it("the first group to leave the row is actions", () => {
    // Arrange
    const width = compactRowWidth() - 1;

    // Act
    const layout = toolbarLayout(width);

    // Assert
    expect(layout.overflow).toEqual(["actions"]);
    expect(layout.inline).toEqual(["columns", "document", "view", "window", "transport"]);
  });

  it("groups leave in the declared collapse order as the row keeps narrowing", () => {
    // Arrange
    const widths = [compactRowWidth() - 1, 420, 300, 200, 40];

    // Act
    const sequences = widths.map((w) => toolbarLayout(w).overflow);

    // Assert
    sequences.forEach((overflow) => {
      expect(overflow).toEqual(TOOLBAR_COLLAPSE_ORDER.slice(0, overflow.length));
    });
    expect(sequences[sequences.length - 1]).toEqual([...TOOLBAR_COLLAPSE_ORDER]);
  });

  it("a group is never half-collapsed — inline and overflow together are always all six", () => {
    // Arrange
    const widths = [0, 40, 120, 200, 300, 420, 600, 900, 1600];

    // Act
    const results = widths.map((w) => toolbarLayout(w));

    // Assert
    results.forEach((layout) => {
      const seen = [...layout.inline, ...layout.overflow].sort();
      expect(seen).toEqual([...TOOLBAR_GROUP_ORDER].sort());
    });
  });
});

describe("toolbarLayout — the window chip and the transport — never collapse at any width", () => {
  it("both stay inline down to a zero-width row", () => {
    // Arrange
    const widths = [0, 1, 40, 120, 300, 900];

    // Act
    const results = widths.map((w) => toolbarLayout(w));

    // Assert
    results.forEach((layout) => {
      expect(layout.inline).toContain<ToolbarGroupId>("window");
      expect(layout.inline).toContain<ToolbarGroupId>("transport");
      expect(layout.overflow).not.toContain<ToolbarGroupId>("window");
      expect(layout.overflow).not.toContain<ToolbarGroupId>("transport");
    });
  });

  it("the tightest possible row is exactly those two, unlabelled", () => {
    // Arrange
    const width = 0;

    // Act
    const layout = toolbarLayout(width);

    // Assert
    expect(layout.inline).toEqual(["window", "transport"]);
    expect(layout.labelled).toBe(false);
  });
});

describe("toolbarLayout — the overflow trigger's own width — is charged only once a group collapses", () => {
  it("a row that fits unlabelled is not narrowed by a menu it does not render", () => {
    // Arrange
    const width = compactRowWidth();

    // Act
    const layout = toolbarLayout(width);

    // Assert
    expect(layout.overflow).toEqual([]);
    expect(TOOLBAR_OVERFLOW_WIDTH).toBeGreaterThan(0);
  });

  it("a collapsed row leaves room for the trigger on top of its inline groups", () => {
    // Arrange
    const layout = toolbarLayout(420);
    const specById = new Map(NOTEBOOK_TOOLBAR_GROUPS.map((s) => [s.id, s]));

    // Act
    const used =
      layout.inline.reduce((total, id) => total + (specById.get(id)?.compactWidth ?? 0), 0) +
      (layout.inline.length - 1) * TOOLBAR_GROUP_GAP +
      TOOLBAR_OVERFLOW_WIDTH;

    // Assert
    expect(layout.overflow.length).toBeGreaterThan(0);
    expect(used).toBeLessThanOrEqual(420);
  });
});

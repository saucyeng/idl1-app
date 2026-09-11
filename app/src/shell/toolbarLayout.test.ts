import { describe, expect, it } from "vitest";

import {
  inlineGroupSpans,
  packedSpans,
  NOTEBOOK_TOOLBAR_GROUPS,
  TOOLBAR_COLLAPSE_ORDER,
  TOOLBAR_GROUP_GAP,
  TOOLBAR_GROUP_ORDER,
  TOOLBAR_OVERFLOW_WIDTH,
  toolbarLayout,
  withMeasuredGroupWidths,
  type MeasuredGroupWidth,
  type ToolbarGroupId,
  type ToolbarGroupSpec,
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
  it("the first group to leave the row is view", () => {
    // Arrange
    const width = compactRowWidth() - 1;

    // Act
    const layout = toolbarLayout(width);

    // Assert
    expect(layout.overflow).toEqual(["view"]);
    expect(layout.inline).toEqual(["panels", "file", "library", "window", "transport"]);
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

describe("withMeasuredGroupWidths — a measured group — replaces its nominal footprint", () => {
  it("substitutes the measured width for the label state it was measured in, and keeps the other nominal", () => {
    // Arrange
    const measured = new Map<ToolbarGroupId, MeasuredGroupWidth>([["view", { labelledWidth: 431 }]]);

    // Act
    const specs = withMeasuredGroupWidths(measured);

    // Assert
    const view = specs.find((s) => s.id === "view");
    expect(view?.labelledWidth).toBe(431);
    expect(view?.compactWidth).toBe(NOTEBOOK_TOOLBAR_GROUPS.find((s) => s.id === "view")?.compactWidth);
  });

  it("ignores a zero measurement, which a hidden or unlaid-out row reports", () => {
    // Arrange
    const measured = new Map<ToolbarGroupId, MeasuredGroupWidth>([["library", { labelledWidth: 0, compactWidth: 0 }]]);

    // Act
    const specs = withMeasuredGroupWidths(measured);

    // Assert
    expect(specs.find((s) => s.id === "library")).toEqual(NOTEBOOK_TOOLBAR_GROUPS.find((s) => s.id === "library"));
  });

  it("leaves a group nobody has measured entirely alone", () => {
    // Arrange
    const measured = new Map<ToolbarGroupId, MeasuredGroupWidth>();

    // Act
    const specs = withMeasuredGroupWidths(measured);

    // Assert
    expect(specs).toEqual([...NOTEBOOK_TOOLBAR_GROUPS]);
  });
});

describe("toolbarLayout — groups wider than their nominal footprints — never overlap on the row", () => {
  /** The reported bug's own shape (ruling R216 item 4, carried forward to
   *  R225's groups): the presets picker and the split buttons grow past the
   *  nominal widths declared in the module, so a layout decided on the
   *  nominals keeps reporting "it fits" and the row's flex shrink
   *  compresses each group's box below its contents. These are what the row
   *  actually measures once it measures. */
  const MEASURED = new Map<ToolbarGroupId, MeasuredGroupWidth>([
    ["panels", { labelledWidth: 236, compactWidth: 144 }],
    ["file", { labelledWidth: 232, compactWidth: 152 }],
    ["library", { labelledWidth: 132, compactWidth: 78 }],
    ["view", { labelledWidth: 520, compactWidth: 250 }],
    ["window", { labelledWidth: 226, compactWidth: 168 }],
    ["transport", { labelledWidth: 268, compactWidth: 160 }],
  ]);

  /** Every pair of neighbouring inline groups, as `[left, right]`. */
  function neighbours(specs: readonly ToolbarGroupSpec[], width: number) {
    const spans = inlineGroupSpans(toolbarLayout(width, specs), width, specs);
    return spans.slice(0, -1).map((left, index) => [left, spans[index + 1]!] as const);
  }

  it.each([1100, 1300, 1600])("at %i px no group's contents reach into the next group's box", (width) => {
    // Arrange
    const specs = withMeasuredGroupWidths(MEASURED);

    // Act
    const pairs = neighbours(specs, width);

    // Assert
    expect(pairs.length).toBeGreaterThan(0);
    pairs.forEach(([left, right]) => {
      expect(left.contentEnd).toBeLessThanOrEqual(right.start);
    });
  });

  it("a layout decided on the stale nominal footprints does overlap — the bug this guards against", () => {
    // Arrange
    const real = withMeasuredGroupWidths(MEASURED);
    // 1600 px: the nominal footprints say all six groups fit *with labels*
    // (1295 px), the real ones need 1679 px. That gap is the bug.
    const staleDecision = toolbarLayout(1600, NOTEBOOK_TOOLBAR_GROUPS);

    // Act
    const spans = inlineGroupSpans(staleDecision, 1600, real);
    const overlapping = spans.slice(0, -1).filter((left, index) => left.contentEnd > spans[index + 1]!.start);

    // Assert
    expect(overlapping.length).toBeGreaterThan(0);
  });

  it("no inline group is ever compressed below its own contents, at any width", () => {
    // Arrange
    const specs = withMeasuredGroupWidths(MEASURED);
    // From just above the narrowest row that can hold the two non-collapsing
    // groups plus the "⋯" trigger (376 px; R212 rule 4's floor is asserted
    // separately below) upwards.
    const widths = [400, 480, 700, 900, 1100, 1300, 1600, 2400];

    // Act
    const compressed = widths.flatMap((width) =>
      inlineGroupSpans(toolbarLayout(width, specs), width, specs)
        .filter((span) => span.contentEnd > span.end + 0.5)
        .map((span) => `${span.id}@${width}`),
    );

    // Assert
    expect(compressed).toEqual([]);
  });

  it("below the floor the two non-collapsing groups stay and the row clips them, per R212 rule 4", () => {
    // Arrange
    const specs = withMeasuredGroupWidths(MEASURED);

    // Act
    const layout = toolbarLayout(320, specs);
    const spans = inlineGroupSpans(layout, 320, specs);

    // Assert
    expect(layout.inline).toEqual(["window", "transport"]);
    expect(spans.some((span) => span.contentEnd > span.end)).toBe(true);
  });
});

describe("packedSpans — two sibling buttons inside one group — never overlap (R225 item 3)", () => {
  /** One group's contents at R225 item 3's geometry: big buttons 36 px
   *  unlabelled and about 64 px labelled, a split button's chevron adding
   *  16 px, at the Notebook's 6 px control gap. These are the buttons that
   *  overlapped: Save, Export, Create, Rescan, the gesture select and the
   *  X-axis select, which were siblings with the default `flex-shrink: 1`. */
  const BUTTON_GAP = 6;
  const BUTTONS = [
    { id: "open", width: 80 },
    { id: "save", width: 80 },
    { id: "import", width: 80 },
    { id: "view", width: 80 },
    { id: "presets", width: 140 },
  ];

  /** The natural total: what a `flex-nowrap` container of `shrink-0`
   *  children reports to the `ResizeObserver`, and therefore the width the
   *  group is laid out at from the second frame onwards. */
  const NATURAL = BUTTONS.reduce((total, button) => total + button.width, 0) + (BUTTONS.length - 1) * BUTTON_GAP;

  it.each([NATURAL, NATURAL + 40, 640, 900, 1400])("at %i px no button's contents reach into the next button's box", (width) => {
    // Arrange
    const items = BUTTONS;

    // Act
    const spans = packedSpans(items, width, BUTTON_GAP);
    const overlapping = spans.slice(0, -1).filter((left, index) => left.contentEnd > spans[index + 1]!.start + 0.5);

    // Assert
    expect(spans.length).toBe(items.length);
    expect(overlapping.map((span) => span.id)).toEqual([]);
  });

  it("a group given its buttons' real total width compresses none of them", () => {
    // Arrange
    const natural = NATURAL;

    // Act
    const spans = packedSpans(BUTTONS, natural, BUTTON_GAP);

    // Assert
    expect(spans.every((span) => span.end >= span.contentEnd - 0.5)).toBe(true);
  });

  it("a group squeezed below its buttons' total does compress them — the bug, and why the markup says shrink-0", () => {
    // Arrange
    const natural = NATURAL;

    // Act
    const spans = packedSpans(BUTTONS, natural - 200, BUTTON_GAP);

    // Assert
    expect(spans.some((span) => span.contentEnd > span.end)).toBe(true);
  });

  it("the trigger's reserved width is held back from the last button, not taken out of the row", () => {
    // Arrange
    const width = 400;

    // Act
    const withoutTrigger = packedSpans(BUTTONS, width, BUTTON_GAP, 0);
    const withTrigger = packedSpans(BUTTONS, width, BUTTON_GAP, TOOLBAR_OVERFLOW_WIDTH);

    // Assert
    const lastWithout = withoutTrigger[withoutTrigger.length - 1]!;
    const lastWith = withTrigger[withTrigger.length - 1]!;
    expect(lastWith.end).toBeLessThan(lastWithout.end);
  });
});

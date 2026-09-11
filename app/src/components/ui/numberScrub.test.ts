import { describe, expect, it } from "vitest";

import { scrubValue, snapToRange, SCRUB_PIXELS_PER_STEP } from "./numberScrub";

describe("scrubValue — a horizontal drag — moves one step every few pixels", () => {
  it("dragging right raises the value and dragging left lowers it, symmetrically", () => {
    // Arrange
    const range = { step: 1 };

    // Act
    const right = scrubValue(10, SCRUB_PIXELS_PER_STEP * 3, range);
    const left = scrubValue(10, -SCRUB_PIXELS_PER_STEP * 3, range);

    // Assert
    expect(right).toBe(13);
    expect(left).toBe(7);
  });

  it("a drag shorter than one step's worth of pixels does not move the value", () => {
    // Act
    const barely = scrubValue(10, 1, { step: 1 });

    // Assert
    expect(barely).toBe(10);
  });

  it("returning the pointer to where it started returns the value it started at", () => {
    // Arrange
    const range = { step: 0.5 };

    // Act
    const away = scrubValue(2, 40, range);
    const back = scrubValue(2, 0, range);

    // Assert
    expect(away).not.toBe(2);
    expect(back).toBe(2);
  });

  it("the field's own step is what one step means", () => {
    // Act
    const coarseStep = scrubValue(100, SCRUB_PIXELS_PER_STEP * 2, { step: 256 });

    // Assert
    expect(coarseStep).toBe(612);
  });
});

describe("scrubValue — modifiers — give a fine and a coarse drag", () => {
  it("shift moves a tenth of a step per pixel and alt moves ten", () => {
    // Arrange
    const dx = SCRUB_PIXELS_PER_STEP * 4;

    // Act
    const plain = scrubValue(0, dx, { step: 1 });
    const fine = scrubValue(0, dx, { step: 1 }, { shiftKey: true });
    const coarse = scrubValue(0, dx, { step: 1 }, { altKey: true });

    // Assert
    expect(plain).toBe(4);
    expect(fine).toBe(0.4);
    expect(coarse).toBe(40);
  });

  it("shift wins when both modifiers are held — the careful one, not the destructive one", () => {
    // Act
    const both = scrubValue(0, SCRUB_PIXELS_PER_STEP * 4, { step: 1 }, { shiftKey: true, altKey: true });

    // Assert
    expect(both).toBe(0.4);
  });
});

describe("snapToRange — bounds and granularity — are respected by every scrub", () => {
  it("a drag past a bound stops at it rather than running off", () => {
    // Arrange
    const range = { step: 1, min: 0, max: 10 };

    // Act
    const high = scrubValue(9, SCRUB_PIXELS_PER_STEP * 100, range);
    const low = scrubValue(1, -SCRUB_PIXELS_PER_STEP * 100, range);

    // Assert
    expect(high).toBe(10);
    expect(low).toBe(0);
  });

  it("values land on the step grid, measured from the minimum", () => {
    // Act
    const snapped = snapToRange(7, { step: 5, min: 1 });

    // Assert
    expect(snapped).toBe(6);
  });

  it("a fractional step does not leak binary float error into the field", () => {
    // Act
    const snapped = snapToRange(0.30000000000000004, { step: 0.1 });
    const scrubbed = scrubValue(0.1, SCRUB_PIXELS_PER_STEP * 2, { step: 0.1 });

    // Assert
    expect(snapped).toBe(0.3);
    expect(scrubbed).toBe(0.3);
  });

  it("a missing or nonsensical step reads as one", () => {
    // Act
    const noStep = scrubValue(5, SCRUB_PIXELS_PER_STEP, {});
    const zeroStep = scrubValue(5, SCRUB_PIXELS_PER_STEP, { step: 0 });
    const negativeStep = scrubValue(5, SCRUB_PIXELS_PER_STEP, { step: -3 });

    // Assert
    expect([noStep, zeroStep, negativeStep]).toEqual([6, 6, 6]);
  });
});

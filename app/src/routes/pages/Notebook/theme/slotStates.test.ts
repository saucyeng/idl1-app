import { describe, expect, it } from "vitest";

import { emptySlotMessage, errorSlotMessage, type EmptyReason } from "./slotStates";

describe("emptySlotMessage — each reason — one sentence naming an action", () => {
  const reasons: EmptyReason[] = ["no-data-in-range", "raster-pending", "no-lap-selected"];

  it.each(reasons)("%s produces a non-empty, single-sentence message", (reason) => {
    // Arrange & Act
    const message = emptySlotMessage(reason);

    // Assert
    expect(message.length).toBeGreaterThan(0);
    expect(message.split(". ").length).toBeLessThanOrEqual(1);
  });

  it("no-data-in-range names the next action", () => {
    // Arrange & Act
    const message = emptySlotMessage("no-data-in-range");

    // Assert
    expect(message).toBe("No samples in this range — zoom out or pick a different lap.");
  });

  it("raster-pending names the next state", () => {
    // Arrange & Act
    const message = emptySlotMessage("raster-pending");

    // Assert
    expect(message).toBe("Loading raster — this fills in once the fetch settles.");
  });

  it("no-lap-selected names the next action", () => {
    // Arrange & Act
    const message = emptySlotMessage("no-lap-selected");

    // Assert
    expect(message).toBe("No lap is selected — pick one in the worksheet bar.");
  });
});

describe("errorSlotMessage — an error with a message — returns it trimmed", () => {
  it("returns the trimmed message text", () => {
    // Arrange
    const error = { message: "  fetch failed: 500  " };

    // Act
    const result = errorSlotMessage(error);

    // Assert
    expect(result).toBe("fetch failed: 500");
  });

  it("falls back to a generic sentence when the message is empty", () => {
    // Arrange
    const error = { message: "" };

    // Act
    const result = errorSlotMessage(error);

    // Assert
    expect(result).toBe("This chart failed to render.");
  });

  it("falls back to the generic sentence when the message is only whitespace", () => {
    // Arrange
    const error = { message: "   " };

    // Act
    const result = errorSlotMessage(error);

    // Assert
    expect(result).toBe("This chart failed to render.");
  });
});

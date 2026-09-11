import { describe, expect, it } from "vitest";

import { graphViewportAction, isTextEntry } from "./graphViewportKeys";

describe("graphViewportAction — R212's four canvas keys — map to their actions", () => {
  it("f and F fit, 0 resets to 100 %", () => {
    // Arrange
    const presses = ["f", "F", "0"].map((key) => ({ key, fromTextField: false }));

    // Act
    const actions = presses.map(graphViewportAction);

    // Assert
    expect(actions).toEqual(["fit", "fit", "reset"]);
  });

  it("every spelling of plus zooms in and every spelling of minus zooms out", () => {
    // Arrange
    const zoomIn = ["+", "=", "Add"].map((key) => ({ key, fromTextField: false }));
    const zoomOut = ["-", "_", "Subtract"].map((key) => ({ key, fromTextField: false }));

    // Act
    const inActions = zoomIn.map(graphViewportAction);
    const outActions = zoomOut.map(graphViewportAction);

    // Assert
    expect(inActions).toEqual(["zoom-in", "zoom-in", "zoom-in"]);
    expect(outActions).toEqual(["zoom-out", "zoom-out", "zoom-out"]);
  });

  it("any other key is not a canvas command", () => {
    // Arrange
    const presses = ["a", "Enter", "Escape", "1", "ArrowLeft", " "].map((key) => ({ key, fromTextField: false }));

    // Act
    const actions = presses.map(graphViewportAction);

    // Assert
    expect(actions).toEqual([null, null, null, null, null, null]);
  });
});

describe("graphViewportAction — a press inside a text field — is typing, not a command", () => {
  it("f typed into the node search box does not fit the view", () => {
    // Arrange
    const press = { key: "f", fromTextField: true };

    // Act
    const action = graphViewportAction(press);

    // Assert
    expect(action).toBeNull();
  });

  it("every command key is suppressed inside a text field", () => {
    // Arrange
    const presses = ["f", "F", "0", "+", "=", "-", "_"].map((key) => ({ key, fromTextField: true }));

    // Act
    const actions = presses.map(graphViewportAction);

    // Assert
    expect(actions.every((a) => a === null)).toBe(true);
  });
});

describe("isTextEntry — the places text is typed — are recognised by tag, not by class", () => {
  it("input, textarea, select and a contenteditable all count; a div does not", () => {
    // Arrange
    const targets = [
      { tagName: "INPUT", isContentEditable: false },
      { tagName: "TEXTAREA", isContentEditable: false },
      { tagName: "SELECT", isContentEditable: false },
      { tagName: "DIV", isContentEditable: true },
      { tagName: "DIV", isContentEditable: false },
    ] as unknown as EventTarget[];

    // Act
    const results = targets.map(isTextEntry);

    // Assert
    expect(results).toEqual([true, true, true, true, false]);
  });

  it("a null target, and one with no tag at all, are not text entries", () => {
    // Arrange
    const tagless = {} as unknown as EventTarget;

    // Act
    const results = [isTextEntry(null), isTextEntry(tagless)];

    // Assert
    expect(results).toEqual([false, false]);
  });
});

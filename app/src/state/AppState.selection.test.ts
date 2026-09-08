import { describe, expect, it } from "vitest";
import { appStateReducer, initialAppState } from "./AppState";
import type { SelectionWindow } from "./selection";

const sessionWindow = (sessionId: string, colour = "--chart-1"): SelectionWindow => ({
  sessionId,
  span: { kind: "session" },
  colour,
});

const lapWindow = (sessionId: string, lapNumber: number, colour = "--chart-1"): SelectionWindow => ({
  sessionId,
  span: { kind: "lap", lapNumber },
  colour,
});

describe("appStateReducer — selection slice", () => {
  it("initial state — an empty window list", () => {
    // Arrange
    const state = initialAppState;

    // Assert
    expect(state.selection).toEqual([]);
  });

  it("SET_WINDOWS action — replaces the whole list", () => {
    // Arrange
    const state = { ...initialAppState, selection: [sessionWindow("old-session")] };
    const windows = [sessionWindow("s1"), lapWindow("s1", 2)];

    // Act
    const next = appStateReducer(state, { type: "SET_WINDOWS", windows });

    // Assert
    expect(next.selection).toEqual(windows);
  });

  it("SET_WINDOWS with an empty list — clears the selection", () => {
    // Arrange
    const state = { ...initialAppState, selection: [sessionWindow("s1")] };

    // Act
    const next = appStateReducer(state, { type: "SET_WINDOWS", windows: [] });

    // Assert
    expect(next.selection).toEqual([]);
  });

  it("TOGGLE_WINDOW with modifier replace — delegates to nextWindows, discarding the prior selection", () => {
    // Arrange
    const state = { ...initialAppState, selection: [sessionWindow("s1"), lapWindow("s2", 3)] };

    // Act
    const next = appStateReducer(state, {
      type: "TOGGLE_WINDOW",
      window: sessionWindow("s3"),
      modifier: "replace",
    });

    // Assert
    expect(next.selection).toEqual([sessionWindow("s3")]);
  });

  it("TOGGLE_WINDOW with modifier add — appends, preserving order", () => {
    // Arrange
    const state = { ...initialAppState, selection: [sessionWindow("s1")] };

    // Act
    const next = appStateReducer(state, {
      type: "TOGGLE_WINDOW",
      window: lapWindow("s1", 2),
      modifier: "add",
    });

    // Assert
    expect(next.selection).toEqual([sessionWindow("s1"), lapWindow("s1", 2)]);
  });

  it("TOGGLE_WINDOW with modifier toggle on a selected window — removes it, empty list is legal", () => {
    // Arrange
    const state = { ...initialAppState, selection: [sessionWindow("s1")] };

    // Act
    const next = appStateReducer(state, {
      type: "TOGGLE_WINDOW",
      window: sessionWindow("s1"),
      modifier: "toggle",
    });

    // Assert
    expect(next.selection).toEqual([]);
  });

  it("SET_WINDOW_COLOUR action — recolours only the window at the given index", () => {
    // Arrange
    const state = {
      ...initialAppState,
      selection: [sessionWindow("s1", "--chart-1"), lapWindow("s2", 1, "--chart-2")],
    };

    // Act
    const next = appStateReducer(state, { type: "SET_WINDOW_COLOUR", index: 1, colour: "--chart-5" });

    // Assert
    expect(next.selection).toEqual([sessionWindow("s1", "--chart-1"), lapWindow("s2", 1, "--chart-5")]);
  });

  it("SET_WINDOW_COLOUR action — does not change a window's sessionId or span", () => {
    // Arrange
    const state = { ...initialAppState, selection: [lapWindow("s1", 4, "--chart-1")] };

    // Act
    const next = appStateReducer(state, { type: "SET_WINDOW_COLOUR", index: 0, colour: "--chart-8" });

    // Assert
    expect(next.selection).toEqual([lapWindow("s1", 4, "--chart-8")]);
  });
});

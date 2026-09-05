import { describe, expect, it } from "vitest";
import { appStateReducer, initialAppState } from "./AppState";

describe("appStateReducer — selection slice", () => {
  it("initial state — sessionId and lapContext are both null", () => {
    // Arrange / Act
    const state = initialAppState;

    // Assert
    expect(state.selection).toEqual({ sessionId: null, lapContext: null });
  });

  it("SET_SELECTED_SESSION action — sets the session id and clears lapContext", () => {
    // Arrange
    const state = {
      ...initialAppState,
      selection: { sessionId: "old-session", lapContext: { mainLap: 3, overlayLaps: [1, 2] } },
    };

    // Act
    const next = appStateReducer(state, { type: "SET_SELECTED_SESSION", sessionId: "new-session" });

    // Assert
    expect(next.selection).toEqual({ sessionId: "new-session", lapContext: null });
  });

  it("SET_LAP_CONTEXT action — sets the lap context without touching sessionId", () => {
    // Arrange
    const state = { ...initialAppState, selection: { sessionId: "session-1", lapContext: null } };
    const lapContext = { mainLap: 2, overlayLaps: [1] };

    // Act
    const next = appStateReducer(state, { type: "SET_LAP_CONTEXT", lapContext });

    // Assert
    expect(next.selection).toEqual({ sessionId: "session-1", lapContext });
  });

  it("SET_LAP_CONTEXT action with null — clears an existing lap context", () => {
    // Arrange
    const state = {
      ...initialAppState,
      selection: { sessionId: "session-1", lapContext: { mainLap: 2, overlayLaps: [1] } },
    };

    // Act
    const next = appStateReducer(state, { type: "SET_LAP_CONTEXT", lapContext: null });

    // Assert
    expect(next.selection).toEqual({ sessionId: "session-1", lapContext: null });
  });

  it("SET_SELECTED_SESSION after a lapContext was set — clears the lapContext on session change", () => {
    // Arrange
    const withLap = appStateReducer(initialAppState, {
      type: "SET_SELECTED_SESSION",
      sessionId: "session-1",
    });
    const withLapContext = appStateReducer(withLap, {
      type: "SET_LAP_CONTEXT",
      lapContext: { mainLap: 1, overlayLaps: [] },
    });

    // Act
    const next = appStateReducer(withLapContext, {
      type: "SET_SELECTED_SESSION",
      sessionId: "session-2",
    });

    // Assert
    expect(next.selection).toEqual({ sessionId: "session-2", lapContext: null });
  });
});

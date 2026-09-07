import { describe, expect, it } from "vitest";

import { heroStateFrom, heroView } from "./hero";

describe("heroView", () => {
  it("disconnected — Connect in info emphasis, no timer", () => {
    // Arrange
    const state = "disconnected" as const;

    // Act
    const view = heroView(state);

    // Assert
    expect(view).toEqual({ label: "Connect", emphasis: "info", showTimer: false, pulsing: false });
  });

  it("idle — Start recording in good", () => {
    // Arrange
    const state = "idle" as const;

    // Act
    const view = heroView(state);

    // Assert
    expect(view.label).toBe("Start recording");
    expect(view.emphasis).toBe("good");
  });

  it("recording — Stop in hivis with timer and pulse", () => {
    // Arrange
    const state = "recording" as const;

    // Act
    const view = heroView(state);

    // Assert
    expect(view).toEqual({ label: "Stop", emphasis: "hivis", showTimer: true, pulsing: true });
  });
});

describe("heroStateFrom", () => {
  it("connected and recording — recording", () => {
    // Arrange
    const connected = true;
    const recording = true;

    // Act
    const state = heroStateFrom(connected, recording);

    // Assert
    expect(state).toBe("recording");
  });

  it("connected and not recording — idle", () => {
    // Arrange
    const connected = true;
    const recording = false;

    // Act
    const state = heroStateFrom(connected, recording);

    // Assert
    expect(state).toBe("idle");
  });

  it("not connected — disconnected regardless of recording", () => {
    // Arrange
    const connected = false;
    const recording = true;

    // Act
    const state = heroStateFrom(connected, recording);

    // Assert
    expect(state).toBe("disconnected");
  });
});

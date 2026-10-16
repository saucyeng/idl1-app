import { describe, expect, it } from "vitest";

import { initialLoggerLink, loggerLinkReducer } from "./loggerLink";
import type { LoggerLinkAction, LoggerLinkState } from "./loggerLink";

function run(actions: LoggerLinkAction[], from: LoggerLinkState = initialLoggerLink): LoggerLinkState {
  return actions.reduce(loggerLinkReducer, from);
}

describe("loggerLinkReducer", () => {
  it("transfer with a clean handoff — ends with a short reconnect", () => {
    // Arrange / Act
    const s = run([
      { type: "HANDED_OFF", deviceId: "d" },
      { type: "TRANSFER_ENDED", deviceId: "d", handedOff: true, wifiClosed: true },
    ]);

    // Assert
    expect(s.handedOff).toBeNull();
    expect(s.reconnect).toEqual({ deviceId: "d", longWait: false, thenRecord: false });
  });

  it("transfer whose WiFi dropped, Record pressed meanwhile — long wait, then record", () => {
    // Arrange / Act
    const s = run([
      { type: "HANDED_OFF", deviceId: "d" },
      { type: "RECORD_WHEN_BACK" },
      { type: "TRANSFER_ENDED", deviceId: "d", handedOff: true, wifiClosed: false },
    ]);

    // Assert
    expect(s.reconnect).toEqual({ deviceId: "d", longWait: true, thenRecord: true });
    expect(s.recordWhenBack).toBe(false);
  });

  it("transfer without a handoff — nothing to reconnect", () => {
    // Arrange / Act
    const s = run([{ type: "TRANSFER_ENDED", deviceId: "d", handedOff: false, wifiClosed: true }]);

    // Assert
    expect(s.reconnect).toBeNull();
  });

  it("RECONNECT_TAKEN — clears the request", () => {
    // Arrange
    const ended = run([{ type: "HANDED_OFF", deviceId: "d" }, { type: "TRANSFER_ENDED", deviceId: "d", handedOff: true, wifiClosed: true }]);

    // Act
    const s = loggerLinkReducer(ended, { type: "RECONNECT_TAKEN" });

    // Assert
    expect(s.reconnect).toBeNull();
  });
});

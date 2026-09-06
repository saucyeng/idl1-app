import { describe, expect, it } from "vitest";

import type { DeviceStatus } from "../../../ipc/device";
import { controlAvailability, transitionObserved } from "./control";

/** A `DeviceStatus` with every field defaulted to `null`/false except
 *  `logging`/`wifi_on`, which the caller overrides per case. */
function status(logging: boolean | null, wifi_on: boolean | null): DeviceStatus {
  return {
    wifi_on,
    logging,
    battery_pct: null,
    sd: null,
    gps: null,
    imu: null,
    firmware: null,
    ota_pending_verify: false,
    hr: null,
    hr_battery_pct: null,
  };
}

describe("controlAvailability", () => {
  it("controlAvailability — status is null (not polled yet) — offers nothing", () => {
    // Arrange / Act
    const result = controlAvailability(null);

    // Assert
    expect(result).toEqual({ canStartRecording: false, canStopRecording: false, canWifiOn: false, canWifiOff: false });
  });

  it("controlAvailability — logging false, wifi_on false (idle) — start recording and wifi on are offered, their opposites are not", () => {
    // Arrange / Act
    const result = controlAvailability(status(false, false));

    // Assert
    expect(result).toEqual({ canStartRecording: true, canStopRecording: false, canWifiOn: true, canWifiOff: false });
  });

  it("controlAvailability — logging true, wifi_on false (recording) — only stop recording is offered", () => {
    // Arrange / Act
    const result = controlAvailability(status(true, false));

    // Assert
    expect(result).toEqual({ canStartRecording: false, canStopRecording: true, canWifiOn: false, canWifiOff: false });
  });

  it("controlAvailability — logging false, wifi_on true (WiFi mode) — only wifi off is offered", () => {
    // Arrange / Act
    const result = controlAvailability(status(false, true));

    // Assert
    expect(result).toEqual({ canStartRecording: false, canStopRecording: false, canWifiOn: false, canWifiOff: true });
  });

  it("controlAvailability — logging true, wifi_on true (should be impossible, mutually exclusive) — offers only the exits, never both entries", () => {
    // Arrange / Act
    const result = controlAvailability(status(true, true));

    // Assert
    expect(result.canStartRecording).toBe(false);
    expect(result.canWifiOn).toBe(false);
  });

  it("controlAvailability — logging null (unreported) — start/stop recording are withheld, not guessed", () => {
    // Arrange / Act
    const result = controlAvailability(status(null, false));

    // Assert
    expect(result.canStartRecording).toBe(false);
    expect(result.canStopRecording).toBe(false);
  });

  it("controlAvailability — wifi_on null (unreported) — wifi on/off are withheld, not guessed", () => {
    // Arrange / Act
    const result = controlAvailability(status(false, null));

    // Assert
    expect(result.canWifiOn).toBe(false);
    expect(result.canWifiOff).toBe(false);
  });

  it("controlAvailability — both fields null (unreported) — offers nothing", () => {
    // Arrange / Act
    const result = controlAvailability(status(null, null));

    // Assert
    expect(result).toEqual({ canStartRecording: false, canStopRecording: false, canWifiOn: false, canWifiOff: false });
  });
});

describe("transitionObserved", () => {
  it("transitionObserved — start_recording, logging now true — observed", () => {
    expect(transitionObserved("start_recording", status(true, false))).toBe("observed");
  });

  it("transitionObserved — start_recording, logging still false — not-observed", () => {
    expect(transitionObserved("start_recording", status(false, false))).toBe("not-observed");
  });

  it("transitionObserved — start_recording, logging null — unreported", () => {
    expect(transitionObserved("start_recording", status(null, false))).toBe("unreported");
  });

  it("transitionObserved — stop_recording, logging now false — observed", () => {
    expect(transitionObserved("stop_recording", status(false, false))).toBe("observed");
  });

  it("transitionObserved — stop_recording, logging still true — not-observed", () => {
    expect(transitionObserved("stop_recording", status(true, false))).toBe("not-observed");
  });

  it("transitionObserved — stop_recording, logging null — unreported", () => {
    expect(transitionObserved("stop_recording", status(null, false))).toBe("unreported");
  });

  it("transitionObserved — wifi_on, wifi_on now true — observed", () => {
    expect(transitionObserved("wifi_on", status(false, true))).toBe("observed");
  });

  it("transitionObserved — wifi_on, wifi_on still false — not-observed", () => {
    expect(transitionObserved("wifi_on", status(false, false))).toBe("not-observed");
  });

  it("transitionObserved — wifi_on, wifi_on null — unreported", () => {
    expect(transitionObserved("wifi_on", status(false, null))).toBe("unreported");
  });

  it("transitionObserved — wifi_off, wifi_on now false — observed", () => {
    expect(transitionObserved("wifi_off", status(false, false))).toBe("observed");
  });

  it("transitionObserved — wifi_off, wifi_on still true — not-observed", () => {
    expect(transitionObserved("wifi_off", status(false, true))).toBe("not-observed");
  });

  it("transitionObserved — wifi_off, wifi_on null — unreported", () => {
    expect(transitionObserved("wifi_off", status(false, null))).toBe("unreported");
  });
});

import { describe, expect, it } from "vitest";

import type { DeviceStatus } from "../../../ipc/device";
import { defaultConfig } from "./config/defaults";
import { parseConfig } from "./config/model";
import { validateConfig } from "./config/validate";
import { checkPushMode, describePushResult, initialPushState, preparePush, pushReducer } from "./push";

/** A `DeviceStatus` with every field `null`/`false`, overridden per test —
 *  `checkPushMode` only reads `logging`/`wifi_on`, so the rest is filler. */
function statusWith(fields: Partial<DeviceStatus>): DeviceStatus {
  return {
    wifi_on: null,
    logging: null,
    battery_pct: null,
    sd: null,
    gps: null,
    imu: null,
    firmware: null,
    ota_pending_verify: false,
    hr: null,
    hr_battery_pct: null,
    logging_elapsed_s: null,
    battery_raw: null,
    sd_free_mib: null,
    gps_fix_quality: null,
    gps_sats: null,
    gps_hdop_x100: null,
    imu0: null,
    imu1: null,
    imu2: null,
    ...fields,
  };
}

describe("preparePush", () => {
  it("preparePush — a valid config — ok, and the JSON parses back to the same config", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");

    // Act
    const result = preparePush(config);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parsed = parseConfig(JSON.parse(result.json));
      expect(parsed.config).toEqual(config);
      expect(parsed.repairs).toEqual([]);
    }
  });

  it("preparePush — a config with one error-severity issue — not ok, no JSON produced, the issues returned", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");
    config.gps.sample_rate_hz = 99;

    // Act
    const result = preparePush(config);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path === "gps.sample_rate_hz" && issue.severity === "error")).toBe(true);
      expect("json" in result).toBe(false);
    }
  });

  it("preparePush — a config with only warnings — ok: warnings never block a push", () => {
    // Arrange — imu0 enabled with every axis off is a warning (SPEC §8's
    // ODR/range values are otherwise untouched, so no error fires).
    const config = defaultConfig("aabbccddeeff");
    config.imu.imu0.enabled = true;

    // Act
    const result = preparePush(config);
    const issues = validateConfig(config);

    // Assert
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("preparePush — a config carrying unknown keys — they survive into the pushed JSON verbatim", () => {
    // Arrange
    const config = defaultConfig("aabbccddeeff");
    config.unknown = { future_field: { nested: true } };

    // Act
    const result = preparePush(config);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.json).future_field).toEqual({ nested: true });
    }
  });
});

describe("checkPushMode", () => {
  it("checkPushMode — no status yet — not ok, waiting-for-status reason", () => {
    // Act
    const result = checkPushMode(null);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Waiting for the device's status before a push can be checked as safe.");
  });

  it("checkPushMode — idle (both false) — ok, no reason", () => {
    // Arrange
    const status = statusWith({ logging: false, wifi_on: false });

    // Act
    const result = checkPushMode(status);

    // Assert
    expect(result).toEqual({ ok: true, reason: null });
  });

  it("checkPushMode — recording — not ok, names recording specifically", () => {
    // Arrange
    const status = statusWith({ logging: true, wifi_on: false });

    // Act
    const result = checkPushMode(status);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("recording");
  });

  it("checkPushMode — WiFi mode — not ok, names WiFi specifically", () => {
    // Arrange
    const status = statusWith({ logging: false, wifi_on: true });

    // Act
    const result = checkPushMode(status);

    // Assert
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("WiFi");
  });

  it("checkPushMode — logging unreported (null) — not ok, never assumed idle from an unknown field", () => {
    // Arrange
    const status = statusWith({ logging: null, wifi_on: false });

    // Act
    const result = checkPushMode(status);

    // Assert
    expect(result.ok).toBe(false);
  });

  it("checkPushMode — wifi_on unreported (null) — not ok, never assumed idle from an unknown field", () => {
    // Arrange
    const status = statusWith({ logging: false, wifi_on: null });

    // Act
    const result = checkPushMode(status);

    // Assert
    expect(result.ok).toBe(false);
  });
});

describe("describePushResult", () => {
  it("describePushResult — reconnected and verified — \"config applied and verified\"", () => {
    expect(describePushResult(true, true)).toBe("Config applied and verified — the device is now running it.");
  });

  it("describePushResult — reconnected and mismatched — the try-again text", () => {
    expect(describePushResult(true, false)).toBe(
      "Config applied, but what the device is now running doesn't match what was pushed. Try pushing again.",
    );
  });

  it("describePushResult — reconnect failed — the \"reconnect when it's back\" text", () => {
    expect(describePushResult(false, null)).toBe(
      "Config applied, but the device didn't reconnect after its reboot. Reconnect when it's back to confirm the change took.",
    );
  });

  it("describePushResult — verify unavailable — the plain applied text", () => {
    expect(describePushResult(true, null)).toBe("Config applied, not verified.");
  });
});

describe("pushReducer", () => {
  it("pushReducer — PUSH_START while already pushing — no-op, one push at a time", () => {
    // Arrange
    const pushing = pushReducer(initialPushState, { type: "PUSH_START" });

    // Act
    const stillPushing = pushReducer(pushing, { type: "PUSH_START" });

    // Assert
    expect(stillPushing).toBe(pushing);
  });

  it("pushReducer — PUSH_SUCCEEDED — phase succeeded, message carried", () => {
    // Arrange
    const pushing = pushReducer(initialPushState, { type: "PUSH_START" });

    // Act
    const done = pushReducer(pushing, { type: "PUSH_SUCCEEDED", message: "Config applied, not verified." });

    // Assert
    expect(done.phase).toBe("succeeded");
    expect(done.message).toBe("Config applied, not verified.");
  });

  it("pushReducer — PUSH_FAILED — phase failed, message carried", () => {
    // Arrange
    const pushing = pushReducer(initialPushState, { type: "PUSH_START" });

    // Act
    const failed = pushReducer(pushing, { type: "PUSH_FAILED", message: "The device rejected the config it was sent." });

    // Assert
    expect(failed.phase).toBe("failed");
    expect(failed.message).toBe("The device rejected the config it was sent.");
  });
});

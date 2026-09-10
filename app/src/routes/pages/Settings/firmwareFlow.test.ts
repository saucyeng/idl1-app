import { describe, expect, it } from "vitest";

import type { OtaState } from "../../../ipc/device";
import {
  ROLL_BACK_INSTRUCTIONS,
  describeOtaError,
  flowCard,
  pushBlockedReason,
  withPushEnabled,
} from "./firmwareFlow";

describe("flowCard", () => {
  it("flowCard — idle — offers the file picker and is not busy", () => {
    // Arrange
    const state: OtaState = { phase: "idle" };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.busy).toBe(false);
    expect(card.actions.choose).toBe(true);
    expect(card.actions.confirm).toBe(false);
    expect(card.progress).toBeNull();
  });

  it("flowCard — downloading with a known total — shows the Flutter percentage title", () => {
    // Arrange
    const state: OtaState = { phase: "downloading", done_bytes: 400, total_bytes: 1000, pct: 40 };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.title).toBe("Downloading update… 40%");
    expect(card.progress).toEqual({ pct: 40, label: "Downloading firmware" });
    expect(card.busy).toBe(true);
  });

  it("flowCard — downloading with an unknown total — shows an indeterminate bar, never a fabricated number", () => {
    // Arrange
    const state: OtaState = { phase: "downloading", done_bytes: 400, total_bytes: null, pct: null };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.title).toBe("Downloading update… …");
    expect(card.progress?.pct).toBeNull();
  });

  it("flowCard — pushing — shows the Flutter title and blocks every action", () => {
    // Arrange
    const state: OtaState = { phase: "pushing", done_bytes: 50, total_bytes: 100, pct: 50 };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.title).toBe("Pushing firmware… 50%");
    expect(card.actions).toEqual({ choose: false, push: false, confirm: false, rollBack: false });
  });

  it("flowCard — rebooting — carries both Flutter lines", () => {
    // Arrange
    const state: OtaState = { phase: "rebooting" };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.title).toBe("Device is rebooting…");
    expect(card.detail).toBe("Reconnecting in a few seconds.");
  });

  it("flowCard — reconnecting — names the attempt out of the retry budget", () => {
    // Arrange
    const state: OtaState = { phase: "reconnecting", attempt: 3, max_attempts: 20 };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.detail).toBe("Attempt 3 of 20.");
    expect(card.busy).toBe(true);
  });

  it("flowCard — pending verify with auto-confirm armed — stays busy and offers no decision", () => {
    // Arrange
    const state: OtaState = { phase: "pending_verify", auto_confirm_armed: true };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.busy).toBe(true);
    expect(card.actions.confirm).toBe(false);
    expect(card.actions.rollBack).toBe(false);
  });

  it("flowCard — pending verify unarmed — asks the user with the Flutter wording", () => {
    // Arrange
    const state: OtaState = { phase: "pending_verify", auto_confirm_armed: false };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.title).toBe("New firmware is running — confirm to commit, or power-cycle the device to roll back.");
    expect(card.actions.confirm).toBe(true);
    expect(card.actions.rollBack).toBe(true);
    expect(card.busy).toBe(false);
    expect(card.tone).toBe("warn");
  });

  it("flowCard — confirmed — reads as a success and returns the picker", () => {
    // Arrange
    const state: OtaState = { phase: "confirmed" };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.tone).toBe("good");
    expect(card.actions.choose).toBe(true);
  });

  it("flowCard — rolled back — warns rather than failing, and allows a retry", () => {
    // Arrange
    const state: OtaState = { phase: "rolled_back" };

    // Act
    const card = flowCard(state);

    // Assert
    expect(card.tone).toBe("warn");
    expect(card.actions.choose).toBe(true);
  });

  it("flowCard — failed — prefers the caller's copy over the raw backend message", () => {
    // Arrange
    const state: OtaState = { phase: "failed", error: { kind: "wifi", message: "POST /ota failed: reset" } };

    // Act
    const withCopy = flowCard(state, "Could not reach device — make sure WiFi is on.");
    const withoutCopy = flowCard(state);

    // Assert
    expect(withCopy.detail).toBe("Could not reach device — make sure WiFi is on.");
    expect(withoutCopy.detail).toBe("POST /ota failed: reset");
    expect(withCopy.tone).toBe("bad");
  });
});

describe("withPushEnabled", () => {
  it("withPushEnabled — idle card with a selection — turns the push button on", () => {
    // Arrange
    const card = flowCard({ phase: "idle" });

    // Act
    const enabled = withPushEnabled(card, true);
    const disabled = withPushEnabled(card, false);

    // Assert
    expect(enabled.actions.push).toBe(true);
    expect(disabled.actions.push).toBe(false);
  });

  it("withPushEnabled — busy card — never turns the push button on", () => {
    // Arrange
    const card = flowCard({ phase: "pushing", done_bytes: 1, total_bytes: 2, pct: 50 });

    // Act
    const result = withPushEnabled(card, true);

    // Assert
    expect(result.actions.push).toBe(false);
  });
});

describe("describeOtaError", () => {
  it("describeOtaError — each SPEC 6.1 response class — gets its own Flutter line", () => {
    // Arrange
    const rejected = { ota_error: "rejected", status_code: 400, device_body: "image validation failed" };
    const deviceError = { ota_error: "device_error", status_code: 500, device_body: "" };
    const transport = { ota_error: "transport", status_code: null, device_body: "" };

    // Act / Assert
    expect(describeOtaError(rejected)).toBe("Firmware file corrupted, try again.");
    expect(describeOtaError(deviceError)).toBe("Device error during update, try again.");
    expect(describeOtaError(transport)).toBe("Could not reach device — make sure WiFi is on.");
  });

  it("describeOtaError — a wifi error from elsewhere in the flow — returns null for the generic line", () => {
    // Arrange / Act / Assert
    expect(describeOtaError(undefined)).toBeNull();
    expect(describeOtaError(null)).toBeNull();
    expect(describeOtaError({ reason: "missing_root" })).toBeNull();
  });
});

describe("pushBlockedReason", () => {
  it("pushBlockedReason — no device, recording, or already busy — each names its own reason", () => {
    // Arrange / Act / Assert
    expect(pushBlockedReason(null, false, false)).toBe("Connect to device first");
    expect(pushBlockedReason("dev-1", true, false)).toBe("Stop the recording before updating firmware.");
    expect(pushBlockedReason("dev-1", false, true)).toBe("An update is already in progress.");
  });

  it("pushBlockedReason — connected, idle device — is null, so the push is allowed", () => {
    // Arrange / Act
    const reason = pushBlockedReason("dev-1", false, false);

    // Assert
    expect(reason).toBeNull();
  });
});

describe("ROLL_BACK_INSTRUCTIONS", () => {
  it("ROLL_BACK_INSTRUCTIONS — is the power-cycle wording, since there is no roll-back command", () => {
    // Arrange / Act / Assert
    expect(ROLL_BACK_INSTRUCTIONS).toBe("Power-cycle the device to roll back to the previous firmware.");
  });
});

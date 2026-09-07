import { describe, expect, it } from "vitest";

import {
  formatMmSs,
  isSyncNowDisabled,
  pairButtonLabel,
  pairingCodeState,
  pairingCodeStatusText,
  showCodeButtonLabel,
  syncNowButtonLabel,
  validatePairForm,
  validatePeerId,
} from "./pairForm";

describe("validatePeerId", () => {
  it("validatePeerId — an empty string — one error", () => {
    // Act
    const issues = validatePeerId("");

    // Assert
    expect(issues).toHaveLength(1);
  });

  it("validatePeerId — only whitespace — one error", () => {
    // Act
    const issues = validatePeerId("   ");

    // Assert
    expect(issues).toHaveLength(1);
  });

  it("validatePeerId — a non-blank id — no issues", () => {
    // Act
    const issues = validatePeerId("peer-abc123");

    // Assert
    expect(issues).toEqual([]);
  });
});

describe("validatePairForm", () => {
  it("validatePairForm — blank peer id and blank code — two issues, one per field", () => {
    // Act
    const issues = validatePairForm("", "");

    // Assert
    expect(issues.map((i) => i.path).sort()).toEqual(["pairCode", "peerId"]);
  });

  it("validatePairForm — a valid peer id and a valid code — no issues", () => {
    // Act
    const issues = validatePairForm("peer-abc123", "123456");

    // Assert
    expect(issues).toEqual([]);
  });

  it("validatePairForm — a valid peer id and a malformed code — only the code issue", () => {
    // Act
    const issues = validatePairForm("peer-abc123", "12a45");

    // Assert
    expect(issues.map((i) => i.path)).toEqual(["pairCode"]);
  });
});

describe("pairButtonLabel", () => {
  it("pairButtonLabel — not pairing — Pair", () => {
    // Act
    const label = pairButtonLabel(false);

    // Assert
    expect(label).toBe("Pair");
  });

  it("pairButtonLabel — pairing in flight — Pairing…", () => {
    // Act
    const label = pairButtonLabel(true);

    // Assert
    expect(label).toBe("Pairing…");
  });
});

describe("syncNowButtonLabel", () => {
  it("syncNowButtonLabel — this peer is the running one — Syncing…", () => {
    // Act
    const label = syncNowButtonLabel("a", "a");

    // Assert
    expect(label).toBe("Syncing…");
  });

  it("syncNowButtonLabel — a different peer is running — Sync now", () => {
    // Act
    const label = syncNowButtonLabel("a", "b");

    // Assert
    expect(label).toBe("Sync now");
  });

  it("syncNowButtonLabel — nothing running — Sync now", () => {
    // Act
    const label = syncNowButtonLabel("a", null);

    // Assert
    expect(label).toBe("Sync now");
  });
});

describe("isSyncNowDisabled", () => {
  it("isSyncNowDisabled — a run in flight — disabled", () => {
    // Act
    const disabled = isSyncNowDisabled("a");

    // Assert
    expect(disabled).toBe(true);
  });

  it("isSyncNowDisabled — nothing running — enabled", () => {
    // Act
    const disabled = isSyncNowDisabled(null);

    // Assert
    expect(disabled).toBe(false);
  });
});

describe("pairingCodeState", () => {
  it("pairingCodeState — no code yet — none", () => {
    // Act
    const state = pairingCodeState(null, 1_000);

    // Assert
    expect(state).toEqual({ kind: "none" });
  });

  it("pairingCodeState — freshly minted with the full 120 s remaining — valid at 120 s", () => {
    // Arrange
    const code = { code: "123456", expires_at_ms: 121_000 };

    // Act
    const state = pairingCodeState(code, 1_000);

    // Assert
    expect(state).toEqual({ kind: "valid", secondsRemaining: 120 });
  });

  it("pairingCodeState — 5 s left — valid at 5 s (near-expiry)", () => {
    // Arrange
    const code = { code: "123456", expires_at_ms: 6_000 };

    // Act
    const state = pairingCodeState(code, 1_000);

    // Assert
    expect(state).toEqual({ kind: "valid", secondsRemaining: 5 });
  });

  it("pairingCodeState — now equal to expires_at_ms — expired", () => {
    // Arrange
    const code = { code: "123456", expires_at_ms: 1_000 };

    // Act
    const state = pairingCodeState(code, 1_000);

    // Assert
    expect(state).toEqual({ kind: "expired" });
  });

  it("pairingCodeState — now past expires_at_ms — expired", () => {
    // Arrange
    const code = { code: "123456", expires_at_ms: 1_000 };

    // Act
    const state = pairingCodeState(code, 5_000);

    // Assert
    expect(state).toEqual({ kind: "expired" });
  });
});

describe("formatMmSs", () => {
  it("formatMmSs — 120 seconds — 2:00", () => {
    // Act
    const text = formatMmSs(120);

    // Assert
    expect(text).toBe("2:00");
  });

  it("formatMmSs — 5 seconds — 0:05", () => {
    // Act
    const text = formatMmSs(5);

    // Assert
    expect(text).toBe("0:05");
  });

  it("formatMmSs — 65 seconds — 1:05", () => {
    // Act
    const text = formatMmSs(65);

    // Assert
    expect(text).toBe("1:05");
  });
});

describe("pairingCodeStatusText", () => {
  it("pairingCodeStatusText — no code yet — null", () => {
    // Act
    const text = pairingCodeStatusText({ kind: "none" });

    // Assert
    expect(text).toBeNull();
  });

  it("pairingCodeStatusText — valid with time left — states the countdown", () => {
    // Act
    const text = pairingCodeStatusText({ kind: "valid", secondsRemaining: 90 });

    // Assert
    expect(text).toBe("Expires in 1:30");
  });

  it("pairingCodeStatusText — expired — states it plainly", () => {
    // Act
    const text = pairingCodeStatusText({ kind: "expired" });

    // Assert
    expect(text).toBe("Code expired.");
  });
});

describe("showCodeButtonLabel", () => {
  it("showCodeButtonLabel — no code yet — Show my code", () => {
    // Act
    const label = showCodeButtonLabel({ kind: "none" });

    // Assert
    expect(label).toBe("Show my code");
  });

  it("showCodeButtonLabel — a valid code showing — Show my code", () => {
    // Act
    const label = showCodeButtonLabel({ kind: "valid", secondsRemaining: 90 });

    // Assert
    expect(label).toBe("Show my code");
  });

  it("showCodeButtonLabel — the code has expired — Get a new code", () => {
    // Act
    const label = showCodeButtonLabel({ kind: "expired" });

    // Assert
    expect(label).toBe("Get a new code");
  });
});

import { describe, expect, it } from "vitest";

import {
  isSyncNowDisabled,
  pairButtonLabel,
  syncNowButtonLabel,
  validatePairForm,
  validatePeerId,
} from "./pairForm";

describe("validatePeerId", () => {
  it("validatePeerId — an empty string — one error", () => {
    expect(validatePeerId("")).toHaveLength(1);
  });

  it("validatePeerId — only whitespace — one error", () => {
    expect(validatePeerId("   ")).toHaveLength(1);
  });

  it("validatePeerId — a non-blank id — no issues", () => {
    expect(validatePeerId("peer-abc123")).toEqual([]);
  });
});

describe("validatePairForm", () => {
  it("validatePairForm — blank peer id and blank code — two issues, one per field", () => {
    const issues = validatePairForm("", "");
    expect(issues.map((i) => i.path).sort()).toEqual(["pairCode", "peerId"]);
  });

  it("validatePairForm — a valid peer id and a valid code — no issues", () => {
    expect(validatePairForm("peer-abc123", "123456")).toEqual([]);
  });

  it("validatePairForm — a valid peer id and a malformed code — only the code issue", () => {
    const issues = validatePairForm("peer-abc123", "12a45");
    expect(issues.map((i) => i.path)).toEqual(["pairCode"]);
  });
});

describe("pairButtonLabel", () => {
  it("pairButtonLabel — not pairing — Pair", () => {
    expect(pairButtonLabel(false)).toBe("Pair");
  });

  it("pairButtonLabel — pairing in flight — Pairing…", () => {
    expect(pairButtonLabel(true)).toBe("Pairing…");
  });
});

describe("syncNowButtonLabel", () => {
  it("syncNowButtonLabel — this peer is the running one — Syncing…", () => {
    expect(syncNowButtonLabel("a", "a")).toBe("Syncing…");
  });

  it("syncNowButtonLabel — a different peer is running — Sync now", () => {
    expect(syncNowButtonLabel("a", "b")).toBe("Sync now");
  });

  it("syncNowButtonLabel — nothing running — Sync now", () => {
    expect(syncNowButtonLabel("a", null)).toBe("Sync now");
  });
});

describe("isSyncNowDisabled", () => {
  it("isSyncNowDisabled — a run in flight — disabled", () => {
    expect(isSyncNowDisabled("a")).toBe(true);
  });

  it("isSyncNowDisabled — nothing running — enabled", () => {
    expect(isSyncNowDisabled(null)).toBe(false);
  });
});

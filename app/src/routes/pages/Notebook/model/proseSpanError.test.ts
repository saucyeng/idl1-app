import { describe, expect, it } from "vitest";

import { proseSpanErrorMarker } from "./proseSpanError";

describe("proseSpanErrorMarker", () => {
  it("a failed span — builds a warning-glyph marker naming the expression, message on hover only", () => {
    const marker = proseSpanErrorMarker("accel_mag_lp", "channel \"accel_mag_lp\" is not part of this session.");

    expect(marker.text).toBe("⚠ accel_mag_lp");
    expect(marker.title).toBe("channel \"accel_mag_lp\" is not part of this session.");
  });

  it("a failed span with no error text — never fabricates a message, hover text is empty", () => {
    const marker = proseSpanErrorMarker("x", "");

    expect(marker.text).toBe("⚠ x");
    expect(marker.title).toBe("");
  });

  it("the marker never carries the resolved value — text is always the glyph plus the expression, nothing else", () => {
    const marker = proseSpanErrorMarker("peak_freq", "definition \"peak_freq\" failed to evaluate — check its math cell for an error.");

    expect(marker.text).not.toContain("failed");
    expect(marker.text).toBe("⚠ peak_freq");
  });
});

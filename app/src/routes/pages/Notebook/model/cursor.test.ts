import { describe, expect, it } from "vitest";

import type { CursorReadout } from "../../../../ipc/cursor";
import { cursorRequestFor, formatReadout } from "./cursor";
import type { Viewport } from "./viewport";

describe("cursorRequestFor", () => {
  it("cursorRequestFor — a pointer inside the plot — converts pixel x to a t_us on the session axis", () => {
    // Arrange
    const viewport: Viewport = { startUs: 1_000_000, endUs: 3_000_000, pixelWidth: 800 };
    const channels = ["front-fork", "rear-shock"];

    // Act
    const request = cursorRequestFor(viewport, 400, channels);

    // Assert
    expect(request).toEqual({ tUs: 2_000_000, channels: ["front-fork", "rear-shock"] });
  });

  it("cursorRequestFor — a pointer outside the plot — returns null and issues no request", () => {
    // Arrange
    const viewport: Viewport = { startUs: 1_000_000, endUs: 3_000_000, pixelWidth: 800 };
    const channels = ["front-fork"];

    // Act
    const before = cursorRequestFor(viewport, -1, channels);
    const after = cursorRequestFor(viewport, 801, channels);

    // Assert
    expect(before).toBeNull();
    expect(after).toBeNull();
  });
});

describe("formatReadout", () => {
  it("formatReadout — a channel whose value is null — renders as \"no data\", not as 0 (R31)", () => {
    // Arrange
    // R31: null here means "past this channel's recorded span" (or no
    // samples/no time axis) — the assertion below checks that the row's
    // `value` field is exactly `null`, not a rendered string; turning that
    // `null` into the text "no data" is CursorReadout.tsx's job, untested here.
    const readout: CursorReadout = { t_us: 2_000_000, values: { "front-fork": null } };
    const labels = { "front-fork": "Front fork" };

    // Act
    const rows = formatReadout(readout, labels);

    // Assert
    expect(rows).toEqual([{ channel: "front-fork", label: "Front fork", value: null }]);
  });

  it("formatReadout — a channel with a value — renders the number with its channel label", () => {
    // Arrange
    const readout: CursorReadout = { t_us: 2_000_000, values: { "front-fork": 42.5 } };
    const labels = { "front-fork": "Front fork" };

    // Act
    const rows = formatReadout(readout, labels);

    // Assert
    expect(rows).toEqual([{ channel: "front-fork", label: "Front fork", value: 42.5 }]);
  });

  it("formatReadout — a channel absent from the readout entirely — is omitted rather than rendered blank", () => {
    // Arrange
    const readout: CursorReadout = { t_us: 2_000_000, values: { "front-fork": 1 } };
    const labels = { "front-fork": "Front fork", "rear-shock": "Rear shock" };

    // Act
    const rows = formatReadout(readout, labels);

    // Assert
    expect(rows).toEqual([{ channel: "front-fork", label: "Front fork", value: 1 }]);
  });
});

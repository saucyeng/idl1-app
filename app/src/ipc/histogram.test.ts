import { describe, expect, it, vi } from "vitest";

import { isEmptyHistogram, MAX_HISTOGRAM_BINS, type HistogramResponse } from "./histogram";
import type { Window } from "./workbook";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const WINDOW: Window = { session_id: "s1", span: { kind: "session" }, colour: "--chart-1" };

/** A well-formed two-bin response — the shape C3 §3.6 documents. */
function response(overrides: Partial<HistogramResponse> = {}): HistogramResponse {
  return { bin_edges: [0, 1, 2], counts: [3, 1], values: [3, 1], total: 4, bins: 2, ...overrides };
}

describe("fetchHistogram", () => {
  it("fetchHistogram — a count-mode request — invokes fetch_histogram with the C3 §3.6 params shape verbatim", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(response());
    const { fetchHistogram } = await import("./histogram");
    const params = { bin_mode: "count", bin_value: 64, symmetric: true, normalise: "fraction" } as const;

    // Act
    const result = await fetchHistogram(WINDOW, "fork_velocity", params);

    // Assert
    expect(invoke).toHaveBeenCalledWith("fetch_histogram", { window: WINDOW, channel: "fork_velocity", params });
    expect(result).toEqual(response());
  });

  it("fetchHistogram — a width-mode request — passes bin_value through unchanged, no client-side rounding", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(response());
    const { fetchHistogram } = await import("./histogram");
    const params = { bin_mode: "width", bin_value: 0.25, symmetric: false, normalise: "counts" } as const;

    // Act
    await fetchHistogram(WINDOW, "fork_velocity", params);

    // Assert
    expect(invoke).toHaveBeenLastCalledWith("fetch_histogram", expect.objectContaining({ params }));
  });
});

describe("isEmptyHistogram", () => {
  it("isEmptyHistogram — the degenerate result — is empty", () => {
    // Assert
    expect(isEmptyHistogram({ bin_edges: [], counts: [], values: [], total: 0, bins: 0 })).toBe(true);
  });

  it("isEmptyHistogram — a one-bin result with no samples in it — is not empty (bins, not total, decides)", () => {
    // Assert — a window whose only bin is empty still has a drawable axis;
    // C3 §3.6's degenerate case is `bins === 0`, not `total === 0`.
    expect(isEmptyHistogram({ bin_edges: [0, 1], counts: [0], values: [0], total: 0, bins: 1 })).toBe(false);
  });

  it("isEmptyHistogram — an ordinary result — is not empty", () => {
    // Assert
    expect(isEmptyHistogram(response())).toBe(false);
  });
});

describe("MAX_HISTOGRAM_BINS", () => {
  it("MAX_HISTOGRAM_BINS — matches the engine's own cap (C3 §3.6)", () => {
    // Assert — a drift here shows up as an `invalid_argument` round trip
    // rather than a form that refuses the value up front.
    expect(MAX_HISTOGRAM_BINS).toBe(4096);
  });
});

import { describe, expect, it, vi } from "vitest";

import type { HistogramResponse } from "../../../../ipc/histogram";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { histogramColumns, runHistogram, type HistogramAction } from "./histogramDriver";

const WINDOW: SelectedWindow = { session_id: "s1", span: { kind: "session" }, colour: "--chart-1" };
const PARAMS = { bin_mode: "count", bin_value: 2, symmetric: false, normalise: "counts" } as const;

function response(overrides: Partial<HistogramResponse> = {}): HistogramResponse {
  return { bin_edges: [0, 1, 2], counts: [3, 1], values: [3, 1], total: 4, bins: 2, ...overrides };
}

describe("runHistogram", () => {
  it("runHistogram — a resolved fetch that is still current — dispatches the histogram with its window", async () => {
    // Arrange
    const actions: HistogramAction[] = [];
    const deps = { fetchHistogram: vi.fn().mockResolvedValue(response()) };

    // Act
    await runHistogram(deps, "c1", WINDOW, "fork_velocity", PARAMS, (a) => actions.push(a), () => false);

    // Assert
    expect(deps.fetchHistogram).toHaveBeenCalledWith(WINDOW, "fork_velocity", PARAMS);
    expect(actions).toEqual([{ type: "histogram", cellId: "c1", window: WINDOW, histogram: response() }]);
  });

  it("runHistogram — a resolved fetch that went stale — dispatches nothing", async () => {
    // Arrange
    const actions: HistogramAction[] = [];
    const deps = { fetchHistogram: vi.fn().mockResolvedValue(response()) };

    // Act
    await runHistogram(deps, "c1", WINDOW, "x", PARAMS, (a) => actions.push(a), () => true);

    // Assert
    expect(actions).toEqual([]);
  });

  it("runHistogram — a typed IpcError rejection — dispatches histogramError with kind, message and detail intact", async () => {
    // Arrange
    const actions: HistogramAction[] = [];
    const error = { kind: "invalid_argument", message: "bad bin_value", detail: { bin_value: 0 } };
    const deps = { fetchHistogram: vi.fn().mockRejectedValue(error) };

    // Act
    await runHistogram(deps, "c1", WINDOW, "x", PARAMS, (a) => actions.push(a), () => false);

    // Assert
    expect(actions).toEqual([{ type: "histogramError", cellId: "c1", window: WINDOW, error }]);
  });

  it("runHistogram — an untyped rejection — becomes a typed internal error, never a thrown string", async () => {
    // Arrange
    const actions: HistogramAction[] = [];
    const deps = { fetchHistogram: vi.fn().mockRejectedValue(new Error("boom")) };

    // Act
    await runHistogram(deps, "c1", WINDOW, "x", PARAMS, (a) => actions.push(a), () => false);

    // Assert
    expect(actions).toEqual([{ type: "histogramError", cellId: "c1", window: WINDOW, error: { kind: "internal", message: "boom" } }]);
  });

  it("runHistogram — a rejection that went stale — dispatches nothing", async () => {
    // Arrange
    const actions: HistogramAction[] = [];
    const deps = { fetchHistogram: vi.fn().mockRejectedValue(new Error("boom")) };

    // Act
    await runHistogram(deps, "c1", WINDOW, "x", PARAMS, (a) => actions.push(a), () => true);

    // Assert
    expect(actions).toEqual([]);
  });

  it("runHistogram — C3 §3.6's degenerate empty result — is an ordinary histogram action, not an error", async () => {
    // Arrange
    const empty = { bin_edges: [], counts: [], values: [], total: 0, bins: 0 };
    const actions: HistogramAction[] = [];
    const deps = { fetchHistogram: vi.fn().mockResolvedValue(empty) };

    // Act
    await runHistogram(deps, "c1", WINDOW, "x", PARAMS, (a) => actions.push(a), () => false);

    // Assert
    expect(actions[0].type).toBe("histogram");
  });
});

describe("histogramColumns", () => {
  it("histogramColumns — bin i spans bin_edges[i]..bin_edges[i+1], with values[i] as n", () => {
    // Act
    const { v0, v1, n } = histogramColumns(response());

    // Assert
    expect(Array.from(v0)).toEqual([0, 1]);
    expect(Array.from(v1)).toEqual([1, 2]);
    expect(Array.from(n)).toEqual([3, 1]);
  });

  it("histogramColumns — the degenerate empty result — is three empty arrays", () => {
    // Act
    const { v0, v1, n } = histogramColumns({ bin_edges: [], counts: [], values: [], total: 0, bins: 0 });

    // Assert
    expect(v0.length).toBe(0);
    expect(v1.length).toBe(0);
    expect(n.length).toBe(0);
  });

  it("histogramColumns — more values than the edges describe — truncates rather than reading past the end", () => {
    // Arrange — a malformed response: 3 values but only 2 bins of edges.
    const malformed = { bin_edges: [0, 1, 2], counts: [1, 1, 1], values: [1, 1, 1], total: 3, bins: 3 };

    // Act
    const { v0, n } = histogramColumns(malformed);

    // Assert — never a NaN bar from an undefined edge.
    expect(v0.length).toBe(2);
    expect(Array.from(n).every(Number.isFinite)).toBe(true);
  });
});

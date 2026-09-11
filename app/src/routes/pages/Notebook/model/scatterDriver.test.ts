import { describe, expect, it, vi } from "vitest";

import type { DecodedScatter } from "../../../../ipc/scatter";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { runScatter, unionScatterBounds, type ScatterAction } from "./scatterDriver";

const WINDOW: SelectedWindow = { session_id: "s1", span: { kind: "session" }, colour: "--chart-1" };

function cloud(overrides: Partial<DecodedScatter> = {}): DecodedScatter {
  return {
    xs: new Float64Array([1, 2]),
    ys: new Float64Array([3, 4]),
    xMin: 1,
    xMax: 2,
    yMin: 3,
    yMax: 4,
    ...overrides,
  };
}

describe("runScatter", () => {
  it("runScatter — a resolved fetch that is still current — dispatches the cloud with its window", async () => {
    // Arrange
    const actions: ScatterAction[] = [];
    const result = cloud();
    const deps = { fetchScatter: vi.fn().mockResolvedValue(result) };

    // Act
    await runScatter(deps, "c1", WINDOW, "AccelX", "AccelY", 4096, (a) => actions.push(a), () => false);

    // Assert
    expect(deps.fetchScatter).toHaveBeenCalledWith(WINDOW, "AccelX", "AccelY", 4096);
    expect(actions).toEqual([{ type: "scatter", cellId: "c1", window: WINDOW, scatter: result }]);
  });

  it("runScatter — a resolved fetch that went stale — dispatches nothing", async () => {
    // Arrange
    const actions: ScatterAction[] = [];
    const deps = { fetchScatter: vi.fn().mockResolvedValue(cloud()) };

    // Act
    await runScatter(deps, "c1", WINDOW, "x", "y", 4096, (a) => actions.push(a), () => true);

    // Assert
    expect(actions).toEqual([]);
  });

  it("runScatter — a typed IpcError rejection — passes kind, message and detail through", async () => {
    // Arrange
    const actions: ScatterAction[] = [];
    const error = { kind: "invalid_argument", message: "bad budget", detail: { point_budget: 0 } };
    const deps = { fetchScatter: vi.fn().mockRejectedValue(error) };

    // Act
    await runScatter(deps, "c1", WINDOW, "x", "y", 0, (a) => actions.push(a), () => false);

    // Assert
    expect(actions).toEqual([{ type: "scatterError", cellId: "c1", window: WINDOW, error }]);
  });

  it("runScatter — a decoder Error (malformed IDLS bytes) — becomes a typed internal error", async () => {
    // Arrange
    const actions: ScatterAction[] = [];
    const deps = { fetchScatter: vi.fn().mockRejectedValue(new Error('scatter magic bytes "IDLT" != "IDLS"')) };

    // Act
    await runScatter(deps, "c1", WINDOW, "x", "y", 4096, (a) => actions.push(a), () => false);

    // Assert
    expect(actions[0]).toMatchObject({ type: "scatterError", error: { kind: "internal" } });
  });

  it("runScatter — a rejection that went stale — dispatches nothing", async () => {
    // Arrange
    const actions: ScatterAction[] = [];
    const deps = { fetchScatter: vi.fn().mockRejectedValue(new Error("boom")) };

    // Act
    await runScatter(deps, "c1", WINDOW, "x", "y", 4096, (a) => actions.push(a), () => true);

    // Assert
    expect(actions).toEqual([]);
  });

  it("runScatter — an empty cloud — is an ordinary scatter action, not an error", async () => {
    // Arrange
    const empty = cloud({ xs: new Float64Array(0), ys: new Float64Array(0), xMin: 0, xMax: 0, yMin: 0, yMax: 0 });
    const actions: ScatterAction[] = [];
    const deps = { fetchScatter: vi.fn().mockResolvedValue(empty) };

    // Act
    await runScatter(deps, "c1", WINDOW, "x", "y", 4096, (a) => actions.push(a), () => false);

    // Assert
    expect(actions[0].type).toBe("scatter");
  });
});

describe("unionScatterBounds", () => {
  it("unionScatterBounds — several windows — spans every window's own extent", () => {
    // Arrange
    const a = cloud({ xMin: -1, xMax: 2, yMin: 0, yMax: 1 });
    const b = cloud({ xMin: 0, xMax: 5, yMin: -3, yMax: 0.5 });

    // Act
    const union = unionScatterBounds([a, b])!;

    // Assert — one shared scale, so two overlaid clouds are comparable.
    expect([union.xMin, union.xMax, union.yMin, union.yMax]).toEqual([-1, 5, -3, 1]);
  });

  it("unionScatterBounds — one window — is that window's own extent", () => {
    // Act
    const union = unionScatterBounds([cloud()])!;

    // Assert
    expect([union.xMin, union.xMax, union.yMin, union.yMax]).toEqual([1, 2, 3, 4]);
  });

  it("unionScatterBounds — no windows resolved yet — is null, so the caller publishes no domain", () => {
    // Assert
    expect(unionScatterBounds([])).toBeNull();
  });

  it("unionScatterBounds — carries no samples — only the bounds are read from it", () => {
    // Act
    const union = unionScatterBounds([cloud()])!;

    // Assert
    expect(union.xs.length).toBe(0);
    expect(union.ys.length).toBe(0);
  });
});

import { describe, expect, it, vi } from "vitest";

import { decodeScatter, equalAspectDomain, MAX_SCATTER_POINTS, type DecodedScatter } from "./scatter";
import type { Window } from "./workbook";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const WINDOW: Window = { session_id: "s1", span: { kind: "session" }, colour: "--chart-1" };
const HEADER_LEN = 48;

/** Builds an `IDLS` v1 buffer exactly as C3 §3.5 lays it out. */
function buildScatter(xs: number[], ys: number[], bounds: [number, number, number, number]): ArrayBuffer {
  const n = xs.length;
  const buf = new ArrayBuffer(HEADER_LEN + n * 16);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x53); // "IDLS"
  view.setUint16(4, 1, true);
  view.setUint32(8, n, true);
  bounds.forEach((b, i) => view.setFloat64(16 + i * 8, b, true));
  xs.forEach((x, i) => view.setFloat64(HEADER_LEN + i * 8, x, true));
  ys.forEach((y, i) => view.setFloat64(HEADER_LEN + n * 8 + i * 8, y, true));
  return buf;
}

function decoded(overrides: Partial<DecodedScatter> = {}): DecodedScatter {
  return { xs: new Float64Array([0]), ys: new Float64Array([0]), xMin: -1, xMax: 1, yMin: -2, yMax: 2, ...overrides };
}

describe("decodeScatter", () => {
  it("decodeScatter — C3 §3.5's IDLS v1 layout — recovers both arrays and the four bounds", () => {
    // Arrange
    const buf = buildScatter([1, 2, 3], [-1, -2, -3], [1, 3, -3, -1]);

    // Act
    const scatter = decodeScatter(buf);

    // Assert
    expect(Array.from(scatter.xs)).toEqual([1, 2, 3]);
    expect(Array.from(scatter.ys)).toEqual([-1, -2, -3]);
    expect([scatter.xMin, scatter.xMax, scatter.yMin, scatter.yMax]).toEqual([1, 3, -3, -1]);
  });

  it("decodeScatter — an empty cloud — is header-only with two empty arrays, not an error", () => {
    // Act
    const scatter = decodeScatter(buildScatter([], [], [0, 0, 0, 0]));

    // Assert
    expect(scatter.xs.length).toBe(0);
    expect(scatter.ys.length).toBe(0);
  });

  it("decodeScatter — full f64 precision — survives the decode", () => {
    // Arrange — a value f32 could not hold; the equal-aspect circle depends on it.
    const value = 0.10000000000000001;

    // Act
    const scatter = decodeScatter(buildScatter([value], [0], [0, 1, 0, 1]));

    // Assert
    expect(scatter.xs[0]).toBe(value);
  });

  it("decodeScatter — bad magic — throws a typed error naming what it saw", () => {
    // Arrange
    const buf = buildScatter([1], [1], [0, 1, 0, 1]);
    new DataView(buf).setUint8(3, 0x54); // "IDLT"

    // Act / Assert
    expect(() => decodeScatter(buf)).toThrowError(/IDLS/);
  });

  it("decodeScatter — an unsupported version — throws rather than mis-reading the layout", () => {
    // Arrange
    const buf = buildScatter([1], [1], [0, 1, 0, 1]);
    new DataView(buf).setUint16(4, 2, true);

    // Act / Assert
    expect(() => decodeScatter(buf)).toThrowError(/version/);
  });

  it("decodeScatter — a buffer shorter than its declared point_count — throws, never reads past the end", () => {
    // Arrange
    const buf = buildScatter([1, 2], [1, 2], [0, 2, 0, 2]);
    new DataView(buf).setUint32(8, 99, true);

    // Act / Assert
    expect(() => decodeScatter(buf)).toThrowError(/too short/);
  });

  it("decodeScatter — a buffer too short for even the header — throws", () => {
    // Act / Assert
    expect(() => decodeScatter(new ArrayBuffer(8))).toThrowError(/header/);
  });
});

describe("equalAspectDomain", () => {
  it("equalAspectDomain — a cloud straddling zero — is symmetric about zero at the largest magnitude", () => {
    // Act
    const domain = equalAspectDomain(decoded({ xMin: -1, xMax: 0.5, yMin: -0.2, yMax: 2 }));

    // Assert — the friction circle is centred on the origin, not on the data.
    expect(domain).toEqual([-2, 2]);
  });

  it("equalAspectDomain — a cloud on one side of zero on both axes — is a square fit of the union extent", () => {
    // Act
    const domain = equalAspectDomain(decoded({ xMin: 10, xMax: 20, yMin: 12, yMax: 31 }));

    // Assert
    expect(domain).toEqual([10, 31]);
  });

  it("equalAspectDomain — one axis straddling zero — still centres on zero", () => {
    // Act
    const domain = equalAspectDomain(decoded({ xMin: -3, xMax: 3, yMin: 1, yMax: 2 }));

    // Assert
    expect(domain).toEqual([-3, 3]);
  });

  it("equalAspectDomain — a wholly degenerate cloud — is null, so Plot picks its own domain", () => {
    // Assert
    expect(equalAspectDomain(decoded({ xMin: 0, xMax: 0, yMin: 0, yMax: 0 }))).toBeNull();
  });

  it("equalAspectDomain — non-finite bounds — is null rather than a NaN domain", () => {
    // Assert
    expect(equalAspectDomain(decoded({ xMin: NaN, xMax: 1, yMin: 0, yMax: 1 }))).toBeNull();
  });
});

describe("fetchScatter", () => {
  it("fetchScatter — invokes fetch_scatter with camelCase argument names and decodes the result", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(buildScatter([1], [2], [1, 1, 2, 2]));
    const { fetchScatter } = await import("./scatter");

    // Act
    const scatter = await fetchScatter(WINDOW, "AccelX", "AccelY", 4096);

    // Assert
    expect(invoke).toHaveBeenCalledWith("fetch_scatter", {
      window: WINDOW,
      xChannel: "AccelX",
      yChannel: "AccelY",
      pointBudget: 4096,
    });
    expect(Array.from(scatter.xs)).toEqual([1]);
  });
});

describe("MAX_SCATTER_POINTS", () => {
  it("MAX_SCATTER_POINTS — matches the engine's own cap (C3 §3.5)", () => {
    // Assert
    expect(MAX_SCATTER_POINTS).toBe(65_536);
  });
});

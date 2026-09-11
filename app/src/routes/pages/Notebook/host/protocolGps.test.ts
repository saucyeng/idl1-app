/**
 * `host/protocol.ts`'s map and spectrogram payloads (ruling R217 items 1 and
 * 4) — the multi-window combining rule for a trace, and the fact that a
 * raster payload is a short list of framed pixel buffers rather than flat
 * columns. Kept beside `protocol.test.ts` rather than inside it: that file
 * already covers the four column-shaped payload kinds, and these two are the
 * ones that break the pattern.
 */
import { describe, expect, it } from "vitest";

import { combineGpsWindows, gpsPayload, rasterPayload, type GpsWindowSeries, type RasterFramePayload, type WindowDescriptor } from "./protocol";

function descriptor(index: number): WindowDescriptor {
  return { sessionId: `s${index}`, span: { kind: "session" }, colour: `--chart-${index + 1}`, label: `window ${index}` };
}

function series(index: number, xs: number[], withColour: boolean): GpsWindowSeries {
  return {
    descriptor: descriptor(index),
    xs: Float64Array.from(xs),
    ys: Float64Array.from(xs, (x) => x * 2),
    ts: Float64Array.from(xs, (x) => x / 10),
    cs: withColour ? Float64Array.from(xs, (x) => x * 100) : null,
  };
}

describe("combineGpsWindows", () => {
  it("combineGpsWindows — no windows — returns an empty trace with no colour column", () => {
    const combined = combineGpsWindows([]);

    expect(combined.length).toBe(0);
    expect(combined.hasC).toBe(false);
    expect(combined.windows).toEqual([]);
  });

  it("combineGpsWindows — one window — inserts no break row and indexes every point to window 0", () => {
    const combined = combineGpsWindows([series(0, [1, 2, 3], true)]);

    expect(combined.length).toBe(3);
    expect(Array.from(combined.x)).toEqual([1, 2, 3]);
    expect(Array.from(combined.w)).toEqual([0, 0, 0]);
  });

  it("combineGpsWindows — two windows — separates them with one all-NaN break row", () => {
    const combined = combineGpsWindows([series(0, [1, 2], true), series(1, [5, 6], true)]);

    expect(combined.length).toBe(5);
    expect(Number.isNaN(combined.x[2])).toBe(true);
    expect(Number.isNaN(combined.y[2])).toBe(true);
    expect(Number.isNaN(combined.t[2])).toBe(true);
    expect(Number.isNaN(combined.c[2])).toBe(true);
    expect(Number.isNaN(combined.w[2])).toBe(true);
  });

  it("combineGpsWindows — two windows — keeps each window's own points under its own index", () => {
    const combined = combineGpsWindows([series(0, [1, 2], false), series(1, [5, 6], false)]);

    expect(Array.from(combined.x)).toEqual([1, 2, NaN, 5, 6]);
    expect(Array.from(combined.w)).toEqual([0, 0, NaN, 1, 1]);
    expect(combined.windows).toEqual([descriptor(0), descriptor(1)]);
  });

  it("combineGpsWindows — one window with a colour and one without — reports hasC and fills the gap with NaN", () => {
    const combined = combineGpsWindows([series(0, [1], true), series(1, [5], false)]);

    expect(combined.hasC).toBe(true);
    expect(combined.c[0]).toBe(100);
    expect(Number.isNaN(combined.c[2])).toBe(true);
  });

  it("combineGpsWindows — every window uncoloured — reports hasC false and an all-NaN colour column", () => {
    const combined = combineGpsWindows([series(0, [1, 2], false)]);

    expect(combined.hasC).toBe(false);
    expect(Array.from(combined.c).every(Number.isNaN)).toBe(true);
  });
});

describe("gpsPayload", () => {
  it("gpsPayload — a combined trace — puts all five buffers in the transfer list exactly once", () => {
    const combined = combineGpsWindows([series(0, [1, 2], true)]);

    const { message, transfer } = gpsPayload(
      "gps | Speed",
      combined.length,
      combined.x.buffer as ArrayBuffer,
      combined.y.buffer as ArrayBuffer,
      combined.t.buffer as ArrayBuffer,
      combined.c.buffer as ArrayBuffer,
      combined.hasC,
      combined.w.buffer as ArrayBuffer,
      combined.windows
    );

    expect(message.name).toBe("gps | Speed");
    expect(message.value.kind).toBe("gps");
    expect(transfer).toHaveLength(5);
    expect(new Set(transfer).size).toBe(5);
  });

  it("gpsPayload — an uncoloured trace — still carries a colour buffer, flagged hasC false", () => {
    const combined = combineGpsWindows([series(0, [1], false)]);

    const { message } = gpsPayload(
      "gps | null",
      combined.length,
      combined.x.buffer as ArrayBuffer,
      combined.y.buffer as ArrayBuffer,
      combined.t.buffer as ArrayBuffer,
      combined.c.buffer as ArrayBuffer,
      combined.hasC,
      combined.w.buffer as ArrayBuffer,
      combined.windows
    );

    expect(message.value.kind === "gps" && message.value.hasC).toBe(false);
    expect(message.value.kind === "gps" && message.value.c.byteLength).toBe(8);
  });
});

describe("rasterPayload", () => {
  function frame(windowIndex: number): RasterFramePayload {
    return {
      windowIndex,
      pixelWidth: 2,
      pixelHeight: 1,
      xDomain: [0, 10],
      yDomain: [0, 500],
      pixels: new ArrayBuffer(2 * 1 * 4),
    };
  }

  it("rasterPayload — two windows' frames — transfers every pixel buffer and keeps the frames apart", () => {
    const frames = [frame(0), frame(1)];

    const { message, transfer } = rasterPayload("raster | IMU0_AccelZ", frames, [descriptor(0), descriptor(1)], null, [], null);

    expect(message.value.kind).toBe("raster");
    expect(message.value.kind === "raster" && message.value.frames).toHaveLength(2);
    expect(transfer).toEqual([frames[0].pixels, frames[1].pixels]);
  });

  it("rasterPayload — the engine's ramp and scale — carries both through unchanged for the legend", () => {
    const stops: [number, number, number, number][] = [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
    ];

    const { message } = rasterPayload("raster | x", [frame(0)], [descriptor(0)], null, stops, { vmin: -1, vmax: 4 });

    expect(message.value.kind === "raster" && message.value.rampStops).toEqual(stops);
    expect(message.value.kind === "raster" && message.value.scale).toEqual({ vmin: -1, vmax: 4 });
  });
});

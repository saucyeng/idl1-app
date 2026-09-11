/**
 * `model/rasterCellDriver.ts` — the spectrogram cell's per-window fetch, its
 * sizing rule, and the frame shaping that hands one window's raster to
 * `host/protocol.ts` (ruling R217 item 4). `ipc/rasters.ts`'s `IDLR` decode
 * is not tested here; this module never decodes.
 */
import { describe, expect, it } from "vitest";

import {
  rasterFrame,
  rasterWidthForCell,
  runRaster,
  RASTER_HEIGHT,
  RASTER_WIDTH_MIN,
  type FetchedRaster,
  type RasterAction,
  type RasterDeps,
} from "./rasterCellDriver";
import type { DecodedRaster, RasterMeta, SpectrogramParams } from "../../../../ipc/rasters";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";

const WINDOW: SelectedWindow = { session_id: "s1", span: { kind: "lap", lap_number: 3 }, colour: "--chart-1" };

const PARAMS: SpectrogramParams = {
  window_size: 1024,
  hop_size: 512,
  window: "hann",
  detrend: "mean",
  scaling: "raw_magnitude",
};

function raster(width = 4, height = 2): DecodedRaster {
  // A buffer with a 16-byte header in front, so the view's own non-zero
  // `byteOffset` is exercised exactly as `decodeRaster` produces it.
  const buf = new ArrayBuffer(16 + width * height * 4);
  const pixels = new Uint8ClampedArray(buf, 16, width * height * 4);
  pixels.fill(200);
  return { width, height, pixels };
}

const META: RasterMeta = {
  x_domain: [0, 12],
  y_domain: [0, 500],
  x_label: "t (s)",
  y_label: "f (Hz)",
  scale: { vmin: -3, vmax: 7, kind: "linear" },
  transparent_zero: false,
  magnitude_unit: { state: "known", text: "m/s^2" },
  ramp_stops: [
    [0, 0, 0, 255],
    [255, 255, 255, 255],
  ],
};

function deps(overrides: Partial<RasterDeps> = {}): RasterDeps {
  return {
    fetchRaster: () => Promise.resolve(raster()),
    fetchRasterMeta: () => Promise.resolve(META),
    ...overrides,
  };
}

describe("runRaster", () => {
  it("runRaster — a resolved pair and a live run — dispatches the pixels and their metadata together", async () => {
    const actions: RasterAction[] = [];

    await runRaster(deps(), "c1", WINDOW, "IMU0_AccelZ", 640, RASTER_HEIGHT, PARAMS, (a) => actions.push(a), () => false);

    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("raster");
    expect(actions[0].type === "raster" && actions[0].fetched.meta).toBe(META);
  });

  it("runRaster — a stale run — dispatches nothing at all", async () => {
    const actions: RasterAction[] = [];

    await runRaster(deps(), "c1", WINDOW, "x", 640, 512, PARAMS, (a) => actions.push(a), () => true);

    expect(actions).toHaveLength(0);
  });

  it("runRaster — the metadata request failing — fails the pair rather than drawing unplaced pixels", async () => {
    const actions: RasterAction[] = [];
    const failing = deps({ fetchRasterMeta: () => Promise.reject({ kind: "invalid_argument", message: "lap 3 not in session" }) });

    await runRaster(failing, "c1", WINDOW, "x", 640, 512, PARAMS, (a) => actions.push(a), () => false);

    expect(actions[0]).toEqual({
      type: "rasterError",
      cellId: "c1",
      window: WINDOW,
      error: { kind: "invalid_argument", message: "lap 3 not in session" },
    });
  });

  it("runRaster — an untyped throw — becomes a typed internal error, never a bare string", async () => {
    const actions: RasterAction[] = [];
    const failing = deps({ fetchRaster: () => Promise.reject(new Error('raster magic bytes "XXXX" != "IDLR"')) });

    await runRaster(failing, "c1", WINDOW, "x", 640, 512, PARAMS, (a) => actions.push(a), () => false);

    expect(actions[0].type === "rasterError" && actions[0].error.kind).toBe("internal");
  });

  it("runRaster — a live run — asks both commands for the same window, channel and size", async () => {
    const seen: string[] = [];
    const recording = deps({
      fetchRaster: (w, channel, width, height) => {
        seen.push(`raster:${w.session_id}:${channel}:${width}x${height}`);
        return Promise.resolve(raster());
      },
      fetchRasterMeta: (w, channel, width, height) => {
        seen.push(`meta:${w.session_id}:${channel}:${width}x${height}`);
        return Promise.resolve(META);
      },
    });

    await runRaster(recording, "c1", WINDOW, "IMU0_AccelZ", 640, 512, PARAMS, () => {}, () => false);

    expect(seen).toEqual(["raster:s1:IMU0_AccelZ:640x512", "meta:s1:IMU0_AccelZ:640x512"]);
  });
});

describe("rasterWidthForCell", () => {
  it("rasterWidthForCell — an ordinary cell width — asks for one raster pixel per CSS pixel", () => {
    expect(rasterWidthForCell(900)).toBe(900);
  });

  it("rasterWidthForCell — a very narrow cell — floors at the minimum usable width", () => {
    expect(rasterWidthForCell(40)).toBe(RASTER_WIDTH_MIN);
  });

  it("rasterWidthForCell — an unmeasured width — falls back to the minimum rather than NaN", () => {
    expect(rasterWidthForCell(Number.NaN)).toBe(RASTER_WIDTH_MIN);
  });

  it("rasterWidthForCell — a width above the engine's cap — is not pre-clamped, since C3 §3.6 clamps", () => {
    expect(rasterWidthForCell(4096)).toBe(4096);
  });
});

describe("rasterFrame", () => {
  const fetched: FetchedRaster = { raster: raster(4, 2), meta: META };

  it("rasterFrame — one fetched raster — carries its pixel size, domains and window index", () => {
    const frame = rasterFrame(fetched, 1);

    expect(frame.windowIndex).toBe(1);
    expect(frame.pixelWidth).toBe(4);
    expect(frame.pixelHeight).toBe(2);
    expect(frame.xDomain).toEqual([0, 12]);
    expect(frame.yDomain).toEqual([0, 500]);
  });

  it("rasterFrame — a decoded view at a header offset — copies the pixels so the header is never sent as pixel data", () => {
    const frame = rasterFrame(fetched, 0);

    expect(frame.pixels.byteLength).toBe(4 * 2 * 4);
    expect(new Uint8ClampedArray(frame.pixels).every((b) => b === 200)).toBe(true);
  });

  it("rasterFrame — a transferable copy — leaves the caller's own retained pixels readable", () => {
    const frame = rasterFrame(fetched, 0);

    expect(frame.pixels).not.toBe(fetched.raster.pixels.buffer);
    expect(fetched.raster.pixels[0]).toBe(200);
  });
});

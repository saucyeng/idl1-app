import { describe, expect, it, vi } from "vitest";
import { decodeRaster } from "./rasters";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

/** Builds a raster buffer matching C3 §3.6's worked example: 64×32, format 0. */
function buildWorkedExampleRaster(): ArrayBuffer {
  const width = 64, height = 32;
  const buf = new ArrayBuffer(16 + width * height * 4);
  const view = new DataView(buf);
  view.setUint8(0, 0x49); view.setUint8(1, 0x44); view.setUint8(2, 0x4c); view.setUint8(3, 0x52); // "IDLR"
  view.setUint16(4, 1, true);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  view.setUint16(10, 0, true); // format = RGBA8
  const pixels = new Uint8Array(buf, 16);
  pixels[0] = 255; pixels[1] = 0; pixels[2] = 0; pixels[3] = 255; // first pixel red-opaque
  return buf;
}

describe("decodeRaster", () => {
  it("C3 §3.6 worked example (64x32, format 0) — decodes — dimensions and pixel region match", () => {
    // Arrange
    const buf = buildWorkedExampleRaster();

    // Act
    const raster = decodeRaster(buf);

    // Assert
    expect(raster.width).toBe(64);
    expect(raster.height).toBe(32);
    expect(raster.pixels.length).toBe(64 * 32 * 4);
    expect(Array.from(raster.pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it("unsupported format value — throws — typed error", () => {
    // Arrange
    const buf = buildWorkedExampleRaster();
    new DataView(buf).setUint16(10, 7, true);

    // Act / Assert
    expect(() => decodeRaster(buf)).toThrowError(/format/i);
  });
});

describe("fetchRaster", () => {
  it("spectrogram params — resolves — calls invoke with the typed SpectrogramParams shape", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(buildWorkedExampleRaster());
    const { fetchRaster } = await import("./rasters");
    const params = { window_size: 64, hop_size: 32, window: "hann", detrend: "mean", scaling: "density" } as const;

    // Act
    await fetchRaster("s1", "fork_travel", "spectrogram", 64, 32, params);

    // Assert
    expect(invoke).toHaveBeenCalledWith("fetch_raster", {
      sessionId: "s1",
      channel: "fork_travel",
      kind: "spectrogram",
      width: 64,
      height: 32,
      params,
    });
  });

  it("histogram2d params — resolves — calls invoke with the typed Histogram2dParams shape", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(buildWorkedExampleRaster());
    const { fetchRaster } = await import("./rasters");
    const params = { y_channel: "brake_pressure", x_bins: 16, y_bins: 8 };

    // Act
    await fetchRaster("s1", "fork_travel", "histogram2d", 16, 8, params);

    // Assert
    expect(invoke).toHaveBeenCalledWith("fetch_raster", {
      sessionId: "s1",
      channel: "fork_travel",
      kind: "histogram2d",
      width: 16,
      height: 8,
      params,
    });
  });
});

describe("fetchRasterMeta", () => {
  it("resolves — calls invoke with the same argument shape as fetchRaster and returns its RasterMeta", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const meta = {
      x_domain: [0, 1] as [number, number],
      y_domain: [0, 100] as [number, number],
      x_label: "time (s)",
      y_label: "frequency (Hz)",
      scale: { vmin: 0, vmax: 1, kind: "linear" as const },
      transparent_zero: false,
    };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(meta);
    const { fetchRasterMeta } = await import("./rasters");
    const params = { window_size: 64, hop_size: 32, window: "hann", detrend: "mean", scaling: "density" } as const;

    // Act
    const result = await fetchRasterMeta("s1", "fork_travel", "spectrogram", 64, 32, params);

    // Assert
    expect(result).toBe(meta);
    expect(invoke).toHaveBeenCalledWith("fetch_raster_meta", {
      sessionId: "s1",
      channel: "fork_travel",
      kind: "spectrogram",
      width: 64,
      height: 32,
      params,
    });
  });
});

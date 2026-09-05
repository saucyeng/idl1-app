import { invoke } from "@tauri-apps/api/core";

/** Decoded raster (C3 §3.6): row-major top-down RGBA8 pixel data. */
export interface DecodedRaster {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

const MAGIC = "IDLR";
const FORMAT_RGBA8 = 0;

/** Decodes a `fetch_raster` response per C3 §3.6's fixed 16-byte header.
 *  @throws Error on bad magic, an unsupported `format` value, or a buffer
 *  too short for `width * height * 4` pixel bytes. */
export function decodeRaster(buf: ArrayBuffer): DecodedRaster {
  if (buf.byteLength < 16) {
    throw new Error(`raster buffer ${buf.byteLength} bytes, header needs 16 bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) {
    throw new Error(`raster magic bytes "${magic}" != "${MAGIC}"`);
  }
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  const format = view.getUint16(10, true);
  if (format !== FORMAT_RGBA8) {
    throw new Error(`raster format ${format} not supported (only RGBA8 = 0 is defined, C3 §3.6)`);
  }
  const pixelLen = width * height * 4;
  if (buf.byteLength < 16 + pixelLen) {
    throw new Error(`raster buffer ${buf.byteLength} bytes too short for ${width}x${height} RGBA8`);
  }
  return { width, height, pixels: new Uint8ClampedArray(buf, 16, pixelLen) };
}

/** Raster kind (C3 §3.6). */
export type RasterKind = "spectrogram" | "histogram2d";

/** `fetch_raster`/`fetch_raster_meta`'s `params` when `kind === "spectrogram"`
 *  (C3 §3.6, closes open question 6.4 per ledger R25). */
export interface SpectrogramParams {
  /** `nperseg`, samples per FFT segment. */
  window_size: number;
  /** Samples between segment starts; `hop = nperseg − noverlap` (`idl_rs::fft`'s own `noverlap`). */
  hop_size: number;
  window: "rectangular" | "hann" | "hamming";
  detrend: "none" | "mean" | "linear";
  scaling: "magnitude" | "density";
}

/** `fetch_raster`/`fetch_raster_meta`'s `params` when `kind === "histogram2d"`
 *  (C3 §3.6, amended by ruling R42). `x_bins`/`y_bins` must equal the
 *  command's own `width`/`height` in wave 1 — the fields are kept rather
 *  than removed because bins < pixels is the intended future extension. */
export interface Histogram2dParams {
  /** The second channel; the command's own `channel` argument is the X channel. */
  y_channel: string;
  x_bins: number;
  y_bins: number;
}

/** Fetches and decodes one raster. Settle-bound only, same rule as `fetchTile` (C3 §4). */
export async function fetchRaster(
  sessionId: string,
  channel: string,
  kind: RasterKind,
  width: number,
  height: number,
  params: SpectrogramParams | Histogram2dParams
): Promise<DecodedRaster> {
  const buf = await invoke<ArrayBuffer>("fetch_raster", { sessionId, channel, kind, width, height, params });
  return decodeRaster(buf);
}

/** C3 §3.6's `fetch_raster_meta` return: axis domains and colour-scale
 *  bounds without decoding pixel bytes. `scale.vmin`/`scale.vmax` are
 *  resolution-independent (ruling R38) — the same channel at two chart
 *  sizes reports the same legend. */
export interface RasterMeta {
  x_domain: [number, number];
  y_domain: [number, number];
  x_label: string;
  y_label: string;
  scale: { vmin: number; vmax: number; kind: "linear" };
  transparent_zero: boolean;
}

/** Fetches one raster's axis domains and colour scale, without its pixel
 *  bytes. Same arguments as `fetchRaster`; settle-bound only (C3 §4). */
export async function fetchRasterMeta(
  sessionId: string,
  channel: string,
  kind: RasterKind,
  width: number,
  height: number,
  params: SpectrogramParams | Histogram2dParams
): Promise<RasterMeta> {
  return invoke<RasterMeta>("fetch_raster_meta", { sessionId, channel, kind, width, height, params });
}

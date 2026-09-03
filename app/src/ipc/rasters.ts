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

/** Raster kind and its numeric parameter bag (C3 §3.6 — `params`' generic
 *  shape is provisional per C3 open question 6.4; kept as-is here). */
export type RasterKind = "spectrogram" | "histogram2d";

/** Fetches and decodes one raster. Settle-bound only, same rule as `fetchTile` (C3 §4). */
export async function fetchRaster(
  sessionId: string,
  channel: string,
  kind: RasterKind,
  width: number,
  height: number,
  params: Record<string, number>
): Promise<DecodedRaster> {
  const buf = await invoke<ArrayBuffer>("fetch_raster", { sessionId, channel, kind, width, height, params });
  return decodeRaster(buf);
}

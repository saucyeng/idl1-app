import { invoke } from "@tauri-apps/api/core";

/** Decoded tile (C3 §3.5): the bucket min/max pairs (`sampleMin`/`sampleMax`,
 *  length `sample_count`) plus the coarser per-pixel-column stats
 *  (`columnMin`/`columnMax`/`columnMean`, length `column_count`) hover reads
 *  use without IPC (design §6). */
export interface DecodedTile {
  tier: number;
  tileIndex: number;
  sampleMin: Float32Array;
  sampleMax: Float32Array;
  columnMin: Float32Array;
  columnMax: Float32Array;
  columnMean: Float32Array;
}

const MAGIC = "IDLT";

/** Decodes a `fetch_tile` response per C3 §3.5's fixed 32-byte header, the
 *  `sample_count`-pair sample region, and the `column_count`-triple column
 *  region. Views into `buf` with no copy.
 *
 *  @throws Error if the buffer is too short for the header, the magic bytes
 *  don't match, or the buffer is shorter than the header declares.
 */
export function decodeTile(buf: ArrayBuffer): DecodedTile {
  if (buf.byteLength < 32) {
    throw new Error(`tile buffer ${buf.byteLength} bytes, header needs 32 bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) {
    throw new Error(`tile magic bytes "${magic}" != "${MAGIC}"`);
  }
  const tier = view.getUint16(6, true);
  const tileIndex = view.getUint32(8, true);
  const sampleCount = view.getUint32(12, true);
  const columnCount = view.getUint32(16, true);

  const sampleOffset = 32;
  const sampleLen = sampleCount * 8;
  const columnOffset = sampleOffset + sampleLen;
  const columnLen = columnCount * 12;
  if (buf.byteLength < columnOffset + columnLen) {
    throw new Error(
      `tile buffer ${buf.byteLength} bytes too short for sample_count=${sampleCount}, column_count=${columnCount}`
    );
  }

  const sampleMin = new Float32Array(sampleCount);
  const sampleMax = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    sampleMin[i] = view.getFloat32(sampleOffset + i * 8, true);
    sampleMax[i] = view.getFloat32(sampleOffset + i * 8 + 4, true);
  }
  const columnMin = new Float32Array(columnCount);
  const columnMax = new Float32Array(columnCount);
  const columnMean = new Float32Array(columnCount);
  for (let j = 0; j < columnCount; j++) {
    columnMin[j] = view.getFloat32(columnOffset + j * 12, true);
    columnMax[j] = view.getFloat32(columnOffset + j * 12 + 4, true);
    columnMean[j] = view.getFloat32(columnOffset + j * 12 + 8, true);
  }
  return { tier, tileIndex, sampleMin, sampleMax, columnMin, columnMax, columnMean };
}

/** Fetches and decodes one tile (C3 §3.5). Settle-bound only (design §6,
 *  C3 §4) — never call from a hover/pan/zoom gesture-frame handler. */
export async function fetchTile(
  sessionId: string,
  channel: string,
  tier: number,
  tileIndex: number
): Promise<DecodedTile> {
  const buf = await invoke<ArrayBuffer>("fetch_tile", { sessionId, channel, tier, tileIndex });
  return decodeTile(buf);
}

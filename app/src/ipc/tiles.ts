import { invoke } from "@tauri-apps/api/core";

/** Sentinel written into the column time region when a column's bucket
 *  range contains no sample at all (C3 §3.5). Callers must check for this
 *  before converting `columnTUs` entries to a JS number. */
export const COLUMN_T_US_EMPTY = -9223372036854775808n; // i64::MIN

/** Decoded tile (C3 §3.5, v2 layout): the bucket min/max pairs
 *  (`sampleMin`/`sampleMax`, length `sample_count`), the coarser
 *  per-pixel-column stats (`columnMin`/`columnMax`/`columnMean`, length
 *  `column_count`) hover reads use without IPC (design §6), and the
 *  column time region (`columnTUs`, length `column_count`) placing each
 *  column on the session's real recorded time axis (C1 §2/§3.1). */
export interface DecodedTile {
  /** Tile layout version echoed from the header. `2` for this decoder. */
  version: number;
  tier: number;
  tileIndex: number;
  sampleMin: Float32Array;
  sampleMax: Float32Array;
  columnMin: Float32Array;
  columnMax: Float32Array;
  columnMean: Float32Array;
  /** µs since session start, one per column; `COLUMN_T_US_EMPTY` when the
   *  column's bucket range has no sample. Kept as `BigInt64Array` (not
   *  coerced to `number`) so the `i64::MIN` sentinel survives the decode
   *  intact — callers convert at the point of use, checking the sentinel
   *  first. */
  columnTUs: BigInt64Array;
}

const MAGIC = "IDLT";
const SUPPORTED_VERSION = 2;

/** Decodes a `fetch_tile` response per C3 §3.5's v2 layout: the fixed
 *  32-byte header, the `sample_count`-pair sample region, the
 *  `column_count`-triple column region, and the `column_count`-entry
 *  column time region. Views into `buf` with no copy (except the `i64`
 *  time region, which `DataView.getBigInt64` reads value-by-value).
 *
 *  @throws Error if the buffer is too short for the header, the magic
 *  bytes don't match, `version !== 2`, or the buffer is shorter than the
 *  header declares.
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
  const version = view.getUint16(4, true);
  if (version !== SUPPORTED_VERSION) {
    throw new Error(`tile version ${version} != supported version ${SUPPORTED_VERSION}`);
  }
  const tier = view.getUint16(6, true);
  const tileIndex = view.getUint32(8, true);
  const sampleCount = view.getUint32(12, true);
  const columnCount = view.getUint32(16, true);

  const sampleOffset = 32;
  const sampleLen = sampleCount * 8;
  const columnOffset = sampleOffset + sampleLen;
  const columnLen = columnCount * 12;
  const columnTimeOffset = columnOffset + columnLen;
  const columnTimeLen = columnCount * 8;
  const total = columnTimeOffset + columnTimeLen;
  if (buf.byteLength < total) {
    throw new Error(
      `tile buffer ${buf.byteLength} bytes too short for sample_count=${sampleCount}, column_count=${columnCount} (need ${total})`
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
  const columnTUs = new BigInt64Array(columnCount);
  for (let j = 0; j < columnCount; j++) {
    columnTUs[j] = view.getBigInt64(columnTimeOffset + j * 8, true);
  }
  return { version, tier, tileIndex, sampleMin, sampleMax, columnMin, columnMax, columnMean, columnTUs };
}

/** Fetches and decodes one tile (C3 §3.5, v2 layout). `columnCount` is the
 *  caller's own chart width in pixel columns (ruling R43) — only the
 *  frontend knows it. Settle-bound only (design §6, C3 §4) — never call
 *  from a hover/pan/zoom gesture-frame handler. */
export async function fetchTile(
  sessionId: string,
  channel: string,
  tier: number,
  tileIndex: number,
  columnCount: number
): Promise<DecodedTile> {
  const buf = await invoke<ArrayBuffer>("fetch_tile", { sessionId, channel, tier, tileIndex, columnCount });
  return decodeTile(buf);
}

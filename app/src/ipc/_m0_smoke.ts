import { invoke } from "@tauri-apps/api/core";

/**
 * M0-only smoke layout: bare little-endian f32s over `smoke_tile`. Superseded
 * by the real tile layout in `./tiles.ts` (C3 §3.5). Kept only so the App
 * shell still proves binary IPC before Task 14 wires `fetch_tile` for real;
 * deleted in Task 15 along with the Rust `smoke_tile` command.
 */
export function decodeSmokeTile(buf: ArrayBuffer): Float32Array {
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`tile byte length ${buf.byteLength} is not a multiple of 4`);
  }
  return new Float32Array(buf);
}

export async function fetchSmokeTile(n: number): Promise<Float32Array> {
  const buf = await invoke<ArrayBuffer>("smoke_tile", { n });
  return decodeSmokeTile(buf);
}

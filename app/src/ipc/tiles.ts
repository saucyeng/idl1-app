import { invoke } from "@tauri-apps/api/core";

/**
 * Wraps raw IPC bytes as a Float32Array view without copying.
 *
 * M0 smoke layout: bare little-endian f32s. Contract C3 replaces this with the
 * real tile layout (header, min/max pairs, per-column stats). All Tauri targets
 * are little-endian, so the platform-endian Float32Array view is correct.
 *
 * @throws Error if the byte length is not a multiple of 4.
 */
export function decodeTile(buf: ArrayBuffer): Float32Array {
  if (buf.byteLength % 4 !== 0) {
    throw new Error(`tile byte length ${buf.byteLength} is not a multiple of 4`);
  }
  return new Float32Array(buf);
}

/** Fetches `n` ascending values from the engine over binary IPC. */
export async function fetchSmokeTile(n: number): Promise<Float32Array> {
  const buf = await invoke<ArrayBuffer>("smoke_tile", { n });
  return decodeTile(buf);
}

/** The engine crate version, from `idl_rs::VERSION`. */
export async function fetchEngineVersion(): Promise<string> {
  return invoke<string>("engine_version");
}

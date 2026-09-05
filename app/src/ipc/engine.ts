import { invoke } from "@tauri-apps/api/core";

/** The engine crate version, from `idl_rs::VERSION`. Never fails (C3 §3.1). */
export async function fetchEngineVersion(): Promise<string> {
  return invoke<string>("engine_version");
}

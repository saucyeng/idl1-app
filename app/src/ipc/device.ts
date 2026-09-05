import { Channel, invoke } from "@tauri-apps/api/core";

/** Progress payload streamed by long-running commands (C3 §1). */
export interface Progress {
  /** Units completed so far. Meaning is phase-specific: bytes for a file
   *  download, records for an import, cells for a workbook (re)evaluation. */
  done: number;
  /** Units expected in total, or null when not known ahead of time. Same
   *  unit as `done`. */
  total: number | null;
  /** Short machine-readable phase name. Not localized. */
  phase: string;
}

/** One device found during `bleScan` (C3 §3.8). */
export interface DeviceDiscovered {
  /** platform BLE address/identifier */
  device_id: string;
  name: string;
  /** i32 */
  rssi_dbm: number;
}

/** `ble_connect`'s return (C3 §3.8). */
export interface ConnectionInfo {
  device_id: string;
  firmware_version: string;
  connected: boolean;
}

/** One file entry from `list_device_files` (C3 §3.8). */
export interface DeviceFile {
  name: string;
  /** u64 */
  size_bytes: number;
  /** null if the device hasn't assigned one yet */
  session_id: string | null;
}

/** `download_file`'s return (C3 §3.8). */
export interface DownloadResult {
  /** where the blob landed under <data>/blobs/sha256/ */
  path: string;
  sha256: string;
  /** u64 */
  size_bytes: number;
}

/** Scans for BLE devices for `timeoutMs` (C3 §3.8). Streams a
 *  `DeviceDiscovered` message per device found; resolves with no value when
 *  the scan window ends. Explicit user action on the Device tab. */
export async function bleScan(
  timeoutMs: number,
  onDiscovered: (d: DeviceDiscovered) => void
): Promise<void> {
  const progress = new Channel<DeviceDiscovered>();
  progress.onmessage = onDiscovered;
  return invoke<void>("ble_scan", { timeoutMs, progress });
}

/** Connects to a previously discovered device (C3 §3.8). */
export async function bleConnect(deviceId: string): Promise<ConnectionInfo> {
  return invoke<ConnectionInfo>("ble_connect", { deviceId });
}

/** Lists files present on a connected device (C3 §3.8). */
export async function listDeviceFiles(deviceId: string): Promise<DeviceFile[]> {
  return invoke<DeviceFile[]>("list_device_files", { deviceId });
}

/** Downloads `fileName` from `deviceId` (C3 §3.8). `Progress.done`/`.total`
 *  are bytes transferred/expected. Explicit user action, never a hot path. */
export async function downloadFile(
  deviceId: string,
  fileName: string,
  onProgress: (p: Progress) => void
): Promise<DownloadResult> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<DownloadResult>("download_file", { deviceId, fileName, progress });
}

/** Validates and pushes `configJson` (SPEC §8's schema) to a connected
 *  device (C3 §3.8). Local validation happens before anything is
 *  transmitted. Resolves with no value on success. */
export async function pushConfig(deviceId: string, configJson: string): Promise<void> {
  return invoke<void>("push_config", { deviceId, configJson });
}

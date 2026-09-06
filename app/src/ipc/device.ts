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

/** Connects to `deviceId` and leaves the BLE link **open**, held server-side
 *  (C3 §3.8, ruling R59). Unlike `bleConnect`, the returned `ConnectionInfo`
 *  describes a connection the caller can assume still exists afterward,
 *  until `disconnectDevice` or a later `connectDevice` for the same
 *  `deviceId` tears it down. */
export async function connectDevice(deviceId: string): Promise<ConnectionInfo> {
  return invoke<ConnectionInfo>("connect_device", { deviceId });
}

/** Tears down `deviceId`'s managed connection, if any (C3 §3.8, ruling
 *  R59). Disconnecting an unconnected device is a no-op, not an error. */
export async function disconnectDevice(deviceId: string): Promise<void> {
  return invoke<void>("disconnect_device", { deviceId });
}

/** SD card state (C3 §3.8's `deviceStatus`). `null` means unreported, never
 *  a default. */
export type SdState = "ok" | "full" | "error" | "absent";
/** GPS fix state (C3 §3.8's `deviceStatus`). `null` means unreported. */
export type GpsState = "fix" | "no_fix" | "absent";
/** IMU health state (C3 §3.8's `deviceStatus`). `null` means unreported. */
export type ImuState = "ok" | "partial" | "error" | "absent";

/** `deviceStatus`'s return (C3 §3.8, ruling R59): one read of SPEC §7.3's
 *  status characteristic. Every field except `ota_pending_verify` is
 *  nullable — `null` means "the device did not report this line", never a
 *  zero/false default. */
export interface DeviceStatus {
  wifi_on: boolean | null;
  /** true while a recording session is active */
  logging: boolean | null;
  /** u8, percent */
  battery_pct: number | null;
  sd: SdState | null;
  gps: GpsState | null;
  imu: ImuState | null;
  firmware: string | null;
  /** never null — the device either reports this state or does not */
  ota_pending_verify: boolean;
  /** raw §7.3 line value */
  hr: string | null;
  /** u8, percent */
  hr_battery_pct: number | null;
}

/** One read of `deviceId`'s status characteristic (C3 §3.8, ruling R59) —
 *  uses the managed connection from `connectDevice` when one exists,
 *  otherwise connects, reads and disconnects. Explicit user action, never a
 *  hot path. */
export async function deviceStatus(deviceId: string): Promise<DeviceStatus> {
  return invoke<DeviceStatus>("device_status", { deviceId });
}

/** `deviceControl`'s `command` argument (C3 §3.8, ruling R59): maps onto
 *  `idl_transport::ble_control::ControlCommand`'s four exposed variants. */
export type DeviceControlCommand = "start_recording" | "stop_recording" | "wifi_on" | "wifi_off";

/** Sends `command` to `deviceId`'s Control characteristic and polls status
 *  until the transition is observed or a bounded timeout expires (C3 §3.8,
 *  ruling R59). Returns the post-transition status either way — never
 *  times out to an error; a `device_rejected` rejection (C3 §2) means the
 *  device itself refused the transition (e.g. busy recording). */
export async function deviceControl(deviceId: string, command: DeviceControlCommand): Promise<DeviceStatus> {
  return invoke<DeviceStatus>("device_control", { deviceId, command });
}

/** Reads `deviceId`'s live `idl0_config.json` back over BLE (C3 §3.8,
 *  ruling R59), symmetric with `pushConfig`'s `configJson` argument. */
export async function pullConfig(deviceId: string): Promise<string> {
  return invoke<string>("pull_config", { deviceId });
}

/** One SPEC §5.2 registry row `previewChannelRegistry` predicts from a
 *  config document, with no device I/O (C3 §3.8, ruling R59). */
export interface RegistryRow {
  /** u16, SPEC §5.2 */
  channel_id: number;
  data_type: "i16" | "i32" | "u8" | "u16" | "u32";
  /** 0 = event-driven (SPEC §5.7) */
  sample_rate_hz: number;
  scale: number;
  offset: number;
  name: string;
  units: string;
}

/** Predicts the SPEC §5.2 fixed-ID subset of `configJson`'s channel
 *  registry with no device I/O (C3 §3.8, ruling R59) — a pure function of
 *  the config document. */
export async function previewChannelRegistry(configJson: string): Promise<RegistryRow[]> {
  return invoke<RegistryRow[]>("preview_channel_registry", { configJson });
}

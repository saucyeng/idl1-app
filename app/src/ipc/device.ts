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
  /** Service UUIDs from the device's advertisement (lowercase hyphenated
   *  full-128-bit form, e.g. `"0000180d-0000-1000-8000-00805f9b34fb"`),
   *  mirroring `commands/device.rs`'s `DeviceDiscovered`. Empty if the
   *  advertisement carried none — not evidence the device has no services,
   *  since a scan record can omit the service list even for a device that
   *  has one (see `Device/forms/hrmFilter.ts`). */
  service_uuids: string[];
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
/** IMU health state (C3 §3.8's `deviceStatus`). `null` means unreported.
 *  `"off"` appears only on the per-sensor `imu0`/`imu1`/`imu2` fields
 *  (disabled in the loaded config), never on the aggregate `imu` field. */
export type ImuState = "ok" | "partial" | "error" | "absent" | "off";

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
  /** Seconds elapsed since the current logging session started
   *  (`esp_timer`, device-monotonic — R113). Present only while `logging`
   *  is `true`; `null` otherwise, including while logging on firmware that
   *  doesn't report it yet. Prefer this over a client-side clock whenever
   *  present. */
  logging_elapsed_s: number | null;
  /** Unscaled main battery ADC count. `battery_pct` is deprecated on the
   *  wire (SPEC §7.3); the app scales this raw count itself and prefers it
   *  whenever both are present. */
  battery_raw: number | null;
  /** Free space on the mounted SD card, MiB. Present when `sd` is `"ok"` or
   *  `"full"`; `null` for `"error"`/`"absent"` or when unreported. */
  sd_free_mib: number | null;
  /** Raw NMEA GGA fix-quality field: 0 none, 1 GPS, 2 DGPS, 3 PPS or
   *  better. Present whenever `gps` is not `"absent"`; `null` if
   *  unreported. */
  gps_fix_quality: number | null;
  /** Satellites used in the GPS solution (GGA field 7). `0` is a valid
   *  reported value ("searching"), distinct from `null` ("unknown" — the
   *  `GPSSats` line is absent) — never collapse the two. */
  gps_sats: number | null;
  /** HDOP × 100 (e.g. 0.9 → 90). Optional even when a fix is present, so
   *  `null` is always "unknown", never a health judgement. */
  gps_hdop_x100: number | null;
  /** Per-IMU state for IMU index 0. `null` if unreported. */
  imu0: ImuState | null;
  /** Per-IMU state for IMU index 1. `null` if unreported. */
  imu1: ImuState | null;
  /** Per-IMU state for IMU index 2. `null` if unreported. */
  imu2: ImuState | null;
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

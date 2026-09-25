/** The shape every rejected Device-tab command promise carries (C3 §2).
 *  Kept local, like `app/src/ipc/workbook.ts`'s `IpcError` — this tab only
 *  ever consumes it as a caught rejection, never nested in a success payload. */
export interface DeviceIpcError {
  /** Machine-readable failure class. Never routed on `message` (C3 §2). */
  kind: string;
  /** Human-readable text from the Rust side. Not shown directly — this
   *  module's text is user-facing instead, one step removed from it. */
  message: string;
  /** Structured detail, shape per kind (C3 §2). The Device tab reads
   *  `wifi`'s `{ hint, ssid }` (SPEC §14b.3). */
  detail?: Record<string, unknown>;
}

/** Fallback text for a kind this tab has no specific copy for. C3 §5: the
 *  kind vocabulary is additive-only, so a future kind must never throw here. */
const GENERIC_TEXT = "Something went wrong talking to the device. Try again.";

/** User-facing text per `IpcErrorKind` (C3 §2) this tab can see, from
 *  `ble_scan`, `ble_connect`/`connect_device`/`disconnect_device`,
 *  `list_device_files`, `download_file`, `push_config`, `device_status`,
 *  `device_control` (C3 §3.8) and `list_profiles`/`save_profile`/
 *  `delete_profile` (C3 §3.10). Each string tells the rider what to do next,
 *  never a stack trace (CLAUDE.md §5). `config`'s entry here is the
 *  fallback used only when the device sent no reason text — see
 *  {@link describeIpcError}, which normally appends `error.message` to a
 *  `config`-kind rejection instead of using this fixed sentence alone. */
const KIND_TEXT: Record<string, string> = {
  ble: "Couldn't reach the device over Bluetooth. Check the adapter is on and the device is awake.",
  wifi: "Couldn't reach the device over WiFi. Check the device's WiFi mode and try again.",
  config: "The device rejected the config it was sent. Nothing was changed on the device.",
  config_parse: "This config isn't valid JSON — fix it before pushing.",
  config_unsupported_version: "This config's version isn't one this device supports.",
  not_found: "The device or file couldn't be found. It may have moved or been removed.",
  invalid_argument: "That value can't be saved as sent — check it's valid before trying again.",
  io: "A local file operation failed. Check disk space and try again.",
  permission_denied:
    "idl1 needs the Nearby devices (Bluetooth) permission to talk to the logger. Allow it in the system settings for idl1.",
  internal: GENERIC_TEXT,
};

/** Turns an `IpcError`-shaped rejection into text a rider can act on.
 *  Never throws, including for a kind not in the table above (C3 §5: kinds
 *  are additive, so an unrecognised one falls back to generic text rather
 *  than crashing the tab).
 *
 *  `kind: "config"` is a special case: C3 §2 defines that kind's `message`
 *  as the device's own rejection reason (e.g. "unsupported config_version"),
 *  not Rust-side debug text, so it is safe and useful to show — this
 *  function appends it to the fixed lead-in sentence. An empty `message`
 *  (a device that rejected without giving a reason) falls back to
 *  `KIND_TEXT.config` alone, never a bare trailing colon. */
export function describeIpcError(error: DeviceIpcError): string {
  if (error.kind === "config") {
    const reason = error.message.trim();
    return reason === "" ? KIND_TEXT.config : `The device rejected the config it was sent: ${reason}`;
  }
  // SPEC §14b.3: the logger's AP never answered (desktop: the user hasn't
  // joined it), or it answered with a protocol this app doesn't speak.
  if (error.kind === "wifi" && error.detail?.hint === "join_ap" && typeof error.detail.ssid === "string") {
    return `Couldn't reach ${error.detail.ssid} over WiFi. Join the ${error.detail.ssid} network in your WiFi settings, then try again.`;
  }
  if (error.kind === "wifi" && error.detail?.hint === "firmware_update") {
    return "This logger's firmware speaks a different WiFi protocol. Update its firmware, then try again.";
  }
  return KIND_TEXT[error.kind] ?? GENERIC_TEXT;
}

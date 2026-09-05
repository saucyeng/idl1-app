/** The shape every rejected Device-tab command promise carries (C3 §2).
 *  Kept local, like `app/src/ipc/workbook.ts`'s `IpcError` — this tab only
 *  ever consumes it as a caught rejection, never nested in a success payload. */
export interface DeviceIpcError {
  /** Machine-readable failure class. Never routed on `message` (C3 §2). */
  kind: string;
  /** Human-readable text from the Rust side. Not shown directly — this
   *  module's text is user-facing instead, one step removed from it. */
  message: string;
}

/** Fallback text for a kind this tab has no specific copy for. C3 §5: the
 *  kind vocabulary is additive-only, so a future kind must never throw here. */
const GENERIC_TEXT = "Something went wrong talking to the device. Try again.";

/** User-facing text per `IpcErrorKind` (C3 §2) this tab can see, from
 *  `ble_scan`, `ble_connect`, `list_device_files`, `download_file` and
 *  `push_config` (C3 §3.8). Each string tells the rider what to do next,
 *  never a stack trace (CLAUDE.md §5). */
const KIND_TEXT: Record<string, string> = {
  ble: "Couldn't reach the device over Bluetooth. Check the adapter is on and the device is awake.",
  wifi: "Couldn't reach the device over WiFi. Check the device's WiFi mode and try again.",
  config: "The device rejected the config it was sent. Nothing was changed on the device.",
  config_parse: "This config isn't valid JSON — fix it before pushing.",
  config_unsupported_version: "This config's version isn't one this device supports.",
  not_found: "The device or file couldn't be found. It may have moved or been removed.",
  io: "A local file operation failed. Check disk space and try again.",
  internal: GENERIC_TEXT,
};

/** Turns an `IpcError`-shaped rejection into text a rider can act on.
 *  Never throws, including for a kind not in the table above (C3 §5: kinds
 *  are additive, so an unrecognised one falls back to generic text rather
 *  than crashing the tab). */
export function describeIpcError(error: DeviceIpcError): string {
  return KIND_TEXT[error.kind] ?? GENERIC_TEXT;
}

import type { ConnectionInfo, DeviceDiscovered } from "../../../ipc/device";

/** Lifecycle phase of the Device tab's scan/connect flow (plan Task 1). */
export type ConnectionPhase = "idle" | "scanning" | "connecting" | "connected" | "failed";

/**
 * State for the Device tab's scan/connect flow.
 *
 * As of `connect_device`/`disconnect_device` (R59, wired by this task,
 * R77.4): `connected` reflects a **managed connection held open server-side**
 * (`rust/tauri/src/commands/device.rs`'s `connect_device`), not the old
 * connect-act-disconnect-per-call `ble_connect`. R53 Device Q4's original
 * warning — "the last attempt succeeded, never a live link" — no longer
 * holds for the happy path: the link stays open until `disconnectDevice` is
 * called or a later `connectDevice` for the same device supersedes it.
 *
 * It is still not *proof* of a live link at any given instant — a device
 * can walk out of range with no notification — which is exactly what the
 * 1 Hz `device_status` poll (`statusPoll.ts`) is for. Per ruling R78 Q2
 * (2026-09-06), a run of failed polls does **not** flip `connected` back to
 * null on its own (see `statusPoll.ts`'s `isLinkLost`) — only an explicit
 * disconnect, or a fresh successful connect, changes this field.
 */
export interface ConnectionState {
  phase: ConnectionPhase;
  /** Devices seen so far this scan window, sorted by `rssi_dbm` descending
   *  (strongest signal first), one entry per `device_id`. */
  discovered: DeviceDiscovered[];
  /** The current managed connection (`connectDevice`'s result), or null
   *  before any attempt has succeeded or after an explicit disconnect. Not
   *  a per-instant liveness guarantee — see the type doc above. */
  connected: ConnectionInfo | null;
  /** Human-readable text from the most recent failure, or null. */
  error: string | null;
}

/** The reducer's state before any action is dispatched. */
export const initialConnectionState: ConnectionState = {
  phase: "idle",
  discovered: [],
  connected: null,
  error: null,
};

/** Actions `connectionReducer` accepts, driven by `bleScan`/`connectDevice`/
 *  `disconnectDevice` callbacks and their outcomes (C3 §3.8). */
export type ConnectionAction =
  | { type: "SCAN_START" }
  | { type: "DEVICE_DISCOVERED"; device: DeviceDiscovered }
  | { type: "SCAN_END" }
  | { type: "CONNECT_START" }
  | { type: "CONNECTED"; info: ConnectionInfo }
  | { type: "DISCONNECTED" }
  | { type: "FAILED"; error: string };

/** Inserts or updates `device` in `discovered`, keeping the list sorted by
 *  `rssi_dbm` descending (strongest signal first). One entry per
 *  `device_id` — a repeat discovery replaces the earlier `rssi_dbm`. */
function upsertDiscovered(discovered: DeviceDiscovered[], device: DeviceDiscovered): DeviceDiscovered[] {
  const next = discovered.filter((d) => d.device_id !== device.device_id);
  next.push(device);
  next.sort((a, b) => b.rssi_dbm - a.rssi_dbm);
  return next;
}

/** Pure reducer over the Device tab's scan/connect state. Never called with
 *  side effects — `index.tsx` dispatches actions from `bleScan`/
 *  `connectDevice`/`disconnectDevice` callbacks and awaited results. */
export function connectionReducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
  switch (action.type) {
    case "SCAN_START":
      return { ...state, phase: "scanning", discovered: [], error: null };
    case "DEVICE_DISCOVERED":
      if (state.phase !== "scanning") {
        return state;
      }
      return { ...state, discovered: upsertDiscovered(state.discovered, action.device) };
    case "SCAN_END":
      return { ...state, phase: "idle" };
    case "CONNECT_START":
      return { ...state, phase: "connecting", error: null };
    case "CONNECTED":
      return { ...state, phase: "connected", connected: action.info, error: null };
    case "DISCONNECTED":
      return { ...state, phase: "idle", connected: null };
    case "FAILED":
      return { ...state, phase: "failed", error: action.error };
    default:
      return state;
  }
}

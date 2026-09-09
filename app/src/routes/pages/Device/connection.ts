import type { ConnectionInfo, DeviceDiscovered } from "../../../ipc/device";

/** Lifecycle phase of the Device tab's scan/connect flow (plan Task 1). */
export type ConnectionPhase = "idle" | "scanning" | "connecting" | "connected" | "failed";

/**
 * State for the Device tab's scan/connect flow.
 *
 * As of `connect_device`/`disconnect_device` (R59, wired by this task,
 * R77.4): each entry in {@link ConnectionState.connections} reflects a
 * managed connection held open server-side
 * (`rust/tauri/src/commands/device.rs`'s `connect_device`), not the old
 * connect-act-disconnect-per-call `ble_connect`. R53 Device Q4's original
 * warning — "the last attempt succeeded, never a live link" — no longer
 * holds for the happy path: a link stays open until `disconnectDevice` is
 * called for that `device_id`, or a later `connectDevice` for the same
 * device supersedes it.
 *
 * **N devices (decision 86, wave-3 lane D task 1).** `connect_device`/
 * `disconnect_device`/`device_status`/`device_control` all key on
 * `device_id` (C3 §3.8) — the Rust side already manages one connection per
 * device independently, so this reducer holds a list instead of a single
 * slot. `activeDeviceId` is which connected device the tab currently shows
 * (hero card, live status, Files, Config); switching it is a pure state
 * change with no IPC (decision 86: "switching the active device... is one
 * tap") — the other devices' managed links and any in-progress recordings
 * are untouched by an active-device switch, since neither depends on the
 * app's poll.
 *
 * A connection is still not *proof* of a live link at any given instant —
 * a device can walk out of range with no notification — which is exactly
 * what the 1 Hz `device_status` poll (`statusPoll.ts`) is for, run only
 * against the active device. Per ruling R78 Q2 (2026-09-06), a run of
 * failed polls does **not** remove a device from `connections` on its own
 * (see `statusPoll.ts`'s `isLinkLost`) — only an explicit disconnect, or a
 * fresh successful connect, changes membership.
 */
export interface ConnectionState {
  phase: ConnectionPhase;
  /** Devices seen so far this scan window, sorted by `rssi_dbm` descending
   *  (strongest signal first), one entry per `device_id`. Includes devices
   *  already in `connections` — rediscovering an already-connected device
   *  is harmless and lets the user see it is still in range. */
  discovered: DeviceDiscovered[];
  /** Every device with a currently managed connection (R59), one entry per
   *  `device_id`, in the order each was connected. Empty when none are
   *  connected. */
  connections: ConnectionInfo[];
  /** Which connected device's hero/status/files/config the tab currently
   *  shows. Null iff `connections` is empty; otherwise always a
   *  `device_id` present in `connections`. */
  activeDeviceId: string | null;
  /** Human-readable text from the most recent failure, or null. */
  error: string | null;
}

/** The reducer's state before any action is dispatched. */
export const initialConnectionState: ConnectionState = {
  phase: "idle",
  discovered: [],
  connections: [],
  activeDeviceId: null,
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
  | { type: "DISCONNECTED"; deviceId: string }
  | { type: "SWITCH_ACTIVE"; deviceId: string }
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

/** Inserts or replaces `info` in `connections` by `device_id`, keeping
 *  connect order for everything else (a reconnect of an already-connected
 *  device updates its entry in place rather than moving it to the end). */
function upsertConnection(connections: ConnectionInfo[], info: ConnectionInfo): ConnectionInfo[] {
  const idx = connections.findIndex((c) => c.device_id === info.device_id);
  if (idx === -1) return [...connections, info];
  const next = connections.slice();
  next[idx] = info;
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
      return { ...state, phase: state.connections.length > 0 ? "connected" : "idle" };
    case "CONNECT_START":
      return { ...state, phase: "connecting", error: null };
    case "CONNECTED": {
      const connections = upsertConnection(state.connections, action.info);
      // A freshly connected device becomes the one the tab shows — the
      // natural read of "connect it" in a field workflow, and how
      // auto-connect (Task 2) surfaces the reconnected device on launch.
      return { ...state, phase: "connected", connections, activeDeviceId: action.info.device_id, error: null };
    }
    case "DISCONNECTED": {
      const connections = state.connections.filter((c) => c.device_id !== action.deviceId);
      const activeDeviceId =
        state.activeDeviceId === action.deviceId ? (connections[0]?.device_id ?? null) : state.activeDeviceId;
      return { ...state, phase: connections.length > 0 ? "connected" : "idle", connections, activeDeviceId };
    }
    case "SWITCH_ACTIVE":
      if (!state.connections.some((c) => c.device_id === action.deviceId)) return state;
      return { ...state, activeDeviceId: action.deviceId };
    case "FAILED":
      return { ...state, phase: "failed", error: action.error };
    default:
      return state;
  }
}

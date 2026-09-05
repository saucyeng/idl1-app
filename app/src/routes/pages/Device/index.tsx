import { useCallback, useReducer } from "react";

import { bleConnect, bleScan } from "../../../ipc/device";
import { connectionReducer, initialConnectionState } from "./connection";
import { describeIpcError } from "./errors";

/** Scan window length passed to `bleScan` (C3 §3.8), in milliseconds. Not
 *  user-configurable in wave 2. */
const SCAN_TIMEOUT_MS = 10_000;

/** The Device tab (plan Task 1). Renders the tab's three regions: a hero
 *  region (scan/connect), a status line, and an empty config region —
 *  the config model itself is Tasks 2–7, not this task.
 *
 *  `connected` reflects only "the last connect attempt succeeded," never a
 *  live link the tab can assume still exists between calls (R53 Device Q4,
 *  see `connection.ts`'s `ConnectionState` doc). */
export default function Device() {
  const [state, dispatch] = useReducer(connectionReducer, initialConnectionState);

  const onScan = useCallback(() => {
    dispatch({ type: "SCAN_START" });
    bleScan(SCAN_TIMEOUT_MS, (device) => dispatch({ type: "DEVICE_DISCOVERED", device }))
      .then(() => dispatch({ type: "SCAN_END" }))
      .catch((err: { kind: string; message: string }) =>
        dispatch({ type: "FAILED", error: describeIpcError(err) })
      );
  }, []);

  const onConnect = useCallback((deviceId: string) => {
    dispatch({ type: "CONNECT_START" });
    bleConnect(deviceId)
      .then((info) => dispatch({ type: "CONNECTED", info }))
      .catch((err: { kind: string; message: string }) =>
        dispatch({ type: "FAILED", error: describeIpcError(err) })
      );
  }, []);

  return (
    <div className="device-tab">
      <section className="device-tab__hero">
        <button type="button" onClick={onScan} disabled={state.phase === "scanning"}>
          {state.phase === "scanning" ? "Scanning…" : "Scan for devices"}
        </button>
        <ul>
          {state.discovered.map((d) => (
            <li key={d.device_id}>
              {d.name} ({d.rssi_dbm} dBm){" "}
              <button type="button" onClick={() => onConnect(d.device_id)} disabled={state.phase === "connecting"}>
                Connect
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="device-tab__status">
        {state.phase === "connected" && state.connected && (
          <p>Last connect succeeded — firmware {state.connected.firmware_version}</p>
        )}
        {state.phase === "failed" && state.error && <p role="alert">{state.error}</p>}
      </section>
      <section className="device-tab__config">{/* config model: Tasks 2–7 */}</section>
    </div>
  );
}

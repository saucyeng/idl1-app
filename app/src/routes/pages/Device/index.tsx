import { useCallback, useReducer, useState } from "react";

import { listSessions } from "../../../ipc/catalog";
import { bleConnect, bleScan } from "../../../ipc/device";
import ChannelsTable from "./ChannelsTable";
import { connectionReducer, initialConnectionState } from "./connection";
import { defaultConfig } from "./config/defaults";
import type { DeviceConfig } from "./config/model";
import DeviceFiles from "./DeviceFiles";
import { describeIpcError } from "./errors";
import HeroCard from "./HeroCard";
import ProfileBar from "./ProfileBar";
import { initialProfilesState, profilesReducer } from "./profiles";
import PushConfigBar from "./PushConfigBar";
import { listSources } from "./sources";

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
  // In-memory profile library (Task 8) — not `useReducer` directly, since
  // `profilesReducer` only knows the five actions its tests cover
  // (select/create/rename/duplicate/delete); every live edit to the active
  // profile's config, below, is this component's own bookkeeping over the
  // same state, not a sixth untested reducer action.
  const [profilesState, setProfilesState] = useState(initialProfilesState);
  const deviceId = state.connected?.device_id ?? "";
  // Session ids the catalog already knows about (`listSessions`, C3 §3.2),
  // used only to compute `DeviceFiles`' `isNew` flags. Refreshed on every
  // successful connect (a user action), never by an effect — the standing
  // reviewer brief's IPC-effects rule.
  const [knownSessionIds, setKnownSessionIds] = useState<Set<string>>(new Set());

  function dispatchProfiles(action: Parameters<typeof profilesReducer>[1]): void {
    setProfilesState((prev) => profilesReducer(prev, action));
  }

  const activeProfile = profilesState.profiles.find((p) => p.profile_id === profilesState.activeId) ?? null;
  // `pull_config` (IPC need 10) is not wired yet — every value the config
  // card shows is `defaultConfig`'s fabricated placeholder, never a device's
  // actual settings, until a profile exists to hold a real one.
  const hasPulledConfig = false;
  const config: DeviceConfig = activeProfile?.config ?? defaultConfig(deviceId);

  function onConfigChange(next: DeviceConfig): void {
    if (activeProfile === null) return; // no profile to save the edit into yet
    setProfilesState((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) => (p.profile_id === activeProfile.profile_id ? { ...p, config: next, updated_at_ms: Date.now() } : p)),
    }));
  }

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
      .then((info) => {
        dispatch({ type: "CONNECTED", info });
        // Best-effort refresh of known session ids for the files view's
        // `isNew` computation; a failure here leaves the previous set in
        // place rather than blocking the connect result.
        listSessions()
          .then((sessions) => setKnownSessionIds(new Set(sessions.map((s) => s.session_id))))
          .catch(() => {});
      })
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
        <HeroCard connectionState={state} />
        {state.phase === "failed" && state.error && <p role="alert">{state.error}</p>}
      </section>
      {state.connected && (
        <section className="device-tab__files">
          <DeviceFiles deviceId={deviceId} knownSessionIds={knownSessionIds} />
        </section>
      )}
      <section className="device-tab__config">
        <ProfileBar state={profilesState} dispatch={dispatchProfiles} deviceId={deviceId} />
        {activeProfile === null && (
          <p role="status" className="device-tab__config-placeholder-notice">
            No profile active — create or select one above to edit and push a config.
          </p>
        )}
        {!hasPulledConfig && (
          <p role="status" className="device-tab__config-placeholder-notice">
            No device configuration loaded — showing defaults. Pull from device is not available yet.
          </p>
        )}
        <ChannelsTable sources={listSources(config)} config={config} onConfigChange={onConfigChange} />
        <PushConfigBar deviceId={deviceId} config={activeProfile?.config ?? null} connected={state.connected !== null} />
      </section>
    </div>
  );
}

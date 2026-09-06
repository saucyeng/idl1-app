import { useCallback, useEffect, useReducer, useState } from "react";

import { listProfiles, saveProfile, deleteProfile } from "../../../ipc/app";
import { listSessions } from "../../../ipc/catalog";
import { bleScan, connectDevice, deviceControl, deviceStatus, disconnectDevice } from "../../../ipc/device";
import type { DeviceControlCommand } from "../../../ipc/device";
import ChannelsTable from "./ChannelsTable";
import { transitionObserved } from "./control";
import { connectionReducer, initialConnectionState } from "./connection";
import { defaultConfig } from "./config/defaults";
import type { DeviceConfig } from "./config/model";
import DeviceControls from "./DeviceControls";
import type { ControlOutcomeView } from "./DeviceControls";
import DeviceFiles from "./DeviceFiles";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import HeroCard from "./HeroCard";
import ProfileBar from "./ProfileBar";
import { initialProfilesState, profilesReducer } from "./profiles";
import type { ProfileView } from "./profiles";
import { loadProfiles, persistProfile, removeProfile } from "./profilesSync";
import type { SkippedProfile } from "./profilesSync";
import PushConfigBar from "./PushConfigBar";
import { listSources } from "./sources";
import { deviceStatusReducer, initialDeviceStatusState, isLinkLost, startStatusPoll } from "./statusPoll";
import type { StatusPollDeps } from "./statusPoll";

/** Scan window length passed to `bleScan` (C3 §3.8), in milliseconds. Not
 *  user-configurable in wave 2. */
const SCAN_TIMEOUT_MS = 10_000;

/** Real `StatusPollDeps` for `startStatusPoll` (`statusPoll.ts`): the actual
 *  `device_status` command plus the real timer and page-visibility APIs.
 *  Built once at module scope — every field is a stable, side-effect-free
 *  function reference, so passing this object into an effect never
 *  violates the "no function props in a dependency array" rule (the object
 *  itself is not part of any dependency array; the effect below reads it
 *  directly from this module). */
const STATUS_POLL_DEPS: StatusPollDeps = {
  deviceStatus,
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  isVisible: () => document.visibilityState === "visible",
  onVisibilityChange: (handler) => {
    const listener = () => {
      if (document.visibilityState === "visible") handler();
    };
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
};

/** Real IO for `profilesSync.ts` — the landed `list_profiles`/`save_profile`/
 *  `delete_profile` commands, unwrapped so the interaction-side code that
 *  calls `persistProfile`/`removeProfile` never imports `ipc/app` directly. */
const PROFILES_SYNC_DEPS = { listProfiles, saveProfile, deleteProfile };

/** Deep-equality by JSON serialisation — every field of a `ProfileView`
 *  (including its `DeviceConfig`) is plain JSON, so this is exact, not an
 *  approximation. Used only to derive the profile bar's dirty marker, never
 *  for anything load-bearing (SPEC/contract correctness never depends on
 *  key order, which `JSON.stringify` does not guarantee across objects
 *  built differently — the two `ProfileView`s compared here are always
 *  built by the same code path, so order matches in practice). */
function profileViewsEqual(a: ProfileView | undefined, b: ProfileView | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The Device tab (plan Task 1, wired live by L7b Task 10, R77.4). Scans/
 * connects over a managed BLE link (`connectDevice`/`disconnectDevice`),
 * polls `device_status` at 1 Hz while connected and the tab is mounted and
 * visible, offers provisional recording/WiFi controls, and persists bike
 * profiles over `list_profiles`/`save_profile`/`delete_profile`.
 *
 * `connectionState.connected` is a managed connection (see `connection.ts`'s
 * doc) — not, by itself, proof of a live link at this instant; the status
 * poll is that evidence, and a run of failed polls surfaces as a
 * "link lost?" note (R78 Q2) without changing `connected` or stopping the
 * poll, since the device may simply be temporarily out of range.
 */
export default function Device() {
  const [state, dispatch] = useReducer(connectionReducer, initialConnectionState);
  const [profilesState, setProfilesState] = useState(initialProfilesState);
  const [lastSavedById, setLastSavedById] = useState<Record<string, ProfileView>>({});
  const [skippedProfiles, setSkippedProfiles] = useState<SkippedProfile[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const deviceId = state.connected?.device_id ?? "";
  // Session ids the catalog already knows about (`listSessions`, C3 §3.2),
  // used only to compute `DeviceFiles`' `isNew` flags. Refreshed on every
  // successful connect (a user action), never by an effect — the standing
  // reviewer brief's IPC-effects rule.
  const [knownSessionIds, setKnownSessionIds] = useState<Set<string>>(new Set());

  const [statusState, dispatchStatus] = useReducer(deviceStatusReducer, initialDeviceStatusState);
  const [pendingControl, setPendingControl] = useState<DeviceControlCommand | null>(null);
  const [lastControlOutcome, setLastControlOutcome] = useState<ControlOutcomeView | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);

  function dispatchProfiles(action: Parameters<typeof profilesReducer>[1]): void {
    setProfilesState((prev) => profilesReducer(prev, action));
  }

  const activeProfile = profilesState.profiles.find((p) => p.profile_id === profilesState.activeId) ?? null;
  // `pull_config` (IPC need 10) is not wired yet — every value the config
  // card shows is `defaultConfig`'s fabricated placeholder, never a device's
  // actual settings, until a profile exists to hold a real one.
  const hasPulledConfig = false;
  const config: DeviceConfig = activeProfile?.config ?? defaultConfig(deviceId);
  const profileDirty = activeProfile !== null && !profileViewsEqual(activeProfile, lastSavedById[activeProfile.profile_id]);

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
      .catch((err: DeviceIpcError) => dispatch({ type: "FAILED", error: describeIpcError(err) }));
  }, []);

  const onConnect = useCallback((deviceId: string) => {
    dispatch({ type: "CONNECT_START" });
    connectDevice(deviceId)
      .then((info) => {
        dispatch({ type: "CONNECTED", info });
        // Best-effort refresh of known session ids for the files view's
        // `isNew` computation; a failure here leaves the previous set in
        // place rather than blocking the connect result.
        listSessions()
          .then((sessions) => setKnownSessionIds(new Set(sessions.map((s) => s.session_id))))
          .catch(() => {});
      })
      .catch((err: DeviceIpcError) => dispatch({ type: "FAILED", error: describeIpcError(err) }));
  }, []);

  const onDisconnect = useCallback((disconnectingDeviceId: string) => {
    disconnectDevice(disconnectingDeviceId)
      .then(() => dispatch({ type: "DISCONNECTED" }))
      .catch((err: DeviceIpcError) => dispatch({ type: "FAILED", error: describeIpcError(err) }));
  }, []);

  const onControl = useCallback(
    (command: DeviceControlCommand) => {
      if (deviceId === "" || pendingControl !== null) return;
      setPendingControl(command);
      setControlError(null);
      deviceControl(deviceId, command)
        .then((status) => {
          dispatchStatus({ type: "status", status });
          setLastControlOutcome({ command, outcome: transitionObserved(command, status) });
          setPendingControl(null);
        })
        .catch((err: DeviceIpcError) => {
          setControlError(describeIpcError(err));
          setPendingControl(null);
        });
    },
    [deviceId, pendingControl],
  );

  function onSaveActiveProfile(): void {
    if (activeProfile === null || savingProfile) return;
    setSavingProfile(true);
    const toSave: ProfileView = { ...activeProfile, updated_at_ms: Date.now() };
    persistProfile(PROFILES_SYNC_DEPS, toSave)
      .then((outcome) => {
        setSavingProfile(false);
        if (!outcome.ok) {
          setProfileError(describeIpcError(outcome.error));
          return;
        }
        setProfileError(null);
        setProfilesState((prev) => ({
          ...prev,
          profiles: prev.profiles.map((p) => (p.profile_id === outcome.profile.profile_id ? outcome.profile : p)),
        }));
        setLastSavedById((prev) => ({ ...prev, [outcome.profile.profile_id]: outcome.profile }));
      })
      .catch(() => setSavingProfile(false)); // persistProfile never rejects; defensive only
  }

  function onDeleteProfile(profileId: string): void {
    removeProfile(PROFILES_SYNC_DEPS, profileId)
      .then((outcome) => {
        if (!outcome.ok) {
          setProfileError(describeIpcError(outcome.error));
          return;
        }
        setProfileError(null);
        dispatchProfiles({ type: "DELETE", profileId });
        setLastSavedById((prev) => {
          const next = { ...prev };
          delete next[profileId];
          return next;
        });
      })
      .catch(() => {}); // removeProfile never rejects; defensive only
  }

  // Loads the persisted profile library once, on mount (lane brief
  // Interface 3). No cancelling cleanup — the request is never aborted —
  // only a staleness flag so a result that arrives after this component has
  // unmounted is never dispatched into a discarded state setter.
  useEffect(() => {
    let stale = false;
    loadProfiles(PROFILES_SYNC_DEPS)
      .then((result) => {
        if (stale) return;
        setProfilesState(result.state);
        setSkippedProfiles(result.skipped);
        const snapshot: Record<string, ProfileView> = {};
        for (const profile of result.state.profiles) snapshot[profile.profile_id] = profile;
        setLastSavedById(snapshot);
      })
      .catch((err: DeviceIpcError) => {
        if (stale) return;
        setProfileError(describeIpcError(err));
      });
    return () => {
      stale = true;
    };
  }, []);

  // 1 Hz `device_status` poll (wave-2 operating brief §4's effects rule):
  // all decision logic lives in the pure `startStatusPoll` driver. Only
  // mounted while a device is connected (data-only dependency array); the
  // driver itself pauses while the window is hidden (R78 Q1) and guards
  // against a stale in-flight result after `stop()` with its own generation
  // counter, so this cleanup never needs to cancel anything.
  useEffect(() => {
    if (!state.connected) return;
    const stop = startStatusPoll(STATUS_POLL_DEPS, state.connected.device_id, dispatchStatus);
    return stop;
  }, [state.connected?.device_id]);

  return (
    <div className="device-tab">
      <section className="device-tab__hero">
        <button type="button" onClick={onScan} disabled={state.phase === "scanning"}>
          {state.phase === "scanning" ? "Scanning…" : "Scan for devices"}
        </button>
        {state.connected && (
          <button type="button" onClick={() => onDisconnect(state.connected!.device_id)}>
            Disconnect
          </button>
        )}
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
        <HeroCard connectionState={state} status={statusState.status} linkLost={isLinkLost(statusState)} />
        {state.phase === "failed" && state.error && <p role="alert">{state.error}</p>}
        {statusState.error && <p role="status">{describeIpcError(statusState.error)}</p>}
      </section>
      {state.connected && (
        <section className="device-tab__controls">
          <DeviceControls
            status={statusState.status}
            pending={pendingControl}
            lastOutcome={lastControlOutcome}
            onControl={onControl}
          />
          {controlError && <p role="alert">{controlError}</p>}
        </section>
      )}
      {state.connected && (
        <section className="device-tab__files">
          <DeviceFiles deviceId={deviceId} knownSessionIds={knownSessionIds} />
        </section>
      )}
      <section className="device-tab__config">
        <ProfileBar
          state={profilesState}
          dispatch={dispatchProfiles}
          deviceId={deviceId}
          dirty={profileDirty}
          saving={savingProfile}
          onSave={onSaveActiveProfile}
          onDelete={onDeleteProfile}
          skipped={skippedProfiles}
          error={profileError}
        />
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

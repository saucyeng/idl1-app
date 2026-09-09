import { useCallback, useEffect, useReducer, useState } from "react";

import { SectionHead } from "../../../components/brand/SectionHead";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
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
import { composeVisibility, getActiveRoute, subscribeRouteVisible } from "../../../shell/routeVisibility";

/** How often the recording timer's local display state re-renders, in
 *  milliseconds. Wall-clock display only — advancing this never calls IPC,
 *  so it does not fall under the effects rule (lane brief Open question 2). */
const TIMER_TICK_MS = 1_000;

/** Scan window length passed to `bleScan` (C3 §3.8), in milliseconds. Not
 *  user-configurable in wave 2. */
const SCAN_TIMEOUT_MS = 10_000;

/** Real `StatusPollDeps` for `startStatusPoll` (`statusPoll.ts`): the actual
 *  `device_status` command plus the real timer and visibility APIs. Built
 *  once at module scope — every field is a stable, side-effect-free
 *  function reference, so passing this object into an effect never
 *  violates the "no function props in a dependency array" rule (the object
 *  itself is not part of any dependency array; the effect below reads it
 *  directly from this module).
 *
 *  `isVisible`/`onVisibilityChange` compose the window's own visibility with
 *  whether Device is the shell's active route (`shell/routeVisibility.tsx`'s
 *  `composeVisibility`/`subscribeRouteVisible`, UI-4 brief "Mount-and-hide vs.
 *  the Device poll", R78): under mount-and-hide every page stays mounted, so
 *  `document.visibilityState` alone no longer means "on screen" — a hidden
 *  Device tab would otherwise keep the BLE link polled at 1 Hz forever. The
 *  poll's own pause/resume logic in `statusPoll.ts` is unchanged; only what
 *  "visible" means to it has. */
const STATUS_POLL_DEPS: StatusPollDeps = {
  deviceStatus,
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  isVisible: () => composeVisibility(document.visibilityState === "visible", getActiveRoute() === "device"),
  onVisibilityChange: (handler) => subscribeRouteVisible("device", handler),
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
 * Each entry in `connectionState.connections` is a managed connection (see
 * `connection.ts`'s doc) — not, by itself, proof of a live link at this
 * instant; the status poll (run only against the active device) is that
 * evidence, and a run of failed polls surfaces as a "link lost?" note
 * (R78 Q2) without changing `connections` or stopping the poll, since the
 * device may simply be temporarily out of range. `activeDeviceId` picks
 * which connected device the hero/status/files/config sections show
 * (decision 86); switching it is one tap and touches no IPC.
 */
export default function Device() {
  const [state, dispatch] = useReducer(connectionReducer, initialConnectionState);
  const [profilesState, setProfilesState] = useState(initialProfilesState);
  const [lastSavedById, setLastSavedById] = useState<Record<string, ProfileView>>({});
  const [skippedProfiles, setSkippedProfiles] = useState<SkippedProfile[]>([]);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const deviceId = state.activeDeviceId ?? "";
  // Session ids the catalog already knows about (`listSessions`, C3 §3.2),
  // used only to compute `DeviceFiles`' `isNew` flags. Refreshed on every
  // successful connect (a user action), never by an effect — the standing
  // reviewer brief's IPC-effects rule.
  const [knownSessionIds, setKnownSessionIds] = useState<Set<string>>(new Set());

  const [statusState, dispatchStatus] = useReducer(deviceStatusReducer, initialDeviceStatusState);
  const [pendingControl, setPendingControl] = useState<DeviceControlCommand | null>(null);
  const [lastControlOutcome, setLastControlOutcome] = useState<ControlOutcomeView | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  // Wall-clock timestamp this session first observed `logging: true`, for
  // `HeroCard`'s recording timer (lane brief Open question 2) — reset to
  // null the moment a poll or control read-back reports `logging` false
  // again. Not derived from any device-reported time (SPEC §23.10: the
  // device does not report a recording-start time), so this is only ever
  // "how long this app has seen it recording", not ground truth.
  const [recordingStartedAtMs, setRecordingStartedAtMs] = useState<number | null>(null);
  // Ticks once a second purely to re-render while recording, so the timer
  // text advances — no IPC, so the effects rule does not reach it (lane
  // brief Open question 2).
  const [, tickTimer] = useState(0);

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
      .then(() => dispatch({ type: "DISCONNECTED", deviceId: disconnectingDeviceId }))
      .catch((err: DeviceIpcError) => dispatch({ type: "FAILED", error: describeIpcError(err) }));
  }, []);

  // One-tap switch between already-connected devices (decision 86) — a
  // pure state change, no IPC call, so it needs no loading/error handling
  // of its own.
  const onSwitchActive = useCallback((switchToDeviceId: string) => {
    dispatch({ type: "SWITCH_ACTIVE", deviceId: switchToDeviceId });
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
  // mounted while a device is active (data-only dependency array); the
  // driver itself pauses while the window is hidden (R78 Q1) and guards
  // against a stale in-flight result after `stop()` with its own generation
  // counter, so this cleanup never needs to cancel anything. Polls only the
  // active device (decision 86) — the other connected devices' recordings
  // are unaffected by the app's poll either way, so switching which one is
  // active is enough to redirect it.
  useEffect(() => {
    if (state.activeDeviceId === null) return;
    const stop = startStatusPoll(STATUS_POLL_DEPS, state.activeDeviceId, dispatchStatus);
    return stop;
  }, [state.activeDeviceId]);

  // Tracks when this session first saw `logging: true` (local display state
  // only — no IPC, lane brief Open question 2). Cleared on disconnect and
  // whenever a fresh read reports `logging: false`, so a stale timer never
  // survives a stop it missed.
  const logging = statusState.status?.logging === true;
  useEffect(() => {
    if (!logging) {
      setRecordingStartedAtMs(null);
      return;
    }
    setRecordingStartedAtMs((prev) => prev ?? Date.now());
  }, [logging]);

  // 1 Hz display tick while recording, so `HeroCard`'s elapsed-time text
  // advances even though nothing else about `statusState` has changed.
  useEffect(() => {
    if (recordingStartedAtMs === null) return;
    const handle = window.setInterval(() => tickTimer((n) => n + 1), TIMER_TICK_MS);
    return () => window.clearInterval(handle);
  }, [recordingStartedAtMs]);

  const elapsedMs = recordingStartedAtMs === null ? null : Date.now() - recordingStartedAtMs;

  return (
    <div className="device-tab mx-auto flex max-w-[480px] flex-col gap-4 p-4">
      <section className="device-tab__status flex flex-col gap-2">
        <HeroCard
          connectionState={state}
          status={statusState.status}
          linkLost={isLinkLost(statusState)}
          pending={pendingControl}
          elapsedMs={elapsedMs}
          onScan={onScan}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onSwitchActive={onSwitchActive}
          onControl={onControl}
        />
        {statusState.error && <p role="status" className="font-mono text-sm text-fg-dim">{describeIpcError(statusState.error)}</p>}
      </section>

      {state.activeDeviceId !== null && (
        <section className="device-tab__controls flex flex-col gap-2">
          <SectionHead>WiFi</SectionHead>
          <DeviceControls
            status={statusState.status}
            pending={pendingControl}
            lastOutcome={lastControlOutcome}
            onControl={onControl}
          />
          {controlError && <p role="alert" className="font-mono text-sm text-brand-accent">{controlError}</p>}
        </section>
      )}

      {state.activeDeviceId !== null && (
        <section className="device-tab__files flex flex-col gap-2">
          <SectionHead>Files</SectionHead>
          <DeviceFiles deviceId={deviceId} knownSessionIds={knownSessionIds} />
        </section>
      )}

      <section className="device-tab__config flex flex-col gap-3 rounded-[var(--radius-card)] border border-rule bg-surface p-4">
        <SectionHead>Config</SectionHead>
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
          <p role="status" className="device-tab__config-placeholder-notice font-mono text-sm text-fg-dim">
            No profile active — create or select one above to edit and push a config.
          </p>
        )}
        {!hasPulledConfig && (
          <p role="status" className="device-tab__config-placeholder-notice font-mono text-sm text-fg-dim">
            No device configuration loaded — showing defaults. Pull from device is not available yet.
          </p>
        )}
        <ChannelsTable sources={listSources(config)} config={config} onConfigChange={onConfigChange} />
        <PushConfigBar deviceId={deviceId} config={activeProfile?.config ?? null} connected={state.activeDeviceId !== null} />
      </section>

      <Collapsible className="device-tab__calibration rounded-[var(--radius-card)] border border-rule bg-surface p-4">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex h-11 w-full items-center justify-between font-mono text-sm text-fg-dim">
            <SectionHead>Calibration</SectionHead>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <p className="font-mono text-sm text-fg-dim">
            IMU calibration (SPEC §7.6/§20) is not wired yet — `CMD_CALIBRATE_IMU` has no `idl-rs-tauri` command in this
            wave, so there is nothing here to trigger yet. Tracked as a Device refinement.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

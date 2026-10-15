import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";

import { SectionHead } from "../../../components/brand/SectionHead";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { listSessions } from "../../../ipc/catalog";
import { bleScan, connectDevice, deviceControl, deviceStatus, disconnectDevice, firmwareCatalog, onOtaStateChanged, pullConfig } from "../../../ipc/device";
import type { DeviceControlCommand } from "../../../ipc/device";
import { transitionObserved } from "./control";
import { connectionReducer, initialConnectionState } from "./connection";
import { parseConfig } from "./config/model";
import { hardwareFromName } from "./config/validate";
import type { DeviceConfig } from "./config/model";
import DeviceControls, { outcomeText } from "./DeviceControls";
import type { ControlOutcomeView } from "./DeviceControls";
import DeviceFiles from "./DeviceFiles";
import DeviceList from "./DeviceList";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import HeroCard from "./HeroCard";
import IdentitySheet from "./IdentitySheet";
import { ModuleList } from "./ModuleGrid";
import ModuleSheet from "./ModuleSheet";
import { moduleTiles } from "./moduleTiles";
import type { ModuleTile } from "./moduleTiles";
import SendBar from "./SendBar";
import { LoadMeter } from "./StepSlider";
import { effectiveRepo } from "../Settings/FirmwareSection";
import { catalogVerdict, type CatalogVerdict } from "../Settings/firmwareCatalog";
import { prefsStore } from "../Settings/appPrefsStore";
import { toast } from "sonner";
import { setDeviceLink } from "../../../shell/deviceLink";
import { useSidebarSlotNode } from "../../../shell/sidebarSlot";
import { localStorageLastDeviceBackend, shouldAutoConnect } from "./lastDevice";
import { deviceStatusReducer, initialDeviceStatusState, isLinkLost, startStatusPoll } from "./statusPoll";
import type { StatusPollDeps } from "./statusPoll";
import { composeVisibility, getActiveRoute, subscribeRouteVisible } from "../../../shell/routeVisibility";


/** Wait after a restart before the first reconnect attempt, ms (the logger
 *  reboots ~0.5 s after a push and takes a few seconds to advertise). */
const RESTART_BOOT_MS = 4000;
/** Gap between reconnect attempts, ms. */
const RESTART_RETRY_MS = 3000;
/** Reconnect attempts before giving up (~1 min). */
const RESTART_ATTEMPTS = 20;

/** Resolves after `ms`. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
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

/** The last-used device id backend (Task 2, decision 64) — `localStorage`
 *  until a real `AppSettings` field exists (`lastDevice.ts`'s doc). Built
 *  once at module scope for the same "stable reference, never a dependency
 *  array entry" reason as {@link STATUS_POLL_DEPS}. */
const LAST_DEVICE_BACKEND = localStorageLastDeviceBackend();

/** Which of the tab's screens is showing. `main` is the one-screen
 *  dashboard; `files` and `config` are the long sections it buries, each
 *  one tap away and one tap back. */
type DeviceView = "main" | "files" | "config";

/** A buried screen's top row: a 44 px back button and the screen's name. */
function SubViewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" className="h-11 gap-1" onClick={onBack}>
        <ArrowLeft className="size-4" aria-hidden />
        Device
      </Button>
      <h2 className="font-mono text-sm text-fg">{title}</h2>
    </div>
  );
}

/**
 * The Device tab (plan Task 1, wired live by L7b Task 10, R77.4). Scans/
 * connects over a managed BLE link (`connectDevice`/`disconnectDevice`),
 * polls `device_status` at 1 Hz while connected and the tab is mounted and
 * visible, and offers recording/WiFi controls. The logger's own config,
 * read back on connect, is the settings truth: module and rider/bike sheets
 * edit a draft of it, and the send bar pushes the draft (2026-10-14; the
 * app-side bike profiles are gone, one logger per bike).
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
  const deviceId = state.activeDeviceId ?? "";
  // Session ids the catalog already knows about (`listSessions`, C3 §3.2),
  // used only to compute `DeviceFiles`' `isNew` flags. Refreshed on every
  // successful connect (a user action), never by an effect — the standing
  // reviewer brief's IPC-effects rule.
  const [knownSessionIds, setKnownSessionIds] = useState<Set<string>>(new Set());
  // The active logger's own configuration, read back over BLE on connect
  // (`pull_config`, C3 §3.8): the source of the rider and bike chips and of
  // the module tiles' ranges. Null until the read arrives or if it failed.
  const [loggerConfig, setLoggerConfig] = useState<DeviceConfig | null>(null);
  // `loggerConfig` plus the edits made in the module and rider/bike sheets,
  // not yet sent. Nothing reaches the logger until Send, since a push
  // reboots it (SPEC §7.2).
  const [draft, setDraft] = useState<DeviceConfig | null>(null);
  // Where the last config read stands: Logger settings shows Read from
  // logger with "Reading…" or the failure.
  const [configRead, setConfigRead] = useState<"idle" | "reading" | "failed">("idle");
  // The module tile whose sheet is open, and whether the rider/bike sheet is.
  const [openTile, setOpenTile] = useState<ModuleTile | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  // True while the launch auto-connect to the last logger is in flight, so
  // the dashboard says "Connecting…" instead of looking idle.
  const [autoConnecting, setAutoConnecting] = useState(false);

  const [statusState, dispatchStatus] = useReducer(deviceStatusReducer, initialDeviceStatusState);
  const [pendingControl, setPendingControl] = useState<DeviceControlCommand | null>(null);
  const [lastControlOutcome, setLastControlOutcome] = useState<ControlOutcomeView | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);
  const [view, setView] = useState<DeviceView>("main");
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

  // Best-effort refresh of the library's session ids, which the
  // new-sessions banner uses to tell new logger files from old ones. A
  // failure leaves the previous set in place.
  const refreshKnownSessions = useCallback(() => {
    listSessions()
      .then((sessions) => setKnownSessionIds(new Set(sessions.map((s) => s.session_id))))
      .catch(() => {});
  }, []);

  // Reads the logger's configuration: after a connect, and from Logger
  // settings' Read from logger. A failed or unparsable read leaves the
  // chips saying "…" rather than blocking the connection, and Logger
  // settings says it failed. A re-read keeps the old config on screen until
  // the new one arrives.
  const readLoggerConfig = useCallback((connectedDeviceId: string, keepShown = false) => {
    if (!keepShown) {
      setLoggerConfig(null);
      setDraft(null);
    }
    setConfigRead("reading");
    pullConfig(connectedDeviceId)
      .then((json) => {
        const config = parseConfig(JSON.parse(json)).config;
        setLoggerConfig(config);
        setDraft(config);
        setConfigRead("idle");
      })
      .catch(() => setConfigRead("failed"));
  }, []);

  // Reconnects after the logger restarts itself: after Send to logger (the
  // push already dropped the link, push_config) and after a firmware update
  // (disconnect first, so the tile and status come from a fresh link: the
  // tile stayed red until a manual reconnect, Isaac 2026-10-15). Waits for
  // the boot, then tries every few seconds for about a minute, and re-reads
  // the config once back.
  const [restarting, setRestarting] = useState(false);
  const reconnectAfterRestart = useCallback(
    async (restartingDeviceId: string, dropLinkFirst: boolean) => {
      setRestarting(true);
      if (dropLinkFirst) await disconnectDevice(restartingDeviceId).catch(() => {});
      await sleep(RESTART_BOOT_MS);
      for (let attempt = 0; attempt < RESTART_ATTEMPTS; attempt += 1) {
        try {
          const info = await connectDevice(restartingDeviceId);
          dispatch({ type: "CONNECTED", info });
          readLoggerConfig(info.device_id, true);
          setRestarting(false);
          return;
        } catch {
          await sleep(RESTART_RETRY_MS);
        }
      }
      setRestarting(false);
      toast.error("The logger didn't come back", { description: "Power-cycle it, then connect again." });
    },
    [readLoggerConfig],
  );

  const onSent = useCallback(
    (sent: DeviceConfig, sentToDeviceId: string) => {
      setLoggerConfig(sent);
      toast.info("Sent to the logger", { description: "It is restarting to apply the new settings, then reconnecting." });
      void reconnectAfterRestart(sentToDeviceId, false);
    },
    [reconnectAfterRestart],
  );

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
        // Remembered for next launch's auto-connect (decision 64, Task 2) —
        // best-effort; a failed write here only costs the *next* launch's
        // auto-connect, never this one.
        LAST_DEVICE_BACKEND.write(info.device_id).catch(() => {});
        refreshKnownSessions();
        readLoggerConfig(info.device_id);
      })
      .catch((err: DeviceIpcError) => dispatch({ type: "FAILED", error: describeIpcError(err) }));
  }, [refreshKnownSessions, readLoggerConfig]);

  const onDisconnect = useCallback((disconnectingDeviceId: string) => {
    setLoggerConfig(null);
    setDraft(null);
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

  const wifiOn = statusState.status?.wifi_on === true;
  const onControl = useCallback(
    (command: DeviceControlCommand) => {
      if (deviceId === "" || pendingControl !== null) return;
      setControlError(null);
      // The logger refuses a BLE start while its WiFi is up (SPEC §10.4), so
      // a Record tap leaves WiFi first, then starts.
      const leaveWifiFirst = command === "start_recording" && wifiOn;
      setPendingControl(leaveWifiFirst ? "wifi_off" : command);
      const sent = leaveWifiFirst
        ? deviceControl(deviceId, "wifi_off").then(() => {
            setPendingControl(command);
            return deviceControl(deviceId, command);
          })
        : deviceControl(deviceId, command);
      sent
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
    [deviceId, pendingControl, wifiOn],
  );

  // Mirrors `state` for the auto-connect effect below to read at the
  // moment `LAST_DEVICE_BACKEND.read()` resolves, without adding `state` to
  // that effect's dependency array (which would make it re-run on every
  // connection-state change instead of once at mount). Updated on every
  // render — a plain assignment, not a side effect.
  const connectionStateRef = useRef(state);
  connectionStateRef.current = state;

  // Auto-connects to the last-used device once, on mount (Task 2, decision
  // 64: "open the app, it connects automatically"). Never blocks the UI —
  // unlike `onConnect`, this never dispatches `CONNECT_START`, so the hero
  // CTA and device picker stay interactive throughout, and a failure
  // (device off, out of range) is silently ignored rather than surfaced as
  // a "failed" banner: a routine "not on yet" case at launch is not the
  // kind of failure a deliberate manual connect attempt reports (philosophy
  // 72 — no surprise mid-launch). `autoConnectAttempted` (a ref, not state —
  // it drives no render) guards against a second attempt if the read
  // resolves after the user has already started their own scan/connect.
  const autoConnectAttempted = useRef(false);
  useEffect(() => {
    LAST_DEVICE_BACKEND.read().then((lastDeviceId) => {
      const current = connectionStateRef.current;
      if (lastDeviceId === null) return;
      if (!shouldAutoConnect(lastDeviceId, autoConnectAttempted.current, current.connections.length, current.phase)) {
        return;
      }
      autoConnectAttempted.current = true;
      setAutoConnecting(true);
      connectDevice(lastDeviceId)
        .then((info) => {
          dispatch({ type: "CONNECTED", info });
          refreshKnownSessions();
          readLoggerConfig(info.device_id);
        })
        .catch(() => {})
        .finally(() => setAutoConnecting(false));
    });
  }, [refreshKnownSessions, readLoggerConfig]);

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

  // Publishes this tab's conclusion about the link for the shell's chrome
  // to show (ruling R220 item 1's activity-bar dot and status-bar item).
  // No new work: the 1 Hz `device_status` poll above is the only source,
  // and `setDeviceLink` ignores a repeat of the value it already holds, so
  // a steady connection re-renders the chrome once, not once a second.
  const linkLost = isLinkLost(statusState);

  // A firmware update ends with the logger rebooted: reconnect on a fresh
  // link once the OTA flow settles.
  const activeIdForOta = state.activeDeviceId;
  useEffect(() => {
    if (activeIdForOta === null) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    // Only a phase reached straight from the reboot means "just restarted";
    // confirming a pending image later doesn't reboot the logger.
    let lastPhase: string | null = null;
    void onOtaStateChanged((next) => {
      const fromReboot = lastPhase === "rebooting" || lastPhase === "reconnecting";
      lastPhase = next.phase;
      if (fromReboot && (next.phase === "confirmed" || next.phase === "rolled_back" || next.phase === "pending_verify")) {
        void reconnectAfterRestart(activeIdForOta, true);
      }
    }).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });
    return () => {
      cancelled = true;
      if (unlisten !== null) unlisten();
    };
  }, [activeIdForOta, reconnectAfterRestart]);

  // The Firmware tile's dot (2026-10-15): one catalog check per connected
  // firmware version, and again when the Firmware sheet changes the
  // channel or repository (both live in the prefs store). A failed check
  // leaves the tile neutral.
  const [firmwareVerdict, setFirmwareVerdict] = useState<CatalogVerdict | null>(null);
  const deviceFirmware = statusState.status?.firmware ?? null;
  useEffect(() => {
    if (state.activeDeviceId === null || deviceFirmware === null || deviceFirmware === "") {
      setFirmwareVerdict(null);
      return;
    }
    let live = true;
    const run = () =>
      prefsStore.get().then(async (prefs) => {
        const repo = effectiveRepo(prefs.ui.firmware_repo);
        const channel = prefs.ui.firmware_channel;
        try {
          const releases = await firmwareCatalog(repo, channel);
          if (live) setFirmwareVerdict(catalogVerdict({ firmwareRepo: repo, channel, deviceVersion: deviceFirmware, releases }));
        } catch {
          if (live) setFirmwareVerdict(null);
        }
      });
    void run();
    const unsubscribe = prefsStore.subscribe(() => void run());
    return () => {
      live = false;
      unsubscribe();
    };
  }, [state.activeDeviceId, deviceFirmware]);
  useEffect(() => {
    setDeviceLink(state.activeDeviceId === null ? "disconnected" : linkLost ? "lost" : "connected");
  }, [state.activeDeviceId, linkLost]);

  // The device list is this activity's sidebar content (R220 item 1). Where
  // there is no sidebar (narrow widths, R220 item 3) it is not rendered at
  // all: the hero card's own picker already scans, connects and switches,
  // and an inline list would push the dashboard past one phone screen.
  const sidebarNode = useSidebarSlotNode("device");
  const deviceList = (
    <DeviceList state={state} onScan={onScan} onConnect={onConnect} onSwitchActive={onSwitchActive} />
  );

  // Files needs a device; if the link goes away while that screen is open,
  // fall back to the dashboard rather than showing an empty screen.
  const shownView: DeviceView = view === "files" && state.activeDeviceId === null ? "main" : view;
  // A start/stop that the status read-back did not confirm must be said on
  // the dashboard, where the button that sent it lives. A confirmed one
  // needs no line — the CTA itself has already changed.
  const unconfirmedRecording =
    lastControlOutcome !== null &&
    lastControlOutcome.outcome !== "observed" &&
    (lastControlOutcome.command === "start_recording" || lastControlOutcome.command === "stop_recording")
      ? lastControlOutcome
      : null;

  const activeConnection = state.connections.find((c) => c.device_id === state.activeDeviceId) ?? null;
  const tiles = moduleTiles({ status: statusState.status, config: draft, linkLost, firmwareVerdict });
  const hardware = hardwareFromName(activeConnection?.name ?? "");
  const sendBar =
    activeConnection !== null && loggerConfig !== null && draft !== null ? (
      <SendBar
        deviceId={activeConnection.device_id}
        base={loggerConfig}
        draft={draft}
        hardware={hardware}
        status={statusState.status}
        onSent={(sent) => onSent(sent, activeConnection.device_id)}
        onDiscard={() => setDraft(loggerConfig)}
        onRead={() => readLoggerConfig(activeConnection.device_id, true)}
        reading={configRead === "reading"}
      />
    ) : null;
  // Logger settings always offers Read and Send. Before any config has been
  // read (or after a failed read) only Read applies.
  const configBar =
    activeConnection === null ? null : sendBar !== null && loggerConfig !== null && draft !== null ? (
      <SendBar
        deviceId={activeConnection.device_id}
        base={loggerConfig}
        draft={draft}
        hardware={hardware}
        status={statusState.status}
        onSent={(sent) => onSent(sent, activeConnection.device_id)}
        onDiscard={() => setDraft(loggerConfig)}
        onRead={() => readLoggerConfig(activeConnection.device_id, true)}
        reading={configRead === "reading"}
        alwaysShow
      />
    ) : (
      <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-rule bg-surface p-3">
        <span className="text-sm font-medium text-fg">
          {configRead === "failed" ? "Couldn't read the logger's settings" : configRead === "reading" ? "Reading the logger's settings…" : "Settings not read yet"}
        </span>
        <Button
          type="button"
          className="h-12 w-full text-base"
          disabled={configRead === "reading"}
          onClick={() => readLoggerConfig(activeConnection.device_id)}
        >
          {configRead === "reading" ? "Reading…" : "Read from logger"}
        </Button>
      </div>
    );

  return (
    /* `h-full overflow-y-auto`, like every other route's own scroll
       container (ruling R221.1): the shell's content container clips rather
       than scrolls. The dashboard (`main`) is built to fit one phone screen
       -- hero card, then two 56 px buttons into the long sections -- so the
       scroll only ever engages on the buried Files and Config screens, or if
       an error note pushes the dashboard past a very short window. All three
       screens stay mounted and are hidden with CSS, so a download in flight
       or an unsaved config edit survives a trip back to the dashboard. */
    <div className="device-tab mx-auto flex h-full max-w-[480px] flex-col overflow-y-auto p-3">
      {sidebarNode !== null && createPortal(deviceList, sidebarNode)}

      <div className={cn("device-tab__main flex flex-col gap-3", shownView !== "main" && "hidden")}>
        <HeroCard
          connectionState={state}
          status={statusState.status}
          linkLost={isLinkLost(statusState)}
          pending={pendingControl}
          elapsedMs={elapsedMs}
          loggerConfig={draft}
          tileConfig={draft}
          firmwareVerdict={firmwareVerdict}
          autoConnecting={autoConnecting}
          knownSessionIds={knownSessionIds}
          onImported={refreshKnownSessions}
          onScan={onScan}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onSwitchActive={onSwitchActive}
          onControl={onControl}
          onOpen={setView}
          onModule={setOpenTile}
          onIdentity={() => setIdentityOpen(true)}
        />
        {sendBar}
        {restarting && (
          <p role="status" className="font-mono text-sm text-hivis">
            Logger restarting… reconnecting.
          </p>
        )}
        {statusState.error && <p role="status" className="font-mono text-sm text-fg-dim">{describeIpcError(statusState.error)}</p>}
        {unconfirmedRecording && (
          <p role="status" className="font-mono text-sm text-hivis" data-outcome={unconfirmedRecording.outcome}>
            {outcomeText(unconfirmedRecording)}
          </p>
        )}
        {controlError && <p role="alert" className="font-mono text-sm text-brand-accent">{controlError}</p>}
      </div>

      {state.activeDeviceId !== null && (
        <div className={cn("device-tab__files-view flex flex-col gap-4", shownView !== "files" && "hidden")}>
          <SubViewHeader title="Files" onBack={() => setView("main")} />
          <section className="device-tab__files flex flex-col gap-2">
            <DeviceFiles deviceId={deviceId} knownSessionIds={knownSessionIds} />
          </section>
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
        </div>
      )}

      <div className={cn("device-tab__config-view flex flex-col gap-4", shownView !== "config" && "hidden")}>
        <SubViewHeader title="Logger settings" onBack={() => setView("main")} />
        {configBar}
        {draft !== null && <LoadMeter config={draft} />}
        <ModuleList tiles={tiles} onOpen={setOpenTile} />
      </div>

      {activeConnection !== null && (
        <ModuleSheet
          tile={openTile}
          onClose={() => setOpenTile(null)}
          status={statusState.status}
          draft={draft}
          onDraftChange={setDraft}
          onRetryRead={() => readLoggerConfig(activeConnection.device_id)}
          hardware={hardware}
          logger={{ name: activeConnection.name, deviceId: activeConnection.device_id, firmware: statusState.status?.firmware ?? activeConnection.firmware_version ?? null }}
          onControl={onControl}
          busy={pendingControl !== null}
          onOpenFiles={() => {
            setOpenTile(null);
            setView("files");
          }}
          onDisconnect={() => {
            setOpenTile(null);
            onDisconnect(activeConnection.device_id);
          }}
        />
      )}
      <IdentitySheet open={identityOpen} onClose={() => setIdentityOpen(false)} draft={draft} onDraftChange={setDraft} />
    </div>
  );
}
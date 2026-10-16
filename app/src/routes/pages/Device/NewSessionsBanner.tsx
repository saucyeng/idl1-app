import { useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";

import { Button } from "../../../components/ui/button";
import { toastFor } from "../../../components/toasts/events";
import { cn } from "../../../lib/utils";
import { downloadFiles, listDeviceFiles, listRecentDeviceFiles } from "../../../ipc/device";
import type { TransferEvent } from "../../../ipc/device";
import { attachBikeLog, bikeForName } from "../../../ipc/bikelog";
import { importFile } from "../../../ipc/import";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { toFileViews } from "./files";
import { dispatchRideFlow } from "../../../shell/rideFlow";
import { dispatchLoggerLink } from "../../../shell/loggerLink";
import { prefsStore } from "../Settings/appPrefsStore";
import { autoStep, bannerView, initialNewSessionsState, newSessionsReducer } from "./newSessions";
import type { QueuedFile } from "./newSessions";

/** Importer forced for downloaded logger files: a blob in the store has no
 *  `.idl0` extension to detect from (C3 §3.3). */
// The logger entry point reads `.idl0` and `.idl1` alike, by magic bytes.
const LOGGER_IMPORTER_ID = "idl0";

/** Edge colour per banner tone. */
const TONE_CLASS = {
  accent: "border-brand-accent",
  good: "border-good",
  warn: "border-hivis",
  bad: "border-brand-accent",
  plain: "border-rule",
} as const;

/** Props for {@link NewSessionsBanner}. */
export interface NewSessionsBannerProps {
  /** The connected logger's BLE device id. */
  deviceId: string;
  /** Session ids already in the library, for telling new files from old. */
  knownSessionIds: Set<string>;
  /** Called after a transfer imported at least one session, so the caller
   *  can refresh `knownSessionIds`. */
  onImported: () => void;
  /** The logger's bike name (its config's `bike_profile.name`), or null
   *  when unknown. Each imported session is attached to that bike's log
   *  (bike-log spec §6). */
  bikeName: string | null;
}

/**
 * The Logger dashboard's new-sessions banner. **Check** lists the logger's
 * ten newest files over Bluetooth (SPEC §7.2), falling back to WiFi on
 * older firmware; only ever on this tap, never on its own. **Download** then downloads and imports every new session,
 * one at a time, and switches the logger's WiFi off when it's done so it is
 * ready to record again. Everything it says comes from `newSessions.ts`.
 *
 * With Settings' `auto_download` on (the default) it checks and downloads
 * by itself, once per mount. It is unmounted while recording, so pressing
 * record ends a transfer: the file in flight keeps its partial download
 * (`download_file` resumes it), and no further file is started.
 */
/** Loggers whose automatic transfer failed this app session. Automatic
 *  download stays off for them until a download succeeds or the app
 *  restarts: the banner remounts on every reconnect, and a transfer that
 *  fails each time must not put the logger back in WiFi mode each time
 *  (2026-10-16 field run: the logger looked stuck in WiFi mode). */
const autoHeld = new Set<string>();

/** Loggers with a transfer running. A remount mid-transfer (leaving the
 *  Logger screen and coming back) must not start a second one. */
const running = new Set<string>();

export default function NewSessionsBanner({ deviceId, knownSessionIds, onImported, bikeName }: NewSessionsBannerProps) {
  const [state, dispatch] = useReducer(newSessionsReducer, initialNewSessionsState);
  const view = bannerView(state);
  const auto = useRef<boolean | null>(null);
  const autoChecked = useRef(false);
  const autoTransferred = useRef(false);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    let live = true;
    void prefsStore.get().then((prefs) => {
      const on = prefs.ui.auto_download && !autoHeld.has(deviceId) && !running.has(deviceId);
      if (live) auto.current = on;
      if (live && on && autoStep(state, autoChecked.current, autoTransferred.current) === "check") {
        autoChecked.current = true;
        check(true);
      }
    });
    return () => {
      live = false;
      stopped.current = true;
    };
    // Once per mount: the mount is the trigger (see the doc comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (auto.current !== true || state.phase !== "ready") return;
    if (autoStep(state, autoChecked.current, autoTransferred.current) === "download") {
      autoTransferred.current = true;
      void transfer(state.files, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function check(automatic: boolean = false): void {
    dispatch({ type: "CHECK_START" });
    // Over Bluetooth first (the ten newest files, no WiFi); firmware without
    // that command falls back to the full list over WiFi — never on its own,
    // since that puts the logger in WiFi mode.
    listRecentDeviceFiles(deviceId)
      .then((recent) => recent.files)
      .catch((err: unknown) => (automatic ? Promise.reject(err) : listDeviceFiles(deviceId)))
      .then((files) => dispatch({ type: "CHECK_DONE", files: toFileViews(files, knownSessionIds) }))
      .catch((err: DeviceIpcError) => dispatch({ type: "CHECK_FAILED", error: describeIpcError(err) }));
  }

  /** Imports one downloaded ride and attaches it to the logger's bike;
   *  reports into both reducers. */
  async function importOne(file: QueuedFile, path: string): Promise<boolean> {
    try {
      dispatch({ type: "IMPORT_START" });
      dispatchRideFlow({ type: "IMPORTING", name: file.name });
      const outcome = await importFile(path, LOGGER_IMPORTER_ID, () => {});
      const warnings = outcome.warnings.map((w) => `${file.name}: ${w}`);
      // The ride takes its bike's notes and starting setup sheet. A failure
      // here leaves the import standing; the ride form can attach later.
      const bike = bikeName?.trim();
      if (bike) {
        try {
          const found = await bikeForName(bike);
          await attachBikeLog(outcome.session.session_id, found.bike_id);
        } catch (err) {
          warnings.push(`${file.name}: bike log not attached: ${describeIpcError(err as DeviceIpcError)}`);
        }
      }
      dispatchRideFlow({ type: "IMPORTED", name: file.name, sessionId: outcome.session.session_id });
      dispatch({ type: "FILE_IMPORTED", warnings });
      return true;
    } catch (err) {
      const error = describeIpcError(err as DeviceIpcError);
      dispatchRideFlow({ type: "FAILED", name: file.name, error });
      dispatch({ type: "FILE_FAILED", error });
      return false;
    }
  }

  /** Downloads the batch in one WiFi session with the radio handoff (SPEC
   *  §10.4, C3 §3.8 `download_files`): the logger drops Bluetooth while
   *  the rides come in, each is imported as it lands, and WiFi mode ends
   *  over WiFi. The Logger screen pauses its Bluetooth poll meanwhile and
   *  reconnects afterwards (`shell/loggerLink.ts`). */
  async function transfer(files: QueuedFile[], automatic: boolean = false): Promise<void> {
    if (running.has(deviceId)) return;
    running.add(deviceId);
    try {
      const clean = await transferBatch(files);
      if (clean) autoHeld.delete(deviceId);
      else if (automatic) autoHeld.add(deviceId);
    } finally {
      running.delete(deviceId);
    }
  }

  /** One batch; true when every file came in and imported. */
  async function transferBatch(files: QueuedFile[]): Promise<boolean> {
    dispatch({ type: "TRANSFER_START" });
    // The Data tab lists these and the ride form slides up for a single one.
    dispatchRideFlow({ type: "BATCH_START", files: files.map((f) => ({ name: f.name, sizeBytes: f.sizeBytes })) });
    const byName = new Map(files.map((f) => [f.name, f]));
    let imported = 0;
    // Imports run one after another in arrival order, while the next ride
    // downloads.
    let imports: Promise<void> = Promise.resolve();
    let failed = 0;
    let cancelled = false;
    const failOne = (name: string, error: string) => {
      failed += 1;
      dispatchRideFlow({ type: "FAILED", name, error });
      dispatch({ type: "FILE_FAILED", error });
    };
    const onEvent = (e: TransferEvent) => {
      switch (e.kind) {
        case "handed_off":
          dispatchLoggerLink({ type: "HANDED_OFF", deviceId });
          return;
        case "progress":
          dispatch({ type: "PROGRESS", progress: { done: e.done, total: e.total, phase: "download" } });
          dispatchRideFlow({ type: "PROGRESS", name: e.name, doneBytes: e.done });
          return;
        case "done": {
          const file = byName.get(e.name);
          if (file === undefined) return;
          imports = imports.then(async () => {
            if (await importOne(file, e.result.path)) imported += 1;
          });
          return;
        }
        case "failed": {
          const error = describeIpcError(e.error as DeviceIpcError);
          imports = imports.then(() => failOne(e.name, error));
          return;
        }
        default:
          return;
      }
    };

    try {
      const summary = await downloadFiles(
        deviceId,
        files.map((f) => ({ name: f.name, size_bytes: f.sizeBytes })),
        onEvent,
      );
      await imports;
      cancelled = summary.cancelled;
      dispatchLoggerLink({ type: "TRANSFER_ENDED", deviceId, handedOff: summary.handed_off, wifiClosed: summary.wifi_closed });
      if (summary.handed_off && !summary.wifi_closed) {
        toast.info("WiFi to the logger dropped", { description: "It comes back on Bluetooth within five minutes, or press its button. The rest resumes next time." });
      }
    } catch (err) {
      // Failed before any ride came in (WiFi never linked, or the logger
      // was not connected): Bluetooth is still up, so nothing to reconnect.
      await imports;
      const error = describeIpcError(err as DeviceIpcError);
      for (const file of files) failOne(file.name, error);
      dispatchLoggerLink({ type: "TRANSFER_ENDED", deviceId, handedOff: false, wifiClosed: true });
    }
    const clean = failed === 0 && !cancelled && imported === files.length;
    if (stopped.current) return clean;
    if (imported > 0) {
      onImported();
      const descriptor = toastFor({ kind: "transferComplete", fileCount: imported });
      toast.success(descriptor.title, { description: descriptor.detail });
    }
    return clean;
  }

  function onAction(): void {
    if (view.action === null) return;
    switch (view.action.kind) {
      case "check":
      case "retry":
        check();
        return;
      case "download":
        if (state.phase === "ready") void transfer(state.files);
        return;
      case "dismiss":
        dispatch({ type: "DISMISS" });
        return;
    }
  }

  return (
    <section
      className={cn("new-sessions flex flex-col gap-1.5 rounded-[var(--radius-card)] border bg-surface px-3 py-1.5", TONE_CLASS[view.tone])}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-fg">{view.text}</span>
          {view.detail !== null && <span className="break-words font-mono text-xs text-fg-dim">{view.detail}</span>}
        </div>
        {view.action !== null && (
          <Button
            type="button"
            emphasis={view.action.kind === "download" ? "accent" : "normal"}
            filled={view.action.kind === "download"}
            className="h-11 shrink-0 px-4"
            onClick={onAction}
          >
            {view.action.label}
          </Button>
        )}
      </div>
      {view.fraction !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <div className="h-full bg-brand-accent transition-[width]" style={{ width: `${Math.round(view.fraction * 100)}%` }} />
        </div>
      )}
    </section>
  );
}

import { useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";

import { Button } from "../../../components/ui/button";
import { toastFor } from "../../../components/toasts/events";
import { cn } from "../../../lib/utils";
import { deviceControl, downloadFile, listDeviceFiles, listRecentDeviceFiles } from "../../../ipc/device";
import { attachBikeLog, bikeForName } from "../../../ipc/bikelog";
import { importFile } from "../../../ipc/import";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { toFileViews } from "./files";
import { dispatchRideFlow } from "../../../shell/rideFlow";
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
      if (live) auto.current = prefs.ui.auto_download;
      if (live && prefs.ui.auto_download && autoStep(state, autoChecked.current, autoTransferred.current) === "check") {
        autoChecked.current = true;
        check();
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
      void transfer(state.files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function check(): void {
    dispatch({ type: "CHECK_START" });
    // Over Bluetooth first (the ten newest files, no WiFi); firmware without
    // that command falls back to the full list over WiFi.
    listRecentDeviceFiles(deviceId)
      .then((recent) => recent.files)
      .catch(() => listDeviceFiles(deviceId))
      .then((files) => dispatch({ type: "CHECK_DONE", files: toFileViews(files, knownSessionIds) }))
      .catch((err: DeviceIpcError) => dispatch({ type: "CHECK_FAILED", error: describeIpcError(err) }));
  }

  async function transfer(files: QueuedFile[]): Promise<void> {
    dispatch({ type: "TRANSFER_START" });
    // The Data tab lists these and the ride form slides up for a single one.
    dispatchRideFlow({ type: "BATCH_START", files: files.map((f) => ({ name: f.name, sizeBytes: f.sizeBytes })) });
    let imported = 0;
    for (const file of files) {
      if (stopped.current) return;
      try {
        const result = await downloadFile(deviceId, file.name, (progress) => {
          dispatch({ type: "PROGRESS", progress });
          dispatchRideFlow({ type: "PROGRESS", name: file.name, doneBytes: progress.done });
        });
        dispatch({ type: "IMPORT_START" });
        dispatchRideFlow({ type: "IMPORTING", name: file.name });
        const outcome = await importFile(result.path, LOGGER_IMPORTER_ID, () => {});
        imported += 1;
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
      } catch (err) {
        if (stopped.current) return;
        const error = describeIpcError(err as DeviceIpcError);
        dispatchRideFlow({ type: "FAILED", name: file.name, error });
        dispatch({ type: "FILE_FAILED", error });
      }
    }
    if (stopped.current) return;
    // Back to recording-ready. Best effort: if this fails the logger leaves
    // WiFi mode on its own after five idle minutes (SPEC §10.4), and its
    // record button drops WiFi anyway (firmware F7).
    deviceControl(deviceId, "wifi_off").catch(() => {});
    if (imported > 0) {
      onImported();
      const descriptor = toastFor({ kind: "transferComplete", fileCount: imported });
      toast.success(descriptor.title, { description: descriptor.detail });
    }
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

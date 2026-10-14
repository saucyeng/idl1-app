import { useReducer } from "react";
import { toast } from "sonner";

import { Button } from "../../../components/ui/button";
import { toastFor } from "../../../components/toasts/events";
import { cn } from "../../../lib/utils";
import { deviceControl, downloadFile, listDeviceFiles, listRecentDeviceFiles } from "../../../ipc/device";
import { importFile } from "../../../ipc/import";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { toFileViews } from "./files";
import { bannerView, initialNewSessionsState, newSessionsReducer } from "./newSessions";
import type { QueuedFile } from "./newSessions";

/** Importer forced for downloaded logger files: a blob in the store has no
 *  `.idl0` extension to detect from (C3 §3.3). */
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
}

/**
 * The Logger dashboard's new-sessions banner. **Check** lists the logger's
 * ten newest files over Bluetooth (SPEC §7.2), falling back to WiFi on
 * older firmware; only ever on this tap, never on its own. **Download** then downloads and imports every new session,
 * one at a time, and switches the logger's WiFi off when it's done so it is
 * ready to record again. Everything it says comes from `newSessions.ts`.
 */
export default function NewSessionsBanner({ deviceId, knownSessionIds, onImported }: NewSessionsBannerProps) {
  const [state, dispatch] = useReducer(newSessionsReducer, initialNewSessionsState);
  const view = bannerView(state);

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
    let imported = 0;
    for (const file of files) {
      try {
        const result = await downloadFile(deviceId, file.name, (progress) => dispatch({ type: "PROGRESS", progress }));
        dispatch({ type: "IMPORT_START" });
        const outcome = await importFile(result.path, LOGGER_IMPORTER_ID, () => {});
        imported += 1;
        dispatch({ type: "FILE_IMPORTED", warnings: outcome.warnings.map((w) => `${file.name}: ${w}`) });
      } catch (err) {
        dispatch({ type: "FILE_FAILED", error: describeIpcError(err as DeviceIpcError) });
      }
    }
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
      className={cn("new-sessions flex flex-col gap-2 rounded-[var(--radius-card)] border-2 bg-surface px-3 py-2", TONE_CLASS[view.tone])}
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

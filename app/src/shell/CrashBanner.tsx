import { X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "../components/ui/button";
import { isAndroid } from "../ipc/appUpdate";
import { combinedReport, crashReports, type CrashReport, dismissCrashReports, shareCrashReport } from "../ipc/crash";

/**
 * "idl1 closed unexpectedly last time" (crash reports spec, 2026-10-21):
 * shown at launch while crash reports are pending. Share (Android's share
 * sheet) or Copy (desktop) hands over every pending report as one text and
 * dismisses them; × dismisses without sending. Nothing leaves the device
 * otherwise.
 */
export default function CrashBanner() {
  const [reports, setReports] = useState<CrashReport[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const android = isAndroid(navigator.userAgent);

  useEffect(() => {
    crashReports()
      .then(setReports)
      .catch(() => setReports([]));
  }, []);

  if (reports.length === 0) return null;

  const dismiss = () => {
    const ids = reports.map((r) => r.id);
    setReports([]);
    dismissCrashReports(ids).catch(() => {});
  };

  const send = () => {
    const text = combinedReport(reports);
    const sent = android ? shareCrashReport(text) : navigator.clipboard.writeText(text);
    sent.then(dismiss).catch(() => setNote(android ? "Couldn't open sharing" : "Couldn't copy"));
  };

  return (
    <div
      className="shell-chrome flex shrink-0 items-center gap-2 border-t border-hivis bg-surface py-2 pr-1 pl-4"
      role="status"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-fg">idl1 closed unexpectedly last time</span>
        <span className="truncate text-xs text-fg-dim">
          {note ?? "A crash report is saved on this device. Send it so it can be fixed."}
        </span>
      </span>
      <Button type="button" emphasis="info" filled className="h-10 px-4" onClick={send}>
        {android ? "Share" : "Copy"}
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        className="flex size-[var(--hit-target)] shrink-0 items-center justify-center text-fg-dim"
        onClick={dismiss}
      >
        <X aria-hidden size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

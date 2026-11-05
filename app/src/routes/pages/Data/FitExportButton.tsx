import { FolderOpenIcon } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { toast } from "sonner";

import { IconBtn } from "../../../components/brand/ToolGroup";
import { Button } from "../../../components/ui/button";
import { exportSessionFit, type SessionDetail } from "../../../ipc/catalog";
import { isAndroid } from "../../../ipc/appUpdate";
import { describeIpcError } from "./errors";
import { canExportFit, fitExportFileName, withFitExtension } from "./fitExport";

/**
 * "Export .fit" (C3 §3.2 `export_session_fit`, added 2026-11-05): idl0's
 * `FitExportControls`, ported. Asks where to save, then Rust writes the FIT
 * file there; a "Show in folder" button follows a successful export. Renders
 * nothing for a session without GPS (the encoder would refuse it) and on
 * Android, where the save dialog hands back a content URI the engine cannot
 * write to: phone export is a later step.
 */
export function FitExportButton({ detail }: { detail: SessionDetail }) {
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  if (!canExportFit(detail) || (typeof navigator !== "undefined" && isAndroid(navigator.userAgent))) return null;

  const handleExport = async () => {
    setBusy(true);
    try {
      const chosen = await save({
        title: "Export session to FIT",
        defaultPath: fitExportFileName(detail.timestamp_utc_ms, detail.venue_name),
        filters: [{ name: "FIT activity", extensions: ["fit"] }],
      });
      if (chosen === null) return;
      const report = await exportSessionFit(detail.session_id, withFitExtension(chosen));
      setSavedPath(report.path);
      const laps = report.laps === 0 ? "one lap" : `${report.laps} laps`;
      toast.success("Saved .fit", { description: `${report.path} (${Math.round(report.bytes / 1024)} kB, ${laps})` });
    } catch (e: unknown) {
      toast.error("FIT export failed", { description: describeIpcError(e).text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" onClick={() => void handleExport()} disabled={busy}>
        {busy ? "Exporting…" : "Export .fit"}
      </Button>
      {savedPath !== null && (
        <IconBtn
          icon={FolderOpenIcon}
          label="Show in folder"
          onClick={() => {
            void revealItemInDir(savedPath).catch((e: unknown) => {
              toast.error("Could not open the folder", { description: e instanceof Error ? e.message : String(e) });
            });
          }}
        />
      )}
    </div>
  );
}

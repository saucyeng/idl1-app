import { dispatchRideFlow, sessionKey, useRideFlow } from "../../../shell/rideFlow";
import type { DownloadRow, RideFlowState } from "../../../shell/rideFlow";
import { formatBytes } from "./format";

/** A row's status line: where the download is, kept apart from the action
 *  so "Downloaded" never reads as "done with this ride" (Isaac,
 *  2026-10-16). */
export function rowStatusText(row: DownloadRow, flow: RideFlowState): string {
  const notes = (row.sessionId !== null ? flow.drafts[sessionKey(row.sessionId)] : flow.drafts[row.name])?.notes.trim() ?? "";
  const noted = notes === "" ? "" : " · notes started";
  switch (row.status) {
    case "queued":
      return `Waiting · ${formatBytes(row.sizeBytes)}`;
    case "downloading":
      return `Downloading ${row.sizeBytes > 0 ? Math.min(99, Math.floor((row.doneBytes / row.sizeBytes) * 100)) : 0}%${noted}`;
    case "importing":
      return `Importing${noted}`;
    case "imported":
      return `Downloaded${noted}`;
    case "failed":
      return `Failed: ${row.error ?? "unknown error"}`;
  }
}

/**
 * "New from the logger" at the top of the Data tab (ride-form mockup,
 * 2026-10-16): the rides the Logger screen is downloading or just
 * downloaded, each with its status on the left and **Add notes** on the
 * right, available even mid-download. Hidden when there is nothing new.
 */
export function NewRidesSection() {
  const flow = useRideFlow();
  if (flow.rows.length === 0) return null;
  return (
    <section aria-label="New from the logger" className="flex flex-col gap-1.5 border-b border-rule px-3 py-2">
      <span className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">New from the logger</span>
      <div className="flex flex-col gap-px border border-rule bg-rule">
        {flow.rows.map((row) => {
          const status = rowStatusText(row, flow);
          const live = row.status === "queued" || row.status === "downloading" || row.status === "importing";
          return (
            <div key={row.name} className="flex min-h-14 items-center justify-between gap-2 bg-surface px-3 py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-fg">{row.name}</span>
                <span className={`font-mono text-xs ${row.status === "failed" ? "text-brand-accent" : live ? "text-hivis" : "text-fg-dim"}`}>{status}</span>
              </span>
              {row.status !== "failed" && (
                <button
                  type="button"
                  className="min-h-10 shrink-0 border border-good px-3 text-sm font-semibold whitespace-nowrap text-good"
                  onClick={() => dispatchRideFlow({ type: "OPEN", key: row.sessionId !== null ? sessionKey(row.sessionId) : row.name, expanded: row.sessionId !== null })}
                >
                  Add notes
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

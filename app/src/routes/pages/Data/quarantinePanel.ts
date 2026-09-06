import type { QuarantineEntry, VerifyReport } from "../../../ipc/maintenance";
import { formatDateMs } from "./format";

/** Pure display/aggregation logic for the Data tab's maintenance panel
 *  (C3 §3.2 `list_quarantine`/`resolve_quarantine`, C3 §3.10
 *  `verify_data_dir`, ruling R86). No IPC here — every function takes an
 *  already-fetched report/entry and returns text or a derived value
 *  (CLAUDE.md §2). */

/** "1 x" / "3 xs" — never "1 xs". */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One quarantine entry's display line, e.g. "hash mismatch — quarantined
 *  Sep 6, 2026 (from /data/blobs/sha256/ab/c...)". `original_path` empty
 *  (unknown provenance) omits the parenthetical rather than showing an
 *  empty "(from )". */
export function formatQuarantineEntry(entry: QuarantineEntry): string {
  const base = `${entry.reason} — quarantined ${formatDateMs(entry.quarantined_at_ms)}`;
  return entry.original_path === "" ? base : `${base} (from ${entry.original_path})`;
}

/** `verify_data_dir`'s (C3 §3.10) findings/quarantine outcome as one
 *  summary line, e.g. "3 findings (1 error, 2 warnings) in 1.2 s. 1 file
 *  quarantined." An empty `findings` list reads as "No issues found",
 *  never a misleading "0 findings". `repaired` controls whether the
 *  quarantine sentence is appended at all — `repair: false` never
 *  quarantines anything, so that sentence would always read "Nothing
 *  needed quarantining" and add no information. */
export function summarizeVerifyReport(report: VerifyReport, repaired: boolean): string {
  const seconds = (report.elapsed_ms / 1000).toFixed(1);

  if (report.findings.length === 0) {
    return `No issues found (${seconds} s).`;
  }

  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warnings = report.findings.filter((f) => f.severity === "warning").length;
  let summary = `${plural(report.findings.length, "finding")} (${plural(errors, "error")}, ${plural(warnings, "warning")}) in ${seconds} s.`;

  if (repaired) {
    summary +=
      report.quarantined.length > 0
        ? ` ${plural(report.quarantined.length, "file")} quarantined.`
        : " Nothing needed quarantining.";
  }

  return summary;
}

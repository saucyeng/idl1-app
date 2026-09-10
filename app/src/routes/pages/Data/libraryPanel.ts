import type { SessionDetail } from "../../../ipc/catalog";
import type { InboxStatus, ReimportReport, ScanEntry, StaleSession } from "../../../ipc/library";
import { describeIpcError } from "./errors";
import { formatBytes, formatDateMs, formatTimeMs } from "./format";

/** Pure shaping for the M4c library affordances (C3 §3.3, ruling R191):
 *  the folder-import preview, the stale-session rebuild summary, the
 *  unknown-start prompt's decision, and the inbox status line. No IPC and
 *  no engine computation lives here — every number arrived from Rust
 *  already (CLAUDE.md §2). */

/** "1 session" / "42 sessions" — never "1 sessions". */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One row of the "Import folder…" preview table — a display projection of
 *  one [[ScanEntry]]. `importable` drives both the row's greying and
 *  whether "Import N files" counts it. */
export interface ScanPreviewRow {
  path: string;
  fileName: string;
  /** The importer id detected from this file's own extension, or `null`
   *  when nothing covers it — what an import of this row must be given, so
   *  a mixed-format folder imports each file with its own importer. */
  importerId: string | null;
  sizeText: string;
  /** The importer id, or "—" when nothing covers this extension. */
  importerText: string;
  /** The header-peek start rendered in the viewer's locale, "unknown" when
   *  the peek returned `0` (C1 §3.1: `0` means unknown, never 1970), and
   *  "—" when the format offers no peek at all. */
  startText: string;
  /** `true` when this file has an importer and is not known to be already
   *  imported — the rows "Import selected" may enqueue. */
  importable: boolean;
  /** Why the row is not importable, or `null` when it is. */
  skipReason: "already imported" | "no importer" | null;
  /** The `already_imported` column's text: `"yes"`, `"no"`, or "checked on
   *  import" for the `null` the scan now always returns (ruling R201 item
   *  2 — the scan does not hash, and import de-duplicates by content hash
   *  anyway, so the honest answer is that nobody has looked yet). */
  alreadyText: string;
}

/** Shapes one folder scan into preview rows, in the order `scanFolder`
 *  returned them (already sorted by file name). A file the scan reports as
 *  already imported is shown, not hidden: the user asked what is in the
 *  folder, and "already imported" is the useful answer (C4 §3 — importing
 *  it again would be a no-op anyway). Since ruling R201 item 2 the scan
 *  never decides that question (`already_imported: null`), so in practice
 *  every row with an importer is offered and the duplicate, if any, is
 *  caught by the content-hash de-duplication `import_file` already does. */
export function toScanPreviewRows(entries: ScanEntry[]): ScanPreviewRow[] {
  return entries.map((entry) => {
    const skipReason =
      entry.importer_id === null ? "no importer" : entry.already_imported === true ? "already imported" : null;
    return {
      path: entry.path,
      fileName: entry.file_name,
      importerId: entry.importer_id,
      sizeText: formatBytes(entry.size_bytes),
      importerText: entry.importer_id ?? "—",
      startText:
        entry.session_start_utc_ms === null
          ? "—"
          : entry.session_start_utc_ms === 0
            ? "unknown"
            : `${formatDateMs(entry.session_start_utc_ms)} ${formatTimeMs(entry.session_start_utc_ms)}`,
      importable: skipReason === null,
      skipReason,
      alreadyText: entry.already_imported === null ? "checked on import" : entry.already_imported ? "yes" : "no",
    };
  });
}

/** The rows "Import N files" enqueues: every importable row, in preview
 *  order. Already-imported and unsupported files are never enqueued. Each
 *  row carries its own [[ScanPreviewRow.importerId]], so a folder holding
 *  `.idl0` and `.gpx` side by side imports each with the right importer. */
export function importableRows(rows: ScanPreviewRow[]): ScanPreviewRow[] {
  return rows.filter((row) => row.importable);
}

/** [[importableRows]]' paths alone, for callers that only need the list. */
export function importablePaths(rows: ScanPreviewRow[]): string[] {
  return importableRows(rows).map((row) => row.path);
}

/** The paths selected by default when a preview first appears: every
 *  importable row (ruling R201 item 4 — rows are individually checkable,
 *  "defaulting to all"). A non-importable row is never selectable, so it is
 *  never in this set. */
export function defaultSelectedPaths(rows: ScanPreviewRow[]): string[] {
  return importablePaths(rows);
}

/** `selected` with `path` added if absent and removed if present — one
 *  checkbox click. Returns a new array; the caller's own array is never
 *  mutated, so React state updates stay by-value. */
export function togglePath(selected: readonly string[], path: string): string[] {
  return selected.includes(path) ? selected.filter((p) => p !== path) : [...selected, path];
}

/** The rows "Import selected" enqueues: the importable rows whose path is
 *  in `selected`, in preview order (never in click order — the queue runs
 *  in enqueue order, and a user who ticked the last file first still
 *  expects the folder imported top to bottom). */
export function selectedRows(rows: ScanPreviewRow[], selected: readonly string[]): ScanPreviewRow[] {
  return importableRows(rows).filter((row) => selected.includes(row.path));
}

/** The preview's one-line summary, e.g. "3 of 5 files can be imported (1
 *  already imported, 1 with no importer)." An empty folder says so rather
 *  than reading "0 of 0 files". */
export function summarizeScanPreview(rows: ScanPreviewRow[]): string {
  if (rows.length === 0) return "No files in that folder.";

  const importable = rows.filter((row) => row.importable).length;
  const already = rows.filter((row) => row.skipReason === "already imported").length;
  const unsupported = rows.filter((row) => row.skipReason === "no importer").length;

  const skipped: string[] = [];
  if (already > 0) skipped.push(`${already} already imported`);
  if (unsupported > 0) skipped.push(`${unsupported} with no importer`);

  const head = `${importable} of ${plural(rows.length, "file")} can be imported`;
  return skipped.length > 0 ? `${head} (${skipped.join(", ")}).` : `${head}.`;
}

/** The "Rebuild N stale sessions" button's label, or `null` when nothing is
 *  stale — the caller hides the button entirely rather than offering a
 *  no-op (`list_stale_sessions` returning empty is the normal case). */
export function staleRebuildLabel(stale: StaleSession[]): string | null {
  if (stale.length === 0) return null;
  return `Rebuild ${plural(stale.length, "stale session")}`;
}

/** The stale list's detail line, naming each distinct importer and the
 *  version step it would take, e.g. "idl0 0.0.1 → 0.1.0". Distinct pairs
 *  only: fifty sessions from one old build read as one clause, not fifty. */
export function summarizeStaleSessions(stale: StaleSession[]): string {
  if (stale.length === 0) return "Every session was built with the current importer.";

  const steps = [...new Set(stale.map((s) => `${s.importer_id} ${s.stored_version} → ${s.current_version}`))];
  return `${plural(stale.length, "session")} to rebuild: ${steps.join(", ")}.`;
}

/** `reimport_sessions`' report as the maintenance toolbar's summary line.
 *  A partial batch reads as partial — a failed session's own error text is
 *  named, never swallowed by the successes' count (C3 §3.3 keeps
 *  per-session errors in the report precisely so this line can say so). */
export function summarizeReimportReport(report: ReimportReport): string {
  const parts = [`Rebuilt ${plural(report.rebuilt.length, "session")}.`];
  if (report.failed.length > 0) {
    const failures = report.failed.map((f) => `${f.session_id} (${describeIpcError(f.error).text})`).join("; ");
    parts.push(`${plural(report.failed.length, "session")} failed: ${failures}.`);
  }
  return parts.join(" ");
}

/** Whether the Data tab offers "this session's start time is unknown — set
 *  it" for `detail`. The single rule (ruling R191): a catalogued start of
 *  `0` means no importer, GPS back-fill included, could determine one (C1
 *  §3.1). A session that already has a start never shows the prompt, even
 *  though `set_session_start` would accept one for it. */
export function shouldPromptForStart(detail: SessionDetail): boolean {
  return detail.timestamp_utc_ms === 0;
}

/** Parses an `<input type="datetime-local">` value ("2026-09-10T14:30") as
 *  local wall-clock time into epoch milliseconds — the value
 *  `setSessionStart` takes. `null` for empty, unparseable, or non-positive
 *  input (the command rejects `<= 0` with `invalid_argument`; catching it
 *  here keeps the round trip out of the way of an obviously blank field). */
export function parseStartInput(value: string): number | null {
  if (value.trim().length === 0) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

/** The Data page's inbox status line, e.g. "Inbox: C:\\data\\inbox — 3
 *  imported since launch, 1 failed." Names the folder even when nothing
 *  has happened, because the line's main job is telling the user where to
 *  drop files (C4 §2 fixes the path; there is no setting). */
export function describeInboxStatus(status: InboxStatus): string {
  const parts = [`${status.imported_since_launch} imported since launch`];
  if (status.failed.length > 0) {
    parts.push(`${status.failed.length} failed`);
  }
  return `Inbox: ${status.path} — ${parts.join(", ")}.`;
}

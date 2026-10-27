import type { Here, PeerLibrary, SyncSelection } from "../../../ipc/sync";
import { formatDateMs, formatDurationMs, formatTimeMs, localIsoDate } from "../Data/format";

// Pure view logic for browsing a paired device's library (library tiers
// §4a): filtering, newest-first ordering, selection, byte totals and the
// `SyncSelection` a pull sends. No IPC and no React, so the panel (option A)
// and a later inline Data-list view (option B) share it.

const MB_BYTES = 1024 * 1024;
const GB_BYTES = 1024 * MB_BYTES;

/** Formats a byte count for a sync size: MB under 1 GB, else GB with one
 *  decimal. MB keeps one decimal below 10 MB (trailing ".0" dropped) and is
 *  whole above; a non-zero size under 0.05 MB reads "<0.1 MB" so it never
 *  shows as nothing.
 *
 * @param bytes - Size in bytes, finite and non-negative; anything else reads "—". */
export function formatSyncBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= GB_BYTES) return `${(bytes / GB_BYTES).toFixed(1)} GB`;
  if (bytes === 0) return "0 MB";

  const mb = bytes / MB_BYTES;
  if (mb < 0.05) return "<0.1 MB";
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
}

/** The "here" column text for a row's status against this library. */
export function hereLabel(here: Here): string {
  switch (here) {
    case "same":
      return "✓ here";
    case "absent":
      return "not here";
    case "differs":
      return "≠ differs";
  }
}

/** Whether a row can be picked for a pull: identical rows ("same") cannot. */
export function isSelectable(here: Here): boolean {
  return here !== "same";
}

/** The browse panel's filters. Dates are local `YYYY-MM-DD` (empty = open
 *  end); venue and rider are exact names (empty = any); `search` is a
 *  case-insensitive substring. Date, venue and rider apply to sessions only;
 *  `search` applies to both lists. */
export interface PeerLibraryFilters {
  from: string;
  to: string;
  venue: string;
  rider: string;
  search: string;
}

/** No filter active. */
export const emptyFilters: PeerLibraryFilters = { from: "", to: "", venue: "", rider: "", search: "" };

/** A session row ready to draw: display text plus the status. Takes no
 *  panel state, so it also fits an inline list row (option B). */
export interface PeerSessionRowModel {
  id: string;
  /** Recording start, ms since the Unix epoch, UTC. */
  timestampMs: number;
  dateText: string;
  timeText: string;
  venueText: string;
  riderText: string;
  durationText: string;
  sizeText: string;
  here: Here;
  hereText: string;
  selectable: boolean;
}

/** A workbook row ready to draw. */
export interface PeerWorkbookRowModel {
  id: string;
  nameText: string;
  sizeText: string;
  here: Here;
  hereText: string;
  selectable: boolean;
}

/** The sessions of `library` that pass `filters`, newest first. */
export function viewSessions(library: PeerLibrary, filters: PeerLibraryFilters): PeerSessionRowModel[] {
  const needle = filters.search.trim().toLowerCase();

  return library.sessions
    .filter((s) => {
      if (filters.venue !== "" && s.venue_name !== filters.venue) return false;
      if (filters.rider !== "" && s.rider !== filters.rider) return false;
      const day = localIsoDate(s.timestamp_utc_ms);
      if (filters.from !== "" && day < filters.from) return false;
      if (filters.to !== "" && day > filters.to) return false;
      if (needle === "") return true;
      return [s.venue_name, s.rider, s.event_name, s.bike, s.tag].some((v) => v !== null && v.toLowerCase().includes(needle));
    })
    .sort((a, b) => b.timestamp_utc_ms - a.timestamp_utc_ms)
    .map((s) => ({
      id: s.session_id,
      timestampMs: s.timestamp_utc_ms,
      dateText: formatDateMs(s.timestamp_utc_ms),
      timeText: formatTimeMs(s.timestamp_utc_ms),
      venueText: s.venue_name ?? "—",
      riderText: s.rider ?? "—",
      durationText: s.duration_ms === null ? "—" : formatDurationMs(s.duration_ms),
      sizeText: formatSyncBytes(s.size_bytes),
      here: s.here,
      hereText: hereLabel(s.here),
      selectable: isSelectable(s.here),
    }));
}

/** The workbooks of `library` whose name matches `filters.search`, newest
 *  update first. */
export function viewWorkbooks(library: PeerLibrary, filters: PeerLibraryFilters): PeerWorkbookRowModel[] {
  const needle = filters.search.trim().toLowerCase();

  return library.workbooks
    .filter((w) => needle === "" || w.file_name.toLowerCase().includes(needle))
    .sort((a, b) => b.updated_at_ms - a.updated_at_ms)
    .map((w) => ({
      id: w.workbook_id,
      nameText: w.file_name,
      sizeText: formatSyncBytes(w.size_bytes),
      here: w.here,
      hereText: hereLabel(w.here),
      selectable: isSelectable(w.here),
    }));
}

/** The venues and riders present in `library`, sorted, for the filter
 *  choosers. */
export function filterOptions(library: PeerLibrary): { venues: string[]; riders: string[] } {
  const distinct = (values: (string | null)[]) =>
    [...new Set(values.filter((v): v is string => v !== null && v !== ""))].sort((a, b) => a.localeCompare(b));

  return {
    venues: distinct(library.sessions.map((s) => s.venue_name)),
    riders: distinct(library.sessions.map((s) => s.rider)),
  };
}

/** The ids ticked for a pull. */
export interface PeerSelection {
  sessions: ReadonlySet<string>;
  workbooks: ReadonlySet<string>;
}

/** Nothing ticked. */
export const emptySelection: PeerSelection = { sessions: new Set(), workbooks: new Set() };

/** Total ticked rows (sessions plus workbooks). */
export function selectionCount(selection: PeerSelection): number {
  return selection.sessions.size + selection.workbooks.size;
}

function hereOf(library: PeerLibrary, kind: "session" | "workbook", id: string): Here | null {
  if (kind === "session") return library.sessions.find((s) => s.session_id === id)?.here ?? null;
  return library.workbooks.find((w) => w.workbook_id === id)?.here ?? null;
}

/** Ticks or unticks one row. A "same" row (or an id not in `library`) is
 *  left unchanged. */
export function toggleSelected(
  library: PeerLibrary,
  selection: PeerSelection,
  kind: "session" | "workbook",
  id: string,
): PeerSelection {
  const here = hereOf(library, kind, id);
  if (here === null || !isSelectable(here)) return selection;

  const key = kind === "session" ? "sessions" : "workbooks";
  const next = new Set(selection[key]);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { ...selection, [key]: next };
}

/** Adds every selectable row that passes `filters` to `selection`. */
export function selectAllVisible(library: PeerLibrary, selection: PeerSelection, filters: PeerLibraryFilters): PeerSelection {
  const sessions = new Set(selection.sessions);
  for (const row of viewSessions(library, filters)) if (row.selectable) sessions.add(row.id);
  const workbooks = new Set(selection.workbooks);
  for (const row of viewWorkbooks(library, filters)) if (row.selectable) workbooks.add(row.id);
  return { sessions, workbooks };
}

/** Drops ticked ids that are gone from `library` or have become "same" (after
 *  a pull and refresh). */
export function pruneSelection(library: PeerLibrary, selection: PeerSelection): PeerSelection {
  const keep = (kind: "session" | "workbook", ids: ReadonlySet<string>) =>
    new Set([...ids].filter((id) => {
      const here = hereOf(library, kind, id);
      return here !== null && isSelectable(here);
    }));
  return { sessions: keep("session", selection.sessions), workbooks: keep("workbook", selection.workbooks) };
}

/** Bytes a pull of `selection` would move: the ticked rows' sizes, skipping
 *  "same" rows. */
export function selectionBytes(library: PeerLibrary, selection: PeerSelection): number {
  let total = 0;
  for (const s of library.sessions) if (selection.sessions.has(s.session_id) && isSelectable(s.here)) total += s.size_bytes;
  for (const w of library.workbooks) if (selection.workbooks.has(w.workbook_id) && isSelectable(w.here)) total += w.size_bytes;
  return total;
}

/** The `SyncSelection` for pulling `selection`. Both lists are always sent
 *  (possibly empty) because an omitted list means "all of them". "same"
 *  rows are left out. */
export function buildPullSelection(library: PeerLibrary, selection: PeerSelection): SyncSelection {
  return {
    direction: "pull",
    sessions: library.sessions.filter((s) => selection.sessions.has(s.session_id) && isSelectable(s.here)).map((s) => s.session_id),
    workbooks: library.workbooks.filter((w) => selection.workbooks.has(w.workbook_id) && isSelectable(w.here)).map((w) => w.workbook_id),
  };
}

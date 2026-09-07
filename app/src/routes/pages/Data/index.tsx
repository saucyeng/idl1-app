import { ChevronRightIcon, DatabaseIcon, WrenchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { DenseRow, TableHeader as BrandTableHeader } from "../../../components/brand/DenseRow";
import { BrandSheet } from "../../../components/brand/BrandSheet";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Checkbox } from "../../../components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { deleteSession, getSession, listLaps, listSessions, rebuildCatalog, rescanTracks, type LapSummary, type SessionDetail, type SessionSummary } from "../../../ipc/catalog";
import { useAppState } from "../../../state/AppState";
import { ActiveChips } from "./ActiveChips";
import { DetailPane } from "./DetailPane";
import { dataLayout } from "./layout";
import { formatLapTimeMs } from "./format";
import { MaintenancePanel } from "./MaintenancePanel";
import { describeIpcError } from "./errors";
import { facetCounts, matchesFilters } from "./facets";
import { FilterRail } from "./FilterRail";
import { activeCount, filtersReducer, initialFilters } from "./filters";
import { ImportPanel } from "./ImportPanel";
import {
  initialMaintenanceState,
  maintenanceReducer,
  runDeleteSession,
  runForgetSession,
  runRebuildCatalog,
  runRescanSessions,
  runRescanTracks,
  startMaintenanceAction,
} from "./maintenance";
import { toDetailView } from "./sessionDetail";
import { groupKeyOf, toSessionRow, type SessionRow } from "./sessionRow";
import { compareSessions, sortFieldsForView, type SortField } from "./sort";
import { TrackResults } from "./TrackResults";

/** The session detail pane's own fetch state — separate from the sessions
 *  list's `State` above, and from `AppState.selection` (which only tracks
 *  *which* session id is selected, not the fetch in flight for it). */
type DetailState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; detail: SessionDetail; laps: LapSummary[]; lapsErrorText: string | null }
  | { status: "error"; text: string };

type DetailAction =
  | { type: "detail-loading" }
  | { type: "detail-ready"; detail: SessionDetail; laps: LapSummary[]; lapsErrorText: string | null }
  | { type: "detail-failed"; text: string }
  | { type: "detail-closed" };

function detailReducer(_state: DetailState, action: DetailAction): DetailState {
  switch (action.type) {
    case "detail-loading":
      return { status: "loading" };
    case "detail-ready":
      return { status: "ready", detail: action.detail, laps: action.laps, lapsErrorText: action.lapsErrorText };
    case "detail-failed":
      return { status: "error", text: action.text };
    case "detail-closed":
      return { status: "idle" };
  }
}

type State =
  | { status: "loading" }
  | { status: "ready"; sessions: SessionSummary[] }
  | { status: "error"; text: string };

type Action =
  | { type: "loaded"; sessions: SessionSummary[] }
  | { type: "failed"; text: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return { status: "ready", sessions: action.sessions };
    case "failed":
      return { status: "error", text: action.text };
  }
}

/** Field labels for the sort chooser — idl0's `DataSortFieldX.label`. */
const FIELD_LABELS: Record<SortField, string> = {
  date: "Date",
  bestLap: "Best lap",
  duration: "Duration",
  lapCount: "Lap count",
  lastRidden: "Last ridden",
  name: "Name",
};

/** One date·venue group of session rows, in first-seen order over the
 *  already-sorted `rows` — a pure display grouping over `SessionRow.groupKey`
 *  (`sessionRow.ts`, untouched by this restyle). */
interface SessionGroup {
  groupKey: string;
  rows: SessionRow[];
}

/** Groups `rows` by `groupKeyOf`, preserving the order each group's first
 *  member appears in `rows` — so a list already sorted by date reads as
 *  contiguous date·venue groups, and a list sorted by another field still
 *  groups every same-key row together rather than duplicating the group
 *  header. */
function groupSessionRows(rows: SessionRow[]): SessionGroup[] {
  const groups = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const key = groupKeyOf(row);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [row]);
    } else {
      existing.push(row);
    }
  }
  return [...groups.entries()].map(([groupKey, groupRows]) => ({ groupKey, rows: groupRows }));
}

/** The current `window.innerWidth`, updated on `resize` — the same pattern
 *  `shell/AppShell.tsx`'s `useWindowWidth` and `Toaster.tsx`'s `usePosition`
 *  use for their own pure width-to-layout functions. Width-dependent layout
 *  itself lives in the pure `dataLayout`; this hook is only the resize
 *  listener that feeds it. */
function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

/** One session row, plus (only when it is the selected/open session) its
 *  laps as recessed sub-rows on the same column grid (UI-DIRECTION "Data").
 *  Selection is the existing single-session model (`AppState.selection`,
 *  unchanged by this restyle) shown as a gutter checkbox — idl0's
 *  session-mode checkbox half of the XOR model (decision 33); this task
 *  wires no lap-mode checkbox (see the page's own "Parity gaps"). Lap
 *  sub-rows are sourced from the same `detailView` the `DetailPane` on the
 *  right already fetched for the selected session, rather than a second
 *  per-row `listLaps` call — expanding is therefore exactly "select", not an
 *  independent fetch. */
function SessionRowView({
  row,
  selected,
  onSelect,
  laps,
  lapsErrorText,
}: {
  row: SessionRow;
  selected: boolean;
  onSelect: () => void;
  /** Non-null only when `selected` and the detail fetch for this session has
   *  resolved with laps. */
  laps: ReturnType<typeof toDetailView>["laps"] | null;
  lapsErrorText: string | null;
}) {
  return (
    <div className="flex flex-col">
      <DenseRow
        selected={selected}
        role="row"
        tabIndex={0}
        aria-selected={selected}
        className="cursor-pointer px-3"
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onSelect();
        }}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          aria-label={selected ? "Selected" : "Select session"}
          className="shrink-0 data-[state=unchecked]:opacity-50"
        />
        <span className="w-16 shrink-0 font-mono text-sm text-fg">{row.timeText}</span>
        <span className="flex-[2] font-mono text-sm text-fg">{row.riderText === "" ? "—" : row.riderText}</span>
        <span className="flex-[2] font-mono text-sm text-fg-dim">{row.bikeText === "" ? "—" : row.bikeText}</span>
        <span className="w-20 shrink-0 font-mono text-sm text-fg-dim">{row.durationText}</span>
        <span className="w-14 shrink-0 font-mono text-sm text-fg-dim">{row.lapCountText}</span>
        <Badge className="shrink-0">.{row.sourceFormat}</Badge>
      </DenseRow>
      {selected && laps !== null && (
        <div className="flex flex-col bg-surface-2 pl-9">
          {lapsErrorText !== null ? (
            <p role="alert" className="px-3 py-1.5 font-mono text-xs text-brand-accent">
              {lapsErrorText}
            </p>
          ) : laps.length === 0 ? (
            <p className="px-3 py-1.5 font-mono text-xs text-fg-dim">No laps recorded for this session.</p>
          ) : (
            laps.map((lap) => (
              <div key={lap.lapNumber} className="flex items-center gap-2 border-l-[3px] border-l-transparent px-3 py-1 font-mono text-xs text-fg-dim">
                <span className="w-10 shrink-0">Lap {lap.lapNumber}</span>
                <span className="w-16 shrink-0">{lap.lapTimeMs === null ? "—" : formatLapTimeMs(lap.lapTimeMs)}</span>
                {lap.isReference && <Badge className="shrink-0">best</Badge>}
                {lap.ignored && <Badge className="shrink-0">ignored</Badge>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** Data tab: the sessions result list, filter rail and active-filter chips,
 *  plus the Tracks table (Task 6) behind a view toggle. Sessions loads once
 *  on mount from the catalog's `list_sessions` (C3 §3.2); Tracks
 *  (`TrackResults`) owns its own `list_tracks` fetch. Facets, filtering and
 *  the filter rail apply to the Sessions view only — no Track facet at
 *  wave 2 (R53 Data Q2/R54): a `SessionSummary` carries no track linkage,
 *  so a Tracks-view facet over sessions data would be a trap, not a filter.
 *  Filtering, sorting and facet counts are all local recomputation over the
 *  already-fetched list — no IPC on the interaction path (CLAUDE.md §2).
 *
 *  Layout follows `dataLayout` (UI-DIRECTION "Data"): a docked 280 px
 *  `FilterRail` and 320 px `DetailPane` on wide, flexible docked panels on
 *  medium, and `Sheet`s (filter bar + full-height detail) on narrow. */
export default function Data() {
  const [state, dispatch] = useReducer(reducer, { status: "loading" });
  const [filters, filterDispatch] = useReducer(filtersReducer, initialFilters);
  const [detailState, detailDispatch] = useReducer(detailReducer, { status: "idle" });
  const [maintenanceState, maintenanceDispatch] = useReducer(maintenanceReducer, initialMaintenanceState);
  const [maintenancePanelOpen, setMaintenancePanelOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [appState, appDispatch] = useAppState();
  const selectedSessionId = appState.selection.sessionId;
  const width = useWindowWidth();
  const layout = dataLayout(width);

  /** Fetches `list_sessions` and applies the result, ignoring a stale
   *  response if the caller has already unmounted/moved on. Used on mount
   *  and as `ImportPanel`'s `onImported` refresh (settle-bound: once per
   *  queue drain, never per file — CLAUDE.md §2). */
  const loadSessions = useCallback((isCancelled: () => boolean) => {
    listSessions()
      .then((sessions) => {
        if (isCancelled()) return;
        dispatch({ type: "loaded", sessions });
      })
      .catch((e: unknown) => {
        if (isCancelled()) return;
        dispatch({ type: "failed", text: describeIpcError(e).text });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSessions(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  const handleImported = useCallback(() => {
    loadSessions(() => false);
  }, [loadSessions]);

  /** Toolbar's "Rebuild catalog" — the one real maintenance action
   *  (IPC-driving click delegates to [[startMaintenanceAction]], the pure
   *  driver — operating brief §4's rule). Refreshes the sessions list on
   *  success, since a rebuild can surface sessions this render never saw. */
  const handleRebuildCatalog = () => {
    startMaintenanceAction(maintenanceState, "rebuild_catalog", runRebuildCatalog(rebuildCatalog), (a) => {
      maintenanceDispatch(a);
      if (a.type === "SUCCEEDED") loadSessions(() => false);
    });
  };

  /** Toolbar's "Delete session" (IPC need 3, stubbed) — idl0's blob-deleting
   *  variant. Confirmed first: it is destructive the moment `delete_session`
   *  lands, so the confirmation is built now rather than added later
   *  alongside the real wiring (this task's brief). */
  const handleDeleteSession = () => {
    if (selectedSessionId === null) return;
    // TODO(idl0): replace window.confirm() with the shell's in-app modal once one exists
    if (!window.confirm("Delete this session and its source file? This cannot be undone.")) return;
    startMaintenanceAction(maintenanceState, "delete_session", runDeleteSession(deleteSession, selectedSessionId, true), (a) => {
      maintenanceDispatch(a);
      if (a.type === "SUCCEEDED") {
        closeDetail();
        loadSessions(() => false);
      }
    });
  };

  /** Toolbar's "Forget session" — idl0's non-blob-deleting variant, mapped
   *  onto the same `deleteSession` (C3 §3.2) with `deleteBlob: false`
   *  rather than a fourth call site. */
  const handleForgetSession = () => {
    if (selectedSessionId === null) return;
    // TODO(idl0): replace window.confirm() with the shell's in-app modal once one exists
    if (!window.confirm("Remove this session from the catalog? Its source file is kept.")) return;
    startMaintenanceAction(maintenanceState, "forget_session", runForgetSession(deleteSession, selectedSessionId), (a) => {
      maintenanceDispatch(a);
      if (a.type === "SUCCEEDED") {
        closeDetail();
        loadSessions(() => false);
      }
    });
  };

  /** `MetadataForm`'s `onSaved`: `save_session_metadata` (C3 §3.2) already
   *  re-reads and returns the file's own canonical `SessionDetail`, so this
   *  redraws the detail pane from that rather than from what the form
   *  hoped it wrote. Also refreshes the sessions list — the nine saved
   *  fields (rider, bike, venue, etc.) are also `SessionSummary` columns
   *  the list/filters/facets read, and `save_session_metadata` does not
   *  update the catalog row itself (C3 §3.2: "not re-indexed by this
   *  command; `rebuild_catalog` reconciles it"). */
  const handleMetadataSaved = (detail: SessionDetail) => {
    if (detailState.status === "ready") {
      detailDispatch({ type: "detail-ready", detail, laps: detailState.laps, lapsErrorText: detailState.lapsErrorText });
    }
    loadSessions(() => false);
  };

  /** Toolbar's "Rescan tracks" (C3 §3.2, ruling R83/L2b Task 8) — re-runs
   *  visit/lap detection for the selected session against the current track
   *  library and rewrites its `session.json`. Not destructive in the
   *  "loses data" sense (idl0's own semantics: a rescan corrects lap/track
   *  attribution, it does not delete a recording), so unlike delete/forget
   *  it is not behind a confirm dialog. Redraws the detail pane from
   *  canonical truth afterward via [[loadDetail]], since laps/sectors/
   *  neutral-zone visits and any cleared lap flags may all have changed. */
  const handleRescanTracks = () => {
    if (selectedSessionId === null) return;
    startMaintenanceAction(maintenanceState, "rescan_tracks", runRescanTracks(rescanTracks, selectedSessionId), (a) => {
      maintenanceDispatch(a);
      if (a.type === "SUCCEEDED") loadDetail(selectedSessionId, () => false);
    });
  };

  /** `TrackDetailPane`'s "Rescan N sessions" action, offered after a
   *  `save_track`/`delete_track` names `stale_session_ids` (C3 §3.2,
   *  ruling R86). Goes through the same [[startMaintenanceAction]] driver
   *  as every other toolbar action; a no-op when `sessionIds` is empty
   *  (nothing to rescan). Does not redraw the session detail pane — the
   *  Tracks view has no session selected — so only the toolbar's own
   *  result line reflects the outcome. */
  const handleRescanSessions = (sessionIds: string[]) => {
    if (sessionIds.length === 0) return;
    startMaintenanceAction(maintenanceState, "rescan_sessions", runRescanSessions(rescanTracks, sessionIds), maintenanceDispatch);
  };

  /** Fetches `get_session` + `list_laps` in parallel for `sessionId` (R53
   *  Data Q3; C3 §4: both are settle-bound, never a hover/pan/zoom handler).
   *  A `list_laps` rejection with kind `not_found` is not an error for this
   *  pane (R53 Q4: laps aren't indexed for most sessions at wave 2) — it
   *  renders as an empty lap table, not a banner. Shared by the
   *  selection-settle effect below and `handleRescanTracks`, which must
   *  redraw the same pane from canonical truth after a rescan rewrites
   *  `session.json`. */
  const loadDetail = useCallback((sessionId: string, isCancelled: () => boolean) => {
    detailDispatch({ type: "detail-loading" });

    const lapsAttempt: Promise<{ laps: LapSummary[]; errorText: string | null }> = listLaps(sessionId)
      .then((laps) => ({ laps, errorText: null }))
      .catch((e: unknown) => {
        const described = describeIpcError(e);
        return { laps: [], errorText: described.kind === "not_found" ? null : described.text };
      });

    Promise.all([getSession(sessionId), lapsAttempt])
      .then(([detail, lapsResult]) => {
        if (isCancelled()) return;
        detailDispatch({ type: "detail-ready", detail, laps: lapsResult.laps, lapsErrorText: lapsResult.errorText });
      })
      .catch((e: unknown) => {
        if (isCancelled()) return;
        detailDispatch({ type: "detail-failed", text: describeIpcError(e).text });
      });
  }, []);

  useEffect(() => {
    if (selectedSessionId === null) {
      detailDispatch({ type: "detail-closed" });
      return;
    }

    let cancelled = false;
    loadDetail(selectedSessionId, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, loadDetail]);

  const sessions = state.status === "ready" ? state.sessions : [];

  const matching = useMemo(() => sessions.filter((s) => matchesFilters(s, filters)), [sessions, filters]);

  const counts = useMemo(() => facetCounts(sessions, filters), [sessions, filters]);

  const rows = useMemo(
    () =>
      [...matching].sort((a, b) => compareSessions(a, b, filters.sortField, filters.sortAscending)).map(toSessionRow),
    [matching, filters.sortField, filters.sortAscending],
  );

  const groups = useMemo(() => groupSessionRows(rows), [rows]);

  const detailView = useMemo(
    () => (detailState.status === "ready" ? toDetailView(detailState.detail, detailState.laps) : null),
    [detailState],
  );

  /** Row selection (R53 Data Q3): dispatches into `AppState.selection` so
   *  the notebook can read the chosen session later. Never dispatches
   *  `SET_LAP_CONTEXT` — no lap UI in this task picks a main/overlay lap
   *  (deferred to L6, per the Data lane brief's Parity gaps). Selecting the
   *  already-selected row closes it — the same toggle idl0's row tap/gutter
   *  checkbox both drive. */
  const selectSession = (sessionId: string) => {
    appDispatch({ type: "SET_SELECTED_SESSION", sessionId: sessionId === selectedSessionId ? null : sessionId });
    if (layout.detail === "sheet") setDetailSheetOpen(true);
  };

  const closeDetail = () => {
    appDispatch({ type: "SET_SELECTED_SESSION", sessionId: null });
  };

  // Keeps the detail sheet open on a resize into the narrow layout while a
  // session is already selected (e.g. selected at wide, then the window
  // shrinks) — width-dependent, but reading `dataLayout`'s own pure result,
  // never deciding layout itself.
  useEffect(() => {
    if (layout.detail === "sheet" && selectedSessionId !== null) setDetailSheetOpen(true);
  }, [layout.detail, selectedSessionId]);

  const detailContent =
    detailState.status === "loading" ? (
      <p className="p-3 font-mono text-sm text-fg-dim">Loading session…</p>
    ) : detailState.status === "error" ? (
      <p role="alert" className="p-3 font-mono text-sm text-brand-accent">
        {detailState.text}
      </p>
    ) : detailState.status === "ready" && detailView !== null ? (
      <DetailPane
        view={detailView}
        detail={detailState.detail}
        lapsErrorText={detailState.lapsErrorText}
        onMetadataSaved={handleMetadataSaved}
        onClose={closeDetail}
      />
    ) : null;

  const railContent = <FilterRail filters={filters} counts={counts} dispatch={filterDispatch} />;

  const maintenanceToolbar = (
    <div role="toolbar" aria-label="Maintenance" className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2">
      <Button type="button" size="sm" onClick={handleRebuildCatalog} disabled={maintenanceState.status === "running"}>
        <DatabaseIcon /> Rebuild catalog
      </Button>
      <Button type="button" size="sm" onClick={handleDeleteSession} disabled={selectedSessionId === null || maintenanceState.status === "running"}>
        Delete session
      </Button>
      <Button type="button" size="sm" onClick={handleForgetSession} disabled={selectedSessionId === null || maintenanceState.status === "running"}>
        Forget session
      </Button>
      <Button type="button" size="sm" onClick={handleRescanTracks} disabled={selectedSessionId === null || maintenanceState.status === "running"}>
        Rescan tracks
      </Button>
      <Button
        type="button"
        size="sm"
        aria-pressed={maintenancePanelOpen}
        onClick={() => setMaintenancePanelOpen((open) => !open)}
      >
        <WrenchIcon /> {maintenancePanelOpen ? "Hide maintenance panel" : "Maintenance panel"}
      </Button>
      {maintenanceState.status === "running" && <p className="font-mono text-sm text-fg-dim">Running {maintenanceState.action}…</p>}
      {maintenanceState.status === "done" && <p className="font-mono text-sm text-fg-dim">{maintenanceState.result}</p>}
      {maintenanceState.status === "failed" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {maintenanceState.error}
        </p>
      )}
    </div>
  );

  const viewAndSortToolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
      <Tabs value={filters.view} onValueChange={(v) => filterDispatch({ type: "SET_VIEW", view: v as "sessions" | "tracks" })}>
        <TabsList>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="tracks">Tracks</TabsTrigger>
        </TabsList>
      </Tabs>
      <div role="toolbar" aria-label="Sort" className="flex items-center gap-2">
        <Select value={filters.sortField} onValueChange={(v) => filterDispatch({ type: "SET_SORT_FIELD", field: v as SortField })}>
          <SelectTrigger size="sm" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortFieldsForView(filters.view).map((field) => (
              <SelectItem key={field} value={field}>
                {FIELD_LABELS[field]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="icon-sm" onClick={() => filterDispatch({ type: "TOGGLE_SORT_DIRECTION" })} aria-label="Toggle sort direction">
          {filters.sortAscending ? "↑" : "↓"}
        </Button>
      </div>
    </div>
  );

  if (state.status === "loading") {
    return <p className="p-4 font-mono text-sm text-fg-dim">Loading sessions…</p>;
  }

  if (state.status === "error") {
    return (
      <p role="alert" className="p-4 font-mono text-sm text-brand-accent">
        {state.text}
      </p>
    );
  }

  return (
    <div className="flex h-full">
      {filters.view === "sessions" && layout.rail === "docked" && (
        <div className="shrink-0 border-r border-rule" style={{ width: layout.railWidthPx ?? undefined }}>
          {railContent}
        </div>
      )}
      {filters.view === "sessions" && layout.rail === "panel" && (
        <div className="w-64 shrink-0 border-r border-rule">{railContent}</div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {filters.view === "sessions" && layout.rail === "sheet" && (
          <div role="toolbar" aria-label="Filters" className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
            <Button type="button" size="sm" onClick={() => setFilterSheetOpen(true)}>
              Filters {activeCount(filters) > 0 && `(${activeCount(filters)})`}
            </Button>
          </div>
        )}

        <div role="toolbar" aria-label="Import" className="border-b border-rule px-3 py-2">
          <ImportPanel onImported={handleImported} />
        </div>

        {maintenanceToolbar}
        {maintenancePanelOpen && <MaintenancePanel />}
        {viewAndSortToolbar}
        {filters.view === "sessions" && <ActiveChips filters={filters} dispatch={filterDispatch} />}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filters.view === "tracks" ? (
            <TrackResults sortField={filters.sortField} sortAscending={filters.sortAscending} onRescanSessions={handleRescanSessions} />
          ) : rows.length === 0 ? (
            <p className="p-4 font-mono text-sm text-fg-dim">
              {sessions.length === 0 ? "No sessions yet — import a file." : "No matches. Try clearing filters."}
            </p>
          ) : (
            <div className="flex flex-col">
              <BrandTableHeader className="sticky top-0 z-10 bg-bg px-3">
                <span className="w-4 shrink-0" aria-hidden />
                <span className="w-16 shrink-0">Time</span>
                <span className="flex-[2]">Rider</span>
                <span className="flex-[2]">Bike</span>
                <span className="w-20 shrink-0">Duration</span>
                <span className="w-14 shrink-0">Laps</span>
                <span className="w-16 shrink-0">Source</span>
              </BrandTableHeader>
              {groups.map((group) => (
                <Collapsible key={group.groupKey} defaultOpen>
                  <CollapsibleTrigger className="group flex w-full items-center gap-1.5 border-b border-rule bg-surface px-3 py-1.5 font-mono text-xs font-medium tracking-[var(--tracking-label)] text-fg-dim uppercase outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    <ChevronRightIcon className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" aria-hidden />
                    <span>{group.groupKey}</span>
                    <span className="text-fg-faint">({group.rows.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {group.rows.map((row) => (
                      <SessionRowView
                        key={row.sessionId}
                        row={row}
                        selected={row.sessionId === selectedSessionId}
                        onSelect={() => selectSession(row.sessionId)}
                        laps={row.sessionId === selectedSessionId && detailView !== null ? detailView.laps : null}
                        lapsErrorText={row.sessionId === selectedSessionId ? detailState.status === "ready" ? detailState.lapsErrorText : null : null}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      </div>

      {filters.view === "sessions" && selectedSessionId !== null && layout.detail === "docked" && (
        <div className="shrink-0 border-l border-rule" style={{ width: layout.detailWidthPx ?? undefined }}>
          {detailContent}
        </div>
      )}
      {filters.view === "sessions" && selectedSessionId !== null && layout.detail === "panel" && (
        <div className="w-72 shrink-0 border-l border-rule">{detailContent}</div>
      )}

      {layout.rail === "sheet" && (
        <BrandSheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen} title="Filters">
          {railContent}
        </BrandSheet>
      )}
      {layout.detail === "sheet" && (
        <BrandSheet
          open={detailSheetOpen && selectedSessionId !== null}
          onOpenChange={(open) => {
            setDetailSheetOpen(open);
            if (!open) closeDetail();
          }}
          title="Session detail"
          className="sm:max-w-full"
        >
          {detailContent ?? (
            <NoteBlock className="border-rule text-fg-dim">No session selected.</NoteBlock>
          )}
        </BrandSheet>
      )}
    </div>
  );
}

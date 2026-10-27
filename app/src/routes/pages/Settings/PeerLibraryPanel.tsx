import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { peerLibrary, syncSelection, type Progress } from "../../../ipc/sync";
import {
  describeBackendReason,
  describeTransferred,
  libraryLoadReducer,
  runSelectionSync,
} from "./peerLibraryState";
import {
  buildPullSelection,
  emptyFilters,
  emptySelection,
  filterOptions,
  formatSyncBytes,
  pruneSelection,
  selectAllVisible,
  selectionBytes,
  selectionCount,
  toggleSelected,
  viewSessions,
  viewWorkbooks,
  type PeerLibraryFilters,
  type PeerSelection,
} from "./peerLibraryView";
import { PeerSessionRow } from "./PeerSessionRow";

/** Radix `Select` cannot hold an empty value, so "any" travels as this. */
const ANY = "__any__";

/** Props for {@link PeerLibraryPanel}. */
export interface PeerLibraryPanelProps {
  /** The paired peer whose library is browsed. */
  peerId: string;
  /** Its display name, for the heading. */
  peerName: string;
}

/** Option A of the library-tiers browse (§4a): lists a paired device's
 *  sessions and workbooks with filters and checkboxes, and pulls the ticked
 *  ones. Reads the library on mount; every pull refreshes it so rows that
 *  arrived turn into "✓ here". The logic is in `peerLibraryView.ts` and
 *  `peerLibraryState.ts`; this component only wires it to the screen. */
export function PeerLibraryPanel({ peerId, peerName }: PeerLibraryPanelProps) {
  const [load, dispatch] = useReducer(libraryLoadReducer, { status: "loading" });
  const [filters, setFilters] = useState<PeerLibraryFilters>(emptyFilters);
  const [selection, setSelection] = useState<PeerSelection>(emptySelection);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  const fetchLibrary = useCallback(
    (isCancelled: () => boolean) => {
      dispatch({ type: "refreshing" });
      peerLibrary(peerId)
        .then((library) => {
          if (isCancelled()) return;
          dispatch({ type: "loaded", library });
          setSelection((current) => pruneSelection(library, current));
        })
        .catch((error: unknown) => {
          if (isCancelled()) return;
          dispatch({ type: "failed", message: describeBackendReason(error) });
        });
    },
    [peerId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchLibrary(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [fetchLibrary]);

  const library = load.status === "ready" ? load.library : null;
  const sessionRows = useMemo(() => (library === null ? [] : viewSessions(library, filters)), [library, filters]);
  const workbookRows = useMemo(() => (library === null ? [] : viewWorkbooks(library, filters)), [library, filters]);
  const options = useMemo(() => (library === null ? { venues: [], riders: [] } : filterOptions(library)), [library]);
  const pulling = progress !== null;
  const count = selectionCount(selection);

  function handlePull(): void {
    if (library === null || count === 0 || pulling) return;
    setPullError(null);
    setProgress({ done: 0, total: null, phase: "manifest" });
    void runSelectionSync(
      { syncSelection, describeError: describeBackendReason },
      peerId,
      buildPullSelection(library, selection),
      setProgress,
    ).then((outcome) => {
      setProgress(null);
      if (outcome.ok) {
        toast.success(`Pulled from ${peerName}`, { description: describeTransferred(outcome.result) });
        fetchLibrary(() => false);
      } else {
        setPullError(outcome.message);
        toast.error(`Pull from ${peerName} failed`, { description: outcome.message });
      }
    });
  }

  if (load.status === "loading") {
    return <p className="font-mono text-sm text-fg-dim">Reading {peerName}’s library…</p>;
  }

  if (load.status === "error") {
    return (
      <div className="flex flex-col gap-2">
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {load.message}
        </p>
        <Button type="button" size="sm" className="w-fit" onClick={() => fetchLibrary(() => false)}>
          Try again
        </Button>
      </div>
    );
  }

  const empty = load.library.sessions.length === 0 && load.library.workbooks.length === 0;
  const anySelectable = [...sessionRows, ...workbookRows].some((r) => r.selectable);

  return (
    <div className="flex flex-col gap-3">
      {empty ? (
        <p className="font-mono text-sm text-fg-dim">{peerName} has no sessions or workbooks yet.</p>
      ) : (
        <>
          <div role="group" aria-label="Filters" className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              aria-label="From date"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
            <Input
              type="date"
              aria-label="To date"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
            <FilterSelect label="Venue" value={filters.venue} choices={options.venues} onChange={(venue) => setFilters({ ...filters, venue })} />
            <FilterSelect label="Rider" value={filters.rider} choices={options.riders} onChange={(rider) => setFilters({ ...filters, rider })} />
            <Input
              type="search"
              aria-label="Search"
              placeholder="Search"
              className="col-span-2"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Sessions ({sessionRows.length})</h3>
            <Button
              type="button"
              size="xs"
              disabled={!anySelectable || pulling}
              onClick={() => setSelection(selectAllVisible(load.library, selection, filters))}
            >
              Select all shown
            </Button>
          </div>
          {sessionRows.length === 0 ? (
            <p className="font-mono text-xs text-fg-faint">No sessions match.</p>
          ) : (
            <div className="flex flex-col border-t border-rule">
              {sessionRows.map((row) => (
                <PeerSessionRow
                  key={row.id}
                  row={row}
                  checked={selection.sessions.has(row.id)}
                  onToggle={() => setSelection(toggleSelected(load.library, selection, "session", row.id))}
                />
              ))}
            </div>
          )}

          <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Workbooks ({workbookRows.length})</h3>
          {workbookRows.length === 0 ? (
            <p className="font-mono text-xs text-fg-faint">No workbooks match.</p>
          ) : (
            <div className="flex flex-col border-t border-rule">
              {workbookRows.map((row) => (
                <div key={row.id} className={`flex items-center gap-3 border-b border-rule px-3 py-1.5 ${row.selectable ? "" : "opacity-60"}`}>
                  <Checkbox
                    checked={selection.workbooks.has(row.id)}
                    disabled={!row.selectable}
                    onCheckedChange={() => setSelection(toggleSelected(load.library, selection, "workbook", row.id))}
                    aria-label={`Select workbook ${row.nameText}`}
                    className="shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{row.nameText}</span>
                  <span className="shrink-0 font-mono text-xs text-fg-dim">{row.sizeText}</span>
                  <span className="w-20 shrink-0 text-right font-mono text-xs text-fg-dim">{row.hereText}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {pullError !== null && (
        <p role="alert" className="font-mono text-xs text-brand-accent">
          {pullError}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-between gap-3 border-t border-rule bg-bg px-4 py-3">
        <span className="font-mono text-xs text-fg-dim">
          {pulling
            ? `Pulling — ${progress.phase}${progress.total !== null ? ` (${progress.done}/${progress.total})` : ""}`
            : `${count} selected · ${formatSyncBytes(selectionBytes(load.library, selection))}`}
        </span>
        <Button type="button" emphasis="info" filled disabled={count === 0 || pulling} onClick={handlePull}>
          {pulling ? "Pulling…" : "Pull"}
        </Button>
      </div>
    </div>
  );
}

/** A venue/rider chooser with an "Any" entry. */
function FilterSelect({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value === "" ? ANY : value} onValueChange={(v) => onChange(v === ANY ? "" : v)}>
      <SelectTrigger size="sm" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>Any {label.toLowerCase()}</SelectItem>
        {choices.map((c) => (
          <SelectItem key={c} value={c}>
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

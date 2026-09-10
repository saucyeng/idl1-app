import { useCallback, useEffect, useReducer, useState } from "react";

import { SectionHead } from "../../../components/brand/SectionHead";
import { Button } from "../../../components/ui/button";
import { inboxStatus, listStaleSessions, reimportSessions, type InboxStatus, type StaleSession } from "../../../ipc/library";
import { listQuarantine, resolveQuarantine, verifyDataDir, type QuarantineEntry, type VerifyReport } from "../../../ipc/maintenance";
import { describeIpcError } from "./errors";
import { describeInboxStatus, staleRebuildLabel, summarizeReimportReport, summarizeStaleSessions } from "./libraryPanel";
import { formatQuarantineEntry, summarizeVerifyReport } from "./quarantinePanel";

type QuarantineState =
  | { status: "loading" }
  | { status: "ready"; entries: QuarantineEntry[] }
  | { status: "error"; text: string };

type QuarantineAction = { type: "loaded"; entries: QuarantineEntry[] } | { type: "failed"; text: string };

function quarantineReducer(_state: QuarantineState, action: QuarantineAction): QuarantineState {
  switch (action.type) {
    case "loaded":
      return { status: "ready", entries: action.entries };
    case "failed":
      return { status: "error", text: action.text };
  }
}

/** The "Rebuild N stale sessions" action's own state (C3 §3.3
 *  `reimport_sessions`). Separate from [[VerifyState]]: the two actions are
 *  independent and either may be run without the other. */
type RebuildState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number }
  | { status: "done"; text: string }
  | { status: "error"; text: string };

/** The inbox status line's fetch state. `"unsupported"` is the mobile
 *  answer (C3 §3.3: the inbox is desktop only) — a fact about the
 *  platform, never rendered as a failure. */
type InboxState =
  | { status: "loading" }
  | { status: "ready"; value: InboxStatus }
  | { status: "unsupported" }
  | { status: "error"; text: string };

type VerifyState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; report: VerifyReport; repaired: boolean }
  | { status: "error"; text: string };

/** The Data tab's maintenance panel (C3 §3.2 `list_quarantine`/
 *  `resolve_quarantine`, C3 §3.10 `verify_data_dir`, ruling R86). Fetches
 *  the quarantine list on mount, settle-bound — the caller only mounts
 *  this when the panel is opened. `resolveQuarantine`'s `"discard"` is
 *  confirmed first (destructive: the payload is deleted outright);
 *  `"restore"` is not (it moves a corrupt-by-content-address file back to
 *  where it came from, still recoverable via a fresh quarantine pass).
 *  `verify_data_dir(repair: false)` runs first; `repair: true` ("Repair")
 *  is a separate, explicit second action, never auto-triggered by the
 *  first report (C3 §3.10: repair moves files, verify alone never does). */
export function MaintenancePanel() {
  const [quarantineState, quarantineDispatch] = useReducer(quarantineReducer, { status: "loading" });
  const [verifyState, setVerifyState] = useState<VerifyState>({ status: "idle" });
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveErrorText, setResolveErrorText] = useState<string | null>(null);
  const [stale, setStale] = useState<StaleSession[]>([]);
  const [rebuildState, setRebuildState] = useState<RebuildState>({ status: "idle" });
  const [inbox, setInbox] = useState<InboxState>({ status: "loading" });

  const loadStale = useCallback((isCancelled: () => boolean) => {
    listStaleSessions()
      .then((rows) => {
        if (isCancelled()) return;
        setStale(rows);
      })
      .catch(() => {
        // A staleness query failure narrows the panel (no rebuild
        // affordance) rather than breaking it — the other maintenance
        // actions are independent of it.
        if (isCancelled()) return;
        setStale([]);
      });
  }, []);

  // The stale list and the inbox status, both cheap and both fetched once
  // per panel open (the caller only mounts this when the panel is opened).
  // `inbox_status` rejects with `unsupported_platform` on mobile, where the
  // inbox does not exist — that reads as "no inbox on this platform", not
  // as an error (C3 §2's own guidance for the kind).
  useEffect(() => {
    let cancelled = false;
    loadStale(() => cancelled);
    inboxStatus()
      .then((status) => {
        if (cancelled) return;
        setInbox({ status: "ready", value: status });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const described = describeIpcError(e);
        setInbox(described.kind === "unsupported_platform" ? { status: "unsupported" } : { status: "error", text: described.text });
      });
    return () => {
      cancelled = true;
    };
  }, [loadStale]);

  /** Rebuilds every stale session (C3 §3.3 `reimport_sessions`). Each
   *  session that fails keeps its old `data.parquet` and is named in the
   *  summary; human-owned `session.json` fields survive a rebuild by
   *  construction, so this needs no confirmation. */
  const handleRebuildStale = () => {
    const ids = stale.map((s) => s.session_id);
    setRebuildState({ status: "running", done: 0, total: ids.length });
    reimportSessions(ids, (p) => setRebuildState({ status: "running", done: p.done, total: p.total ?? ids.length }))
      .then((report) => {
        setRebuildState({ status: "done", text: summarizeReimportReport(report) });
        loadStale(() => false);
      })
      .catch((e: unknown) => {
        setRebuildState({ status: "error", text: describeIpcError(e).text });
      });
  };

  const loadQuarantine = useCallback((isCancelled: () => boolean) => {
    listQuarantine()
      .then((entries) => {
        if (isCancelled()) return;
        quarantineDispatch({ type: "loaded", entries });
      })
      .catch((e: unknown) => {
        if (isCancelled()) return;
        quarantineDispatch({ type: "failed", text: describeIpcError(e).text });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadQuarantine(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadQuarantine]);

  const handleResolve = (entryId: string, action: "restore" | "discard") => {
    // TODO(idl0): replace window.confirm() with the shell's in-app modal once one exists
    if (action === "discard" && !window.confirm("Discard this quarantined file permanently? This cannot be undone.")) {
      return;
    }
    setResolvingId(entryId);
    setResolveErrorText(null);
    resolveQuarantine(entryId, action)
      .then(() => {
        setResolvingId(null);
        loadQuarantine(() => false);
      })
      .catch((e: unknown) => {
        setResolvingId(null);
        setResolveErrorText(describeIpcError(e).text);
      });
  };

  const handleVerify = (repair: boolean) => {
    setVerifyState({ status: "running" });
    verifyDataDir(repair)
      .then((report) => {
        setVerifyState({ status: "done", report, repaired: repair });
        if (repair) loadQuarantine(() => false);
      })
      .catch((e: unknown) => {
        setVerifyState({ status: "error", text: describeIpcError(e).text });
      });
  };

  return (
    <div className="flex flex-col gap-3 border-t border-rule p-3" role="region" aria-label="Maintenance panel">
      <SectionHead>Quarantine</SectionHead>
      {quarantineState.status === "loading" && <p className="font-mono text-sm text-fg-dim">Loading quarantine…</p>}
      {quarantineState.status === "error" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {quarantineState.text}
        </p>
      )}
      {quarantineState.status === "ready" &&
        (quarantineState.entries.length === 0 ? (
          <p className="font-mono text-sm text-fg-dim">No quarantined files.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {quarantineState.entries.map((entry) => (
              <li key={entry.entry_id} className="flex flex-wrap items-center gap-2 font-mono text-sm text-fg">
                <span className="flex-1">{formatQuarantineEntry(entry)}</span>
                <Button type="button" size="xs" onClick={() => handleResolve(entry.entry_id, "restore")} disabled={resolvingId !== null}>
                  Restore
                </Button>
                <Button
                  type="button"
                  size="xs"
                  emphasis="accent"
                  onClick={() => handleResolve(entry.entry_id, "discard")}
                  disabled={resolvingId !== null}
                >
                  Discard
                </Button>
              </li>
            ))}
          </ul>
        ))}
      {resolveErrorText !== null && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {resolveErrorText}
        </p>
      )}

      <SectionHead>Importer rebuilds</SectionHead>
      <p className="font-mono text-sm text-fg-dim">{summarizeStaleSessions(stale)}</p>
      {staleRebuildLabel(stale) !== null && (
        <div>
          <Button type="button" size="sm" onClick={handleRebuildStale} disabled={rebuildState.status === "running"}>
            {staleRebuildLabel(stale)}
          </Button>
        </div>
      )}
      {rebuildState.status === "running" && (
        <p className="font-mono text-sm text-fg-dim">
          Rebuilding {rebuildState.done}/{rebuildState.total}…
        </p>
      )}
      {rebuildState.status === "done" && <p className="font-mono text-sm text-fg-dim">{rebuildState.text}</p>}
      {rebuildState.status === "error" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {rebuildState.text}
        </p>
      )}

      <SectionHead>Inbox</SectionHead>
      {inbox.status === "loading" && <p className="font-mono text-sm text-fg-dim">Loading inbox status…</p>}
      {inbox.status === "ready" && <p className="font-mono text-sm text-fg-dim">{describeInboxStatus(inbox.value)}</p>}
      {inbox.status === "unsupported" && <p className="font-mono text-sm text-fg-dim">The inbox folder is desktop only.</p>}
      {inbox.status === "error" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {inbox.text}
        </p>
      )}

      <SectionHead>Verify data directory</SectionHead>
      <div role="toolbar" aria-label="Verify" className="flex gap-2">
        <Button type="button" size="sm" onClick={() => handleVerify(false)} disabled={verifyState.status === "running"}>
          Verify
        </Button>
        {verifyState.status === "done" && !verifyState.repaired && (
          <Button type="button" size="sm" onClick={() => handleVerify(true)}>
            Repair
          </Button>
        )}
      </div>
      {verifyState.status === "running" && <p className="font-mono text-sm text-fg-dim">Running…</p>}
      {verifyState.status === "done" && (
        <p className="font-mono text-sm text-fg-dim">{summarizeVerifyReport(verifyState.report, verifyState.repaired)}</p>
      )}
      {verifyState.status === "error" && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {verifyState.text}
        </p>
      )}
    </div>
  );
}

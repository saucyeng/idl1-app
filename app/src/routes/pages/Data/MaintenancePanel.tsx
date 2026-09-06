import { useCallback, useEffect, useReducer, useState } from "react";

import { listQuarantine, resolveQuarantine, verifyDataDir, type QuarantineEntry, type VerifyReport } from "../../../ipc/maintenance";
import { describeIpcError } from "./errors";
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
    <div className="data-maintenance-panel" role="region" aria-label="Maintenance panel">
      <h3>Quarantine</h3>
      {quarantineState.status === "loading" && <p>Loading quarantine…</p>}
      {quarantineState.status === "error" && <p role="alert">{quarantineState.text}</p>}
      {quarantineState.status === "ready" &&
        (quarantineState.entries.length === 0 ? (
          <p>No quarantined files.</p>
        ) : (
          <ul>
            {quarantineState.entries.map((entry) => (
              <li key={entry.entry_id}>
                {formatQuarantineEntry(entry)}{" "}
                <button type="button" onClick={() => handleResolve(entry.entry_id, "restore")} disabled={resolvingId !== null}>
                  Restore
                </button>{" "}
                <button type="button" onClick={() => handleResolve(entry.entry_id, "discard")} disabled={resolvingId !== null}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
        ))}
      {resolveErrorText !== null && <p role="alert">{resolveErrorText}</p>}

      <h3>Verify data directory</h3>
      <div role="toolbar" aria-label="Verify">
        <button type="button" onClick={() => handleVerify(false)} disabled={verifyState.status === "running"}>
          Verify
        </button>
        {verifyState.status === "done" && !verifyState.repaired && (
          <button type="button" onClick={() => handleVerify(true)}>
            Repair
          </button>
        )}
      </div>
      {verifyState.status === "running" && <p>Running…</p>}
      {verifyState.status === "done" && <p>{summarizeVerifyReport(verifyState.report, verifyState.repaired)}</p>}
      {verifyState.status === "error" && <p role="alert">{verifyState.text}</p>}
    </div>
  );
}

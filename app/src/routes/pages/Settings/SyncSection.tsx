import { useEffect, useReducer, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusDot } from "@/components/brand/StatusDot";
import { toastFor } from "@/components/toasts/events";
import { describeIpcError, type IpcErrorLike } from "./errors";
import { normalizePairCode, validatePairCode } from "./pairCode";
import type { PrefsStore } from "./prefsStore";
import { describeSyncResult, syncStateReducer, type SyncState } from "./syncState";
import { pairPeer, syncNow, syncStatus, type SyncResult } from "../../../ipc/sync";

/** Raises the "sync finished" toast (UI-DIRECTION decision 21) for a
 *  completed `sync_now` transfer — the lane's one toast call site. `changed`
 *  is the total number of items the transfer actually touched (blobs plus
 *  merged workbooks); `SyncResult` has no single "changed" field of its own. */
function announceSyncFinished(result: SyncResult): void {
  const descriptor = toastFor({ kind: "syncFinished", changed: result.blobs_transferred + result.workbooks_merged });
  const raise = descriptor.tone === "good" ? toast.success : descriptor.tone === "info" ? toast.info : toast.error;
  raise(descriptor.title, { description: descriptor.detail });
}

/** Props for {@link SyncSection}. Follows {@link ProfileSection}'s
 *  `{ store: PrefsStore }` shape for consistency across sections, even
 *  though this section's content comes entirely from `sync_status`/
 *  `sync_now`/`pair_peer` rather than `store`. */
export interface SyncSectionProps {
  /** Unused by this section's own content; kept for prop-shape consistency
   *  with the other sections. */
  store: PrefsStore;
}

/** How often the section polls `sync_status` while mounted, in milliseconds.
 *  Not fixed by any contract (C3 §4 only requires "a periodic poll, never
 *  per-frame") — 5 s balances a paired peer's online flag going stale
 *  against calling the backend needlessly often; the poll stops entirely
 *  when the component unmounts (the section is not the selected one). */
const POLL_INTERVAL_MS = 5000;

const INITIAL_STATE: SyncState = {
  status: null,
  peers: [],
  running: null,
  lastError: null,
};

/** Narrows an unknown rejection reason to C3 §2's `IpcError` shape, as this
 *  tab sees it (`errors.ts`'s {@link IpcErrorLike}). Same check
 *  `DataSection.tsx` uses. */
function isIpcErrorLike(error: unknown): error is IpcErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    typeof (error as { kind: unknown }).kind === "string" &&
    "message" in error
  );
}

/** Turns a rejection from `syncStatus`/`syncNow`/`pairPeer` into user-facing
 *  text. `sync_status`/`sync_now`/`pair_peer` are real, landed commands
 *  (C3 §3.9) — not stubs — but L11 (the Rust sync implementation) has not
 *  landed, so today every call rejects. A typed {@link IpcErrorLike}
 *  rejection is described via `describeIpcError`; anything else (e.g. the
 *  command not existing yet on this build) falls back to a message that
 *  says sync is not running yet, rather than surfacing a raw error. */
function describeSyncError(error: unknown): string {
  if (isIpcErrorLike(error)) {
    return describeIpcError(error);
  }
  return "LAN sync isn't running on this build yet. Pairing and sync will work once it's wired up.";
}

/** The Sync section: paired-peer list with online status (polled every
 *  {@link POLL_INTERVAL_MS}), a 6-digit pairing-code field gated by
 *  `pairCode.ts`'s `validatePairCode`, and a manual "Sync now" per peer
 *  (design §7 — sync also triggers automatically when a paired peer
 *  appears, which is L11's job to wire once it lands; this section only
 *  renders status and offers the manual button).
 *
 * `sync_status`/`sync_now`/`pair_peer` (C3 §3.9) are called directly, never
 * stubbed — L11 has not landed, so every call rejects today, and that
 * rejection is shown via {@link describeSyncError} rather than a stub error. */
export default function SyncSection({ store }: SyncSectionProps) {
  void store;

  const [state, dispatch] = useReducer(syncStateReducer, INITIAL_STATE);
  const [codeInput, setCodeInput] = useState<string>("");
  const [pairing, setPairing] = useState<boolean>(false);
  const [lastResultSummary, setLastResultSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function poll(): void {
      void syncStatus()
        .then((status) => {
          if (!cancelled) {
            dispatch({ type: "status", status });
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            dispatch({ type: "failure", message: describeSyncError(error) });
          }
        });
    }

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const normalizedCode = normalizePairCode(codeInput);
  const codeIssues = validatePairCode(normalizedCode);
  const codeHasErrors = codeIssues.length > 0;

  function handlePair(): void {
    if (codeHasErrors) {
      return;
    }
    setPairing(true);
    void pairPeer(normalizedCode)
      .then((peer) => {
        dispatch({ type: "paired", peer });
        setCodeInput("");
      })
      .catch((error: unknown) => {
        dispatch({ type: "failure", message: describeSyncError(error) });
      })
      .finally(() => {
        setPairing(false);
      });
  }

  function handleSyncNow(peerId: string): void {
    setLastResultSummary(null);
    void syncNow(peerId, (progress) => {
      dispatch({ type: "progress", peerId, progress });
    })
      .then((result) => {
        dispatch({ type: "result", peerId, result });
        setLastResultSummary(describeSyncResult(result));
        announceSyncFinished(result);
      })
      .catch((error: unknown) => {
        dispatch({ type: "failure", message: describeSyncError(error) });
      });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Paired devices</h3>
        {state.peers.length === 0 ? (
          <p className="font-mono text-xs text-fg-faint">No devices paired yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {state.peers.map((peer) => (
              <li key={peer.peer_id} className="flex items-center gap-3">
                <span className="font-mono text-sm text-fg">{peer.name}</span>
                <StatusDot className={peer.online ? "text-good" : "text-fg-faint"}>
                  {peer.online ? "Online" : "Offline"}
                </StatusDot>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleSyncNow(peer.peer_id)}
                  disabled={state.running !== null}
                >
                  Sync now
                </Button>
              </li>
            ))}
          </ul>
        )}

        {state.running ? (
          <p className="font-mono text-xs text-fg-dim">
            Syncing with {state.running.peerId} — {state.running.phase}
            {state.running.total !== null
              ? ` (${state.running.done}/${state.running.total})`
              : ` (${state.running.done})`}
          </p>
        ) : null}

        {lastResultSummary ? <p className="font-mono text-xs text-fg-dim">{lastResultSummary}</p> : null}

        {state.lastError ? (
          <p className="font-mono text-xs text-brand-accent">{state.lastError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Pair a new device</h3>
        <label htmlFor="idl1-settings-pair-code" className="font-mono text-xs text-fg-dim">
          Pairing code
        </label>
        <Input
          id="idl1-settings-pair-code"
          type="text"
          className="max-w-40"
          value={codeInput}
          onChange={(event) => setCodeInput(event.target.value)}
          placeholder="123 456"
        />
        {codeInput.length > 0
          ? codeIssues.map((issue) => (
              <p key={issue.message} className="font-mono text-xs text-brand-accent">
                {issue.message}
              </p>
            ))
          : null}
        <Button type="button" emphasis="info" filled onClick={handlePair} disabled={codeHasErrors || pairing} className="w-fit">
          Pair
        </Button>
      </div>
    </div>
  );
}

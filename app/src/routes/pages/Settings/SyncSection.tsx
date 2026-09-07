import { useEffect, useReducer, useState } from "react";
import { LinkIcon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusDot } from "@/components/brand/StatusDot";
import { toastFor } from "@/components/toasts/events";
import { composeVisibility, getActiveRoute, subscribeRouteVisible } from "../../../shell/routeVisibility";
import { describeIpcError, type IpcErrorLike } from "./errors";
import { isSyncNowDisabled, pairButtonLabel, syncNowButtonLabel, validatePairForm } from "./pairForm";
import { normalizePairCode } from "./pairCode";
import type { PrefsStore } from "./prefsStore";
import { startPeerAppearedWatch, startSyncStatusPoll, type PeerAppearedWatchDeps, type SyncStatusPollDeps } from "./syncPoll";
import { describeSyncResult, syncStateReducer, type SyncState } from "./syncState";
import {
  onPeerAppeared,
  pairPeer,
  startPairing,
  syncNow,
  syncStatus,
  unpairPeer,
  type PairingCode,
  type SyncResult,
} from "../../../ipc/sync";

/** Raises the "sync finished" toast (UI-DIRECTION decision 21) for a
 *  completed `sync_now` transfer — the lane's one toast call site. `changed`
 *  is the total number of items the transfer actually touched (blobs,
 *  merged workbooks, and every other class ruling R102 added to
 *  `SyncResult`) — the result has no single "changed" field of its own. */
function announceSyncFinished(result: SyncResult): void {
  const changed =
    result.blobs_transferred +
    result.workbooks_merged +
    result.sessions_updated +
    result.tracks_updated +
    result.profiles_updated;
  const descriptor = toastFor({ kind: "syncFinished", changed });
  const raise = descriptor.tone === "good" ? toast.success : descriptor.tone === "info" ? toast.info : toast.error;
  raise(descriptor.title, { description: descriptor.detail });
}

/** Props for {@link SyncSection}. Follows {@link ProfileSection}'s
 *  `{ store: PrefsStore }` shape for consistency across sections, even
 *  though this section's content comes entirely from `sync_status`/
 *  `sync_now`/`pair_peer`/`start_pairing`/`unpair_peer` rather than `store`. */
export interface SyncSectionProps {
  /** Unused by this section's own content; kept for prop-shape consistency
   *  with the other sections. */
  store: PrefsStore;
}

const INITIAL_STATE: SyncState = {
  status: null,
  peers: [],
  running: null,
  lastError: null,
};

/** Real deps for {@link startSyncStatusPoll}/{@link startPeerAppearedWatch}
 *  (wave-2 operating brief §4's effects rule): `isVisible` composes the
 *  window's own visibility with whether Settings is the shell's active
 *  route (R95's route-visibility context, `shell/routeVisibility.tsx`) —
 *  under mount-and-hide every page stays mounted, so a hidden Settings tab
 *  would otherwise keep polling `sync_status` and holding a live
 *  `peer_appeared` subscription forever. Built once at module scope, the
 *  same shape `Device/index.tsx`'s `STATUS_POLL_DEPS` follows. */
const SYNC_STATUS_POLL_DEPS: SyncStatusPollDeps = {
  syncStatus,
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle),
  isVisible: () => composeVisibility(document.visibilityState === "visible", getActiveRoute() === "settings"),
  onVisibilityChange: (handler) => subscribeRouteVisible("settings", handler),
};

/** Real deps for {@link startPeerAppearedWatch} — same composed visibility
 *  signal as {@link SYNC_STATUS_POLL_DEPS}. */
const PEER_APPEARED_WATCH_DEPS: PeerAppearedWatchDeps = {
  onPeerAppeared,
  isVisible: SYNC_STATUS_POLL_DEPS.isVisible,
  onVisibilityChange: SYNC_STATUS_POLL_DEPS.onVisibilityChange,
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

/** Turns a rejection from `syncStatus`/`syncNow`/`pairPeer`/`startPairing`/
 *  `unpairPeer` into user-facing text. A typed {@link IpcErrorLike}
 *  rejection is described via `describeIpcError`; anything else falls back
 *  to a generic message rather than surfacing a raw error. */
function describeSyncError(error: unknown): string {
  if (isIpcErrorLike(error)) {
    return describeIpcError(error);
  }
  return "LAN sync ran into a problem. Check that both devices are on the same network and try again.";
}

/** The Sync section: paired-peer list with online status and per-peer
 *  unpair/sync-now, a pairing flow (this device's own code via
 *  `start_pairing`, and a form that pairs against a peer named explicitly —
 *  see `pairForm.ts`'s doc comment for why the peer id is typed rather than
 *  picked from a discovered list), and the "sync finished" toast
 *  (UI-DIRECTION decision 21). Sync also triggers automatically when a
 *  paired peer comes back online (the Rust auto-trigger, `commands::sync::
 *  should_auto_sync`); `peer_appeared` refreshes that peer's row here
 *  without waiting for the next poll. */
export default function SyncSection({ store }: SyncSectionProps) {
  void store;

  const [state, dispatch] = useReducer(syncStateReducer, INITIAL_STATE);
  const [peerIdInput, setPeerIdInput] = useState<string>("");
  const [codeInput, setCodeInput] = useState<string>("");
  const [pairing, setPairing] = useState<boolean>(false);
  const [lastResultSummary, setLastResultSummary] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<PairingCode | null>(null);
  const [showingCode, setShowingCode] = useState<boolean>(false);

  // The `sync_status` poll (wave-2 operating brief §4's effects rule: all
  // decision logic lives in the pure `startSyncStatusPoll` driver, gated on
  // R95's route-visibility signal). Data-only dependency array (empty —
  // `SYNC_STATUS_POLL_DEPS` and `dispatch` are both stable references).
  useEffect(() => {
    return startSyncStatusPoll(SYNC_STATUS_POLL_DEPS, (action) => {
      if (action.type === "status") {
        dispatch({ type: "status", status: action.status });
      } else {
        dispatch({ type: "failure", message: describeSyncError(action.error) });
      }
    });
  }, []);

  // The `peer_appeared` subscription (R95 item 2's pattern: torn down while
  // this route is hidden, re-primed on show).
  useEffect(() => {
    return startPeerAppearedWatch(PEER_APPEARED_WATCH_DEPS, (peer) => {
      dispatch({ type: "peerAppeared", peer });
    });
  }, []);

  function handleShowCode(): void {
    setShowingCode(true);
    void startPairing()
      .then((code) => setMyCode(code))
      .catch((error: unknown) => {
        dispatch({ type: "failure", message: describeSyncError(error) });
        setShowingCode(false);
      });
  }

  const normalizedCode = normalizePairCode(codeInput);
  const formIssues = validatePairForm(peerIdInput, normalizedCode);
  const formHasErrors = formIssues.length > 0;

  function handlePair(): void {
    if (formHasErrors) {
      return;
    }
    setPairing(true);
    void pairPeer(peerIdInput.trim(), normalizedCode)
      .then((peer) => {
        dispatch({ type: "paired", peer });
        setPeerIdInput("");
        setCodeInput("");
        setMyCode(null);
        setShowingCode(false);
      })
      .catch((error: unknown) => {
        dispatch({ type: "failure", message: describeSyncError(error) });
      })
      .finally(() => {
        setPairing(false);
      });
  }

  function handleUnpair(peerId: string): void {
    void unpairPeer(peerId)
      .then(() => {
        dispatch({ type: "unpaired", peerId });
      })
      .catch((error: unknown) => {
        dispatch({ type: "failure", message: describeSyncError(error) });
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

  const runningPeerId = state.running?.peerId ?? null;

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
                  disabled={isSyncNowDisabled(runningPeerId)}
                >
                  {syncNowButtonLabel(peer.peer_id, runningPeerId)}
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  emphasis="accent"
                  aria-label={`Unpair ${peer.name}`}
                  onClick={() => handleUnpair(peer.peer_id)}
                >
                  <UnlinkIcon aria-hidden />
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

        {state.lastError ? <p className="font-mono text-xs text-brand-accent">{state.lastError}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-mono text-xs uppercase tracking-[var(--tracking-label)] text-fg-dim">Pair a new device</h3>

        <Button type="button" size="sm" onClick={handleShowCode} className="w-fit">
          <LinkIcon aria-hidden />
          Show my code
        </Button>
        {showingCode ? (
          myCode ? (
            <p className="font-mono text-sm text-fg">
              Code: <span className="tracking-[0.2em]">{myCode.code}</span>
            </p>
          ) : (
            <p className="font-mono text-xs text-fg-faint">Minting a code…</p>
          )
        ) : null}

        <label htmlFor="idl1-settings-peer-id" className="font-mono text-xs text-fg-dim">
          Device id
        </label>
        <Input
          id="idl1-settings-peer-id"
          type="text"
          className="max-w-64"
          value={peerIdInput}
          onChange={(event) => setPeerIdInput(event.target.value)}
          placeholder="the id shown on the other device"
        />

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
        {codeInput.length > 0 || peerIdInput.length > 0
          ? formIssues.map((issue) => (
              <p key={issue.path} className="font-mono text-xs text-brand-accent">
                {issue.message}
              </p>
            ))
          : null}
        <Button type="button" emphasis="info" filled onClick={handlePair} disabled={formHasErrors || pairing} className="w-fit">
          {pairButtonLabel(pairing)}
        </Button>
      </div>
    </div>
  );
}

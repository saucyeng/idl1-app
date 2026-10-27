import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { syncSelection, type PeerStatus } from "../../../ipc/sync";
import { describeBackendReason, describeTransferred, onlinePeers, runSelectionSync } from "../Settings/peerLibraryState";
import { depsFor } from "../Settings/SyncSection";
import { startSyncStatusPoll } from "../Settings/syncPoll";

/** What {@link useSessionPush} gives the Data tab. */
export interface SessionPush {
  /** Paired devices online right now (empty hides every push control). */
  targets: PeerStatus[];
  /** True while a push is running. */
  busy: boolean;
  /** Pushes `sessionIds` to `peerId` and raises a success or failure toast. */
  push: (peerId: string, sessionIds: string[]) => void;
}

/** Polls the paired devices while the Data route is visible (the same
 *  route-gated `sync_status` poll the Sync sheet uses) and exposes a push
 *  action over `syncSelection({ direction: "push" })`. A failed poll leaves
 *  the last known list in place. */
export function useSessionPush(): SessionPush {
  const [peers, setPeers] = useState<PeerStatus[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return startSyncStatusPoll(depsFor("data").poll, (action) => {
      if (action.type === "status") setPeers(action.status.paired_peers);
    });
  }, []);

  const push = useCallback(
    (peerId: string, sessionIds: string[]) => {
      if (busy || sessionIds.length === 0) return;
      const name = peers.find((p) => p.peer_id === peerId)?.name ?? "device";
      setBusy(true);
      const toastId = toast.loading(`Pushing to ${name}…`);
      void runSelectionSync(
        { syncSelection, describeError: describeBackendReason },
        peerId,
        { direction: "push", sessions: sessionIds },
        (p) =>
          toast.loading(`Pushing to ${name}…`, {
            id: toastId,
            description: `${p.phase}${p.total !== null ? ` (${p.done}/${p.total})` : ""}`,
          }),
      ).then((outcome) => {
        setBusy(false);
        if (outcome.ok) toast.success(`Pushed to ${name}`, { id: toastId, description: describeTransferred(outcome.result) });
        else toast.error(`Push to ${name} failed`, { id: toastId, description: outcome.message });
      });
    },
    [busy, peers],
  );

  return { targets: onlinePeers(peers), busy, push };
}

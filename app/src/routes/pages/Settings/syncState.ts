import type { DiscoveredPeer, PeerSighting, PeerStatus, Progress, SyncResult, SyncStatus } from "../../../ipc/sync";

/** One paired peer as shown in the Sync section's peer list. Mirrors
 *  `sync.ts`'s {@link PeerStatus} field-for-field (C3 §3.9) — kept as a
 *  separate alias here rather than reused directly so this module's shape
 *  does not silently change if `sync.ts`'s does. */
export type PeerRow = PeerStatus;

/** One unpaired peer as shown in the Sync section's "Nearby devices" list.
 *  Mirrors `sync.ts`'s {@link DiscoveredPeer} field-for-field (C3 §3.9, L11
 *  Task 14). */
export type DiscoveredRow = DiscoveredPeer;

/** A `sync_now` transfer in progress against one peer, tracked across
 *  `Progress` messages (C3 §3.9's mixed blobs+cells count, disambiguated by
 *  `phase`) until the terminating `SyncResult` or a failure clears it. */
export interface RunningSync {
  /** The peer `sync_now` was called against. */
  peerId: string;
  /** Units completed so far — same unit as `Progress.done`, phase-specific. */
  done: number;
  /** Units expected in total, or `null` when not known ahead of time. */
  total: number | null;
  /** Short machine-readable phase name, e.g. "manifest", "blobs", "workbooks". */
  phase: string;
}

/** The Sync section's whole state, threaded through {@link syncStateReducer}. */
export interface SyncState {
  /** The most recent `sync_status` result, or `null` before the first poll
   *  resolves. */
  status: SyncStatus | null;
  /** Paired peers, kept independently of {@link status} so a `pair_peer`
   *  success is reflected immediately without waiting for the next poll. */
  peers: PeerRow[];
  /** Unpaired peers currently visible on the LAN, keyed by `peer_id`. A
   *  `status` poll replaces this wholesale from `SyncStatus.discovered_peers`
   *  (BRIEF-discovered-ts.md's ruling) — that is how an entry ages out, since
   *  an offline peer's sighting stops being reported rather than being
   *  flagged offline. */
  discovered: Record<string, DiscoveredRow>;
  /** The in-flight `sync_now` transfer, or `null` when none is running. */
  running: RunningSync | null;
  /** User-facing text for the most recent failure, or `null` if the last
   *  action (or the last poll) succeeded. Not cleared by a status poll —
   *  only by a later success. */
  lastError: string | null;
}

/** An action fed to {@link syncStateReducer}. One variant per event source:
 *  a `sync_status` poll result, a `sync_now` `Progress` message, a
 *  `SyncResult`, a `pair_peer` success, an `unpair_peer` success, a
 *  `peer_appeared` event, or a failure from any of the above (already
 *  turned into user-facing text via `errors.ts`'s `describeIpcError`). */
export type SyncAction =
  | { type: "status"; status: SyncStatus }
  | { type: "progress"; peerId: string; progress: Progress }
  | { type: "result"; peerId: string; result: SyncResult }
  | { type: "paired"; peer: PeerStatus }
  | { type: "unpaired"; peerId: string }
  | { type: "peerAppeared"; sighting: PeerSighting }
  | { type: "renamed"; name: string }
  | { type: "failure"; message: string };

/** Pure reducer over {@link SyncState}. Never calls IPC itself — the Sync
 *  section dispatches into this after each `syncStatus()`/`syncNow()`/
 *  `pairPeer()` settles, so the state transitions are testable without a
 *  Tauri runtime.
 *
 * @param state - The state before this action.
 * @param action - The event to apply.
 * @returns The next state. */
export function syncStateReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case "status": {
      // A poll must not clobber an in-flight sync's progress (C3 §4: the
      // poll and the transfer are independent channels) — `running` carries
      // forward unchanged.
      const discovered: Record<string, DiscoveredRow> = {};
      for (const d of action.status.discovered_peers) {
        discovered[d.peer_id] = d;
      }
      return {
        ...state,
        status: action.status,
        peers: action.status.paired_peers,
        discovered,
      };
    }
    case "progress": {
      return {
        ...state,
        running: {
          peerId: action.peerId,
          done: action.progress.done,
          total: action.progress.total,
          phase: action.progress.phase,
        },
        lastError: null,
      };
    }
    case "result": {
      void action.peerId;
      void action.result;
      return {
        ...state,
        running: null,
        lastError: null,
      };
    }
    case "paired": {
      const alreadyPresent = state.peers.some((peer) => peer.peer_id === action.peer.peer_id);
      // A peer present in `paired_peers` is never also shown in `discovered`
      // (BRIEF-discovered-ts.md's ruling) — drop it here rather than waiting
      // for the next poll to make the two lists disjoint again.
      const { [action.peer.peer_id]: _dropped, ...discovered } = state.discovered;
      return {
        ...state,
        peers: alreadyPresent
          ? state.peers.map((peer) => (peer.peer_id === action.peer.peer_id ? action.peer : peer))
          : [...state.peers, action.peer],
        discovered,
        lastError: null,
      };
    }
    case "unpaired": {
      return {
        ...state,
        peers: state.peers.filter((peer) => peer.peer_id !== action.peerId),
        lastError: null,
      };
    }
    case "renamed": {
      // `set_sync_device_name` returns the name as stored, so the pane
      // shows it at once rather than waiting up to `POLL_INTERVAL_MS`
      // (ruling R172 — that return value existed for exactly this). A
      // rename before the first poll resolves has no `status` to patch and
      // is simply dropped: the first poll will carry the new name anyway,
      // since the rename is already persisted server-side.
      if (state.status === null) return { ...state, lastError: null };

      return {
        ...state,
        status: { ...state.status, this_device: { ...state.status.this_device, name: action.name } },
        lastError: null,
      };
    }
    case "peerAppeared": {
      // `peer_appeared` (C3 §3.9, L11 Task 14) names either an already-paired
      // peer or one this device has not paired with, tagged by
      // `sighting.status` — this refreshes that one row between polls rather
      // than waiting up to `POLL_INTERVAL_MS` for the next one.
      if (action.sighting.status === "paired") {
        const { status: _status, ...peerStatus } = action.sighting;
        const alreadyPresent = state.peers.some((peer) => peer.peer_id === peerStatus.peer_id);
        return {
          ...state,
          peers: alreadyPresent
            ? state.peers.map((peer) => (peer.peer_id === peerStatus.peer_id ? peerStatus : peer))
            : [...state.peers, peerStatus],
        };
      }

      const { status: _status, ...discoveredPeer } = action.sighting;
      return {
        ...state,
        discovered: { ...state.discovered, [discoveredPeer.peer_id]: discoveredPeer },
      };
    }
    case "failure": {
      return {
        ...state,
        running: null,
        lastError: action.message,
      };
    }
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

/** Describes a `sync_now` result in one sentence for the Sync section, e.g.
 *  "12 blobs, 3 workbooks merged, 2 sessions, 1 track updated, 1 conflict
 *  cell". A non-zero `conflicts` reads as something to go resolve, not as a
 *  failure — LAN sync's per-cell merge (design §7) produces conflict cells
 *  as a normal, visible outcome, not an error state. `sessions_updated`/
 *  `tracks_updated`/`profiles_updated` are only named when non-zero, so a
 *  run that only moved blobs and workbooks reads exactly as it used to
 *  before ruling R102 widened `SyncResult` to six fields.
 *
 * @param result - The `sync_now` return value (C3 §3.9, ruling R102).
 * @returns A one-line, user-facing summary. */
export function describeSyncResult(result: SyncResult): string {
  const parts: string[] = [
    `${result.blobs_transferred} blob${result.blobs_transferred === 1 ? "" : "s"}`,
    `${result.workbooks_merged} workbook${result.workbooks_merged === 1 ? "" : "s"} merged`,
  ];
  if (result.sessions_updated > 0) {
    parts.push(`${result.sessions_updated} session${result.sessions_updated === 1 ? "" : "s"}`);
  }
  if (result.tracks_updated > 0) {
    parts.push(`${result.tracks_updated} track${result.tracks_updated === 1 ? "" : "s"} updated`);
  }
  if (result.profiles_updated > 0) {
    parts.push(`${result.profiles_updated} profile${result.profiles_updated === 1 ? "" : "s"} updated`);
  }

  if (result.conflicts === 0) {
    return `${parts.join(", ")} cleanly.`;
  }

  parts.push(`${result.conflicts} conflict cell${result.conflicts === 1 ? "" : "s"} to resolve`);
  return `${parts.join(", ")}.`;
}

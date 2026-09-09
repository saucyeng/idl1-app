import type { PeerStatus, Progress, SyncResult, SyncStatus } from "../../../ipc/sync";

/** One paired peer as shown in the Sync section's peer list. Mirrors
 *  `sync.ts`'s {@link PeerStatus} field-for-field (C3 §3.9) — kept as a
 *  separate alias here rather than reused directly so this module's shape
 *  does not silently change if `sync.ts`'s does. */
export type PeerRow = PeerStatus;

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
  | { type: "peerAppeared"; peer: PeerStatus }
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
      return {
        ...state,
        status: action.status,
        peers: action.status.paired_peers,
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
      return {
        ...state,
        peers: alreadyPresent
          ? state.peers.map((peer) => (peer.peer_id === action.peer.peer_id ? action.peer : peer))
          : [...state.peers, action.peer],
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
      // `peer_appeared` (C3 §3.9) only ever names an already-paired peer
      // (`state.rs`'s discovery loop skips an unpaired sighting) — this
      // refreshes that one row's `online`/`protocol_version` between polls
      // rather than waiting up to `POLL_INTERVAL_MS` for the next one.
      const alreadyPresent = state.peers.some((peer) => peer.peer_id === action.peer.peer_id);
      return {
        ...state,
        peers: alreadyPresent
          ? state.peers.map((peer) => (peer.peer_id === action.peer.peer_id ? action.peer : peer))
          : [...state.peers, action.peer],
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

import { describe, expect, it } from "vitest";

import {
  describeSyncResult,
  syncStateReducer,
  type SyncState,
} from "./syncState";
import type { PeerStatus, SyncResult } from "../../../ipc/sync";

const initialState: SyncState = {
  status: null,
  peers: [],
  running: null,
  lastError: null,
};

/** A full six-field `SyncResult` (C3 §3.9, ruling R102) with every field
 *  overridable, so each test states only the fields it cares about. */
function syncResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    blobs_transferred: 0,
    workbooks_merged: 0,
    conflicts: 0,
    sessions_updated: 0,
    tracks_updated: 0,
    profiles_updated: 0,
    ...overrides,
  };
}

/** A full `PeerStatus` (C3 §3.9) with every field overridable. */
function peer(overrides: Partial<PeerStatus> & { peer_id: string; name: string }): PeerStatus {
  return { online: true, protocol_version: 1, paired_at_ms: 1_700_000_000_000, ...overrides };
}

describe("syncStateReducer", () => {
  it("syncStateReducer — a sync_status result — peers listed, online flags kept", () => {
    const next = syncStateReducer(initialState, {
      type: "status",
      status: {
        paired_peers: [
          peer({ peer_id: "a", name: "Desktop", online: true }),
          peer({ peer_id: "b", name: "Phone", online: false }),
        ],
        last_sync_utc_ms: 1000,
      },
    });

    expect(next.peers).toEqual([
      peer({ peer_id: "a", name: "Desktop", online: true }),
      peer({ peer_id: "b", name: "Phone", online: false }),
    ]);
    expect(next.status?.last_sync_utc_ms).toBe(1000);
  });

  it("syncStateReducer — a status poll while a sync is running — the running progress is not clobbered", () => {
    const running = { peerId: "a", done: 3, total: 10, phase: "blobs" };
    const runningState: SyncState = { ...initialState, running };

    const next = syncStateReducer(runningState, {
      type: "status",
      status: {
        paired_peers: [peer({ peer_id: "a", name: "Desktop", online: true })],
        last_sync_utc_ms: null,
      },
    });

    expect(next.running).toEqual(running);
  });

  it("syncStateReducer — PROGRESS with phase \"blobs\" — the phase is shown, since done/total mix units (C3 §3.9)", () => {
    const next = syncStateReducer(initialState, {
      type: "progress",
      peerId: "a",
      progress: { done: 4, total: 9, phase: "blobs" },
    });

    expect(next.running).toEqual({
      peerId: "a",
      done: 4,
      total: 9,
      phase: "blobs",
    });
  });

  it("syncStateReducer — PROGRESS with total null — a count without a percentage", () => {
    const next = syncStateReducer(initialState, {
      type: "progress",
      peerId: "a",
      progress: { done: 4, total: null, phase: "manifest" },
    });

    expect(next.running).toEqual({
      peerId: "a",
      done: 4,
      total: null,
      phase: "manifest",
    });
  });

  it("describeSyncResult — conflicts 0, no session/track/profile activity — the summary says merged cleanly", () => {
    const summary = describeSyncResult(syncResult({ blobs_transferred: 12, workbooks_merged: 3 }));

    expect(summary).toMatch(/merged cleanly|no conflicts/i);
    expect(summary).not.toMatch(/session|track|profile/i);
  });

  it("describeSyncResult — sessions/tracks/profiles updated — each is named", () => {
    const summary = describeSyncResult(
      syncResult({ blobs_transferred: 1, workbooks_merged: 0, sessions_updated: 2, tracks_updated: 1, profiles_updated: 1 })
    );

    expect(summary).toMatch(/2 sessions/i);
    expect(summary).toMatch(/1 track updated/i);
    expect(summary).toMatch(/1 profile updated/i);
  });

  it("describeSyncResult — conflicts 2 — the summary names the conflict cells as something to resolve, not as an error", () => {
    const summary = describeSyncResult(syncResult({ blobs_transferred: 12, workbooks_merged: 3, conflicts: 2 }));

    expect(summary).toMatch(/resolve/i);
    expect(summary).not.toMatch(/error|failed/i);
  });

  it("syncStateReducer — a result action — running cleared and lastError cleared", () => {
    const running = { peerId: "a", done: 10, total: 10, phase: "workbooks" };
    const runningState: SyncState = { ...initialState, running, lastError: "earlier problem" };

    const next = syncStateReducer(runningState, {
      type: "result",
      peerId: "a",
      result: syncResult({ blobs_transferred: 12, workbooks_merged: 3 }),
    });

    expect(next.running).toBeNull();
    expect(next.lastError).toBeNull();
  });

  it("syncStateReducer — a failure with kind sync — lastError set, peers retained", () => {
    const peeredState: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop", online: true })],
    };

    const next = syncStateReducer(peeredState, {
      type: "failure",
      message: "LAN sync ran into a problem. Check that both devices are on the same network and try again.",
    });

    expect(next.lastError).toBe(
      "LAN sync ran into a problem. Check that both devices are on the same network and try again."
    );
    expect(next.peers).toEqual([peer({ peer_id: "a", name: "Desktop", online: true })]);
  });

  it("syncStateReducer — pair success — the new peer appears once, even if the poll also returns it", () => {
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop", online: true })],
    };

    const next = syncStateReducer(stateWithPeer, {
      type: "paired",
      peer: peer({ peer_id: "a", name: "Desktop", online: true }),
    });

    expect(next.peers).toEqual([peer({ peer_id: "a", name: "Desktop", online: true })]);
  });

  it("syncStateReducer — pair success for a new peer id — appended to the list", () => {
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop" })],
    };

    const next = syncStateReducer(stateWithPeer, {
      type: "paired",
      peer: peer({ peer_id: "b", name: "Phone" }),
    });

    expect(next.peers.map((p) => p.peer_id)).toEqual(["a", "b"]);
  });

  it("syncStateReducer — unpair success — the peer is dropped and lastError cleared", () => {
    const stateWithPeers: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop" }), peer({ peer_id: "b", name: "Phone" })],
      lastError: "earlier problem",
    };

    const next = syncStateReducer(stateWithPeers, { type: "unpaired", peerId: "a" });

    expect(next.peers.map((p) => p.peer_id)).toEqual(["b"]);
    expect(next.lastError).toBeNull();
  });

  it("syncStateReducer — unpair success for an id not in the list — a no-op", () => {
    const stateWithPeer: SyncState = { ...initialState, peers: [peer({ peer_id: "a", name: "Desktop" })] };

    const next = syncStateReducer(stateWithPeer, { type: "unpaired", peerId: "unknown" });

    expect(next.peers.map((p) => p.peer_id)).toEqual(["a"]);
  });

  it("syncStateReducer — peerAppeared for a known peer — that row's online/protocol_version refresh", () => {
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop", online: false, protocol_version: 1 })],
    };

    const next = syncStateReducer(stateWithPeer, {
      type: "peerAppeared",
      peer: peer({ peer_id: "a", name: "Desktop", online: true, protocol_version: 2 }),
    });

    expect(next.peers).toEqual([peer({ peer_id: "a", name: "Desktop", online: true, protocol_version: 2 })]);
  });

  it("syncStateReducer — peerAppeared for a peer not yet in the list — appended", () => {
    const next = syncStateReducer(initialState, {
      type: "peerAppeared",
      peer: peer({ peer_id: "a", name: "Desktop" }),
    });

    expect(next.peers.map((p) => p.peer_id)).toEqual(["a"]);
  });
});

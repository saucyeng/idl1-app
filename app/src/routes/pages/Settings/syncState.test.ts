import { describe, expect, it } from "vitest";

import {
  describeSyncResult,
  syncStateReducer,
  type SyncState,
} from "./syncState";
import type { DiscoveredPeer, PeerStatus, SyncResult, SyncStatus } from "../../../ipc/sync";

const initialState: SyncState = {
  status: null,
  peers: [],
  discovered: {},
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

/** A full `DiscoveredPeer` (C3 §3.9, L11 Task 14) with every field
 *  overridable. */
function discoveredPeer(overrides: Partial<DiscoveredPeer> & { peer_id: string }): DiscoveredPeer {
  return { name: "Pit Tablet", protocol_version: 1, address: "192.168.1.5", port: 4123, ...overrides };
}

describe("syncStateReducer", () => {
  it("syncStateReducer — a sync_status result — peers listed, online flags kept", () => {
    // Arrange
    const status = {
      paired_peers: [
        peer({ peer_id: "a", name: "Desktop", online: true }),
        peer({ peer_id: "b", name: "Phone", online: false }),
      ],
      discovered_peers: [],
      last_sync_utc_ms: 1000,
      this_device: { peer_id: "self", name: "This machine" },
    };

    // Act
    const next = syncStateReducer(initialState, { type: "status", status });

    // Assert
    expect(next.peers).toEqual([
      peer({ peer_id: "a", name: "Desktop", online: true }),
      peer({ peer_id: "b", name: "Phone", online: false }),
    ]);
    expect(next.status?.last_sync_utc_ms).toBe(1000);
  });

  it("syncStateReducer — a rename after a poll — this_device.name updates without waiting for the next poll", () => {
    // Arrange
    const status: SyncStatus = {
      paired_peers: [],
      discovered_peers: [],
      last_sync_utc_ms: null,
      this_device: { peer_id: "self", name: "old-name" },
    };
    const polled = syncStateReducer(initialState, { type: "status", status });

    // Act
    const next = syncStateReducer(polled, { type: "renamed", name: "Pit laptop" });

    // Assert
    expect(next.status?.this_device).toEqual({ peer_id: "self", name: "Pit laptop" });
  });

  it("syncStateReducer — a rename before the first poll resolves — dropped, no synthetic status", () => {
    // Arrange — `status` is null until the first poll lands.

    // Act
    const next = syncStateReducer(initialState, { type: "renamed", name: "Pit laptop" });

    // Assert — the rename is persisted server-side, so the first poll
    // carries it; inventing a status here would fabricate a peer_id.
    expect(next.status).toBeNull();
  });

  it("syncStateReducer — a status poll while a sync is running — the running progress is not clobbered", () => {
    // Arrange
    const running = { peerId: "a", done: 3, total: 10, phase: "blobs" };
    const runningState: SyncState = { ...initialState, running };

    // Act
    const next = syncStateReducer(runningState, {
      type: "status",
      status: {
        paired_peers: [peer({ peer_id: "a", name: "Desktop", online: true })],
        discovered_peers: [],
        last_sync_utc_ms: null,
        this_device: { peer_id: "self", name: "This machine" },
      },
    });

    // Assert
    expect(next.running).toEqual(running);
  });

  it("syncStateReducer — PROGRESS with phase \"blobs\" — the phase is shown, since done/total mix units (C3 §3.9)", () => {
    // Act
    const next = syncStateReducer(initialState, {
      type: "progress",
      peerId: "a",
      progress: { done: 4, total: 9, phase: "blobs" },
    });

    // Assert
    expect(next.running).toEqual({
      peerId: "a",
      done: 4,
      total: 9,
      phase: "blobs",
    });
  });

  it("syncStateReducer — PROGRESS with total null — a count without a percentage", () => {
    // Act
    const next = syncStateReducer(initialState, {
      type: "progress",
      peerId: "a",
      progress: { done: 4, total: null, phase: "manifest" },
    });

    // Assert
    expect(next.running).toEqual({
      peerId: "a",
      done: 4,
      total: null,
      phase: "manifest",
    });
  });

  it("describeSyncResult — conflicts 0, no session/track/profile activity — the summary says merged cleanly", () => {
    // Arrange
    const result = syncResult({ blobs_transferred: 12, workbooks_merged: 3 });

    // Act
    const summary = describeSyncResult(result);

    // Assert
    expect(summary).toMatch(/merged cleanly|no conflicts/i);
    expect(summary).not.toMatch(/session|track|profile/i);
  });

  it("describeSyncResult — sessions/tracks/profiles updated — each is named", () => {
    // Arrange
    const result = syncResult({
      blobs_transferred: 1,
      workbooks_merged: 0,
      sessions_updated: 2,
      tracks_updated: 1,
      profiles_updated: 1,
    });

    // Act
    const summary = describeSyncResult(result);

    // Assert
    expect(summary).toMatch(/2 sessions/i);
    expect(summary).toMatch(/1 track updated/i);
    expect(summary).toMatch(/1 profile updated/i);
  });

  it("describeSyncResult — conflicts 2 — the summary names the conflict cells as something to resolve, not as an error", () => {
    // Arrange
    const result = syncResult({ blobs_transferred: 12, workbooks_merged: 3, conflicts: 2 });

    // Act
    const summary = describeSyncResult(result);

    // Assert
    expect(summary).toMatch(/resolve/i);
    expect(summary).not.toMatch(/error|failed/i);
  });

  it("syncStateReducer — a result action — running cleared and lastError cleared", () => {
    // Arrange
    const running = { peerId: "a", done: 10, total: 10, phase: "workbooks" };
    const runningState: SyncState = { ...initialState, running, lastError: "earlier problem" };

    // Act
    const next = syncStateReducer(runningState, {
      type: "result",
      peerId: "a",
      result: syncResult({ blobs_transferred: 12, workbooks_merged: 3 }),
    });

    // Assert
    expect(next.running).toBeNull();
    expect(next.lastError).toBeNull();
  });

  it("syncStateReducer — a failure with kind sync — lastError set, peers retained", () => {
    // Arrange
    const peeredState: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop", online: true })],
    };

    // Act
    const next = syncStateReducer(peeredState, {
      type: "failure",
      message: "LAN sync ran into a problem. Check that both devices are on the same network and try again.",
    });

    // Assert
    expect(next.lastError).toBe(
      "LAN sync ran into a problem. Check that both devices are on the same network and try again."
    );
    expect(next.peers).toEqual([peer({ peer_id: "a", name: "Desktop", online: true })]);
  });

  it("syncStateReducer — pair success — the new peer appears once, even if the poll also returns it", () => {
    // Arrange
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop", online: true })],
    };

    // Act
    const next = syncStateReducer(stateWithPeer, {
      type: "paired",
      peer: peer({ peer_id: "a", name: "Desktop", online: true }),
    });

    // Assert
    expect(next.peers).toEqual([peer({ peer_id: "a", name: "Desktop", online: true })]);
  });

  it("syncStateReducer — pair success for a new peer id — appended to the list", () => {
    // Arrange
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop" })],
    };

    // Act
    const next = syncStateReducer(stateWithPeer, {
      type: "paired",
      peer: peer({ peer_id: "b", name: "Phone" }),
    });

    // Assert
    expect(next.peers.map((p) => p.peer_id)).toEqual(["a", "b"]);
  });

  it("syncStateReducer — unpair success — the peer is dropped and lastError cleared", () => {
    // Arrange
    const stateWithPeers: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop" }), peer({ peer_id: "b", name: "Phone" })],
      lastError: "earlier problem",
    };

    // Act
    const next = syncStateReducer(stateWithPeers, { type: "unpaired", peerId: "a" });

    // Assert
    expect(next.peers.map((p) => p.peer_id)).toEqual(["b"]);
    expect(next.lastError).toBeNull();
  });

  it("syncStateReducer — unpair success for an id not in the list — a no-op", () => {
    // Arrange
    const stateWithPeer: SyncState = { ...initialState, peers: [peer({ peer_id: "a", name: "Desktop" })] };

    // Act
    const next = syncStateReducer(stateWithPeer, { type: "unpaired", peerId: "unknown" });

    // Assert
    expect(next.peers.map((p) => p.peer_id)).toEqual(["a"]);
  });

  it("syncStateReducer — peerAppeared, status paired, for a known peer — that row's online/protocol_version refresh", () => {
    // Arrange
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [peer({ peer_id: "a", name: "Desktop", online: false, protocol_version: 1 })],
    };

    // Act
    const next = syncStateReducer(stateWithPeer, {
      type: "peerAppeared",
      sighting: { status: "paired", ...peer({ peer_id: "a", name: "Desktop", online: true, protocol_version: 2 }) },
    });

    // Assert
    expect(next.peers).toEqual([peer({ peer_id: "a", name: "Desktop", online: true, protocol_version: 2 })]);
  });

  it("syncStateReducer — peerAppeared, status paired, for a peer not yet in the list — appended", () => {
    // Act
    const next = syncStateReducer(initialState, {
      type: "peerAppeared",
      sighting: { status: "paired", ...peer({ peer_id: "a", name: "Desktop" }) },
    });

    // Assert
    expect(next.peers.map((p) => p.peer_id)).toEqual(["a"]);
  });

  it("syncStateReducer — peerAppeared, status discovered, for a new sighting — added to discovered, not peers", () => {
    // Act
    const next = syncStateReducer(initialState, {
      type: "peerAppeared",
      sighting: { status: "discovered", ...discoveredPeer({ peer_id: "c", name: "Kitchen laptop" }) },
    });

    // Assert
    expect(next.discovered).toEqual({ c: discoveredPeer({ peer_id: "c", name: "Kitchen laptop" }) });
    expect(next.peers).toEqual([]);
  });

  it("syncStateReducer — peerAppeared, status discovered, for an existing entry — that entry's fields refresh (R176)", () => {
    // Arrange
    const stateWithDiscovered: SyncState = {
      ...initialState,
      discovered: { c: discoveredPeer({ peer_id: "c", name: "Old name" }) },
    };

    // Act
    const next = syncStateReducer(stateWithDiscovered, {
      type: "peerAppeared",
      sighting: { status: "discovered", ...discoveredPeer({ peer_id: "c", name: "New name" }) },
    });

    // Assert
    expect(next.discovered).toEqual({ c: discoveredPeer({ peer_id: "c", name: "New name" }) });
  });

  it("syncStateReducer — pair success for a peer that was in discovered — dropped from discovered", () => {
    // Arrange
    const stateWithDiscovered: SyncState = {
      ...initialState,
      discovered: { a: discoveredPeer({ peer_id: "a", name: "Desktop" }) },
    };

    // Act
    const next = syncStateReducer(stateWithDiscovered, {
      type: "paired",
      peer: peer({ peer_id: "a", name: "Desktop" }),
    });

    // Assert
    expect(next.discovered).toEqual({});
    expect(next.peers.map((p) => p.peer_id)).toEqual(["a"]);
  });

  it("syncStateReducer — a status poll — discovered_peers replaces `discovered` wholesale, dropping stale entries", () => {
    // Arrange — a peer seen via an earlier peerAppeared event...
    const seen = syncStateReducer(initialState, {
      type: "peerAppeared",
      sighting: { status: "discovered", ...discoveredPeer({ peer_id: "stale", name: "Gone now" }) },
    });

    // Act — ...that the next poll no longer reports (it went offline, which
    // emits nothing — the poll result is the only way it ages out).
    const next = syncStateReducer(seen, {
      type: "status",
      status: {
        paired_peers: [],
        discovered_peers: [discoveredPeer({ peer_id: "fresh", name: "Still here" })],
        last_sync_utc_ms: null,
        this_device: { peer_id: "self", name: "This machine" },
      },
    });

    // Assert
    expect(next.discovered).toEqual({ fresh: discoveredPeer({ peer_id: "fresh", name: "Still here" }) });
  });
});

import { describe, expect, it } from "vitest";

import {
  describeSyncResult,
  syncStateReducer,
  type SyncState,
} from "./syncState";

const initialState: SyncState = {
  status: null,
  peers: [],
  running: null,
  lastError: null,
};

describe("syncStateReducer", () => {
  it("syncStateReducer — a sync_status result — peers listed, online flags kept", () => {
    const next = syncStateReducer(initialState, {
      type: "status",
      status: {
        paired_peers: [
          { peer_id: "a", name: "Desktop", online: true },
          { peer_id: "b", name: "Phone", online: false },
        ],
        last_sync_utc_ms: 1000,
      },
    });

    expect(next.peers).toEqual([
      { peer_id: "a", name: "Desktop", online: true },
      { peer_id: "b", name: "Phone", online: false },
    ]);
    expect(next.status?.last_sync_utc_ms).toBe(1000);
  });

  it("syncStateReducer — a status poll while a sync is running — the running progress is not clobbered", () => {
    const running = { peerId: "a", done: 3, total: 10, phase: "blobs" };
    const runningState: SyncState = { ...initialState, running };

    const next = syncStateReducer(runningState, {
      type: "status",
      status: {
        paired_peers: [{ peer_id: "a", name: "Desktop", online: true }],
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

  it("syncStateReducer — a SyncResult with conflicts 0 — the summary says merged cleanly", () => {
    const summary = describeSyncResult({
      blobs_transferred: 12,
      workbooks_merged: 3,
      conflicts: 0,
    });

    expect(summary).toMatch(/merged cleanly|no conflicts/i);
  });

  it("syncStateReducer — a SyncResult with conflicts 2 — the summary names the conflict cells as something to resolve, not as an error", () => {
    const summary = describeSyncResult({
      blobs_transferred: 12,
      workbooks_merged: 3,
      conflicts: 2,
    });

    expect(summary).toMatch(/resolve/i);
    expect(summary).not.toMatch(/error|failed/i);
  });

  it("syncStateReducer — a result action — running cleared and lastError cleared", () => {
    const running = { peerId: "a", done: 10, total: 10, phase: "workbooks" };
    const runningState: SyncState = { ...initialState, running, lastError: "earlier problem" };

    const next = syncStateReducer(runningState, {
      type: "result",
      peerId: "a",
      result: { blobs_transferred: 12, workbooks_merged: 3, conflicts: 0 },
    });

    expect(next.running).toBeNull();
    expect(next.lastError).toBeNull();
  });

  it("syncStateReducer — a failure with kind sync — lastError set, peers retained", () => {
    const peeredState: SyncState = {
      ...initialState,
      peers: [{ peer_id: "a", name: "Desktop", online: true }],
    };

    const next = syncStateReducer(peeredState, {
      type: "failure",
      message: "LAN sync ran into a problem. Check that both devices are on the same network and try again.",
    });

    expect(next.lastError).toBe(
      "LAN sync ran into a problem. Check that both devices are on the same network and try again."
    );
    expect(next.peers).toEqual([{ peer_id: "a", name: "Desktop", online: true }]);
  });

  it("syncStateReducer — pair success — the new peer appears once, even if the poll also returns it", () => {
    const stateWithPeer: SyncState = {
      ...initialState,
      peers: [{ peer_id: "a", name: "Desktop", online: true }],
    };

    const next = syncStateReducer(stateWithPeer, {
      type: "paired",
      peer: { peer_id: "a", name: "Desktop", online: true },
    });

    expect(next.peers).toEqual([{ peer_id: "a", name: "Desktop", online: true }]);
  });
});

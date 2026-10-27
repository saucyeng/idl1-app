import { describe, expect, it, vi } from "vitest";

import type { PeerLibrary, PeerStatus, Progress, SyncResult, SyncSelection } from "../../../ipc/sync";
import {
  AUTO_SYNC_OPTIONS,
  autoSyncLabel,
  describeBackendReason,
  describeTransferred,
  libraryLoadReducer,
  onlinePeers,
  runSelectionSync,
  type LibraryLoadState,
} from "./peerLibraryState";

const emptyLibrary: PeerLibrary = { schema_version: 1, sessions: [], workbooks: [] };

function result(overrides: Partial<SyncResult> = {}): SyncResult {
  return {
    blobs_transferred: 0,
    workbooks_merged: 0,
    conflicts: 0,
    sessions_updated: 0,
    tracks_updated: 0,
    profiles_updated: 0,
    bike_log_updated: 0,
    blob_bytes: 0,
    session_bytes: 0,
    workbook_bytes: 0,
    track_bytes: 0,
    profile_bytes: 0,
    bike_log_bytes: 0,
    elapsed_ms: 0,
    ...overrides,
  };
}

function peer(id: string, online: boolean): PeerStatus {
  return { peer_id: id, name: id, online, protocol_version: 1, paired_at_ms: 0, auto_sync: "off" };
}

describe("libraryLoadReducer", () => {
  it("libraryLoadReducer — loaded after loading — holds the library", () => {
    const state: LibraryLoadState = { status: "loading" };

    const next = libraryLoadReducer(state, { type: "loaded", library: emptyLibrary });

    expect(next).toEqual({ status: "ready", library: emptyLibrary });
  });

  it("libraryLoadReducer — failed — keeps the backend reason", () => {
    const next = libraryLoadReducer({ status: "loading" }, { type: "failed", message: "peer is still indexing" });

    expect(next).toEqual({ status: "error", message: "peer is still indexing" });
  });

  it("libraryLoadReducer — refresh while ready — keeps showing the old library", () => {
    const state: LibraryLoadState = { status: "ready", library: emptyLibrary };

    const next = libraryLoadReducer(state, { type: "refreshing" });

    expect(next).toEqual({ status: "ready", library: emptyLibrary });
  });

  it("libraryLoadReducer — refresh from error — goes back to loading", () => {
    const next = libraryLoadReducer({ status: "error", message: "x" }, { type: "refreshing" });

    expect(next).toEqual({ status: "loading" });
  });
});

describe("runSelectionSync", () => {
  it("runSelectionSync — success — returns the result and forwards progress", async () => {
    const progress: Progress[] = [];
    const sync = vi.fn(async (_peer: string, _sel: SyncSelection, onProgress: (p: Progress) => void) => {
      onProgress({ done: 1, total: 2, phase: "sessions" });
      return result({ sessions_updated: 2 });
    });
    const selection: SyncSelection = { direction: "pull", sessions: ["a"], workbooks: [] };

    const outcome = await runSelectionSync({ syncSelection: sync, describeError: () => "x" }, "p1", selection, (p) => progress.push(p));

    expect(outcome).toEqual({ ok: true, result: result({ sessions_updated: 2 }) });
    expect(sync).toHaveBeenCalledWith("p1", selection, expect.any(Function));
    expect(progress).toEqual([{ done: 1, total: 2, phase: "sessions" }]);
  });

  it("runSelectionSync — rejection — returns the described reason instead of throwing", async () => {
    const sync = vi.fn(async () => {
      throw { kind: "sync", message: "peer went away" };
    });

    const outcome = await runSelectionSync(
      { syncSelection: sync, describeError: (e) => (e as { message: string }).message },
      "p1",
      { direction: "push", sessions: ["a"] },
      () => {},
    );

    expect(outcome).toEqual({ ok: false, message: "peer went away" });
  });
});

describe("describeTransferred", () => {
  it("describeTransferred — sessions and workbooks — names counts and size", () => {
    const text = describeTransferred(result({ sessions_updated: 2, workbooks_merged: 1, session_bytes: 3 * 1024 * 1024 }));

    expect(text).toBe("2 sessions, 1 workbook · 3 MB");
  });

  it("describeTransferred — nothing moved — says so", () => {
    const text = describeTransferred(result());

    expect(text).toBe("Nothing new to transfer");
  });

  it("describeTransferred — one session — is singular", () => {
    const text = describeTransferred(result({ sessions_updated: 1 }));

    expect(text).toBe("1 session · 0 MB");
  });
});

describe("onlinePeers / autoSync", () => {
  it("onlinePeers — mixed — keeps only online peers", () => {
    const peers = [peer("a", true), peer("b", false), peer("c", true)];

    const online = onlinePeers(peers);

    expect(online.map((p) => p.peer_id)).toEqual(["a", "c"]);
  });

  it("AUTO_SYNC_OPTIONS — order — is Off, Send new, Mirror", () => {
    const labels = AUTO_SYNC_OPTIONS.map((o) => o.label);

    expect(labels).toEqual(["Off", "Send new", "Mirror"]);
  });

  it("autoSyncLabel — each rule — maps to its option label", () => {
    const labels = (["off", "send_new", "mirror"] as const).map(autoSyncLabel);

    expect(labels).toEqual(["Off", "Send new", "Mirror"]);
  });
});

describe("describeBackendReason", () => {
  it("describeBackendReason — IPC error shape — returns the backend message", () => {
    const text = describeBackendReason({ kind: "sync", message: "peer is still indexing" });

    expect(text).toBe("peer is still indexing");
  });

  it("describeBackendReason — no message — falls back to generic text", () => {
    const texts = [describeBackendReason(null), describeBackendReason({ kind: "x", message: " " }), describeBackendReason("boom")];

    expect(texts).toEqual(Array(3).fill("Something unexpected happened. Please try again."));
  });
});

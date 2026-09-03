import { Channel, invoke } from "@tauri-apps/api/core";

// L11 (LAN sync) is wave 2 — no Rust command backs this module yet. Typed
// per C3 §3.9 so the shape is fixed and L11 has nothing to design here, only
// to make these calls succeed.

/** Progress payload streamed by long-running commands (C3 §1). */
export interface Progress {
  /** Units completed so far. Meaning is phase-specific — for `syncNow`, a
   *  mixed blobs+cells count; `phase` disambiguates. */
  done: number;
  /** Units expected in total, or null when not known ahead of time. Same
   *  unit as `done`. */
  total: number | null;
  /** Short machine-readable phase name, e.g. "manifest", "blobs",
   *  "workbooks" for `syncNow`. Not localized. */
  phase: string;
}

/** One paired peer's current status (C3 §3.9). */
export interface PeerStatus {
  peer_id: string;
  name: string;
  /** currently visible on the LAN via mDNS */
  online: boolean;
}

/** `sync_status`'s return (C3 §3.9). */
export interface SyncStatus {
  paired_peers: PeerStatus[];
  /** i64, null if never synced */
  last_sync_utc_ms: number | null;
}

/** `sync_now`'s return (C3 §3.9). */
export interface SyncResult {
  /** u32 */
  blobs_transferred: number;
  /** u32 */
  workbooks_merged: number;
  /** u32, conflict cells created (design §7 per-cell merge) */
  conflicts: number;
}

/** Reads the current sync status (C3 §3.9). Periodic poll on a timer, not
 *  per-frame. */
export async function syncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_status");
}

/** Syncs with `peerId` (C3 §3.9). `Progress.done`/`.total` are a mixed
 *  blobs+cells count; `phase` disambiguates ("manifest", "blobs",
 *  "workbooks"). */
export async function syncNow(
  peerId: string,
  onProgress: (p: Progress) => void
): Promise<SyncResult> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<SyncResult>("sync_now", { peerId, progress });
}

/** Pairs with a peer using its 6-digit pairing code (design §7, C3 §3.9). */
export async function pairPeer(code: string): Promise<PeerStatus> {
  return invoke<PeerStatus>("pair_peer", { code });
}

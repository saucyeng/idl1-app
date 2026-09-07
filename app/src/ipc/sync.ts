import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// C3 §3.9, brought up to the L11-landed Rust commands
// (`rust/tauri/src/commands/sync.rs`): `startPairing`, `pairPeer`,
// `unpairPeer`, `syncNow`, `syncStatus`, `PeerStatus` and the six-field
// `SyncResult`. Field names below are byte-exact to the Rust serde output —
// checked against `sync.rs`'s `PeerStatusDto`/`SyncStatusDto`/
// `SyncResultDto`/`PairingOfferDto`.

/** Progress payload streamed by long-running commands (C3 §1). */
export interface Progress {
  /** Units completed so far. Meaning is phase-specific — for `syncNow`, a
   *  mixed blobs+cells count; `phase` disambiguates. */
  done: number;
  /** Units expected in total, or null when not known ahead of time. Same
   *  unit as `done`. */
  total: number | null;
  /** Short machine-readable phase name: "manifest" | "blobs" | "sessions" |
   *  "workbooks" | "tracks" | "profiles" for `syncNow`. Not localized. */
  phase: string;
}

/** One paired peer's current status (C3 §3.9). */
export interface PeerStatus {
  peer_id: string;
  name: string;
  /** Currently visible on the LAN via mDNS. */
  online: boolean;
  /** u32, the peer's `/idl1/v1`-style mDNS `v=` value at pairing time. A
   *  peer advertising a `v` this build does not speak is listed
   *  incompatible rather than omitted. */
  protocol_version: number;
  /** i64, ms since epoch when pairing completed. */
  paired_at_ms: number;
}

/** `sync_status`'s return (C3 §3.9). */
export interface SyncStatus {
  paired_peers: PeerStatus[];
  /** i64, null if never synced */
  last_sync_utc_ms: number | null;
}

/** `sync_now`'s return (C3 §3.9, all six fields per ruling R102). */
export interface SyncResult {
  /** u32, successful `Blob` transfers this run, pull and push combined.
   *  Content-addressed session channels (`Derived`) and `data.parquet` are
   *  counted under `sessions_updated` instead. */
  blobs_transferred: number;
  /** u32, workbooks installed locally by a pull this run. A push's merge
   *  happens on the peer and is not observed here. */
  workbooks_merged: number;
  /** u32, conflict cells created across every workbook merge this run
   *  (design §7 per-cell merge). */
  conflicts: number;
  /** u32, distinct session ids that had at least one successful
   *  `data.parquet`, derived-channel, or `session.json` transfer this run
   *  (pull or push). */
  sessions_updated: number;
  /** u32, successful `Track` transfers this run, pull and push combined. */
  tracks_updated: number;
  /** u32, successful `Profile` transfers this run, pull and push
   *  combined. */
  profiles_updated: number;
}

/** `start_pairing`'s return (C3 §3.9's `PairingCode`). */
export interface PairingCode {
  /** Six decimal digits, leading zeros preserved. */
  code: string;
  /** i64, ms since epoch after which the code no longer redeems. */
  expires_at_ms: number;
}

/** Reads the current sync status (C3 §3.9). Periodic poll on a timer, not
 *  per-frame. */
export async function syncStatus(): Promise<SyncStatus> {
  return invoke<SyncStatus>("sync_status");
}

/** Syncs with `peerId` (C3 §3.9). `Progress.done`/`.total` are a mixed
 *  blobs+cells count; `phase` disambiguates ("manifest", "blobs",
 *  "sessions", "workbooks", "tracks", "profiles"). */
export async function syncNow(
  peerId: string,
  onProgress: (p: Progress) => void
): Promise<SyncResult> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  return invoke<SyncResult>("sync_now", { peerId, progress });
}

/** Mints a single-use, short-lived pairing code on this side so the other
 *  side can call `pairPeer(peerId, code)` against it (C3 §3.9). Pairing is
 *  symmetric: either side presses "Show code", the other types it. */
export async function startPairing(): Promise<PairingCode> {
  return invoke<PairingCode>("start_pairing");
}

/** Pairs with `peerId` — the specific discovered peer currently showing
 *  `code` on its own screen — using its 6-digit pairing code (design §7,
 *  C3 §3.9, ruling R104). Never guesses which online peer offered the
 *  code: `peerId` names it explicitly. */
export async function pairPeer(peerId: string, code: string): Promise<PeerStatus> {
  return invoke<PeerStatus>("pair_peer", { peerId, code });
}

/** Forgets a paired peer: discards its stored token and drops it from
 *  `syncStatus`'s `paired_peers` list (C3 §3.9). */
export async function unpairPeer(peerId: string): Promise<void> {
  return invoke<void>("unpair_peer", { peerId });
}

/** Subscribes to the `peer_appeared` app event (C3 §3.9): fires whenever a
 *  `PeerStatus`-bearing peer newly becomes visible on the LAN. Not attached
 *  to any command's `Channel` — mDNS discovery runs continuously in
 *  background state, independent of any one call's lifetime. Returns the
 *  unlisten function; call it to stop receiving events (e.g. when the
 *  Settings route is hidden, R95). */
export async function onPeerAppeared(onEvent: (p: PeerStatus) => void): Promise<UnlistenFn> {
  return listen<PeerStatus>("peer_appeared", (event) => onEvent(event.payload));
}

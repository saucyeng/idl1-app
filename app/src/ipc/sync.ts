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

/** This device's own sync identity, as peers see it (C3 §3.9, ruling
 *  R172). Both fields are non-optional: the identity is minted on first
 *  launch, so there is no state in which it is absent. */
export interface ThisDevice {
  /** This device's stable wire id. Reported here rather than guessed by
   *  the app (ruling R104) — pairing two of your own machines means
   *  reading this off the other one's screen. */
  peer_id: string;
  /** This device's display name, as sent in outgoing pair requests and as
   *  last set by {@link setSyncDeviceName}. */
  name: string;
}

/** One peer visible on the LAN via mDNS that this device has not paired
 *  with (C3 §3.9, L11 Task 14). Lets a Settings pane prefill `peerId` for
 *  {@link pairPeer} (ruling R104) instead of Isaac typing a 32-character id
 *  read off another screen. Byte-exact to `rust/tauri/src/commands/sync.rs`'s
 *  `DiscoveredPeerDto`. */
export interface DiscoveredPeer {
  peer_id: string;
  /** Display name advertised by the peer. May be empty. */
  name: string;
  /** u32, the peer's mDNS TXT-record `v` value, as broadcast (may differ
   *  from this device's own protocol version). Not gated in TS — Rust is
   *  the authority on compatibility and {@link pairPeer} fails typed if the
   *  versions are incompatible; this is shown as text only. */
  protocol_version: number;
  /** IP address the peer's sync server was last seen at. */
  address: string;
  /** u16, port the peer's sync server was last seen at. */
  port: number;
}

/** `sync_status`'s return (C3 §3.9). */
export interface SyncStatus {
  paired_peers: PeerStatus[];
  /** Peers currently visible on the LAN via mDNS that are NOT in
   *  `paired_peers` (L11 Task 14). Disjoint from `paired_peers` by
   *  construction — a peer that is paired appears there and only there.
   *  This is the source of truth for the nearby-devices list: each poll
   *  replaces it wholesale, which is how an entry ages out (an offline
   *  peer's sighting simply stops being reported). */
  discovered_peers: DiscoveredPeer[];
  /** i64, null if never synced */
  last_sync_utc_ms: number | null;
  /** This device's own id and name (ruling R172). */
  this_device: ThisDevice;
}

/** One LAN sighting as delivered by `peer_appeared` (C3 §3.9, L11 Task 14):
 *  either an already-paired peer or one this device has not paired with,
 *  distinguished by `status` so a listener never needs a second
 *  `sync_status` call to tell the two apart. Byte-exact to
 *  `rust/tauri/src/commands/sync.rs`'s `PeerSightingDto`. Emits on
 *  appearance or field change, never on an identical re-resolve (R176);
 *  offline emits nothing. */
export type PeerSighting =
  | ({ status: "paired" } & PeerStatus)
  | ({ status: "discovered" } & DiscoveredPeer);

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

/** Renames this device (C3 §3.9, ruling R105/R172): persists the new name
 *  and updates what future pair requests announce. Returns the name as
 *  stored, so a caller can render it immediately rather than waiting for
 *  the next `sync_status` poll.
 *
 *  **Not retroactive.** An already-paired peer keeps the name it copied
 *  into its own peer file at pairing time; changing that would need a wire
 *  message this contract does not define. A UI offering the rename has to
 *  say so.
 *
 *  Rejects a blank or whitespace-only name with `invalid_argument` — once
 *  the user has explicitly chosen to rename, there is no sensible default
 *  to silently apply (unlike the hostname seed used on first launch). */
export async function setSyncDeviceName(name: string): Promise<string> {
  return invoke<string>("set_sync_device_name", { name });
}

/** Subscribes to the `peer_appeared` app event (C3 §3.9): fires whenever a
 *  peer newly becomes visible on the LAN, or an already-visible peer's
 *  fields change (R176) — paired or not (L11 Task 14's widened
 *  {@link PeerSighting}). Not attached to any command's `Channel` — mDNS
 *  discovery runs continuously in background state, independent of any one
 *  call's lifetime. Returns the unlisten function; call it to stop
 *  receiving events (e.g. when the Settings route is hidden, R95). */
export async function onPeerAppeared(onEvent: (p: PeerSighting) => void): Promise<UnlistenFn> {
  return listen<PeerSighting>("peer_appeared", (event) => onEvent(event.payload));
}

import type { ValidationIssue } from "./dataDir";
import { validatePairCode } from "./pairCode";

/** Validates a peer id typed into the pairing form. C3 §3.9's `pair_peer`
 *  takes `(peer_id, code)` — ruling R104 — and this UI has no command or
 *  event that enumerates *unpaired* peers currently on the LAN (`sync_status`
 *  lists only paired peers; `peer_appeared` fires only for a sighting that is
 *  already paired, per `state.rs`'s discovery loop) — so the peer id is a
 *  field the user types, read off the other device's own pairing screen,
 *  rather than a row picked from a discovered-peer list. R104 forbids
 *  guessing it, which this satisfies: there is no default and no fallback,
 *  only "empty is an error".
 *
 * @param peerId - The raw peer-id field value.
 * @returns Zero or more issues. Empty means non-blank. */
export function validatePeerId(peerId: string): ValidationIssue[] {
  if (peerId.trim().length === 0) {
    return [
      {
        path: "peerId",
        severity: "error",
        message: "Enter the device id shown on the other device's pairing screen.",
      },
    ];
  }
  return [];
}

/** Validates the whole pairing form (peer id plus code) before `pairPeer` is
 *  called — client-side, mirroring the same rule C3 §3.9's `pair_peer`
 *  applies server-side (`invalid_argument` for a malformed code) so a typo
 *  never becomes a round trip.
 *
 * @param peerId - The raw peer-id field value.
 * @param code - The raw pairing-code field value (not yet normalized).
 * @returns Zero or more issues across both fields; empty means the form is
 *  submittable. */
export function validatePairForm(peerId: string, code: string): ValidationIssue[] {
  return [...validatePeerId(peerId), ...validatePairCode(code)];
}

/** The pairing button's label for its current state — a pure mapping so the
 *  component itself holds no branching text. */
export function pairButtonLabel(pairing: boolean): string {
  return pairing ? "Pairing…" : "Pair";
}

/** The "Sync now" button's label for one peer row. `runningPeerId` is
 *  `SyncState.running`'s single slot (this section tracks one manual run at
 *  a time, matching the landed reducer shape) — the row whose peer matches
 *  it reads "Syncing…"; every other row reads "Sync now" regardless of
 *  whether a different peer's run is in flight.
 *
 * @param peerId - The peer this row's button belongs to.
 * @param runningPeerId - The peer id of the in-flight run, or `null`. */
export function syncNowButtonLabel(peerId: string, runningPeerId: string | null): string {
  return runningPeerId === peerId ? "Syncing…" : "Sync now";
}

/** Whether the "Sync now" button for `peerId` should be disabled: while any
 *  run is in flight at all. `SyncState.running` is a single slot (one
 *  manual run tracked at a time), so a run against one peer disables every
 *  row's button, not only its own — starting a second `sync_now` before the
 *  first settles would have no `running` slot left to track it.
 *
 * @param runningPeerId - The peer id of the in-flight run, or `null`. */
export function isSyncNowDisabled(runningPeerId: string | null): boolean {
  return runningPeerId !== null;
}

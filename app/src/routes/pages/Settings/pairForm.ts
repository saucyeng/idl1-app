import type { PairingCode } from "../../../ipc/sync";
import type { ValidationIssue } from "./dataDir";
import { validatePairCode } from "./pairCode";

/** Validates a peer id typed into the pairing form. C3 §3.9's `pair_peer`
 *  takes `(peer_id, code)` — ruling R104. `SyncSection.tsx`'s "Nearby
 *  devices" list (L11 Task 14) can prefill this field from a discovered
 *  sighting, but never pairs on click — the field stays a user-editable
 *  value the code confirms against, not a value the app trusts on its own.
 *  R104 forbids guessing it, which this satisfies: there is no default and
 *  no fallback, only "empty is an error".
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

/** This device's own pairing code, judged against a point in time. `code`'s
 *  120 s lifetime (`transport/src/sync/pairing.rs`) is enforced server-side
 *  by `pair_peer`; this is purely a display judgement so the person relaying
 *  the code to the other device can see it die rather than typing a code the
 *  peer will silently refuse. */
export type PairingCodeState =
  | { kind: "none" }
  | { kind: "valid"; secondsRemaining: number }
  | { kind: "expired" };

/** Judges {@link PairingCode} `code` against `nowMs`, an injected clock so
 *  callers (and tests) never read `Date.now()` themselves.
 *
 * @param code - The most recent `start_pairing` result, or `null` before one
 *  has been requested this session.
 * @param nowMs - The current time, ms since epoch.
 * @returns `"none"` with no code yet; `"expired"` at or past
 *  `code.expires_at_ms`; otherwise `"valid"` with the whole seconds left
 *  (rounded up, so the display never reads "0:00" while still redeemable). */
export function pairingCodeState(code: PairingCode | null, nowMs: number): PairingCodeState {
  if (code === null) {
    return { kind: "none" };
  }
  const msRemaining = code.expires_at_ms - nowMs;
  if (msRemaining <= 0) {
    return { kind: "expired" };
  }
  return { kind: "valid", secondsRemaining: Math.ceil(msRemaining / 1000) };
}

/** Formats a non-negative second count as `m:ss`, e.g. `120` → `"2:00"`.
 *
 * @param totalSeconds - Whole seconds, non-negative. */
export function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The status line shown under this device's pairing code.
 *
 * @param state - This code's current {@link PairingCodeState}.
 * @returns `null` when there is no code to describe (nothing renders). */
export function pairingCodeStatusText(state: PairingCodeState): string | null {
  switch (state.kind) {
    case "none":
      return null;
    case "expired":
      return "Code expired.";
    case "valid":
      return `Expires in ${formatMmSs(state.secondsRemaining)}`;
  }
}

/** The "Show my code" button's label for the current {@link PairingCodeState}
 *  — once the code has died the same button re-mints a fresh one rather than
 *  leaving the person stuck on a code the peer will refuse.
 *
 * @param state - This code's current {@link PairingCodeState}. */
export function showCodeButtonLabel(state: PairingCodeState): string {
  return state.kind === "expired" ? "Get a new code" : "Show my code";
}

import type { DeviceStatus } from "../../../ipc/device";
import { isPushable, validateConfig, type ValidationIssue } from "./config/validate";
import { serializeConfig, type DeviceConfig } from "./config/model";

/**
 * `preparePush`'s success case: `json` is exactly `serializeConfig(config)`,
 * ready to pass to `pushConfig` (C3 §3.8, `app/src/ipc/device.ts`) verbatim.
 */
export interface PushReady {
  ok: true;
  /** `serializeConfig(config)` — the app never hand-builds this string. */
  json: string;
}

/**
 * `preparePush`'s failure case: `config` carries at least one
 * error-severity `ValidationIssue` and was never serialised.
 */
export interface PushBlocked {
  ok: false;
  issues: ValidationIssue[];
}

/**
 * Gates a `DeviceConfig` on `validateConfig`/`isPushable` before turning it
 * into the JSON string `push_config` accepts. **Validates, then serialises,
 * never the reverse** — the lane's load-bearing invariant (L7b lane brief:
 * "a config is never pushed unvalidated"). A warning-only config still
 * serialises; only an error-severity issue blocks the push. The caller
 * (`PushConfigBar`) is expected to call `pushConfig(deviceId, result.json)`
 * only when `result.ok` is `true` — this function does not call IPC itself,
 * keeping it a pure, unit-testable driver.
 */
export function preparePush(config: DeviceConfig): PushReady | PushBlocked {
  const issues = validateConfig(config);
  if (!isPushable(issues)) {
    return { ok: false, issues };
  }
  return { ok: true, json: serializeConfig(config) };
}

/**
 * Turns a successful `push_config` call's aftermath into the one-line
 * status text `PushConfigBar` shows. `pull_config` (IPC need 10) is a
 * stub in wave 2, so `verified` is always `null` on a real push — the
 * `reconnected`/`verified` parameters exist so this function is honest
 * about the four idl0 states (SPEC §23.6) once a reconnect-and-verify leg
 * lands, without a signature change then.
 *
 * - `reconnected: true, verified: true` — the device reported back a
 *   config matching what was pushed.
 * - `reconnected: true, verified: false` — the device reconnected but its
 *   reported config does not match; the user is told to try again.
 * - `reconnected: false` — the reboot-and-reconnect leg (SPEC §23.6) did
 *   not complete; `verified` is meaningless here and ignored.
 * - `reconnected: true, verified: null` — verification is not available
 *   (`pull_config` is a stub) — the honest arm every wave-2 push reports.
 */
export function describePushResult(reconnected: boolean, verified: boolean | null): string {
  if (!reconnected) {
    return "Config applied, but the device didn't reconnect after its reboot. Reconnect when it's back to confirm the change took.";
  }
  if (verified === true) {
    return "Config applied and verified — the device is now running it.";
  }
  if (verified === false) {
    return "Config applied, but what the device is now running doesn't match what was pushed. Try pushing again.";
  }
  return "Config applied, not verified.";
}

/**
 * The result of {@link checkPushMode} — SPEC §23.6: pushing a config
 * requires idle mode ("BLE control is suspended in WiFi mode, §10.4"). A
 * `false` result carries the exact sentence `PushConfigBar` shows in place
 * of the push button, rather than letting the device's own rejection
 * (`kind: "config"`/`"ble"`) be the first the rider hears of it (decision
 * 69: "read mode first").
 */
export interface ModeCheck {
  ok: boolean;
  /** `null` when `ok` is `true`; otherwise the reason shown to the rider. */
  reason: string | null;
}

/**
 * Reads `status` for whether a push is currently allowed, **before**
 * `pushConfig` is ever called (decision 69). Idle mode means neither
 * recording nor WiFi is active (SPEC §23.9's mutual exclusion) — both
 * fields must be confirmed `false`; either being unreported (`null`) is
 * treated as "don't know yet," not "assume idle," since a push sent into
 * WiFi mode is the exact silent-rejection SPEC §23.6 describes for wave 2
 * and this function exists to prevent. No `DeviceStatus` at all (before the
 * first poll returns) is the same "don't know yet" case.
 */
export function checkPushMode(status: DeviceStatus | null): ModeCheck {
  if (status === null) {
    return { ok: false, reason: "Waiting for the device's status before a push can be checked as safe." };
  }
  if (status.logging === true) {
    return { ok: false, reason: "The device is recording. Stop the recording before pushing a config." };
  }
  if (status.wifi_on === true) {
    return { ok: false, reason: "The device is in WiFi mode, which suspends BLE control. Turn WiFi off before pushing a config." };
  }
  if (status.logging === null || status.wifi_on === null) {
    return { ok: false, reason: "The device's mode isn't fully known yet — wait for the next status read before pushing." };
  }
  return { ok: true, reason: null };
}

/** Lifecycle phase of `PushConfigBar`'s push flow (standing reviewer
 *  brief: an effect that drives IPC delegates to a pure, tested driver). */
export type PushPhase = "idle" | "pushing" | "succeeded" | "failed";

/** State for `PushConfigBar`'s push flow. */
export interface PushState {
  phase: PushPhase;
  /** `describePushResult`'s text on success, or a user-facing failure
   *  message on failure. `null` while idle or pushing. */
  message: string | null;
}

/** The reducer's state before any push has been attempted. */
export const initialPushState: PushState = { phase: "idle", message: null };

/** Actions `pushReducer` accepts, dispatched by `PushConfigBar` around its
 *  `pushConfig` (C3 §3.8) call. */
export type PushAction =
  | { type: "PUSH_START" }
  | { type: "PUSH_SUCCEEDED"; message: string }
  | { type: "PUSH_FAILED"; message: string };

/**
 * Pure reducer over the push flow's own phase — idle → pushing →
 * succeeded/failed. `PUSH_START` while already `"pushing"` is a no-op:
 * one push in flight at a time, never a second `pushConfig` call stacked
 * on top of the first because the user double-clicked or unrelated
 * component state re-rendered the bar.
 */
export function pushReducer(state: PushState, action: PushAction): PushState {
  switch (action.type) {
    case "PUSH_START":
      if (state.phase === "pushing") return state;
      return { phase: "pushing", message: null };
    case "PUSH_SUCCEEDED":
      return { phase: "succeeded", message: action.message };
    case "PUSH_FAILED":
      return { phase: "failed", message: action.message };
    default:
      return state;
  }
}

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

import { useEffect, useMemo, useReducer, useRef } from "react";

import { pushConfig } from "../../../ipc/device";
import type { DeviceConfig } from "./config/model";
import { validateConfig } from "./config/validate";
import type { ValidationIssue } from "./config/validate";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { NotImplementedError, pullConfig } from "./ipcStubs";
import { describePushResult, initialPushState, preparePush, pushReducer } from "./push";

/** Props for {@link PushConfigBar}. */
export interface PushConfigBarProps {
  /** The BLE device id `pushConfig`/`pullConfig` act on. */
  deviceId: string;
  /** The active profile's config, or `null` when no profile is active. */
  config: DeviceConfig | null;
  /** Whether the last connect attempt succeeded (R53 Device Q4) — not
   *  evidence of a live link, only that a push has somewhere to aim. */
  connected: boolean;
}

/** Renders one `ValidationIssue` list, same shape as the per-field lists
 *  the source forms show (`forms/HrmForm.tsx` etc.) — duplicated locally
 *  rather than imported since none of those modules export it. */
function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="device-form__issues">
      {issues.map((issue) => (
        <li key={issue.path + issue.message} data-severity={issue.severity}>
          {issue.severity === "error" ? "Error: " : "Warning: "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Device tab's push/pull bar (SPEC §23.6). **Push config** is enabled
 * only when a device connected in this session (R53 Device Q4), a profile
 * is active (`config !== null`), and `isPushable(validateConfig(config))`
 * holds — the load-bearing invariant (lane brief: a config is never pushed
 * unvalidated) is enforced here by gating the button, and again inside
 * `preparePush`, which `pushConfig` is never called without first passing.
 *
 * SPEC §10.4/§23 require idle mode for a push, but `device_status` (IPC
 * need 8) is a stub, so this bar cannot read the device's current mode —
 * it **states** the idle-mode requirement in copy instead of enforcing it.
 * A device that refuses the push surfaces through `describeIpcError`
 * (`kind: "config"` or `kind: "ble"`).
 *
 * `pull_config` (IPC need 10) is a stub, so `describePushResult` always
 * reports its "applied, not verified" arm here — the honest state of wave
 * 2's push flow, never a claimed verification the app cannot back up.
 * **Pull from device** exists as a visible stub: pressing it surfaces
 * `NotImplementedError`'s own message rather than pretending to succeed
 * or silently doing nothing.
 *
 * `issues`/`prepared` are memoised on `config`'s identity (review-task8
 * Minor: `validateConfig`/`preparePush` were each being called fresh on
 * every render, including renders `config` had no part in) — `onPush`
 * reuses the same `prepared` value rather than calling `preparePush` a
 * third time. A mounted-ref guards the push promise's `.then`/`.catch`
 * (review-task8 Minor: a push that resolves after this bar unmounts — the
 * rider navigated away mid-push — used to dispatch into a discarded
 * reducer instance with no visible outcome); a ref, not a lifted
 * in-flight flag, since the in-flight state (`pushState`) is already
 * local to this component and nothing above it needs to know about a
 * push in progress.
 */
export default function PushConfigBar({ deviceId, config, connected }: PushConfigBarProps) {
  const [pushState, dispatch] = useReducer(pushReducer, initialPushState);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const issues = useMemo(() => (config === null ? [] : validateConfig(config)), [config]);
  const prepared = useMemo(() => (config === null ? null : preparePush(config)), [config]);
  const canPush = connected && config !== null && prepared !== null && prepared.ok && pushState.phase !== "pushing";

  function onPush(): void {
    if (config === null || pushState.phase === "pushing" || prepared === null || !prepared.ok) return; // button is disabled in this state; defensive no-op
    dispatch({ type: "PUSH_START" });
    pushConfig(deviceId, prepared.json)
      .then(() => {
        if (!mountedRef.current) return; // bar unmounted mid-push; nothing left to update
        // `pull_config` is a stub in wave 2 — every successful push reports
        // the honest "reconnected, not verified" arm, never a claimed match.
        dispatch({ type: "PUSH_SUCCEEDED", message: describePushResult(true, null) });
      })
      .catch((err: DeviceIpcError) => {
        if (!mountedRef.current) return; // bar unmounted mid-push; nothing left to update
        dispatch({ type: "PUSH_FAILED", message: describeIpcError(err) });
      });
  }

  function onPull(): void {
    pullConfig(deviceId).catch((err: unknown) => {
      const message = err instanceof NotImplementedError ? "Pull from device isn't available yet." : "Pull from device failed.";
      dispatch({ type: "PUSH_FAILED", message });
    });
  }

  return (
    <div className="device-tab__push-bar">
      <p className="device-tab__push-note">
        Pushing a config reboots the device to apply it (SPEC §7.2). The device must be in idle mode to accept a push — this app
        cannot read the device's current mode yet, so a push attempted in the wrong mode surfaces as a rejection below rather than
        being blocked in advance.
      </p>
      <IssueList issues={issues} />
      <button type="button" onClick={onPush} disabled={!canPush}>
        {pushState.phase === "pushing" ? "Pushing…" : "Push config"}
      </button>
      <button type="button" onClick={onPull}>
        Pull from device
      </button>
      {pushState.phase === "succeeded" && pushState.message && <p role="status">{pushState.message}</p>}
      {pushState.phase === "failed" && pushState.message && <p role="alert">{pushState.message}</p>}
    </div>
  );
}

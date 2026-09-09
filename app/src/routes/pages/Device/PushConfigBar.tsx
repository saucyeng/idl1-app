import { useEffect, useMemo, useReducer, useRef } from "react";

import { NoteBlock } from "../../../components/brand/NoteBlock";
import { Button } from "../../../components/ui/button";
import { pullConfig, pushConfig } from "../../../ipc/device";
import type { DeviceStatus } from "../../../ipc/device";
import { toastFor } from "../../../components/toasts/events";
import { toast } from "sonner";
import type { DeviceConfig } from "./config/model";
import { validateConfig } from "./config/validate";
import type { ValidationIssue } from "./config/validate";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { checkPushMode, describePushResult, initialPushState, preparePush, pushReducer } from "./push";

/** Props for {@link PushConfigBar}. */
export interface PushConfigBarProps {
  /** The BLE device id `pushConfig`/`pullConfig` act on. */
  deviceId: string;
  /** The active profile's config, or `null` when no profile is active. */
  config: DeviceConfig | null;
  /** Whether the last connect attempt succeeded (R53 Device Q4) — not
   *  evidence of a live link, only that a push has somewhere to aim. */
  connected: boolean;
  /** The last known `device_status` read for this device, or `null` before
   *  the first poll returns — {@link checkPushMode}'s input (decision 69:
   *  read the mode first, refuse before sending). */
  deviceStatus: DeviceStatus | null;
}

/** Renders one `ValidationIssue` list, same shape as the per-field lists
 *  the source forms show (`forms/HrmForm.tsx` etc.) — duplicated locally
 *  rather than imported since none of those modules export it. */
function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="device-form__issues">
      {issues.map((issue) => (
        <li
          key={issue.path + issue.message}
          data-severity={issue.severity}
          className={`font-mono text-sm ${issue.severity === "error" ? "text-brand-accent" : "text-hivis"}`}
        >
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
 * is active (`config !== null`), `isPushable(validateConfig(config))`
 * holds, and {@link checkPushMode} confirms the device is idle — the
 * load-bearing invariant (lane brief: a config is never pushed unvalidated)
 * is enforced here by gating the button, and again inside `preparePush`,
 * which `pushConfig` is never called without first passing.
 *
 * SPEC §10.4/§23.6 require idle mode for a push (decision 69, wave-3 lane D
 * task 4): `checkPushMode` reads the last known `deviceStatus` and refuses
 * with a specific reason — recording, WiFi mode, or mode not yet known —
 * **before** `pushConfig` is ever called, rather than letting the device's
 * own rejection be the first the rider hears of it. A device that still
 * refuses the push (a stale read, a race with a mode change) surfaces
 * through `describeIpcError` (`kind: "config"` or `kind: "ble"`) exactly as
 * before — this is an added up-front check, not a replacement for handling
 * that rejection.
 *
 * `describePushResult` still reports its "applied, not verified" arm after
 * every push: comparing a pulled config against what was pushed (SPEC
 * §23.6's full reconnect-and-verify leg) is not built here, so a real
 * `pullConfig` round trip (below, **Pull from device**) is shown as its own
 * outcome rather than folded into the push flow's verification state.
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
export default function PushConfigBar({ deviceId, config, connected, deviceStatus }: PushConfigBarProps) {
  const [pushState, dispatch] = useReducer(pushReducer, initialPushState);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const issues = useMemo(() => (config === null ? [] : validateConfig(config)), [config]);
  const prepared = useMemo(() => (config === null ? null : preparePush(config)), [config]);
  const modeCheck = useMemo(() => checkPushMode(deviceStatus), [deviceStatus]);
  const canPush = connected && config !== null && prepared !== null && prepared.ok && modeCheck.ok && pushState.phase !== "pushing";

  function onPush(): void {
    if (config === null || pushState.phase === "pushing" || prepared === null || !prepared.ok || !modeCheck.ok) return; // button is disabled in this state; defensive no-op
    const pushedProfileName = config.bike_profile.name;
    dispatch({ type: "PUSH_START" });
    pushConfig(deviceId, prepared.json)
      .then(() => {
        if (!mountedRef.current) return; // bar unmounted mid-push; nothing left to update
        // This flow does not pull the config back to verify it landed
        // (SPEC §23.6's full reconnect-and-verify leg is not built here) —
        // every successful push reports the honest "applied, not verified" arm.
        dispatch({ type: "PUSH_SUCCEEDED", message: describePushResult(true, null) });
        // Toast call site 1/2 (UI-DIRECTION decision 21): config pushed.
        const descriptor = toastFor({ kind: "configPushed", profileName: pushedProfileName });
        toast.info(descriptor.title, { description: descriptor.detail });
      })
      .catch((err: DeviceIpcError) => {
        if (!mountedRef.current) return; // bar unmounted mid-push; nothing left to update
        dispatch({ type: "PUSH_FAILED", message: describeIpcError(err) });
      });
  }

  function onPull(): void {
    pullConfig(deviceId)
      .then(() => {
        if (!mountedRef.current) return; // bar unmounted mid-pull; nothing left to update
        // The pulled config is not compared against anything or applied to
        // this bar's active profile here — that merge/diff UI is a separate
        // feature, not built in this task. A successful pull only confirms
        // the device is reachable and returned a config.
        dispatch({ type: "PUSH_SUCCEEDED", message: "Config pulled from the device." });
      })
      .catch((err: DeviceIpcError) => {
        if (!mountedRef.current) return; // bar unmounted mid-pull; nothing left to update
        dispatch({ type: "PUSH_FAILED", message: describeIpcError(err) });
      });
  }

  return (
    <div className="device-tab__push-bar flex flex-col gap-2">
      <NoteBlock className="device-tab__push-note border-rule">
        Pushing a config reboots the device to apply it (SPEC §7.2). The device must be in idle mode to accept a push.
      </NoteBlock>
      {connected && !modeCheck.ok && modeCheck.reason && (
        <p role="status" className="font-mono text-sm text-hivis">
          {modeCheck.reason}
        </p>
      )}
      <IssueList issues={issues} />
      <div className="flex gap-2">
        <Button type="button" emphasis="info" filled className="h-11" onClick={onPush} disabled={!canPush}>
          {pushState.phase === "pushing" ? "Pushing…" : "Push config"}
        </Button>
        <Button type="button" className="h-11" onClick={onPull}>
          Pull from device
        </Button>
      </div>
      {pushState.phase === "succeeded" && pushState.message && (
        <p role="status" className="font-mono text-sm text-good">
          {pushState.message}
        </p>
      )}
      {pushState.phase === "failed" && pushState.message && (
        <p role="alert" className="font-mono text-sm text-brand-accent">
          {pushState.message}
        </p>
      )}
    </div>
  );
}

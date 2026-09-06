import type { DeviceControlCommand, DeviceStatus } from "../../../ipc/device";

/** Which `device_control` commands the tab may currently offer, and what
 *  the device is being told to do — a pure function of the last known
 *  `DeviceStatus`. `false` on any field means "do not offer this button
 *  right now," never a claim that the device is incapable of it. */
export interface ControlAvailability {
  canStartRecording: boolean;
  canStopRecording: boolean;
  canWifiOn: boolean;
  canWifiOff: boolean;
}

/** Which controls are offered, and what each one would do, given the last
 *  status (SPEC §23.9). Recording and WiFi are mutually exclusive; a
 *  control is offered only when the field(s) it depends on are known
 *  (non-`null`) — an unreported field means the current mode is unknown,
 *  and offering a button that might send a command the device is not
 *  actually in a state to accept is worse than withholding it (C3 §3.8:
 *  `null` fields mean the device did not report that line, never a
 *  false/zero default). With `status === null` (not polled yet) nothing
 *  is offered. */
export function controlAvailability(status: DeviceStatus | null): ControlAvailability {
  if (status === null || status.logging === null || status.wifi_on === null) {
    return { canStartRecording: false, canStopRecording: false, canWifiOn: false, canWifiOff: false };
  }
  const { logging, wifi_on } = status;
  return {
    canStartRecording: !logging && !wifi_on,
    canStopRecording: logging,
    canWifiOn: !wifi_on && !logging,
    canWifiOff: wifi_on,
  };
}

/** Did the status `device_control` returned actually show the transition
 *  `command` was meant to cause? This is the only evidence available on
 *  this platform (R63 item 1, R71 correction 2026-09-06): the SPEC §7.2
 *  acknowledgement byte never reaches the app on this desktop BLE stack,
 *  so a resolved `deviceControl` promise proves only that the command was
 *  sent, never that the device acted on it.
 *
 * - `"observed"` — the relevant field now shows the state `command` asks for.
 * - `"not-observed"` — the field is known but still shows the old state —
 *   the device did not (yet, or ever) make the change. Must never read as
 *   success.
 * - `"unreported"` — the relevant field came back `null`: the device did
 *   not report that line at all, so nothing can be said either way. */
export function transitionObserved(
  command: DeviceControlCommand,
  after: DeviceStatus,
): "observed" | "not-observed" | "unreported" {
  switch (command) {
    case "start_recording":
      if (after.logging === null) return "unreported";
      return after.logging ? "observed" : "not-observed";
    case "stop_recording":
      if (after.logging === null) return "unreported";
      return after.logging ? "not-observed" : "observed";
    case "wifi_on":
      if (after.wifi_on === null) return "unreported";
      return after.wifi_on ? "observed" : "not-observed";
    case "wifi_off":
      if (after.wifi_on === null) return "unreported";
      return after.wifi_on ? "not-observed" : "observed";
    default: {
      const exhaustive: never = command;
      throw new Error(`unhandled DeviceControlCommand: ${String(exhaustive)}`);
    }
  }
}

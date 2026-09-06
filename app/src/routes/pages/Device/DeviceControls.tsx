import type { DeviceControlCommand, DeviceStatus } from "../../../ipc/device";
import { controlAvailability } from "./control";

/** One outcome of a `device_control` call this bar has shown, from
 *  `transitionObserved` (`control.ts`) — kept by `index.tsx`, which owns the
 *  `deviceControl` call itself. */
export interface ControlOutcomeView {
  command: DeviceControlCommand;
  outcome: "observed" | "not-observed" | "unreported";
}

/** Props for {@link DeviceControls}. */
export interface DeviceControlsProps {
  /** The last known `DeviceStatus`, or null before the first poll returns —
   *  the sole source `controlAvailability` reads to decide which buttons
   *  are offered. */
  status: DeviceStatus | null;
  /** The command currently in flight, or null — every button is disabled
   *  while one is pending, so a double click can never send a second
   *  command before the first's status read-back completes. */
  pending: DeviceControlCommand | null;
  /** The most recent `device_control` call's result, or null before any
   *  control has been used this session. */
  lastOutcome: ControlOutcomeView | null;
  onControl: (command: DeviceControlCommand) => void;
}

/** User-facing label for one `DeviceControlCommand`, for both the button
 *  itself and `lastOutcome` text. */
const COMMAND_LABEL: Record<DeviceControlCommand, string> = {
  start_recording: "Start recording",
  stop_recording: "Stop recording",
  wifi_on: "Turn WiFi on",
  wifi_off: "Turn WiFi off",
};

/** Renders `lastOutcome` as one line of text — SPEC/lane-brief rule: a
 *  `"not-observed"` outcome must never read as success (R63 item 1, R71
 *  correction). */
function outcomeText(outcome: ControlOutcomeView): string {
  const label = COMMAND_LABEL[outcome.command];
  switch (outcome.outcome) {
    case "observed":
      return `${label}: the device's reported status now shows this took effect.`;
    case "not-observed":
      return `${label}: sent, but the device's reported status still shows the old state. It may not have taken effect.`;
    case "unreported":
      return `${label}: sent, but the device didn't report the relevant status line, so this app can't tell whether it took effect.`;
  }
}

/**
 * The Device tab's provisional recording/WiFi controls (lane brief
 * Interface 6, R53/R63.1/R71). Buttons are gated by `controlAvailability`
 * (`control.ts`, SPEC §23.9's mutual exclusion and null-field withholding)
 * and disabled while a command is `pending`. The banner states the honesty
 * constraint plainly: this desktop BLE stack never surfaces the SPEC §7.2
 * acknowledgement byte, so a resolved `deviceControl` promise is not
 * evidence of anything — only the status line is.
 */
export default function DeviceControls({ status, pending, lastOutcome, onControl }: DeviceControlsProps) {
  const availability = controlAvailability(status);
  const busy = pending !== null;

  return (
    <div className="device-controls">
      <p role="status" className="device-controls__banner">
        These buttons send a command and then read the device&apos;s status back. On this desktop Bluetooth stack, a
        refusal from the device can&apos;t be told apart from a command that was never acted on — so the status line
        below, not the button itself, is the evidence a change happened.
      </p>
      <div className="device-controls__buttons">
        <button type="button" onClick={() => onControl("start_recording")} disabled={busy || !availability.canStartRecording}>
          {pending === "start_recording" ? "Starting…" : COMMAND_LABEL.start_recording}
        </button>
        <button type="button" onClick={() => onControl("stop_recording")} disabled={busy || !availability.canStopRecording}>
          {pending === "stop_recording" ? "Stopping…" : COMMAND_LABEL.stop_recording}
        </button>
        <button type="button" onClick={() => onControl("wifi_on")} disabled={busy || !availability.canWifiOn}>
          {pending === "wifi_on" ? "Turning on…" : COMMAND_LABEL.wifi_on}
        </button>
        <button type="button" onClick={() => onControl("wifi_off")} disabled={busy || !availability.canWifiOff}>
          {pending === "wifi_off" ? "Turning off…" : COMMAND_LABEL.wifi_off}
        </button>
      </div>
      {lastOutcome && (
        <p role="status" className="device-controls__outcome" data-outcome={lastOutcome.outcome}>
          {outcomeText(lastOutcome)}
        </p>
      )}
    </div>
  );
}

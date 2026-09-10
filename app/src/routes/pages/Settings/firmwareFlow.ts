import type { OtaState } from "../../../ipc/device";

/**
 * What the Firmware section's card shows for a given {@link OtaState}.
 *
 * The state machine itself is Rust's (C3 §3.8, R198) — this module does no
 * deciding about the device, only about pixels: a title, an optional
 * detail line, an optional progress bar, and which buttons are live. Every
 * function here is pure, which is why the section component can stay a
 * thin renderer over it.
 *
 * Strings marked "verbatim" are the Flutter app's own, kept because they
 * were good (R198); the rest are new, for states idl0 did not model.
 */

/** A determinate or indeterminate progress bar. `pct` is `null` when the
 *  total is not yet known — the bar is indeterminate rather than showing a
 *  fabricated number (C3 §1's own rule for a `null` `total`). */
export interface FlowProgress {
  pct: number | null;
  /** Accessible label for the bar. */
  label: string;
}

/** Which action buttons the card offers, and whether each is enabled. */
export interface FlowActions {
  /** Pick a `.bin` off disk. Off while anything is in flight. */
  choose: boolean;
  /** Start the push of an already-chosen file or catalog release. */
  push: boolean;
  /** `CMD_OTA_CONFIRM` — only on the pending-verify card. */
  confirm: boolean;
  /** Show the power-cycle instructions — only on the pending-verify card. */
  rollBack: boolean;
}

/** Everything the card renders for one state. */
export interface FlowCard {
  /** The card's headline. */
  title: string;
  /** A second line, or `null` when the title says it all. */
  detail: string | null;
  /** The progress bar, or `null` when there is nothing to measure. */
  progress: FlowProgress | null;
  /** Which buttons to offer. */
  actions: FlowActions;
  /** `true` while the sequence is running: the section must not let the
   *  user start a second push, switch channel, or navigate away casually. */
  busy: boolean;
  /** How the card should read: `"neutral"` for progress and rest states,
   *  `"good"` for a committed update, `"warn"` for a state needing a
   *  decision, `"bad"` for a failure. */
  tone: "neutral" | "good" | "warn" | "bad";
}

/** No buttons live at all. */
const NO_ACTIONS: FlowActions = { choose: false, push: false, confirm: false, rollBack: false };

/** The buttons available when nothing is in flight. `push` is the section's
 *  own call (it depends on whether a file or release is selected), so it
 *  starts `false` here and {@link withPushEnabled} turns it on. */
const IDLE_ACTIONS: FlowActions = { choose: true, push: false, confirm: false, rollBack: false };

/** Returns `card` with its `push` button enabled when `hasSelection` and the
 *  card is not busy. Keeps "is something selected?" — which lives in the
 *  component's own state — out of {@link flowCard}'s pure mapping. */
export function withPushEnabled(card: FlowCard, hasSelection: boolean): FlowCard {
  if (card.busy || !card.actions.choose) return card;
  return { ...card, actions: { ...card.actions, push: hasSelection } };
}

/** Percent as a whole number for a title, e.g. `42`. */
function pctText(pct: number | null): string {
  return pct === null ? "…" : `${Math.round(pct)}%`;
}

/** Maps one OTA state onto the card to draw.
 *
 * @param state - The state Rust last published, from `ota_state()` or an
 *  `ota_state_changed` event.
 * @param errorText - Copy for a `failed` state's error, from the section's
 *  own `describeIpcError`. Ignored for every other state. */
export function flowCard(state: OtaState, errorText: string | null = null): FlowCard {
  switch (state.phase) {
    case "idle":
      return {
        title: "No update in progress",
        detail: null,
        progress: null,
        actions: IDLE_ACTIONS,
        busy: false,
        tone: "neutral",
      };

    case "downloading":
      return {
        // Verbatim (Flutter `firmware_update_section.dart:510`).
        title: `Downloading update… ${pctText(state.pct)}`,
        detail: null,
        progress: { pct: state.pct, label: "Downloading firmware" },
        actions: NO_ACTIONS,
        busy: true,
        tone: "neutral",
      };

    case "pushing":
      return {
        // Verbatim (Flutter `:532`).
        title: `Pushing firmware… ${pctText(state.pct)}`,
        detail: "Keep the device powered and close by.",
        progress: { pct: state.pct, label: "Pushing firmware to the device" },
        actions: NO_ACTIONS,
        busy: true,
        tone: "neutral",
      };

    case "rebooting":
      return {
        // Both lines verbatim (Flutter `:556`, `:561`).
        title: "Device is rebooting…",
        detail: "Reconnecting in a few seconds.",
        progress: { pct: null, label: "Device is rebooting" },
        actions: NO_ACTIONS,
        busy: true,
        tone: "neutral",
      };

    case "reconnecting":
      return {
        title: "Reconnecting to the device…",
        detail: `Attempt ${state.attempt} of ${state.max_attempts}.`,
        progress: { pct: null, label: "Reconnecting to the device" },
        actions: NO_ACTIONS,
        busy: true,
        tone: "neutral",
      };

    case "pending_verify":
      return state.auto_confirm_armed
        ? {
            title: "New firmware is running — committing it now.",
            detail: null,
            progress: { pct: null, label: "Committing the new firmware" },
            actions: NO_ACTIONS,
            busy: true,
            tone: "neutral",
          }
        : {
            // Verbatim (Flutter `:603`).
            title: "New firmware is running — confirm to commit, or power-cycle the device to roll back.",
            detail: null,
            progress: null,
            actions: { choose: false, push: false, confirm: true, rollBack: true },
            busy: false,
            tone: "warn",
          };

    case "confirmed":
      return {
        title: "Firmware updated.",
        detail: "The new image is committed and will survive a reboot.",
        progress: null,
        actions: IDLE_ACTIONS,
        busy: false,
        tone: "good",
      };

    case "rolled_back":
      return {
        title: "The device rolled back to its previous firmware.",
        detail: "The update did not take. You can try again, or push a .bin by hand.",
        progress: null,
        actions: IDLE_ACTIONS,
        busy: false,
        tone: "warn",
      };

    case "failed":
      return {
        title: "The update did not finish.",
        detail: errorText ?? state.error.message,
        progress: null,
        actions: IDLE_ACTIONS,
        busy: false,
        tone: "bad",
      };
  }
}

/** The instructions the "Roll back" button reveals. There is no roll-back
 *  command — the bootloader reverts an unconfirmed image on the next boot
 *  (R198, SPEC §4.6), so all the app can do is say so. Verbatim (Flutter
 *  `firmware_update_section.dart:628`). */
export const ROLL_BACK_INSTRUCTIONS = "Power-cycle the device to roll back to the previous firmware.";

/** Copy for the three `POST /ota` response classes SPEC §6.1 documents,
 *  read off a `wifi` error's `detail.ota_error` (C3 §3.8). Falls back to
 *  the generic line for a `wifi` error raised anywhere else in the flow —
 *  the catalog fetch, the image download, a checksum mismatch.
 *
 * All three device-side strings are verbatim (Flutter `:327-333`). */
export function describeOtaError(detail: unknown): string | null {
  if (detail === null || typeof detail !== "object") return null;
  const otaError = (detail as { ota_error?: unknown }).ota_error;
  switch (otaError) {
    case "rejected":
      return "Firmware file corrupted, try again.";
    case "device_error":
      return "Device error during update, try again.";
    case "transport":
      return "Could not reach device — make sure WiFi is on.";
    default:
      return null;
  }
}

/** Whether the section should let the user start a push at all, given the
 *  live preconditions R198 names. `null` means "yes"; a string is the
 *  reason to show instead of the button. */
export function pushBlockedReason(deviceId: string | null, recording: boolean, busy: boolean): string | null {
  // Verbatim (Flutter `:430`, `:491`).
  if (deviceId === null) return "Connect to device first";
  if (recording) return "Stop the recording before updating firmware.";
  if (busy) return "An update is already in progress.";
  return null;
}

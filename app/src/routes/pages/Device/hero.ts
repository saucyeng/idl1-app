import type { Emphasis } from "../../../components/brand/emphasis";

/** The hero card's three states as one decision (FLUTTER-UI-SURVEY §6,
 *  UI-DIRECTION Device): which label, which emphasis, and whether the live
 *  timer and pulsing dot are shown. Pure so the state machine is tested
 *  without rendering (CLAUDE.md §4). */
export type HeroState = "disconnected" | "idle" | "recording";

/** What {@link heroView} derives for one {@link HeroState}: the CTA's label
 *  and colour emphasis (`emphasisClasses`, UI-2), and whether the live
 *  recording timer and `PulsingDot` RX/TX light are shown alongside it. */
export interface HeroView {
  label: string;
  emphasis: Emphasis;
  showTimer: boolean;
  pulsing: boolean;
}

/**
 * Derives the hero card's CTA view for `state` (UI-DIRECTION Device
 * paragraph, FLUTTER-UI-SURVEY §6): no device shows a Connect CTA in
 * `--info`, connected-idle shows Start recording in `--good`, and recording
 * shows Stop in `--hivis` with a live timer and pulsing dot. Total over the
 * union — a new `HeroState` is a compile error here, not a silent fallback.
 */
export function heroView(state: HeroState): HeroView {
  switch (state) {
    case "disconnected":
      return { label: "Connect", emphasis: "info", showTimer: false, pulsing: false };
    case "idle":
      return { label: "Start recording", emphasis: "good", showTimer: false, pulsing: false };
    case "recording":
      return { label: "Stop", emphasis: "hivis", showTimer: true, pulsing: true };
    default: {
      const exhaustive: never = state;
      throw new Error(`unhandled HeroState: ${String(exhaustive)}`);
    }
  }
}

/**
 * Derives `HeroState` from the connection + status the page already holds —
 * no new source of truth, no new IPC. `connected` is `index.tsx`'s active
 * device being present in `connectionState.connections` (a managed BLE
 * connection); `recording` is the last known `DeviceStatus.logging` read as a plain
 * boolean (the caller decides how to treat `null`/not-yet-polled, since that
 * is a display nuance the hero state machine itself does not need).
 */
export function heroStateFrom(connected: boolean, recording: boolean): HeroState {
  if (!connected) return "disconnected";
  return recording ? "recording" : "idle";
}

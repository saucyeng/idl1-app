import { Pause, Pin, PinOff, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPlaybackTime, PLAYBACK_SPEEDS, shouldRenderPlaybackTransport } from "./playback";
import type { PlaybackMode } from "./playbackMode";

/** Props for {@link PlaybackTransport}. */
export interface PlaybackTransportProps {
  /** Whether the shared cursor is currently advancing. */
  playing: boolean;
  /** The shared cursor's current time, in µs since session start, or
   *  `null` when no session/worksheet is loaded yet. */
  cursorTUs: bigint | null;
  /** Play/pause toggle — `Notebook/index.tsx` owns the actual clock state (`interaction/playback.ts`). */
  onToggle: () => void;
  /** `true` while the Notebook route is hidden (R95/R99): the transport
   *  renders disabled rather than starting/continuing a hidden loop. */
  disabled: boolean;
  /** Whether the Notebook route is the active, visible route
   *  (`shell/routeVisibility.tsx`'s `useRouteVisible("notebook")`). This
   *  component portals outside its own React ancestor's `hidden` subtree
   *  (see {@link usePlaybackSlot}), so under mount-and-hide (R93) that
   *  `hidden` attribute never reaches it — `routeVisible` is the
   *  substitute check that keeps the transport off every other tab's top
   *  bar (see {@link shouldRenderPlaybackTransport}). */
  routeVisible: boolean;
  /** The clock's current rate — one of `interaction/playback.ts`'s
   *  {@link PLAYBACK_SPEEDS} `value`s (decision 57: "speed is selectable").
   *  `Notebook/index.tsx` owns the actual `PlaybackState`; this component
   *  only renders the select and reports a choice back through
   *  {@link onSpeedChange}. */
  speed: number;
  /** Requests a new speed — `Notebook/index.tsx` applies it via
   *  `interaction/playback.ts`'s `setSpeed`, this task's own tested pure
   *  function; the select makes no decision of its own. */
  onSpeedChange: (speed: number) => void;
  /** Decision 57's playback mode (Task 11's `interaction/playbackMode.ts`)
   *  — which of the two arithmetics `ChartCell.tsx`'s shared-cursor effect
   *  is currently applying. */
  mode: PlaybackMode;
  /** Requests the other mode — `Notebook/index.tsx` is the sole writer of
   *  the mode state this reflects, same shape as {@link onSpeedChange}. */
  onModeChange: (mode: PlaybackMode) => void;
  /**
   * The window playback is following, when naming it is required — R134
   * item 6/ruling R132's own rule applied to playback: with more than one
   * window selected, showing one (the primary) is allowed, showing it
   * unlabelled is not. `null` with zero or one window selected — no label,
   * byte-identical to the pre-multi-window transport (R127 item 3).
   * `Notebook/index.tsx` computes this the same way `cellListWindowNote`
   * does (`model/jsCellNote.ts`'s `primaryWindowNote`), so both surfaces
   * agree on wording.
   */
  followingWindowLabel: string | null;
}

/**
 * The play/pause transport for the shared worksheet cursor (decision 18),
 * rendered **inline, in the Notebook toolbar's centre group** (ruling R212
 * item 4 places it there and rules it one of the two groups that never
 * collapse). It previously portaled into a reserved `TopBar.tsx` slot; that
 * slot and its `document.getElementById` lookup are gone, along with the
 * narrow-layout blind spot they carried — the toolbar spans the window at
 * every width, so the transport is now reachable at every width too.
 *
 * Still renders nothing when `cursorTUs` is `null` (nothing loaded to play,
 * or no cursor ever placed) or the Notebook route isn't the active one
 * (see {@link shouldRenderPlaybackTransport}). Those are "there is nothing
 * to play" states, not width states — R212's no-collapse rule is about the
 * row narrowing, and does not ask for a dead play button over an empty
 * workbook.
 *
 * @param props See {@link PlaybackTransportProps}.
 */
export default function PlaybackTransport({
  playing,
  cursorTUs,
  onToggle,
  disabled,
  routeVisible,
  speed,
  onSpeedChange,
  mode,
  onModeChange,
  followingWindowLabel,
}: PlaybackTransportProps) {
  if (cursorTUs === null || !shouldRenderPlaybackTransport(routeVisible, cursorTUs)) {
    return null;
  }

  return (
    <div className="flex items-center gap-[var(--nb-gap)] font-mono text-fg-dim">
      <Button type="button" size="icon-sm" emphasis="normal" disabled={disabled} onClick={onToggle} aria-pressed={playing} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause /> : <Play />}
      </Button>
      <span className="tabular-nums text-fg">{formatPlaybackTime(cursorTUs)}</span>
      <Select value={String(speed)} onValueChange={(v) => onSpeedChange(Number(v))} disabled={disabled}>
        <SelectTrigger size="sm" aria-label="Playback speed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAYBACK_SPEEDS.map((s) => (
            <SelectItem key={s.value} value={String(s.value)}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="icon-sm"
        emphasis="normal"
        disabled={disabled}
        onClick={() => onModeChange(mode === "cursor-fixed" ? "scroll-at-edge" : "cursor-fixed")}
        aria-pressed={mode === "cursor-fixed"}
        aria-label={mode === "cursor-fixed" ? "Cursor fixed, chart scrolls under it — switch to scroll-at-edge" : "Scroll at edge — switch to cursor fixed"}
        title={mode === "cursor-fixed" ? "Cursor fixed" : "Scroll at edge"}
      >
        {mode === "cursor-fixed" ? <Pin /> : <PinOff />}
      </Button>
      {followingWindowLabel !== null && <span className="truncate text-fg-faint">· {followingWindowLabel}</span>}
    </div>
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Pin, PinOff, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPlaybackTime, PLAYBACK_SPEEDS, shouldRenderPlaybackTransport } from "./playback";
import type { PlaybackMode } from "./playbackMode";

/** The `id` `shell/TopBar.tsx` gives its reserved playback-transport slot
 *  (the top bar's only edit for this task). `usePlaybackSlot` looks this
 *  node up by id rather than `TopBar` taking new props, so `App.tsx`/
 *  `shell/AppShell.tsx` (the shell's own lead-owned wiring) need no change
 *  for a per-page feature to reach into the shell's chrome. */
const PLAYBACK_SLOT_ID = "playback-transport-slot";

/**
 * Finds `shell/TopBar.tsx`'s reserved slot `<div>` by id, re-checked on
 * window resize (the slot only exists in the medium/wide top bar — a
 * narrow-width bottom bar has none — so crossing that breakpoint gains or
 * loses the node; `ChartCell.tsx`'s own resize-triggered re-layout is the
 * precedent for this "recheck on resize" shape). Returns `null` when the
 * slot isn't present (narrow layout, or before the shell has mounted it).
 */
function usePlaybackSlot(): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const find = () => setEl(document.getElementById(PLAYBACK_SLOT_ID));
    find();
    window.addEventListener("resize", find);
    return () => window.removeEventListener("resize", find);
  }, []);

  return el;
}

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
 * portaled into `TopBar.tsx`'s reserved slot (see {@link usePlaybackSlot})
 * rather than the top bar itself owning any playback state. Renders
 * nothing when the slot isn't present (narrow layout), `cursorTUs` is
 * `null` (nothing loaded to play, or no cursor ever placed), or the
 * Notebook route isn't the active/visible one (see
 * {@link shouldRenderPlaybackTransport}) — the last case is required
 * because a portal's target lives outside its React parent's DOM subtree,
 * so mount-and-hide's `hidden` attribute on the rest of the Notebook page
 * has no effect on it.
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
  const slot = usePlaybackSlot();

  if (slot === null || cursorTUs === null || !shouldRenderPlaybackTransport(routeVisible, cursorTUs)) {
    return null;
  }

  return createPortal(
    <div className="flex items-center gap-2 font-mono text-label-2 text-fg-dim">
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
      {followingWindowLabel !== null && <span className="text-fg-faint">· {followingWindowLabel}</span>}
    </div>,
    slot
  );
}

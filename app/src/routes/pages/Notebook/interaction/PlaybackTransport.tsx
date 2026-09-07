import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPlaybackTime, shouldRenderPlaybackTransport } from "./playback";

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
export default function PlaybackTransport({ playing, cursorTUs, onToggle, disabled, routeVisible }: PlaybackTransportProps) {
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
    </div>,
    slot
  );
}

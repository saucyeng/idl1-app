/**
 * Who drives playback's clock, and how the cursor moves the video (video
 * spec §5.3, C2 §2.1 `video`, lead rulings 2026-10-18). Pure: no DOM, no
 * `HTMLVideoElement`, no timers. The video cell and `Notebook/index.tsx` own
 * the element and the loop; this module only decides.
 *
 * - **Playing, video at the cursor:** the first `video` cell in document
 *   order is the master. Each presented frame's media time
 *   (`requestVideoFrameCallback`'s `mediaTime`) becomes session time and
 *   then the cursor (`playback.ts`'s `advance` with a `media` reading).
 *   Playback speed is the element's `playbackRate`.
 * - **Playing, no video at the cursor** (a gap, outside the footage, not on
 *   this device, no video cell): the existing `requestAnimationFrame` clock.
 * - **Paused:** the cursor drives the video. A pin seeks exactly; a drag
 *   uses `fastSeek` and its settle seeks exactly. Hover never seeks (spec
 *   §10 item 6).
 *
 * The cursor bus carries a window-elapsed offset (R131 Q2);
 * {@link cursorSessionUs} turns it into session time with
 * `cursorTimeInWindow`. No new time base.
 */
import type { ScannedCell } from "../model/cells";
import { cursorTimeInWindow, type AbsoluteSpan } from "../model/viewportWindows";
import type { VideoAtTime } from "../model/videoSpan";

/** The clock playback reads from (spec §5.3). */
export type ClockSource = { kind: "raf" } | { kind: "video"; cellId: string; blobSha256: string };

/** The id of the first `video` cell in document order: the clock master
 *  (C2 §2.1). `null` when the notebook has none with an id. */
export function masterVideoCellId(cells: readonly ScannedCell[]): string | null {
  for (const cell of cells) {
    if (cell.kind === "video" && cell.id !== null) return cell.id;
  }
  return null;
}

/**
 * The clock source for this instant (spec §5.3): the master video cell's
 * video while playing with playable footage at the cursor, else the rAF
 * clock. While paused there is no clock, so this reports `raf`, which the
 * loop does not run while paused.
 *
 * @param playing Whether playback is running.
 * @param masterCellId {@link masterVideoCellId}'s result.
 * @param at What the primary window's session's videos show at the cursor.
 * @param unplayable Blobs the master cell reported it cannot play (a codec
 *   the webview lacks, spec §5.5): the rAF clock runs over them instead,
 *   so playback never stalls on a picture that will not come.
 */
export function clockSourceFor(playing: boolean, masterCellId: string | null, at: VideoAtTime, unplayable: ReadonlySet<string> = new Set()): ClockSource {
  if (!playing || masterCellId === null || at.kind !== "video" || unplayable.has(at.link.blob_sha256)) return { kind: "raf" };
  return { kind: "video", cellId: masterCellId, blobSha256: at.link.blob_sha256 };
}

/** Whether two clock sources are the same (a switch between them restarts
 *  the loop and, into `video`, starts the element). */
export function sameClockSource(a: ClockSource, b: ClockSource): boolean {
  if (a.kind === "raf" || b.kind === "raf") return a.kind === b.kind;
  return a.cellId === b.cellId && a.blobSha256 === b.blobSha256;
}

/**
 * A presented frame's media time (s) as the session-relative µs the cursor
 * counts in: `session_time_s = video_time_s + offset_s` (C1 §6), rounded to
 * whole µs. `null` when the sum is not finite (a bad `mediaTime`), so the
 * loop skips that frame instead of throwing on `BigInt(NaN)`.
 */
export function mediaTimeToSessionUs(mediaTimeS: number, offsetS: number): bigint | null {
  const us = Math.round((mediaTimeS + offsetS) * 1e6);
  return Number.isFinite(us) ? BigInt(us) : null;
}

/** A session-relative µs instant as session time, s. */
export function sessionUsToS(tUs: bigint | number): number {
  return Number(tUs) / 1e6;
}

/**
 * The cursor bus's window-elapsed offset (R131 Q2) as session µs, via
 * `cursorTimeInWindow` against the primary window's span. `null` with no
 * cursor, no resolved primary window, or an offset past its end.
 */
export function cursorSessionUs(offsetUs: number | null, primaryWindowSpan: AbsoluteSpan | null): number | null {
  if (offsetUs === null || primaryWindowSpan === null) return null;
  return cursorTimeInWindow(offsetUs, primaryWindowSpan);
}

/** What moved the cursor (spec §5.3, lead ruling E3). `drag` and `settle`
 *  are a pinned-cursor drag and its end; nothing emits them yet. */
export type SeekTrigger = "hover" | "pin" | "drag" | "settle";

/** How to move the video element: `fast` is `fastSeek` (nearest keyframe,
 *  while dragging), `exact` sets `currentTime`. `videoTimeS` in s. */
export interface SeekCommand {
  mode: "fast" | "exact";
  videoTimeS: number;
}

/**
 * The seek a cursor change asks of the video (spec §5.3, §10 item 6):
 * none while playing (the video is the clock), none on hover, none when
 * there is no playable video at the new cursor; `fast` while dragging;
 * `exact` on a pin and on a drag's settle.
 */
export function seekFor(trigger: SeekTrigger, playing: boolean, at: VideoAtTime): SeekCommand | null {
  if (playing || trigger === "hover" || at.kind !== "video") return null;
  return { mode: trigger === "drag" ? "fast" : "exact", videoTimeS: at.videoTimeS };
}

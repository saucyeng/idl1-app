/**
 * Which linked video covers a session instant, and the offset arithmetic
 * between the two clocks (video spec §3.2, §5.2, §5.4; C1 §6 `videos`).
 * Pure: no DOM, no IPC.
 *
 * One rule ties the clocks together (C1 §6):
 * `session_time_s = video_time_s + offset_s`, session time being the
 * session's t = 0 anchored clock (the `*_time_secs` clock), the same clock
 * the Notebook's session-relative µs (`AbsoluteSpan`, `PlaybackState.tUs`)
 * counts in. Each GoPro chapter is its own entry with its own offset.
 */
import type { Progress } from "../../../../ipc/import";
import { isVideoIpcError, type SessionVideo, type VideoLink, type VideoNoOverlapDetail } from "../../../../ipc/video";

/** One entry's footage on the session clock: `[startS, endS)`, s. */
export interface VideoSessionSpan {
  /** Session time of the first frame, s (`offset_s`). */
  startS: number;
  /** Session time just past the last frame, s (`offset_s + duration_s`). */
  endS: number;
}

/** The entry's footage on the session clock (half-open, s). */
export function videoSessionSpan(link: VideoLink): VideoSessionSpan {
  return { startS: link.offset_s, endS: link.offset_s + link.duration_s };
}

/** Session time, s, of video time `videoTimeS` (s) in `link`. */
export function sessionTimeOf(link: VideoLink, videoTimeS: number): number {
  return videoTimeS + link.offset_s;
}

/** Video time, s, of session time `sessionTimeS` (s) in `link`. Not clamped:
 *  a value outside `[0, duration_s)` means the instant is outside this file. */
export function videoTimeOf(link: VideoLink, sessionTimeS: number): number {
  return sessionTimeS - link.offset_s;
}

/**
 * What the video cell shows at one session instant (video spec §5.2):
 * - `none` — the session has no live linked video (the "Add video" state);
 * - `gap` — videos exist, but none covers this instant (a gap between
 *   chapters, or outside the footage): "no video at this time";
 * - `not-on-device` — the covering entry's blob is not on this device;
 * - `video` — play `link` at `videoTimeS`.
 */
export type VideoAtTime =
  | { kind: "none" }
  | { kind: "gap" }
  | { kind: "not-on-device"; link: SessionVideo }
  | { kind: "video"; link: SessionVideo; videoTimeS: number };

/**
 * Picks the entry whose span covers `sessionTimeS` (s), per spec §5.2.
 * Spans are half-open, so at a chapter boundary the later chapter wins.
 * Should two entries overlap (a file linked twice under different names,
 * or a bad manual offset), the first in `session.json` order wins: the
 * order `SessionDetail.videos` already carries. Unlinked tombstones are
 * skipped even though `get_session` never returns them (C3 §3.12).
 *
 * @param videos The primary window's session's `SessionDetail.videos`.
 * @param sessionTimeS Session time, s, or `null` when there is no cursor.
 */
export function videoAtSessionTime(videos: readonly SessionVideo[], sessionTimeS: number | null): VideoAtTime {
  const live = videos.filter((v) => v.unlinked !== true);
  if (live.length === 0) return { kind: "none" };
  if (sessionTimeS === null || !Number.isFinite(sessionTimeS)) return { kind: "gap" };

  for (const link of live) {
    const span = videoSessionSpan(link);
    if (sessionTimeS >= span.startS && sessionTimeS < span.endS) {
      if (!link.on_device) return { kind: "not-on-device", link };
      return { kind: "video", link, videoTimeS: videoTimeOf(link, sessionTimeS) };
    }
  }
  return { kind: "gap" };
}

/**
 * The Align action's new offset (spec §5.4): the paused video shows the
 * event at `videoTimeS` (s), the pinned cursor marks it at `cursorSessionS`
 * (s), so `offset_s = cursorSessionS − videoTimeS`.
 */
export function alignedOffsetS(cursorSessionS: number, videoTimeS: number): number {
  return cursorSessionS - videoTimeS;
}

/** The two nudge sizes spec §5.4 names. */
export type OffsetNudge = { kind: "frames"; frames: number } | { kind: "ms"; ms: number };

/**
 * `offsetS` (s) moved by one nudge (spec §5.4: ±1 frame, ±10 ms). A frame
 * is `1 / fps` s at the entry's nominal rate; with no usable rate
 * (`fps <= 0` or not finite) a frame nudge leaves the offset unchanged
 * rather than inventing a rate.
 *
 * Direction: a positive nudge increases `offset_s`, which moves the
 * footage **later** on the session clock (each session instant then shows
 * an earlier frame).
 */
export function nudgedOffsetS(offsetS: number, nudge: OffsetNudge, fps: number): number {
  if (nudge.kind === "ms") return offsetS + nudge.ms / 1000;
  if (!(fps > 0) || !Number.isFinite(fps)) return offsetS;
  return offsetS + nudge.frames / fps;
}

/** One video-only step on a paused cell (lead ruling 2026-10-18, E4). */
export type VideoStep = { kind: "frames"; frames: number } | { kind: "seconds"; seconds: number };

/**
 * The paused video's time (s) after a video-only step (lead ruling E4:
 * −1 s / −1 frame / +1 frame / +1 s, moving the video and not the cursor),
 * clamped to `[0, duration_s]`. A frame step with no usable `fps` leaves the
 * time unchanged.
 */
export function steppedVideoTimeS(videoTimeS: number, step: VideoStep, link: Pick<VideoLink, "fps" | "duration_s">): number {
  let next = videoTimeS;
  if (step.kind === "seconds") next = videoTimeS + step.seconds;
  else if (link.fps > 0 && Number.isFinite(link.fps)) next = videoTimeS + step.frames / link.fps;
  return Math.min(Math.max(next, 0), Math.max(link.duration_s, 0));
}

/**
 * The cell's display aspect, height over width (lead ruling E1, provisional):
 * from the entry at the cursor, 9/16 when there is none or its size is
 * unknown (0 px).
 */
export function videoAspect(link: Pick<VideoLink, "width_px" | "height_px"> | null): number {
  if (link === null || !(link.width_px > 0) || !(link.height_px > 0)) return 9 / 16;
  return link.height_px / link.width_px;
}

/**
 * Whether deleting `blobSha256`'s file should be ticked by default in the
 * unlink prompt (video spec §10 item 2): only when no other session links
 * it (`SessionVideo.other_links === 0`, lead ruling E8).
 */
export function deleteFileByDefault(link: Pick<SessionVideo, "other_links">): boolean {
  return link.other_links === 0;
}

/** A codec token (C1 §6 `video_codec`) as a reader knows it. */
function codecName(codec: string): string {
  if (codec === "h264") return "H.264";
  if (codec === "hevc") return "HEVC (H.265)";
  return codec === "" ? "an unknown codec" : codec;
}

/**
 * The cell's text when the webview fails to play an entry (video spec
 * §5.5): names the codec and suggests the GoPro "Most Compatible" (H.264)
 * setting. Transcoding is out of scope (§3.4), so nothing else is offered.
 */
export function playbackErrorText(link: Pick<VideoLink, "file_name" | "video_codec">): string {
  return `${link.file_name} can't be played here: it is ${codecName(link.video_codec)}. Set the GoPro to "Most Compatible" (H.264) for footage this app can play.`;
}

/**
 * One failed `linkVideo` as the "Add video" flow shows it, routed on the C3
 * §2 `kind` and never on `message` (C3 §3.12). `video_no_overlap` names both
 * spans with `formatTime` (UTC ms → text; injected so tests do not depend on
 * the machine's time zone). An error that is not the C3 shape is still
 * reported with the file's name, never dropped.
 */
export function linkErrorText(fileName: string, error: unknown, formatTime: (utcMs: number) => string): string {
  if (!isVideoIpcError(error)) return `${fileName}: could not be linked.`;
  const detail = error.detail ?? {};
  switch (error.kind) {
    case "video_parse":
      return `${fileName} isn't an MP4 this app can read${typeof detail.reason === "string" ? ` (${detail.reason})` : ""}.`;
    case "video_no_overlap": {
      const d = detail as Partial<VideoNoOverlapDetail>;
      const span = (a?: number, b?: number) => (typeof a === "number" && typeof b === "number" ? `${formatTime(a)}–${formatTime(b)}` : "unknown");
      return `${fileName} was recorded at ${span(d.video_start_utc_ms, d.video_end_utc_ms)}, outside this session (${span(d.session_start_utc_ms, d.session_end_utc_ms)}).`;
    }
    case "video_no_time":
      return `${fileName} has no recording time, so it can't be matched to a session.`;
    default:
      return `${fileName}: ${error.message}`;
  }
}

/** The "Add video" progress line for one file (C3 §3.12 phases `copying`,
 *  bytes; then `probing`). */
export function linkProgressText(fileName: string, progress: Progress): string {
  if (progress.phase === "copying") {
    const pct = progress.total !== null && progress.total > 0 ? ` ${Math.floor((progress.done / progress.total) * 100)}%` : "";
    return `Copying ${fileName}${pct}`;
  }
  if (progress.phase === "probing") return `Reading ${fileName}`;
  return `${fileName}: ${progress.phase}`;
}

/** `bytes` as the unlink prompt's size text, e.g. "4.1 GB" (spec §10 item 2),
 *  in decimal units, one decimal place from GB down to MB, whole KB below. */
export function formatVideoSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

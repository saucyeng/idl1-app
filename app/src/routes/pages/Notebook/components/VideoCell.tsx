import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { linkVideo, reestimateVideoOffset, setVideoOffset, unlinkVideo, videoUrl, type SessionVideo } from "../../../../ipc/video";
import { formatPlaybackTime } from "../interaction/playback";
import { mediaTimeToSessionUs } from "../interaction/videoClock";
import {
  alignedOffsetS,
  deleteFileByDefault,
  formatVideoSize,
  linkErrorText,
  linkProgressText,
  nudgedOffsetS,
  playbackErrorText,
  steppedVideoTimeS,
  videoAspect,
  videoAtSessionTime,
  type OffsetNudge,
  type VideoStep,
} from "../model/videoSpan";

/** Props for {@link VideoCell}. */
export interface VideoCellProps {
  /** The primary window's session (video spec §5.2), or `null` with nothing selected. */
  sessionId: string | null;
  /** That session's `SessionDetail.videos`, or `null` while it loads. */
  videos: readonly SessionVideo[] | null;
  /** The effective shared cursor (pinned, or playback's clock while
   *  playing), session-relative µs; `null` when there is none. */
  cursorUs: number | null;
  /** The pinned cursor, session-relative µs, for Align (spec §5.4). */
  pinnedCursorUs: number | null;
  /** Whether playback is running. */
  playing: boolean;
  /** Playback speed, a multiple of real time: the element's `playbackRate`. */
  speed: number;
  /** Whether this is the first video cell in document order: the clock
   *  master while playing (C2 §2.1, spec §5.3). */
  isMaster: boolean;
  /** Master only: each presented frame's time, session-relative µs. */
  onMasterFrame: (sessionUs: bigint) => void;
  /** Master only: the webview cannot play this blob (spec §5.5), so the
   *  rAF clock must take over. */
  onUnplayable: (blobSha256: string) => void;
  /** A link, unlink or offset change was written; re-read the session. */
  onVideosChanged: (sessionId: string) => void;
  /** Called with `true` on mount and `false` on unmount, so the page only
   *  hands the clock to a master that is on screen to report frames (a
   *  hidden cells column unmounts it). */
  onMountedChange: (mounted: boolean) => void;
}

/** The step buttons (lead ruling E4): they move only the paused video. */
const STEPS: { label: string; title: string; step: VideoStep }[] = [
  { label: "−1 s", title: "Back one second (video only)", step: { kind: "seconds", seconds: -1 } },
  { label: "−1 f", title: "Back one frame (video only)", step: { kind: "frames", frames: -1 } },
  { label: "+1 f", title: "Forward one frame (video only)", step: { kind: "frames", frames: 1 } },
  { label: "+1 s", title: "Forward one second (video only)", step: { kind: "seconds", seconds: 1 } },
];

/** The offset nudges (spec §5.4: ±1 frame, ±10 ms). */
const NUDGES: { label: string; title: string; nudge: OffsetNudge }[] = [
  { label: "−1 f", title: "Video one frame earlier on the data", nudge: { kind: "frames", frames: -1 } },
  { label: "−10 ms", title: "Video 10 ms earlier on the data", nudge: { kind: "ms", ms: -10 } },
  { label: "+10 ms", title: "Video 10 ms later on the data", nudge: { kind: "ms", ms: 10 } },
  { label: "+1 f", title: "Video one frame later on the data", nudge: { kind: "frames", frames: 1 } },
];

/** A local wall-clock time for the no-overlap message. */
function formatLocalTime(utcMs: number): string {
  return new Date(utcMs).toLocaleString();
}

/** Seconds as `mm:ss.mmm`, through the transport's own formatter. */
function formatSeconds(s: number): string {
  return formatPlaybackTime(BigInt(Math.max(0, Math.round(s * 1e6))));
}

/**
 * The `video` cell (C2 §2.1, video spec §5): the primary window's session's
 * video at the shared cursor. In the document flow, sized by the aspect of
 * the entry at the cursor with a 16:9 fallback, capped at 60vh (lead ruling
 * E1). While paused, a pin seeks it exactly; hover never does (§10 item 6).
 * While playing, the master cell's presented frames drive the cursor
 * (§5.3). Paused, step buttons move the video alone so Align can match it
 * to the pinned cursor (E4). No native controls.
 *
 * Not unit-tested (CLAUDE.md §4): its decisions live in `model/videoSpan.ts`
 * and `interaction/videoClock.ts`.
 */
export default function VideoCell({
  sessionId,
  videos,
  cursorUs,
  pinnedCursorUs,
  playing,
  speed,
  isMaster,
  onMasterFrame,
  onUnplayable,
  onVideosChanged,
  onMountedChange,
}: VideoCellProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onMountedChangeRef = useRef(onMountedChange);
  onMountedChangeRef.current = onMountedChange;
  useEffect(() => {
    onMountedChangeRef.current(true);
    return () => onMountedChangeRef.current(false);
  }, []);
  const at = useMemo(() => videoAtSessionTime(videos ?? [], cursorUs === null ? null : cursorUs / 1e6), [videos, cursorUs]);
  const link = at.kind === "video" ? at.link : null;
  const blob = link?.blob_sha256 ?? null;
  const src = blob === null ? null : videoUrl(blob);
  const [failedBlob, setFailedBlob] = useState<string | null>(null);
  const failed = blob !== null && failedBlob === blob;
  const [pausedVideoS, setPausedVideoS] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [unlinkTarget, setUnlinkTarget] = useState<SessionVideo | null>(null);
  const [deleteFile, setDeleteFile] = useState(false);

  // Refs read by the frame callback, so the callback is registered once per
  // play rather than once per render.
  const offsetRef = useRef(0);
  offsetRef.current = link?.offset_s ?? 0;
  const onMasterFrameRef = useRef(onMasterFrame);
  onMasterFrameRef.current = onMasterFrame;
  const atVideoS = at.kind === "video" ? at.videoTimeS : null;
  const atVideoSRef = useRef(atVideoS);
  atVideoSRef.current = atVideoS;

  // Paused: the pinned cursor seeks the video exactly (spec §5.3). Re-runs
  // on a new pin or a new source, which is also how a step's video-only
  // position gives way to the next pin (lead ruling E4).
  useEffect(() => {
    const el = videoRef.current;
    if (playing || el === null || atVideoS === null) return;
    el.pause();
    el.currentTime = atVideoS;
    setPausedVideoS(atVideoS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `atVideoS` changes with the cursor, which is the trigger
  }, [playing, src, cursorUs]);

  // Playing: start the element at the cursor's frame and the transport's
  // speed; pause when playback stops. A new chapter is a new `src`.
  useEffect(() => {
    const el = videoRef.current;
    if (el === null) return;
    if (!playing || src === null || failed) {
      el.pause();
      return;
    }
    if (atVideoSRef.current !== null) el.currentTime = atVideoSRef.current;
    el.playbackRate = speed;
    el.play().catch(() => {
      // A rejected play() is either a pause racing it (harmless) or a
      // decode failure, which also fires the element's `error` event.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speed is applied by its own effect below
  }, [playing, src, failed]);

  useEffect(() => {
    const el = videoRef.current;
    if (el !== null) el.playbackRate = speed;
  }, [speed]);

  // A following (non-master) cell resyncs when it drifts by more than a
  // few frames from the cursor the master drives.
  useEffect(() => {
    const el = videoRef.current;
    if (!playing || isMaster || el === null || atVideoS === null) return;
    if (Math.abs(el.currentTime - atVideoS) > 0.25) el.currentTime = atVideoS;
  }, [playing, isMaster, atVideoS]);

  // Master: each presented frame's media time becomes the cursor (§5.3).
  useEffect(() => {
    const el = videoRef.current;
    if (!playing || !isMaster || el === null || src === null || failed) return;

    const report = (mediaTimeS: number) => {
      const us = mediaTimeToSessionUs(mediaTimeS, offsetRef.current);
      if (us !== null) onMasterFrameRef.current(us);
    };

    if (typeof el.requestVideoFrameCallback === "function") {
      let handle = 0;
      const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        report(metadata.mediaTime);
        handle = el.requestVideoFrameCallback(onFrame);
      };
      handle = el.requestVideoFrameCallback(onFrame);
      return () => el.cancelVideoFrameCallback(handle);
    }
    // A webview without `requestVideoFrameCallback`: read the element's own
    // clock once per animation frame instead.
    let raf = 0;
    const loop = () => {
      if (!el.paused) report(el.currentTime);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, isMaster, src, failed]);

  function handleEnded(): void {
    // The chapter ran out: hand the cursor its end, so the next chapter
    // (or the rAF clock over a gap) takes over rather than stalling.
    if (!playing || !isMaster || link === null) return;
    onMasterFrame(BigInt(Math.round((link.offset_s + link.duration_s) * 1e6)));
  }

  function handleError(): void {
    if (blob === null) return;
    setFailedBlob(blob);
    if (isMaster) onUnplayable(blob);
  }

  async function run(label: string, fileName: string, action: () => Promise<unknown>): Promise<void> {
    if (sessionId === null) return;
    setBusy(label);
    setMessages([]);
    try {
      await action();
      onVideosChanged(sessionId);
    } catch (error) {
      setMessages([linkErrorText(fileName, error, formatLocalTime)]);
    } finally {
      setBusy(null);
    }
  }

  async function handleAddVideo(): Promise<void> {
    if (sessionId === null) return;
    const picked = await open({ multiple: true, filters: [{ name: "Video", extensions: ["mp4", "MP4"] }] });
    if (picked === null) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    const errors: string[] = [];
    for (const path of paths) {
      const fileName = path.split(/[\\/]/).pop() ?? path;
      setBusy(`Linking ${fileName}`);
      try {
        await linkVideo(sessionId, path, (p) => setBusy(linkProgressText(fileName, p)));
      } catch (error) {
        errors.push(linkErrorText(fileName, error, formatLocalTime));
      }
    }
    setBusy(null);
    setMessages(errors);
    onVideosChanged(sessionId);
  }

  function handleStep(step: VideoStep): void {
    const el = videoRef.current;
    if (el === null || link === null || playing) return;
    const next = steppedVideoTimeS(el.currentTime, step, link);
    el.currentTime = next;
    setPausedVideoS(next);
  }

  function handleAlign(): void {
    const el = videoRef.current;
    if (el === null || link === null || pinnedCursorUs === null || sessionId === null) return;
    const offsetS = alignedOffsetS(pinnedCursorUs / 1e6, el.currentTime);
    void run("Aligning", link.file_name, () => setVideoOffset(sessionId, link.blob_sha256, offsetS));
  }

  function handleNudge(nudge: OffsetNudge): void {
    if (link === null || sessionId === null) return;
    const offsetS = nudgedOffsetS(link.offset_s, nudge, link.fps);
    void run("Nudging", link.file_name, () => setVideoOffset(sessionId, link.blob_sha256, offsetS));
  }

  function openUnlink(target: SessionVideo): void {
    setUnlinkTarget(target);
    setDeleteFile(deleteFileByDefault(target));
  }

  function confirmUnlink(): void {
    const target = unlinkTarget;
    if (target === null || sessionId === null) return;
    setUnlinkTarget(null);
    void run("Unlinking", target.file_name, () => unlinkVideo(sessionId, target.blob_sha256, deleteFile));
  }

  const aspect = videoAspect(link);
  const live = (videos ?? []).filter((v) => v.unlinked !== true);
  const paused = !playing;
  const canEdit = sessionId !== null && busy === null;

  let notice: string | null = null;
  if (sessionId === null) notice = "Select a session to show its video.";
  else if (videos === null) notice = "Loading…";
  else if (at.kind === "none") notice = "No video linked to this session.";
  else if (at.kind === "gap") notice = cursorUs === null ? "Pin the cursor on a chart to show the video here." : "No video at this time.";
  else if (at.kind === "not-on-device") notice = `${at.link.file_name} is not on this device.`;
  else if (failed && link !== null) notice = playbackErrorText(link);

  return (
    <div className="flex w-full flex-col gap-1 font-mono text-xs">
      <div
        className="relative mx-auto flex w-full items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-rule bg-black"
        style={{ aspectRatio: `${1 / aspect}`, maxHeight: "60vh" }}
      >
        <video
          ref={videoRef}
          src={src ?? undefined}
          hidden={src === null || failed}
          preload="auto"
          playsInline
          className="h-full w-full object-contain"
          onEnded={handleEnded}
          onError={handleError}
          onSeeked={(e) => {
            if (paused) setPausedVideoS(e.currentTarget.currentTime);
          }}
        />
        {notice !== null && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-fg-dim">{notice}</p>}
        {sessionId !== null && at.kind === "none" && (
          <Button size="sm" className="absolute bottom-4" disabled={!canEdit} onClick={() => void handleAddVideo()}>
            Add video
          </Button>
        )}
      </div>

      {link !== null && !failed && paused && (
        <div className="flex flex-wrap items-center gap-1">
          {STEPS.map((s) => (
            <Button key={s.label} size="xs" title={s.title} onClick={() => handleStep(s.step)}>
              {s.label}
            </Button>
          ))}
          <span className="px-1 text-fg-dim">video {pausedVideoS === null ? "–" : formatSeconds(pausedVideoS)}</span>
          <Button
            size="xs"
            filled
            disabled={!canEdit || pinnedCursorUs === null}
            title={pinnedCursorUs === null ? "Pin the cursor on the event first" : "Line the paused frame up with the pinned cursor"}
            onClick={handleAlign}
          >
            Align
          </Button>
          <span className="px-1 text-fg-dim">offset</span>
          {NUDGES.map((n) => (
            <Button key={n.label} size="xs" title={n.title} disabled={!canEdit} onClick={() => handleNudge(n.nudge)}>
              {n.label}
            </Button>
          ))}
        </div>
      )}

      {busy !== null && <p className="text-fg-dim">{busy}</p>}
      {messages.map((m) => (
        <p key={m} className="text-accent">
          {m}
        </p>
      ))}

      {live.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {live.map((v) => (
            <li key={v.blob_sha256} className={`flex flex-wrap items-center gap-2 ${v.blob_sha256 === blob ? "text-fg" : "text-fg-dim"}`}>
              <span className="truncate">{v.file_name}</span>
              <span>
                offset {v.offset_s.toFixed(3)} s · {v.sync_method}
                {v.on_device ? "" : " · not on this device"}
              </span>
              <Button size="xs" disabled={!canEdit} title="Estimate the offset again from the file (replaces a manual one)" onClick={() => void run("Re-estimating", v.file_name, () => reestimateVideoOffset(sessionId as string, v.blob_sha256))}>
                Re-estimate
              </Button>
              <Button size="xs" emphasis="accent" disabled={!canEdit} onClick={() => openUnlink(v)}>
                Unlink
              </Button>
            </li>
          ))}
          <li>
            <Button size="xs" disabled={!canEdit} onClick={() => void handleAddVideo()}>
              Add video
            </Button>
          </li>
        </ul>
      )}

      <Dialog open={unlinkTarget !== null} onOpenChange={(o) => (o ? undefined : setUnlinkTarget(null))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unlink video</DialogTitle>
            <DialogDescription>{unlinkTarget?.file_name} will no longer show with this session.</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 font-mono text-sm">
            <Checkbox checked={deleteFile} onCheckedChange={(c) => setDeleteFile(c === true)} />
            Also delete the video file ({unlinkTarget === null ? "" : formatVideoSize(unlinkTarget.size_bytes)})
          </label>
          {unlinkTarget !== null && unlinkTarget.other_links > 0 && (
            <p className="font-mono text-xs text-fg-dim">
              {unlinkTarget.other_links === 1 ? "Another session links" : `${unlinkTarget.other_links} other sessions link`} this file; it is kept while they do.
            </p>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => setUnlinkTarget(null)}>
              Cancel
            </Button>
            <Button size="sm" emphasis="accent" filled onClick={confirmUnlink}>
              Unlink
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

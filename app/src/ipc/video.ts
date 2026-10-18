import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";

import type { Progress } from "./import";
import type { IpcError } from "./workbook";

// C3 §3.12 (video spec `2026-10-16-idl1-video-DRAFT.md`, step 1). Types are
// core's `idl_rs::video` serialised as is; `VideoLink` is one C1 §6
// `videos` entry. All five commands are `async` on the Rust side (R201).

/** How a video's `offset_s` was set (C1 §6). Only `"manual"` is never
 *  overwritten automatically; `reestimateVideoOffset` is the one way to
 *  replace it. */
export type VideoSyncMethod = "gpmf" | "creation_time" | "manual";

/** One C1 §6 `session.json` `videos` entry — one linked MP4 file (each GoPro
 *  chapter is its own entry). */
export interface VideoLink {
  /** 64 lowercase hex: the MP4's blob (C4 §2); the entry's identity. */
  blob_sha256: string;
  /** u64, bytes. */
  size_bytes: number;
  /** The name it was linked from; display only. */
  file_name: string;
  /** `"h264"` | `"hevc"` | the `stsd` fourcc as text otherwise. */
  video_codec: string;
  /** u32, px. */
  width_px: number;
  /** u32, px. */
  height_px: number;
  /** f64, frames/s, nominal. */
  fps: number;
  /** f64, s. */
  duration_s: number;
  /** f64, s: `session_time_s = video_time_s + offset_s`, session time on
   *  the t = 0 anchored `*_time_secs` clock. */
  offset_s: number;
  sync_method: VideoSyncMethod;
  /** A tombstone (C4 §6); omitted when false. */
  unlinked?: boolean;
  /** i64, UTC ms: when this entry last changed; the merge tiebreak. */
  updated_at_ms: number;
}

/** A `SessionDetail.videos` element (C3 §3.12): a live entry plus whether
 *  its blob is present on this device. `false` is a normal state (deleted
 *  here, or a mobile device that does not hold video, C4 §6) — the player
 *  says "not on this device". */
export interface SessionVideo extends VideoLink {
  on_device: boolean;
}

/** The error kinds §3.12 adds to C3 §2's vocabulary (core's `VideoError`),
 *  plus the two shared kinds these commands also return. */
export type VideoErrorKind = "video_parse" | "video_no_overlap" | "video_ambiguous" | "video_no_time" | "not_found" | "io";

/** An `IpcError` whose `kind` is one of {@link VideoErrorKind}. `detail`:
 *  `video_parse` → `{ reason }`; `video_no_overlap` →
 *  {@link VideoNoOverlapDetail}; `video_ambiguous` → `{ session_ids }`;
 *  `video_no_time` (a file with no recording time; `matchVideos` and the
 *  inbox only, lead C3 addition 2026-10-18) → none. */
export interface VideoIpcError extends IpcError {
  kind: VideoErrorKind;
}

/** `video_no_overlap`'s `detail` (lead C3 addition 2026-10-18): both spans,
 *  i64 UTC ms. */
export interface VideoNoOverlapDetail {
  video_start_utc_ms: number;
  video_end_utc_ms: number;
  session_start_utc_ms: number;
  session_end_utc_ms: number;
}

const VIDEO_ERROR_KINDS: ReadonlySet<string> = new Set<VideoErrorKind>(["video_parse", "video_no_overlap", "video_ambiguous", "video_no_time", "not_found", "io"]);

/** True when `error` is a C3 §2 error shape with a {@link VideoErrorKind}. */
export function isVideoIpcError(error: unknown): error is VideoIpcError {
  if (typeof error !== "object" || error === null) return false;
  const kind = (error as { kind?: unknown }).kind;
  return typeof kind === "string" && VIDEO_ERROR_KINDS.has(kind) && typeof (error as { message?: unknown }).message === "string";
}

/** One `matchVideos` row (C3 §3.12). */
export interface VideoMatch {
  /** The path as passed in. */
  path: string;
  /** Sessions whose time span this file's span overlaps; empty on error. */
  session_ids: string[];
  /** `null` when the container header was read. */
  error: IpcError | null;
}

/** Links the MP4 at `path` to `sessionId` (C3 §3.12): streams it into
 *  `blobs/` (phase `"copying"`, bytes; skipped when the blob exists), reads
 *  the container (phase `"probing"`), estimates the offset and appends the
 *  entry. Linking an already-linked (even unlinked) file returns that entry
 *  re-linked with its offset kept. Rejects with a {@link VideoIpcError}. */
export async function linkVideo(sessionId: string, path: string, onProgress: (p: Progress) => void): Promise<VideoLink> {
  const channel = new Channel<Progress>();
  channel.onmessage = onProgress;
  return invoke<VideoLink>("link_video", { sessionId, path, onProgress: channel });
}

/** For each file, the sessions its time span overlaps (C3 §3.12) — the drop
 *  and inbox flows. Reads only the container header. */
export async function matchVideos(paths: string[]): Promise<VideoMatch[]> {
  return invoke<VideoMatch[]>("match_videos", { paths });
}

/** Sets an entry's offset by hand (C3 §3.12, video spec §5.4). `offsetS` in
 *  s, `session_time_s = video_time_s + offsetS`. Resolves with the entry,
 *  `sync_method: "manual"`. */
export async function setVideoOffset(sessionId: string, blobSha256: string, offsetS: number): Promise<VideoLink> {
  return invoke<VideoLink>("set_video_offset", { sessionId, blobSha256, offsetS });
}

/** Re-runs the automatic estimate for one entry (C3 §3.12) — the only way a
 *  manual offset is replaced. */
export async function reestimateVideoOffset(sessionId: string, blobSha256: string): Promise<VideoLink> {
  return invoke<VideoLink>("reestimate_video_offset", { sessionId, blobSha256 });
}

/** Unlinks one entry, leaving a tombstone (C3 §3.12). `deleteFile` removes
 *  the blob on this device only, and only when no other session's live
 *  entry references it; otherwise Rust ignores it and keeps the blob. */
export async function unlinkVideo(sessionId: string, blobSha256: string, deleteFile: boolean): Promise<VideoLink> {
  return invoke<VideoLink>("unlink_video", { sessionId, blobSha256, deleteFile });
}

/** The `<video src>` URL for a linked blob: the `idl1-video` URI scheme
 *  (C3 §3.12), built by `convertFileSrc` so each platform gets its own form
 *  (`http://idl1-video.localhost/<sha256>` on Windows and Android). No
 *  video bytes cross IPC. */
export function videoUrl(sha256: string): string {
  return convertFileSrc(sha256, "idl1-video");
}

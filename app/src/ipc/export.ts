import { invoke } from "@tauri-apps/api/core";

/** `ffmpeg_info`'s answer (C3 §3.17). */
export interface FfmpegInfo {
  path: string;
  /** `major.minor`, `null` when unknown. */
  version: string | null;
  usable: boolean;
  /** What is wrong and what to do; `null` when usable. */
  problem: string | null;
  /** Which of the offered encoders this ffmpeg has (`libx264`, `libx265`, `h264_nvenc`, `hevc_nvenc`). */
  encoders: string[];
}

/** A box on the output frame, px. */
export interface PxBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `start_overlay_export`'s request (C3 §3.17). */
export interface ExportRequest {
  video_sha256: string;
  /** Where in the clip to start, s. */
  clip_from_s: number;
  /** How long, s. */
  duration_s: number;
  /** Output frame, px, both even. */
  width: number;
  height: number;
  /** Frames per second, the clip's own. */
  fps: number;
  video_box: PxBox;
  /** One of `FfmpegInfo.encoders`. */
  encoder: string;
  /** Constant quality (ffmpeg's CRF, or CQ on NVIDIA), 14–40: lower is better and bigger. */
  quality: number;
  /** Encoder speed; slower is smaller at the same quality. */
  speed: "fast" | "medium" | "slow";
  out_path: string;
  /** ffmpeg to run; `null` for `ffmpeg` on PATH. */
  ffmpeg: string | null;
}

/** `finish_overlay_export`'s result. */
export interface ExportDone {
  path: string;
  bytes: number;
  seconds: number;
}

/** C3 §3.17 `ffmpeg_info`: the ffmpeg export would use and whether it is new enough. */
export async function ffmpegInfo(path: string | null): Promise<FfmpegInfo> {
  return invoke<FfmpegInfo>("ffmpeg_info", { path });
}

/** C3 §3.17 `start_overlay_export`: the job id. */
export async function startOverlayExport(request: ExportRequest): Promise<number> {
  return invoke<number>("start_overlay_export", { request });
}

/** C3 §3.17 `push_overlay_frame`: one PNG frame, raw bytes. */
export async function pushOverlayFrame(id: number, png: Uint8Array): Promise<void> {
  await invoke("push_overlay_frame", png, { headers: { "x-export": String(id) } });
}

/** C3 §3.17 `finish_overlay_export`. */
export async function finishOverlayExport(id: number): Promise<ExportDone> {
  return invoke<ExportDone>("finish_overlay_export", { id });
}

/** C3 §3.17 `cancel_overlay_export`. */
export async function cancelOverlayExport(id: number): Promise<boolean> {
  return invoke<boolean>("cancel_overlay_export", { id });
}

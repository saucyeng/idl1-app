/**
 * The overlay export loop (video step 3, 2026-11-23): for each frame of the
 * plan, read the readouts at that frame's session time, draw the layer,
 * send it to ffmpeg; then wait for the file. Every side effect is injected,
 * so the loop is tested without the app. It runs off the drawing path (an
 * export is a job, not an interaction), one frame in flight at a time.
 */
import type { ExportDone, ExportRequest } from "../../../../ipc/export";
import type { ReadoutHandle, ReadoutTail, ReadoutValues } from "../../../../ipc/readout";
import type { ReadoutFrame } from "../readout/frame";
import type { DisplayUnits } from "../readout/units";
import { frameTimeUs, type ExportPlan } from "./overlayPlan";

/** What {@link runOverlayExport} calls. */
export interface ExportDeps {
  openReadout(names: string[]): Promise<ReadoutHandle>;
  readReadout(handle: number, tUs: number, tail: ReadoutTail | null): Promise<ReadoutValues>;
  closeReadout(handle: number): Promise<void>;
  start(request: ExportRequest): Promise<number>;
  push(id: number, png: Uint8Array): Promise<void>;
  finish(id: number): Promise<ExportDone>;
  cancel(id: number): Promise<boolean>;
  /** Draws one frame's layer at the plan's size, as PNG bytes; `tUs` is the frame's session time. */
  render(frame: ReadoutFrame, tUs: number): Promise<Uint8Array>;
}

/** What to export. */
export interface ExportJob {
  plan: ExportPlan;
  /** The request's fixed parts; the plan fills in the rest. */
  videoSha256: string;
  encoder: ExportRequest["encoder"];
  quality: ExportRequest["quality"];
  speed: ExportRequest["speed"];
  outPath: string;
  ffmpeg: string | null;
  /** The readout names to open. */
  names: string[];
  /** The g-g tail, seconds (0 for none); spaced one frame apart. */
  tailS: number;
  display: DisplayUnits;
}

/** How an export ended. */
export type ExportOutcome = { kind: "done"; done: ExportDone } | { kind: "cancelled" };

/** The request ffmpeg starts with for `job`. */
export function exportRequest(job: ExportJob): ExportRequest {
  const p = job.plan;
  return {
    video_sha256: job.videoSha256,
    clip_from_s: p.clipFromS,
    duration_s: p.durationS,
    width: p.width,
    height: p.height,
    fps: p.fps,
    video_box: p.videoBox,
    encoder: job.encoder,
    quality: job.quality,
    speed: job.speed,
    out_path: job.outPath,
    ffmpeg: job.ffmpeg,
  };
}

/**
 * Runs `job`: `onProgress(done, total)` after each frame; `isCancelled()`
 * checked before each, and a cancel stops ffmpeg and deletes the partial
 * file. A failure part-way also stops ffmpeg before rethrowing.
 */
export async function runOverlayExport(deps: ExportDeps, job: ExportJob, onProgress: (done: number, total: number) => void, isCancelled: () => boolean): Promise<ExportOutcome> {
  const { plan } = job;
  const handle = job.names.length > 0 ? await deps.openReadout(job.names) : null;
  const tailCount = job.tailS > 0 ? Math.min(1024, Math.max(1, Math.round(job.tailS * plan.fps))) : 0;
  const tail: ReadoutTail | null = tailCount > 0 ? { count: tailCount, step_us: Math.round(1e6 / plan.fps) } : null;
  let id: number | null = null;
  try {
    id = await deps.start(exportRequest(job));
    for (let i = 0; i < plan.frames; i++) {
      if (isCancelled()) {
        await deps.cancel(id);
        return { kind: "cancelled" };
      }
      const tUs = frameTimeUs(plan, i);
      const values = handle === null ? null : await deps.readReadout(handle.handle, tUs, tail);
      const frame: ReadoutFrame = {
        values: values?.values ?? {},
        tail: values?.tail ?? {},
        units: handle?.units ?? {},
        extent: handle?.extent ?? {},
        display: job.display,
        tail_step_s: 1 / plan.fps,
      };
      await deps.push(id, await deps.render(frame, tUs));
      onProgress(i + 1, plan.frames);
    }
    const done = await deps.finish(id);
    id = null;
    return { kind: "done", done };
  } catch (error) {
    if (id !== null) await deps.cancel(id).catch(() => false);
    throw error;
  } finally {
    if (handle !== null) await deps.closeReadout(handle.handle).catch(() => undefined);
  }
}

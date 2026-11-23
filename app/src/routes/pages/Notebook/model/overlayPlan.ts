/**
 * The overlay canvas's layouts and export plan (video steps 2–3,
 * 2026-11-23). Pure: what a preset puts where, what part of a clip an export
 * covers, the output frame and the video's box in pixels, and each frame's
 * session time.
 */
import type { VideoLink } from "../../../../ipc/video";
import { aspectOf, type CanvasBox, type CanvasLayout, type CanvasSize } from "./canvasLayout";

/** The starting layouts the canvas offers. */
export type OverlayPreset = "classic" | "side" | "reel";

/** One readout cell to place: its id and what it draws. */
export interface PlacedReadout {
  id: string;
  kind: "gauge" | "number" | "gg" | "trace" | "spectrogram";
}

/** The frame shape a preset uses for a clip of width/height `clipAspect`. */
export function presetSize(preset: OverlayPreset, clipAspect: number): CanvasSize {
  if (preset === "reel") return "9:16";
  if (preset === "side") return "16:9";
  return Math.abs(clipAspect - 4 / 3) < Math.abs(clipAspect - 16 / 9) ? "4:3" : "16:9";
}

/** Each readout kind's natural width ÷ height (its drawing's viewBox). */
const KIND_ASPECT: Record<PlacedReadout["kind"], number> = { gauge: 200 / 180, gg: 1, number: 200 / 90, trace: 400 / 120, spectrogram: 400 / 120 };

/** How much of a column a readout takes, relative to a dial. */
const KIND_WEIGHT: Record<PlacedReadout["kind"], number> = { gauge: 1, gg: 1, number: 0.5, trace: 0.6, spectrogram: 0.6 };

const GAP = 0.015;

/**
 * Stacks `items` down a column `[x, x + w] × [y, y + h]` (frame fractions),
 * each a share of the height by {@link KIND_WEIGHT}, fitted to its kind's
 * shape and centred in its share. `frameAspect` turns heights into widths.
 */
function stackColumn(cells: Record<string, CanvasBox>, items: readonly PlacedReadout[], x: number, y: number, w: number, h: number, frameAspect: number): void {
  if (items.length === 0) return;
  const total = items.reduce((sum, r) => sum + KIND_WEIGHT[r.kind], 0);
  const free = h - GAP * (items.length - 1);
  let top = y;
  for (const r of items) {
    const slotH = (free * KIND_WEIGHT[r.kind]) / total;
    // Fit the kind's shape inside the slot: as tall as the slot unless that is too wide.
    let bh = slotH;
    let bw = (bh * KIND_ASPECT[r.kind]) / frameAspect;
    if (bw > w) {
      bw = w;
      bh = (bw * frameAspect) / KIND_ASPECT[r.kind];
    }
    cells[r.id] = { x: x + (w - bw) / 2, y: top + (slotH - bh) / 2, w: bw, h: bh, z: 1 };
    top += slotH + GAP;
  }
}

/** Lays `items` side by side across a band `[x, x + w] × [y, y + h]`, each fitted to its kind's shape. */
function fillRow(cells: Record<string, CanvasBox>, items: readonly PlacedReadout[], x: number, y: number, w: number, h: number, frameAspect: number): void {
  if (items.length === 0) return;
  const slotW = (w - GAP * (items.length - 1)) / items.length;
  items.forEach((r, i) => {
    let bh = h;
    let bw = (bh * KIND_ASPECT[r.kind]) / frameAspect;
    if (bw > slotW) {
      bw = slotW;
      bh = (bw * frameAspect) / KIND_ASPECT[r.kind];
    }
    cells[r.id] = { x: x + i * (slotW + GAP) + (slotW - bw) / 2, y: y + (h - bh) / 2, w: bw, h: bh, z: 1 };
  });
}

/**
 * The layout `preset` gives `videoCellId` and `readouts` for a clip of
 * `clipAspect` (width ÷ height). Dials are gauges and g-g plots; traces
 * scroll; numbers are the small ones.
 * - `classic`: the clip fills a frame of its own shape; dials in the bottom
 *   corners then top left, numbers stacked top right, traces along the
 *   bottom between the dials.
 * - `side`: 16:9, the clip centred at full height, readouts in a column on
 *   each side (2026-11-23, Isaac: "panels on each side").
 * - `reel`: 9:16, the clip centred across the width, dials in a band above
 *   it, traces and numbers in a band below ("data on the top and bottom").
 */
export function presetLayout(preset: OverlayPreset, videoCellId: string, readouts: readonly PlacedReadout[], clipAspect: number): CanvasLayout {
  const size = presetSize(preset, clipAspect);
  const frameAspect = aspectOf(size);
  const cells: Record<string, CanvasBox> = {};
  const dials = readouts.filter((r) => r.kind === "gauge" || r.kind === "gg");
  const numbers = readouts.filter((r) => r.kind === "number");
  // Spectrograms scroll like traces and are placed with them.
  const traces = readouts.filter((r) => r.kind === "trace" || r.kind === "spectrogram");
  const m = 0.02;

  if (preset === "classic") {
    cells[videoCellId] = { x: 0, y: 0, w: 1, h: 1, z: 0 };
    const h = 0.3;
    const w = (h * KIND_ASPECT.gauge) / frameAspect;
    // Bottom-left, bottom-right, top-left, then up the left side.
    dials.forEach((r, i) => {
      const x = i === 1 ? 1 - m - w : m;
      const y = i === 0 || i === 1 ? 1 - m - h : i === 2 ? m : 1 - m - h - (i - 2) * (h + GAP);
      cells[r.id] = { x, y, w, h, z: 1 };
    });
    stackColumn(cells, numbers, 1 - m - 0.22, m, 0.22, Math.min(0.5, numbers.length * 0.13), frameAspect);
    // Traces stack up from the bottom between the two bottom dials.
    const tx = m + w + GAP;
    const tw = 1 - 2 * (m + w + GAP);
    traces.forEach((r, i) => {
      const th = Math.min(0.16, (tw * frameAspect) / KIND_ASPECT.trace);
      cells[r.id] = { x: tx, y: 1 - m - th - i * (th + GAP), w: tw, h: th, z: 1 };
    });
  } else if (preset === "side") {
    const vw = Math.min(1, clipAspect / frameAspect);
    const vx = (1 - vw) / 2;
    cells[videoCellId] = { x: vx, y: 0, w: vw, h: 1, z: 0 };
    const colW = Math.max(0.04, vx - 2 * GAP);
    // Dials first, then traces, then numbers, dealt alternately left and right.
    const items = [...dials, ...traces, ...numbers];
    const left = items.filter((_, i) => i % 2 === 0);
    const right = items.filter((_, i) => i % 2 === 1);
    stackColumn(cells, left, GAP, m, colW, 1 - 2 * m, frameAspect);
    stackColumn(cells, right, 1 - GAP - colW, m, colW, 1 - 2 * m, frameAspect);
  } else {
    const vh = Math.min(1, frameAspect / clipAspect);
    const vy = (1 - vh) / 2;
    cells[videoCellId] = { x: 0, y: vy, w: 1, h: vh, z: 0 };
    const band = Math.max(0.04, vy - 2 * GAP);
    // Above: the dials in a row (three at most; the rest go below).
    const above = dials.slice(0, 3);
    const below = [...dials.slice(3), ...traces, ...numbers];
    fillRow(cells, above, m, GAP, 1 - 2 * m, band, frameAspect);
    // Below: traces full width, numbers sharing a row.
    const rows: PlacedReadout[][] = [];
    for (const r of below.filter((r) => r.kind !== "number")) rows.push([r]);
    const nums = below.filter((r) => r.kind === "number");
    if (nums.length > 0) rows.push(nums);
    const belowTop = vy + vh + GAP;
    const rowH = rows.length === 0 ? 0 : (band - GAP * (rows.length - 1)) / rows.length;
    rows.forEach((row, i) => fillRow(cells, row, m, belowTop + i * (rowH + GAP), 1 - 2 * m, rowH, frameAspect));
  }
  return { size, theme: "overlay", cells };
}

/** Rounds to the nearest even integer, at least 2 (H.264 wants even sizes). */
export function even(n: number): number {
  return Math.max(2, 2 * Math.round(n / 2));
}

/** The output frame's short side, px, or `"source"`: as sharp as the clip allows (2026-11-23, Isaac: ffmpeg's own simple options instead of draft/full). */
export type ExportResolution = "source" | 1440 | 1080 | 720;

/** Everything an export needs, worked out before it starts. */
export interface ExportPlan {
  /** Session time of the first frame, s. */
  startS: number;
  /** Where in the clip that is, s. */
  clipFromS: number;
  /** Length, s. */
  durationS: number;
  /** Frames to send. */
  frames: number;
  fps: number;
  /** Output frame, px. */
  width: number;
  height: number;
  /** The video's box on the frame, px. */
  videoBox: { x: number; y: number; w: number; h: number };
}

/**
 * The plan for exporting `layout` over session span `windowS` from `link`:
 * the part of the window the clip covers, at the clip's frame rate. The
 * `"source"` frame shows the clip at its own resolution (at most 2160 px on
 * the short side); a number sets the frame's short side. `null`
 * when the clip does not cover the window or the layout has no video box.
 */
export function exportPlan(
  layout: CanvasLayout,
  videoCellId: string,
  link: Pick<VideoLink, "offset_s" | "duration_s" | "fps" | "width_px" | "height_px">,
  windowS: { startS: number; endS: number },
  resolution: ExportResolution
): ExportPlan | null {
  const box = layout.cells[videoCellId];
  if (box === undefined || !(link.fps > 0) || !(link.height_px > 0) || !(link.width_px > 0)) return null;
  const startS = Math.max(windowS.startS, link.offset_s);
  const endS = Math.min(windowS.endS, link.offset_s + link.duration_s);
  if (!(endS > startS)) return null;
  const frames = Math.floor((endS - startS) * link.fps);
  if (frames < 1) return null;

  const aspect = aspectOf(layout.size);
  // The frame size at which the clip, fitted into its box, shows at its own resolution.
  const clipAspect = link.width_px / link.height_px;
  const boxAspect = (box.w * aspect) / box.h;
  const fullH = boxAspect > clipAspect ? link.height_px / box.h : link.width_px / clipAspect / box.h;
  let height = Math.min(fullH, aspect >= 1 ? 2160 : 2160 / aspect);
  if (resolution !== "source") height = aspect >= 1 ? resolution : resolution / aspect;
  const width = even(height * aspect);
  height = even(height);
  const pos = (n: number) => 2 * Math.round(n / 2);
  const videoBox = { x: pos(box.x * width), y: pos(box.y * height), w: even(box.w * width), h: even(box.h * height) };
  videoBox.w = Math.min(videoBox.w, width - videoBox.x);
  videoBox.h = Math.min(videoBox.h, height - videoBox.y);
  return { startS, clipFromS: startS - link.offset_s, durationS: frames / link.fps, frames, fps: link.fps, width, height, videoBox };
}

/** Session time of frame `i`, µs (the readouts are read there). */
export function frameTimeUs(plan: Pick<ExportPlan, "startS" | "fps">, i: number): number {
  return Math.round((plan.startS + i / plan.fps) * 1e6);
}

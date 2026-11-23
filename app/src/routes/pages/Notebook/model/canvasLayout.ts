/**
 * Pure read/write of the `canvas` front-matter key (video overlay spec §2,
 * agreed 2026-11-15): the overlay frame's shape and where each cell sits on
 * it. Same discipline as `graphLayout.ts`: the byte-range scan of
 * `cells.ts`, never a cell body, never the rest of front matter.
 *
 * **Strict.** The canonical shape is
 *
 * ```yaml
 * canvas:
 *   size: "16:9"
 *   theme: overlay
 *   cells:
 *     7e570001: { x: 0, y: 0, w: 1, h: 1, z: 0 }
 * ```
 *
 * with `size` and `theme` optional (defaults `"16:9"`, `overlay`) and
 * numbers as decimals. Anything else under `canvas:` reads as absent, and a
 * write replaces the whole key. **Advisory:** nothing here changes a value.
 */

import { scanCells } from "./cells";

/** The frame shapes (spec §7a). */
export const CANVAS_SIZES = ["16:9", "9:16", "4:3", "1:1", "4:5"] as const;
/** One frame shape. */
export type CanvasSize = (typeof CANVAS_SIZES)[number];

/** One cell's box: fractions of the frame (0 to 1), `x`/`y` its top-left, `z` its layer (higher on top). */
export interface CanvasBox {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

/** A workbook's canvas. */
export interface CanvasLayout {
  size: CanvasSize;
  theme: "overlay" | "notebook";
  /** Cell id (`hex8`) → box. A cell not listed is not on the canvas. */
  cells: Record<string, CanvasBox>;
}

const HEX8 = /^[0-9a-f]{8}$/;
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const BOX_LINE = new RegExp(String.raw`^ {4}([0-9a-f]{8}): \{ x: (${NUM}), y: (${NUM}), w: (${NUM}), h: (${NUM}), z: (-?\d+) \}$`);

/** Width ÷ height of `size`. */
export function aspectOf(size: CanvasSize): number {
  const [w, h] = size.split(":").map(Number);
  return w / h;
}

function frontMatterBody(markdown: string): { lines: string[]; start: number; end: number } | null {
  const { frontMatterRange } = scanCells(markdown);
  if (frontMatterRange === null) return null;
  const bytes = new TextEncoder().encode(markdown);
  const text = new TextDecoder().decode(bytes.subarray(frontMatterRange[0], frontMatterRange[1]));
  return { lines: text.split(/\r?\n/), start: frontMatterRange[0], end: frontMatterRange[1] };
}

function canvasBlock(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((l) => /^canvas:/.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim().length === 0) continue;
    if (!/^\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** Reads the `canvas` key, or `null` when it is absent or not the canonical shape. */
export function readCanvasLayout(markdown: string): CanvasLayout | null {
  const fm = frontMatterBody(markdown);
  if (fm === null) return null;
  const block = canvasBlock(fm.lines);
  if (block === null) return null;
  if (fm.lines[block.start].trim() !== "canvas:") return null;
  let size: CanvasSize = "16:9";
  let theme: CanvasLayout["theme"] = "overlay";
  const cells: Record<string, CanvasBox> = {};
  // Both the form this module writes (a flow map per cell) and the block
  // form the engine writes when it saves the workbook's front matter back
  // (its YAML writer, 2026-11-23: `size: 4:3` unquoted, one key per line).
  const unquote = (v: string) => v.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  let i = block.start + 1;
  let inCells = false;
  let boxId: string | null = null;
  let box: Partial<CanvasBox> = {};
  const closeBox = (): boolean => {
    if (boxId === null) return true;
    const { x, y, w, h, z } = box;
    if ([x, y, w, h, z].some((v) => v === undefined || !Number.isFinite(v))) return false;
    cells[boxId] = { x: x!, y: y!, w: w!, h: h!, z: z! };
    boxId = null;
    box = {};
    return true;
  };
  for (; i < block.end; i++) {
    const line = fm.lines[i];
    if (line.trim().length === 0) continue;
    const top = /^ {2}(size|theme|cells):\s*(.*)$/.exec(line);
    if (top !== null) {
      if (!closeBox()) return null;
      inCells = false;
      if (top[1] === "size") {
        const v = unquote(top[2]);
        if (!(CANVAS_SIZES as readonly string[]).includes(v)) return null;
        size = v as CanvasSize;
      } else if (top[1] === "theme") {
        const v = unquote(top[2]);
        if (v !== "overlay" && v !== "notebook") return null;
        theme = v;
      } else {
        if (top[2].trim() !== "") return null;
        inCells = true;
      }
      continue;
    }
    if (!inCells) return null;
    const flow = BOX_LINE.exec(line);
    if (flow !== null) {
      if (!closeBox()) return null;
      cells[flow[1]] = { x: Number(flow[2]), y: Number(flow[3]), w: Number(flow[4]), h: Number(flow[5]), z: Number(flow[6]) };
      continue;
    }
    const head = /^ {4}['"]?([0-9a-f]{8})['"]?:\s*$/.exec(line);
    if (head !== null) {
      if (!closeBox()) return null;
      boxId = head[1];
      continue;
    }
    const field = /^ {6}([xywhz]):\s*(-?\d+(?:\.\d+)?)\s*$/.exec(line);
    if (field !== null && boxId !== null) {
      box[field[1] as keyof CanvasBox] = Number(field[2]);
      continue;
    }
    return null;
  }
  if (!closeBox()) return null;
  return { size, theme, cells };
}

/** Rounds a box coordinate to 4 decimals, the precision written. */
function r4(v: number): string {
  return String(Math.round(v * 10_000) / 10_000);
}

function serialise(layout: CanvasLayout): string[] {
  const lines = ["canvas:", `  size: "${layout.size}"`, `  theme: ${layout.theme}`];
  const ids = Object.keys(layout.cells).filter((k) => HEX8.test(k)).sort();
  if (ids.length > 0) {
    lines.push("  cells:");
    for (const id of ids) {
      const b = layout.cells[id];
      lines.push(`    ${id}: { x: ${r4(b.x)}, y: ${r4(b.y)}, w: ${r4(b.w)}, h: ${r4(b.h)}, z: ${Math.round(b.z)} }`);
    }
  }
  return lines;
}

/** Writes `layout` as the `canvas` key, replacing only that key's lines; `null` removes it. A document with no front matter is returned unchanged. */
export function writeCanvasLayout(markdown: string, layout: CanvasLayout | null): string {
  const fm = frontMatterBody(markdown);
  if (fm === null) return markdown;
  const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
  const lines = fm.lines.slice();
  const block = canvasBlock(lines);
  const next = layout === null ? [] : serialise(layout);
  if (block !== null) {
    let end = block.end;
    while (end > block.start + 1 && lines[end - 1].trim().length === 0) end -= 1;
    lines.splice(block.start, end - block.start, ...next);
  } else if (next.length > 0) {
    // Before the closing `---`, which is the last non-empty line of the range.
    let close = lines.length - 1;
    while (close > 0 && lines[close].trim() !== "---") close -= 1;
    lines.splice(close, 0, ...next);
  }
  const bytes = new TextEncoder().encode(markdown);
  const before = new TextDecoder().decode(bytes.subarray(0, fm.start));
  const after = new TextDecoder().decode(bytes.subarray(fm.end));
  return before + lines.join(newline) + after;
}

/** The canvas a workbook with none starts from: the video cell full frame (spec §6). */
export function defaultCanvas(videoCellId: string | null): CanvasLayout {
  return { size: "16:9", theme: "overlay", cells: videoCellId === null ? {} : { [videoCellId]: { x: 0, y: 0, w: 1, h: 1, z: 0 } } };
}

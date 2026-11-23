/**
 * The overlay's readout layer (video steps 2–3, 2026-11-23): every readout
 * cell on the canvas drawn at its box, on a transparent frame. The canvas
 * view shows it over the video; export rasterises it to a PNG per frame for
 * ffmpeg to lay over the clip. Drawing is `draw.ts`'s, so the canvas, export
 * and the notebook's own readouts look the same. DOM glue: not unit-tested
 * (CLAUDE.md §4); what it draws is tested in `frame.ts` and `draw.ts`.
 */
import type { CanvasLayout } from "../model/canvasLayout";
import type { ReadoutCall } from "./call";
import type { ReadoutFrame } from "./frame";
import { readoutModule, type SpectroLookup } from "./module";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The overlay theme's colours (spec §5), as the readouts' CSS variables:
 * white ink with a dark outline on a dark translucent plate, and a cyan
 * accent: the complement of dirt and fallen leaves (2026-11-23, Isaac: the
 * first amber was the colour of the trail and could not be read). Inline on the
 * layer's root, because a rasterised SVG sees no page stylesheet.
 */
const OVERLAY_THEME =
  "--readout-fg:#ffffff;--readout-track:rgba(255,255,255,0.28);--readout-accent:#38d6ff;--readout-outline:rgba(0,0,0,0.9);--readout-plate:rgba(8,12,16,0.62);--readout-max-w:none;--readout-max-h:none";

/** One readout drawn for `frame`, or `null` when `call` names nothing drawable. */
function drawCall(call: ReadoutCall, frame: ReadoutFrame, spectro: SpectroLookup | null): SVGSVGElement {
  const m = readoutModule(frame, spectro);
  if (call.kind === "gg") return m.gg(call.x, call.y, call.opts);
  if (call.kind === "gauge") return m.gauge(call.name, call.opts);
  if (call.kind === "trace") return m.trace(call.name, call.opts);
  if (call.kind === "spectrogram") return m.spectrogram(call.name, call.opts);
  return m.number(call.name, call.opts);
}

/**
 * The readout layer `width` × `height` px: each cell of `layout` that has a
 * readout call in `calls`, in `z` order, fitted into its box.
 */
export function composeOverlay(layout: CanvasLayout, calls: ReadonlyMap<string, ReadoutCall>, frame: ReadoutFrame, width: number, height: number, spectro: SpectroLookup | null = null): SVGSVGElement {
  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  root.setAttribute("style", OVERLAY_THEME);
  const placed = Object.entries(layout.cells)
    .filter(([id]) => calls.has(id))
    .sort((a, b) => a[1].z - b[1].z);
  for (const [id, box] of placed) {
    const svg = drawCall(calls.get(id)!, frame, spectro);
    svg.setAttribute("x", String(box.x * width));
    svg.setAttribute("y", String(box.y * height));
    svg.setAttribute("width", String(box.w * width));
    svg.setAttribute("height", String(box.h * height));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.removeAttribute("style");
    root.appendChild(svg);
  }
  return root;
}

/** `svg` rasterised to PNG bytes at its own `width` × `height`. */
export async function rasterise(svg: SVGSVGElement, width: number, height: number): Promise<Uint8Array> {
  const text = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
  try {
    const image = new Image(width, height);
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2D canvas");
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob === null) throw new Error("PNG encoding failed");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * SVG drawing for the overlay readouts (video overlay spec §4, §7c). Each
 * function takes values already at the cursor and already converted for
 * display, and returns one `<svg>` that scales to its cell (a `viewBox`,
 * width 100 %). Colours are CSS tokens with fallbacks, so the overlay theme
 * (spec §5) restyles them without a chart parameter:
 *
 * - `--readout-fg`: text and ticks (fallback `currentColor`).
 * - `--readout-accent`: needle, sweep and dot (fallback `--chart-1`).
 * - `--readout-track`: the dial's unfilled arc and the g-g rings.
 * - `--readout-outline`: a halo behind text so it reads over footage
 *   (fallback transparent; the overlay theme sets it dark).
 * - `--readout-plate`: a rounded plate behind the whole readout (fallback
 *   transparent; the overlay theme sets it dark and translucent, 2026-11-23:
 *   readouts were unreadable over sunlit leaves).
 * - `--readout-zone-1` … `--readout-zone-5`: a dial's zone colours.
 *
 * Rendering, so not unit-tested (CLAUDE.md §4); the numbers it draws come
 * from `geometry.ts`, which is.
 */
import {
  arcPath,
  formatReadoutValue,
  type GaugeZone,
  GAUGE_SWEEP_DEG,
  gaugeTicks,
  ggPoint,
  ggRings,
  needleAngleDeg,
  polar,
  tailOpacity,
  tracePoints,
  zoneAt,
} from "./geometry";
import { logFrequencyTicks, logFrequencyY } from "./spectroSlice";

const SVG_NS = "http://www.w3.org/2000/svg";

const FG = "var(--readout-fg, currentColor)";
const ACCENT = "var(--readout-accent, var(--chart-1, #e4572e))";
const TRACK = "var(--readout-track, color-mix(in srgb, currentColor 22%, transparent))";
const OUTLINE = "var(--readout-outline, transparent)";
const PLATE = "var(--readout-plate, transparent)";
/** Zone `n`'s colour: cool to hot, distinct from both footage and the accent. */
const ZONE = (n: number) => `var(--readout-zone-${n}, ${["#8fa3b8", "#3d8bfd", "#2fbf71", "#f2c230", "#ef4444"][n - 1] ?? "#8fa3b8"})`;

/** Creates an SVG element with attributes. */
function el(name: string, attrs: Record<string, string | number>, ...children: SVGElement[]): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  for (const c of children) node.appendChild(c);
  return node;
}

/** A text node with the readout halo (stroke painted under the fill). */
function text(content: string, attrs: Record<string, string | number>): SVGElement {
  const node = el("text", {
    fill: FG,
    stroke: OUTLINE,
    "stroke-width": 4,
    "stroke-linejoin": "round",
    "paint-order": "stroke",
    "text-anchor": "middle",
    "font-family": "var(--font-sans, system-ui, sans-serif)",
    ...attrs,
  });
  node.textContent = content;
  return node;
}

/**
 * The root `<svg>`: `w` × `h` user units, scaled to the cell's width up to
 * `--readout-max-w` × `--readout-max-h` and centred (2026-11-23: in the
 * notebook a full-column readout filled the screen). Tokens, not chart
 * parameters: the overlay canvas sets both to `none` so a readout fills
 * its box.
 */
function root(w: number, h: number, label: string, plate: "rect" | "none" = "rect"): SVGSVGElement {
  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: "100%",
    role: "img",
    "aria-label": label,
    style: "display:block;overflow:visible;margin:0 auto;max-width:var(--readout-max-w, 320px);max-height:var(--readout-max-h, 240px)",
  }) as SVGSVGElement;
  if (plate === "rect") svg.appendChild(el("rect", { x: 0, y: 0, width: w, height: h, rx: 16, fill: PLATE }));
  return svg;
}

/** A heart, centred on `(x, y)`, `s` user units wide. */
function heart(x: number, y: number, s: number): SVGElement {
  const k = s / 24;
  const d =
    "M12 21s-7.5-4.6-10-9.3C.4 8.6 2.3 5 5.8 5c2.1 0 3.4 1.1 4.2 2.3h.1C10.9 6.1 12.2 5 14.3 5 17.7 5 19.6 8.6 18 11.7 15.5 16.4 12 21 12 21z";
  return el("path", {
    d,
    fill: ACCENT,
    stroke: OUTLINE,
    "stroke-width": 1.5 / k,
    "paint-order": "stroke",
    transform: `translate(${x - 10 * k},${y - 13 * k}) scale(${k})`,
  });
}

/** What {@link drawGauge} draws. */
export interface GaugeView {
  /** The value at the cursor, display units; `null` draws a dash and no needle. */
  value: number | null;
  /** Display unit label, or `null`. */
  unit: string | null;
  /** Dial range, display units. */
  min: number;
  max: number;
  label?: string;
  /** Decimals on the number. */
  digits: number;
  /** `"speedo"`: a needle over a filled sweep. `"tach"`: a filled sweep only, thicker. */
  style: "speedo" | "tach";
  /** `"heart"` puts a heart beside the number. */
  icon?: "heart";
  /** Coloured bands along the dial, display units; the sweep takes the colour of the zone the value is in. */
  zones?: readonly GaugeZone[];
}

/** A dial: track arc, filled sweep to the value, ticks, needle (speedo), and the number. */
export function drawGauge(v: GaugeView): SVGSVGElement {
  const [W, H, cx, cy, r] = [200, 180, 100, 100, 80];
  const svg = root(W, H, `${v.label ?? "gauge"}: ${formatReadoutValue(v.value, v.digits)} ${v.unit ?? ""}`, "none");
  // A round plate: only the dial is darkened, not the box's corners (2026-11-23).
  svg.appendChild(el("circle", { cx, cy, r: r + 16, fill: PLATE }));
  const a0 = -GAUGE_SWEEP_DEG / 2;
  const a1 = GAUGE_SWEEP_DEG / 2;
  const width = v.style === "tach" ? 16 : 8;
  svg.appendChild(el("path", { d: arcPath(cx, cy, r, a0, a1), fill: "none", stroke: TRACK, "stroke-width": width, "stroke-linecap": "round" }));
  // Zones: faint bands along the track, so the dial shows where each starts.
  for (const z of v.zones ?? []) {
    const za = needleAngleDeg(z.from, v.min, v.max);
    const zb = needleAngleDeg(z.to, v.min, v.max);
    if (za === null || zb === null || !(zb > za)) continue;
    svg.appendChild(el("path", { d: arcPath(cx, cy, r, za, zb), fill: "none", stroke: ZONE(z.n), "stroke-opacity": 0.45, "stroke-width": width }));
  }
  const angle = needleAngleDeg(v.value, v.min, v.max);
  const zone = zoneAt(v.value, v.zones ?? []);
  const sweep = zone === null ? ACCENT : ZONE(zone.n);
  if (angle !== null && angle > a0) {
    svg.appendChild(el("path", { d: arcPath(cx, cy, r, a0, angle), fill: "none", stroke: sweep, "stroke-width": width, "stroke-linecap": "round" }));
  }
  for (const t of gaugeTicks(v.min, v.max)) {
    const ta = needleAngleDeg(t, v.min, v.max);
    if (ta === null) continue;
    const p0 = polar(cx, cy, r - width / 2 - 3, ta);
    const p1 = polar(cx, cy, r - width / 2 - 10, ta);
    svg.appendChild(el("line", { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y, stroke: FG, "stroke-width": 2 }));
    const pl = polar(cx, cy, r - width / 2 - 22, ta);
    svg.appendChild(text(String(t), { x: pl.x, y: pl.y + 4, "font-size": 11, "stroke-width": 3 }));
  }
  if (v.style === "speedo" && angle !== null) {
    const tip = polar(cx, cy, r - 6, angle);
    svg.appendChild(el("line", { x1: cx, y1: cy, x2: tip.x, y2: tip.y, stroke: ACCENT, "stroke-width": 4, "stroke-linecap": "round" }));
    svg.appendChild(el("circle", { cx, cy, r: 6, fill: ACCENT }));
  }
  // Both styles put the number in the dial's open bottom, clear of the ticks.
  const numberY = cy + 52;
  const shown = formatReadoutValue(v.value, v.digits);
  svg.appendChild(text(shown, { x: cx, y: numberY, "font-size": 34, "font-weight": 700, "font-variant-numeric": "tabular-nums" }));
  const caption = [v.label, v.unit].filter((s) => s !== undefined && s !== null && s !== "").join(" · ");
  if (caption !== "") svg.appendChild(text(caption, { x: cx, y: numberY + 20, "font-size": 12 }));
  if (zone !== null) svg.appendChild(text(`Z${zone.n}`, { x: cx + 62, y: numberY - 4, "font-size": 14, "font-weight": 700, fill: ZONE(zone.n) }));
  // A tach has no needle hub, so its heart sits large in the dial's centre;
  // a speedo's sits beside the number, clear of the hub.
  if (v.icon === "heart") {
    svg.appendChild(v.style === "tach" ? heart(cx, cy + 4, 30) : heart(cx - 22 - shown.length * 10, numberY - 11, 18));
  }
  return svg;
}

/** What {@link drawNumber} draws. */
export interface NumberView {
  value: number | null;
  unit: string | null;
  label?: string;
  digits: number;
  icon?: "heart";
}

/** A large number with its label and unit underneath. */
export function drawNumber(v: NumberView): SVGSVGElement {
  const [W, H] = [200, 90];
  const shown = formatReadoutValue(v.value, v.digits);
  const svg = root(W, H, `${v.label ?? "value"}: ${shown} ${v.unit ?? ""}`);
  svg.appendChild(text(shown, { x: W / 2, y: 52, "font-size": 48, "font-weight": 700, "font-variant-numeric": "tabular-nums" }));
  const caption = [v.label, v.unit].filter((s) => s !== undefined && s !== null && s !== "").join(" · ");
  if (caption !== "") svg.appendChild(text(caption, { x: W / 2, y: 78, "font-size": 14 }));
  if (v.icon === "heart") svg.appendChild(heart(W / 2 - 30 - shown.length * 14, 38, 24));
  return svg;
}

/** What {@link drawGg} draws. */
export interface GgView {
  /** Lateral (x, right positive) and longitudinal (y, up positive) at the cursor, g. */
  x: number | null;
  y: number | null;
  /** `tailX[k-1]`, `tailY[k-1]`: the values `k` frames back. */
  tailX: (number | null)[];
  tailY: (number | null)[];
  /** g at the plot's edge. */
  limit: number;
  /** Vertical g for the bar beside the circle, `null` missing; `undefined`: no bar. */
  vertical?: number | null;
  /** g at the bar's top. */
  verticalLimit: number;
  /** Ring spacing, g. */
  rings: number;
  label?: string;
}

/** A g-g plot: rings, cross-hairs, a fading tail and the dot at the cursor. */
export function drawGg(v: GgView): SVGSVGElement {
  const withBar = v.vertical !== undefined;
  const [W, H, cx, cy, r] = [withBar ? 260 : 200, 200, 100, 96, 84];
  const svg = root(W, H, v.label ?? "g-g", "none");
  // Round plate behind the plot, a rounded one behind the bar (2026-11-23).
  svg.appendChild(el("circle", { cx, cy, r: r + 14, fill: PLATE }));
  if (withBar) svg.appendChild(el("rect", { x: 200, y: cy - r - 22, width: 56, height: 2 * r + 46, rx: 14, fill: PLATE }));
  svg.appendChild(el("line", { x1: cx - r, y1: cy, x2: cx + r, y2: cy, stroke: TRACK, "stroke-width": 1 }));
  svg.appendChild(el("line", { x1: cx, y1: cy - r, x2: cx, y2: cy + r, stroke: TRACK, "stroke-width": 1 }));
  const rings = ggRings(v.limit, v.rings);
  for (const g of rings) {
    svg.appendChild(el("circle", { cx, cy, r: (g / v.limit) * r, fill: "none", stroke: TRACK, "stroke-width": g === rings[rings.length - 1] ? 2 : 1 }));
  }
  // Every ring labelled, along the upper-right diagonal (2026-11-23: "1.0 and 0.5").
  rings.forEach((g, i) => {
    const rr = (g / v.limit) * r;
    const last = i === rings.length - 1;
    svg.appendChild(text(last ? `${g.toFixed(1)} g` : g.toFixed(1), { x: cx + rr * 0.72, y: cy - rr * 0.72 - 2, "font-size": 10, "stroke-width": 3 }));
  });
  const count = Math.min(v.tailX.length, v.tailY.length);
  // The tail as a line fading with age, oldest first so newer segments paint
  // over older ones (2026-11-23: a continuous tail instead of dots).
  const segments: SVGElement[] = [];
  let prev = ggPoint(v.x, v.y, v.limit, cx, cy, r);
  for (let k = 1; k <= count; k++) {
    const p = ggPoint(v.tailX[k - 1], v.tailY[k - 1], v.limit, cx, cy, r);
    if (p !== null && prev !== null) {
      segments.push(el("line", { x1: prev.x, y1: prev.y, x2: p.x, y2: p.y, stroke: ACCENT, "stroke-width": 3, "stroke-linecap": "round", "stroke-opacity": tailOpacity(k, count) }));
    }
    prev = p;
  }
  for (const s of segments.reverse()) svg.appendChild(s);
  const dot = ggPoint(v.x, v.y, v.limit, cx, cy, r);
  if (dot !== null) {
    svg.appendChild(el("circle", { cx: dot.x, cy: dot.y, r: 7, fill: ACCENT, stroke: OUTLINE, "stroke-width": 2 }));
  }
  if (withBar) {
    // Vertical g as a bar: 0 at the bottom, `verticalLimit` at the top, a tick at 1 g (standing still).
    const [bx, bw, top, bottom] = [214, 22, cy - r, cy + r];
    const yOf = (g: number) => bottom - (Math.min(Math.max(g, 0), v.verticalLimit) / v.verticalLimit) * (bottom - top);
    svg.appendChild(el("rect", { x: bx, y: top, width: bw, height: bottom - top, rx: 4, fill: "none", stroke: TRACK, "stroke-width": 2 }));
    if (v.vertical !== null && v.vertical !== undefined && Number.isFinite(v.vertical)) {
      const y = yOf(v.vertical);
      svg.appendChild(el("rect", { x: bx + 3, y, width: bw - 6, height: bottom - y, rx: 2, fill: ACCENT }));
    }
    for (const g of [1, v.verticalLimit]) {
      const y = yOf(g);
      svg.appendChild(el("line", { x1: bx - 4, y1: y, x2: bx + bw + 4, y2: y, stroke: FG, "stroke-width": 1.5 }));
      svg.appendChild(text(`${g}`, { x: bx + bw + 14, y: y + 4, "font-size": 10, "stroke-width": 3 }));
    }
    svg.appendChild(text(v.vertical === null || v.vertical === undefined ? "–" : v.vertical.toFixed(1), { x: bx + bw / 2, y: bottom + 16, "font-size": 13, "font-weight": 700 }));
    svg.appendChild(text("vert", { x: bx + bw / 2, y: top - 6, "font-size": 10, "stroke-width": 3 }));
  }
  if (v.label !== undefined && v.label !== "") svg.appendChild(text(v.label, { x: cx, y: H - 2, "font-size": 12 }));
  return svg;
}

/** What {@link drawTrace} draws. */
export interface TraceView {
  /** `samples[k]` is the value `k` frames back, display units; `samples[0]` the cursor. */
  samples: (number | null)[];
  /** The value at the cursor, display units. */
  value: number | null;
  unit: string | null;
  /** Vertical range, display units. */
  min: number;
  max: number;
  label?: string;
  digits: number;
  /** Seconds the trace spans, for its time label. */
  windowS: number;
}

/** A trace scrolling past: the last `windowS` seconds as a line, newest at the right edge, the value above it. */
export function drawTrace(v: TraceView): SVGSVGElement {
  const [W, H] = [400, 120];
  const [px, top, plotH] = [10, 34, 76];
  const plotW = W - 2 * px;
  const shown = formatReadoutValue(v.value, v.digits);
  const svg = root(W, H, `${v.label ?? "trace"}: ${shown} ${v.unit ?? ""}`);
  // Baseline and the cursor at the right edge.
  svg.appendChild(el("line", { x1: px, y1: top + plotH, x2: px + plotW, y2: top + plotH, stroke: TRACK, "stroke-width": 1 }));
  svg.appendChild(el("line", { x1: px + plotW, y1: top, x2: px + plotW, y2: top + plotH, stroke: TRACK, "stroke-width": 1 }));
  for (const run of tracePoints(v.samples, v.min, v.max, plotW, plotH)) {
    if (run.length < 2) continue;
    const points = run.map((p) => `${(p.x + px).toFixed(1)},${(p.y + top).toFixed(1)}`).join(" ");
    svg.appendChild(el("polyline", { points, fill: "none", stroke: OUTLINE, "stroke-width": 5, "stroke-linejoin": "round" }));
    svg.appendChild(el("polyline", { points, fill: "none", stroke: ACCENT, "stroke-width": 2.5, "stroke-linejoin": "round" }));
  }
  const caption = [v.label, v.unit].filter((s) => s !== undefined && s !== null && s !== "").join(" · ");
  if (caption !== "") svg.appendChild(text(caption, { x: px + 2, y: 24, "font-size": 14, "text-anchor": "start" }));
  svg.appendChild(text(shown, { x: W - px - 2, y: 28, "font-size": 26, "font-weight": 700, "text-anchor": "end", "font-variant-numeric": "tabular-nums" }));
  svg.appendChild(text(`${Math.round(v.windowS)} s`, { x: px + 2, y: top + plotH - 4, "font-size": 10, "text-anchor": "start", "stroke-width": 3 }));
  return svg;
}

/** What {@link drawSpectrogram} draws. */
export interface SpectrogramView {
  /** The slice to show and where it sits across the strip (0..1), or `null` when there is none here. */
  image: { href: string; destX: number; destW: number; fmaxHz: number; cursorX: number; scale: "log" | "linear"; fminHz: number } | null;
  windowS: number;
  label?: string;
  /** Shown instead of the picture when `image` is `null` (the notebook, which has no raster). */
  note?: string;
}

/** A spectrogram scrolling past: frequency up, the last `windowS` seconds across, the cursor at the right edge. */
export function drawSpectrogram(v: SpectrogramView): SVGSVGElement {
  const [W, H] = [400, 120];
  const [px, top, plotH] = [10, 30, 80];
  const plotW = W - 2 * px;
  const svg = root(W, H, v.label ?? "spectrogram");
  if (v.image !== null) {
    const img = v.image;
    svg.appendChild(el("image", { href: img.href, x: px + img.destX * plotW, y: top, width: img.destW * plotW, height: plotH, preserveAspectRatio: "none" }));
    // Frequency labels: the top, and 1-2-5 steps on a log axis (quarters on a linear one).
    const ticks: { f: number; y: number }[] = [{ f: img.fmaxHz, y: 0 }];
    if (img.scale === "log") {
      for (const f of logFrequencyTicks(img.fminHz, img.fmaxHz)) ticks.push({ f, y: logFrequencyY(f, img.fminHz, img.fmaxHz) });
      ticks.push({ f: img.fminHz, y: 1 });
    } else {
      for (const q of [0.25, 0.5, 0.75]) ticks.push({ f: img.fmaxHz * (1 - q), y: q });
    }
    for (const t of ticks) {
      const y = top + t.y * plotH;
      svg.appendChild(el("line", { x1: px, y1: y, x2: px + 6, y2: y, stroke: FG, "stroke-width": 1 }));
      const label = t.y === 0 ? `${Math.round(t.f)} Hz` : `${Math.round(t.f * 10) / 10}`;
      svg.appendChild(text(label, { x: px + 9, y: Math.min(top + plotH - 1, Math.max(top + 9, y + 3.5)), "font-size": 9, "text-anchor": "start", "stroke-width": 3 }));
    }
  } else {
    svg.appendChild(text(v.note ?? "–", { x: W / 2, y: top + plotH / 2 + 4, "font-size": 12 }));
  }
  const cx = px + (v.image?.cursorX ?? 1) * plotW;
  svg.appendChild(el("line", { x1: cx, y1: top - 4, x2: cx, y2: top + plotH, stroke: OUTLINE, "stroke-width": 4 }));
  svg.appendChild(el("line", { x1: cx, y1: top - 4, x2: cx, y2: top + plotH, stroke: FG, "stroke-width": 2 }));
  if (v.label !== undefined && v.label !== "") svg.appendChild(text(v.label, { x: px + 2, y: 21, "font-size": 14, "text-anchor": "start" }));
  svg.appendChild(text(`${Math.round(v.windowS)} s`, { x: W - px - 4, y: top + plotH - 4, "font-size": 10, "text-anchor": "end", "stroke-width": 3 }));
  return svg;
}

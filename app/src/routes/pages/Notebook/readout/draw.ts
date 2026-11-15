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
 *
 * Rendering, so not unit-tested (CLAUDE.md §4); the numbers it draws come
 * from `geometry.ts`, which is.
 */
import {
  arcPath,
  formatReadoutValue,
  GAUGE_SWEEP_DEG,
  gaugeTicks,
  ggPoint,
  ggRings,
  needleAngleDeg,
  polar,
  tailOpacity,
} from "./geometry";

const SVG_NS = "http://www.w3.org/2000/svg";

const FG = "var(--readout-fg, currentColor)";
const ACCENT = "var(--readout-accent, var(--chart-1, #e4572e))";
const TRACK = "var(--readout-track, color-mix(in srgb, currentColor 22%, transparent))";
const OUTLINE = "var(--readout-outline, transparent)";

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

/** The root `<svg>`: `w` × `h` user units, scaled to the cell's width. */
function root(w: number, h: number, label: string): SVGSVGElement {
  const svg = el("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: "100%",
    role: "img",
    "aria-label": label,
    style: "display:block;overflow:visible",
  }) as SVGSVGElement;
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
}

/** A dial: track arc, filled sweep to the value, ticks, needle (speedo), and the number. */
export function drawGauge(v: GaugeView): SVGSVGElement {
  const [W, H, cx, cy, r] = [200, 180, 100, 100, 80];
  const svg = root(W, H, `${v.label ?? "gauge"}: ${formatReadoutValue(v.value, v.digits)} ${v.unit ?? ""}`);
  const a0 = -GAUGE_SWEEP_DEG / 2;
  const a1 = GAUGE_SWEEP_DEG / 2;
  const width = v.style === "tach" ? 16 : 8;
  svg.appendChild(el("path", { d: arcPath(cx, cy, r, a0, a1), fill: "none", stroke: TRACK, "stroke-width": width, "stroke-linecap": "round" }));
  const angle = needleAngleDeg(v.value, v.min, v.max);
  if (angle !== null && angle > a0) {
    svg.appendChild(el("path", { d: arcPath(cx, cy, r, a0, angle), fill: "none", stroke: ACCENT, "stroke-width": width, "stroke-linecap": "round" }));
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
  /** Ring spacing, g. */
  rings: number;
  label?: string;
}

/** A g-g plot: rings, cross-hairs, a fading tail and the dot at the cursor. */
export function drawGg(v: GgView): SVGSVGElement {
  const [W, H, cx, cy, r] = [200, 200, 100, 96, 84];
  const svg = root(W, H, v.label ?? "g-g");
  svg.appendChild(el("line", { x1: cx - r, y1: cy, x2: cx + r, y2: cy, stroke: TRACK, "stroke-width": 1 }));
  svg.appendChild(el("line", { x1: cx, y1: cy - r, x2: cx, y2: cy + r, stroke: TRACK, "stroke-width": 1 }));
  const rings = ggRings(v.limit, v.rings);
  for (const g of rings) {
    svg.appendChild(el("circle", { cx, cy, r: (g / v.limit) * r, fill: "none", stroke: TRACK, "stroke-width": g === rings[rings.length - 1] ? 2 : 1 }));
  }
  if (rings.length > 0) {
    const outer = rings[rings.length - 1];
    svg.appendChild(text(`${outer} g`, { x: cx + r * 0.72, y: cy - r * 0.72, "font-size": 10, "stroke-width": 3 }));
  }
  const count = Math.min(v.tailX.length, v.tailY.length);
  // Oldest first, so newer points paint over older ones.
  for (let k = count; k >= 1; k--) {
    const p = ggPoint(v.tailX[k - 1], v.tailY[k - 1], v.limit, cx, cy, r);
    if (p === null) continue;
    svg.appendChild(el("circle", { cx: p.x, cy: p.y, r: 3, fill: ACCENT, "fill-opacity": tailOpacity(k, count) }));
  }
  const dot = ggPoint(v.x, v.y, v.limit, cx, cy, r);
  if (dot !== null) {
    svg.appendChild(el("circle", { cx: dot.x, cy: dot.y, r: 7, fill: ACCENT, stroke: OUTLINE, "stroke-width": 2 }));
  }
  if (v.label !== undefined && v.label !== "") svg.appendChild(text(v.label, { x: cx, y: H - 2, "font-size": 12 }));
  return svg;
}

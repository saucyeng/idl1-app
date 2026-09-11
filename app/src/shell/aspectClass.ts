/**
 * The viewport's *shape* class (ruling R213 item 2) — the key a layout
 * preset is remembered under, so the same laptop recalls one arrangement on
 * its ultrawide desk monitor and another on its own 16:9 panel, with no
 * switch to flip by hand.
 *
 * Deliberately **not** `shell/layout.ts`'s `ShellLayout`: that one answers
 * "how much width is there" (600 px / 1200 px, where the nav bar goes,
 * whether the column frame exists at all) and this one answers "what shape
 * is it" (width ÷ height). A 1280 × 1024 monitor and a 2560 × 1080 ultrawide
 * are both `wide` to `resolveLayout` and are the two arrangements R213
 * exists to keep apart.
 *
 * Pure and dependency-free (`toolbarLayout.ts`'s pattern): no `react`
 * import, no DOM. The caller owns the resize listener and hands the size
 * here.
 */

/** The three viewport shapes a preset is remembered per (R213 item 2). */
export type AspectClass = "ultrawide" | "wide" | "narrow";

/** {@link AspectClass}'s members, widest ratio first. */
export const ASPECT_CLASSES: readonly AspectClass[] = ["ultrawide", "wide", "narrow"];

/** Ratio (width ÷ height, unitless) at or above which a viewport is
 *  `ultrawide` — R213 item 2. 21:9 is 2.33, 32:9 is 3.56; 2.1 sits below
 *  the narrowest real ultrawide and well above 16:9's 1.78. */
export const ULTRAWIDE_RATIO = 2.1;

/** Ratio (width ÷ height, unitless) at or above which a viewport is `wide`
 *  — R213 item 2. 16:9 is 1.78 and 3:2 is 1.5, both `wide`; a portrait or
 *  squarish window falls below and is `narrow`. */
export const WIDE_RATIO = 1.5;

/** How long the viewport must stay still before its class is re-evaluated,
 *  in milliseconds (R213 item 2: "re-evaluated on resize with a 200 ms
 *  debounce and never flips during a gesture"). A window dragged from one
 *  monitor to another crosses several ratios on the way; only where it
 *  comes to rest counts. */
export const ASPECT_CLASS_DEBOUNCE_MS = 200;

/**
 * `widthPx ÷ heightPx` classified per R213 item 2: `ultrawide` at or above
 * {@link ULTRAWIDE_RATIO}, `wide` at or above {@link WIDE_RATIO}, `narrow`
 * otherwise.
 *
 * A height that is zero, negative or non-finite yields `wide` rather than a
 * division result: that is what a `ResizeObserver`/`window.innerHeight`
 * reports for one frame before first layout, and `wide` is the shape most
 * machines actually have, so the pre-layout frame recalls the same preset
 * the first real measurement will (no visible flip). Lane-local call, said
 * out loud rather than assumed (CLAUDE.md §1).
 *
 * @param widthPx Viewport width, in CSS px.
 * @param heightPx Viewport height, in CSS px.
 */
export function resolveAspectClass(widthPx: number, heightPx: number): AspectClass {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || heightPx <= 0) return "wide";
  const ratio = widthPx / heightPx;
  if (ratio >= ULTRAWIDE_RATIO) return "ultrawide";
  if (ratio >= WIDE_RATIO) return "wide";
  return "narrow";
}

/** Whether `raw` is one of {@link ASPECT_CLASSES} — the guard a restored
 *  `localStorage` document goes through before it is used as a key. */
export function isAspectClass(raw: unknown): raw is AspectClass {
  return typeof raw === "string" && (ASPECT_CLASSES as readonly string[]).includes(raw);
}

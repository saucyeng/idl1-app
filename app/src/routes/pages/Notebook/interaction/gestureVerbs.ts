/**
 * Pure gesture-verb decision for the chart surface's pan/zoom input
 * (ruling R137, which amends R134 item 2's "shift-drag pans"; plan
 * `runs/2026-09-08/w32-time-plan.md` Task 5). `interaction/inputMap.ts`
 * lands the swappable preset table; this module is what a real DOM pointer/
 * wheel event is classified into one of that table's six
 * {@link InputEventKind}s, plus the one fallback rule the browser's own
 * event shape forces (see {@link horizontalWheelActionFor}'s doc comment).
 * `ChartCell.tsx` calls these functions instead of branching on
 * `event.shiftKey`/`event.deltaX` inline, so the decision is unit-tested
 * independently of rendering (CLAUDE.md §4).
 *
 * No React, no DOM — a `PointerEvent`/`WheelEvent`'s already-read fields
 * (`shiftKey`, `deltaX`, `deltaY`, `ctrlKey`) go in, an {@link InputEventKind}
 * or a {@link GestureAction} comes out.
 */
import { actionFor, type GestureAction, type InputEventKind, type InputMapPreset } from "./inputMap";

/** Which drag `inputMap.ts` key a pointerdown's modifier state selects.
 *  Right-click (context menu) and a rectangle already in progress are
 *  filtered out by the caller before this is used — a drag is always
 *  either plain or Shift-held, never anything else. */
export function classifyPointerDown(shiftKey: boolean): "drag" | "shiftDrag" {
  return shiftKey ? "shiftDrag" : "drag";
}

/** The action bound to a plain or Shift-held drag under `preset` — decision
 *  56's default (`"drag"` always resolves to `"zoom-region"` in every
 *  shipped preset, asserted in `inputMap.test.ts`) with the modifier's own
 *  preset-specific binding otherwise. */
export function dragActionFor(preset: InputMapPreset, shiftKey: boolean): GestureAction {
  return actionFor(preset, classifyPointerDown(shiftKey));
}

/**
 * Classifies a wheel/trackpad event's DOM fields into one of
 * `inputMap.ts`'s three wheel-family {@link InputEventKind}s.
 * `event.ctrlKey` is the standard cross-browser signal for a trackpad pinch
 * synthesized as a wheel event (Chrome/Firefox/Safari all set it; there is
 * no separate pinch DOM event on desktop) — checked first, since a pinch
 * can also report a nonzero `deltaX`. Otherwise, a `deltaX` that dominates
 * `deltaY` reads as the horizontal-wheel family; anything else is the
 * plain vertical wheel.
 */
export function classifyWheelEvent(deltaX: number, deltaY: number, ctrlKey: boolean): InputEventKind {
  if (ctrlKey) return "pinch";
  return Math.abs(deltaX) > Math.abs(deltaY) ? "horizontalWheel" : "wheel";
}

/**
 * Resolves the action for a `"horizontalWheel"`-classified event.
 *
 * A trackpad's two-finger horizontal scroll and a physical second wheel
 * notch (the MX Master's, R137's own example) arrive at the DOM as the
 * exact same `wheel` event shape — `deltaX`-dominant, no `ctrlKey` — so
 * {@link classifyWheelEvent} cannot and does not try to tell them apart.
 * Instead this looks up `"horizontalWheel"` first (`TWO_WHEEL_MOUSE_PRESET`'s
 * own binding) and falls back to `"twoFingerPan"` (`TRACKPAD_PRESET`'s)
 * when the first is unbound. Every shipped preset binds at most one of the
 * two to a non-`"none"` action, so this resolves correctly for all three
 * without the handler ever branching on which preset is active — adding a
 * fourth preset that keeps that same one-of-two-bound convention needs no
 * change here (R137's "adding a preset must not require touching the
 * handler").
 */
export function horizontalWheelActionFor(preset: InputMapPreset): GestureAction {
  const primary = actionFor(preset, "horizontalWheel");
  return primary !== "none" ? primary : actionFor(preset, "twoFingerPan");
}

/**
 * The action for one already-classified wheel-family event under `preset`
 * — the single lookup `ChartCell.tsx`'s wheel handler calls, routing
 * `"horizontalWheel"` through {@link horizontalWheelActionFor}'s fallback
 * and every other kind through a plain `actionFor`.
 */
export function wheelActionFor(preset: InputMapPreset, eventKind: InputEventKind): GestureAction {
  if (eventKind === "horizontalWheel") return horizontalWheelActionFor(preset);
  return actionFor(preset, eventKind);
}

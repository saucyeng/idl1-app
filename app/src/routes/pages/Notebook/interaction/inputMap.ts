/**
 * Pure gesture input-map presets (ruling R137, which withdraws R134 item
 * 2's "shift-drag pans"). Isaac: "mouse and trackpad are different... i
 * could imagine this being a part of the user config in the form of an
 * interchangeable table that can have a few presets for me to try at
 * runtime." The chart surface reads which action a given pointer/wheel
 * event maps to from a table, selected at runtime by preset name; it is
 * **not** wired to `ChartCell.tsx` by this module -- this lane's Task 5
 * (`interaction/gestureVerbs.ts`, not yet dispatched) is where the gesture
 * handler starts reading a preset. Landing the table now, ahead of that
 * wiring, means adding a fourth preset later never touches the handler
 * (R137's own constraint).
 *
 * The map is a **renderer-only preference** (CLAUDE.md §3: no number
 * depends on it): it belongs in user prefs (`Settings/prefsStore.ts`'s
 * `PrefsStore`, the same document `Notebook/index.tsx`'s
 * `notebookPrefsStore` already wraps), never in a workbook, never synced.
 * Persisting the *chosen preset name* into that store, and re-reading it on
 * preset switch with no reload, is also Task 5/12's wiring, not this
 * module's -- this file only defines the table and the three shipped
 * presets, plus the pure lookup over them.
 *
 * No React, no DOM.
 */

/**
 * The six pointer/wheel input events a preset maps, per R137's own list.
 * `"drag"` is a plain left-button drag with no modifier; `"shiftDrag"` is
 * the same with Shift held. `"wheel"`/`"horizontalWheel"` are a mouse
 * wheel's vertical/horizontal deltas (the MX Master's second wheel is an
 * ordinary horizontal-wheel event, R137's own note — no special-casing by
 * device). `"pinch"`/`"twoFingerPan"` are trackpad-only gestures with no
 * desktop DOM event of their own (see `ChartCell.tsx`'s existing note on
 * wheel-as-pinch-substitute) — presets that use them are meaningful once
 * Task 5 maps a real trackpad gesture source onto these names; this table
 * does not depend on how that mapping is done.
 */
export type InputEventKind = "drag" | "shiftDrag" | "wheel" | "horizontalWheel" | "pinch" | "twoFingerPan";

/**
 * What an input event does to the chart's viewport, per R137. `"none"`
 * means this preset does not bind that event at all — distinct from
 * omitting it from the map (every {@link InputMap} names all six events
 * explicitly, `"none"` included, so a preset's intent is always visible
 * rather than left to a fallback).
 */
export type GestureAction = "pan-x" | "zoom-x" | "zoom-region" | "none";

/** A complete input map: every {@link InputEventKind} bound to a {@link GestureAction}. */
export type InputMap = Readonly<Record<InputEventKind, GestureAction>>;

/** One named, selectable preset (R137: "a few presets for me to try at runtime"). */
export interface InputMapPreset {
  /** Stable identifier — the value persisted in user prefs, never a display string. */
  id: string;
  /** Human-readable name for a preset picker. */
  label: string;
  map: InputMap;
}

/**
 * Trackpad preset (R137): pinch zooms, a two-finger drag pans, a plain
 * drag stays decision 56's zoom-to-region default. Shift-drag/wheel/
 * horizontal-wheel are unbound — a trackpad's own gestures cover pan and
 * zoom without them.
 */
export const TRACKPAD_PRESET: InputMapPreset = {
  id: "trackpad",
  label: "Trackpad",
  map: {
    drag: "zoom-region",
    shiftDrag: "none",
    wheel: "none",
    horizontalWheel: "none",
    pinch: "zoom-x",
    twoFingerPan: "pan-x",
  },
};

/**
 * Two-wheel mouse preset (R137), written for the MX Master's second wheel:
 * the vertical wheel zooms, the horizontal wheel pans, drag stays
 * zoom-to-region. Shift-drag/pinch/two-finger-pan are unbound — this
 * preset has no trackpad gestures to bind them to.
 */
export const TWO_WHEEL_MOUSE_PRESET: InputMapPreset = {
  id: "two-wheel-mouse",
  label: "Mouse (two wheels)",
  map: {
    drag: "zoom-region",
    shiftDrag: "none",
    wheel: "zoom-x",
    horizontalWheel: "pan-x",
    pinch: "none",
    twoFingerPan: "none",
  },
};

/**
 * Basic mouse preset (R137): the single-wheel case. Drag stays
 * zoom-to-region, shift-drag pans (R134 item 2's original ruling, kept
 * here as this preset's own binding rather than the app's only one), and
 * the one wheel zooms. Horizontal-wheel/pinch/two-finger-pan are unbound —
 * a basic mouse has none of them.
 */
export const BASIC_MOUSE_PRESET: InputMapPreset = {
  id: "basic-mouse",
  label: "Mouse (basic)",
  map: {
    drag: "zoom-region",
    shiftDrag: "pan-x",
    wheel: "zoom-x",
    horizontalWheel: "none",
    pinch: "none",
    twoFingerPan: "none",
  },
};

/** Every preset this build ships, in the order a picker should list them. */
export const INPUT_MAP_PRESETS: readonly InputMapPreset[] = [TRACKPAD_PRESET, TWO_WHEEL_MOUSE_PRESET, BASIC_MOUSE_PRESET];

/** Looks up a preset by {@link InputMapPreset.id}, or `null` if `id` names none of {@link INPUT_MAP_PRESETS} (e.g. a prefs value from a build with a preset this one dropped). */
export function findInputMapPreset(id: string): InputMapPreset | null {
  return INPUT_MAP_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** The action `preset` binds `eventKind` to — a plain lookup, so the gesture handler never branches on preset identity itself. */
export function actionFor(preset: InputMapPreset, eventKind: InputEventKind): GestureAction {
  return preset.map[eventKind];
}

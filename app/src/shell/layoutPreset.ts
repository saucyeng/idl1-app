import { useSyncExternalStore } from "react";

import type { AspectClass } from "./aspectClass";
import { readColumnPrefs, writeColumnPrefs } from "./columnPrefs";
import {
  DEFAULT_PRESET_BY_CLASS,
  nextPreset,
  presetAfterColumnChange,
  presetLayout,
  type ActivePreset,
  type LayoutPresetId,
  type MathsOrientation,
  type PresetColumnVisibility,
} from "./layoutPresets";

/**
 * The live layout preset (ruling R213): which of the four arrangements is
 * active, for which viewport shape, and the maths panel's orientation that
 * came with it.
 *
 * A module-scope store, the same shape as `studioColumns.ts`'s and
 * `graphSlot.ts`'s, for the same reason: its three readers — `AppShell.tsx`
 * (the `Ctrl+Shift+L` shortcut and the aspect-class watcher),
 * `RouteHost.tsx` (the frame's geometry) and the Notebook page (the R161
 * toggles a preset writes, and the toolbar's picker) — are siblings in the
 * tree with no prop path between them.
 *
 * The decisions all live in the pure `layoutPresets.ts`/`aspectClass.ts`;
 * this file is the state, the persistence hop and the subscription.
 * Persistence is per aspect class, in `columnPrefs.ts`'s one per-machine
 * document (R93: one key for all per-machine shell state).
 *
 * `orientation` is held here rather than derived from `active` on every
 * read so that a hand-thrown column toggle does not also un-stack the
 * frame: leaving Stacked for `"custom"` keeps the maths panel where it is,
 * because nothing the user just did said otherwise. It is not persisted —
 * a class whose stored preset is `"custom"` starts from the column
 * orientation, the arrangement every preset but Stacked uses.
 */

/** Everything the store holds. */
interface LayoutPresetState {
  aspectClass: AspectClass;
  active: ActivePreset;
  orientation: MathsOrientation;
}

/** The state before `AppShell` has measured the viewport: the `wide`
 *  class's own default, which is also `resolveAspectClass`'s answer for an
 *  unmeasured size. */
let state: LayoutPresetState = {
  aspectClass: "wide",
  active: DEFAULT_PRESET_BY_CLASS.wide,
  orientation: presetLayout(DEFAULT_PRESET_BY_CLASS.wide).mathsOrientation,
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** Writes `active` into this machine's prefs under `cls`, leaving every
 *  other class's remembered preset alone. Never throws (`columnPrefs.ts`'s
 *  own storage discipline). */
function persist(cls: AspectClass, active: ActivePreset): void {
  const prefs = readColumnPrefs();
  writeColumnPrefs({ ...prefs, presets: { ...prefs.presets, [cls]: active } });
}

/**
 * Publishes the viewport's current shape class (R213 item 2). A class
 * change recalls that class's own remembered preset — the whole point of
 * the ruling: the same laptop on a different monitor comes back to the
 * arrangement it had there.
 *
 * The caller owns the 200 ms debounce (`aspectClass.ts`'s
 * `ASPECT_CLASS_DEBOUNCE_MS`, applied in `AppShell.tsx`), so this never
 * fires mid-gesture. Publishing the same class twice is a no-op.
 */
export function setAspectClass(cls: AspectClass): void {
  if (state.aspectClass === cls) return;
  const active = readColumnPrefs().presets[cls];
  state = { aspectClass: cls, active, orientation: active === "custom" ? "column" : presetLayout(active).mathsOrientation };
  notify();
}

/** Applies `id` — the toolbar picker, and `Ctrl+Shift+L` via
 *  {@link cycleLayoutPreset}. Remembered for the current class. */
export function setActiveLayoutPreset(id: LayoutPresetId): void {
  if (state.active === id) return;
  state = { ...state, active: id, orientation: presetLayout(id).mathsOrientation };
  persist(state.aspectClass, id);
  notify();
}

/** `Ctrl+Shift+L`: Output → Maths → Split → Stacked → … (R213 item 3). */
export function cycleLayoutPreset(): void {
  const id = nextPreset(state.active);
  // `setActiveLayoutPreset` is a no-op when `id` is already active, which
  // `nextPreset` never returns — the cycle always moves.
  setActiveLayoutPreset(id);
}

/**
 * Reports the R161 toggles' new state after the user threw one by hand
 * (R213 item 3): the class moves to `"custom"` unless the new set still
 * matches the active preset. The maths orientation is left where it was —
 * a toggle is not a request to re-stack the frame.
 */
export function noteColumnsChangedByHand(columns: PresetColumnVisibility): void {
  const active = presetAfterColumnChange(state.active, columns, state.orientation);
  if (active === state.active) return;
  state = { ...state, active };
  persist(state.aspectClass, active);
  notify();
}

/** The active preset, for non-React call sites. */
export function getActiveLayoutPreset(): ActivePreset {
  return state.active;
}

/** The maths panel's orientation, for non-React call sites. */
export function getMathsOrientation(): MathsOrientation {
  return state.orientation;
}

/** Subscribes `handler` to every change of preset, class or orientation.
 *  Returns an unsubscribe function. */
export function subscribeLayoutPreset(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the active preset, re-rendering whenever it changes. */
export function useActiveLayoutPreset(): ActivePreset {
  return useSyncExternalStore(subscribeLayoutPreset, getActiveLayoutPreset);
}

/** React hook: where the maths panel sits, re-rendering whenever that
 *  changes. */
export function useMathsOrientation(): MathsOrientation {
  return useSyncExternalStore(subscribeLayoutPreset, getMathsOrientation);
}

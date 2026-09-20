import { useSyncExternalStore } from "react";
import type { SerializedDockview } from "dockview";

import type { AspectClass } from "./aspectClass";
import { readColumnPrefs, writeColumnPrefs } from "./columnPrefs";
import {
  defaultDockLayoutFor,
  dockLayoutDocument,
  matchingNamedLayout,
  namedDockLayout,
  sanitizeDockLayout,
} from "./dockLayout";
import {
  DEFAULT_PRESET_BY_CLASS,
  LAYOUT_PRESET_CYCLE,
  nextPreset,
  type ActivePreset,
  type LayoutPresetId,
} from "./layoutPresets";

/**
 * The live studio layout (rulings R213, replaced in substance by R239):
 * the Dockview arrangement on screen, which viewport shape it belongs to,
 * and which of the four named layouts it still *is* (or `"custom"`, once
 * the user has dragged it into something with no name).
 *
 * A module-scope store, the same shape as `studioColumns.ts`'s and
 * `graphSlot.ts`'s, for the same reason: its readers — `AppShell.tsx` (the
 * `Ctrl+Shift+L` shortcut and the aspect-class watcher), `DockFrame.tsx`
 * (the layout to apply) and the Notebook page (the ribbon's picker) — are
 * siblings in the tree with no prop path between them.
 *
 * The decisions all live in the pure `dockLayout.ts`/`layoutPresets.ts`;
 * this file is the state, the persistence hop and the subscription.
 * Persistence is per aspect class, in `columnPrefs.ts`'s one per-machine
 * document (R93: one key for all per-machine shell state) — the layout
 * under `dock`, the name it goes by under `presets`, written together so
 * the two can never disagree about what a class last had.
 *
 * **What R239 changed.** Before it, this store held a preset id, a maths
 * orientation and nothing else, and the arrangement was rebuilt from those
 * three facts on every render. Now the arrangement *is* the state: a
 * layout the user dragged has no preset id to rebuild it from, so the
 * document is what is kept and a named layout is simply one of the
 * documents this build knows how to write ({@link namedDockLayout}).
 */

/** Everything the store holds. */
interface LayoutState {
  aspectClass: AspectClass;
  active: ActivePreset;
  layout: SerializedDockview;
}

/** The state before `AppShell` has measured the viewport: the `wide`
 *  class's own default, which is also `resolveAspectClass`'s answer for an
 *  unmeasured size. Read from storage lazily rather than here, so this
 *  module stays importable in a test environment with no `window`. */
let state: LayoutState = {
  aspectClass: "wide",
  active: DEFAULT_PRESET_BY_CLASS.wide,
  layout: defaultDockLayoutFor("wide"),
};

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Bumped every time {@link state.layout} is replaced by something other
 * than the dock's own report of itself — a named layout applied, or a
 * viewport shape change recalling that class's stored one.
 *
 * `DockFrame.tsx` watches this rather than the layout's identity: a
 * document the dock just handed back through {@link noteDockLayoutChanged}
 * must *not* be pushed into `fromJSON` again, or every divider drag would
 * tear the grid down and rebuild it mid-gesture.
 */
let applyEpoch = 0;

/** Writes `active` and `layout` into this machine's prefs under `cls`,
 *  leaving every other class's alone. Never throws (`columnPrefs.ts`'s own
 *  storage discipline). */
function persist(cls: AspectClass, active: ActivePreset, layout: SerializedDockview): void {
  const prefs = readColumnPrefs();
  writeColumnPrefs({
    ...prefs,
    presets: { ...prefs.presets, [cls]: active },
    dock: { ...prefs.dock, [cls]: dockLayoutDocument(layout) },
  });
}

/**
 * Publishes the viewport's current shape class (R213 item 2). A class
 * change recalls that class's own stored layout — the whole point of the
 * ruling: the same laptop on a different monitor comes back to the
 * arrangement it had there.
 *
 * The caller owns the 200 ms debounce (`aspectClass.ts`'s
 * `ASPECT_CLASS_DEBOUNCE_MS`, applied in `AppShell.tsx`), so this never
 * fires mid-gesture. Publishing the same class twice is a no-op.
 */
export function setAspectClass(cls: AspectClass): void {
  if (state.aspectClass === cls) return;
  const prefs = readColumnPrefs();
  const fallback = defaultDockLayoutFor(cls);
  state = {
    aspectClass: cls,
    active: prefs.presets[cls],
    layout: sanitizeDockLayout(prefs.dock[cls], fallback),
  };
  applyEpoch += 1;
  notify();
}

/** Restores this class's stored layout at start-up, once `AppShell` has a
 *  viewport to measure. Separate from {@link setAspectClass} because that
 *  one is a no-op for the class the store already believes it is in, and
 *  the very first measurement usually *is* `wide`. */
export function restoreStoredLayout(cls: AspectClass): void {
  const prefs = readColumnPrefs();
  state = {
    aspectClass: cls,
    active: prefs.presets[cls],
    layout: sanitizeDockLayout(prefs.dock[cls], defaultDockLayoutFor(cls)),
  };
  applyEpoch += 1;
  notify();
}

/** Applies `id`'s named layout — the ribbon picker, and `Ctrl+Shift+L` via
 *  {@link cycleLayoutPreset}. Remembered for the current class.
 *
 *  Unconditional, unlike the pre-R239 version's "no-op when already
 *  active": picking the layout you are already nominally in is now how a
 *  user gets *back* to it after dragging a divider or closing a panel, and
 *  refusing that would leave the picker's own highlighted entry inert. */
export function setActiveLayoutPreset(id: LayoutPresetId): void {
  const layout = namedDockLayout(id);
  state = { ...state, active: id, layout };
  applyEpoch += 1;
  persist(state.aspectClass, id, layout);
  notify();
}

/** `Ctrl+Shift+L`: Output → Maths → Split → Stacked → … (R213 item 3). */
export function cycleLayoutPreset(): void {
  setActiveLayoutPreset(nextPreset(state.active));
}

/**
 * Reports the arrangement the dock now has, after the user dragged, split,
 * resized or closed something (R239; R213 item 3's "thrown by hand"
 * bookkeeping, generalised from three toggles to a whole grid).
 *
 * The class stays on its named layout while the arrangement still *is*
 * that layout — resizing a divider is not leaving it
 * ({@link matchingNamedLayout}'s own rule) — and moves to `"custom"`
 * otherwise, so the ribbon's picker and what is on screen can never
 * disagree. The active layout is tested first, for the reason
 * `presetAfterColumnChange` preferred the active one: Maths and Split
 * differ only in a width, and a width is not a departure.
 */
export function noteDockLayoutChanged(layout: SerializedDockview): void {
  const candidates: LayoutPresetId[] =
    state.active === "custom" ? [...LAYOUT_PRESET_CYCLE] : [state.active, ...LAYOUT_PRESET_CYCLE];
  const active: ActivePreset = matchingNamedLayout(layout, candidates) ?? "custom";
  // No `applyEpoch` bump: this layout came *from* the dock, and pushing it
  // back through `fromJSON` would rebuild the grid under the pointer.
  state = { ...state, active, layout };
  persist(state.aspectClass, active, layout);
  notify();
}

/** {@link getDockLayoutApplication}'s stable return value. */
let cachedApplication: { layout: SerializedDockview; epoch: number } = { layout: state.layout, epoch: applyEpoch };

/** The active named layout, for non-React call sites. */
export function getActiveLayoutPreset(): ActivePreset {
  return state.active;
}

/** The layout to apply, and the epoch it was applied at. Stable by
 *  reference between changes, so `useSyncExternalStore` can return it. */
export function getDockLayoutApplication(): { layout: SerializedDockview; epoch: number } {
  // Rebuilt only when either half changes, so the object identity a
  // subscriber compares is stable between notifications.
  if (cachedApplication.layout !== state.layout || cachedApplication.epoch !== applyEpoch) {
    cachedApplication = { layout: state.layout, epoch: applyEpoch };
  }
  return cachedApplication;
}

/** Subscribes `handler` to every change of layout, class or named layout.
 *  Returns an unsubscribe function. */
export function subscribeLayoutPreset(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the active named layout, re-rendering whenever it changes. */
export function useActiveLayoutPreset(): ActivePreset {
  return useSyncExternalStore(subscribeLayoutPreset, getActiveLayoutPreset);
}

/** React hook: the layout `DockFrame` should apply, with the epoch that
 *  says whether it is new. */
export function useDockLayoutApplication(): { layout: SerializedDockview; epoch: number } {
  return useSyncExternalStore(subscribeLayoutPreset, getDockLayoutApplication);
}

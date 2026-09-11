import { useSyncExternalStore } from "react";

/**
 * Whether the Docs panel is open, and which anchor it was last asked to
 * scroll to (ruling R222 item 2).
 *
 * A module-level store rather than React state, and the same
 * publish/subscribe convention as `sidebarSlot.ts` beside it, for one
 * reason: the three things that open this panel are nowhere near each
 * other in the tree — a CodeMirror keymap (`F1`, which is not a React
 * event at all), a button in the code column, and a menu command. Lifting
 * the state to a common ancestor would mean threading a callback through
 * every one of them.
 *
 * Named `docsPanelStore.ts` rather than `docsPanel.ts` so it cannot collide
 * with `DocsPanel.tsx` on a case-insensitive filesystem.
 *
 * The panel replaces the sidebar's route content while it is open; the
 * route panels stay mounted and hidden underneath, so closing Docs returns
 * the session list with its scroll position and selection intact.
 */

/** What the panel is currently asked to show. */
export interface DocsPanelState {
  /** Whether the panel is on screen. */
  open: boolean;
  /** The anchor to scroll to, or `null` for "wherever it already was".
   *  Carries a `nonce` alongside it so asking for the *same* anchor twice
   *  still scrolls — pressing `F1` on the same word twice is a real
   *  gesture, and a bare string would make the second press a no-op. */
  anchor: string | null;
  /** Increments on every request; the panel's scroll effect depends on it. */
  nonce: number;
}

let state: DocsPanelState = { open: false, anchor: null, nonce: 0 };

const listeners = new Set<() => void>();

function set(next: DocsPanelState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Opens the panel, optionally scrolling to `anchor`. */
export function openDocs(anchor: string | null = null): void {
  set({ open: true, anchor, nonce: state.nonce + 1 });
}

/** Closes the panel. The anchor is kept, so reopening returns to where the
 *  reader was rather than to the top of a 1900-line document. */
export function closeDocs(): void {
  set({ ...state, open: false });
}

/** Opens the panel if it is closed, closes it if it is open — what the
 *  "Docs" button and the menu command do. */
export function toggleDocs(anchor: string | null = null): void {
  if (state.open && anchor === null) {
    closeDocs();
    return;
  }
  openDocs(anchor);
}

/** The current state, for tests and non-React callers. */
export function getDocsPanelState(): DocsPanelState {
  return state;
}

/** Resets the store. Test-only — every test that opens the panel leaves a
 *  module-level flag set for the next one otherwise. */
export function resetDocsPanel(): void {
  set({ open: false, anchor: null, nonce: 0 });
}

/** Subscribes to changes. Returns an unsubscribe. */
export function subscribeDocsPanel(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook over the store. */
export function useDocsPanel(): DocsPanelState {
  return useSyncExternalStore(subscribeDocsPanel, getDocsPanelState, getDocsPanelState);
}

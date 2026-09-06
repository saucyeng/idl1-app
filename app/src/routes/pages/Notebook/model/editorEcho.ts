/**
 * The Properties↔Code editor shell's (Task 15) loop-suppression decision,
 * pulled into a tiny pure/tested module per Task 15's own brief (a
 * reviewer must be able to reason about this without CLAUDE.md §4's
 * rendering exemption covering it): `EditorPanes` mounts `PropertiesForm`
 * and `CodePane` side by side over the same cell body, and both write
 * through the same `onChange` handler. When one pane's edit updates the
 * shared `code` prop, the other pane receives that prop as an externally
 * changed value and (`CodePane.tsx`'s own sync effect) re-applies it to its
 * live document, which can re-fire its own debounced `onChange` for a
 * change it did not originate. `isEditorEcho` lets `EditorPanes` recognise
 * "this is the exact text I last wrote for this cell" and drop it instead
 * of writing it through again.
 */

/**
 * True when `incoming` is exactly the code `EditorPanes` itself last wrote
 * for the currently open cell (`lastApplied`), so the caller should skip
 * writing it through `replaceCellBody` again rather than treat it as a
 * fresh user edit. `lastApplied === null` (nothing written yet for this
 * cell) is never an echo.
 */
export function isEditorEcho(lastApplied: string | null, incoming: string): boolean {
  return lastApplied !== null && lastApplied === incoming;
}

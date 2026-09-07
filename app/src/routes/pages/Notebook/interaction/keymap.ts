import type { ChartAction } from "./chartActions";

/** The subset of a `KeyboardEvent` {@link actionForKey} reads — a plain
 *  record so every binding is tested with no DOM and no synthetic event
 *  construction (`chartActions.test.ts`'s pairing test relies on this same
 *  shape). `altKey` is deliberately not part of this shape (idl0's
 *  Alt-modified bindings, `Settings/controls.ts`'s provisional table,
 *  could not be ported exactly — see this module's own doc comment). */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Keyboard zoom/pan bindings (decision 27). Pure: a `KeyLike` in, an action
 * or `null` out, so every binding — and a modifier collision — is a test,
 * not a runtime surprise.
 *
 * **Diverges from `Settings/controls.ts`'s provisional table** (ported
 * verbatim from idl0's Flutter app, R53 Q2): that table binds zoom to
 * `Alt + →/←` and reset to `F2`, but this module's given signature carries
 * no `altKey`, so an `Alt`-gated binding cannot be distinguished from a
 * plain arrow press here. Landed bindings instead use the vertical arrows
 * for zoom (there is no Y-axis to pan, so `ArrowUp`/`ArrowDown` are free)
 * and the horizontal arrows for pan, both with no modifier; `0` resets
 * (mirroring idl0's numeric reset convention elsewhere in the codebase
 * more than its own `F2`, since function keys are easy to intercept
 * unintentionally in a browser tab); `z`/`Z` zooms to the pending
 * drag-rectangle selection (idl0's `Z` = "zoom to cursors", the nearest
 * analogue); `Ctrl+Shift+C` copies the cursor's readout values, matching
 * idl0's own binding exactly. The lead's report should reconcile
 * `Settings/controls.ts` against this table (this file, not that one, now
 * reflects what the landed viewport code can actually do).
 *
 * @param e The key event's `key`/`ctrlKey`/`metaKey`/`shiftKey` fields.
 */
export function actionForKey(e: KeyLike): ChartAction | null {
  const noModifiers = !e.ctrlKey && !e.metaKey && !e.shiftKey;

  if (noModifiers) {
    switch (e.key) {
      case "ArrowUp":
        return "zoomIn";
      case "ArrowDown":
        return "zoomOut";
      case "ArrowLeft":
        return "panLeft";
      case "ArrowRight":
        return "panRight";
      case "0":
        return "resetZoom";
      case "z":
      case "Z":
        return "zoomToSelection";
    }
  }

  if (e.ctrlKey && e.shiftKey && !e.metaKey && (e.key === "c" || e.key === "C")) {
    return "copyValue";
  }

  return null;
}

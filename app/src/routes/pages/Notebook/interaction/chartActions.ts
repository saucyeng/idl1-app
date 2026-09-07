/**
 * The Notebook chart's action set (UI-11; decision 27's right-click action
 * menu), ported from idl0's `ChartAction` enum (`FLUTTER-UI-SURVEY.md` §7)
 * and narrowed to what the landed `model/viewport.ts` / `model/cursor.ts` /
 * `model/codeVisibility.ts` code can actually do today — idl0's Y-axis
 * zoom, multi-cursor swap and figure export have no landed equivalent
 * (decision 28 defers export explicitly) and are dropped rather than
 * shipped as dead menu entries: "a menu item that does nothing is worse
 * than an absent one."
 */
export type ChartAction =
  | "zoomIn"
  | "zoomOut"
  | "zoomToSelection"
  | "resetZoom"
  | "panLeft"
  | "panRight"
  | "setCursor"
  | "clearCursor"
  | "cursorToPeak"
  | "toggleCode"
  | "copyValue";

/** The context a chart action menu is opened in, used to decide which
 *  actions apply (below) — never which viewport/cursor state they read;
 *  that stays in `ChartCell.tsx`'s own action handlers. */
export interface ChartActionContext {
  /** The worksheet's shared cursor (`UI-DIRECTION` "Cursor/hover") is set
   *  on this worksheet right now — gates `clearCursor`/`copyValue`. */
  hasCursor: boolean;
  /** A drag-rectangle selection (decision 27) is pending on this chart —
   *  gates `zoomToSelection`. */
  hasSelection: boolean;
  /** The chart's current viewport differs from the full session span —
   *  gates `resetZoom` (offering to reset a view that is already the full
   *  span teaches nothing). */
  canReset: boolean;
}

/**
 * Which actions apply in `ctx`, in menu order, with `"-"` separators.
 * `zoomIn`/`zoomOut`/`panLeft`/`panRight`/`setCursor`/`cursorToPeak`/
 * `toggleCode` are unconditional (always at least one item flanks every
 * separator, by construction — see `chartActions.test.ts`'s "no adjacent
 * or edge separator" property test, checked across every `ctx` combination
 * rather than asserted only for one).
 *
 * @param ctx See {@link ChartActionContext}.
 */
export function actionsFor(ctx: ChartActionContext): (ChartAction | "-")[] {
  const items: (ChartAction | "-")[] = [];

  items.push("zoomIn", "zoomOut");
  if (ctx.hasSelection) items.push("zoomToSelection");
  if (ctx.canReset) items.push("resetZoom");

  items.push("-");
  items.push("panLeft", "panRight");

  items.push("-");
  items.push("setCursor");
  if (ctx.hasCursor) items.push("clearCursor");
  items.push("cursorToPeak");
  if (ctx.hasCursor) items.push("copyValue");

  items.push("-");
  items.push("toggleCode");

  return items;
}

/** `action`'s menu label and keyboard-shortcut hint. `hint` is non-`null`
 *  exactly for the actions `interaction/keymap.ts`'s `actionForKey` binds
 *  a key to — see `chartActions.test.ts`'s pairing test, which derives the
 *  bound set from `keymap.ts` itself rather than duplicating the list here,
 *  so the two modules cannot silently disagree.
 *
 * @param a The action to label.
 */
export function actionLabel(a: ChartAction): { label: string; hint: string | null } {
  switch (a) {
    case "zoomIn":
      return { label: "Zoom in", hint: "↑" };
    case "zoomOut":
      return { label: "Zoom out", hint: "↓" };
    case "zoomToSelection":
      return { label: "Zoom to selection", hint: "Z" };
    case "resetZoom":
      return { label: "Reset zoom", hint: "0" };
    case "panLeft":
      return { label: "Pan left", hint: "←" };
    case "panRight":
      return { label: "Pan right", hint: "→" };
    case "setCursor":
      return { label: "Set cursor here", hint: null };
    case "clearCursor":
      return { label: "Clear cursor", hint: null };
    case "cursorToPeak":
      return { label: "Cursor to peak", hint: null };
    case "toggleCode":
      return { label: "Show/hide code", hint: null };
    case "copyValue":
      return { label: "Copy cursor values", hint: "Ctrl+Shift+C" };
  }
}

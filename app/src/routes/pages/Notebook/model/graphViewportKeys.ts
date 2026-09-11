/**
 * The maths canvas's viewport keyboard map (ruling R212 item 2: "Keyboard:
 * F / 0 / +/-"). Isaac, 2026-09-11: "extend the canvas boundary, infinite
 * canvas CAD style, canvas space is cheap if we can reset the zoom easily".
 *
 * Pure, and separate from the component for the usual reason: which key
 * means what is a decision, and the two keys that do the same thing (`+`
 * arrives as `"+"` on a shifted row and as `"="` unshifted, and as
 * `"Add"` on a numpad) are exactly the kind of detail that rots silently
 * inside JSX. `interaction/keymap.ts` covers the chart keys; this is the
 * canvas's own, kept apart because a canvas has no cursor to move.
 */

/** What a key press asks the viewport to do. */
export type GraphViewportAction = "fit" | "reset" | "zoom-in" | "zoom-out";

/** One key press, narrowed to the two fields this decision reads — so a
 *  caller can pass a `KeyboardEvent` directly and a test need not build
 *  one. */
export interface GraphViewportKey {
  /** `KeyboardEvent.key`. */
  key: string;
  /** True when the event came from a text field. A canvas shortcut must
   *  never fire while someone is typing in the node search box — `f` is a
   *  letter before it is a command. */
  fromTextField: boolean;
}

/**
 * The action `press` asks for, or `null` for every other key.
 *
 * - `f` / `F` — fit every node in view.
 * - `0` — reset to 100 %, keeping the centre.
 * - `+`, `=`, `Add` — zoom in a step. (`=` because `+` is shift-`=` on a US
 *   layout and nobody holds shift to zoom.)
 * - `-`, `_`, `Subtract` — zoom out a step.
 *
 * A modifier press (ctrl/meta/alt) is deliberately **not** filtered here:
 * the caller decides, since `ctrl`-`+` is the browser's own page zoom on
 * one platform and free on another. What is filtered is the one case that
 * is never ambiguous — typing.
 */
export function graphViewportAction(press: GraphViewportKey): GraphViewportAction | null {
  if (press.fromTextField) return null;

  switch (press.key) {
    case "f":
    case "F":
      return "fit";
    case "0":
      return "reset";
    case "+":
    case "=":
    case "Add":
      return "zoom-in";
    case "-":
    case "_":
    case "Subtract":
      return "zoom-out";
    default:
      return null;
  }
}

/**
 * True when `target` is a place text is typed, so {@link
 * graphViewportAction} should be told to stand down. Checks the tag name
 * and `contentEditable` rather than a class list: the canvas hosts a search
 * input of its own and an inline rename/argument editor on every card, and
 * a new one of those must not have to remember to opt out.
 *
 * Duck-typed rather than `instanceof HTMLElement`, so this module stays
 * pure and dependency-free — `vitest.config.ts` runs the suite in the
 * `node` environment, where that constructor does not exist at all, and a
 * decision this small should not need a DOM to be tested.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === "string" ? element.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable === true;
}

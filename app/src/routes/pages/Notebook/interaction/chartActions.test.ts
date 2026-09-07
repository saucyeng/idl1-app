import { describe, expect, it } from "vitest";

import { actionLabel, actionsFor, type ChartAction, type ChartActionContext } from "./chartActions";
import { actionForKey } from "./keymap";

const ALL_ACTIONS: ChartAction[] = [
  "zoomIn",
  "zoomOut",
  "zoomToSelection",
  "resetZoom",
  "panLeft",
  "panRight",
  "setCursor",
  "clearCursor",
  "cursorToPeak",
  "toggleCode",
  "copyValue",
];

/** Every `actionForKey` binding this suite knows of, probed with a
 *  representative unmodified/modified key event per action — used to
 *  derive "is this action bound" without duplicating `keymap.ts`'s table. */
const PROBE_EVENTS: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }[] = [
  { key: "ArrowUp", ctrlKey: false, metaKey: false, shiftKey: false },
  { key: "ArrowDown", ctrlKey: false, metaKey: false, shiftKey: false },
  { key: "ArrowLeft", ctrlKey: false, metaKey: false, shiftKey: false },
  { key: "ArrowRight", ctrlKey: false, metaKey: false, shiftKey: false },
  { key: "0", ctrlKey: false, metaKey: false, shiftKey: false },
  { key: "z", ctrlKey: false, metaKey: false, shiftKey: false },
  { key: "c", ctrlKey: true, metaKey: false, shiftKey: true },
];

function keymapBoundActions(): Set<ChartAction> {
  const bound = new Set<ChartAction>();
  for (const event of PROBE_EVENTS) {
    const action = actionForKey(event);
    if (action !== null) bound.add(action);
  }
  return bound;
}

describe("actionsFor", () => {
  it("actionsFor — no cursor, no selection — the menu omits clearCursor and zoomToSelection", () => {
    const ctx: ChartActionContext = { hasCursor: false, hasSelection: false, canReset: true };

    const items = actionsFor(ctx);

    expect(items).not.toContain("clearCursor");
    expect(items).not.toContain("zoomToSelection");
    expect(items).toContain("setCursor");
  });

  it("actionsFor — every context — no two separators adjacent and none leading or trailing", () => {
    const bools = [false, true];

    for (const hasCursor of bools) {
      for (const hasSelection of bools) {
        for (const canReset of bools) {
          const items = actionsFor({ hasCursor, hasSelection, canReset });

          expect(items[0]).not.toBe("-");
          expect(items[items.length - 1]).not.toBe("-");
          for (let i = 0; i < items.length - 1; i++) {
            if (items[i] === "-") {
              expect(items[i + 1]).not.toBe("-");
            }
          }
        }
      }
    }
  });
});

describe("actionLabel", () => {
  it("actionLabel — every ChartAction — a label, and a hint exactly when keymap.ts binds it", () => {
    const bound = keymapBoundActions();

    for (const action of ALL_ACTIONS) {
      const { label, hint } = actionLabel(action);
      expect(label.length).toBeGreaterThan(0);
      if (bound.has(action)) {
        expect(hint).not.toBeNull();
      } else {
        expect(hint).toBeNull();
      }
    }
  });
});

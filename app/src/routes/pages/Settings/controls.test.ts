import { describe, expect, it } from "vitest";

import { actionLabel, type ChartAction } from "../Notebook/interaction/chartActions";
import { actionForKey } from "../Notebook/interaction/keymap";
import { CONTROL_GROUPS } from "./controls";

/** Every `ChartAction` `interaction/keymap.ts` binds a key to, probed the
 *  same way `chartActions.test.ts` does — one representative event per
 *  action — so this file derives "what keymap.ts actually binds" instead
 *  of duplicating its table. */
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

describe("CONTROL_GROUPS", () => {
  it("CONTROL_GROUPS — every group — has a title and at least one row", () => {

    for (const group of CONTROL_GROUPS) {
      expect(group.title.length).toBeGreaterThan(0);
      expect(group.rows.length).toBeGreaterThan(0);
    }
  });

  it("CONTROL_GROUPS — every row — has a non-empty action and a non-empty keystroke", () => {

    for (const group of CONTROL_GROUPS) {
      for (const [action, keystroke] of group.rows) {
        expect(action.length).toBeGreaterThan(0);
        expect(keystroke.length).toBeGreaterThan(0);
      }
    }
  });

  it("CONTROL_GROUPS — the whole table — no keystroke is bound to two different actions within one group", () => {

    for (const group of CONTROL_GROUPS) {
      const seen = new Map<string, string>();
      for (const [action, keystroke] of group.rows) {
        const existing = seen.get(keystroke);
        expect(existing === undefined || existing === action).toBe(true);
        seen.set(keystroke, action);
      }
    }
  });

  it("CONTROL_GROUPS's keyboard group — every action interaction/keymap.ts binds — a matching row", () => {
    const keyboardGroup = CONTROL_GROUPS.find((g) => g.title === "keyboard");
    expect(keyboardGroup).toBeDefined();

    const keyboardLabels = new Set(keyboardGroup!.rows.map(([label]) => label));
    for (const action of keymapBoundActions()) {
      const { label } = actionLabel(action);
      expect(keyboardLabels.has(label)).toBe(true);
    }
  });

  it("CONTROL_GROUPS's keyboard group — every row's keystroke — matches actionLabel's hint for that action", () => {
    const keyboardGroup = CONTROL_GROUPS.find((g) => g.title === "keyboard");
    expect(keyboardGroup).toBeDefined();

    const bound = keymapBoundActions();
    const byLabel = new Map(ALL_ACTIONS.filter((a) => bound.has(a)).map((a) => [actionLabel(a).label, actionLabel(a).hint]));

    for (const [label, keystroke] of keyboardGroup!.rows) {
      const expectedHint = byLabel.get(label);
      if (expectedHint !== undefined) {
        expect(keystroke).toBe(expectedHint);
      }
    }
  });
});

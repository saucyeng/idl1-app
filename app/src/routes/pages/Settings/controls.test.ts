import { describe, expect, it } from "vitest";

import { CONTROL_GROUPS } from "./controls";

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
});

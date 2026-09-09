import { describe, expect, it } from "vitest";

import type { SelectionWindow } from "../state/selection";
import { collapsedChipLabel, removeWindowAt, selectionChips, shouldCollapseChips } from "./topBarSelection";

describe("selectionChips", () => {
  const nameFor = (id: string) => `session-${id}`;

  it("selectionChips — empty selection — no chips", () => {
    expect(selectionChips([], nameFor)).toEqual([]);
  });

  it("selectionChips — one session window — label from describeWindow, via sessionNameFor rather than the raw id", () => {
    const selection: SelectionWindow[] = [{ sessionId: "abc123", span: { kind: "session" }, colour: "--chart-1" }];

    const chips = selectionChips(selection, () => "Portland Raceway");

    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("Portland Raceway");
    expect(chips[0].label).not.toContain("abc123");
    expect(chips[0].colour).toBe("--chart-1");
    expect(chips[0].index).toBe(0);
  });

  it("selectionChips — a lap window — label includes the lap number", () => {
    const selection: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "lap", lapNumber: 3 }, colour: "--chart-2" }];

    const chips = selectionChips(selection, nameFor);

    expect(chips[0].label).toBe("session-s1 · Lap 3");
  });

  it("selectionChips — two windows over the same session (R117 item 2) — two distinct chips, distinct keys", () => {
    const selection: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-2" },
    ];

    const chips = selectionChips(selection, nameFor);

    expect(chips).toHaveLength(2);
    expect(chips[0].key).not.toBe(chips[1].key);
  });

  it("selectionChips — preserves selection order", () => {
    const selection: SelectionWindow[] = [
      { sessionId: "b", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "a", span: { kind: "session" }, colour: "--chart-2" },
    ];

    const chips = selectionChips(selection, nameFor);

    expect(chips.map((c) => c.label)).toEqual(["session-b", "session-a"]);
  });
});

describe("shouldCollapseChips", () => {
  it("shouldCollapseChips — at the threshold — not collapsed", () => {
    expect(shouldCollapseChips(4)).toBe(false);
  });

  it("shouldCollapseChips — one past the threshold — collapsed", () => {
    expect(shouldCollapseChips(5)).toBe(true);
  });

  it("shouldCollapseChips — zero — not collapsed", () => {
    expect(shouldCollapseChips(0)).toBe(false);
  });
});

describe("collapsedChipLabel", () => {
  it("collapsedChipLabel — formats the count", () => {
    expect(collapsedChipLabel(7)).toBe("7 windows");
  });
});

describe("removeWindowAt", () => {
  it("removeWindowAt — removes exactly the window at the given index", () => {
    const windows: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "s2", span: { kind: "session" }, colour: "--chart-2" },
    ];

    const next = removeWindowAt(windows, 0);

    expect(next).toEqual([{ sessionId: "s2", span: { kind: "session" }, colour: "--chart-2" }]);
  });

  it("removeWindowAt — two windows sharing a windowKey (R117 item 2) — removes only the targeted one", () => {
    const windows: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-2" },
    ];

    const next = removeWindowAt(windows, 1);

    expect(next).toEqual([{ sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" }]);
  });

  it("removeWindowAt — index out of range — no change", () => {
    const windows: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }];

    expect(removeWindowAt(windows, 5)).toEqual(windows);
  });
});

import { describe, expect, it } from "vitest";

import type { SelectionWindow } from "../../../state/selection";
import { lapRowClicked } from "./lapSelection";

describe("lapRowClicked", () => {
  it("lapRowClicked — plain click on an empty selection — selects the lap alone", () => {
    const next = lapRowClicked([], "s1", 2, "replace");

    expect(next).toEqual([{ sessionId: "s1", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-1" }]);
  });

  it("lapRowClicked — add over an existing session window — appends a distinct lap window for the same session (R117 item 2)", () => {
    const current: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }];

    const next = lapRowClicked(current, "s1", 3, "add");

    expect(next).toEqual([
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "lap", lapNumber: 3 }, colour: "--chart-2" },
    ]);
  });

  it("lapRowClicked — toggle on an already-selected lap — removes it", () => {
    const current: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "lap", lapNumber: 4 }, colour: "--chart-3" }];

    const next = lapRowClicked(current, "s1", 4, "toggle");

    expect(next).toEqual([]);
  });

  it("lapRowClicked — toggle on a different lap number of the same session — leaves the other lap selected, adds this one", () => {
    const current: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" }];

    const next = lapRowClicked(current, "s1", 2, "toggle");

    expect(next).toEqual([
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-2" },
    ]);
  });
});

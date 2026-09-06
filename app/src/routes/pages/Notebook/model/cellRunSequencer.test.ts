import { describe, expect, it } from "vitest";

import { CellRunSequencer } from "./cellRunSequencer";

describe("CellRunSequencer", () => {
  it("start — one cell, called once — the returned sequence number is current", () => {
    const sequencer = new CellRunSequencer();

    const seq = sequencer.start("cell-a");

    expect(sequencer.isCurrent("cell-a", seq)).toBe(true);
  });

  it("start — called a second time for the same cell — the first sequence number is no longer current, the second is", () => {
    const sequencer = new CellRunSequencer();

    const first = sequencer.start("cell-a");
    const second = sequencer.start("cell-a");

    expect(sequencer.isCurrent("cell-a", first)).toBe(false);
    expect(sequencer.isCurrent("cell-a", second)).toBe(true);
  });

  it("start — two different cells — each cell's sequence numbers are independent", () => {
    const sequencer = new CellRunSequencer();

    const a1 = sequencer.start("cell-a");
    const b1 = sequencer.start("cell-b");
    const a2 = sequencer.start("cell-a");

    expect(sequencer.isCurrent("cell-a", a1)).toBe(false);
    expect(sequencer.isCurrent("cell-a", a2)).toBe(true);
    expect(sequencer.isCurrent("cell-b", b1)).toBe(true);
  });

  it("isCurrent — a cell that never started a run — is false for any sequence number, including 0", () => {
    const sequencer = new CellRunSequencer();

    expect(sequencer.isCurrent("cell-a", 0)).toBe(false);
    expect(sequencer.isCurrent("cell-a", 1)).toBe(false);
  });

  it("delete — a cell with a current run — that run's sequence number is no longer current", () => {
    const sequencer = new CellRunSequencer();
    const seq = sequencer.start("cell-a");

    sequencer.delete("cell-a");

    expect(sequencer.isCurrent("cell-a", seq)).toBe(false);
  });
});

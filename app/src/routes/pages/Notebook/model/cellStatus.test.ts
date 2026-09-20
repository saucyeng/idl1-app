import { describe, expect, it } from "vitest";

import type { BlockedBy } from "./blockedCells";
import { cellStatus, CELL_STATUSES, isCellStale, isCellWaiting, needsPendingSlot, type CellStatusInputs } from "./cellStatus";

/** A done cell — every test below changes exactly the signals it is about. */
const DONE: CellStatusInputs = {
  hasOutput: true,
  stale: false,
  evalInFlight: false,
  hasError: false,
  decodeFraction: null,
  blockedBy: null,
  awaitingRender: false,
  hasSelection: true,
};

/** An upstream failure, as `model/blockedCells.ts` reports one. */
const BLOCKER: BlockedBy = { cellId: "1a00", cellLabel: "Cell 3", message: 'unknown channel "speed"' };

describe("cellStatus", () => {
  it("cellStatus — a current, clean result — done", () => {
    const inputs = DONE;

    const status = cellStatus(inputs);

    expect(status).toBe("done");
  });

  it("cellStatus — a cell with no result yet and nothing running — queued", () => {
    const inputs = { ...DONE, hasOutput: false };

    const status = cellStatus(inputs);

    expect(status).toBe("queued");
  });

  it("cellStatus — no result and no window selected — idle, never queued", () => {
    const inputs = { ...DONE, hasOutput: false, hasSelection: false };

    const status = cellStatus(inputs);

    expect(status).toBe("idle");
  });

  it("cellStatus — a cell with no result yet while an evaluation runs — evaluating", () => {
    const inputs = { ...DONE, hasOutput: false, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("evaluating");
  });

  it("cellStatus — channels decoding — fetching, not evaluating", () => {
    const inputs = { ...DONE, hasOutput: false, evalInFlight: true, decodeFraction: 0.4 };

    const status = cellStatus(inputs);

    expect(status).toBe("fetching");
  });

  it("cellStatus — a landed result whose channels are still decoding — fetching, not done", () => {
    const inputs = { ...DONE, decodeFraction: 0.1 };

    const status = cellStatus(inputs);

    expect(status).toBe("fetching");
  });

  it("cellStatus — a decode fraction of exactly zero — fetching, since null is the absent case", () => {
    const inputs = { ...DONE, hasOutput: false, decodeFraction: 0 };

    const status = cellStatus(inputs);

    expect(status).toBe("fetching");
  });

  it("cellStatus — a js cell whose output landed but whose sandbox has not drawn — rendering", () => {
    const inputs = { ...DONE, awaitingRender: true };

    const status = cellStatus(inputs);

    expect(status).toBe("rendering");
  });

  it("cellStatus — an edited cell inside the debounce window — stale, not queued", () => {
    const inputs = { ...DONE, stale: true };

    const status = cellStatus(inputs);

    expect(status).toBe("stale");
  });

  it("cellStatus — stale with and without a run in flight — the same state either way", () => {
    const debouncing = cellStatus({ ...DONE, stale: true, evalInFlight: false });

    const running = cellStatus({ ...DONE, stale: true, evalInFlight: true });

    expect(debouncing).toBe(running);
  });

  it("cellStatus — no output at all while an evaluation runs — evaluating, never stale", () => {
    const inputs = { ...DONE, hasOutput: false, stale: true, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("evaluating");
  });

  it("cellStatus — a current result that failed — error", () => {
    const inputs = { ...DONE, hasError: true };

    const status = cellStatus(inputs);

    expect(status).toBe("error");
  });

  it("cellStatus — a failed cell being re-evaluated — reports the re-run, not the superseded failure", () => {
    const inputs = { ...DONE, hasError: true, stale: true, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("stale");
  });

  it("cellStatus — a failed cell whose channels are decoding — error, so the ring never hides the cross", () => {
    const inputs = { ...DONE, hasError: true, decodeFraction: 0.5 };

    const status = cellStatus(inputs);

    expect(status).toBe("error");
  });

  it("cellStatus — an upstream failure — blocked, outranking every other signal", () => {
    const inputs = { ...DONE, blockedBy: BLOCKER, hasError: true, stale: true, evalInFlight: true, decodeFraction: 0.5 };

    const status = cellStatus(inputs);

    expect(status).toBe("blocked");
  });

  it("cellStatus — a done cell while another cell's evaluation runs — stays done", () => {
    const inputs = { ...DONE, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("done");
  });
});

describe("CELL_STATUSES", () => {
  it("CELL_STATUSES — every state — each one is reachable from some input", () => {
    const reachable = new Set([
      cellStatus({ ...DONE, blockedBy: BLOCKER }),
      cellStatus({ ...DONE, stale: true }),
      cellStatus({ ...DONE, hasError: true }),
      cellStatus({ ...DONE, decodeFraction: 0.5 }),
      cellStatus({ ...DONE, hasOutput: false, evalInFlight: true }),
      cellStatus({ ...DONE, awaitingRender: true }),
      cellStatus({ ...DONE, hasOutput: false, hasSelection: false }),
      cellStatus({ ...DONE, hasOutput: false }),
      cellStatus(DONE),
    ]);

    expect([...reachable].sort()).toEqual([...CELL_STATUSES].sort());
  });
});

describe("isCellWaiting", () => {
  it("isCellWaiting — each status — true only where work is outstanding", () => {
    const waiting = CELL_STATUSES.filter(isCellWaiting);

    expect([...waiting].sort()).toEqual(["evaluating", "fetching", "queued", "rendering", "stale"]);
  });

  it("isCellWaiting — blocked — false, since a blocked cell is never going to run", () => {
    const waiting = isCellWaiting("blocked");

    expect(waiting).toBe(false);
  });
});

describe("isCellStale", () => {
  it("isCellStale — each status — true only for a result waiting to be replaced", () => {
    const greyed = CELL_STATUSES.filter(isCellStale);

    expect(greyed).toEqual(["stale"]);
  });

  it("isCellStale — evaluating from scratch — false, so nothing is washed grey", () => {
    const evaluating = isCellStale("evaluating");

    expect(evaluating).toBe(false);
  });
});

describe("needsPendingSlot", () => {
  it("needsPendingSlot — each status — true only where the cell has nothing of its own on screen", () => {
    const reserving = CELL_STATUSES.filter(needsPendingSlot);

    expect([...reserving].sort()).toEqual(["blocked", "evaluating", "fetching", "idle", "queued"]);
  });

  it("needsPendingSlot — stale — false, since the previous output is still mounted", () => {
    const reserving = needsPendingSlot("stale");

    expect(reserving).toBe(false);
  });
});

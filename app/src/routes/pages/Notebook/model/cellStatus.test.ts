import { describe, expect, it } from "vitest";

import { cellStatus, isCellBusy, isCellStale, type CellStatusInputs } from "./cellStatus";

/** A settled cell — every test below changes exactly the signals it is about. */
const SETTLED: CellStatusInputs = { hasOutput: true, stale: false, evalInFlight: false, hasError: false };

describe("cellStatus", () => {
  it("cellStatus — a current, clean result — settled", () => {
    const inputs = SETTLED;

    const status = cellStatus(inputs);

    expect(status).toBe("settled");
  });

  it("cellStatus — a cell with no result yet and nothing running — queued", () => {
    const inputs = { ...SETTLED, hasOutput: false };

    const status = cellStatus(inputs);

    expect(status).toBe("queued");
  });

  it("cellStatus — a cell with no result yet while an evaluation runs — evaluating", () => {
    const inputs = { ...SETTLED, hasOutput: false, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("evaluating");
  });

  it("cellStatus — an edited cell inside the debounce window — stale, not queued", () => {
    const inputs = { ...SETTLED, stale: true };

    const status = cellStatus(inputs);

    expect(status).toBe("stale");
  });

  it("cellStatus — a stale result while the re-run is in flight — stale, not evaluating", () => {
    const inputs = { ...SETTLED, stale: true, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("stale");
  });

  it("cellStatus — stale with and without a run in flight — the same state either way", () => {
    const debouncing = cellStatus({ ...SETTLED, stale: true, evalInFlight: false });

    const running = cellStatus({ ...SETTLED, stale: true, evalInFlight: true });

    expect(debouncing).toBe(running);
  });

  it("cellStatus — no output at all while an evaluation runs — evaluating, never stale", () => {
    const inputs = { ...SETTLED, hasOutput: false, stale: true, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("evaluating");
  });

  it("cellStatus — a current result that failed — error", () => {
    const inputs = { ...SETTLED, hasError: true };

    const status = cellStatus(inputs);

    expect(status).toBe("error");
  });

  it("cellStatus — a failed cell being re-evaluated — reports the re-run, not the superseded failure", () => {
    const inputs = { ...SETTLED, hasError: true, stale: true, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("stale");
  });

  it("cellStatus — a settled cell while another cell's evaluation runs — stays settled", () => {
    const inputs = { ...SETTLED, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("settled");
  });
});

describe("isCellBusy", () => {
  it("isCellBusy — each status — true for both states with an evaluation pending", () => {
    const statuses = ["queued", "evaluating", "stale", "settled", "error"] as const;

    const busy = statuses.filter(isCellBusy);

    expect(busy).toEqual(["evaluating", "stale"]);
  });
});

describe("isCellStale", () => {
  it("isCellStale — each status — true only for a result waiting to be replaced", () => {
    const statuses = ["queued", "evaluating", "stale", "settled", "error"] as const;

    const greyed = statuses.filter(isCellStale);

    expect(greyed).toEqual(["stale"]);
  });

  it("isCellStale — evaluating from scratch — false, so nothing is washed grey", () => {
    const evaluating = isCellStale("evaluating");

    expect(evaluating).toBe(false);
  });
});

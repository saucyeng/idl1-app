import { describe, expect, it } from "vitest";

import { cellStatus, isCellBusy, type CellStatusInputs } from "./cellStatus";

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

  it("cellStatus — an edited cell inside the debounce window — queued, not evaluating", () => {
    const inputs = { ...SETTLED, stale: true };

    const status = cellStatus(inputs);

    expect(status).toBe("queued");
  });

  it("cellStatus — a stale result while the re-run is in flight — evaluating", () => {
    const inputs = { ...SETTLED, stale: true, evalInFlight: true };

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

    expect(status).toBe("evaluating");
  });

  it("cellStatus — a settled cell while another cell's evaluation runs — stays settled", () => {
    const inputs = { ...SETTLED, evalInFlight: true };

    const status = cellStatus(inputs);

    expect(status).toBe("settled");
  });
});

describe("isCellBusy", () => {
  it("isCellBusy — each status — true only while evaluating", () => {
    const statuses = ["queued", "evaluating", "settled", "error"] as const;

    const busy = statuses.filter(isCellBusy);

    expect(busy).toEqual(["evaluating"]);
  });
});

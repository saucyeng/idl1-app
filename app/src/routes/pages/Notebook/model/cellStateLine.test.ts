import { describe, expect, it } from "vitest";

import { cellStateLine, describeElapsed, ELAPSED_VISIBLE_AFTER_MS, type CellStateLineInputs } from "./cellStateLine";
import { CELL_STATUSES } from "./cellStatus";

/** A queued cell — every test below changes exactly what it is about. */
const QUEUED: CellStateLineInputs = {
  status: "queued",
  decodeFraction: null,
  decodingChannel: null,
  blockedBy: null,
  elapsedMs: null,
};

describe("cellStateLine", () => {
  it("cellStateLine — every state — a line for all of them but the two with their own pixels", () => {
    const silent = CELL_STATUSES.filter((status) => cellStateLine({ ...QUEUED, status, blockedBy: null }) === null);

    expect([...silent].sort()).toEqual(["done", "error"]);
  });

  it("cellStateLine — queued — says so, with a spinner and no fraction", () => {
    const inputs = QUEUED;

    const line = cellStateLine(inputs);

    expect(line).toEqual({ text: "Queued", fraction: null, busy: true });
  });

  it("cellStateLine — fetching one named channel — names it and its percentage", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "fetching", decodeFraction: 0.409, decodingChannel: "IMU0_AccelZ" };

    const line = cellStateLine(inputs);

    expect(line?.text).toBe("Fetching IMU0_AccelZ · 40 %");
  });

  it("cellStateLine — fetching with several channels in flight — names none of them", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "fetching", decodeFraction: 0.5, decodingChannel: null };

    const line = cellStateLine(inputs);

    expect(line?.text).toBe("Fetching channels · 50 %");
  });

  it("cellStateLine — a fetch at 99.9 % — floors, so the line never reads 100 % while it runs", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "fetching", decodeFraction: 0.999, decodingChannel: null };

    const line = cellStateLine(inputs);

    expect(line?.text).toBe("Fetching channels · 99 %");
  });

  it("cellStateLine — fetching — carries the fraction, so the ring is determinate", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "fetching", decodeFraction: 0.25, decodingChannel: null };

    const line = cellStateLine(inputs);

    expect(line?.fraction).toBe(0.25);
  });

  it("cellStateLine — blocked — names the upstream cell and its error", () => {
    const inputs: CellStateLineInputs = {
      ...QUEUED,
      status: "blocked",
      blockedBy: { cellId: "1a00", cellLabel: "Cell 3", message: "unknown channel" },
    };

    const line = cellStateLine(inputs);

    expect(line).toEqual({ text: "Blocked by Cell 3: unknown channel", fraction: null, busy: false });
  });

  it("cellStateLine — idle — says why nothing is running, and is not busy", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "idle" };

    const line = cellStateLine(inputs);

    expect(line).toEqual({ text: "No session selected", fraction: null, busy: false });
  });

  it("cellStateLine — a wait under the threshold — no elapsed time", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "evaluating", elapsedMs: ELAPSED_VISIBLE_AFTER_MS - 1 };

    const line = cellStateLine(inputs);

    expect(line?.text).toBe("Evaluating");
  });

  it("cellStateLine — a wait past the threshold — appends the elapsed time", () => {
    const inputs: CellStateLineInputs = { ...QUEUED, status: "evaluating", elapsedMs: 4200 };

    const line = cellStateLine(inputs);

    expect(line?.text).toBe("Evaluating · 4 s");
  });

  it("cellStateLine — a long-blocked cell — no elapsed time, since it has not been waiting", () => {
    const inputs: CellStateLineInputs = {
      ...QUEUED,
      status: "blocked",
      blockedBy: { cellId: null, cellLabel: "speed", message: "unknown channel" },
      elapsedMs: 90_000,
    };

    const line = cellStateLine(inputs);

    expect(line?.text).toBe("Blocked by speed: unknown channel");
  });
});

describe("describeElapsed", () => {
  it("describeElapsed — under a minute — whole seconds", () => {
    const text = describeElapsed(4900);

    expect(text).toBe("4 s");
  });

  it("describeElapsed — over a minute — minutes and seconds", () => {
    const text = describeElapsed(80_000);

    expect(text).toBe("1 min 20 s");
  });

  it("describeElapsed — exactly a minute — no stray seconds", () => {
    const text = describeElapsed(60_000);

    expect(text).toBe("1 min 0 s");
  });
});

import { describe, expect, it } from "vitest";

import { CELL_STATUSES } from "./cellStatus";
import { evalSummaryOf } from "./evalSummary";

describe("evalSummaryOf", () => {
  it("evalSummaryOf — one of every state — counts each into its own term", () => {
    const summary = evalSummaryOf(CELL_STATUSES);

    expect(summary).toEqual({ done: 1, working: 4, error: 1, blocked: 1 });
  });

  it("evalSummaryOf — a stale cell — counts as working, not as done", () => {
    const summary = evalSummaryOf(["stale", "done"]);

    expect(summary).toEqual({ done: 1, working: 1, error: 0, blocked: 0 });
  });

  it("evalSummaryOf — queued and idle cells — counted as nothing at all", () => {
    const summary = evalSummaryOf(["queued", "idle", "queued"]);

    expect(summary).toEqual({ done: 0, working: 0, error: 0, blocked: 0 });
  });

  it("evalSummaryOf — no cells — every count zero", () => {
    const summary = evalSummaryOf([]);

    expect(summary).toEqual({ done: 0, working: 0, error: 0, blocked: 0 });
  });
});

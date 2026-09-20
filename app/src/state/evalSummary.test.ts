import { describe, expect, it } from "vitest";

import { describeEvalSummary, NO_EVAL_SUMMARY, summaryNeedsAttention } from "./evalSummary";

describe("describeEvalSummary", () => {
  it("describeEvalSummary — all four terms — done, working, error, blocked in that order", () => {
    const text = describeEvalSummary({ done: 12, working: 2, error: 1, blocked: 4 });

    expect(text).toBe("12 done, 2 working, 1 error, 4 blocked");
  });

  it("describeEvalSummary — a settled document — one term, not four with zeros", () => {
    const text = describeEvalSummary({ done: 12, working: 0, error: 0, blocked: 0 });

    expect(text).toBe("12 done");
  });

  it("describeEvalSummary — nothing counted — null, so the bar shows no item at all", () => {
    const text = describeEvalSummary(NO_EVAL_SUMMARY);

    expect(text).toBeNull();
  });
});

describe("summaryNeedsAttention", () => {
  it("summaryNeedsAttention — a failure — true", () => {
    const attention = summaryNeedsAttention({ done: 3, working: 0, error: 1, blocked: 0 });

    expect(attention).toBe(true);
  });

  it("summaryNeedsAttention — a blocked branch with no failure counted — true", () => {
    const attention = summaryNeedsAttention({ done: 3, working: 0, error: 0, blocked: 2 });

    expect(attention).toBe(true);
  });

  it("summaryNeedsAttention — everything working or done — false", () => {
    const attention = summaryNeedsAttention({ done: 3, working: 2, error: 0, blocked: 0 });

    expect(attention).toBe(false);
  });
});

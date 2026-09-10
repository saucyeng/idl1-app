import { describe, expect, it } from "vitest";

import type { PaperLiveInput } from "./paperLive";
import { paperLiveDecision } from "./paperLive";

/** A settled two-lap state — the shape each test below varies one field of. */
const SETTLED: PaperLiveInput = { workbookReady: true, windowCount: 2, settledWindowCount: 2, hasLastDocument: true };

describe("paperLiveDecision", () => {
  it("paperLiveDecision — every selected window settled — rebuild", () => {
    const decision = paperLiveDecision(SETTLED);

    expect(decision).toBe("rebuild");
  });

  it("paperLiveDecision — one of two windows still evaluating — keep-last", () => {
    const input: PaperLiveInput = { ...SETTLED, settledWindowCount: 1 };

    const decision = paperLiveDecision(input);

    expect(decision).toBe("keep-last");
  });

  it("paperLiveDecision — first evaluation still in flight — empty", () => {
    const input: PaperLiveInput = { ...SETTLED, settledWindowCount: 0, hasLastDocument: false };

    const decision = paperLiveDecision(input);

    expect(decision).toBe("empty");
  });

  it("paperLiveDecision — no workbook open — empty even holding a last document", () => {
    const input: PaperLiveInput = { ...SETTLED, workbookReady: false };

    const decision = paperLiveDecision(input);

    expect(decision).toBe("empty");
  });

  it("paperLiveDecision — nothing selected — rebuild, not a wait", () => {
    const input: PaperLiveInput = { workbookReady: true, windowCount: 0, settledWindowCount: 0, hasLastDocument: false };

    const decision = paperLiveDecision(input);

    expect(decision).toBe("rebuild");
  });

  it("paperLiveDecision — a window deselected while its result is held — rebuild", () => {
    const input: PaperLiveInput = { ...SETTLED, windowCount: 1, settledWindowCount: 2 };

    const decision = paperLiveDecision(input);

    expect(decision).toBe("rebuild");
  });

  it("paperLiveDecision — an edit made every window's result stale — keep-last", () => {
    const input: PaperLiveInput = { ...SETTLED, settledWindowCount: 0 };

    const decision = paperLiveDecision(input);

    expect(decision).toBe("keep-last");
  });
});

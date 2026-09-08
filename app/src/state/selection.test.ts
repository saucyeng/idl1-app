import { describe, expect, it } from "vitest";

import { assignColour, describeWindow, nextWindows, sessionDetailsReadinessKey, windowKey, windowsKey, type SelectionWindow } from "./selection";

const sessionWindow = (sessionId: string, colour = "--chart-1"): SelectionWindow => ({
  sessionId,
  span: { kind: "session" },
  colour,
});

const lapWindow = (sessionId: string, lapNumber: number, colour = "--chart-1"): SelectionWindow => ({
  sessionId,
  span: { kind: "lap", lapNumber },
  colour,
});

const rangeWindow = (sessionId: string, t0Us: number, t1Us: number, colour = "--chart-1"): SelectionWindow => ({
  sessionId,
  span: { kind: "range", t0Us, t1Us },
  colour,
});

describe("windowKey", () => {
  it("windowKey — two windows over one session with different laps — distinct keys", () => {
    const a = lapWindow("s1", 1);
    const b = lapWindow("s1", 2);

    expect(windowKey(a)).not.toBe(windowKey(b));
  });

  it("windowKey — same session and span, different colour — same key", () => {
    const a = lapWindow("s1", 2, "--chart-1");
    const b = lapWindow("s1", 2, "--chart-5");

    expect(windowKey(a)).toBe(windowKey(b));
  });

  it("windowKey — session span vs lap span on same session — distinct keys", () => {
    const a = sessionWindow("s1");
    const b = lapWindow("s1", 1);

    expect(windowKey(a)).not.toBe(windowKey(b));
  });

  it("windowKey — different range bounds on same session — distinct keys", () => {
    const a = rangeWindow("s1", 0, 1000);
    const b = rangeWindow("s1", 0, 2000);

    expect(windowKey(a)).not.toBe(windowKey(b));
  });
});

describe("windowsKey", () => {
  it("windowsKey — same windows, different colours — same key", () => {
    const a = [sessionWindow("s1", "--chart-1"), lapWindow("s2", 1, "--chart-2")];
    const b = [sessionWindow("s1", "--chart-5"), lapWindow("s2", 1, "--chart-6")];

    expect(windowsKey(a)).toBe(windowsKey(b));
  });

  it("windowsKey — same two windows in reverse order — different keys", () => {
    const a = [sessionWindow("s1"), lapWindow("s2", 1)];
    const b = [lapWindow("s2", 1), sessionWindow("s1")];

    expect(windowsKey(a)).not.toBe(windowsKey(b));
  });

  it("windowsKey — an added window — changes the key", () => {
    const a = [sessionWindow("s1")];
    const b = [sessionWindow("s1"), lapWindow("s2", 1)];

    expect(windowsKey(a)).not.toBe(windowsKey(b));
  });

  it("windowsKey — the empty list — a stable, distinct key", () => {
    expect(windowsKey([])).toBe("");
    expect(windowsKey([])).not.toBe(windowsKey([sessionWindow("s1")]));
  });
});

describe("sessionDetailsReadinessKey", () => {
  it("sessionDetailsReadinessKey — two windows resolved in different orders — same key", () => {
    const windows = [sessionWindow("s1"), lapWindow("s2", 1)];
    const resolvedS1First = new Map([[windowKey(windows[0]), {}], [windowKey(windows[1]), {}]]);
    const resolvedS2First = new Map([[windowKey(windows[1]), {}], [windowKey(windows[0]), {}]]);

    expect(sessionDetailsReadinessKey(windows, resolvedS1First)).toBe(sessionDetailsReadinessKey(windows, resolvedS2First));
  });

  it("sessionDetailsReadinessKey — one more window resolving — changes the key", () => {
    const windows = [sessionWindow("s1"), lapWindow("s2", 1)];
    const onlyFirstResolved = new Map([[windowKey(windows[0]), {}]]);
    const bothResolved = new Map([[windowKey(windows[0]), {}], [windowKey(windows[1]), {}]]);

    expect(sessionDetailsReadinessKey(windows, onlyFirstResolved)).not.toBe(sessionDetailsReadinessKey(windows, bothResolved));
  });

  it("sessionDetailsReadinessKey — a resolved-but-failed (null) entry counts as resolved", () => {
    const windows = [sessionWindow("s1")];
    const pending = new Map<string, unknown>();
    const resolvedNull = new Map<string, unknown>([[windowKey(windows[0]), null]]);

    expect(sessionDetailsReadinessKey(windows, pending)).not.toBe(sessionDetailsReadinessKey(windows, resolvedNull));
  });

  it("sessionDetailsReadinessKey — nothing selected — a stable key, unaffected by unrelated map entries", () => {
    const empty = new Map([["unrelated", {}]]);

    expect(sessionDetailsReadinessKey([], empty)).toBe(sessionDetailsReadinessKey([], new Map()));
  });
});

describe("nextWindows", () => {
  it("nextWindows — replace on an empty selection — result is just the clicked window", () => {
    const result = nextWindows([], sessionWindow("s1"), "replace");

    expect(result).toEqual([sessionWindow("s1")]);
  });

  it("nextWindows — replace with an existing selection — discards it entirely", () => {
    const current = [sessionWindow("s1"), lapWindow("s2", 3)];

    const result = nextWindows(current, sessionWindow("s3"), "replace");

    expect(result).toEqual([sessionWindow("s3")]);
  });

  it("nextWindows — add a new window — appends, preserving order", () => {
    const current = [sessionWindow("s1")];

    const result = nextWindows(current, lapWindow("s1", 2), "add");

    expect(result).toEqual([sessionWindow("s1"), lapWindow("s1", 2)]);
  });

  it("nextWindows — add the same session and span twice — duplicate is kept, not deduplicated", () => {
    const current = [lapWindow("s1", 2)];

    const result = nextWindows(current, lapWindow("s1", 2), "add");

    expect(result).toEqual([lapWindow("s1", 2), lapWindow("s1", 2)]);
  });

  it("nextWindows — toggle a window not in the selection — appends it", () => {
    const current = [sessionWindow("s1")];

    const result = nextWindows(current, lapWindow("s2", 1), "toggle");

    expect(result).toEqual([sessionWindow("s1"), lapWindow("s2", 1)]);
  });

  it("nextWindows — toggle a window already in the selection — removes it, empty list is legal", () => {
    const current = [sessionWindow("s1")];

    const result = nextWindows(current, sessionWindow("s1"), "toggle");

    expect(result).toEqual([]);
  });

  it("nextWindows — toggle removes every matching occurrence, not just the first", () => {
    const current = [lapWindow("s1", 2, "--chart-1"), lapWindow("s1", 2, "--chart-3"), sessionWindow("s2")];

    const result = nextWindows(current, lapWindow("s1", 2), "toggle");

    expect(result).toEqual([sessionWindow("s2")]);
  });
});

describe("assignColour", () => {
  it("assignColour — empty selection — first token", () => {
    expect(assignColour([])).toBe("--chart-1");
  });

  it("assignColour — three windows already selected — fourth token", () => {
    const current = [sessionWindow("s1"), sessionWindow("s2"), sessionWindow("s3")];

    expect(assignColour(current)).toBe("--chart-4");
  });

  it("assignColour — seven windows already selected — eighth token", () => {
    const current = Array.from({ length: 7 }, (_, i) => sessionWindow(`s${i}`));

    expect(assignColour(current)).toBe("--chart-8");
  });

  it("assignColour — eight windows already selected — cycles back to the first token", () => {
    const current = Array.from({ length: 8 }, (_, i) => sessionWindow(`s${i}`));

    expect(assignColour(current)).toBe("--chart-1");
  });

  it("assignColour — nine windows already selected — second token", () => {
    const current = Array.from({ length: 9 }, (_, i) => sessionWindow(`s${i}`));

    expect(assignColour(current)).toBe("--chart-2");
  });
});

describe("describeWindow", () => {
  it("describeWindow — session span — just the session name", () => {
    expect(describeWindow(sessionWindow("s1"), "Practice 1")).toBe("Practice 1");
  });

  it("describeWindow — lap span — session name and lap number", () => {
    expect(describeWindow(lapWindow("s1", 2), "Practice 1")).toBe("Practice 1 · Lap 2");
  });

  it("describeWindow — range span — session name and formatted offsets in seconds", () => {
    expect(describeWindow(rangeWindow("s1", 0, 1_500_000), "Practice 1")).toBe("Practice 1 · 0.000s–1.500s");
  });
});

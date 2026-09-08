import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../ipc/catalog";
import type { SelectionWindow } from "../state/selection";
import { collapsedChipLabel, removeWindowAt, selectionChips, sessionLabel, shouldCollapseChips } from "./topBarSelection";

function baseSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: "s1",
    blob_sha256: "0".repeat(64),
    source_format: "idl0",
    device_id: "dev1",
    config_checksum: "cfg1",
    importer_version: "0.1.0",
    seam_correction_version: "v1",
    engine_version: "0.1.0",
    timestamp_utc_ms: 1_725_000_000_000,
    created_at_ms: 1_725_000_000_000,
    rider: "Isaac",
    bike: "SV650",
    venue_name: "Portland",
    event_name: "",
    event_session: "",
    short_comment: "",
    tag: "",
    lap_count: 12,
    duration_ms: 3_723_000,
    ...overrides,
  };
}

describe("sessionLabel", () => {
  it("sessionLabel — venue and known timestamp — venue and date", () => {
    const label = sessionLabel(baseSummary({ venue_name: "Portland", timestamp_utc_ms: 1_725_000_000_000 }));

    expect(label).toMatch(/^Portland · \d{4}-\d{2}-\d{2}$/);
  });

  it("sessionLabel — empty venue — the shared \"(none)\" synthetic label", () => {
    const label = sessionLabel(baseSummary({ venue_name: "", timestamp_utc_ms: 1_725_000_000_000 }));

    expect(label).toMatch(/^\(none\) · \d{4}-\d{2}-\d{2}$/);
  });

  it("sessionLabel — timestamp_utc_ms is 0 — venue alone, no 1970 date (C1 §3.1)", () => {
    const label = sessionLabel(baseSummary({ venue_name: "Portland", timestamp_utc_ms: 0 }));

    expect(label).toBe("Portland");
  });
});

describe("selectionChips", () => {
  const nameFor = (id: string) => `session-${id}`;

  it("selectionChips — empty selection — no chips", () => {
    expect(selectionChips([], nameFor)).toEqual([]);
  });

  it("selectionChips — one session window — label from describeWindow, via sessionNameFor rather than the raw id", () => {
    const selection: SelectionWindow[] = [{ sessionId: "abc123", span: { kind: "session" }, colour: "--chart-1" }];

    const chips = selectionChips(selection, () => "Portland Raceway");

    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe("Portland Raceway");
    expect(chips[0].label).not.toContain("abc123");
    expect(chips[0].colour).toBe("--chart-1");
    expect(chips[0].index).toBe(0);
  });

  it("selectionChips — a lap window — label includes the lap number", () => {
    const selection: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "lap", lapNumber: 3 }, colour: "--chart-2" }];

    const chips = selectionChips(selection, nameFor);

    expect(chips[0].label).toBe("session-s1 · Lap 3");
  });

  it("selectionChips — two windows over the same session (R117 item 2) — two distinct chips, distinct keys", () => {
    const selection: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-2" },
    ];

    const chips = selectionChips(selection, nameFor);

    expect(chips).toHaveLength(2);
    expect(chips[0].key).not.toBe(chips[1].key);
  });

  it("selectionChips — preserves selection order", () => {
    const selection: SelectionWindow[] = [
      { sessionId: "b", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "a", span: { kind: "session" }, colour: "--chart-2" },
    ];

    const chips = selectionChips(selection, nameFor);

    expect(chips.map((c) => c.label)).toEqual(["session-b", "session-a"]);
  });
});

describe("shouldCollapseChips", () => {
  it("shouldCollapseChips — at the threshold — not collapsed", () => {
    expect(shouldCollapseChips(4)).toBe(false);
  });

  it("shouldCollapseChips — one past the threshold — collapsed", () => {
    expect(shouldCollapseChips(5)).toBe(true);
  });

  it("shouldCollapseChips — zero — not collapsed", () => {
    expect(shouldCollapseChips(0)).toBe(false);
  });
});

describe("collapsedChipLabel", () => {
  it("collapsedChipLabel — formats the count", () => {
    expect(collapsedChipLabel(7)).toBe("7 windows");
  });
});

describe("removeWindowAt", () => {
  it("removeWindowAt — removes exactly the window at the given index", () => {
    const windows: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "s2", span: { kind: "session" }, colour: "--chart-2" },
    ];

    const next = removeWindowAt(windows, 0);

    expect(next).toEqual([{ sessionId: "s2", span: { kind: "session" }, colour: "--chart-2" }]);
  });

  it("removeWindowAt — two windows sharing a windowKey (R117 item 2) — removes only the targeted one", () => {
    const windows: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-2" },
    ];

    const next = removeWindowAt(windows, 1);

    expect(next).toEqual([{ sessionId: "s1", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-1" }]);
  });

  it("removeWindowAt — index out of range — no change", () => {
    const windows: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }];

    expect(removeWindowAt(windows, 5)).toEqual(windows);
  });
});

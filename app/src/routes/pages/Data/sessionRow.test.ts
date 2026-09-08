import { describe, expect, it } from "vitest";

import type { SessionSummary } from "../../../ipc/catalog";
import type { SelectionWindow } from "../../../state/selection";
import { dropDeletedSessionWindows, groupKeyOf, modifierFromClick, sessionRowClicked, toSessionRow } from "./sessionRow";

/** A minimal, otherwise-valid `SessionSummary` — tests override only the
 *  fields they care about. */
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

describe("toSessionRow", () => {
  it("toSessionRow — summary with duration_ms and lap_count set — formats both", () => {
    const summary = baseSummary({ duration_ms: 3_723_000, lap_count: 12 });

    const row = toSessionRow(summary);

    expect(row.durationText).toBe("1:02:03");
    expect(row.lapCountText).toBe("12");
  });

  it("toSessionRow — duration_ms null — duration reads \"—\", never \"0:00\"", () => {
    const summary = baseSummary({ duration_ms: null });

    const row = toSessionRow(summary);

    expect(row.durationText).toBe("—");
  });

  it("toSessionRow — lap_count null — lap count reads \"—\" (laps not indexed yet, C3 §3.2)", () => {
    const summary = baseSummary({ lap_count: null });

    const row = toSessionRow(summary);

    expect(row.lapCountText).toBe("—");
  });

  it("toSessionRow — timestamp_utc_ms is 0 — date reads \"unknown\" (C1 §3.1: 0 = unknown, not 1970)", () => {
    const summary = baseSummary({ timestamp_utc_ms: 0 });

    const row = toSessionRow(summary);

    expect(row.dateText).toBe("unknown");
  });

  it("toSessionRow — venue_name empty — display venue is \"(none)\", matching the facet's synthetic entry", () => {
    const summary = baseSummary({ venue_name: "" });

    const row = toSessionRow(summary);

    expect(row.venueText).toBe("(none)");
  });
});

describe("groupKeyOf", () => {
  it("groupKeyOf — two sessions on the same local date and venue — same key", () => {
    const a = toSessionRow(baseSummary({ session_id: "a", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Portland" }));
    const b = toSessionRow(baseSummary({ session_id: "b", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Portland" }));

    expect(groupKeyOf(a)).toBe(groupKeyOf(b));
  });

  it("groupKeyOf — same date, different venue — different keys", () => {
    const a = toSessionRow(baseSummary({ session_id: "a", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Portland" }));
    const b = toSessionRow(baseSummary({ session_id: "b", timestamp_utc_ms: 1_725_000_000_000, venue_name: "Laguna Seca" }));

    expect(groupKeyOf(a)).not.toBe(groupKeyOf(b));
  });
});

describe("modifierFromClick", () => {
  it("modifierFromClick — shiftKey — add", () => {
    expect(modifierFromClick({ shiftKey: true, ctrlKey: false, metaKey: false })).toBe("add");
  });

  it("modifierFromClick — ctrlKey — toggle", () => {
    expect(modifierFromClick({ shiftKey: false, ctrlKey: true, metaKey: false })).toBe("toggle");
  });

  it("modifierFromClick — metaKey — toggle", () => {
    expect(modifierFromClick({ shiftKey: false, ctrlKey: false, metaKey: true })).toBe("toggle");
  });

  it("modifierFromClick — no modifier keys — replace", () => {
    expect(modifierFromClick({ shiftKey: false, ctrlKey: false, metaKey: false })).toBe("replace");
  });

  it("modifierFromClick — shiftKey wins over ctrlKey — add", () => {
    expect(modifierFromClick({ shiftKey: true, ctrlKey: true, metaKey: false })).toBe("add");
  });
});

describe("sessionRowClicked", () => {
  it("sessionRowClicked — plain click on an empty selection — selects the session alone", () => {
    const next = sessionRowClicked([], "s1", "replace");

    expect(next).toEqual([{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }]);
  });

  it("sessionRowClicked — replace with an existing selection — discards it", () => {
    const current: SelectionWindow[] = [{ sessionId: "s0", span: { kind: "session" }, colour: "--chart-1" }];

    const next = sessionRowClicked(current, "s1", "replace");

    expect(next).toEqual([{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }]);
  });

  it("sessionRowClicked — add — appends a new session window, colour cycles by position", () => {
    const current: SelectionWindow[] = [{ sessionId: "s0", span: { kind: "session" }, colour: "--chart-1" }];

    const next = sessionRowClicked(current, "s1", "add");

    expect(next).toEqual([
      { sessionId: "s0", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-2" },
    ]);
  });

  it("sessionRowClicked — toggle on an already-selected session — removes it", () => {
    const current: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-3" }];

    const next = sessionRowClicked(current, "s1", "toggle");

    expect(next).toEqual([]);
  });

  it("sessionRowClicked — a session already selected only via a lap window — session click adds a second, distinct window", () => {
    const current: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-1" }];

    const next = sessionRowClicked(current, "s1", "add");

    expect(next).toEqual([
      { sessionId: "s1", span: { kind: "lap", lapNumber: 2 }, colour: "--chart-1" },
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-2" },
    ]);
  });
});

describe("dropDeletedSessionWindows", () => {
  it("dropDeletedSessionWindows — every window's session still exists — nothing dropped", () => {
    const windows: SelectionWindow[] = [{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }];

    const result = dropDeletedSessionWindows(windows, new Set(["s1", "s2"]));

    expect(result).toEqual({ windows, droppedCount: 0 });
  });

  it("dropDeletedSessionWindows — a window's session no longer exists — dropped, others kept", () => {
    const windows: SelectionWindow[] = [
      { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" },
      { sessionId: "gone", span: { kind: "lap", lapNumber: 1 }, colour: "--chart-2" },
    ];

    const result = dropDeletedSessionWindows(windows, new Set(["s1"]));

    expect(result.windows).toEqual([{ sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" }]);
    expect(result.droppedCount).toBe(1);
  });

  it("dropDeletedSessionWindows — every window's session is gone — the empty list", () => {
    const windows: SelectionWindow[] = [{ sessionId: "gone", span: { kind: "session" }, colour: "--chart-1" }];

    const result = dropDeletedSessionWindows(windows, new Set());

    expect(result).toEqual({ windows: [], droppedCount: 1 });
  });
});

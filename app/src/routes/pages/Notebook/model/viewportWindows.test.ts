import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { SelectionWindow } from "../../../../state/selection";
import { cursorTimeInWindow, mapViewportToWindow, resolveWindowSpan, resolvedWindowKeysFor, toWireWindow, windowSpanFor } from "./viewportWindows";

function detailWithLaps(laps: Array<{ lap_number: number; start_time_secs: number; end_time_secs: number }>): SessionDetail {
  return {
    session_id: "s",
    device_id: null,
    timestamp_utc_ms: 0,
    config_checksum: null,
    source_format: "idl0",
    blob_sha256: "0".repeat(64),
    channels: [],
    rider: "",
    bike: "",
    bike_comment: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    long_comment: "",
    tag: "",
    bike_profile_snapshot: null,
    laps: laps.map((l) => ({ ...l, sectors: [], neutral_zone_visits: [], start_timestamp_ms: 0, end_timestamp_ms: 0, raw_elapsed_ms: 0, lap_time_ms: 0 })),
    track_visits: [],
    reference_lap_number: null,
    ignored_lap_numbers: [],
    main_lap_number: null,
    overlay_lap_key: null,
    starred_lap_number: null,
    track_visits_library_hash: null,
  };
}

describe("mapViewportToWindow", () => {
  it("mapViewportToWindow — window equals the primary window (single-window case) — the mapped span equals the viewport exactly", () => {
    const viewport = { startUs: 100_000, endUs: 900_000 };
    const primary = { startUs: 0, endUs: 10_000_000 };

    expect(mapViewportToWindow(viewport, 0, primary)).toEqual(viewport);
  });

  it("mapViewportToWindow — a later window, same-length viewport offset — re-based from the window's own start, not wall-clock", () => {
    // Primary starts at 10s; viewport is [15s, 25s) -- offset [5s, 15s) from
    // the primary's own start. A second window starting at 100s maps to
    // [105s, 115s), never [15s, 25s) (which would compare by wall-clock).
    const viewport = { startUs: 15_000_000, endUs: 25_000_000 };
    const primaryStartUs = 10_000_000;
    const window = { startUs: 100_000_000, endUs: 200_000_000 };

    expect(mapViewportToWindow(viewport, primaryStartUs, window)).toEqual({ startUs: 105_000_000, endUs: 115_000_000 });
  });

  it("mapViewportToWindow — window shorter than the mapped span — clamps the end to the window's own end (absence past it)", () => {
    const viewport = { startUs: 0, endUs: 100_000_000 };
    const window = { startUs: 0, endUs: 30_000_000 };

    expect(mapViewportToWindow(viewport, 0, window)).toEqual({ startUs: 0, endUs: 30_000_000 });
  });

  it("mapViewportToWindow — the mapped span starts at or past the window's own end — null (no data in view at all)", () => {
    const viewport = { startUs: 50_000_000, endUs: 100_000_000 };
    const window = { startUs: 0, endUs: 30_000_000 };

    expect(mapViewportToWindow(viewport, 0, window)).toBeNull();
  });

  it("mapViewportToWindow — a session-kind window whose recorded span exceeds the viewport — not clamped by its own end", () => {
    const viewport = { startUs: 0, endUs: 1_000_000_000 };
    const window = { startUs: 0, endUs: 2_000_000_000 };

    expect(mapViewportToWindow(viewport, 0, window)).toEqual({ startUs: 0, endUs: 1_000_000_000 });
  });
});

describe("resolveWindowSpan", () => {
  it("resolveWindowSpan — session span, recorded span resolved — [0, recordedSpanUs)", () => {
    expect(resolveWindowSpan({ kind: "session" }, detailWithLaps([]), 900_000_000)).toEqual({ startUs: 0, endUs: 900_000_000 });
  });

  it("resolveWindowSpan — session span — window end unresolved — excluded, not treated as whole session", () => {
    expect(resolveWindowSpan({ kind: "session" }, detailWithLaps([]), null)).toBeNull();
  });

  it("resolveWindowSpan — range span — the span's own t0_us/t1_us verbatim", () => {
    expect(resolveWindowSpan({ kind: "range", t0_us: 12_000, t1_us: 34_000 }, detailWithLaps([]), null)).toEqual({ startUs: 12_000, endUs: 34_000 });
  });

  it("resolveWindowSpan — lap span, lap found — the lap's start_time_secs/end_time_secs converted to µs", () => {
    const detail = detailWithLaps([{ lap_number: 2, start_time_secs: 30.5, end_time_secs: 61 }]);

    expect(resolveWindowSpan({ kind: "lap", lap_number: 2 }, detail, null)).toEqual({ startUs: 30_500_000, endUs: 61_000_000 });
  });

  it("resolveWindowSpan — lap span, no matching lap — null", () => {
    const detail = detailWithLaps([{ lap_number: 1, start_time_secs: 0, end_time_secs: 30 }]);

    expect(resolveWindowSpan({ kind: "lap", lap_number: 5 }, detail, null)).toBeNull();
  });
});

describe("cursorTimeInWindow", () => {
  it("cursorTimeInWindow — window starts at 0 (the ordinary primary-window case) — the identity transform", () => {
    const window = { startUs: 0, endUs: 1_000_000 };

    expect(cursorTimeInWindow(400_000, window)).toBe(400_000);
  });

  it("cursorTimeInWindow — window starts partway through the session — offset re-applied from window.startUs", () => {
    const window = { startUs: 120_000_000, endUs: 180_000_000 };

    expect(cursorTimeInWindow(5_000_000, window)).toBe(125_000_000);
  });

  it("cursorTimeInWindow — offset past a shorter window's end — null, decision 55's 'renders absence'", () => {
    const window = { startUs: 0, endUs: 1_000_000 };

    expect(cursorTimeInWindow(1_500_000, window)).toBeNull();
  });

  it("cursorTimeInWindow — offset exactly at the window's end (half-open) — null, the end is exclusive", () => {
    const window = { startUs: 0, endUs: 1_000_000 };

    expect(cursorTimeInWindow(1_000_000, window)).toBeNull();
  });

  it("cursorTimeInWindow — offset lands before window.startUs (a negative offset) — null, not this window's data", () => {
    const window = { startUs: 120_000_000, endUs: 180_000_000 };

    expect(cursorTimeInWindow(-5_000_000, window)).toBeNull();
  });

  it("cursorTimeInWindow — offset exactly at window.startUs — the window's own first instant, not null", () => {
    const window = { startUs: 120_000_000, endUs: 180_000_000 };

    expect(cursorTimeInWindow(0, window)).toBe(120_000_000);
  });
});

describe("toWireWindow", () => {
  it("toWireWindow — a session-kind window — session_id/colour carried, span narrowed to {kind: session}", () => {
    const w: SelectionWindow = { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" };

    expect(toWireWindow(w)).toEqual({ session_id: "s1", span: { kind: "session" }, colour: "--chart-1" });
  });

  it("toWireWindow — a range-kind window — t0Us/t1Us renamed to t0_us/t1_us", () => {
    const w: SelectionWindow = { sessionId: "s1", span: { kind: "range", t0Us: 1_000, t1Us: 2_000 }, colour: "--chart-2" };

    expect(toWireWindow(w)).toEqual({ session_id: "s1", span: { kind: "range", t0_us: 1_000, t1_us: 2_000 }, colour: "--chart-2" });
  });
});

describe("windowSpanFor", () => {
  it("windowSpanFor — a session-kind window whose SessionDetail has resolved but whose recorded span has not — null, not [0, 0)", () => {
    const w: SelectionWindow = { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" };
    const detailsByWindow = new Map([["s1::session", detailWithLaps([])]]);
    const spanUsByWindow = new Map<string, number | null>(); // no entry yet for "s1::session"

    expect(windowSpanFor(w, detailsByWindow, spanUsByWindow)).toBeNull();
  });

  it("windowSpanFor — a session-kind window whose recorded span has since resolved — [0, recordedSpanUs)", () => {
    const w: SelectionWindow = { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" };
    const detailsByWindow = new Map([["s1::session", detailWithLaps([])]]);
    const spanUsByWindow = new Map([["s1::session", 900_000_000]]);

    expect(windowSpanFor(w, detailsByWindow, spanUsByWindow)).toEqual({ startUs: 0, endUs: 900_000_000 });
  });

  it("windowSpanFor — no SessionDetail entry at all for this window's key — null", () => {
    const w: SelectionWindow = { sessionId: "s1", span: { kind: "session" }, colour: "--chart-1" };

    expect(windowSpanFor(w, new Map(), new Map())).toBeNull();
  });

  it("windowSpanFor — a lap primary window starting partway through the session — cursorTimeInWindow resolves against the lap's own start, not {0, sessionSpanUs} (regression: ChartCell used to assume the latter)", () => {
    // Lap 3 runs from 120s to 150s of a much longer session -- exactly the
    // shape `ChartCell.tsx`'s own `{startUs: 0, endUs: sessionSpanUs}`
    // shortcut got wrong: the whole *session* may be 900s long, but the
    // *primary window* (lap 3, once clicked) starts at 120_000_000 µs, not
    // 0. A hover offset of 5_000_000 µs (5 s into the lap) must resolve to
    // 125_000_000 µs -- the lap's own fifth second -- not 5_000_000 µs,
    // which under the old assumption would land in lap 1 or 2's data
    // instead, five *session* seconds in.
    const w: SelectionWindow = { sessionId: "s1", span: { kind: "lap", lapNumber: 3 }, colour: "--chart-1" };
    const detail = detailWithLaps([{ lap_number: 3, start_time_secs: 120, end_time_secs: 150 }]);
    const detailsByWindow = new Map([["s1::lap:3", detail]]);
    const spanUsByWindow = new Map<string, number | null>(); // lap span needs no recorded-session-span lookup

    const primaryWindowSpan = windowSpanFor(w, detailsByWindow, spanUsByWindow);
    expect(primaryWindowSpan).toEqual({ startUs: 120_000_000, endUs: 150_000_000 });

    const offsetUs = 5_000_000; // 5s into the lap, from cursorBus (offset from the primary window's own start)
    const resolvedTUs = cursorTimeInWindow(offsetUs, primaryWindowSpan!);
    expect(resolvedTUs).toBe(125_000_000);

    // The regression this guards: resolving the same offset against the old
    // `{startUs: 0, endUs: sessionSpanUs}` shortcut gives a different,
    // wrong instant -- proof the two are not interchangeable for a
    // non-`"session"`-kind primary window.
    const wrongAssumedSpan = { startUs: 0, endUs: 900_000_000 };
    const wrongResolvedTUs = cursorTimeInWindow(offsetUs, wrongAssumedSpan);
    expect(wrongResolvedTUs).toBe(5_000_000);
    expect(wrongResolvedTUs).not.toBe(resolvedTUs);
  });
});

describe("resolvedWindowKeysFor", () => {
  it("resolvedWindowKeysFor — R138's own regression: a non-primary session-kind window whose detail resolved before its span — excluded", () => {
    const primary: SelectionWindow = { sessionId: "primary", span: { kind: "session" }, colour: "--chart-1" };
    const sibling: SelectionWindow = { sessionId: "sibling", span: { kind: "session" }, colour: "--chart-2" };
    const detailsByWindow = new Map([
      ["primary::session", detailWithLaps([])],
      ["sibling::session", detailWithLaps([])], // detail resolved...
    ]);
    const spanUsByWindow = new Map([["primary::session", 1_000_000]]); // ...but sibling's span has not

    const resolved = resolvedWindowKeysFor([primary, sibling], detailsByWindow, spanUsByWindow);

    expect(resolved.has("primary::session")).toBe(true);
    expect(resolved.has("sibling::session")).toBe(false);
  });

  it("resolvedWindowKeysFor — the sibling's span later resolves too — now included", () => {
    const primary: SelectionWindow = { sessionId: "primary", span: { kind: "session" }, colour: "--chart-1" };
    const sibling: SelectionWindow = { sessionId: "sibling", span: { kind: "session" }, colour: "--chart-2" };
    const detailsByWindow = new Map([
      ["primary::session", detailWithLaps([])],
      ["sibling::session", detailWithLaps([])],
    ]);
    const spanUsByWindow = new Map([
      ["primary::session", 1_000_000],
      ["sibling::session", 2_000_000],
    ]);

    const resolved = resolvedWindowKeysFor([primary, sibling], detailsByWindow, spanUsByWindow);

    expect(resolved.has("primary::session")).toBe(true);
    expect(resolved.has("sibling::session")).toBe(true);
  });

  it("resolvedWindowKeysFor — the primary window itself unresolved — every window excluded, mirroring bindWindowsFor's own return []", () => {
    const primary: SelectionWindow = { sessionId: "primary", span: { kind: "session" }, colour: "--chart-1" };
    const sibling: SelectionWindow = { sessionId: "sibling", span: { kind: "session" }, colour: "--chart-2" };
    const detailsByWindow = new Map([["sibling::session", detailWithLaps([])]]); // primary's detail hasn't resolved
    const spanUsByWindow = new Map([["sibling::session", 2_000_000]]);

    const resolved = resolvedWindowKeysFor([primary, sibling], detailsByWindow, spanUsByWindow);

    expect(resolved.size).toBe(0);
  });
});

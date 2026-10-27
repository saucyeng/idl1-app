import { describe, expect, it } from "vitest";

import type { PeerLibrary, PeerLibrarySession, PeerLibraryWorkbook } from "../../../ipc/sync";
import {
  buildPullSelection,
  emptyFilters,
  emptySelection,
  filterOptions,
  formatSyncBytes,
  hereLabel,
  isSelectable,
  selectAllVisible,
  selectionBytes,
  selectionCount,
  toggleSelected,
  pruneSelection,
  viewSessions,
  viewWorkbooks,
} from "./peerLibraryView";

const MB = 1024 * 1024;

function session(id: string, overrides: Partial<PeerLibrarySession> = {}): PeerLibrarySession {
  return {
    session_id: id,
    timestamp_utc_ms: Date.UTC(2026, 9, 10, 12, 0, 0),
    duration_ms: 600_000,
    venue_name: "Hafjell",
    event_name: null,
    rider: "Isaac",
    bike: null,
    tag: null,
    source_format: "idl1",
    lap_count: null,
    size_bytes: MB,
    here: "absent",
    ...overrides,
  };
}

function workbook(id: string, overrides: Partial<PeerLibraryWorkbook> = {}): PeerLibraryWorkbook {
  return { workbook_id: id, file_name: `${id}.idlwb`, size_bytes: MB, updated_at_ms: 0, here: "absent", ...overrides };
}

function library(sessions: PeerLibrarySession[], workbooks: PeerLibraryWorkbook[] = []): PeerLibrary {
  return { schema_version: 1, sessions, workbooks };
}

describe("formatSyncBytes", () => {
  it("formatSyncBytes — under 1 GB — prints MB", () => {
    const text = formatSyncBytes(512 * MB);

    expect(text).toBe("512 MB");
  });

  it("formatSyncBytes — 1 GB or more — prints GB with one decimal", () => {
    const text = formatSyncBytes(1.5 * 1024 * MB);

    expect(text).toBe("1.5 GB");
  });

  it("formatSyncBytes — tiny non-zero size — never prints 0 MB", () => {
    const text = formatSyncBytes(1000);

    expect(text).toBe("<0.1 MB");
  });

  it("formatSyncBytes — a few MB — keeps one decimal, dropping a trailing .0", () => {
    const text = [formatSyncBytes(2.5 * MB), formatSyncBytes(2 * MB), formatSyncBytes(0.5 * MB)];

    expect(text).toEqual(["2.5 MB", "2 MB", "0.5 MB"]);
  });

  it("formatSyncBytes — zero — prints 0 MB", () => {
    const text = formatSyncBytes(0);

    expect(text).toBe("0 MB");
  });
});

describe("hereLabel / isSelectable", () => {
  it("hereLabel — each state — reads as the design names it", () => {
    const labels = [hereLabel("same"), hereLabel("absent"), hereLabel("differs")];

    expect(labels).toEqual(["✓ here", "not here", "≠ differs"]);
  });

  it("isSelectable — same — is false; absent and differs are true", () => {
    const flags = [isSelectable("same"), isSelectable("absent"), isSelectable("differs")];

    expect(flags).toEqual([false, true, true]);
  });
});

describe("viewSessions", () => {
  it("viewSessions — mixed dates — sorts newest first", () => {
    const lib = library([
      session("old", { timestamp_utc_ms: Date.UTC(2026, 0, 1, 12) }),
      session("new", { timestamp_utc_ms: Date.UTC(2026, 5, 1, 12) }),
    ]);

    const rows = viewSessions(lib, emptyFilters);

    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("viewSessions — venue and rider filters — keep only exact matches", () => {
    const lib = library([
      session("a", { venue_name: "Hafjell", rider: "Isaac" }),
      session("b", { venue_name: "Hafjell", rider: "Sam" }),
      session("c", { venue_name: "Lillehammer", rider: "Isaac" }),
    ]);

    const rows = viewSessions(lib, { ...emptyFilters, venue: "Hafjell", rider: "Isaac" });

    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("viewSessions — date range — is inclusive of both local days", () => {
    const lib = library([
      session("a", { timestamp_utc_ms: new Date(2026, 9, 9, 12).getTime() }),
      session("b", { timestamp_utc_ms: new Date(2026, 9, 10, 8).getTime() }),
      session("c", { timestamp_utc_ms: new Date(2026, 9, 11, 20).getTime() }),
      session("d", { timestamp_utc_ms: new Date(2026, 9, 12, 12).getTime() }),
    ]);

    const rows = viewSessions(lib, { ...emptyFilters, from: "2026-10-10", to: "2026-10-11" });

    expect(rows.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });

  it("viewSessions — text search — matches venue, rider, event, bike and tag case-insensitively", () => {
    const lib = library([
      session("a", { venue_name: "Hafjell" }),
      session("b", { event_name: "Hafjell Cup", venue_name: null }),
      session("c", { venue_name: "Other", rider: "Sam" }),
    ]);

    const rows = viewSessions(lib, { ...emptyFilters, search: "  hafj " });

    expect(rows.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("viewSessions — row model — carries display text and selectability", () => {
    const lib = library([session("a", { here: "same", duration_ms: null, size_bytes: 3 * MB, venue_name: null, rider: null })]);

    const [row] = viewSessions(lib, emptyFilters);

    expect(row).toMatchObject({
      id: "a",
      venueText: "—",
      riderText: "—",
      durationText: "—",
      sizeText: "3 MB",
      hereText: "✓ here",
      selectable: false,
    });
  });
});

describe("viewWorkbooks", () => {
  it("viewWorkbooks — search — matches the file name", () => {
    const lib = library([], [workbook("a", { file_name: "Suspension.idlwb" }), workbook("b", { file_name: "Brakes.idlwb" })]);

    const rows = viewWorkbooks(lib, { ...emptyFilters, search: "susp" });

    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });

  it("viewWorkbooks — session-only filters — do not hide workbooks", () => {
    const lib = library([], [workbook("a")]);

    const rows = viewWorkbooks(lib, { ...emptyFilters, venue: "Hafjell", rider: "Isaac", from: "2030-01-01" });

    expect(rows).toHaveLength(1);
  });
});

describe("filterOptions", () => {
  it("filterOptions — repeated and null values — returns sorted distinct venues and riders", () => {
    const lib = library([
      session("a", { venue_name: "Zed", rider: "Isaac" }),
      session("b", { venue_name: "Alp", rider: null }),
      session("c", { venue_name: "Zed", rider: "Sam" }),
    ]);

    const options = filterOptions(lib);

    expect(options).toEqual({ venues: ["Alp", "Zed"], riders: ["Isaac", "Sam"] });
  });
});

describe("selection", () => {
  it("toggleSelected — a same row — is ignored", () => {
    const lib = library([session("a", { here: "same" })]);

    const next = toggleSelected(lib, emptySelection, "session", "a");

    expect(selectionCount(next)).toBe(0);
  });

  it("toggleSelected — twice — selects then clears", () => {
    const lib = library([session("a")]);

    const once = toggleSelected(lib, emptySelection, "session", "a");
    const twice = toggleSelected(lib, once, "session", "a");

    expect([selectionCount(once), selectionCount(twice)]).toEqual([1, 0]);
  });

  it("selectAllVisible — filtered view — selects only the visible selectable rows", () => {
    const lib = library(
      [session("a"), session("b", { here: "same" }), session("c", { venue_name: "Other" })],
      [workbook("w1"), workbook("w2", { here: "same" })],
    );

    const next = selectAllVisible(lib, emptySelection, { ...emptyFilters, venue: "Hafjell" });

    expect([...next.sessions]).toEqual(["a"]);
    expect([...next.workbooks]).toEqual(["w1"]);
  });

  it("selectionBytes — a selected row that became same — is skipped", () => {
    const lib = library([session("a", { size_bytes: 2 * MB }), session("b", { size_bytes: 5 * MB, here: "same" })]);
    const selection = { sessions: new Set(["a", "b"]), workbooks: new Set<string>() };

    const bytes = selectionBytes(lib, selection);

    expect(bytes).toBe(2 * MB);
  });

  it("selectionBytes — sessions and workbooks — are summed", () => {
    const lib = library([session("a", { size_bytes: 2 * MB })], [workbook("w", { size_bytes: MB })]);
    const selection = { sessions: new Set(["a"]), workbooks: new Set(["w"]) };

    const bytes = selectionBytes(lib, selection);

    expect(bytes).toBe(3 * MB);
  });

  it("pruneSelection — after a refresh — drops ids that vanished or became same", () => {
    const lib = library([session("a", { here: "same" }), session("b")]);
    const selection = { sessions: new Set(["a", "b", "gone"]), workbooks: new Set(["gone"]) };

    const next = pruneSelection(lib, selection);

    expect([...next.sessions]).toEqual(["b"]);
    expect(next.workbooks.size).toBe(0);
  });
});

describe("buildPullSelection", () => {
  it("buildPullSelection — mixed selection — lists ids explicitly, skipping same rows", () => {
    const lib = library([session("a"), session("b", { here: "same" })], [workbook("w")]);
    const selection = { sessions: new Set(["a", "b"]), workbooks: new Set(["w"]) };

    const built = buildPullSelection(lib, selection);

    expect(built).toEqual({ direction: "pull", sessions: ["a"], workbooks: ["w"] });
  });

  it("buildPullSelection — only workbooks — sends an empty sessions list, not an omitted one", () => {
    const lib = library([session("a")], [workbook("w")]);
    const selection = { sessions: new Set<string>(), workbooks: new Set(["w"]) };

    const built = buildPullSelection(lib, selection);

    expect(built.sessions).toEqual([]);
  });
});

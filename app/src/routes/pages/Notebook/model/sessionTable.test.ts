import { describe, expect, it } from "vitest";

import type { SessionSetResult } from "../../../../ipc/sessionSet";
import { declaresSessionSet, sessionTableView, statusChip } from "./sessionTable";

function result(): SessionSetResult {
  return {
    set_key: "k",
    groups: [{ name: "Day 1" }, { name: "Day 2" }],
    members: [
      { session_id: "s1", label: "D1 S1", group: 0, start_utc_ms: null, status: "computed" },
      { session_id: "s2", label: "D1 S2", group: 0, start_utc_ms: null, status: "missing" },
      { session_id: "s3", label: "D2 S1", group: 1, start_utc_ms: null, status: "cached" },
    ],
    tables: [
      {
        cell_id: "t1",
        model: { columns: [{ id: "c0", name: "Best", template: "[best]" }], rows: [], rowSource: "sessions" },
        results: [[{ value: 119.506, error: null }], [{ value: null, error: "D1 S2 is not on this device" }], [{ value: 164.69, error: null }]],
        row_members: [0, 1, 2],
      },
    ],
    warnings: [
      { cell_id: "t1", missing: ["s2"], message: "Column totals leave out D1 S2" },
      { cell_id: "other", missing: ["s2"], message: "not this table" },
      { cell_id: null, missing: ["s2"], message: "1 of 3 sessions are not on this device" },
    ],
    cancelled: false,
  };
}

describe("sessionTableView", () => {
  it("session table — two groups — one header per group, rows in set order", () => {
    // Act
    const view = sessionTableView(result(), "t1");

    // Assert
    expect(view?.groups.map((g) => [g.name, g.rows.map((r) => r.label)])).toEqual([
      ["Day 1", ["D1 S1", "D1 S2"]],
      ["Day 2", ["D2 S1"]],
    ]);
  });

  it("session table — a missing member — its cell is an error and its row carries the chip", () => {
    // Act
    const row = sessionTableView(result(), "t1")?.groups[0].rows[1];

    // Assert
    expect(row?.chip).toBe("not on this device");
    expect(row?.cells[0].status).toBe("error");
  });

  it("session table — warnings — this table's then the set's, never another table's, missing ids once", () => {
    // Act
    const view = sessionTableView(result(), "t1");

    // Assert
    expect(view?.warnings.map((w) => w.cell_id)).toEqual(["t1", null]);
    expect(view?.missing).toEqual(["s2"]);
  });

  it("session table — a cell id the result does not have — null", () => {
    // Act + Assert
    expect(sessionTableView(result(), "nope")).toBeNull();
  });

  it("session table — values — formatted as the lap table formats them", () => {
    // Act
    const cell = sessionTableView(result(), "t1")?.groups[0].rows[0].cells[0];

    // Assert
    expect(cell?.text).toBe("119.506");
  });
});

describe("statusChip", () => {
  it("status chip — computed — no chip; cached — says so", () => {
    // Act + Assert
    expect(statusChip("computed")).toBeNull();
    expect(statusChip("cached")).toBe("cached");
  });
});

describe("declaresSessionSet", () => {
  it("front matter — a top-level sessions key — true; absent, or only in the body — false", () => {
    // Act + Assert
    expect(declaresSessionSet("---\nid: x\nsessions:\n  - { id: a }\n---\nbody\n")).toBe(true);
    expect(declaresSessionSet("---\nid: x\n---\nsessions: here\n")).toBe(false);
    expect(declaresSessionSet("no front matter\n")).toBe(false);
  });
});

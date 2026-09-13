import { describe, expect, it } from "vitest";

import {
  columnUnit,
  formatCellValue,
  isTableCellValue,
  mainRowIndex,
  tableHeaders,
  tableView,
  type TableCellResult,
  type TableCellValue,
  type TableModel,
} from "./lapTable";

/** A three-lap derived table: lap number, lap time, a fork aggregate. */
function lapTableModel(overrides: Partial<TableModel> = {}): TableModel {
  return {
    columns: [
      { id: "c0", name: "Lap time", template: "lap_time()" },
      { id: "c1", name: "Sector 1", template: "sector_time(0)" },
      { id: "c2", name: "Fork max", template: "max([Fork travel])" },
    ],
    rows: [
      { id: "s1#1", context: { sessionId: "s1", lapNumber: 1 } },
      { id: "s1#2", context: { sessionId: "s1", lapNumber: 2 } },
      { id: "s1#3", context: { sessionId: "s1", lapNumber: 3 } },
    ],
    cells: [],
    rowSource: "windowLaps",
    mainRowId: "fastest",
    ...overrides,
  };
}

function results(lapTimes: (number | null)[]): TableCellResult[][] {
  return lapTimes.map((lapTime) => [
    { value: lapTime, error: null },
    { value: 31.5, error: null },
    { value: 118, error: null },
  ]);
}

describe("columnUnit", () => {
  it("column unit — a lap_time() template — is seconds", () => {
    expect(columnUnit("lap_time()")).toBe("s");
  });

  it("column unit — a sector_time(i) template — is seconds", () => {
    expect(columnUnit(" sector_time(2) ")).toBe("s");
  });

  it("column unit — any other expression — is unstated rather than guessed", () => {
    expect(columnUnit("max([Fork travel])")).toBeNull();
    expect(columnUnit("lap_number()")).toBeNull();
    expect(columnUnit(null)).toBeNull();
  });
});

describe("tableHeaders", () => {
  it("headers — named columns — carry the name and the derived unit", () => {
    const headers = tableHeaders(lapTableModel());

    expect(headers).toEqual([
      { key: "c0", label: "Lap time", unit: "s" },
      { key: "c1", label: "Sector 1", unit: "s" },
      { key: "c2", label: "Fork max", unit: null },
    ]);
  });

  it("headers — a nameless column — falls back to its id", () => {
    const headers = tableHeaders({ columns: [{ id: "c0" }], rows: [], cells: [] });

    expect(headers[0].label).toBe("c0");
  });
});

describe("mainRowIndex", () => {
  it("main row — mainRowId \"fastest\" over derived rows — is the smallest lap time", () => {
    const index = mainRowIndex(lapTableModel(), results([92.4, 91.8, 93.1]));

    expect(index).toBe(1);
  });

  it("main row — a tie on lap time — resolves to the lowest row index", () => {
    const index = mainRowIndex(lapTableModel(), results([91.8, 91.8, 93.1]));

    expect(index).toBe(0);
  });

  it("main row — a lap with no recorded time — is skipped rather than compared", () => {
    const grid = results([NaN, 93.1, 92.4]);

    expect(mainRowIndex(lapTableModel(), grid)).toBe(2);
  });

  it("main row — an errored lap-time cell — is skipped too", () => {
    const grid = results([92.4, 91.8, 93.1]);
    grid[1][0] = { value: null, error: "no samples in this lap" };

    expect(mainRowIndex(lapTableModel(), grid)).toBe(0);
  });

  it("main row — \"fastest\" under rowSource authored — is not resolved here (the engine reports it)", () => {
    const model = lapTableModel({ rowSource: "authored" });

    expect(mainRowIndex(model, results([92.4, 91.8, 93.1]))).toBeNull();
  });

  it("main row — a named authored row — is the row with that id", () => {
    const model = lapTableModel({ rowSource: "authored", mainRowId: "s1#3" });

    expect(mainRowIndex(model, results([92.4, 91.8, 93.1]))).toBe(2);
  });

  it("main row — no mainRowId — is none", () => {
    const model = lapTableModel({ mainRowId: null });

    expect(mainRowIndex(model, results([92.4, 91.8, 93.1]))).toBeNull();
  });
});

describe("formatCellValue", () => {
  it("format — a fractional value — reads to the millisecond", () => {
    expect(formatCellValue(91.7834)).toBe("91.783");
  });

  it("format — a whole number — prints whole", () => {
    expect(formatCellValue(3)).toBe("3");
  });

  it("format — a lap with no data — prints an absence, never NaN", () => {
    expect(formatCellValue(NaN)).toBe("—");
    expect(formatCellValue(null)).toBe("—");
  });
});

describe("tableView", () => {
  const value: TableCellValue = { model: lapTableModel(), results: results([92.4, 91.8, 93.1]) };

  it("view — a derived lap table — labels each row by its lap and marks the fastest Main", () => {
    const view = tableView(value);

    expect(view.derived).toBe(true);
    expect(view.rows.map((r) => r.label)).toEqual(["Lap 1", "Lap 2", "Lap 3"]);
    expect(view.rows.map((r) => r.isMain)).toEqual([false, true, false]);
  });

  it("view — an errored cell — is an error cell and every sibling still renders", () => {
    const grid = results([92.4, 91.8, 93.1]);
    grid[0][2] = { value: null, error: "unknown channel Fork travel" };

    const view = tableView({ model: lapTableModel(), results: grid });

    expect(view.rows[0].cells[2]).toEqual({ key: "c2", text: "unknown channel Fork travel", status: "error", error: "unknown channel Fork travel" });
    expect(view.rows[0].cells[0].status).toBe("settled");
    expect(view.rows[1].cells[2].text).toBe("118");
  });

  it("view — a grid shorter than the model's rows — draws the missing cells as absences", () => {
    const view = tableView({ model: lapTableModel(), results: [] });

    expect(view.rows).toHaveLength(3);
    expect(view.rows[0].cells.map((c) => c.text)).toEqual(["—", "—", "—"]);
  });

  it("view — an authored table with no row context — labels rows by id", () => {
    const model = lapTableModel({ rowSource: "authored", mainRowId: null, rows: [{ id: "r0" }] });

    const view = tableView({ model, results: [[{ value: 1, error: null }]] });

    expect(view.derived).toBe(false);
    expect(view.rows[0].label).toBe("r0");
  });
});

describe("isTableCellValue", () => {
  it("narrowing — a results grid with no model — is refused rather than drawn headerless", () => {
    expect(isTableCellValue({ results: [] })).toBe(false);
  });

  it("narrowing — a full table value — is accepted", () => {
    expect(isTableCellValue({ model: lapTableModel(), results: [] })).toBe(true);
  });
});

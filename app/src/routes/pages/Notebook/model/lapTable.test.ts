import { describe, expect, it } from "vitest";

import {
  columnUnit,
  formatCellValue,
  isTableCellValue,
  mainRowIndex,
  tableHeaders,
  tableView,
  type LapTimeLookup,
  type TableCellResult,
  type TableCellValue,
  type TableModel,
} from "./lapTable";

/** The recorded lap times of laps 1-3, seconds — the engine's own source for
 *  the reserved `"fastest"` (`RowBinding.lap_time_secs`), independent of
 *  whether the table happens to carry a `lap_time()` column. */
function recordedLaps(secondsByLap: Record<number, number>): LapTimeLookup {
  return (context) => secondsByLap[context.lapNumber] ?? null;
}

const FAST_LAP_2 = recordedLaps({ 1: 92.4, 2: 91.8, 3: 93.1 });

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
  it("main row — mainRowId \"fastest\" over derived rows — is the smallest recorded lap time", () => {
    const index = mainRowIndex(lapTableModel(), FAST_LAP_2);

    expect(index).toBe(1);
  });

  it("main row — a table with no lap_time() column — still highlights the row the engine used", () => {
    // `resolve_baseline_row` reads each row's recorded lap time, never a
    // column, so a derived table showing only fork travel has a Main row
    // all the same — and every `main({col[]})` in it already used that row.
    const model = lapTableModel({ columns: [{ id: "c2", name: "Fork max", template: "max([Fork travel])" }] });

    expect(mainRowIndex(model, FAST_LAP_2)).toBe(1);
  });

  it("main row — a tie on lap time — resolves to the lowest row index", () => {
    const index = mainRowIndex(lapTableModel(), recordedLaps({ 1: 91.8, 2: 91.8, 3: 93.1 }));

    expect(index).toBe(0);
  });

  it("main row — a lap with no recorded time — is skipped rather than compared", () => {
    const index = mainRowIndex(lapTableModel(), recordedLaps({ 1: NaN, 2: 93.1, 3: 92.4 }));

    expect(index).toBe(2);
  });

  it("main row — no session detail resolved yet — highlights nothing rather than the wrong row", () => {
    expect(mainRowIndex(lapTableModel(), () => null)).toBeNull();
  });

  it("main row — \"fastest\" under rowSource authored — is not resolved here (the engine reports it)", () => {
    const model = lapTableModel({ rowSource: "authored" });

    expect(mainRowIndex(model, FAST_LAP_2)).toBeNull();
  });

  it("main row — a named authored row — is the row with that id", () => {
    const model = lapTableModel({ rowSource: "authored", mainRowId: "s1#3" });

    expect(mainRowIndex(model, FAST_LAP_2)).toBe(2);
  });

  it("main row — no mainRowId — is none", () => {
    const model = lapTableModel({ mainRowId: null });

    expect(mainRowIndex(model, FAST_LAP_2)).toBeNull();
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
    const view = tableView(value, FAST_LAP_2);

    expect(view.derived).toBe(true);
    expect(view.rows.map((r) => r.label)).toEqual(["Lap 1", "Lap 2", "Lap 3"]);
    expect(view.rows.map((r) => r.isMain)).toEqual([false, true, false]);
  });

  it("view — an errored cell — is an error cell and every sibling still renders", () => {
    const grid = results([92.4, 91.8, 93.1]);
    grid[0][2] = { value: null, error: "unknown channel Fork travel" };

    const view = tableView({ model: lapTableModel(), results: grid }, FAST_LAP_2);

    expect(view.rows[0].cells[2]).toEqual({ key: "c2", text: "unknown channel Fork travel", status: "error", error: "unknown channel Fork travel" });
    expect(view.rows[0].cells[0].status).toBe("settled");
    expect(view.rows[1].cells[2].text).toBe("118");
  });

  it("view — a grid shorter than the model's rows — draws the missing cells as absences", () => {
    const view = tableView({ model: lapTableModel(), results: [] }, FAST_LAP_2);

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

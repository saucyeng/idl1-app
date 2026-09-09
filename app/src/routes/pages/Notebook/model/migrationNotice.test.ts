import { describe, expect, it } from "vitest";

import { summarizeMigrations } from "./migrationNotice";
import type { RenamedFunction } from "../../../../ipc/workbook";

describe("summarizeMigrations", () => {
  it("summarizeMigrations — no migrations — returns null", () => {
    // Arrange
    const migrations: RenamedFunction[] = [];

    // Act
    const result = summarizeMigrations(migrations);

    // Assert
    expect(result).toBeNull();
  });

  it("summarizeMigrations — one rename at one call site — reports one site and one pair", () => {
    // Arrange
    const migrations: RenamedFunction[] = [{ cell_id: "aaaaaaaa", line: 3, old: "variance_time", new: "lap_delta_time" }];

    // Act
    const result = summarizeMigrations(migrations);

    // Assert
    expect(result).toEqual({ siteCount: 1, renames: [{ old: "variance_time", new: "lap_delta_time" }] });
  });

  it("summarizeMigrations — the same rename at three call sites — reports three sites but one deduplicated pair", () => {
    // Arrange
    const migrations: RenamedFunction[] = [
      { cell_id: "aaaaaaaa", line: 1, old: "variance_time", new: "lap_delta_time" },
      { cell_id: "aaaaaaaa", line: 5, old: "variance_time", new: "lap_delta_time" },
      { cell_id: "bbbbbbbb", line: 0, old: "variance_time", new: "lap_delta_time" },
    ];

    // Act
    const result = summarizeMigrations(migrations);

    // Assert
    expect(result).toEqual({ siteCount: 3, renames: [{ old: "variance_time", new: "lap_delta_time" }] });
  });

  it("summarizeMigrations — two distinct renames — reports both pairs in first-seen order", () => {
    // Arrange
    const migrations: RenamedFunction[] = [
      { cell_id: "aaaaaaaa", line: 0, old: "angle", new: "angle_between" },
      { cell_id: "aaaaaaaa", line: 1, old: "variance_time", new: "lap_delta_time" },
      { cell_id: "aaaaaaaa", line: 2, old: "angle", new: "angle_between" },
    ];

    // Act
    const result = summarizeMigrations(migrations);

    // Assert
    expect(result).toEqual({
      siteCount: 3,
      renames: [
        { old: "angle", new: "angle_between" },
        { old: "variance_time", new: "lap_delta_time" },
      ],
    });
  });
});

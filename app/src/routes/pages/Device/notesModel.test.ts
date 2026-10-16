import { describe, expect, it } from "vitest";

import type { BikeLogView, EntryVersion } from "../../../ipc/bikelog";
import { deleteNote, deviceName, editNote, formatWhen, headIds, newId, newNote, noteRows } from "./notesModel";

const zero = () => 0;

describe("newId", () => {
  it("newId — later time — sorts after, and uses only letters and digits", () => {
    // Arrange
    const a = newId(1_000, zero);
    const b = newId(2_000_000_000_000, zero);

    // Act
    const sorted = [b, a].sort();

    // Assert
    expect(sorted).toEqual([a, b]);
    expect(b).toMatch(/^[0-9a-z]{15}$/);
  });
});

describe("deviceName", () => {
  it("deviceName — Android or not — phone or desktop", () => {
    // Arrange
    const android = "Mozilla/5.0 (Linux; Android 14)";

    // Act
    const names = [deviceName(android), deviceName("Mozilla/5.0 (Windows NT 10.0)")];

    // Assert
    expect(names).toEqual(["phone", "desktop"]);
  });
});

describe("note versions", () => {
  it("editNote — two heads in conflict — the new version names both, keeping the noted time", () => {
    // Arrange
    const note = newNote("gt", " fork service ", 100, "phone", zero);
    const v1 = note.versions[0];
    const p: EntryVersion = { ...v1, version_id: "p", parents: [v1.version_id], text: "phone" };
    const d: EntryVersion = { ...v1, version_id: "d", parents: [v1.version_id], text: "desk" };
    const conflicted = { ...note, versions: [v1, p, d] };

    // Act
    const edit = editNote(conflicted, d, "phone and desk", 500, "desktop", zero);

    // Assert
    expect(note.versions[0].text).toBe("fork service");
    expect(headIds(conflicted)).toEqual(["p", "d"]);
    expect(edit.versions).toHaveLength(1);
    expect(edit.versions[0].parents).toEqual(["p", "d"]);
    expect(edit.versions[0].at_ms).toBe(100);
    expect(edit.versions[0].updated_at_ms).toBe(500);
  });

  it("deleteNote — a note — one version marked deleted, parented on the head", () => {
    // Arrange
    const note = newNote("gt", "x", 100, "phone", zero);

    // Act
    const del = deleteNote(note, note.versions[0], 200, "phone", zero);

    // Assert
    expect(del.versions[0].deleted).toBe(true);
    expect(del.versions[0].parents).toEqual([note.versions[0].version_id]);
  });
});

describe("noteRows", () => {
  it("noteRows — live, deleted and conflicted entries — newest first, deleted left out, choices for conflicts", () => {
    // Arrange
    const v = (id: string, at: number, text: string): EntryVersion => ({
      version_id: id, parents: [], at_ms: at, updated_at_ms: at, device: "", text, changes: {}, sheet: {}, deleted: false,
    });
    const view: BikeLogView = {
      entries: [
        { entry: { entry_id: "a", bike_id: "gt", kind: "note", versions: [] }, current: v("a1", 100, "old"), in_conflict: false, heads: [], deleted: false },
        { entry: { entry_id: "b", bike_id: "gt", kind: "sheet", versions: [] }, current: v("b1", 300, ""), in_conflict: false, heads: [], deleted: false },
        { entry: { entry_id: "c", bike_id: "gt", kind: "note", versions: [] }, current: v("c1", 200, "gone"), in_conflict: false, heads: [], deleted: true },
        { entry: { entry_id: "d", bike_id: "gt", kind: "note", versions: [] }, current: v("d2", 250, "two"), in_conflict: true, heads: [v("d2", 250, "two"), v("d1", 250, "one")], deleted: false },
      ],
      running_sheet: { baseline: null, values: {}, since: [] },
      skipped: [],
    };

    // Act
    const rows = noteRows(view);

    // Assert
    expect(rows.map((r) => r.entryId)).toEqual(["b", "d", "a"]);
    expect(rows[1].choices).toEqual(["two", "one"]);
  });
});

describe("formatWhen", () => {
  it("formatWhen — same day, previous day, older — Today, Yesterday, or weekday and date", () => {
    // Arrange
    const now = new Date(2026, 9, 16, 15, 0).getTime();

    // Act
    const today = formatWhen(new Date(2026, 9, 16, 9, 5).getTime(), now);
    const yesterday = formatWhen(new Date(2026, 9, 15, 23, 59).getTime(), now);
    const older = formatWhen(new Date(2026, 9, 12, 14, 5).getTime(), now);

    // Assert
    expect(today).toBe("Today 09:05");
    expect(yesterday).toBe("Yesterday 23:59");
    expect(older).toBe("Mon 12 Oct 14:05");
  });
});

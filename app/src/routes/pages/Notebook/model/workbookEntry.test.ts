import { describe, expect, it } from "vitest";

import { chooseWorkbookEntry, type WorkbookChoice } from "./workbookEntry";

function choice(workbookId: string, name = workbookId): WorkbookChoice {
  return { workbook_id: workbookId, name, file_name: `${name}.idl1wb` };
}

describe("chooseWorkbookEntry", () => {
  it("chooseWorkbookEntry — no workbooks — empty", () => {
    const entry = chooseWorkbookEntry([], null);

    expect(entry).toEqual({ kind: "empty" });
  });

  it("chooseWorkbookEntry — exactly one workbook — single, opening it", () => {
    const entry = chooseWorkbookEntry([choice("wb-1")], null);

    expect(entry).toEqual({ kind: "single", workbookId: "wb-1" });
  });

  it("chooseWorkbookEntry — three workbooks, no remembered id — choice, opening the first", () => {
    const workbooks = [choice("wb-1"), choice("wb-2"), choice("wb-3")];

    const entry = chooseWorkbookEntry(workbooks, null);

    expect(entry).toEqual({ kind: "choice", workbookId: "wb-1", choices: workbooks });
  });

  it("chooseWorkbookEntry — three workbooks, remembered id present — choice, opening the remembered one", () => {
    const workbooks = [choice("wb-1"), choice("wb-2"), choice("wb-3")];

    const entry = chooseWorkbookEntry(workbooks, "wb-2");

    expect(entry).toEqual({ kind: "choice", workbookId: "wb-2", choices: workbooks });
  });

  it("chooseWorkbookEntry — three workbooks, remembered id absent — falls back to the first", () => {
    const workbooks = [choice("wb-1"), choice("wb-2"), choice("wb-3")];

    const entry = chooseWorkbookEntry(workbooks, "wb-deleted");

    expect(entry).toEqual({ kind: "choice", workbookId: "wb-1", choices: workbooks });
  });

  it("chooseWorkbookEntry — remembered id equal to the first — no special case, opens the first", () => {
    const workbooks = [choice("wb-1"), choice("wb-2")];

    const entry = chooseWorkbookEntry(workbooks, "wb-1");

    expect(entry).toEqual({ kind: "choice", workbookId: "wb-1", choices: workbooks });
  });
});

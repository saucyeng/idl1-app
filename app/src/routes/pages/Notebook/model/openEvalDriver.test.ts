import { describe, expect, it } from "vitest";

import type { WorkbookAction } from "./workbookState";
import { runOpenAndEval, type OpenEvalDeps } from "./openEvalDriver";

class FakeNotImplementedError extends Error {}

function baseDeps(overrides: Partial<OpenEvalDeps> = {}): OpenEvalDeps {
  return {
    listWorkbooks: async () => [{ workbook_id: "wb-1" }],
    openWorkbook: async (idOrPath) => ({ id: idOrPath, name: "n", path: "/p", cell_count: 0 }),
    readWorkbook: async () => ({ markdown: "# hi", hash: "h1", path: "/p" }),
    evalWorkbook: async () => [{ cell_id: "c1", kind: "math", value: null, defs: [], errors: [] }],
    isNotImplementedError: (e) => e instanceof FakeNotImplementedError,
    ...overrides,
  };
}

describe("runOpenAndEval", () => {
  it("runOpenAndEval — a fully successful run — dispatches open, markdown, then eval results in order", async () => {
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(baseDeps(), "session-a", (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady", "evalResult"]);
  });

  it("runOpenAndEval — readWorkbook throws NotImplementedError — marks markdown not_implemented but still evaluates", async () => {
    const deps = baseDeps({
      readWorkbook: async () => {
        throw new FakeNotImplementedError("no read_workbook yet");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownNotImplemented", "evalResult"]);
  });

  it("runOpenAndEval — no workbooks are indexed — reports a markdown error and never opens or evaluates", async () => {
    const deps = baseDeps({ listWorkbooks: async () => [] });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ type: "markdownError", message: "No workbooks found." }]);
  });

  it("runOpenAndEval — a run superseded before openWorkbook resolves — dispatches nothing further", async () => {
    const deps = baseDeps();
    const actions: WorkbookAction[] = [];
    let staleAfterList = false;

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => {
      const wasStale = staleAfterList;
      staleAfterList = true;
      return wasStale;
    });

    expect(actions).toEqual([]);
  });
});

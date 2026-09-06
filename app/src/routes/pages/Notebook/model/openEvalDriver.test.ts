import { describe, expect, it } from "vitest";

import type { WorkbookAction } from "./workbookState";
import { runOpenAndEval, type OpenEvalDeps } from "./openEvalDriver";

function baseDeps(overrides: Partial<OpenEvalDeps> = {}): OpenEvalDeps {
  return {
    listWorkbooks: async () => [{ workbook_id: "wb-1" }],
    openWorkbook: async (idOrPath) => ({ id: idOrPath, name: "n", path: "/p", cell_count: 0 }),
    readWorkbook: async () => ({ markdown: "# hi", hash: "h1", path: "/p" }),
    evalWorkbook: async () => [
      { cell_id: "c1", kind: "math", value: null, defs: [], errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] },
    ],
    ...overrides,
  };
}

describe("runOpenAndEval", () => {
  it("runOpenAndEval — a fully successful run — dispatches open, markdown, then eval results in order", async () => {
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(baseDeps(), "session-a", (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady", "evalResult"]);
  });

  it("runOpenAndEval — no workbooks are indexed — reports a markdown error and never opens or evaluates", async () => {
    const deps = baseDeps({ listWorkbooks: async () => [] });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ type: "markdownError", message: "No workbooks found." }]);
  });

  it("runOpenAndEval — readWorkbook throws a real error — reports it but still evaluates", async () => {
    const deps = baseDeps({
      readWorkbook: async () => {
        throw new Error("disk read failed");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownError", "evalResult"]);
  });

  it("runOpenAndEval — listWorkbooks itself rejects — reports the error and never opens", async () => {
    const deps = baseDeps({
      listWorkbooks: async () => {
        throw new Error("catalog unavailable");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ type: "markdownError", message: "catalog unavailable" }]);
  });

  it("runOpenAndEval — evalWorkbook rejects — the earlier open/markdown dispatches still stand, nothing further is dispatched", async () => {
    const deps = baseDeps({
      evalWorkbook: async () => {
        throw new Error("unknown workbook");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady"]);
  });

  it("runOpenAndEval — stale after readWorkbook resolves — skips the markdownReady dispatch and the eval step", async () => {
    const deps = baseDeps();
    const actions: WorkbookAction[] = [];
    let calls = 0;

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => {
      calls++;
      return calls > 2;
    });

    expect(actions.map((a) => a.type)).toEqual(["handleOpened"]);
  });

  it("runOpenAndEval — stale exactly after evalWorkbook resolves — dispatches open and markdown but skips the eval result (review-task13.md Minor)", async () => {
    const deps = baseDeps();
    const actions: WorkbookAction[] = [];
    let calls = 0;

    await runOpenAndEval(deps, null, (a) => actions.push(a), () => {
      calls++;
      return calls > 3;
    });

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady"]);
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

  it("runOpenAndEval — a lap context is supplied — passes it through to evalWorkbook unchanged", async () => {
    const seen: unknown[] = [];
    const deps = baseDeps({
      evalWorkbook: async (_id, _sessionId, lapContext) => {
        seen.push(lapContext);
        return [];
      },
    });
    const lapContext = { main_lap: 2, overlay_laps: [1] };

    await runOpenAndEval(deps, "session-a", () => {}, () => false, lapContext);

    expect(seen).toEqual([lapContext]);
  });
});

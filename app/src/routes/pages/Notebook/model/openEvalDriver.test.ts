import { describe, expect, it } from "vitest";

import type { WorkbookAction } from "./workbookState";
import { runEval, runOpenAndEval, type OpenEvalDeps } from "./openEvalDriver";

function baseDeps(overrides: Partial<OpenEvalDeps> = {}): OpenEvalDeps {
  return {
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

    await runOpenAndEval(baseDeps(), "wb-1", "session-a", (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady", "evalResult"]);
  });

  it("runOpenAndEval — opens the workbook id it is given — never invents its own", async () => {
    const seen: string[] = [];
    const deps = baseDeps({
      openWorkbook: async (idOrPath) => {
        seen.push(idOrPath);
        return { id: idOrPath, name: "n", path: "/p", cell_count: 0 };
      },
    });

    await runOpenAndEval(deps, "wb-42", null, () => {}, () => false);

    expect(seen).toEqual(["wb-42"]);
  });

  it("runOpenAndEval — readWorkbook throws a real error — reports it but still evaluates", async () => {
    const deps = baseDeps({
      readWorkbook: async () => {
        throw new Error("disk read failed");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, "wb-1", null, (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownError", "evalResult"]);
  });

  it("runOpenAndEval — openWorkbook itself rejects — reports the error and never reads or evaluates", async () => {
    const deps = baseDeps({
      openWorkbook: async () => {
        throw new Error("workbook not found");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, "wb-1", null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ type: "markdownError", message: "workbook not found" }]);
  });

  it("runOpenAndEval — evalWorkbook rejects — the earlier open/markdown dispatches still stand, and a typed evalError follows", async () => {
    const deps = baseDeps({
      evalWorkbook: async () => {
        throw new Error("unknown workbook");
      },
    });
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, "wb-1", null, (a) => actions.push(a), () => false);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady", "evalError"]);
    expect(actions[2]).toEqual({ type: "evalError", error: { kind: "internal", message: "unknown workbook" } });
  });

  it("runOpenAndEval — stale after readWorkbook resolves — skips the markdownReady dispatch and the eval step", async () => {
    const deps = baseDeps();
    const actions: WorkbookAction[] = [];
    let calls = 0;

    await runOpenAndEval(deps, "wb-1", null, (a) => actions.push(a), () => {
      calls++;
      return calls > 1;
    });

    expect(actions.map((a) => a.type)).toEqual(["handleOpened"]);
  });

  it("runOpenAndEval — stale exactly after evalWorkbook resolves — dispatches open and markdown but skips the eval result (review-task13.md Minor)", async () => {
    const deps = baseDeps();
    const actions: WorkbookAction[] = [];
    let calls = 0;

    await runOpenAndEval(deps, "wb-1", null, (a) => actions.push(a), () => {
      calls++;
      return calls > 2;
    });

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady"]);
  });

  it("runOpenAndEval — already stale when openWorkbook resolves — dispatches nothing at all", async () => {
    const deps = baseDeps();
    const actions: WorkbookAction[] = [];

    await runOpenAndEval(deps, "wb-1", null, (a) => actions.push(a), () => true);

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

    await runOpenAndEval(deps, "wb-1", "session-a", () => {}, () => false, lapContext);

    expect(seen).toEqual([lapContext]);
  });
});

describe("runEval", () => {
  it("runEval — a whole-command rejection — dispatches a typed evalError, never a bare string", async () => {
    const actions: WorkbookAction[] = [];
    const deps = {
      evalWorkbook: async () => {
        throw { kind: "invalid_argument", message: "lap context not supported yet" };
      },
    };

    await runEval(deps, "wb-1", null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ type: "evalError", error: { kind: "invalid_argument", message: "lap context not supported yet" } }]);
  });

  it("runEval — stale after evalWorkbook rejects — dispatches nothing", async () => {
    const actions: WorkbookAction[] = [];
    const deps = {
      evalWorkbook: async () => {
        throw new Error("boom");
      },
    };

    await runEval(deps, "wb-1", null, (a) => actions.push(a), () => true);

    expect(actions).toEqual([]);
  });

  it("runEval — a successful eval — dispatches evalResult, not evalError", async () => {
    const actions: WorkbookAction[] = [];
    const deps = { evalWorkbook: async () => [] };

    await runEval(deps, "wb-1", null, (a) => actions.push(a), () => false);

    expect(actions).toEqual([{ type: "evalResult", outputs: [] }]);
  });
});

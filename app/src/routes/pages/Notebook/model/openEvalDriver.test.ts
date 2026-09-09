import { describe, expect, it } from "vitest";

import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import type { WorkbookAction } from "./workbookState";
import { runEval, runOpenAndEval, type OpenEvalDeps, type OpenEvalWindowAction } from "./openEvalDriver";

function baseDeps(overrides: Partial<OpenEvalDeps> = {}): OpenEvalDeps {
  return {
    openWorkbook: async (idOrPath) => ({ id: idOrPath, name: "n", path: "/p", cell_count: 0 }),
    readWorkbook: async () => ({ markdown: "# hi", hash: "h1", path: "/p", pending_migrations: [] }),
    evalWorkbookV2: async () => [
      { ok: [{ cell_id: "c1", kind: "math", value: null, defs: [], errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] }] },
    ],
    ...overrides,
  };
}

function windowFor(sessionId: string): SelectedWindow {
  return { session_id: sessionId, span: { kind: "session" }, colour: "--chart-1" };
}

describe("runOpenAndEval", () => {
  it("runOpenAndEval — a fully successful run — dispatches open, markdown, then one window result in order", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(baseDeps(), "wb-1", [windowFor("session-a")], (a) => actions.push(a), () => false, 0);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady", "evalWindowResult"]);
  });

  it("runOpenAndEval — opens the workbook id it is given — never invents its own", async () => {
    const seen: string[] = [];
    const deps = baseDeps({
      openWorkbook: async (idOrPath) => {
        seen.push(idOrPath);
        return { id: idOrPath, name: "n", path: "/p", cell_count: 0 };
      },
    });

    await runOpenAndEval(deps, "wb-42", [], () => {}, () => false, 0);

    expect(seen).toEqual(["wb-42"]);
  });

  it("runOpenAndEval — readWorkbook reports a retired name — passes pending_migrations through to markdownReady's pendingMigrations", async () => {
    const pending = [{ cell_id: "aaaaaaaa", line: 0, old: "variance_time", new: "lap_delta_time" }];
    const deps = baseDeps({
      readWorkbook: async () => ({ markdown: "# hi", hash: "h1", path: "/p", pending_migrations: pending }),
    });
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(deps, "wb-1", [], (a) => actions.push(a), () => false, 0);

    const markdownReady = actions.find((a) => a.type === "markdownReady");
    expect(markdownReady).toMatchObject({ pendingMigrations: pending });
  });

  it("runOpenAndEval — readWorkbook throws a real error — reports it but still evaluates", async () => {
    const deps = baseDeps({
      readWorkbook: async () => {
        throw new Error("disk read failed");
      },
    });
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(deps, "wb-1", [], (a) => actions.push(a), () => false, 0);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownError", "evalWindowResult"]);
  });

  it("runOpenAndEval — openWorkbook itself rejects — reports the error and never reads or evaluates", async () => {
    const deps = baseDeps({
      openWorkbook: async () => {
        throw new Error("workbook not found");
      },
    });
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(deps, "wb-1", [], (a) => actions.push(a), () => false, 0);

    expect(actions).toEqual([{ type: "markdownError", message: "workbook not found" }]);
  });

  it("runOpenAndEval — evalWorkbookV2 rejects — the earlier open/markdown dispatches still stand, and a typed window error follows with a null window", async () => {
    const deps = baseDeps({
      evalWorkbookV2: async () => {
        throw new Error("unknown workbook");
      },
    });
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(deps, "wb-1", [windowFor("session-a")], (a) => actions.push(a), () => false, 0);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady", "evalWindowError"]);
    expect(actions[2]).toEqual({ type: "evalWindowError", window: null, error: { kind: "internal", message: "unknown workbook" }, generation: 0 });
  });

  it("runOpenAndEval — three windows, the middle one degenerate — dispatches a result for windows 1 and 3 and an error for window 2, none suppressing the others (ruling R121)", async () => {
    const windows = [windowFor("session-a"), windowFor("session-b"), windowFor("session-c")];
    const deps = baseDeps({
      evalWorkbookV2: async () => [
        { ok: [{ cell_id: "c1", kind: "math", value: null, defs: [], errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] }] },
        { error: { kind: "invalid_argument", message: "no_overlap" } },
        { ok: [{ cell_id: "c1", kind: "math", value: null, defs: [], errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] }] },
      ],
    });
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(deps, "wb-1", windows, (a) => actions.push(a), () => false, 0);

    const windowActions = actions.filter((a) => a.type === "evalWindowResult" || a.type === "evalWindowError") as OpenEvalWindowAction[];
    expect(windowActions).toHaveLength(3);
    expect(windowActions[0]).toMatchObject({ type: "evalWindowResult", window: windows[0] });
    expect(windowActions[1]).toEqual({ type: "evalWindowError", window: windows[1], error: { kind: "invalid_argument", message: "no_overlap" }, generation: 0 });
    expect(windowActions[2]).toMatchObject({ type: "evalWindowResult", window: windows[2] });
  });

  it("runOpenAndEval — windows: [] — evalWorkbookV2's single result is dispatched with a null window", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(baseDeps(), "wb-1", [], (a) => actions.push(a), () => false, 0);

    const windowActions = actions.filter((a) => a.type === "evalWindowResult") as OpenEvalWindowAction[];
    expect(windowActions).toHaveLength(1);
    expect(windowActions[0]).toMatchObject({ window: null });
  });

  it("runOpenAndEval — stale after readWorkbook resolves — skips the markdownReady dispatch and the eval step", async () => {
    const deps = baseDeps();
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];
    let calls = 0;

    await runOpenAndEval(deps, "wb-1", [], (a) => actions.push(a), () => {
      calls++;
      return calls > 1;
    }, 0);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened"]);
  });

  it("runOpenAndEval — stale exactly after evalWorkbookV2 resolves — dispatches open and markdown but skips the eval result (review-task13.md Minor)", async () => {
    const deps = baseDeps();
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];
    let calls = 0;

    await runOpenAndEval(deps, "wb-1", [], (a) => actions.push(a), () => {
      calls++;
      return calls > 2;
    }, 0);

    expect(actions.map((a) => a.type)).toEqual(["handleOpened", "markdownReady"]);
  });

  it("runOpenAndEval — already stale when openWorkbook resolves — dispatches nothing at all", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];

    await runOpenAndEval(baseDeps(), "wb-1", [], (a) => actions.push(a), () => true, 0);

    expect(actions).toEqual([]);
  });
});

describe("runEval", () => {
  it("runEval — a whole-command rejection — dispatches a typed window error with a null window, never a bare string", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];
    const deps = {
      evalWorkbookV2: async () => {
        throw { kind: "invalid_argument", message: "lap context not supported yet" };
      },
    };

    await runEval(deps, "wb-1", [], (a) => actions.push(a), () => false, 0);

    expect(actions).toEqual([{ type: "evalWindowError", window: null, error: { kind: "invalid_argument", message: "lap context not supported yet" }, generation: 0 }]);
  });

  it("runEval — stale after evalWorkbookV2 rejects — dispatches nothing", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];
    const deps = {
      evalWorkbookV2: async () => {
        throw new Error("boom");
      },
    };

    await runEval(deps, "wb-1", [], (a) => actions.push(a), () => true, 0);

    expect(actions).toEqual([]);
  });

  it("runEval — a successful eval over one window — dispatches evalWindowResult with that window, not evalWindowError", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];
    const window = windowFor("session-a");
    const deps = { evalWorkbookV2: async () => [{ ok: [] }] };

    await runEval(deps, "wb-1", [window], (a) => actions.push(a), () => false, 0);

    expect(actions).toEqual([{ type: "evalWindowResult", window, outputs: [], generation: 0 }]);
  });

  it("runEval — a non-zero generation — is stamped onto the dispatched result unchanged (decision 59)", async () => {
    const actions: (WorkbookAction | OpenEvalWindowAction)[] = [];
    const window = windowFor("session-a");
    const deps = { evalWorkbookV2: async () => [{ ok: [] }] };

    await runEval(deps, "wb-1", [window], (a) => actions.push(a), () => false, 7);

    expect(actions).toEqual([{ type: "evalWindowResult", window, outputs: [], generation: 7 }]);
  });
});

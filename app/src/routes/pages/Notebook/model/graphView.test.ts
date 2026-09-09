import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../../ipc/catalog";
import type { CellOutput } from "../../../../ipc/workbook";
import type { SelectionWindow } from "../../../../state/selection";
import { primaryWindowOutputs, sessionDetailsBySessionId } from "./graphView";
import type { WindowEvalState } from "./workbookState";

function window(sessionId: string): SelectionWindow {
  return { sessionId, span: { kind: "session" }, colour: "--chart-1" };
}

function detail(sessionId: string): SessionDetail {
  return { session_id: sessionId, channels: [] } as unknown as SessionDetail;
}

describe("sessionDetailsBySessionId", () => {
  it("sessionDetailsBySessionId — every selected window with a resolved detail — is keyed by session id", () => {
    // Arrange
    const w1 = window("s1");
    const w2 = window("s2");
    const detailsByWindow = new Map([
      [`${w1.sessionId}::session`, detail("s1")],
      [`${w2.sessionId}::session`, detail("s2")],
    ]);

    // Act
    const result = sessionDetailsBySessionId([w1, w2], detailsByWindow);

    // Assert
    expect([...result.keys()]).toEqual(["s1", "s2"]);
  });

  it("sessionDetailsBySessionId — a window whose detail hasn't resolved (absent or null) — contributes no entry", () => {
    // Arrange
    const w1 = window("s1");
    const w2 = window("s2");
    const detailsByWindow = new Map<string, SessionDetail | null>([[`${w1.sessionId}::session`, null]]); // w2 absent entirely

    // Act
    const result = sessionDetailsBySessionId([w1, w2], detailsByWindow);

    // Assert
    expect(result.size).toBe(0);
  });

  it("sessionDetailsBySessionId — no windows selected — returns an empty map", () => {
    // Act
    const result = sessionDetailsBySessionId([], new Map());

    // Assert
    expect(result.size).toBe(0);
  });
});

describe("primaryWindowOutputs", () => {
  it("primaryWindowOutputs — the primary window resolved ok — returns its CellOutput[]", () => {
    // Arrange
    const w = window("s1");
    const output: CellOutput = { cell_id: "a1b2c3d4", kind: "math", value: null, defs: [], errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] };
    const windows = new Map<string, WindowEvalState>([[`${w.sessionId}::session`, { kind: "ok", outputs: new Map([["a1b2c3d4", output]]), generation: 0 }]]);

    // Act
    const outputs = primaryWindowOutputs(windows, w);

    // Assert
    expect(outputs).toEqual([output]);
  });

  it("primaryWindowOutputs — no window selected — returns []", () => {
    // Act
    const outputs = primaryWindowOutputs(new Map(), null);

    // Assert
    expect(outputs).toEqual([]);
  });

  it("primaryWindowOutputs — the primary window not yet evaluated — returns []", () => {
    // Act
    const outputs = primaryWindowOutputs(new Map(), window("s1"));

    // Assert
    expect(outputs).toEqual([]);
  });

  it("primaryWindowOutputs — the primary window's whole evaluation call failed — returns [], not stale data", () => {
    // Arrange
    const w = window("s1");
    const windows = new Map<string, WindowEvalState>([[`${w.sessionId}::session`, { kind: "error", error: { kind: "InternalError", message: "boom" }, generation: 0 }]]);

    // Act
    const outputs = primaryWindowOutputs(windows, w);

    // Assert
    expect(outputs).toEqual([]);
  });
});

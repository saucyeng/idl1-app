import { describe, expect, it } from "vitest";

import type { CellOutput } from "../../../../../ipc/workbook";
import type { SessionSummary } from "../../../../../ipc/catalog";
import type { SelectionWindow } from "../../../../../state/selection";
import type { ScannedCell } from "../cells";
import { buildReportDocument } from "./document";

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    session_id: "sess-1",
    blob_sha256: "a".repeat(64),
    source_format: "idl0",
    device_id: null,
    config_checksum: null,
    importer_version: "0.4.0",
    seam_correction_version: "v1",
    engine_version: "0.9.0",
    timestamp_utc_ms: 1_700_000_000_000,
    created_at_ms: 1_700_000_001_000,
    rider: "",
    bike: "",
    venue_name: "",
    event_name: "",
    event_session: "",
    short_comment: "",
    tag: "",
    lap_count: null,
    duration_ms: null,
    ...overrides,
  };
}

function window(overrides: Partial<SelectionWindow> = {}): SelectionWindow {
  return { sessionId: "sess-1", span: { kind: "session" }, colour: "--chart-1", ...overrides };
}

function mathCell(id: string): ScannedCell {
  return { id, idRaw: id, kind: "math", infoLine: `math id=${id}`, bodyRange: [0, 0], proseBeforeRange: null, proseAfterRange: null };
}

function jsCell(id: string): ScannedCell {
  return { id, idRaw: id, kind: "js", infoLine: `js id=${id}`, bodyRange: [0, 0], proseBeforeRange: null, proseAfterRange: null };
}

function mathOutput(id: string, overrides: Partial<CellOutput> = {}): CellOutput {
  return {
    cell_id: id,
    kind: "math",
    value: null,
    defs: [],
    errors: [],
    prose_before_html: null,
    prose_after_html: null,
    prose_spans: [],
    ...overrides,
  };
}

describe("buildReportDocument", () => {
  it("no windows selected — returns a cover, an empty selection block and no content section", () => {
    const doc = buildReportDocument([], new Map(), [], [], [], "1.0.0", 1_700_000_500_000);

    expect(doc.blocks[0]).toEqual({
      kind: "cover",
      title: "Session report",
      generatedAtMs: 1_700_000_500_000,
      appVersion: "1.0.0",
      engineVersion: "not recorded",
      importerVersion: "not recorded",
    });
    expect(doc.blocks.some((b) => b.kind === "windowSection")).toBe(false);
    const selectionBlock = doc.blocks.find((b) => b.kind === "selection");
    expect(selectionBlock).toEqual({ kind: "selection", windows: [] });
  });

  it("a session field left as \"\" — renders as \"not recorded\", never blank", () => {
    const doc = buildReportDocument([], new Map(), [{ ok: [] }], [window()], [session()], "1.0.0", 1_700_000_500_000);

    const sessionBlock = doc.blocks.find((b) => b.kind === "session");
    expect(sessionBlock).toMatchObject({ rider: "not recorded", bike: "not recorded", venueName: "not recorded", deviceId: "not recorded" });
  });

  it("a math cell's definition — carries its unit and rate text, the gap MathCell.tsx has today", () => {
    const cells = [mathCell("cell-1")];
    const outputs = [
      mathOutput("cell-1", {
        defs: [
          {
            name: "speed",
            label: "Speed",
            value: { length: 1200, has_t: true },
            error: null,
            sample_rate_hz: 100,
            unit: { state: "known", text: "km/h" },
            unit_notes: [],
          },
        ],
      }),
    ];

    const doc = buildReportDocument(cells, new Map(), [{ ok: outputs }], [window()], [session()], "1.0.0", 0);

    const defTable = doc.blocks.find((b) => b.kind === "defTable");
    expect(defTable).toMatchObject({
      rows: [{ name: "speed", label: "Speed", valueText: "1200 samples (t)", unit: { text: "km/h", unknownReason: null }, rateText: "100 Hz" }],
    });
  });

  it("a definition with an unknown unit — carries no unit text but names the reason for the appendix", () => {
    const cells = [mathCell("cell-1")];
    const outputs = [
      mathOutput("cell-1", {
        defs: [
          {
            name: "mystery",
            label: null,
            value: { length: 4, has_t: false },
            error: null,
            sample_rate_hz: null,
            unit: { state: "unknown", reason: "mixed operands" },
            unit_notes: [],
          },
        ],
      }),
    ];

    const doc = buildReportDocument(cells, new Map(), [{ ok: outputs }], [window()], [session()], "1.0.0", 0);

    const defTable = doc.blocks.find((b) => b.kind === "defTable");
    expect(defTable).toMatchObject({ rows: [{ unit: { text: "", unknownReason: "mixed operands" }, rateText: null }] });
    const appendix = doc.blocks.find((b) => b.kind === "appendix");
    expect(appendix).toMatchObject({ entries: expect.arrayContaining([expect.stringContaining("mixed operands")]) });
  });

  it("a js (chart) cell — becomes a named absence block, never a silent gap", () => {
    const cells = [jsCell("cell-7")];
    const outputs: CellOutput[] = [{ cell_id: "cell-7", kind: "js", value: null, defs: [], errors: [], prose_before_html: null, prose_after_html: null, prose_spans: [] }];

    const doc = buildReportDocument(cells, new Map(), [{ ok: outputs }], [window()], [session()], "1.0.0", 0);

    const absence = doc.blocks.find((b) => b.kind === "absence");
    expect(absence).toMatchObject({ cellId: "cell-7" });
    expect((absence as { reason: string }).reason).toContain("not yet included");
    const appendix = doc.blocks.find((b) => b.kind === "appendix");
    expect(appendix).toMatchObject({ entries: expect.arrayContaining([expect.stringContaining("cell-7")]) });
  });

  it("prose before a cell — carried through in document order", () => {
    const cells = [mathCell("cell-1")];
    const proseBlocks = new Map([["cell-1::before", { blockId: "cell-1::before", cellId: "cell-1", position: "before" as const, content: { kind: "raw" as const, text: "Lap notes" } }]]);
    const outputs = [mathOutput("cell-1")];

    const doc = buildReportDocument(cells, proseBlocks, [{ ok: outputs }], [window()], [session()], "1.0.0", 0);

    const proseIndex = doc.blocks.findIndex((b) => b.kind === "prose");
    const defTableIndex = doc.blocks.findIndex((b) => b.kind === "defTable");
    expect(proseIndex).toBeGreaterThanOrEqual(0);
    expect(proseIndex).toBeLessThan(defTableIndex);
    expect(doc.blocks[proseIndex]).toMatchObject({ text: "Lap notes" });
  });

  it("the primary window's own eval failed — the failure is recorded, not thrown or dropped", () => {
    const doc = buildReportDocument(
      [mathCell("cell-1")],
      new Map(),
      [{ error: { kind: "not_found", message: "session gone" } }],
      [window()],
      [session()],
      "1.0.0",
      0,
    );

    expect(doc.blocks.some((b) => b.kind === "windowSection")).toBe(false);
    const appendix = doc.blocks.find((b) => b.kind === "appendix");
    expect(appendix).toMatchObject({ entries: expect.arrayContaining([expect.stringContaining("session gone")]) });
  });
});

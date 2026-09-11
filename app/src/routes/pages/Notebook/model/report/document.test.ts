import { describe, expect, it } from "vitest";

import type { CellOutput } from "../../../../../ipc/workbook";
import type { SessionSummary } from "../../../../../ipc/catalog";
import { describeWindow, sessionLabel, type SelectionWindow } from "../../../../../state/selection";
import type { ScannedCell } from "../cells";
import type { ProseBlock as ProseBlockData } from "../proseBlocks";
import type { CombinedChannelPayload } from "../channelBindDriver";
import { generate } from "../../plotForm/generate";
import { buildReportDocument, formatChartCaption, type BuildReportDocumentInput } from "./document";

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

/** A `js` cell whose fenced body is `text` (byte range `[0, byteLength)` —
 *  callers pass `text` as this fixture's whole `markdown` too, so the byte
 *  range and the source line up without a real fence scan. */
function jsCell(id: string, text = ""): ScannedCell {
  return { id, idRaw: id, kind: "js", infoLine: `js id=${id}`, bodyRange: [0, new TextEncoder().encode(text).length], proseBeforeRange: null, proseAfterRange: null };
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

/** Fills in every {@link BuildReportDocumentInput} field a test does not
 *  care about, so each `it` only states what it is actually exercising. */
function input(overrides: Partial<BuildReportDocumentInput> = {}): BuildReportDocumentInput {
  return {
    cells: [],
    markdown: "",
    proseBlocks: new Map(),
    evals: [],
    windows: [],
    sessions: [],
    chartChannelData: new Map(),
    xMode: "time",
    appVersion: "1.0.0",
    generatedAtMs: 0,
    ...overrides,
  };
}

function payload(overrides: Partial<CombinedChannelPayload> = {}): CombinedChannelPayload {
  return {
    length: 2,
    t: new Float64Array([0, 1]),
    v: new Float64Array([10, 11]),
    tr: new Float64Array([0, 1]),
    w: new Float64Array([0, 0]),
    windows: [{ sessionId: "sess-1", span: { kind: "session" }, colour: "--chart-1", label: "Session" }],
    spans: [],
    ...overrides,
  };
}

describe("buildReportDocument", () => {
  it("no windows selected — returns a cover, an empty selection block and no content section", () => {
    const doc = buildReportDocument(input({ evals: [], generatedAtMs: 1_700_000_500_000 }));

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
    const doc = buildReportDocument(input({ evals: [{ ok: [] }], windows: [window()], sessions: [session()], generatedAtMs: 1_700_000_500_000 }));

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

    const doc = buildReportDocument(input({ cells, evals: [{ ok: outputs }], windows: [window()], sessions: [session()] }));

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

    const doc = buildReportDocument(input({ cells, evals: [{ ok: outputs }], windows: [window()], sessions: [session()] }));

    const defTable = doc.blocks.find((b) => b.kind === "defTable");
    expect(defTable).toMatchObject({ rows: [{ unit: { text: "", unknownReason: "mixed operands" }, rateText: null }] });
    const appendix = doc.blocks.find((b) => b.kind === "appendix");
    expect(appendix).toMatchObject({ entries: expect.arrayContaining([expect.stringContaining("mixed operands")]) });
  });

  it("a js cell whose code is custom (plotForm.parse rejects) — becomes a named absence block, never a silent gap", () => {
    const cells = [jsCell("cell-7", "doSomethingCustom()")];

    const doc = buildReportDocument(input({ cells, markdown: "doSomethingCustom()", evals: [{ ok: [] }], windows: [window()], sessions: [session()] }));

    const absence = doc.blocks.find((b) => b.kind === "absence");
    expect(absence).toMatchObject({ cellId: "cell-7" });
    expect((absence as { reason: string }).reason).toContain("custom code");
    const appendix = doc.blocks.find((b) => b.kind === "appendix");
    expect(appendix).toMatchObject({ entries: expect.arrayContaining([expect.stringContaining("cell-7")]) });
  });

  it("a js cell that parses but has no supplied channel data — a named absence, not a chart", () => {
    const code = 'Plot.plot({\n  marks: [Plot.lineY(channel("speed"), {x: "t", y: "v"})]\n})';
    const cells = [jsCell("cell-8", code)];

    const doc = buildReportDocument(input({ cells, markdown: code, evals: [{ ok: [] }], windows: [window()], sessions: [session()] }));

    const absence = doc.blocks.find((b) => b.kind === "absence");
    expect(absence).toMatchObject({ cellId: "cell-8" });
    expect(doc.blocks.some((b) => b.kind === "chartSlot")).toBe(false);
  });

  it("a js cell that parses with its channel data supplied — a chartSlot block, once, not per window", () => {
    const code = 'Plot.plot({\n  marks: [Plot.lineY(channel("speed"), {x: "t", y: "v"})]\n})';
    const cells = [jsCell("cell-8", code)];
    const chartChannelData = new Map([["cell-8", new Map([["speed", payload()]])]]);
    const windows = [window(), window({ sessionId: "sess-2", colour: "--chart-2" })];
    const evals = [{ ok: [] }, { ok: [] }];

    const doc = buildReportDocument(input({ cells, markdown: code, evals, windows, sessions: [session(), session({ session_id: "sess-2" })], chartChannelData }));

    const chartSlots = doc.blocks.filter((b) => b.kind === "chartSlot");
    expect(chartSlots).toHaveLength(1);
    expect(chartSlots[0]).toMatchObject({ cellId: "cell-8", windowLabels: ["Session"], caption: "Session — Time axis, drawn at 2 points" });
  });

  it("a chartSlot's caption uses the largest channel's real length, not the requested budget", () => {
    const code = generate({
      chart: "time",
      marks: [
        { channel: "speed", mark: "lineY" },
        { channel: "cadence", mark: "lineY" },
      ],
    });
    const cells = [jsCell("cell-9", code)];
    const chartChannelData = new Map([
      [
        "cell-9",
        new Map([
          ["speed", payload({ length: 5 })],
          ["cadence", payload({ length: 40 })],
        ]),
      ],
    ]);
    const windows = [window()];
    const evals = [{ ok: [] }];

    const doc = buildReportDocument(input({ cells, markdown: code, evals, windows, sessions: [session()], chartChannelData, xMode: "distance" }));

    const chartSlots = doc.blocks.filter((b) => b.kind === "chartSlot");
    expect(chartSlots[0]).toMatchObject({ caption: "Session — Distance axis, drawn at 40 points" });
  });

  it("prose before a cell — carried through in document order", () => {
    const cells = [mathCell("cell-1")];
    const proseBlocks: ReadonlyMap<string, ProseBlockData> = new Map([
      ["cell-1::before", { blockId: "cell-1::before", cellId: "cell-1", position: "before" as const, content: { kind: "raw" as const, text: "Lap notes" } }],
    ]);
    const outputs = [mathOutput("cell-1")];

    const doc = buildReportDocument(input({ cells, proseBlocks, evals: [{ ok: outputs }], windows: [window()], sessions: [session()] }));

    const proseIndex = doc.blocks.findIndex((b) => b.kind === "prose");
    const defTableIndex = doc.blocks.findIndex((b) => b.kind === "defTable");
    expect(proseIndex).toBeGreaterThanOrEqual(0);
    expect(proseIndex).toBeLessThan(defTableIndex);
    expect(doc.blocks[proseIndex]).toMatchObject({ text: "Lap notes" });
  });

  it("the primary window's own eval failed — the failure is recorded, not thrown or dropped", () => {
    const doc = buildReportDocument(
      input({
        cells: [mathCell("cell-1")],
        evals: [{ error: { kind: "not_found", message: "session gone" } }],
        windows: [window()],
        sessions: [session()],
      }),
    );

    expect(doc.blocks.some((b) => b.kind === "windowSection")).toBe(false);
    const failure = doc.blocks.find((b) => b.kind === "windowFailure");
    expect(failure).toMatchObject({ error: { kind: "not_found", message: "session gone" } });
    const appendix = doc.blocks.find((b) => b.kind === "appendix");
    expect(appendix).toMatchObject({ entries: expect.arrayContaining([expect.stringContaining("session gone")]) });
  });

  it("two windows, one failing — both get their own section, in selection position, never a silent gap", () => {
    const cells = [mathCell("cell-1")];
    const lap2Outputs = [mathOutput("cell-1", { defs: [{ name: "peak", label: "Peak", value: { length: 1, has_t: false }, error: null, sample_rate_hz: null, unit: { state: "dimensionless" }, unit_notes: [] }] })];
    const windows = [window({ colour: "--chart-1" }), window({ sessionId: "sess-2", colour: "--chart-2" })];
    const evals = [{ error: { kind: "range_out_of_bounds", message: "lap 9 does not exist" } }, { ok: lap2Outputs }];

    const doc = buildReportDocument(input({ cells, evals, windows, sessions: [session(), session({ session_id: "sess-2", venue_name: "Silverstone" })] }));

    const failureIndex = doc.blocks.findIndex((b) => b.kind === "windowFailure");
    const sectionIndex = doc.blocks.findIndex((b) => b.kind === "windowSection");
    expect(failureIndex).toBeGreaterThanOrEqual(0);
    expect(sectionIndex).toBeGreaterThan(failureIndex);
  });

  it("two windows, both succeeding — a comparison table carries the shared scalar definition, one column per window", () => {
    const cells = [mathCell("cell-1")];
    function scalarOutputs(len: number) {
      return [mathOutput("cell-1", { defs: [{ name: "peak_g", label: "Peak g", value: { length: len, has_t: false }, error: null, sample_rate_hz: null, unit: { state: "known", text: "g" }, unit_notes: [] }] })];
    }
    const windows = [window({ colour: "--chart-1" }), window({ sessionId: "sess-2", colour: "--chart-2" })];
    const evals = [{ ok: scalarOutputs(1) }, { ok: scalarOutputs(1) }];

    const doc = buildReportDocument(input({ cells, evals, windows, sessions: [session(), session({ session_id: "sess-2" })] }));

    const comparison = doc.blocks.find((b) => b.kind === "comparison");
    expect(comparison).toMatchObject({
      columns: [{ colour: "--chart-1" }, { colour: "--chart-2" }],
      rows: [{ name: "peak_g", label: "Peak g", cells: ["1 sample g", "1 sample g"] }],
    });
  });

  it("one window selected — no comparison table (nothing to compare)", () => {
    const doc = buildReportDocument(input({ cells: [mathCell("cell-1")], evals: [{ ok: [mathOutput("cell-1")] }], windows: [window()], sessions: [session()] }));

    expect(doc.blocks.some((b) => b.kind === "comparison")).toBe(false);
  });

  it("a report window's label and a top-bar chip for the same session are the same text (R169)", () => {
    const s = session({ venue_name: "Portland", timestamp_utc_ms: 1_700_000_000_000 });

    const doc = buildReportDocument(input({ evals: [{ ok: [] }], windows: [window()], sessions: [s] }));

    const selectionBlock = doc.blocks.find((b) => b.kind === "selection");
    expect(selectionBlock).toEqual({ kind: "selection", windows: [{ label: describeWindow(window(), sessionLabel(s)), colour: "--chart-1" }] });
  });
});

describe("formatChartCaption", () => {
  it("one window, time mode, plural point count — names the window, the axis and the count", () => {
    const caption = formatChartCaption(["Session — Lap 2"], "time", 2048);

    expect(caption).toBe("Session — Lap 2 — Time axis, drawn at 2048 points");
  });

  it("distance mode — names the distance axis, not time", () => {
    const caption = formatChartCaption(["Session"], "distance", 512);

    expect(caption).toBe("Session — Distance axis, drawn at 512 points");
  });

  it("a singular point count — says \"point\", not \"points\"", () => {
    const caption = formatChartCaption(["Session"], "time", 1);

    expect(caption).toBe("Session — Time axis, drawn at 1 point");
  });

  it("no window labels — still states the axis and the count, never a bare dash", () => {
    const caption = formatChartCaption([], "time", 300);

    expect(caption).toBe("Time axis, drawn at 300 points");
  });

  it("two windows — joins their labels rather than picking one", () => {
    const caption = formatChartCaption(["Lap 1", "Lap 2"], "time", 900);

    expect(caption).toBe("Lap 1, Lap 2 — Time axis, drawn at 900 points");
  });
});

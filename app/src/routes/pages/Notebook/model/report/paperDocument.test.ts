import { describe, expect, it } from "vitest";

import type { ReportBlock, ReportDocument } from "./document";
import { blockShowsOnScreen, toPaperDocument } from "./paperDocument";

const COVER: ReportBlock = {
  kind: "cover",
  title: "Session report",
  generatedAtMs: 1_700_000_000_000,
  appVersion: "0.1.0",
  engineVersion: "engine-1",
  importerVersion: "importer-1",
};

const SESSION: ReportBlock = {
  kind: "session",
  sessionId: "s1",
  rider: "not recorded",
  bike: "not recorded",
  venueName: "not recorded",
  eventName: "not recorded",
  timestampText: "not recorded",
  sourceFormat: "fit",
  deviceId: "not recorded",
};

const SELECTION: ReportBlock = { kind: "selection", windows: [{ label: "Lap 1", colour: "--chart-1" }] };

const WINDOW_SECTION: ReportBlock = { kind: "windowSection", label: "Lap 1", colour: "--chart-1" };

const PROSE: ReportBlock = { kind: "prose", cellId: "aabbccdd", position: "before", text: "Front travel over the lap." };

const ABSENCE: ReportBlock = { kind: "absence", cellId: "11223344", reason: "Chart `11223344` is custom code and could not be included in this report." };

const APPENDIX: ReportBlock = { kind: "appendix", entries: ["Window Lap 2: not evaluated."] };

describe("blockShowsOnScreen", () => {
  it("blockShowsOnScreen — a cover block — false", () => {
    const shows = blockShowsOnScreen(COVER);

    expect(shows).toBe(false);
  });

  it("blockShowsOnScreen — an appendix block — false", () => {
    const shows = blockShowsOnScreen(APPENDIX);

    expect(shows).toBe(false);
  });

  it("blockShowsOnScreen — every content kind — true", () => {
    const kept = [SESSION, SELECTION, WINDOW_SECTION, PROSE, ABSENCE].map(blockShowsOnScreen);

    expect(kept).toEqual([true, true, true, true, true]);
  });
});

describe("toPaperDocument", () => {
  it("toPaperDocument — a full document — drops cover and appendix only", () => {
    const document: ReportDocument = { blocks: [COVER, SESSION, SELECTION, WINDOW_SECTION, PROSE, APPENDIX] };

    const paper = toPaperDocument(document);

    expect(paper.blocks.map((b) => b.kind)).toEqual(["session", "selection", "windowSection", "prose"]);
  });

  it("toPaperDocument — a full document — preserves the order of what it keeps", () => {
    const document: ReportDocument = { blocks: [COVER, WINDOW_SECTION, PROSE, SESSION, SELECTION, APPENDIX] };

    const paper = toPaperDocument(document);

    expect(paper.blocks).toEqual([WINDOW_SECTION, PROSE, SESSION, SELECTION]);
  });

  it("toPaperDocument — absence blocks — every one is kept", () => {
    const document: ReportDocument = { blocks: [COVER, ABSENCE, PROSE, ABSENCE, APPENDIX] };

    const paper = toPaperDocument(document);

    expect(paper.blocks.filter((b) => b.kind === "absence")).toHaveLength(2);
  });

  it("toPaperDocument — an empty document — an empty document", () => {
    const document: ReportDocument = { blocks: [] };

    const paper = toPaperDocument(document);

    expect(paper.blocks).toEqual([]);
  });

  it("toPaperDocument — furniture only — an empty document", () => {
    const document: ReportDocument = { blocks: [COVER, APPENDIX] };

    const paper = toPaperDocument(document);

    expect(paper.blocks).toEqual([]);
  });

  it("toPaperDocument — any document — leaves the input untouched", () => {
    const document: ReportDocument = { blocks: [COVER, PROSE, APPENDIX] };

    toPaperDocument(document);

    expect(document.blocks).toEqual([COVER, PROSE, APPENDIX]);
  });
});

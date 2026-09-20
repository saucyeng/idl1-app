import { describe, expect, it } from "vitest";

import { COMMAND_IDS } from "./commandTiers";
import type { RecentWorkbook } from "./recentWorkbooks";
import { recentWorkbookItems, welcomeContent, type WelcomeInputs } from "./welcomeItems";

/** Every command id the panel can name, as a fully-registered app would
 *  report them. */
const ALL_REGISTERED: ReadonlySet<string> = new Set(Object.values(COMMAND_IDS));

/** One recent entry, with the fields a test does not care about filled in. */
function entry(overrides: Partial<RecentWorkbook> = {}): RecentWorkbook {
  return { id: "wb-1", name: "Silverstone", fileName: "silverstone.idl1wb", openedAtMs: 1_000, ...overrides };
}

/** {@link welcomeContent}'s inputs with everything registered and nothing
 *  recent, which each test then narrows. */
function inputs(overrides: Partial<WelcomeInputs> = {}): WelcomeInputs {
  return { registered: ALL_REGISTERED, recent: [], missingIds: new Set(), dataRootPath: null, ...overrides };
}

describe("welcomeContent", () => {
  it("welcomeContent — everything registered, nothing recent — Start, Panels and Learn, no empty Recent", () => {
    const content = welcomeContent(inputs());

    expect(content.sections.map((section) => section.id)).toEqual(["start", "panels", "learn"]);
  });

  it("welcomeContent — a recent workbook — Recent sits second, in R244's order", () => {
    const content = welcomeContent(inputs({ recent: [entry()] }));

    expect(content.sections.map((section) => section.id)).toEqual(["start", "recent", "panels", "learn"]);
  });

  it("welcomeContent — every item — runs a command id that exists in the one table", () => {
    const known = new Set<string>(Object.values(COMMAND_IDS));

    const content = welcomeContent(inputs({ recent: [entry()] }));

    for (const section of content.sections) {
      for (const item of section.items) expect(known.has(item.command)).toBe(true);
    }
  });

  it("welcomeContent — the Panels section — reopens Notebook, Maths and Code under R225's words", () => {
    const content = welcomeContent(inputs());

    const panels = content.sections.find((section) => section.id === "panels")!;

    expect(panels.items.map((item) => item.label)).toEqual(["Notebook", "Maths", "Code"]);
    expect(panels.items.map((item) => item.command)).toEqual([
      COMMAND_IDS.viewToggleCells,
      COMMAND_IDS.viewToggleGraph,
      COMMAND_IDS.viewToggleProperties,
    ]);
  });

  it("welcomeContent — a command nothing has registered — the row stays, disabled", () => {
    const registered = new Set([...ALL_REGISTERED].filter((id) => id !== COMMAND_IDS.workbookNew));

    const content = welcomeContent(inputs({ registered }));

    const start = content.sections.find((section) => section.id === "start")!;
    const newWorkbook = start.items.find((item) => item.command === COMMAND_IDS.workbookNew)!;
    expect(newWorkbook.enabled).toBe(false);
    expect(start.items.every((item) => item.id !== undefined)).toBe(true);
  });

  it("welcomeContent — nothing registered at all — every section still there, every row disabled", () => {
    const content = welcomeContent(inputs({ registered: new Set() }));

    const rows = content.sections.flatMap((section) => section.items);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((item) => !item.enabled)).toBe(true);
  });

  it("welcomeContent — a resolved data root — carried through unchanged", () => {
    const content = welcomeContent(inputs({ dataRootPath: "D:/race-data" }));

    expect(content.dataRootPath).toBe("D:/race-data");
  });

  it("welcomeContent — every row — a unique id", () => {
    const content = welcomeContent(inputs({ recent: [entry(), entry({ id: "wb-2", name: "Donington" })] }));

    const ids = content.sections.flatMap((section) => section.items).map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("recentWorkbookItems", () => {
  it("recentWorkbookItems — a present workbook — enabled, the path as its detail", () => {
    const items = recentWorkbookItems([entry()], new Set(), ALL_REGISTERED);

    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("Silverstone");
    expect(items[0]!.detail).toBe("silverstone.idl1wb");
    expect(items[0]!.enabled).toBe(true);
  });

  it("recentWorkbookItems — a workbook whose file is gone — kept, disabled, and said so", () => {
    const items = recentWorkbookItems([entry()], new Set(["wb-1"]), ALL_REGISTERED);

    expect(items[0]!.enabled).toBe(false);
    expect(items[0]!.detail).toContain("Missing");
  });

  it("recentWorkbookItems — workbook.open unregistered — every row disabled", () => {
    const registered = new Set([...ALL_REGISTERED].filter((id) => id !== COMMAND_IDS.workbookOpen));

    const items = recentWorkbookItems([entry()], new Set(), registered);

    expect(items[0]!.enabled).toBe(false);
  });

  it("recentWorkbookItems — an empty list — no rows", () => {
    const items = recentWorkbookItems([], new Set(), ALL_REGISTERED);

    expect(items).toEqual([]);
  });
});

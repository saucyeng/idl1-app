import { describe, expect, it, vi } from "vitest";
import { COMMAND_IDS } from "./commandTiers";
import { helpPaletteCommands, tabSwitchCommands, tieredPaletteCommands } from "./commands";

describe("tabSwitchCommands", () => {
  it("tabSwitchCommands — one command per route, in ROUTES order", () => {
    const commands = tabSwitchCommands(() => {});

    expect(commands.map((c) => c.id)).toEqual(["nav:device", "nav:data", "nav:notebook", "nav:settings"]);
    expect(commands.every((c) => c.group === "Navigate")).toBe(true);
  });

  it("tabSwitchCommands — running a command navigates to its route", () => {
    const onNavigate = vi.fn();
    const commands = tabSwitchCommands(onNavigate);

    commands.find((c) => c.id === "nav:data")!.run();

    expect(onNavigate).toHaveBeenCalledWith("data");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("tieredPaletteCommands", () => {
  it("palette — a command with a registered handler — is listed under its tier's heading", () => {
    const available = new Set<string>([COMMAND_IDS.workbookSave, COMMAND_IDS.libraryRescan]);

    const commands = tieredPaletteCommands(available, () => undefined);

    expect(commands.map((command) => [command.label, command.group])).toEqual([
      ["Save", "Notebook"],
      ["Rescan library", "Notebook — more"],
    ]);
  });

  it("palette — a command nothing has registered — is absent, not an inert row", () => {
    const available = new Set<string>([COMMAND_IDS.workbookSave]);

    const commands = tieredPaletteCommands(available, () => undefined);

    expect(commands.map((command) => command.id)).toEqual([COMMAND_IDS.workbookSave]);
  });

  it("palette — the View dropdown root — is never an entry, having nothing to run", () => {
    const available = new Set<string>(Object.values(COMMAND_IDS));

    const commands = tieredPaletteCommands(available, () => undefined);

    expect(commands.map((command) => command.id)).not.toContain(COMMAND_IDS.viewMenu);
  });

  it("palette — running an entry — invokes that command's registry id", () => {
    const run = vi.fn();

    tieredPaletteCommands(new Set([COMMAND_IDS.workbookSave]), run)[0]?.run();

    expect(run).toHaveBeenCalledWith(COMMAND_IDS.workbookSave);
  });
});

describe("helpPaletteCommands", () => {
  it("helpPaletteCommands — the three R249 entries registered — listed under Help, in order", () => {
    const available = new Set<string>([
      COMMAND_IDS.helpWorkbookReference,
      COMMAND_IDS.helpCliReference,
      COMMAND_IDS.helpReleaseNotes,
    ]);

    const commands = helpPaletteCommands(available, () => undefined);

    expect(commands.map((command) => [command.label, command.group])).toEqual([
      ["Workbook reference", "Help"],
      ["CLI reference", "Help"],
      ["Release notes", "Help"],
    ]);
  });

  it("helpPaletteCommands — nothing registered — no entries", () => {
    const commands = helpPaletteCommands(new Set(), () => undefined);

    expect(commands).toEqual([]);
  });

  it("helpPaletteCommands — running an entry — invokes that command's registry id", () => {
    const run = vi.fn();

    helpPaletteCommands(new Set([COMMAND_IDS.helpCliReference]), run)[0]?.run();

    expect(run).toHaveBeenCalledWith(COMMAND_IDS.helpCliReference);
  });
});

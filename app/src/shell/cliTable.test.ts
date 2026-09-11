/**
 * The agreement test ruling R230 item 2 asks for: the app's command table
 * and the engine's must not disagree about a command they both name.
 *
 * "Both name" is the operative word. The two tables overlap rather than
 * match — the UI has `view.*` and `go.*` entries no CLI command corresponds
 * to, and the engine has `catalog.verify` with no button — so this checks
 * the intersection, and separately checks that the intersection is not
 * empty, which is what would silently happen if an id spelling drifted on
 * one side.
 */

import { describe, expect, it } from "vitest";

import { CLI_COMMANDS, CLI_TABLE, cliCommandById } from "./cliTable";
import { COMMAND_TIERS, commandById } from "./commandTiers";

/** The ids both tables name. */
function sharedIds(): string[] {
  return COMMAND_TIERS.map((entry) => entry.id).filter((id) => cliCommandById(id) !== undefined);
}

describe("cliTable — the checked-in copy — is the shape the engine emits", () => {
  it("cliTable — schema version — is the one R230 fixed", () => {
    const version = CLI_TABLE.schema_version;

    expect(version).toBe(1);
  });

  it("cliTable — nouns — are R230's closed vocabulary", () => {
    const nouns = CLI_TABLE.nouns;

    expect(nouns).toEqual(["session", "workbook", "track", "catalog", "library", "device", "docs"]);
  });

  it("cliTable — verbs — are R230's closed vocabulary", () => {
    const verbs = CLI_TABLE.verbs;

    expect(verbs).toEqual([
      "list",
      "show",
      "new",
      "check",
      "eval",
      "set",
      "import",
      "export",
      "scan",
      "fold-in",
      "index",
      "rebuild",
      "verify",
      "delete",
    ]);
  });

  it("cliTable — every command — uses a noun and a verb from the vocabularies", () => {
    const ruled = CLI_TABLE.verbs_ruled.map((entry) => entry.verb);

    const strays = CLI_COMMANDS.filter(
      (command) =>
        !CLI_TABLE.nouns.includes(command.noun) ||
        (!CLI_TABLE.verbs.includes(command.verb) && !ruled.includes(command.verb)),
    );

    expect(strays.map((command) => command.usage)).toEqual([]);
  });

  it("cliTable — every ruled verb — names the ruling that added it", () => {
    const unnamed = CLI_TABLE.verbs_ruled.filter((entry) => !entry.ruling.startsWith("R"));

    expect(unnamed).toEqual([]);
  });

  it("cliTable — every command id — is its noun and verb in camel case", () => {
    const mismatched = CLI_COMMANDS.filter((command) => {
      const camel = command.verb.replace(/-(.)/g, (_, c: string) => c.toUpperCase());
      return command.id !== `${command.noun}.${camel}`;
    });

    expect(mismatched.map((command) => command.id)).toEqual([]);
  });

  it("cliTable — every command — takes --json", () => {
    const without = CLI_COMMANDS.filter(
      (command) => !command.flags.some((flag) => flag.long === "json"),
    );

    expect(without.map((command) => command.usage)).toEqual([]);
  });

  it("cliTable — every writer — takes --dry-run", () => {
    const mismatched = CLI_COMMANDS.filter(
      (command) => command.writer !== command.flags.some((flag) => flag.long === "dry-run"),
    );

    expect(mismatched.map((command) => command.usage)).toEqual([]);
  });
});

describe("cliTable — agreement with the app's own command table", () => {
  it("shared ids — the two tables name at least one command in common", () => {
    const shared = sharedIds();

    // An empty intersection would mean an id spelling drifted on one side
    // and every other assertion here passed vacuously.
    expect(shared.length).toBeGreaterThan(0);
  });

  it("shared ids — workbook.new and library.rebuild are among them", () => {
    const shared = sharedIds();

    expect(shared).toContain("workbook.new");
    expect(shared).toContain("library.rebuild");
  });

  it("shared ids — the two tables agree on the tier", () => {
    const disagreements = sharedIds()
      .map((id) => ({ id, ui: commandById(id)?.tier, cli: cliCommandById(id)?.tier }))
      .filter((entry) => entry.ui !== entry.cli);

    expect(disagreements).toEqual([]);
  });

  it("shared ids — the engine's row is never a deprecated spelling", () => {
    const deprecated = sharedIds().filter((id) => cliCommandById(id)?.status === "deprecated");

    // A button must not be wired to a verb the engine is retiring.
    expect(deprecated).toEqual([]);
  });

  it("cliCommandById — an id the engine does not register — is undefined", () => {
    const row = cliCommandById("view.toggleSidebar");

    expect(row).toBeUndefined();
  });
});

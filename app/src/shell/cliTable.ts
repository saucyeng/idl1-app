/**
 * The engine's command table, as the app sees it (ruling R230 item 2).
 *
 * `cliTable.json` is generated — `idl-rs docs cli --json --out
 * app/src/shell/cliTable.json` — and checked in, the same arrangement
 * `docs/WORKBOOK-REFERENCE.md` already uses: CI regenerates it and fails on
 * a diff, so the copy in this repo cannot drift from the engine's own table.
 * Nothing here parses or validates it beyond the shapes below; the engine's
 * tests own its contents.
 *
 * This module exists so `commandTiers.ts` and the engine can be checked
 * against each other on the ids they share (`cliTable.test.ts`). It is
 * deliberately not wired into the ribbon: `commandTiers.ts` stays the UI's
 * table, because a UI command is not the same thing as a CLI command — the
 * UI has `view.*` entries with no CLI counterpart, and the CLI has
 * `catalog verify` with no button.
 *
 * It is also the seed of R228 item 2's agent tool schemas. Those are not
 * built yet.
 */

import table from "./cliTable.json";

/** How often a command is reached for. The same three values the Rust
 *  table's `Tier` serialises, and the same union as
 *  `commandTiers.ts`'s `CommandTier`. */
export type CliTier = "core" | "occasional" | "rare";

/** Whether a row is the current spelling or one kept for a release. */
export type CliStatus = "current" | "deprecated";

/** What a positional argument or a flag's value is. */
export type CliValueKind = "path" | "text" | "integer" | "choice";

/** One positional argument. */
export interface CliArg {
  name: string;
  kind: CliValueKind;
  required: boolean;
  repeatable: boolean;
  choices: readonly string[];
  help: string;
}

/** One long flag. `kind` is `null` for a boolean switch. */
export interface CliFlag {
  long: string;
  kind: CliValueKind | null;
  repeatable: boolean;
  choices: readonly string[];
  default: string | null;
  help: string;
}

/** One command. `id` is `noun.verbInCamelCase`, the spelling
 *  `commandTiers.ts` uses. */
export interface CliCommand {
  id: string;
  noun: string;
  verb: string;
  usage: string;
  help: string;
  tier: CliTier;
  status: CliStatus;
  core_fn: string;
  json_shape: string | null;
  data_dir: boolean;
  writer: boolean;
  args: readonly CliArg[];
  flags: readonly CliFlag[];
}

/** The whole generated table. */
export interface CliTable {
  schema_version: number;
  nouns: readonly string[];
  verbs: readonly string[];
  verbs_ruled: readonly { verb: string; ruling: string }[];
  commands: readonly CliCommand[];
}

/** The checked-in table. */
export const CLI_TABLE = table as unknown as CliTable;

/** Every command the engine registers, in table order. */
export const CLI_COMMANDS: readonly CliCommand[] = CLI_TABLE.commands;

/** `id`'s row, or `undefined` when the engine does not register it. */
export function cliCommandById(id: string): CliCommand | undefined {
  return CLI_COMMANDS.find((command) => command.id === id);
}

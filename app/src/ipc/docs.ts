import { invoke } from "@tauri-apps/api/core";

/**
 * The docs and agent group (C3 §3.10, ruling R222 items 1–3): the bundled
 * workbook reference, and "Ask an agent".
 *
 * One module per command group (C3 §1), same as every other `ipc/*` file:
 * nothing here holds state, and nothing here is called on the interaction
 * path — the reference is fetched when the Docs panel first opens, and the
 * terminal is spawned on a click.
 */

/** Reads the bundled `WORKBOOK-REFERENCE.md` (C3 §3.10).
 *
 *  Rejects with `not_found` when the reference is missing from the bundle,
 *  which is a packaging fault and should be shown as one — not silently
 *  rendered as an empty document. */
export async function readWorkbookReference(): Promise<string> {
  return invoke<string>("read_workbook_reference");
}

/** Reads the bundled `CLI-REFERENCE.md` (C3 §3.10, ruling R244/R249) — the
 *  second document the Docs panel can show, alongside
 *  {@link readWorkbookReference}, for `help.cliReference`.
 *
 *  Same failure shape as {@link readWorkbookReference}: `not_found` when
 *  the reference is missing from the bundle. */
export async function readCliReference(): Promise<string> {
  return invoke<string>("read_cli_reference");
}

/** What the agent is told it is looking at (C3 §3.10). Both fields are
 *  optional: the status-bar button has neither, the session detail has a
 *  session, and the code column has a workbook. */
export interface AgentContext {
  session_id?: string;
  workbook?: string;
}

/** Spawns the configured agent command in the user's terminal, with the
 *  working directory set to the `<data>` root and an initial prompt built
 *  in Rust (C3 §3.10, ruling R222 item 3).
 *
 *  Returns as soon as the terminal is started; the agent is the user's
 *  process from then on and nothing is piped back. Rejects with
 *  `invalid_argument` when no agent command is configured, and
 *  `unsupported_platform` on mobile. */
export async function openAgentTerminal(context: AgentContext = {}): Promise<void> {
  return invoke<void>("open_agent_terminal", { context });
}

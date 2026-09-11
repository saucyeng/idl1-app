import { useState } from "react";
import { Terminal } from "lucide-react";

import { cn } from "@/lib/utils";
import { openAgentTerminal, type AgentContext } from "../ipc/docs";

/**
 * "Ask an agent" (ruling R222 item 3): spawns the user's terminal in the
 * data root, running the configured agent command with a prompt naming what
 * the app was showing.
 *
 * One component, three placements — the code column, the Data tab's session
 * detail, and the status bar — differing only in the context they pass and
 * whether they show a label. The prompt itself is built in Rust, so the
 * three placements cannot word it differently.
 *
 * Nothing is piped back. Once the terminal is up it is the user's process,
 * and this button's only job after that is to stop showing a spinner.
 *
 * Not unit-tested (CLAUDE.md §4: UI rendering is not unit-tested); the
 * command it calls is covered on the Rust side.
 */

/** Props for {@link AskAnAgentButton}. */
export interface AskAnAgentButtonProps {
  /** What the agent is told it is looking at. Empty for the status bar. */
  context?: AgentContext;
  /** `"labelled"` shows the text beside the glyph; `"icon"` is the
   *  status-bar form, glyph only with the label as its tooltip. */
  variant?: "labelled" | "icon";
  /** Extra classes for the host's own spacing. */
  className?: string;
}

export default function AskAnAgentButton({ context = {}, variant = "labelled", className }: AskAnAgentButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await openAgentTerminal(context);
    } catch (e: unknown) {
      // Shown as a title rather than a toast: the failure modes are "no
      // agent command configured" and "this platform has no terminal to
      // spawn", both of which the user fixes in Settings, and neither of
      // which is worth taking over the screen for.
      setError(
        e !== null && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "The agent terminal could not be opened."
      );
    } finally {
      setBusy(false);
    }
  }

  const label = error ?? "Ask an agent";

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      title={label}
      aria-label="Ask an agent"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-structural)] px-1 text-label-2 disabled:opacity-50",
        error === null ? "text-fg-dim hover:text-fg" : "text-hivis",
        className
      )}
    >
      <Terminal aria-hidden size={13} strokeWidth={1.5} />
      {variant === "labelled" && <span>Ask an agent</span>}
    </button>
  );
}

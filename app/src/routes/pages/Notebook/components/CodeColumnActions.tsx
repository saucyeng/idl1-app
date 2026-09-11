import { BookOpen } from "lucide-react";

import AskAnAgentButton from "../../../../shell/AskAnAgentButton";
import { toggleDocs } from "../../../../shell/docsPanelStore";

/**
 * The code column's own two actions (ruling R222 items 2 and 3): "Docs",
 * which opens the bundled workbook reference in the sidebar, and "Ask an
 * agent", which spawns the user's terminal in the data root.
 *
 * They sit above the editor rather than inside it because CodeMirror owns
 * its own content DOM — a button rendered into the editor would be
 * something the editor believes is text.
 *
 * Not unit-tested (CLAUDE.md §4: UI rendering is not unit-tested).
 */

/** Props for {@link CodeColumnActions}. */
export interface CodeColumnActionsProps {
  /** The open workbook's path or id, passed to the agent as context. */
  workbook?: string;
}

export default function CodeColumnActions({ workbook }: CodeColumnActionsProps) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-b border-rule px-[var(--nb-pad)] py-1">
      <button
        type="button"
        onClick={() => toggleDocs()}
        title="Workbook reference (F1)"
        aria-label="Workbook reference"
        className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-structural)] px-1 text-label-2 text-fg-dim hover:text-fg"
      >
        <BookOpen aria-hidden size={13} strokeWidth={1.5} />
        <span>Docs</span>
      </button>
      <AskAnAgentButton context={workbook === undefined ? {} : { workbook }} />
    </div>
  );
}

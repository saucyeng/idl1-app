import { useMemo } from "react";
import * as icons from "lucide-react";

import { cn } from "@/lib/utils";
import AskAnAgentButton from "./AskAnAgentButton";
import { runCommand, useRegisteredCommands } from "./commandRegistry";
import { useDataRootPath } from "./dataRootPath";
import { readRecentWorkbooks } from "./recentWorkbooks";
import { welcomeContent, type WelcomeItem } from "./welcomeItems";

/**
 * The Welcome panel (ruling R244): what to do when there is nothing on
 * screen yet.
 *
 * Shown in three places, all rendering this one component:
 *
 * 1. **An empty dock** — Dockview's watermark slot (`DockFrame.tsx`).
 *    R244 supersedes the lead's same-day "the last panel is not closable":
 *    every panel may close, and what is behind them is this, never a
 *    blank.
 * 2. **No workbook open** — the Notebook panel's own content, portalled by
 *    `routes/pages/Notebook/index.tsx`, which otherwise rendered nothing
 *    at all until a workbook was picked.
 * 3. **Help ▸ Welcome** — the same panel in the shell's dialog
 *    (`AppShell.tsx`), for a user who dismissed it and wants it back.
 *
 * **It contains no logic.** Every row runs an existing command id, and
 * which rows exist is decided by the pure `welcomeItems.ts` — R244's own
 * rule, and the reason this component is not unit-tested (CLAUDE.md §4:
 * UI rendering is not unit-tested; the decisions are, next door).
 *
 * Not `#[tauri::command]`-adjacent in any way: nothing here touches the
 * filesystem or the network, so R201 has nothing to bite on. The one
 * exception is "Ask an agent", which is the existing
 * {@link AskAnAgentButton} component with its own async handling and busy
 * state — embedded rather than reimplemented, so it cannot word its prompt
 * differently from the other three places it already appears.
 */

/** Props for {@link WelcomePanel}. */
export interface WelcomePanelProps {
  /** Extra classes for the host's own sizing — the watermark, the
   *  Notebook panel's slot and the dialog frame it differently. */
  className?: string;
}

/** One `lucide-react` component by name, or a neutral dot for a name this
 *  build does not have. Resolved here rather than in `welcomeItems.ts` so
 *  that module stays free of `react` (`commandTiers.ts`'s own split). */
function Glyph({ name }: { name: string }) {
  const Component = (icons as unknown as Record<string, icons.LucideIcon | undefined>)[name] ?? icons.Circle;
  return <Component className="size-4 shrink-0" aria-hidden />;
}

/** One clickable row. Disabled rows stay on the page and say why, which is
 *  R220 item 1's convention for a capability that exists but cannot run
 *  right now. */
function WelcomeRow({ item }: { item: WelcomeItem }) {
  return (
    <button
      type="button"
      disabled={!item.enabled}
      title={item.enabled ? (item.detail ?? item.label) : "Not available right now."}
      onClick={() => runCommand(item.command)}
      className={cn(
        "flex w-full items-start gap-2 rounded-[var(--radius-structural)] px-2 py-1.5 text-left",
        "hover:bg-control-active disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
      )}
    >
      <span className="mt-0.5 text-fg-dim">
        <Glyph name={item.icon} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body-small text-fg">{item.label}</span>
        {item.detail !== null && <span className="block truncate font-mono text-label-2 text-fg-faint">{item.detail}</span>}
      </span>
    </button>
  );
}

export default function WelcomePanel({ className }: WelcomePanelProps) {
  const registered = useRegisteredCommands();
  const dataRootPath = useDataRootPath();

  // Read once per registry change rather than subscribed: the list only
  // grows when a workbook is opened, and opening one replaces this panel
  // with the notebook it opened. `registered` is in the dependency array
  // because it changes when the Notebook page (re)registers its commands,
  // which is the moment a freshly opened workbook would have landed.
  const recent = useMemo(() => readRecentWorkbooks(), [registered]);

  // No missing-file check is issued from here: `exists` would be a new
  // filesystem round trip per row on every render of an idle panel, and
  // R244 scopes the panel to existing commands. A row is greyed when the
  // caller already knows the file is gone; nothing does yet, so the set is
  // empty and every recent row is live. Stated rather than silently
  // dropped (CLAUDE.md §1).
  const content = useMemo(
    () => welcomeContent({ registered, recent, missingIds: new Set<string>(), dataRootPath }),
    [registered, recent, dataRootPath]
  );

  return (
    <div className={cn("h-full overflow-auto bg-bg p-6", className)}>
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h1 className="text-body text-fg">idl1</h1>
          <p className="font-mono text-label-2 text-fg-faint">Open a workbook, or bring some sessions in.</p>
        </header>

        {content.sections.map((section) => (
          <section key={section.id} className="flex flex-col gap-1">
            <h2 className="font-mono text-label-2 uppercase tracking-wide text-fg-dim">{section.label}</h2>
            {section.items.map((item) => (
              <WelcomeRow key={item.id} item={item} />
            ))}
            {section.id === "learn" && <AskAnAgentButton className="self-start" />}
          </section>
        ))}

        {content.dataRootPath !== null && (
          <footer className="border-t border-rule pt-3">
            <p className="font-mono text-label-2 text-fg-faint">
              Library: <span className="text-fg-dim">{content.dataRootPath}</span>
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}

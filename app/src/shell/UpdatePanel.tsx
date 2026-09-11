import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { checkForUpdate, downloadAndInstallUpdate, relaunchApp } from "../ipc/updater";
import { parseReleaseNotes, type InlineNode, type ReleaseNotesBlock } from "./releaseNotesMarkdown";
import { closeUpdatePanel, dismissUpdate, restartToUpdate, useUpdatePanelOpen, useUpdateState } from "./updateState";

/** Renders one inline run — bold and code spans get their tag, plain text
 *  passes through untouched (never `dangerouslySetInnerHTML`: the source is
 *  a remote release body, and JSX text nodes are escaped for free). */
function Inline({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.kind === "bold") return <strong key={i}>{node.text}</strong>;
        if (node.kind === "code") return <code key={i} className="rounded-[var(--radius-structural)] bg-surface-2 px-1 font-mono text-label-3">{node.text}</code>;
        return <span key={i}>{node.text}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: ReleaseNotesBlock }) {
  if (block.kind === "heading") {
    const Tag = block.level === 2 ? "h3" : "h4";
    return (
      <Tag className="mt-3 font-mono text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase first:mt-0">
        <Inline nodes={block.inline} />
      </Tag>
    );
  }
  if (block.kind === "list") {
    return (
      <ul className="list-disc space-y-0.5 pl-5 text-label-2 text-fg">
        {block.items.map((item, i) => (
          <li key={i}>
            <Inline nodes={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p className="text-label-2 text-fg">
      <Inline nodes={block.inline} />
    </p>
  );
}

/**
 * The release-notes panel the status bar's "Update available · vX" item
 * opens (ruling R231, item 2 of the brief): the release body rendered as
 * Markdown, "Restart to update" (download with progress, install, relaunch)
 * and "Later".
 *
 * Built on the app's existing `Dialog` primitive rather than the R220
 * sidebar (whose panels are one per activity, published through
 * `sidebarSlot.ts` and keyed to `RouteId`) — a fifth, non-navigational
 * sidebar entry would mean widening that contract for one transient
 * notice. Disclosed lane-local decision (updater brief, R231).
 */
export default function UpdatePanel() {
  const state = useUpdateState();
  const panelOpen = useUpdatePanelOpen();
  const open = panelOpen && (state.kind === "available" || state.kind === "downloading" || state.kind === "ready");

  // `downloading`/`ready` carry no `version`/`notes` of their own — the
  // panel keeps the last `available` snapshot so the release notes stay on
  // screen through the download rather than blanking the moment "Restart
  // to update" is clicked.
  const [snapshot, setSnapshot] = useState<{ version: string; notes: string } | null>(null);
  useEffect(() => {
    if (state.kind === "available") setSnapshot({ version: state.version, notes: state.notes });
    else if (state.kind === "idle") setSnapshot(null);
  }, [state]);

  if (!open) return null;

  const blocks = parseReleaseNotes(snapshot?.notes ?? "");
  const version = snapshot?.version ?? null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) closeUpdatePanel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{version !== null ? `Update available — v${version}` : "Update"}</DialogTitle>
          <DialogDescription>Release notes</DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {blocks.length === 0 ? (
            <p className="text-label-2 text-fg-dim">No release notes.</p>
          ) : (
            blocks.map((block, i) => <Block key={i} block={block} />)
          )}
        </div>

        {state.kind === "downloading" && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-1 flex-1 bg-surface-2">
              <span className="block h-full bg-good" style={{ width: `${state.pct}%` }} />
            </span>
            <span className="font-mono text-label-3 text-fg-dim">{state.pct}%</span>
          </div>
        )}

        {state.kind === "ready" && <p className="text-label-2 text-good">Installed — relaunching…</p>}

        <div className="flex justify-end gap-2">
          {state.kind === "available" && (
            <>
              <button
                type="button"
                onClick={dismissUpdate}
                className={cn("rounded-[var(--radius-structural)] px-3 py-1.5 text-label-2 text-fg-dim hover:bg-surface-2")}
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void restartToUpdate({ checkForUpdate, downloadAndInstallUpdate, relaunchApp })}
                className={cn("rounded-[var(--radius-structural)] bg-fg px-3 py-1.5 text-label-2 text-bg hover:opacity-90")}
              >
                Restart to update
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

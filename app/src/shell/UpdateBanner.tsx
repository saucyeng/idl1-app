import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "../components/ui/button";
import { installUpdate, relaunchApp } from "../ipc/updater";
import { openUpdateLink } from "./openUpdateLink";
import { dismissUpdate, openUpdatePanel, restartToUpdate, useUpdateState, versionLabel } from "./updateState";

/**
 * The narrow layout's update notice (2026-10-15): the status bar's
 * "Update available" chip, folded in above the bottom tab bar the same way
 * `BottomBar.tsx` folds the rest of the status bar into its badges. Shown
 * while a release the user downloads is `available` ("Download") and while
 * an in-place update is `ready` ("Restart", 2026-10-26); the label opens
 * the release notes, × is "Later" for this session.
 */
export default function UpdateBanner() {
  const state = useUpdateState();
  // × on a `ready` update hides the banner for this session without
  // dropping the download: "Restart to update" stays in the release notes.
  const [readyHidden, setReadyHidden] = useState(false);
  const link = state.kind === "available" ? state.link : undefined;
  if (!(state.kind === "ready" && !readyHidden) && link === undefined) return null;

  return (
    <div
      className="shell-chrome flex shrink-0 items-center gap-2 border-t border-hivis bg-surface py-2 pr-1 pl-4"
      role="status"
    >
      <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={openUpdatePanel}>
        <span className="truncate text-sm font-medium text-fg">
          {state.kind === "available" ? `Update available · ${versionLabel(state.version)}` : "Update ready"}
        </span>
        <span className="text-xs text-fg-dim underline">What&apos;s new</span>
      </button>
      {link !== undefined && (
        <Button type="button" emphasis="info" filled className="h-10 px-4" onClick={() => openUpdateLink(link)}>
          Download
        </Button>
      )}
      {state.kind === "ready" && (
        <Button type="button" emphasis="info" filled className="h-10 px-4" onClick={() => void restartToUpdate({ installUpdate, relaunchApp })}>
          Restart
        </Button>
      )}
      <button
        type="button"
        aria-label="Later"
        className="flex size-[var(--hit-target)] shrink-0 items-center justify-center text-fg-dim"
        onClick={() => (state.kind === "ready" ? setReadyHidden(true) : dismissUpdate())}
      >
        <X aria-hidden size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

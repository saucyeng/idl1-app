import { X } from "lucide-react";

import { Button } from "../components/ui/button";
import { openUpdateLink } from "./openUpdateLink";
import { dismissUpdate, openUpdatePanel, useUpdateState, versionLabel } from "./updateState";

/**
 * The narrow layout's update notice (2026-10-15): the status bar's
 * "Update available" chip, folded in above the bottom tab bar the same way
 * `BottomBar.tsx` folds the rest of the status bar into its badges. Shown
 * only while an update is `available`; the label opens the release notes,
 * "Download" fetches it, × is "Later" for this session.
 */
export default function UpdateBanner() {
  const state = useUpdateState();
  if (state.kind !== "available") return null;
  const link = state.link;

  return (
    <div
      className="shell-chrome flex shrink-0 items-center gap-2 border-t border-hivis bg-surface py-2 pr-1 pl-4"
      role="status"
    >
      <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={openUpdatePanel}>
        <span className="truncate text-sm font-medium text-fg">Update available · {versionLabel(state.version)}</span>
        <span className="text-xs text-fg-dim underline">What&apos;s new</span>
      </button>
      {link !== undefined && (
        <Button type="button" emphasis="info" filled className="h-10 px-4" onClick={() => openUpdateLink(link)}>
          Download
        </Button>
      )}
      <button
        type="button"
        aria-label="Later"
        className="flex size-[var(--hit-target)] shrink-0 items-center justify-center text-fg-dim"
        onClick={dismissUpdate}
      >
        <X aria-hidden size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}

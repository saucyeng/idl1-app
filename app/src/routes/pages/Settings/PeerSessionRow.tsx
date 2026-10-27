import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { PeerSessionRowModel } from "./peerLibraryView";

/** Props for {@link PeerSessionRow}. */
export interface PeerSessionRowProps {
  /** The session to draw, already formatted. */
  row: PeerSessionRowModel;
  /** Whether the row's checkbox is ticked. */
  checked: boolean;
  /** Called when the checkbox is toggled; never called for a non-selectable row. */
  onToggle: () => void;
}

/** One session of a peer's library: date and time, venue, rider, duration,
 *  size, here-status and a checkbox. It knows only its row and status, not the
 *  panel around it, so a later inline Data-list view can draw the same row
 *  greyed with a Pull action. A "same" row's checkbox is disabled. */
export function PeerSessionRow({ row, checked, onToggle }: PeerSessionRowProps) {
  return (
    <div className={cn("flex items-center gap-3 border-b border-rule px-3 py-1.5", !row.selectable && "opacity-60")}>
      <Checkbox
        checked={checked}
        disabled={!row.selectable}
        onCheckedChange={onToggle}
        aria-label={`Select session from ${row.dateText} ${row.timeText}`}
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-sm text-fg">
          {row.dateText} {row.timeText}
        </span>
        <span className="truncate font-mono text-xs text-fg-dim">
          {row.venueText} · {row.riderText} · {row.durationText}
        </span>
      </div>
      <span className="shrink-0 font-mono text-xs text-fg-dim">{row.sizeText}</span>
      <span
        className={cn(
          "w-20 shrink-0 text-right font-mono text-xs",
          row.here === "same" ? "text-good" : row.here === "differs" ? "text-brand-accent" : "text-fg-dim",
        )}
      >
        {row.hereText}
      </span>
    </div>
  );
}

import { pendingSlotHeightPx } from "../model/pendingSlotHeight";

/** Props for {@link CellPendingSlot}. */
export interface CellPendingSlotProps {
  /** This cell's `ScannedCell.kind` — decides the reserved height
   *  (`model/pendingSlotHeight.ts`), nothing else. */
  kind: string;
}

/**
 * The slot a cell occupies before its first output arrives (ruling R250,
 * the spec's §1.1) — replacing the one-line `…` that made a freshly opened
 * workbook a column of ellipses.
 *
 * Deliberately says **nothing**. The state and its one line are drawn over
 * this by `CellFrame`'s own state overlay, which is the single place a
 * cell's state is rendered in either chrome; a skeleton with its own text
 * would be a second, competing answer to the same question.
 *
 * Static, with no shimmer: the page may hold dozens of these at once while
 * a session opens, an animation per slot is exactly the interaction-path
 * cost CLAUDE.md §3 forbids, and a moving skeleton beside a determinate
 * ring says "something is happening here" about the one part of the frame
 * where nothing is.
 */
export default function CellPendingSlot({ kind }: CellPendingSlotProps) {
  return (
    <div
      className="w-full rounded-[var(--radius-card)] border border-rule bg-surface-2/40"
      style={{ height: pendingSlotHeightPx(kind) }}
      aria-hidden="true"
    />
  );
}

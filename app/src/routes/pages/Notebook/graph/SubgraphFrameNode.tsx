import { useState, type MouseEvent } from "react";
import { type Node, type NodeProps } from "@xyflow/react";

import type { SubgraphFrame } from "../model/graphSubgraphFrame";

/** `SubgraphFrameNode`'s own `data` shape. */
export interface SubgraphFrameData extends Record<string, unknown> {
  frame: SubgraphFrame;
  /** Fired when the frame's own header disclosure is clicked — collapses
   *  the cell (decision 43's KiCad-subsheet close gesture). */
  onCollapse: (cellId: string) => void;
  /** What the frame titles itself with: the cell's `# label:`, else
   *  `"Cell N"` by document order (`cellDisplayName.ts`, R214 item 2). The
   *  bare `hex8` id never appears here — it is the title's tooltip instead. */
  displayName: string;
  /** Whether a double-click on the title may rename this cell — true only
   *  for a `math` cell, whose body takes a `# label:` comment line (R214
   *  item 2). A `js` or `table` cell keeps its display name read-only. */
  renameable: boolean;
  /** Fired with `(cellId, label)` once a rename commits. */
  onRename: (cellId: string, label: string) => void;
  /** Fired when the frame title is clicked — selects this cell everywhere
   *  (R214 item 3: the code column scrolls to it and bands its range). */
  onSelect: (cellId: string) => void;
  /** True when this cell is the Notebook's currently selected one. */
  selected: boolean;
}

/**
 * The KiCad-subsheet boundary box for one expanded math cell (decision 43):
 * a labelled rectangle drawn behind the cell's own member cards, sized by
 * `model/graphSubgraphFrame.ts`'s pure `subgraphFrameFor`. Rendered as an
 * ordinary xyflow node with `zIndex: -1` (`GraphCanvas.tsx` sets this) so
 * it sits behind every real card without needing a parent/child node
 * relationship. Pointer events pass through everywhere except the header
 * label, which is the click target for selecting, renaming and collapsing.
 *
 * The title is R214 item 2's display name — `# label:` else "Cell N", with
 * the `hex8` id demoted to a tooltip; a double-click on it (on a `math`
 * cell) edits that label in place and commits through `onRename`, which
 * writes the `# label:` line via the ordinary cell-edit path. Rendering
 * only; not unit-tested (CLAUDE.md §4) — the geometry is tested on
 * `subgraphFrameFor` and the naming on `cellDisplayName.ts`.
 */
export default function SubgraphFrameNode({ data }: NodeProps<Node<SubgraphFrameData, "subgraphFrame">>) {
  const { frame, onCollapse, displayName, renameable, onRename, onSelect, selected } = data;

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(displayName);

  function startRename(e: MouseEvent): void {
    if (!renameable) return;
    e.stopPropagation();
    setDraft(displayName);
    setRenaming(true);
  }

  function commitRename(): void {
    setRenaming(false);
    if (draft.trim() === displayName) return; // unchanged — no write, same no-op rule every other inline edit in this lane follows
    onRename(frame.cellId, draft);
  }

  return (
    <div
      style={{ width: frame.width, height: frame.height, pointerEvents: "none" }}
      className={`rounded-[var(--radius-card)] border border-dashed ${selected ? "border-hivis" : "border-rule"}`}
    >
      <div style={{ pointerEvents: "auto" }} className="-mt-[1px] ml-2 flex w-fit -translate-y-1/2 items-center gap-1 rounded-[var(--radius-structural)] border border-rule bg-surface px-2 py-0.5 text-label-2">
        <button type="button" onClick={(e) => { e.stopPropagation(); onCollapse(frame.cellId); }} aria-label="Collapse this cell" className="text-fg-faint hover:text-fg">
          ▾
        </button>
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") setRenaming(false);
            }}
            size={Math.max(6, draft.length)}
            className="rounded-[var(--radius-structural)] border border-rule bg-control px-1 text-label-2 text-fg"
          />
        ) : (
          <button
            type="button"
            title={renameable ? `${frame.cellId} — double-click to rename` : frame.cellId}
            onClick={(e) => { e.stopPropagation(); onSelect(frame.cellId); }}
            onDoubleClick={startRename}
            className="text-fg-dim hover:text-fg"
          >
            {displayName}
          </button>
        )}
      </div>
    </div>
  );
}

import type { MouseEvent, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { NoteBlock } from "@/components/brand/NoteBlock";
import { StatusDot } from "@/components/brand/StatusDot";
import type { ScannedCell } from "../model/cells";

/** This cell's run state, for {@link CellFrame}'s `StatusDot` — `"pending"`
 *  before an `eval_workbook` result has arrived for it, `"error"` when it
 *  has one and it failed, `"ok"` otherwise. `Notebook/index.tsx` derives
 *  this from `state.outputs`/`cellErrors`/`fftErrors`; `CellFrame` only
 *  renders whichever value it is given. */
export type CellRunStatus = "pending" | "ok" | "error";

/** Tailwind text-colour utility for each {@link CellRunStatus} — pending
 *  reads as inactive (`--fg-faint`), ok as `--good`, error as `--accent`
 *  (the brand alert colour), matching every other status dot in the app. */
const STATUS_DOT_CLASS: Record<CellRunStatus, string> = {
  pending: "text-fg-faint",
  ok: "text-good",
  error: "text-accent",
};

/** Props for {@link CellFrame}. */
export interface CellFrameProps {
  /** This cell's non-authoritative scan record (`model/cells.ts`) — read
   *  for its `id` (`data-cell-id`) and `kind` (the kicker). `CellFrame`
   *  never re-derives or re-renders a cell's output itself, that is
   *  `children`. */
  cell: ScannedCell;
  /** This cell's 0-based position in document order — the kicker falls
   *  back to `"{KIND} · {index+1}"` since a `ScannedCell` carries no name
   *  of its own (C2 §2.2 has no cell-name attribute). */
  index: number;
  /** Whether this is the currently open cell (`Notebook/index.tsx`'s
   *  `selectedCellId`, Task 13's own selection state — `CellFrame` keeps
   *  no selection state of its own, per the brief's "one source of truth"
   *  rule). */
  selected: boolean;
  /** Fired on click. `Notebook/index.tsx` decides what selecting this cell
   *  means (including doing nothing for a cell whose scan found no `id` —
   *  see its own call site's doc comment); this component only reports the
   *  gesture. */
  onSelect: () => void;
  /** This cell's run state (UI-DIRECTION "Notebook": a `StatusDot` per
   *  cell). */
  status: CellRunStatus;
  /** This cell's error message, shown as an in-place `NoteBlock` when
   *  `status === "error"`. `undefined` renders nothing even if `status` is
   *  `"error"` (a sandbox `cellError` with no message text is not expected
   *  in practice, but this component does not assume one exists). */
  error?: string;
  /** Whether this cell's source is currently revealed (decision 30) —
   *  `model/codeVisibility.ts`'s `isCodeVisible`; `CellFrame` keeps no
   *  revealed-code state of its own. */
  codeVisible: boolean;
  /** Fired when the code-toggle button is clicked. Does not also select
   *  the cell — the two are independent gestures (`handleToggle` below
   *  stops the click from bubbling into `onSelect`). */
  onToggleCode: () => void;
  /** This cell's decoded source text, shown in place above `children` while
   *  `codeVisible` — `undefined` (e.g. a cell whose scan found no id, so no
   *  body could be decoded) hides the toggle button entirely, since there
   *  would be nothing for it to reveal. */
  code?: string;
  /** This cell's already-rendered output — `CellList.tsx`'s per-kind
   *  renderer (`MathCell`/`TableCell`/the injected `renderJsCell`) or its
   *  pending placeholder. `CellFrame` only adds the selection chrome
   *  around it; it never builds this itself. */
  children: ReactNode;
}

/**
 * The per-cell chrome mounted through `CellList.tsx`'s `frame` hook
 * (Task 15, ruling R74; restyled UI-10): an uppercase tracked kicker, a
 * `StatusDot` for this cell's run state, a code-reveal toggle (decision 30)
 * and a click affordance that opens this cell in the editor shell
 * (`EditorPanes`) — wrapping whatever `CellList` already rendered for this
 * cell so every kind (math/table/js alike) is selectable, not only `js`
 * cells. The selected state shows as a `--surface-2` fill plus the app's
 * reserved 3 px `--good` inset bar (the same selection-bar convention the
 * Data tab's session table uses). An error surfaces as an in-place
 * `NoteBlock`, never a banner or toast (R66/R78 — span errors are a
 * separate, narrower concept this component does not touch).
 */
export default function CellFrame({
  cell,
  index,
  selected,
  onSelect,
  status,
  error,
  codeVisible,
  onToggleCode,
  code,
  children,
}: CellFrameProps) {
  const kicker = `${cell.kind.toUpperCase()} · ${String(index + 1).padStart(2, "0")}`;

  function handleToggleCode(e: MouseEvent): void {
    e.stopPropagation();
    onToggleCode();
  }

  return (
    <div
      className={`flex flex-col gap-2 border-l-[3px] px-4 py-3 ${selected ? "border-good bg-surface-2" : "border-transparent"}`}
      data-cell-id={cell.id ?? undefined}
      data-selected={selected}
      data-register-cell=""
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-medium tracking-[var(--tracking-kicker)] text-fg-dim uppercase">{kicker}</span>
        <div className="flex items-center gap-3">
          <StatusDot className={STATUS_DOT_CLASS[status]}>{status}</StatusDot>
          {code !== undefined && (
            <Button type="button" size="xs" emphasis="normal" onClick={handleToggleCode} aria-pressed={codeVisible}>
              {codeVisible ? "Hide code" : "Show code"}
            </Button>
          )}
        </div>
      </div>
      {codeVisible && code !== undefined && (
        <pre className="overflow-x-auto rounded-[var(--radius-card)] border border-rule bg-control p-3 font-mono text-xs text-fg">
          {code}
        </pre>
      )}
      {children}
      {status === "error" && error !== undefined && (
        <NoteBlock className="border-accent text-accent">{error}</NoteBlock>
      )}
    </div>
  );
}

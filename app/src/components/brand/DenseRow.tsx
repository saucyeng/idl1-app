import * as React from "react"
import { cn } from "@/lib/utils"

/** idl0's `DenseRow`/`TableHeader` pair: a 6 px vertical rhythm
 *  (`--row-rhythm`) flex row of caller-sized cells, with the reserved 3 px
 *  inset selection bar (a permanent `border-left` so its width never shifts
 *  layout — transparent when unselected, `--good` when selected). Cells are
 *  the caller's own children; this only supplies the row rhythm, the
 *  hover/selected surface, and the bar. */
export function DenseRow({
  selected = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { selected?: boolean }) {
  return (
    <div
      data-selected={selected}
      className={cn(
        "flex items-center gap-2 border-l-[3px] border-l-transparent py-[var(--row-rhythm)] transition-colors hover:bg-surface-2 data-[selected=true]:border-l-good data-[selected=true]:bg-surface-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/** The header row above a `DenseRow` list: same reserved bar gutter (kept
 *  transparent, never selectable) so its cells align with the rows below. */
export function TableHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b border-l-[3px] border-b-rule border-l-transparent py-[var(--row-rhythm)] font-mono text-xs font-medium tracking-[var(--tracking-label)] text-fg-dim uppercase",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

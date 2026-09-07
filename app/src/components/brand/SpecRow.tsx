import * as React from "react"
import { cn } from "@/lib/utils"

/** idl0's `SpecRow`: NATOPS-style `KEY .... VALUE`. The leader dots are a
 *  `repeating-radial-gradient` on the flexible middle element (brief Open
 *  question 2's recommendation) rather than idl0's `CustomPaint` — exact
 *  alignment parity with idl0 is not required. */
export function SpecRow({
  label,
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className={cn("flex items-baseline gap-2 font-mono text-sm", className)} {...props}>
      <span className="shrink-0 text-fg-dim">{label}</span>
      <span
        aria-hidden
        className="h-[3px] flex-1 self-end"
        style={{
          backgroundImage:
            "repeating-radial-gradient(circle at 1px 1px, var(--fg-faint) 0 1px, transparent 1px 6px)",
        }}
      />
      <span className="shrink-0 text-fg">{value}</span>
    </div>
  )
}

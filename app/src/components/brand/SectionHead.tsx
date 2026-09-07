import * as React from "react"
import { cn } from "@/lib/utils"

/** idl0's `MinimalSectionHead`: an uppercase tracked kicker with a hairline
 *  rule running to the right edge, and an optional flush-right trailing
 *  slot. The default header on every tab. */
export function SectionHead({
  children,
  trailing,
  className,
  ...props
}: React.ComponentProps<"div"> & { trailing?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-3", className)} {...props}>
      <span className="shrink-0 font-mono text-xs font-medium tracking-[var(--tracking-kicker)] text-fg-dim uppercase">
        {children}
      </span>
      <span aria-hidden className="h-px flex-1 bg-rule" />
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  )
}

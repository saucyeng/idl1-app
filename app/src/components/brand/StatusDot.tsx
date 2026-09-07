import * as React from "react"
import { cn } from "@/lib/utils"

/** idl0's `StatusDot`: `● LABEL`. Colour is owned by the call site (pass a
 *  text-colour class, e.g. `text-good`) — this component carries no
 *  semantic colour of its own. */
export function StatusDot({
  children,
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-sm", className)} {...props}>
      <span aria-hidden>●</span>
      <span>{children}</span>
    </span>
  )
}

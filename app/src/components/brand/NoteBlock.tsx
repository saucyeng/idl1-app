import * as React from "react"
import { cn } from "@/lib/utils"

/** idl0's `NoteBlock`: a 1 px left-rule callout whose colour carries
 *  semantics (pass a `border-*`/`text-*` pair, e.g. `border-accent
 *  text-accent` for an error, `border-info text-info` for an info note). No
 *  default colour is applied here — the call site owns it. */
export function NoteBlock({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("border-l pl-3 py-1 font-mono text-sm text-fg-dim", className)}
      {...props}
    >
      {children}
    </div>
  )
}

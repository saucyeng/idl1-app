import * as React from "react"
import { cn } from "@/lib/utils"

/** idl0's `PulsingDot`: a ~0.9 s opacity pulse, the recording dash light —
 *  one of idl0's two permitted animations (UI-DIRECTION decision 18).
 *  Colour is `currentColor`, owned by the call site. */
export function PulsingDot({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 rounded-full bg-current animate-pulse-dot", className)}
      {...props}
    />
  )
}

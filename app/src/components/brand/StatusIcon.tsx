import * as React from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

/** idl0's `StatusIcon`: icon + label + an optional short value, used in the
 *  Device tab's status strip. Colour is `currentColor`, owned by the call
 *  site (wrap in a `text-*` class for semantic colour). */
export function StatusIcon({
  icon: Icon,
  label,
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & { icon: LucideIcon; label: React.ReactNode; value?: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-1.5 font-mono text-xs text-fg-dim", className)} {...props}>
      <Icon className="size-3.5" aria-hidden />
      <span>{label}</span>
      {value !== undefined && <span className="text-fg">{value}</span>}
    </div>
  )
}

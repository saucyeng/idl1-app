import * as React from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

/** idl0's `IconBtn`: a single icon-only button at the interactive radius,
 *  meant for use inside a `ToolGroup`. */
export function IconBtn({
  icon: Icon,
  label,
  className,
  ...props
}: React.ComponentProps<"button"> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center text-fg-dim outline-none transition-colors hover:bg-control-active hover:text-fg disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className
      )}
      {...props}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

/** idl0's `ToolGroup`: a segmented icon cluster (New / Duplicate / Import /
 *  Export, …) — a hairline-bordered row of `IconBtn`s with dividers. */
export function ToolGroup({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      className={cn(
        "inline-flex items-center overflow-hidden rounded-[var(--radius)] border border-rule [&>button]:border-l [&>button]:border-l-rule [&>button:first-child]:border-l-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

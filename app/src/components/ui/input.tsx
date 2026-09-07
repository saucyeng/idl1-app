import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[var(--radius)] border border-rule bg-control px-3 py-1 font-mono text-sm text-fg outline-none transition-colors placeholder:text-fg-faint disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "aria-invalid:border-brand-accent",
        className
      )}
      {...props}
    />
  )
}

export { Input }

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"
import { X } from "lucide-react"

/** `BrandChip` (FLUTTER-UI-SURVEY §7): a mono pill, optionally with a
 *  trailing `×` for removable filter/compare chips. Structural radius is
 *  fully round (a pill), colour is the caller's — no default variant
 *  carries semantic meaning of its own. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-rule bg-control px-2 py-0.5 font-mono text-xs whitespace-nowrap text-fg [&>svg]:pointer-events-none [&>svg]:size-3"
)

function Badge({
  className,
  asChild = false,
  onRemove,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /** Present ⇒ render a trailing `×` that calls this on click/Enter. */
    onRemove?: () => void
  }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp data-slot="badge" className={cn(badgeVariants(), className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          data-slot="badge-remove"
          aria-label="Remove"
          onClick={onRemove}
          className="ml-0.5 inline-flex size-3 items-center justify-center rounded-full text-fg-dim outline-none hover:text-fg focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <X className="size-3" />
        </button>
      )}
    </Comp>
  )
}

export { Badge, badgeVariants }

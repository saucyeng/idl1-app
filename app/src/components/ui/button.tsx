import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

import { emphasisClasses, type Emphasis } from "@/components/brand/emphasis"

/** Structural classes only (radius, sizing, focus ring) — colour comes from
 *  `emphasisClasses` (UI-DIRECTION "Component approach": button variants
 *  map to `ButtonEmphasis`; filled-normal is the one primary action per
 *  screen). */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Button({
  className,
  emphasis = "normal",
  filled = false,
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** idl0's `ButtonEmphasis` (FLUTTER-UI-SURVEY §7). */
    emphasis?: Emphasis
    /** Filled or outline family (idl0's `QuietButton` two families). */
    filled?: boolean
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-emphasis={emphasis}
      data-filled={filled}
      className={cn(buttonVariants({ size }), emphasisClasses(emphasis, filled), className)}
      {...props}
    />
  )
}

export { Button, buttonVariants }

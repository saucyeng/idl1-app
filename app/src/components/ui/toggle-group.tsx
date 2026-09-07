"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"

import { toggleVariants } from "@/components/ui/toggle"

/** `BrandSegmented` (FLUTTER-UI-SURVEY §7): a hairline-bordered mutually
 *  exclusive row, `--control` resting / `--control-active` selected, with a
 *  `tight` toolbar density that drops the row's height and padding. */
const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    density?: "default" | "tight"
  }
>({
  size: "default",
  density: "default",
})

function ToggleGroup({
  className,
  size,
  density = "default",
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants> & {
    density?: "default" | "tight"
  }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-size={size}
      data-density={density}
      className={cn(
        "group/toggle-group flex w-fit items-center overflow-hidden rounded-[var(--radius)] border border-rule",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size, density }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)
  const density = context.density ?? "default"

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-size={context.size || size}
      data-density={density}
      className={cn(
        toggleVariants({ size: context.size || size }),
        "w-auto min-w-0 shrink-0 rounded-none border-l border-l-rule first:border-l-0 focus:z-10 focus-visible:z-10",
        density === "tight" && "h-7 px-1.5 text-xs",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }

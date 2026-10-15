"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { sheetSideFor, type SheetSide } from "@/components/overlays/sheetSide"

/** Tracks which edge the sheet should dock to as the window is resized.
 *  Width-dependent layout lives in the pure `sheetSideFor`; this hook is
 *  only the resize listener that reads it (no IPC, no fetch). */
function useSheetSide(): SheetSide {
  const [side, setSide] = React.useState<SheetSide>(() =>
    sheetSideFor(typeof window === "undefined" ? 1024 : window.innerWidth)
  )

  React.useEffect(() => {
    const onResize = () => setSide(sheetSideFor(window.innerWidth))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return side
}

export interface BrandSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Title row content, next to the built-in `×` close control. */
  title: React.ReactNode
  /** Scrollable body content. */
  children: React.ReactNode
  /** Optional pinned footer CTA, shown below a hairline rule. */
  footer?: React.ReactNode
  className?: string
}

/** idl0's `BrandSheet` (`FLUTTER-UI-SURVEY.md` §7): a title row with a
 *  close control, a hairline rule, a scrollable body, and an optional
 *  pinned footer CTA. Docks bottom on narrow viewports and right on wide
 *  ones (`sheetSideFor`) — the same breakpoint the toaster uses. A thin
 *  wrapper over the shadcn `sheet` primitive; the primitive itself is not
 *  edited to build this. */
export function BrandSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
  className,
}: BrandSheetProps) {
  const side = useSheetSide()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* No focus jump into the first field on open: on a phone that pops
          the keyboard over a sheet the user only opened to read (the
          firmware sheet's repository field, 2026-10-15). */}
      <SheetContent
        side={side}
        className={cn("gap-0 p-0 sm:max-w-md", className)}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b border-rule">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-rule p-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}

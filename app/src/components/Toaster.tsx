"use client"

import * as React from "react"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { sheetSideFor } from "@/components/overlays/sheetSide"

/** sonner's `position` prop for each `sheetSideFor` side: bottom-centre on
 *  narrow viewports, bottom-right on wide ones — the same breakpoint
 *  `BrandSheet` docks against. Width-dependent layout stays in the pure
 *  `sheetSideFor`; this hook is only the resize listener that reads it. */
function usePosition(): "bottom-center" | "bottom-right" {
  const [position, setPosition] = React.useState<"bottom-center" | "bottom-right">(() =>
    sheetSideFor(typeof window === "undefined" ? 1024 : window.innerWidth) === "bottom"
      ? "bottom-center"
      : "bottom-right"
  )

  React.useEffect(() => {
    const onResize = () =>
      setPosition(sheetSideFor(window.innerWidth) === "bottom" ? "bottom-center" : "bottom-right")
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return position
}

/** The app's toast surface: `sonner` themed onto tokens (mono, tabular,
 *  `--surface-2` fill, hairline border, no shadow — decision 23) and
 *  positioned bottom-centre on narrow / bottom-right on wide. Not mounted
 *  anywhere yet — UI-4 mounts this once in the shell (`App.tsx`), and the
 *  four core-workflow call sites (`toastFor`) land in UI-5/6/7. */
export function Toaster() {
  const position = usePosition()
  return <SonnerToaster position={position} />
}

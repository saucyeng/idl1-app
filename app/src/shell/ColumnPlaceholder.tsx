import type { ReactNode } from "react";

/** One dim mono placeholder sentence, centred in a panel that has nothing
 *  to show (UI-DIRECTION "Chart style rules for Plot" empty-state rule,
 *  reused here for a shell panel rather than a chart).
 *
 *  Lived in `ColumnFrame.tsx` until ruling R239 replaced that frame with
 *  `DockFrame.tsx`; it is the only part of it the dock still needs, so it
 *  moved to a file of its own rather than keeping a 190-line column frame
 *  alive for one 6-line component. */
export function ColumnPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center font-mono text-body-small text-fg-faint">
      {children}
    </div>
  );
}

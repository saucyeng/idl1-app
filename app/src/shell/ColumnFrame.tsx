import { Fragment, useRef, useState, type ReactNode } from "react";
import type { LayoutChangedMeta } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { COLUMN_IDS, readColumnPrefs, writeColumnPrefs, type ColumnId, type ColumnPrefs } from "./columnPrefs";
import { decideSettledColumnPrefs, type SettledColumnSizes } from "./columnResize";

/** Props for {@link ColumnFrame}. */
export interface ColumnFrameProps {
  /** Content for each of the four docked columns, left to right. Every
   *  column here is a placeholder in this pass (UI-DIRECTION decision 11:
   *  "reserve the column only" — extended to every column, not only maths,
   *  since wiring real Data/Notebook content into a docked column is a
   *  later lane's job); `output` is the exception the caller may fill with
   *  the real Notebook page. */
  library: ReactNode;
  maths: ReactNode;
  properties: ReactNode;
  output: ReactNode;
}

/**
 * The wide-layout (≥ 1200 px) dockable column frame (UI-DIRECTION "App shell
 * and navigation", reference order): library (280) | maths graph (flex) |
 * properties (320) | notebook output (flex). Widths and collapsed state
 * persist per machine through `columnPrefs.ts`; the output column is never
 * collapsible (the frame is empty without it).
 */
export default function ColumnFrame({ library, maths, properties, output }: ColumnFrameProps) {
  const initialPrefs = useRef<ColumnPrefs>(readColumnPrefs()).current;
  const [prefs, setPrefs] = useState(initialPrefs);

  // The live prefs, mirrored into a ref so the settle handler always reads
  // the latest value without depending on `prefs` (which would re-create
  // it, and every consumer that closes over it, on every settle).
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Every column's most recent pixel size during the in-flight gesture.
  // `onResize` (below) only ever writes here — no state update, no
  // `localStorage` write — so a drag tick never re-renders `ColumnFrame`
  // and the panel/handle elements the browser is mid-gesture with are
  // never replaced under the pointer.
  const liveSizesRef = useRef<SettledColumnSizes>({});

  function onColumnResize(id: ColumnId, inPixels: number): void {
    liveSizesRef.current[id] = inPixels;
  }

  // Fires once, after the pointer is released (or a resize key pressed) —
  // never per drag tick (`react-resizable-panels`' `onLayoutChanged`
  // contract). `isUserInteraction` excludes the initial-mount call and any
  // future imperative `setLayout`, so only an actual gesture ever writes.
  function onLayoutChanged(_layout: unknown, meta: LayoutChangedMeta): void {
    if (!meta.isUserInteraction) return;
    const next = decideSettledColumnPrefs(prefsRef.current, liveSizesRef.current);
    liveSizesRef.current = {};
    setPrefs(next);
    writeColumnPrefs(next);
  }

  const panelProps: Record<ColumnId, { defaultSize: number; minSize?: number; maxSize?: number }> = {
    library: { defaultSize: prefs.widths.library, minSize: 48, maxSize: 480 },
    maths: { defaultSize: prefs.widths.maths, minSize: 48 },
    properties: { defaultSize: prefs.widths.properties, minSize: 48, maxSize: 480 },
    output: { defaultSize: prefs.widths.output, minSize: 200 },
  };

  const content: Record<ColumnId, ReactNode> = { library, maths, properties, output };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full" onLayoutChanged={onLayoutChanged}>
      {COLUMN_IDS.map((id, index) => (
        <Fragment key={id}>
          {index > 0 && <ResizableHandle withHandle />}
          <ResizablePanel
            id={id}
            collapsible={id !== "output"}
            collapsedSize={0}
            {...panelProps[id]}
            onResize={(size) => onColumnResize(id, size.inPixels)}
            className="overflow-auto border-rule [&:not(:first-child)]:border-l"
          >
            {content[id]}
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

/** One dim mono placeholder sentence, centred in a reserved column slot
 *  (UI-DIRECTION "Chart style rules for Plot" empty-state rule, reused here
 *  for a reserved shell column rather than a chart). */
export function ColumnPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center font-mono text-body-small text-fg-faint">
      {children}
    </div>
  );
}

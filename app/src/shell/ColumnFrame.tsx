import { Fragment, useRef, useState, type ReactNode } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { COLUMN_IDS, readColumnPrefs, writeColumnPrefs, type ColumnId, type ColumnPrefs } from "./columnPrefs";

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

/** Whether a resized panel's pixel width counts as "collapsed" for
 *  {@link ColumnPrefs.collapsed} bookkeeping — a few pixels of slop below
 *  the column's own collapsed target, since drag-to-collapse rarely lands
 *  on exactly zero. */
const COLLAPSED_THRESHOLD_PX = 4;

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

  function persist(next: ColumnPrefs): void {
    setPrefs(next);
    writeColumnPrefs(next);
  }

  function onColumnResize(id: ColumnId, inPixels: number): void {
    const collapsedNow = id !== "output" && inPixels <= COLLAPSED_THRESHOLD_PX;
    const collapsed = collapsedNow
      ? prefs.collapsed.includes(id)
        ? prefs.collapsed
        : [...prefs.collapsed, id]
      : prefs.collapsed.filter((c) => c !== id);
    persist({ ...prefs, widths: { ...prefs.widths, [id]: Math.round(inPixels) }, collapsed });
  }

  const panelProps: Record<ColumnId, { defaultSize: number; minSize?: number; maxSize?: number }> = {
    library: { defaultSize: prefs.widths.library, minSize: 48, maxSize: 480 },
    maths: { defaultSize: prefs.widths.maths, minSize: 48 },
    properties: { defaultSize: prefs.widths.properties, minSize: 48, maxSize: 480 },
    output: { defaultSize: prefs.widths.output, minSize: 200 },
  };

  const content: Record<ColumnId, ReactNode> = { library, maths, properties, output };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
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

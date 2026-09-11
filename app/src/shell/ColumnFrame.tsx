import { Fragment, useRef, useState, type ReactNode } from "react";
import type { LayoutChangedMeta } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { readColumnPrefs, writeColumnPrefs, type ColumnId, type ColumnPrefs } from "./columnPrefs";
import { decideSettledColumnPrefs, type SettledColumnSizes } from "./columnResize";
import { visibleColumnIds } from "./columnVisibility";
import type { MathsOrientation } from "./layoutPresets";

/** How tall the stacked maths row opens, in CSS px (R213 item 1) — the row
 *  is freely draggable from there and its height is not remembered (see
 *  `outputSlot` below on why not). */
const MATHS_ROW_DEFAULT_HEIGHT_PX = 300;

/** Props for {@link ColumnFrame}. */
export interface ColumnFrameProps {
  /** Content for each of the four docked columns, left to right. Three of
   *  them now hold real content: `output` is the Notebook page itself,
   *  and `maths`/`properties` are the empty slot containers
   *  (`GraphSlotColumn`, `EditorSlotColumn`) that page portals its one
   *  `GraphCanvas`/`EditorPanes` instance into — R109's rule, since the
   *  state both need lives in the page. UI-DIRECTION decision 11's
   *  "reserve the column only" no longer describes any of them.
   *
   *  `library` is optional (R107): the wide-layout studio drops the
   *  library column because it duplicates the Data tab. The column id and
   *  its persisted width/collapsed bookkeeping stay in `columnPrefs.ts` so
   *  a future filtering widget (not the whole Data tab) can take the slot
   *  back without a `ColumnFrame` or prefs-schema change — the caller
   *  simply omits the prop and no `library` panel or divider renders. */
  library?: ReactNode;
  /** Optional for the same reason `library` is, and through the same
   *  `visibleColumnIds` rule: the Notebook toolbar's Graph toggle turned
   *  off passes `undefined` (R208 item 2, via `shell/
   *  graphColumnVisible.ts`), and no `maths` panel or divider renders at
   *  all. A stored width for the column survives in `columnPrefs.ts`
   *  untouched, so toggling it back restores the width the user last
   *  dragged it to. */
  maths?: ReactNode;
  /** Optional for the same reason `maths` is, since R213 item 1's Output
   *  preset ("notebook output full width") has to remove the properties
   *  column outright — a 320 px panel holding a "hidden" placeholder is not
   *  full width. */
  properties?: ReactNode;
  output: ReactNode;
  /** Where the maths panel sits: `"column"` beside the output (every preset
   *  but Stacked), or `"row"` above it (R213 item 1's Stacked, for 16:9
   *  screens where vertical space is the cheap axis). Ignored when `maths`
   *  is absent. Defaults to `"column"` — the arrangement before R213. */
  mathsOrientation?: MathsOrientation;
  /** A width in CSS px to open the output column at, overriding the
   *  remembered one — R213 item 1's Maths preset ("output narrow (min
   *  width, still live)"). `null`/absent keeps whatever width the user last
   *  dragged it to. A drag from here on is persisted as usual, so the
   *  override is a starting point, not a pin. */
  outputWidthPx?: number | null;
}

/**
 * The wide-layout (≥ 1200 px) dockable column frame (UI-DIRECTION "App shell
 * and navigation", reference order): library (280) | maths graph (flex) |
 * properties (320) | notebook output (flex) — the library column dropped
 * from the Notebook studio (R107), so today's callers pass maths |
 * properties | output and `library` is left undefined. Widths and
 * collapsed state persist per machine through `columnPrefs.ts`, which
 * keeps the `library` id (a stale stored width or collapsed flag loads
 * fine, just unrendered) so a later filtering widget can take the slot
 * back; the output column is never collapsible (the frame is empty
 * without it).
 */
export default function ColumnFrame({ library, maths, properties, output, mathsOrientation = "column", outputWidthPx = null }: ColumnFrameProps) {
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
    output: { defaultSize: outputWidthPx ?? prefs.widths.output, minSize: 200 },
  };

  const content: Partial<Record<ColumnId, ReactNode>> = { library, maths, properties, output };
  // R213 item 1's Stacked: the maths panel leaves the horizontal row and
  // becomes a row above the output inside the output column's own slot.
  // Every other column is unchanged, which is what "properties and cells as
  // in Split" asks for.
  const stacked = mathsOrientation === "row" && maths !== undefined;
  const columns = visibleColumnIds(stacked ? { ...content, maths: undefined } : content);

  /** The output slot's contents: the output itself, or — stacked — a
   *  vertical group with the maths panel above it.
   *
   *  The nested group deliberately persists nothing: `columnPrefs.ts`
   *  stores *widths*, and these two panels are sized on the vertical axis.
   *  Writing a height into `widths.maths` would corrupt the column width
   *  Split and Maths then open with. R213 does not ask for a remembered row
   *  height, so the row opens at `MATHS_ROW_DEFAULT_HEIGHT_PX` each time
   *  the preset is applied and is freely draggable from there (lane-local
   *  call, CLAUDE.md §1). */
  const outputSlot = stacked ? (
    <ResizablePanelGroup orientation="vertical" className="h-full w-full">
      <ResizablePanel id="maths-row" collapsible collapsedSize={0} defaultSize={MATHS_ROW_DEFAULT_HEIGHT_PX} minSize={48} className="overflow-auto">
        {maths}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="output-body" minSize={120} className="overflow-auto border-t border-rule">
        {output}
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    output
  );

  return (
    // Remounting on a layout change is deliberate: `defaultSize` is read
    // once per panel instance by `react-resizable-panels`, so an applied
    // preset's `outputWidthPx` (or a column arriving/leaving) would
    // otherwise leave every panel at the size the previous arrangement had.
    // The slot columns republish their DOM nodes on remount
    // (`GraphSlotColumn`/`EditorSlotColumn`), which is the same lifecycle a
    // toggled column already goes through.
    <ResizablePanelGroup
      key={`${columns.join("-")}|${stacked ? "row" : "column"}|${outputWidthPx ?? "kept"}`}
      orientation="horizontal"
      className="h-full w-full"
      onLayoutChanged={onLayoutChanged}
    >
      {columns.map((id, index) => (
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
            {id === "output" ? outputSlot : content[id]}
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

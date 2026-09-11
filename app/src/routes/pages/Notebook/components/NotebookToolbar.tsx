import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RebuildReport } from "../../../../ipc/catalog";
import type { SessionDetail } from "../../../../ipc/catalog";
import type { IpcError } from "../../../../ipc/workbook";
import type { SelectionWindow } from "../../../../state/selection";
import {
  NOTEBOOK_TOOLBAR_GROUPS,
  toolbarLayout,
  withMeasuredGroupWidths,
  type MeasuredGroupWidth,
  type ToolbarGroupId,
} from "../../../../shell/toolbarLayout";
import { isLayoutPresetId, LAYOUT_PRESETS, type ActivePreset, type LayoutPresetId } from "../../../../shell/layoutPresets";
import PlaybackTransport from "../interaction/PlaybackTransport";
import type { PlaybackMode } from "../interaction/playbackMode";
import type { InputMapPreset } from "../interaction/inputMap";
import { NOTEBOOK_COLUMN_IDS, type NotebookColumnVisibility } from "../model/notebookColumns";
import type { OutputRegister } from "../model/outputRegister";
import type { WorkbookEntry } from "../model/workbookEntry";
import type { XModeOption } from "../model/xMode";
import { NO_SELECTION_TEXT, windowChipGroups } from "../model/windowChip";
import { RegisterSwitch, WorkbookActions, WorkbookPicker } from "./WorkbookBar";

/** Each group's label in the "⋯" overflow menu — R212 item 4: the menu
 *  "lists them with their labels", so a collapsed group is named, never a
 *  bare cluster of icons in a popover. */
const GROUP_LABELS: Record<ToolbarGroupId, string> = {
  columns: "Columns",
  document: "Workbook",
  view: "View",
  window: "Selection",
  transport: "Playback",
  actions: "Actions",
};

/** Props for {@link NotebookToolbar}. Everything is state
 *  `Notebook/index.tsx` already holds — this component owns only the row's
 *  measured width and which groups that width can carry. */
export interface NotebookToolbarProps {
  // --- columns group ---
  /** False at paper/narrow widths, where there are no columns to toggle
   *  (R161, decision 29) — the group is then absent, not disabled. */
  columnsToggleAvailable: boolean;
  columnVisibility: NotebookColumnVisibility;
  onColumnToggleValue: (ids: string[]) => void;

  // --- document + actions groups ---
  entry: WorkbookEntry | null;
  rescanning: boolean;
  creating: boolean;
  dirty: boolean;
  workbookBarError: IpcError | null;
  lastRebuild: RebuildReport | null;
  onCreate: (name: string) => void;
  onRescan: () => void;
  onSelect: (workbookId: string) => void;

  // --- view group ---
  register: OutputRegister;
  onRegisterChange: (register: OutputRegister) => void;
  /** Ruling R216 item 3's stacking option: 0 px gaps, no cell padding,
   *  overlay-only chrome, and stacked time charts sharing an x axis. A per
   *  machine view preference (`model/denseMode.ts`), never a document
   *  value — so it sits in the `view` group beside the layout presets. */
  dense: boolean;
  onDenseChange: (dense: boolean) => void;
  /** The layout preset this viewport shape is on, or `"custom"` after a
   *  column was thrown by hand (R213 item 3) — the picker then shows
   *  nothing selected rather than lying about which arrangement is live. */
  activePreset: ActivePreset;
  onPresetChange: (id: LayoutPresetId) => void;

  // --- window chip ---
  windows: readonly SelectionWindow[];
  sessionDetailsByWindow: Map<string, SessionDetail | null>;

  // --- transport ---
  playing: boolean;
  cursorTUs: bigint | null;
  onTogglePlay: () => void;
  transportDisabled: boolean;
  routeVisible: boolean;
  speed: number;
  onSpeedChange: (speed: number) => void;
  playbackMode: PlaybackMode;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  followingWindowLabel: string | null;

  // --- actions group: save / export ---
  /** `null` when no document is open — Save and Export render disabled
   *  rather than vanishing, so the row's width does not jump. */
  documentOpen: boolean;
  saveDisabled: boolean;
  saveLabel: string;
  onSave: () => void;
  saveNote: string | null;
  exporting: boolean;
  exportDisabled: boolean;
  onExportReport: () => void;

  // --- actions group: the two configuration selects ---
  inputMapPreset: InputMapPreset;
  inputMapPresets: readonly InputMapPreset[];
  onInputMapPresetChange: (id: string) => void;
  xMode: "time" | "distance";
  xModeOptions: readonly XModeOption[];
  onXModeChange: (mode: "time" | "distance") => void;
}

/** The measured inner width of `ref`'s element, via a `ResizeObserver` on
 *  the row itself (R212 item 4: "measure with a ResizeObserver on the row,
 *  not window width"). `0` until the first observation, and `0` forever in
 *  an environment with no `ResizeObserver` (jsdom) — `toolbarLayout`'s own
 *  doc comment defines that as the tightest layout, never a blank row.
 *
 * The width feeds `toolbarLayout`, which decides how many groups render
 * inline vs. collapse into the "⋯" menu — collapsing/expanding a group
 * changes how much content the row holds. The row itself does not grow or
 * shrink to fit that content (fixed height, `overflow-hidden`, width set by
 * its flex parent), but the browser still re-measures on every layout pass
 * within the frame, and a same-frame `setState` from inside the observer
 * callback was enough to trip the browser's own "ResizeObserver loop
 * completed with undelivered notifications" notice under rapid resizes.
 * Deferring the `setWidth` to `requestAnimationFrame` (already this file's
 * neighbours' pattern in `ChartCell.tsx`/`JsCellFrame.tsx`) keeps the
 * re-render out of the observer's own callback stack. */
function useRowWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;
      const nextWidth = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(nextWidth));
    });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [ref]);

  return width;
}

/**
 * The measured width of every toolbar group the row has rendered so far,
 * by id and label state (ruling R216 item 4).
 *
 * Returns the map and the callback ref each group's wrapper attaches. One
 * `ResizeObserver` watches every registered group rather than one instance
 * per group: the number of groups varies with `columnsToggleAvailable` and
 * with what has collapsed, so a hook per group would be a conditional hook.
 * The observer's own contract is per target either way — one entry per
 * group per delivery — and a single instance is the cheaper shape.
 *
 * `setState` is deferred to `requestAnimationFrame` for the same reason
 * {@link useRowWidth} defers its own (the "ResizeObserver loop completed
 * with undelivered notifications" notice), and batched: one frame absorbs
 * every group that changed in it.
 *
 * Measurements only ever accumulate. A group that has collapsed into the
 * "⋯" menu is no longer rendered on the row, so it can no longer be
 * measured; keeping its last known width is what stops the row oscillating
 * between "it fits at its nominal width" and "it does not fit at its real
 * one". Nothing is measured inside the overflow popover, whose contents are
 * laid out by the popover, not by the row.
 */
function useGroupWidths(): {
  measured: ReadonlyMap<ToolbarGroupId, MeasuredGroupWidth>;
  groupRef: (id: ToolbarGroupId, labelled: boolean) => (node: HTMLDivElement | null) => void;
} {
  const [measured, setMeasured] = useState<ReadonlyMap<ToolbarGroupId, MeasuredGroupWidth>>(() => new Map());
  const nodes = useRef(new Map<ToolbarGroupId, HTMLDivElement>());
  const observed = useRef(new Map<Element, ToolbarGroupId>());
  const pending = useRef(new Map<ToolbarGroupId, { width: number; labelled: boolean }>());
  const frame = useRef(0);
  const observer = useRef<ResizeObserver | null>(null);
  // Which label state each group was last rendered in. Recorded by the
  // callback ref at render time and read in the `ResizeObserver` callback,
  // where the box being measured is the box that render produced — never at
  // commit time, a frame later, by when the row may have flipped and the
  // width would be filed under a label state it was not measured in.
  const labelStates = useRef(new Map<ToolbarGroupId, boolean>());

  const groupRef = (id: ToolbarGroupId, labelled: boolean) => (node: HTMLDivElement | null) => {
    labelStates.current.set(id, labelled);
    if (node === null) nodes.current.delete(id);
    else nodes.current.set(id, node);
  };

  // Reconcile after every render rather than on a dependency list: which
  // groups are on the row is itself derived from these measurements, so
  // there is no key that is known before the render it describes. The
  // observer instance is kept — recreating it each pass would re-deliver
  // every box and re-enter this effect forever.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;

    if (observer.current === null) {
      const commit = () => {
        frame.current = 0;
        const updates = pending.current;
        pending.current = new Map();
        if (updates.size === 0) return;
        setMeasured((previous) => {
          let changed = false;
          const next = new Map(previous);
          for (const [id, { width, labelled }] of updates) {
            const field: keyof MeasuredGroupWidth = labelled ? "labelledWidth" : "compactWidth";
            const before = next.get(id) ?? {};
            if (before[field] === width) continue;
            next.set(id, { ...before, [field]: width });
            changed = true;
          }
          // Same map back when nothing moved: this is what terminates the
          // measure → re-layout → measure cycle.
          return changed ? next : previous;
        });
      };

      observer.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const id = observed.current.get(entry.target);
          if (id === undefined) continue;
          // The border box is what the row's flex packing consumes. A zero
          // — a hidden row, or the frame before first layout — is dropped:
          // a zero-width group would make every layout "fit" and bring the
          // overlap straight back.
          const width = entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
          if (width <= 0) continue;
          pending.current.set(id, { width, labelled: labelStates.current.get(id) === true });
        }
        if (frame.current === 0) frame.current = requestAnimationFrame(commit);
      });
    }

    const live = new Set(nodes.current.values());
    for (const [node, id] of observed.current) {
      if (live.has(node as HTMLDivElement)) continue;
      observer.current.unobserve(node);
      observed.current.delete(node);
      pending.current.delete(id);
    }
    for (const [id, node] of nodes.current) {
      if (observed.current.has(node)) continue;
      observed.current.set(node, id);
      observer.current.observe(node);
    }
  });

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frame.current);
      observer.current?.disconnect();
      observer.current = null;
      observed.current = new Map();
    };
  }, []);

  return { measured, groupRef };
}

/** A hairline between two groups — the row's only structural device, and
 *  the thing that makes "these controls belong together" readable without a
 *  label (UI-DIRECTION decision 23: depth is a hairline, never a shadow). */
function GroupDivider() {
  return <span aria-hidden className="h-[var(--space-4)] w-px shrink-0 bg-rule" />;
}

/**
 * The Notebook's one-row toolbar (ruling R212 item 4). Isaac, 2026-09-11:
 * the old one was "two rows tall despite not having tools all the way
 * across, then the 'more' button just makes it scrollable, ridiculous all
 * around".
 *
 * What changed, and why each part is the way it is:
 *
 * - **One row, fixed at 32 px, `flex-nowrap` and `overflow-hidden`.** Not
 *   `overflow-x-auto`: a toolbar that scrolls hides its own controls with
 *   no sign that they exist, which is the behaviour R212 deletes. The two
 *   wrapping sub-bars that made the row two lines tall are gone —
 *   `WorkbookBar.tsx` is now three separate group exports plus a notice
 *   strip that renders *under* the row.
 * - **Groups collapse whole, right to left, into one "⋯" menu**, decided
 *   by `shell/toolbarLayout.ts` from the row's own measured width. Labels
 *   drop before any group does.
 * - **The window chip and the transport never collapse**, and the
 *   transport carries `mx-auto` so it centres in whatever space the groups
 *   around it leave.
 *
 * Layer order (bug report fixed 2026-09-09, unchanged here): this row needs
 * `relative` + an explicit `z-index` and an opaque background, or the
 * sandbox iframe host (`Notebook/index.tsx`'s `position: fixed` container)
 * paints over it while a chart is scrolled underneath — a fixed element
 * with any explicit z-index stacks above ordinary static in-flow content
 * regardless of DOM order.
 */
export default function NotebookToolbar(props: NotebookToolbarProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const width = useRowWidth(rowRef);
  const { measured, groupRef } = useGroupWidths();

  // The groups that exist at all for this row, at their real widths.
  // `columns` is absent at paper/narrow widths (decision 29), and reserving
  // its nominal 168 px for a group that never renders is the same class of
  // error R216 item 4 is fixing, just in the safe direction.
  const specs = useMemo(() => {
    const present = NOTEBOOK_TOOLBAR_GROUPS.filter((spec) => spec.id !== "columns" || props.columnsToggleAvailable);
    return withMeasuredGroupWidths(measured, present);
  }, [measured, props.columnsToggleAvailable]);

  const layout = useMemo(() => toolbarLayout(width, specs), [width, specs]);
  const labelled = layout.labelled;

  const chipGroups = useMemo(() => windowChipGroups(props.windows, props.sessionDetailsByWindow), [props.windows, props.sessionDetailsByWindow]);

  /** One group's contents. The same element renders inline on the row and,
   *  when the group has collapsed, inside the "⋯" menu — so a control
   *  never gains or loses behaviour by moving between the two.
   *
   *  `labelled` is a parameter rather than a closure read because the two
   *  places differ: the row drops labels to buy width, the menu has width
   *  to spare and always shows them. A control the row shows as "G" is
   *  "Graph" again the moment it moves into the menu. */
  function group(id: ToolbarGroupId, labelled: boolean): ReactNode {
    switch (id) {
      case "columns":
        return props.columnsToggleAvailable ? (
          <ToggleGroup
            type="multiple"
            density="tight"
            aria-label="Notebook columns"
            value={NOTEBOOK_COLUMN_IDS.filter((columnId) => props.columnVisibility[columnId])}
            onValueChange={props.onColumnToggleValue}
          >
            <ToggleGroupItem value="graph" title="Graph">
              {labelled ? "Graph" : "G"}
            </ToggleGroupItem>
            <ToggleGroupItem value="properties" title="Properties">
              {labelled ? "Properties" : "P"}
            </ToggleGroupItem>
            <ToggleGroupItem value="cells" title="Cells">
              {labelled ? "Cells" : "C"}
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null;

      case "document":
        return <WorkbookPicker entry={props.entry} dirty={props.dirty} onSelect={props.onSelect} labelled={labelled} />;

      case "view":
        return (
          <div className="flex items-center gap-[var(--nb-gap)]">
            <RegisterSwitch register={props.register} onRegisterChange={props.onRegisterChange} labelled={labelled} />
            {/* R213 item 3's compact preset picker. Single-select, and a
                `"custom"` state selects nothing — `ToggleGroup`'s
                `type="single"` reports `""` when the pressed item is
                pressed again, which `isLayoutPresetId` drops, so a preset
                can be re-applied but never un-applied into a state with no
                name. Paper · Studio (R184) stays its own switch beside it,
                never folded into a preset. */}
            <ToggleGroup
              type="single"
              density="tight"
              aria-label="Layout preset"
              value={props.activePreset === "custom" ? "" : props.activePreset}
              onValueChange={(id: string) => {
                if (isLayoutPresetId(id)) props.onPresetChange(id);
              }}
            >
              {LAYOUT_PRESETS.map((preset) => (
                <ToggleGroupItem key={preset.id} value={preset.id} title={preset.title}>
                  <span aria-hidden>{preset.glyph}</span>
                  {labelled && <span className="ml-[var(--nb-pad)]">{preset.label}</span>}
                  {!labelled && <span className="sr-only">{preset.label}</span>}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {/* R216 item 3. A single-item `ToggleGroup` rather than a
                `Button` with `aria-pressed`, so it reads and styles as one
                more register in this group instead of an action. */}
            <ToggleGroup
              type="multiple"
              density="tight"
              aria-label="Stacking"
              value={props.dense ? ["dense"] : []}
              onValueChange={(ids: string[]) => props.onDenseChange(ids.includes("dense"))}
            >
              <ToggleGroupItem value="dense" title="Stack cells with no gaps, padding or chrome rows">
                <span aria-hidden>≡</span>
                {labelled && <span className="ml-[var(--nb-pad)]">Dense</span>}
                {!labelled && <span className="sr-only">Dense</span>}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        );

      case "window":
        return (
          <div className="flex min-w-0 items-center gap-[var(--nb-gap)] font-mono text-[length:var(--nb-text-label)]" aria-label="Selected windows">
            {chipGroups.length === 0 ? (
              <span className="truncate text-fg-faint">{NO_SELECTION_TEXT}</span>
            ) : (
              chipGroups.map((chip) => (
                <span
                  key={chip.sessionId}
                  className="flex min-w-0 items-center gap-[var(--nb-pad)] rounded-[var(--radius-structural)] border border-rule bg-control px-[var(--nb-pad)] py-px"
                  title={`${chip.sessionText} — ${chip.spans.map((s) => s.text).join(", ")}`}
                >
                  {/* Bounded, because the group no longer shrinks (R216
                      item 4): a long session name would otherwise set the
                      group's measured width and push everything else into
                      the overflow menu. R212 rule 4's "the row truncates
                      its own text" is this cap. */}
                  <span className="max-w-[14ch] truncate text-fg">{chip.sessionText}</span>
                  {chip.spans.map((span) => (
                    <span key={span.key} className="flex shrink-0 items-center gap-px text-fg-dim">
                      <span aria-hidden className="size-[6px] shrink-0" style={{ background: `var(${span.colour})` }} />
                      {span.text}
                    </span>
                  ))}
                </span>
              ))
            )}
          </div>
        );

      case "transport":
        return (
          <PlaybackTransport
            playing={props.playing}
            cursorTUs={props.cursorTUs}
            onToggle={props.onTogglePlay}
            disabled={props.transportDisabled}
            routeVisible={props.routeVisible}
            speed={props.speed}
            onSpeedChange={props.onSpeedChange}
            mode={props.playbackMode}
            onModeChange={props.onPlaybackModeChange}
            followingWindowLabel={props.followingWindowLabel}
          />
        );

      case "actions":
        return (
          <div className="flex items-center gap-[var(--nb-gap)]">
            {props.documentOpen && (
              <>
                <Button type="button" size="sm" emphasis="normal" onClick={props.onSave} disabled={props.saveDisabled} title={props.saveNote ?? "Save this workbook"}>
                  {props.saveLabel}
                </Button>
                <Button type="button" size="sm" emphasis="normal" onClick={props.onExportReport} disabled={props.exportDisabled} title="Export this notebook as a PDF report">
                  {props.exporting ? "Building…" : labelled ? "Export report" : "Export"}
                </Button>
              </>
            )}
            <WorkbookActions creating={props.creating} rescanning={props.rescanning} onCreate={props.onCreate} onRescan={props.onRescan} labelled={labelled} />
            {/* R137's own point — "a few presets for me to try at runtime":
                changing this updates `Notebook/index.tsx`'s state, which
                every mounted `ChartCell` reads on the very next render. */}
            <Select value={props.inputMapPreset.id} onValueChange={props.onInputMapPresetChange}>
              <SelectTrigger size="sm" className="w-28" aria-label="Gesture input map" title="Gesture input map">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.inputMapPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Decision 54's worksheet-level X mode. Distance is listed and
                disabled with its reason (R136) — never silently omitted,
                never silently falling back to time without saying why. */}
            <Select value={props.xMode} onValueChange={(v) => (v === "time" || v === "distance") && props.onXModeChange(v)}>
              <SelectTrigger size="sm" className="w-24" aria-label="X axis" title="X axis">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.xModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} disabled={option.disabledReason !== undefined} title={option.disabledReason}>
                    {option.label}
                    {option.disabledReason !== undefined ? " (unavailable)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
    }
  }

  const inline = layout.inline.filter((id) => group(id, labelled) !== null);

  return (
    <div
      ref={rowRef}
      className="idl-dense relative z-10 flex h-[var(--space-8)] flex-nowrap items-center gap-[var(--nb-gap)] overflow-hidden border-b border-rule bg-surface px-[var(--nb-gap)]"
      role="toolbar"
      aria-label="Notebook"
    >
      {inline.map((id, index) => (
        /* `shrink-0`, not `shrink` (ruling R216 item 4). A shrinking group
           box compresses below its contents' natural width and the contents
           paint over the next group — the reported overlap. Fitting the row
           is `toolbarLayout`'s job now that it is fed real measurements, so
           the boxes keep their size and the row's own `overflow-hidden`
           clips rather than overlaps if a measurement is ever stale.
           The divider is a sibling of the measured box, not inside it, so a
           group's recorded width is the group's and not the group's plus a
           hairline it only carries when it is not first on the row. */
        <div key={id} className={`flex shrink-0 items-center gap-[var(--nb-gap)] ${id === "transport" ? "mx-auto" : ""}`}>
          {index > 0 && <GroupDivider />}
          <div ref={groupRef(id, labelled)} className="flex min-w-0 shrink-0 items-center gap-[var(--nb-gap)]">
            {group(id, labelled)}
          </div>
        </div>
      ))}
      {layout.overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" size="icon-sm" emphasis="normal" aria-label="More toolbar controls" title="More toolbar controls">
              ⋯
            </Button>
          </PopoverTrigger>
          {/* The menu lists each collapsed group under its own label
              (R212), so a control is found by the name of the group it
              belongs to rather than by hunting a flat list. */}
          <PopoverContent align="end" className="idl-dense flex w-auto flex-col gap-[var(--space-3)] p-[var(--space-3)]">
            {layout.overflow.map((id) => {
              const contents = group(id, true);
              if (contents === null) return null;
              return (
                <div key={id} className="flex flex-col gap-[var(--nb-pad)]">
                  <span className="font-mono text-[length:var(--nb-text-label)] tracking-[var(--tracking-label)] text-fg-dim">{GROUP_LABELS[id]}</span>
                  {contents}
                </div>
              );
            })}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

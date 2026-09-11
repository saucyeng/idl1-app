import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RebuildReport } from "../../../../ipc/catalog";
import type { SessionDetail } from "../../../../ipc/catalog";
import type { IpcError } from "../../../../ipc/workbook";
import type { SelectionWindow } from "../../../../state/selection";
import { toolbarLayout, type ToolbarGroupId } from "../../../../shell/toolbarLayout";
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
 *  doc comment defines that as the tightest layout, never a blank row. */
function useRowWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return width;
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
  const layout = useMemo(() => toolbarLayout(width), [width]);
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
        return <RegisterSwitch register={props.register} onRegisterChange={props.onRegisterChange} labelled={labelled} />;

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
                  <span className="truncate text-fg">{chip.sessionText}</span>
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
        <div key={id} className={`flex min-w-0 shrink items-center gap-[var(--nb-gap)] ${id === "transport" ? "mx-auto" : ""}`}>
          {index > 0 && <GroupDivider />}
          {group(id, labelled)}
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

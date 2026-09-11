import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SessionDetail } from "../../../../ipc/catalog";
import type { SelectionWindow } from "../../../../state/selection";
import {
  childrenOf,
  COMMAND_IDS,
  coreCommands,
  type CommandId,
  type RibbonGroupId,
  type TieredCommand,
} from "../../../../shell/commandTiers";
import { runCommand, useRegisteredCommands } from "../../../../shell/commandRegistry";
import { formatShortcut, usesCommandGlyph } from "../../../../shell/menuModel";
import { readShowOccasional, subscribeShowOccasional } from "../../../../shell/ribbonPrefs";
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
import type { NotebookColumnVisibility } from "../model/notebookColumns";
import type { OutputRegister } from "../model/outputRegister";
import type { WorkbookEntry } from "../model/workbookEntry";
import type { XModeOption } from "../model/xMode";
import { NO_SELECTION_TEXT, windowChipGroups } from "../model/windowChip";
import { RegisterSwitch } from "./WorkbookBar";
import { RibbonBigButton, RibbonMenuItem, RibbonMenuSeparator, RibbonSmallButton, RibbonSplitButton, RibbonSubmenu } from "./RibbonButton";

/** Each group's label in the "⋯" overflow menu — R212 item 4: the menu
 *  "lists them with their labels", so a collapsed group is named, never a
 *  bare cluster of icons in a popover. */
const GROUP_LABELS: Record<ToolbarGroupId, string> = {
  panels: "Panels",
  file: "Workbook",
  library: "Library",
  view: "View",
  window: "Selection",
  transport: "Playback",
};

/** Props for {@link NotebookToolbar}. Everything is state
 *  `Notebook/index.tsx` already holds — this component owns only the row's
 *  measured width and which groups that width can carry. */
export interface NotebookToolbarProps {
  // --- panels group ---
  /** False at paper/narrow widths, where there are no columns to toggle
   *  (R161, decision 29) — the group is then absent, not disabled. */
  columnsToggleAvailable: boolean;
  columnVisibility: NotebookColumnVisibility;
  onColumnToggleValue: (ids: string[]) => void;

  // --- file group ---
  /** The open workbook, for the name chip beside Save. `null` while the
   *  first `list_workbooks` is still in flight. */
  entry: WorkbookEntry | null;
  /** True while the open document has unsaved edits — the chip then carries
   *  the app's unsaved dot. */
  dirty: boolean;

  // --- library group ---
  /** True while `rebuild_catalog` is running, for Rescan's busy label. */
  rescanning: boolean;
  onRescan: () => void;

  // --- view group ---
  register: OutputRegister;
  onRegisterChange: (register: OutputRegister) => void;
  /** Ruling R216 item 3's stacking option, now the View dropdown's rare
   *  tier: a per-machine view preference (`model/denseMode.ts`), never a
   *  document value. */
  dense: boolean;
  onDenseChange: (dense: boolean) => void;
  /** The layout preset this viewport shape is on, or `"custom"` after a
   *  column was thrown by hand (R213 item 3). R225 item 5: the preset
   *  picker and Paper/Studio stay in the view group and are not redesigned
   *  here. */
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

  // --- file group: save / export ---
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

  // --- view group: the two worksheet settings ---
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
 * The `setWidth` is deferred to `requestAnimationFrame` (already this
 * file's neighbours' pattern in `ChartCell.tsx`/`JsCellFrame.tsx`) to keep
 * the re-render out of the observer's own callback stack, which was enough
 * to trip the browser's "ResizeObserver loop completed with undelivered
 * notifications" notice under rapid resizes. */
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
 * The measured width of every ribbon group the row has rendered so far, by
 * id and label state (ruling R216 item 4).
 *
 * Returns the map and the callback ref each group's wrapper attaches. One
 * `ResizeObserver` watches every registered group rather than one instance
 * per group: the number of groups varies with `columnsToggleAvailable` and
 * with what has collapsed, so a hook per group would be a conditional hook.
 *
 * `setState` is deferred to `requestAnimationFrame` for the same reason
 * {@link useRowWidth} defers its own, and batched: one frame absorbs every
 * group that changed in it.
 *
 * Measurements only ever accumulate. A group that has collapsed into the
 * "⋯" menu is no longer rendered on the row, so it can no longer be
 * measured; keeping its last known width is what stops the row oscillating
 * between "it fits at its nominal width" and "it does not fit at its real
 * one".
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
  // where the box being measured is the box that render produced.
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

/** This machine's "Show occasional commands as buttons" setting, live
 *  (R225 item 4). Settings and the ribbon are mounted at the same time, so
 *  flipping the switch has to reach the row without a reload. */
function useShowOccasional(): boolean {
  return useSyncExternalStore(subscribeShowOccasional, readShowOccasional, () => false);
}

/** A hairline between two groups — the row's only structural device, and
 *  the thing that makes "these controls belong together" readable without a
 *  label (UI-DIRECTION decision 23: depth is a hairline, never a shadow). */
function GroupDivider() {
  return <span aria-hidden className="h-[var(--space-5)] w-px shrink-0 bg-rule" />;
}

/** What the ribbon knows about one command beyond the tier table: whether
 *  it can run now, whether it is currently on, and what to do about it. */
interface CommandState {
  run: () => void;
  enabled: boolean;
  /** `undefined` for an action with no on/off state. */
  checked?: boolean;
  /** Overrides the table's label — "Saving…" while a save is in flight. */
  label?: string;
  /** Why the command will not respond, when that is worth saying. */
  title?: string;
}

/**
 * The Notebook's ribbon (ruling R225). Isaac, 2026-09-11: "the save,
 * export, new, create, rescan, mouse, time/distance buttons all overlap; a
 * CAD-style deal where they can be both big buttons and dropdowns that
 * extend to other big buttons, small buttons and nested dropdowns".
 *
 * What it is, and why each part is the way it is:
 *
 * - **One row, 40 px, `flex-nowrap` and `overflow-hidden`.** Not
 *   `overflow-x-auto`: a toolbar that scrolls hides its own controls with
 *   no sign that they exist, which is the behaviour R212 deleted.
 * - **Three tiers, one table.** `shell/commandTiers.ts` says which commands
 *   are big buttons (core), which live behind a chevron (occasional) and
 *   which are nested one level further in (rare). A first run sees the core
 *   tier and nothing else; the Settings switch promotes the occasional tier
 *   to small buttons for a reader who wants everything on screen.
 * - **The overlap is fixed at its root.** Every group container is
 *   `flex-nowrap` and every control inside it is `shrink-0`, so no button's
 *   box can compress below its own text and paint over its neighbour.
 *   `shell/toolbarLayout.ts`'s `packedSpans` models that and its test is
 *   the guard, at both levels: between groups (R216 item 4) and between
 *   sibling buttons (R225 item 3).
 * - **Groups still collapse whole, right to left, into one "⋯" menu**,
 *   decided by `shell/toolbarLayout.ts` from the row's own measured width.
 *   Labels drop before any group does.
 * - **The window chip and the transport never collapse**, and the transport
 *   carries `mx-auto` so it centres in whatever space the groups around it
 *   leave.
 *
 * Layer order (ruling R221.1): this row states no z-index of its own. It is
 * portaled into the shell's toolbar band, which carries `shell-chrome`.
 */
export default function NotebookToolbar(props: NotebookToolbarProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const width = useRowWidth(rowRef);
  const { measured, groupRef } = useGroupWidths();
  const registered = useRegisteredCommands();
  const showOccasional = useShowOccasional();
  const commandGlyph = usesCommandGlyph(typeof navigator === "undefined" ? "" : navigator.userAgent);

  // The groups that exist at all for this row, at their real widths.
  // `panels` is absent at paper/narrow widths (decision 29), and reserving
  // its nominal width for a group that never renders is the same class of
  // error R216 item 4 fixed, just in the safe direction.
  const specs = useMemo(() => {
    const present = NOTEBOOK_TOOLBAR_GROUPS.filter((spec) => spec.id !== "panels" || props.columnsToggleAvailable);
    return withMeasuredGroupWidths(measured, present);
  }, [measured, props.columnsToggleAvailable]);

  const layout = useMemo(() => toolbarLayout(width, specs), [width, specs]);
  const labelled = layout.labelled;

  const chipGroups = useMemo(() => windowChipGroups(props.windows, props.sessionDetailsByWindow), [props.windows, props.sessionDetailsByWindow]);

  /** The ids the three panel buttons would produce when this one is
   *  flipped — `notebookColumns.ts` takes the whole next set, not the id
   *  that changed. */
  function toggledColumns(id: "graph" | "properties" | "cells"): string[] {
    const next = { ...props.columnVisibility, [id]: !props.columnVisibility[id] };
    return (["graph", "properties", "cells"] as const).filter((columnId) => next[columnId]);
  }

  const distanceOption = props.xModeOptions.find((option) => option.value === "distance");

  /**
   * The commands the ribbon drives itself rather than through the registry.
   *
   * Each of these closes over a prop this component already receives — the
   * save that carries its own in-flight label, the column visibility the
   * three panel buttons flip, the worksheet's X mode — so routing them
   * through `commandRegistry` would only add a hop. Everything *not* in
   * this map is looked up in the registry, and a command with no
   * registration renders disabled, which is R220 item 1's own rule.
   */
  const local: Partial<Record<CommandId, CommandState>> = {
    [COMMAND_IDS.viewToggleCells]: {
      run: () => props.onColumnToggleValue(toggledColumns("cells")),
      enabled: props.columnsToggleAvailable,
      checked: props.columnVisibility.cells,
    },
    [COMMAND_IDS.viewToggleGraph]: {
      run: () => props.onColumnToggleValue(toggledColumns("graph")),
      enabled: props.columnsToggleAvailable,
      checked: props.columnVisibility.graph,
    },
    [COMMAND_IDS.viewToggleProperties]: {
      run: () => props.onColumnToggleValue(toggledColumns("properties")),
      enabled: props.columnsToggleAvailable,
      checked: props.columnVisibility.properties,
    },
    [COMMAND_IDS.workbookSave]: {
      run: props.onSave,
      enabled: props.documentOpen && !props.saveDisabled,
      label: props.saveLabel,
      title: props.saveNote ?? "Save this workbook",
    },
    [COMMAND_IDS.workbookExportReport]: {
      run: props.onExportReport,
      enabled: props.documentOpen && !props.exportDisabled,
      label: props.exporting ? "Building…" : undefined,
      title: "Export this notebook as a PDF report",
    },
    [COMMAND_IDS.libraryRescan]: {
      run: props.onRescan,
      enabled: !props.rescanning,
      label: props.rescanning ? "Rescanning…" : undefined,
      title: "A workbook file copied into the workbooks folder appears here after a rescan.",
    },
    [COMMAND_IDS.viewToggleDense]: {
      run: () => props.onDenseChange(!props.dense),
      enabled: true,
      checked: props.dense,
      title: "Stack cells with no gaps, padding or chrome rows",
    },
    [COMMAND_IDS.viewXAxisTime]: {
      run: () => props.onXModeChange("time"),
      enabled: true,
      checked: props.xMode === "time",
    },
    [COMMAND_IDS.viewXAxisDistance]: {
      run: () => props.onXModeChange("distance"),
      enabled: distanceOption !== undefined && distanceOption.disabledReason === undefined,
      checked: props.xMode === "distance",
      title: distanceOption?.disabledReason,
    },
  };

  /** One command's live state: the local map first, then the registry
   *  (R220 item 1 — an id nothing has registered is disabled, never
   *  hidden). */
  function stateOf(entry: TieredCommand): CommandState {
    const own = local[entry.id];
    if (own !== undefined) return own;
    const id = entry.command;
    if (id === null) return { run: () => undefined, enabled: true };
    return {
      run: () => runCommand(id),
      enabled: registered.has(id),
      title: registered.has(id) ? undefined : `${entry.label} is not available right now.`,
    };
  }

  /** One command as a dropdown entry, at whatever depth it sits. */
  function menuItem(entry: TieredCommand): ReactNode {
    const state = stateOf(entry);
    return (
      <RibbonMenuItem
        key={entry.id}
        label={state.label ?? entry.label}
        icon={entry.icon}
        shortcut={formatShortcut(entry.shortcut, commandGlyph)}
        disabled={!state.enabled}
        checked={state.checked}
        title={state.title}
        onSelect={state.run}
      />
    );
  }

  /** The pointer-mode presets, which come from `interaction/inputMap.ts` at
   *  runtime and so cannot be rows in a static table (R137: "a few presets
   *  for me to try at runtime"). */
  function pointerModeSubmenu(entry: TieredCommand): ReactNode {
    return (
      <RibbonSubmenu key={entry.id} label={entry.label} icon={entry.icon}>
        {props.inputMapPresets.map((preset) => (
          <RibbonMenuItem
            key={preset.id}
            label={preset.label}
            shortcut={null}
            disabled={false}
            checked={preset.id === props.inputMapPreset.id}
            onSelect={() => props.onInputMapPresetChange(preset.id)}
          />
        ))}
      </RibbonSubmenu>
    );
  }

  /** Everything behind one core command's chevron: its occasional block,
   *  then its rare block nested one level further in (R225 item 2). */
  function dropdownFor(parent: CommandId): ReactNode {
    const occasional = childrenOf(parent, "occasional");
    const rare = childrenOf(parent, "rare");
    return (
      <>
        {occasional.map((entry) => (entry.submenu === true ? pointerModeSubmenu(entry) : menuItem(entry)))}
        {rare.length > 0 && (
          <>
            {occasional.length > 0 && <RibbonMenuSeparator />}
            <RibbonSubmenu label="More" title="Maintenance, diagnostics and view toggles">
              {rare.map((entry) => (entry.submenu === true ? pointerModeSubmenu(entry) : menuItem(entry)))}
            </RibbonSubmenu>
          </>
        )}
      </>
    );
  }

  /** One core command as its big button — split when anything hangs behind
   *  it, plain when nothing does. */
  function coreButton(entry: TieredCommand): ReactNode {
    const state = stateOf(entry);
    const label = state.label ?? entry.label;
    const dropdown = dropdownFor(entry.id);
    const hasMenu = childrenOf(entry.id, "occasional").length > 0 || childrenOf(entry.id, "rare").length > 0;

    if (!hasMenu) {
      return (
        <RibbonBigButton
          key={entry.id}
          icon={entry.icon}
          label={label}
          labelled={labelled}
          disabled={!state.enabled}
          pressed={state.checked}
          title={state.title}
          onClick={state.run}
        />
      );
    }

    return (
      <RibbonSplitButton
        key={entry.id}
        icon={entry.icon}
        label={label}
        labelled={labelled}
        disabled={!state.enabled}
        pressed={state.checked}
        title={state.title}
        onClick={entry.command === null ? null : state.run}
      >
        {dropdown}
      </RibbonSplitButton>
    );
  }

  /** The occasional commands of `group` promoted onto the row as small
   *  buttons (R225 item 4). Only plain actions are promoted: a choice
   *  between two axes and a list of pointer presets are not buttons, and
   *  stay where they read correctly, inside the View dropdown. */
  function promoted(group: RibbonGroupId): ReactNode {
    if (!showOccasional) return null;
    const entries = coreCommands(group).flatMap((core) =>
      childrenOf(core.id, "occasional").filter((entry) => entry.command !== null && entry.toggle !== true && entry.submenu !== true),
    );
    return entries.map((entry) => {
      const state = stateOf(entry);
      return (
        <RibbonSmallButton
          key={entry.id}
          label={state.label ?? entry.label}
          disabled={!state.enabled}
          title={state.title}
          onClick={state.run}
        />
      );
    });
  }

  /** The open workbook's name. Not a command, so not in the tier table: it
   *  is the answer to "which document am I in", which the file group would
   *  otherwise not state anywhere. */
  function workbookChip(): ReactNode {
    const entry = props.entry;
    if (entry === null || entry.kind === "empty") return null;
    const name = entry.kind === "choice" ? (entry.choices.find((choice) => choice.workbook_id === entry.workbookId)?.name ?? null) : null;
    if (name === null) return null;

    return (
      <span
        className="flex min-w-0 shrink-0 items-center gap-[var(--nb-pad)] font-mono text-[length:var(--nb-text-label)] text-fg-dim"
        title={props.dirty ? `${name} — unsaved edits` : name}
      >
        <span className="max-w-[16ch] truncate">{name}</span>
        {props.dirty && <span aria-label="Unsaved edits" className="size-[5px] shrink-0 rounded-full bg-accent" />}
      </span>
    );
  }

  /** One group's contents. The same element renders inline on the row and,
   *  when the group has collapsed, inside the "⋯" menu — so a control
   *  never gains or loses behaviour by moving between the two. */
  function group(id: ToolbarGroupId, labelled: boolean): ReactNode {
    switch (id) {
      case "panels":
        return props.columnsToggleAvailable ? (
          <div className="flex flex-nowrap items-center gap-[var(--nb-gap)]" role="group" aria-label="Notebook panels">
            {coreCommands("panels").map((entry) => coreButton(entry))}
          </div>
        ) : null;

      case "file":
        return (
          <div className="flex flex-nowrap items-center gap-[var(--nb-gap)]">
            {coreCommands("file").map((entry) => coreButton(entry))}
            {promoted("file")}
            {workbookChip()}
          </div>
        );

      case "library":
        return (
          <div className="flex flex-nowrap items-center gap-[var(--nb-gap)]">
            {coreCommands("library").map((entry) => coreButton(entry))}
            {promoted("library")}
          </div>
        );

      case "view":
        return (
          <div className="flex flex-nowrap items-center gap-[var(--nb-gap)]">
            {coreCommands("view").map((entry) => coreButton(entry))}
            <RegisterSwitch register={props.register} onRegisterChange={props.onRegisterChange} labelled={labelled} />
            {/* R225 item 5: Paper/Studio and R213's preset picker stay here
                untouched until R227 replaces presets. Single-select, and a
                `"custom"` state selects nothing — `ToggleGroup`'s
                `type="single"` reports `""` when the pressed item is
                pressed again, which `isLayoutPresetId` drops, so a preset
                can be re-applied but never un-applied into a state with no
                name. */}
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
          </div>
        );

      case "window":
        return (
          <div className="flex min-w-0 flex-nowrap items-center gap-[var(--nb-gap)] font-mono text-[length:var(--nb-text-label)]" aria-label="Selected windows">
            {chipGroups.length === 0 ? (
              <span className="truncate text-fg-faint">{NO_SELECTION_TEXT}</span>
            ) : (
              chipGroups.map((chip) => (
                <span
                  key={chip.sessionId}
                  className="flex min-w-0 shrink-0 items-center gap-[var(--nb-pad)] rounded-[var(--radius-structural)] border border-rule bg-control px-[var(--nb-pad)] py-px"
                  title={`${chip.sessionText} — ${chip.spans.map((s) => s.text).join(", ")}`}
                >
                  {/* Bounded, because the group no longer shrinks (R216
                      item 4): a long session name would otherwise set the
                      group's measured width and push everything else into
                      the overflow menu. */}
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
    }
  }

  const inline = layout.inline.filter((id) => group(id, labelled) !== null);

  return (
    <div
      ref={rowRef}
      className="idl-dense flex h-[var(--shell-ribbon-h)] flex-nowrap items-center gap-[var(--nb-gap)] overflow-hidden border-b border-rule bg-surface px-[var(--nb-gap)]"
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
        <div key={id} className={`flex shrink-0 flex-nowrap items-center gap-[var(--nb-gap)] ${id === "transport" ? "mx-auto" : ""}`}>
          {index > 0 && <GroupDivider />}
          <div ref={groupRef(id, labelled)} className="flex min-w-0 shrink-0 flex-nowrap items-center gap-[var(--nb-gap)]">
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

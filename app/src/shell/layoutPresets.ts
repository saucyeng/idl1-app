/**
 * The four named studio arrangements (ruling R213 item 1). Isaac,
 * 2026-09-11: "hop back to having the output notebook fullscreen when I'm
 * done with maths; different setups on my ultrawide vs 16:9; stack the
 * sources and maths map vertically on 16:9".
 *
 * A preset is **not** a new window manager: it is one write over the column
 * mechanism that already exists — the R161 show/hide toggles' visibility
 * record, plus the one bit of `ColumnFrame` geometry R213 adds (the maths
 * panel as a row above the output instead of a column beside it) and the
 * output column's width. Everything a preset sets, a user can then change
 * by hand; doing so moves the active preset to `"custom"`
 * ({@link presetAfterColumnChange}) so the toggles and the preset picker can
 * never disagree about what is on screen.
 *
 * The output register (Paper · Studio, R184) is an independent switch and is
 * deliberately absent here — R213 item 1's own last line.
 *
 * Pure and dependency-free apart from {@link AspectClass}
 * (`toolbarLayout.ts`'s pattern): no `react` import, no DOM, no storage. The
 * store that persists the active preset is `shell/layoutPreset.ts`.
 */

import type { AspectClass } from "./aspectClass";

/** The four presets (R213 item 1), in cycle order. */
export type LayoutPresetId = "output" | "maths" | "split" | "stacked";

/** What a class's remembered preset can be: one of the four, or `"custom"`
 *  — the state a hand-thrown column toggle leaves behind until a preset is
 *  picked again (R213 item 3). */
export type ActivePreset = LayoutPresetId | "custom";

/** The order `Ctrl+Shift+L` walks (R213 item 3: "Output → Maths → Split →
 *  Stacked → …"). */
export const LAYOUT_PRESET_CYCLE: readonly LayoutPresetId[] = ["output", "maths", "split", "stacked"];

/** Which of the three R161 panes a preset turns on. Structurally the
 *  Notebook page's own `NotebookColumnVisibility`
 *  (`routes/pages/Notebook/model/notebookColumns.ts`), restated here rather
 *  than imported because `shell/` never imports from `routes/pages/` — the
 *  traffic between the two always runs page → shell (`graphSlot.ts`,
 *  `studioColumns.ts`). The two types are assignable either way. */
export type PresetColumnVisibility = Readonly<Record<"graph" | "properties" | "cells", boolean>>;

/** Where the maths panel sits in the frame: `"column"` beside the output
 *  (Output/Maths/Split), `"row"` above it (Stacked, R213 item 1). */
export type MathsOrientation = "column" | "row";

/** The output column's narrowest usable width, in CSS px — the Maths
 *  preset's "output narrow (min width, still live)" (R213 item 1) and, so
 *  the two can never drift apart, `columnPrefs.ts`'s own lower bound for
 *  that column. */
export const OUTPUT_COLUMN_MIN_WIDTH_PX = 320;

/** Everything one preset decides. */
export interface PresetLayout {
  /** The R161 pane toggles this preset writes. */
  columns: PresetColumnVisibility;
  /** Where the maths panel goes. */
  mathsOrientation: MathsOrientation;
  /** The output column's width in CSS px, or `null` to keep whatever width
   *  the user last dragged it to (`columnPrefs.ts`). Only the Maths preset
   *  pins a width. */
  outputWidthPx: number | null;
}

/** One preset's picker entry: the id, the word on the button, the mono
 *  glyph shown in its place once the toolbar row drops labels (R212), and
 *  the sentence its tooltip says. */
export interface LayoutPresetSpec extends PresetLayout {
  id: LayoutPresetId;
  label: string;
  /** A single mono character — the "icon" of R213 item 3's "four icons with
   *  labels at the density scale". Box-drawing rather than an icon font: the
   *  toolbar is already mono at `--nb-text-label`, and these draw the actual
   *  arrangement. */
  glyph: string;
  title: string;
}

/**
 * The four presets, in {@link LAYOUT_PRESET_CYCLE} order.
 *
 * `cells` is on in every one of them, including Output. R213 item 1 words
 * that preset as "notebook output full width; graph, properties, cells
 * collapsed", but in the studio the cell list *is* the notebook output —
 * it is what the `output` column renders (`RouteHost.tsx` docks the whole
 * Notebook page there, and the maths/properties panels are portal slots).
 * Turning `cells` off would either leave the preset with nothing on screen
 * or, through `notebookColumns.ts`'s never-all-off guard, be refused
 * outright and change nothing. Lane-local reading, said out loud rather
 * than assumed (CLAUDE.md §1): Output = the output column alone, full
 * width.
 */
export const LAYOUT_PRESETS: readonly LayoutPresetSpec[] = [
  {
    id: "output",
    label: "Output",
    glyph: "▭",
    title: "Output — the notebook full width, maths and properties hidden",
    columns: { graph: false, properties: false, cells: true },
    mathsOrientation: "column",
    outputWidthPx: null,
  },
  {
    id: "maths",
    label: "Maths",
    glyph: "◫",
    title: "Maths — graph, properties and cells, with the output at its narrowest",
    columns: { graph: true, properties: true, cells: true },
    mathsOrientation: "column",
    outputWidthPx: OUTPUT_COLUMN_MIN_WIDTH_PX,
  },
  {
    id: "split",
    label: "Split",
    glyph: "▥",
    title: "Split — the studio's side-by-side columns",
    columns: { graph: true, properties: true, cells: true },
    mathsOrientation: "column",
    outputWidthPx: null,
  },
  {
    id: "stacked",
    label: "Stacked",
    glyph: "▤",
    title: "Stacked — the maths graph as a row above the output",
    columns: { graph: true, properties: true, cells: true },
    mathsOrientation: "row",
    outputWidthPx: null,
  },
];

/** Each class's preset before anything has been stored for it (R213 item 2:
 *  "ultrawide → Split, wide → Stacked, narrow → Output"). */
export const DEFAULT_PRESET_BY_CLASS: Readonly<Record<AspectClass, LayoutPresetId>> = {
  ultrawide: "split",
  wide: "stacked",
  narrow: "output",
};

/** What `id` sets. Total over {@link LayoutPresetId}. */
export function presetLayout(id: LayoutPresetId): PresetLayout {
  // Unreachable fallback for a `LayoutPresetId` (the table is exhaustive);
  // it exists so this function is total for a value that crossed a
  // `localStorage` boundary and dodged `asActivePreset`.
  const spec = LAYOUT_PRESETS.find((candidate) => candidate.id === id) ?? LAYOUT_PRESETS[0]!;
  // Projected rather than returned whole: a preset's picker text is not
  // part of what it does to the layout, and a caller comparing layouts
  // should not have to ignore three strings.
  return { columns: spec.columns, mathsOrientation: spec.mathsOrientation, outputWidthPx: spec.outputWidthPx };
}

/** Whether `raw` names one of the four presets. */
export function isLayoutPresetId(raw: unknown): raw is LayoutPresetId {
  return typeof raw === "string" && LAYOUT_PRESET_CYCLE.includes(raw as LayoutPresetId);
}

/** Narrows a restored `localStorage` value to an {@link ActivePreset},
 *  falling back to `fallback` for anything else (absent, wrong type, a
 *  preset id this version no longer has). Total over `raw`. */
export function asActivePreset(raw: unknown, fallback: ActivePreset): ActivePreset {
  if (raw === "custom") return "custom";
  return isLayoutPresetId(raw) ? raw : fallback;
}

/**
 * The next preset in {@link LAYOUT_PRESET_CYCLE} — what `Ctrl+Shift+L`
 * applies (R213 item 3). From `"custom"` the cycle restarts at its first
 * entry, so the shortcut always lands somewhere nameable rather than
 * needing a remembered position inside a state that has none.
 */
export function nextPreset(active: ActivePreset): LayoutPresetId {
  if (active === "custom") return LAYOUT_PRESET_CYCLE[0]!;
  const index = LAYOUT_PRESET_CYCLE.indexOf(active);
  return LAYOUT_PRESET_CYCLE[(index + 1) % LAYOUT_PRESET_CYCLE.length]!;
}

/** Where the "thrown by hand" bookkeeping went (ruling R239). `presetMatches`
 *  and `presetAfterColumnChange` lived here and compared a visibility record
 *  plus one orientation flag; a dock has neither. `dockLayout.ts`'s
 *  `matchingNamedLayout` asks the same question of the whole layout
 *  document instead, and `layoutPreset.ts` applies the same "still active
 *  unless it left" rule to the answer. */

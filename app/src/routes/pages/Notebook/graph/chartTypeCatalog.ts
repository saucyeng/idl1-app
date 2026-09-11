/**
 * Display metadata for the card's chart-type picker (decision 83, "idl0
 * pictograms carry over" — Isaac's own words: *"my chart type selector was
 * really pretty, I want those small chart type images to carry over"*).
 *
 * **Scope (ruling R215).** idl0's own picker (`idl0-app/app/lib/ui/tabs/
 * analyze/chart_type_catalog.dart`) covered a whole workbook's chart
 * *kinds* — time series, FFT, spectrogram, histogram, GPS map, lap table,
 * lap progression, variance trace, scatter. This catalog offers two things
 * side by side, which is why an entry's `mark` is nullable:
 *
 * - the five **time-cell marks** (`plotForm/types.ts`'s `MARK_NAMES`,
 *   C2 §5.3's `time_mark` production), each inserting a `chart: "time"`
 *   cell over a single node's already-computed value; and
 * - one entry per **whole-cell chart kind** C2 §5.3 has a production for
 *   — the FFT cell (`chart: "fft"`), whose grammar, engine command
 *   (`fetch_fft_v2`) and Properties section all already existed but which
 *   no picker row offered (R215 item 1), and the histogram cell
 *   (`chart: "histogram"`, `fetch_histogram`, R215 item 2) and the
 *   scatter cell (`chart: "scatter"`, `fetch_scatter`, R215 item 3); and
 * - one entry per **preset over the time cell** whose picture is distinct
 *   enough to deserve its own row — today the lap variance trace
 *   (`"variance"`, R215 item 4), which charts `"time"` on a lap-relative
 *   axis and so carries no mark of its own.
 *
 * `graph/chartTypeIcons.tsx` draws a pictogram for each entry inline (no
 * pictogram asset exists in this repo to import — see that module's own
 * doc comment) rather than reusing idl0's Material glyphs, which were
 * never a bundled asset either.
 */

import type { MarkProps, PlotProps } from "../plotForm/types";
import { MARK_NAMES } from "../plotForm/types";

/** What one picker row inserts: one of C2 §5.3's five time-cell mark names
 *  (a `chart: "time"` cell drawn with that mark), or the name of a
 *  whole-cell chart kind the grammar has its own production for. The two
 *  live in one union, and one catalog, because the picker presents them as
 *  one row of pictograms — the distinction between "a mark" and "a chart
 *  kind" is C2 §5.3's, not the user's. */
export type ChartTypeId =
  | MarkProps["mark"]
  | "fft"
  | "histogram"
  | "scatter"
  | "map"
  | "lap"
  | "spectrogram"
  | "variance";

/** Every {@link ChartTypeId}, in the picker's presentation order: the five
 *  marks first (unchanged order), then each whole-cell chart kind. The
 *  single source `CHART_TYPE_CATALOG`, `CHART_TYPE_ICONS` and
 *  `chartTypeCatalog.test.ts` all enumerate against, the same discipline
 *  `MARK_NAMES` already carries for the mark half. */
export const CHART_TYPE_IDS: readonly ChartTypeId[] = [
  ...MARK_NAMES,
  "fft",
  "histogram",
  "scatter",
  "map",
  "lap",
  "spectrogram",
  "variance",
];

/** One chart type's picker-row metadata: what it inserts, a human-facing
 *  label, and a one-line blurb (idl0's own picker convention,
 *  `chart_type_catalog.dart`'s `ChartTypeInfo.blurb`). */
export interface ChartTypeInfo {
  id: ChartTypeId;
  /** The time-cell mark this row inserts, or `null` when this row is not
   *  simply "a time cell drawn with this mark" — either because `id` names
   *  a whole-cell chart kind (C2 §5.3's own `chart` discriminant), or
   *  because it is a **preset** over the time cell whose picture is not a
   *  plain line (`"variance"`, ruling R215 item 4, which charts `"time"`
   *  but on a lap-relative axis). Nullable rather than absent so
   *  `NodeCard.tsx`'s header glyph — which shows a node's *mark* — can ask
   *  one question of any entry. */
  mark: MarkProps["mark"] | null;
  /** The `PlotProps.chart` discriminant a cell inserted from this row
   *  carries (C2 §5.3). `"time"` for every mark row. */
  chart: PlotProps["chart"];
  label: string;
  blurb: string;
}

/** Per-chart-type display metadata, in {@link CHART_TYPE_IDS}' order. Kept
 *  in lockstep with that list by `chartTypeCatalog.test.ts` — an id added
 *  to one and not the other is a drift bug that test catches immediately,
 *  the same discipline `plotForm/types.ts`'s own doc comment already
 *  states for `MARK_NAMES` itself. */
export const CHART_TYPE_CATALOG: readonly ChartTypeInfo[] = [
  { id: "lineY", mark: "lineY", chart: "time", label: "Line", blurb: "Value over time, one line." },
  { id: "dot", mark: "dot", chart: "time", label: "Dot", blurb: "One point per sample." },
  { id: "areaY", mark: "areaY", chart: "time", label: "Area", blurb: "Value over time, filled to the axis." },
  { id: "rectY", mark: "rectY", chart: "time", label: "Bar", blurb: "One bar per sample." },
  { id: "ruleY", mark: "ruleY", chart: "time", label: "Rule", blurb: "A horizontal reference line." },
  { id: "fft", mark: null, chart: "fft", label: "FFT", blurb: "Magnitude spectrum of one channel." },
  { id: "histogram", mark: null, chart: "histogram", label: "Histogram", blurb: "How often one channel sits at each value." },
  { id: "scatter", mark: null, chart: "scatter", label: "Scatter", blurb: "One channel against another — the G-G cloud." },
  { id: "map", mark: null, chart: "map", label: "Map", blurb: "The GPS trace, projected, over the track outline." },
  { id: "lap", mark: null, chart: "lap", label: "Lap progression", blurb: "One value per lap, against lap number." },
  {
    id: "spectrogram",
    mark: null,
    chart: "spectrogram",
    label: "Spectrogram",
    blurb: "One channel's frequency content over time.",
  },
  { id: "variance", mark: null, chart: "time", label: "Lap variance", blurb: "One lap-delta definition, every selected lap on one axis." },
];

/** Looks up `id`'s {@link ChartTypeInfo}. Every {@link ChartTypeId} has a
 *  catalog entry (enforced by `chartTypeCatalog.test.ts`), so this never
 *  falls through to a made-up default. */
export function chartTypeInfo(id: ChartTypeId): ChartTypeInfo {
  const info = CHART_TYPE_CATALOG.find((c) => c.id === id);
  if (info === undefined) throw new Error(`chartTypeInfo: no catalog entry for chart type "${id}" — CHART_TYPE_IDS and CHART_TYPE_CATALOG have drifted`);
  return info;
}

// Re-exported so a caller of this catalog does not also need a separate
// import of `plotForm/types.ts` just to iterate the same five mark names.
export { MARK_NAMES };

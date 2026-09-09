/**
 * Display metadata for the card's chart-type picker (decision 83, "idl0
 * pictograms carry over" — Isaac's own words: *"my chart type selector was
 * really pretty, I want those small chart type images to carry over"*).
 *
 * **Scope, deliberately narrow.** idl0's own picker (`idl0-app/app/lib/ui/
 * tabs/analyze/chart_type_catalog.dart`) covered a whole workbook's chart
 * *kinds* — time series, FFT, spectrogram, histogram, GPS map, lap table,
 * lap progression, variance trace, scatter. This card's button only ever
 * inserts one `js` cell charting a single node's already-computed value
 * (`graphToChart.ts`'s `insertChartCell`), which the notebook can only
 * currently render as a **Plot mark** (C2 §5.3's `mark` production) — this
 * catalog offers exactly `MarkProps.mark`'s five values (`plotForm/
 * types.ts`'s `MARK_NAMES`), nothing idl0 had that this app cannot draw.
 * `graph/chartTypeIcons.tsx` draws a pictogram for each entry inline (no
 * pictogram asset exists in this repo to import — see that module's own
 * doc comment) rather than reusing idl0's Material glyphs, which were
 * never a bundled asset either.
 */

import type { MarkProps } from "../plotForm/types";
import { MARK_NAMES } from "../plotForm/types";

/** One chart type's picker-row metadata: the mark it inserts, a
 *  human-facing label, and a one-line blurb (idl0's own picker convention,
 *  `chart_type_catalog.dart`'s `ChartTypeInfo.blurb`). */
export interface ChartTypeInfo {
  mark: MarkProps["mark"];
  label: string;
  blurb: string;
}

/** Per-mark display metadata, in the picker's presentation order. Kept in
 *  lockstep with `MARK_NAMES` by `chartTypeCatalog.test.ts` — a mark added
 *  to one and not the other is a drift bug that test catches immediately,
 *  the same discipline `plotForm/types.ts`'s own doc comment already
 *  states for `MARK_NAMES` itself. */
export const CHART_TYPE_CATALOG: readonly ChartTypeInfo[] = [
  { mark: "lineY", label: "Line", blurb: "Value over time, one line." },
  { mark: "dot", label: "Dot", blurb: "One point per sample." },
  { mark: "areaY", label: "Area", blurb: "Value over time, filled to the axis." },
  { mark: "rectY", label: "Bar", blurb: "One bar per sample." },
  { mark: "ruleY", label: "Rule", blurb: "A horizontal reference line." },
];

/** Looks up `mark`'s {@link ChartTypeInfo}. Every {@link MarkProps.mark}
 *  value has a catalog entry (enforced by `chartTypeCatalog.test.ts`), so
 *  this never falls through to a made-up default. */
export function chartTypeInfo(mark: MarkProps["mark"]): ChartTypeInfo {
  const info = CHART_TYPE_CATALOG.find((c) => c.mark === mark);
  if (info === undefined) throw new Error(`chartTypeInfo: no catalog entry for mark "${mark}" — MARK_NAMES and CHART_TYPE_CATALOG have drifted`);
  return info;
}

// Re-exported so a caller of this catalog does not also need a separate
// import of `plotForm/types.ts` just to iterate the same five names.
export { MARK_NAMES };

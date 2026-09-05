/** One mark in the Properties form's state (C2 §5.3's `mark` production).
 *  `lap` is a 1-based lap number (C3 §3.2's `LapSummary.number`) or null
 *  for session scope; `strokeWidth` is in CSS pixels. */
export interface MarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY" | "rectY" | "ruleY";
  lap?: number | null;
  stroke?: string;      // any valid CSS colour literal
  strokeWidth?: number; // px
}

/** C2 §5.3's `x_scale` production. `type` is intentionally absent — see
 *  the note below. */
export interface XAxisProps {
  label?: string;
  /** [min, max] in the channel's native x unit (seconds since session
   *  start, per §5.1). */
  domain?: [number, number];
}

/** C2 §5.3's `y_scale` production. */
export interface YAxisProps {
  label?: string;
  domain?: [number, number];
  type?: "linear" | "log" | "sqrt";
}

/** C2 §5.3's `plot_options` production — the Properties pane's whole
 *  internal state for one `js` cell in the `plotForm` subset.
 *
 *  `x.type` is deliberately absent from `XAxisProps`: C2 §5.3 says the
 *  generator never emits it (the grammar's `x_field` allows only the
 *  literal `"linear"`, reserved for a future non-time x-axis, C2 §8-2).
 *  Admitting a field the generator cannot write would make round-trip
 *  (Task 3) provably false for any props carrying it. */
export interface PlotProps {
  /** Required; the form always seeds one mark (C2 §5.3). */
  marks: MarkProps[];
  x?: XAxisProps;
  y?: YAxisProps;
  color?: { legend: true };
}

/**
 * Prop types for {@link PropertiesForm} (design §6, D13). A fully
 * self-contained prop surface — no React context, no store, no IPC, no
 * router — so wave 3's React Flow graph view can host this exact
 * component inside a node with no wiring beyond these props (2026-09-05
 * operating-brief ruling: "two editing surfaces, not three").
 */

/** One selectable channel/definition for a mark's channel picker (design
 *  §6; C2 §5.1's `channel()` name). `id` is the string passed to
 *  `plotForm`'s `channel(id)`; `label` is the human-facing name shown in
 *  the picker. */
export interface PropertiesFormChannelOption {
  id: string;
  label: string;
}

/** One lap available for a mark's lap-scope picker (C3 §3.2's
 *  `LapSummary.number`, 1-based). "Session" scope (`MarkProps.lap ===
 *  null`) is always offered by the picker in addition to these. */
export interface PropertiesFormLapOption {
  number: number;
}

/** Props for {@link PropertiesForm}. */
export interface PropertiesFormProps {
  /** The cell's current `js` source. Re-parsed on every render (not just
   *  mount), so an edit made directly in the Code pane is reflected here
   *  immediately (design §6: "bidirectional inside that subset"). */
  code: string;
  /** Channels/definitions available for a mark's channel picker. */
  channels: PropertiesFormChannelOption[];
  /** Laps available for a mark's lap-scope picker. */
  laps: PropertiesFormLapOption[];
  /** C2 §1's workbook-level unit-system preference. Steers only which
   *  unit *string* an axis-label suggestion would offer, never a value
   *  conversion (C2 §1: "no v3 construct converts units") — see this
   *  component's file-level doc comment for why no automatic suggestion
   *  is wired from this prop yet. */
  unitsPreference: "si" | "imperial";
  /** Called with `generate`'s output every time a control changes the
   *  form's `PlotProps`, and by "Reset to form" once the discard warning
   *  is confirmed. Never called with a hand-typed string. */
  onChange: (nextCode: string) => void;
}

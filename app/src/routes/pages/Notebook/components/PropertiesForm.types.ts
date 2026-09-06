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
 *  the picker. `unit`, when present and non-empty, is C1's per-channel unit
 *  (`SessionDetail.channels[].unit`, `app/src/ipc/catalog.ts`'s
 *  `ChannelSummary.unit`) — ruling R65 (`runs/2026-09-03/decisions.md`): no
 *  quantity→unit table exists in TypeScript, so this component seeds an
 *  axis-label suggestion straight from the channel's own recorded unit
 *  string rather than looking one up by physical quantity. Absent or `""`
 *  means no suggestion is offered for that channel. */
export interface PropertiesFormChannelOption {
  id: string;
  label: string;
  unit?: string;
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
  /** C2 §1's workbook-level unit-system preference. **Has no effect in
   *  wave 2** (ruling R65): with no quantity→unit table in TypeScript, the
   *  axis-label suggestion this component offers comes straight from
   *  `channels[].unit` (a channel's single recorded unit, C1 §4.1) rather
   *  than a per-quantity si/imperial choice — there is nothing here for
   *  `unitsPreference` to steer yet. Kept in the prop surface for forward
   *  compatibility with a future quantity table, not read by this
   *  component's current logic. */
  unitsPreference: "si" | "imperial";
  /** Called with `generate`'s output every time a control changes the
   *  form's `PlotProps`, and by "Reset to form" once the discard warning
   *  is confirmed. Never called with a hand-typed string. */
  onChange: (nextCode: string) => void;
}

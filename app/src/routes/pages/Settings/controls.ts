/** A titled group of chart-interaction shortcuts, e.g. "mouse wheel" or
 *  "keyboard". Each row is an `[action, keystroke]` tuple rather than an
 *  object, matching idl0's `_ControlsGroup` row shape verbatim (R53 Q2). */
export interface ControlGroup {
  /** Group heading, e.g. `"keyboard"`. Rendered uppercase, as idl0 did. */
  title: string;
  /** `[action, keystroke]` pairs, in display order. */
  rows: readonly (readonly [string, string])[];
}

/** The chart controls reference: mouse-wheel, mouse and keyboard shortcuts
 *  for the notebook chart.
 *
 * **Provisional (R53 Q2).** This table is carried verbatim from idl0's
 * `settings_tab.dart` `_ControlsSection`. The actual chart bindings belong
 * to L6's notebook, which is being built concurrently in wave 2 — once L6
 * merges its real `kDefaultChartBindings`-equivalent, this table must be
 * updated (or replaced by an import from L6, per Open question 2(b) in
 * `docs/superpowers/plans/2026-09-05-idl1-wave2-l7c-settings-tab.md`, which
 * needs the lead's blessing since it crosses lane ownership). Until then,
 * `ControlsSection.tsx` renders a visible "provisional" label alongside
 * this table so the UI itself does not claim these bindings are live. */
export const CONTROL_GROUPS: readonly ControlGroup[] = [
  {
    title: "mouse wheel",
    rows: [
      ["Zoom at cursor", "Ctrl + Wheel"],
      ["Pan", "Shift + Wheel"],
      ["Scroll worksheet", "Wheel"],
    ],
  },
  {
    title: "mouse",
    rows: [
      ["Place cursor", "Left-click"],
      ["Context menu", "Right-click"],
      ["Zoom to box", "Right-click + drag"],
      ["Reset view", "Double-click"],
    ],
  },
  {
    title: "keyboard",
    rows: [
      ["Zoom X in / out", "Alt + → / ←"],
      ["Zoom Y in / out", "Alt + ↑ / ↓"],
      ["Pan", "Shift + Arrows"],
      ["Zoom X full out", "F2"],
      ["Zoom Y full out", "Alt + F2"],
      ["Zoom to cursors", "Z"],
      ["Swap cursors", "X"],
      ["Copy cursor values", "Ctrl + Shift + C"],
      ["Chart properties", "F5"],
    ],
  },
];

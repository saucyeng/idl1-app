import { actionLabel, type ChartAction } from "../Notebook/interaction/chartActions";

/** A titled group of chart-interaction shortcuts, e.g. "mouse wheel" or
 *  "keyboard". Each row is an `[action, keystroke]` tuple rather than an
 *  object, matching idl0's `_ControlsGroup` row shape verbatim (R53 Q2). */
export interface ControlGroup {
  /** Group heading, e.g. `"keyboard"`. Rendered uppercase, as idl0 did. */
  title: string;
  /** `[action, keystroke]` pairs, in display order. */
  rows: readonly (readonly [string, string])[];
}

/** The keyboard-bound `ChartAction`s, in the order the "keyboard" group
 *  should list them — the single place that order is declared, since
 *  {@link KEYBOARD_ROWS} below derives every row's label and keystroke
 *  from `interaction/chartActions.ts`'s {@link actionLabel} rather than
 *  hand-copying them. `interaction/chartActions.test.ts`'s "a hint exactly
 *  when keymap.ts binds it" test is what keeps this list itself honest
 *  against `interaction/keymap.ts` — a newly-bound action with no hint
 *  entry there fails that test before it could go silently missing here. */
const KEYBOARD_ACTIONS: readonly ChartAction[] = [
  "zoomIn",
  "zoomOut",
  "panLeft",
  "panRight",
  "resetZoom",
  "zoomToSelection",
  "copyValue",
];

/** The "keyboard" group's rows, generated from {@link KEYBOARD_ACTIONS} via
 *  `chartActions.ts`'s {@link actionLabel} — the landed Notebook chart
 *  bindings (UI-11), not a hand-maintained copy of them. This is what
 *  keeps this table from re-diverging silently from `interaction/keymap.ts`
 *  the way idl0's `_ControlsSection` table (still used verbatim for the
 *  "mouse wheel"/"mouse" groups below, which have no landed replacement
 *  yet) once did. */
const KEYBOARD_ROWS: readonly (readonly [string, string])[] = KEYBOARD_ACTIONS.map((action) => {
  const { label, hint } = actionLabel(action);
  // `hint` is non-null for every action in this list — guaranteed by
  // `chartActions.test.ts`'s pairing test — but typed as nullable, so a
  // literal fallback keeps this module's own typing honest without a cast.
  return [label, hint ?? "(unbound)"] as const;
});

/** The chart controls reference: mouse-wheel, mouse and keyboard shortcuts
 *  for the notebook chart.
 *
 * **Partially provisional (R53 Q2).** The "mouse wheel" and "mouse" groups
 * below are still carried verbatim from idl0's `settings_tab.dart`
 * `_ControlsSection` — UI-11 (L6's notebook lane) landed a right-click
 * action menu and drag-to-zoom, but not click-to-zoom-at-cursor or a wheel
 * binding, so those two groups have no landed equivalent to derive from
 * yet. The "keyboard" group **is** the landed table ({@link KEYBOARD_ROWS}),
 * generated from `interaction/chartActions.ts`/`interaction/keymap.ts`
 * rather than idl0's. `ControlsSection.tsx` still renders the "provisional"
 * banner for the groups that remain so. */
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
    rows: KEYBOARD_ROWS,
  },
];

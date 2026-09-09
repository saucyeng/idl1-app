/**
 * Small, shared helpers over `ipc/workbook.ts`'s three-state `UnitLabel`
 * (rulings R154/R162) — kept out of any one caller's own model file since
 * both a raw C1 channel (`cursorCard.ts`'s cursor-value card, ruling R154
 * item 6; `jsCellBinding.ts`'s host-variable binding, `sourcePalette.ts`'s
 * channel rows) and an evaluated `math` definition (`CellDefResult.unit`)
 * need the same "no unit string" → `UnitLabel` conversion and the same
 * "what text does a reader see" projection. Pure, no `@/components/*`.
 */
import type { UnitLabel } from "../../../../ipc/workbook";

/**
 * Converts a raw C1 §4.1 unit string (`ChannelSummary.unit`/
 * `SessionDetail.channels[].unit`) into the three-state {@link UnitLabel}
 * (R154 item 6: a raw channel adopts the same three-state label a `math`
 * definition does, so a card never has to render two meanings of a blank
 * unit). C1 never records "genuinely dimensionless" for a raw channel —
 * §4.1's importer text is explicit that `""` means only "the header
 * supplied none" — so this never returns `dimensionless`; a non-empty
 * string is `known`, an empty one is `unknown` with the same reason text
 * `crate::math::units::UnknownReason::NoSourceUnit::describe` uses on the
 * Rust side, so the two paths read identically to a user.
 */
export function rawUnitToLabel(unit: string): UnitLabel {
  return unit === "" ? { state: "unknown", reason: "no unit recorded for this channel" } : { state: "known", text: unit };
}

/**
 * The display text for a {@link UnitLabel} where a caller wants one plain
 * string and nowhere to show the other two states distinctly (e.g. a
 * legacy `"{value} {unit}"` suffix) — `known`'s own text, `""` for both
 * `dimensionless` and `unknown` alike. A caller that must tell "no unit"
 * apart from "we don't know" (C2 §3.3.1's whole point) reads `.state`
 * itself instead of calling this.
 */
export function unitLabelText(unit: UnitLabel): string {
  return unit.state === "known" ? unit.text : "";
}

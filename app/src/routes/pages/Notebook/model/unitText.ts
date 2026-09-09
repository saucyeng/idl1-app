/**
 * Renders `CellDefResult`'s three-state `UnitLabel` (`ipc/workbook.ts`,
 * ruling R154) as display text — the one shared helper `MathCell.tsx` and
 * `model/report/document.ts`'s `defTable` both call, so the screen and the
 * printed report can never disagree about what a definition's unit says
 * (task R3, `runs/2026-09-09/report-plan.md`).
 *
 * Extracted from `model/report/document.ts`'s own inline copy (task R1) —
 * that was the report's own stopgap; `MathCell.tsx` still shows no unit or
 * rate at all today, the live gap R166's ruling called out while
 * surveying the report lane. Fixing both here, once.
 */
import type { UnitLabel } from "../../../../ipc/workbook";

/** `known` -> its text; `dimensionless` -> nothing, no marker;
 *  `unknown` -> nothing here either, but `unknownReason` carries why, for
 *  a caller to render as a superscript/footnote marker rather than
 *  silently rendering the same blank a dimensionless value gets (plan
 *  §3.2, R154). */
export interface UnitDisplay {
  text: string;
  unknownReason: string | null;
}

/** Formats `unit` per the three-state rule (plan §3.2). */
export function formatUnit(unit: UnitLabel): UnitDisplay {
  switch (unit.state) {
    case "known":
      return { text: unit.text, unknownReason: null };
    case "dimensionless":
      return { text: "", unknownReason: null };
    case "unknown":
      return { text: "", unknownReason: unit.reason };
    default:
      return { text: "", unknownReason: null };
  }
}

/** Formats `sample_rate_hz` for display: `null` (genuinely not
 *  applicable, R152) renders as nothing — never as "unknown" — and a real
 *  rate renders as `"<hz> Hz"`. */
export function formatRate(sampleRateHz: number | null): string | null {
  return sampleRateHz === null ? null : `${sampleRateHz} Hz`;
}

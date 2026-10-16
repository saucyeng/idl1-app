import type { Entry } from "../../../ipc/bikelog";
import { newId } from "./notesModel";
import type { Random } from "./notesModel";

/**
 * The setup sheet's fields (bike-log spec §5, from Isaac's sample sheet).
 * Keys are the dotted names stored in the log; labels and units are for
 * display only. Clicks are counted from fully closed.
 */

/** One sheet field. */
export interface SheetField {
  key: string;
  label: string;
  /** Display unit, or "" for text. */
  unit: string;
  /** Number fields store numbers; text fields store strings. */
  numeric: boolean;
}

/** One sheet section, in display order. */
export interface SheetSection {
  title: string;
  fields: SheetField[];
}

const num = (key: string, label: string, unit: string): SheetField => ({ key, label, unit, numeric: true });
const text = (key: string, label: string): SheetField => ({ key, label, unit: "", numeric: false });
const clicks = (prefix: string) => [
  num(`${prefix}.lsc`, "LSC", "clicks"),
  num(`${prefix}.hsc`, "HSC", "clicks"),
  num(`${prefix}.lsr`, "LSR", "clicks"),
  num(`${prefix}.hsr`, "HSR", "clicks"),
];

/** Every field, by section. */
export const SHEET_SECTIONS: readonly SheetSection[] = [
  { title: "Front tyre", fields: [text("front_tyre.model", "Tyre"), num("front_tyre.psi", "Pressure", "psi"), text("front_tyre.notes", "Notes")] },
  { title: "Rear tyre", fields: [text("rear_tyre.model", "Tyre"), num("rear_tyre.psi", "Pressure", "psi"), text("rear_tyre.notes", "Notes")] },
  { title: "Wheels", fields: [text("wheels.notes", "Notes")] },
  {
    title: "Fork",
    fields: [
      text("fork.model", "Fork"),
      num("fork.travel_mm", "Travel", "mm"),
      num("fork.psi", "Pressure", "psi"),
      num("fork.volume_reducers", "Volume reducers", ""),
      ...clicks("fork"),
    ],
  },
  {
    title: "Shock",
    fields: [
      text("shock.model", "Shock"),
      num("shock.travel_mm", "Shock travel", "mm"),
      num("shock.wheel_travel_mm", "Wheel travel", "mm"),
      num("shock.psi", "Pressure", "psi"),
      num("shock.spring_rate", "Spring rate", "lb/in"),
      num("shock.volume_spacers", "Volume spacers", ""),
      ...clicks("shock"),
    ],
  },
  { title: "Frame", fields: [text("frame.flip_chip", "Flip chip")] },
  { title: "Cockpit", fields: [num("cockpit.bar_height_mm", "Bar height", "mm")] },
];

/** The sections limited to `bikeFields` (a bike's template); an empty
 *  template means every field. */
export function sectionsFor(bikeFields: string[]): SheetSection[] {
  if (bikeFields.length === 0) return [...SHEET_SECTIONS];
  const keep = new Set(bikeFields);
  return SHEET_SECTIONS.map((s) => ({ ...s, fields: s.fields.filter((f) => keep.has(f.key)) })).filter((s) => s.fields.length > 0);
}

/** A stored value as the text in its input. */
export function toInput(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

/** What the inputs hold, as sheet values: blanks are left out (a blank
 *  means the field doesn't apply), numeric fields become numbers when they
 *  parse and stay text otherwise. */
export function sheetValues(inputs: Record<string, string>, sections: readonly SheetSection[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of sections.flatMap((s) => s.fields)) {
    const raw = (inputs[field.key] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw);
    out[field.key] = field.numeric && Number.isFinite(n) ? n : raw;
  }
  return out;
}

/** A confirmed-sheet entry for `bikeId`, happening now. */
export function newSheet(bikeId: string, values: Record<string, unknown>, comment: string, nowMs: number, device: string, random: Random = Math.random): Entry {
  return {
    entry_id: newId(nowMs, random),
    bike_id: bikeId,
    kind: "sheet",
    versions: [
      { version_id: newId(nowMs, random), parents: [], at_ms: nowMs, updated_at_ms: nowMs, device, text: comment.trim(), changes: [], sheet: values, deleted: false },
    ],
  };
}

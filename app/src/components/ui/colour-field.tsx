import { ColourPicker } from "@/components/ui/colour-picker";
import { Field } from "@/components/ui/field";
import { colourValueFor, tokenInColourValue } from "@/components/ui/colourValue";
import { Input } from "@/components/ui/input";

/**
 * A labelled colour swatch picker (ruling R212 item 5), over the app's
 * existing eight-token {@link ColourPicker}.
 *
 * **The free text field is not decoration.** R212 item 5 says "no change to
 * what the form edits", and a mark's `stroke` is a free string in
 * `plotForm`'s types — a workbook may already hold `red`, a hex, or a Plot
 * expression there, and the control this replaced was a plain text input
 * that could set any of them. So the swatches are an *addition*: they write
 * the eight brand tokens (R117 item 6 — a picker never reaches a hex), and
 * the field beside them still accepts and shows whatever is actually
 * stored, including a value no swatch can represent. Clearing the field
 * sets the colour back to unset, which is Plot's own default, not black.
 */
export function ColourField({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  /** The stored colour string, or `undefined` for "not set". */
  value: string | undefined;
  disabled?: boolean;
  /** Fires with the new colour string, or `undefined` when the field is
   *  emptied. Never fires with `""` — an empty field means unset. */
  onChange: (value: string | undefined) => void;
}) {
  const token = tokenInColourValue(value);

  return (
    <Field label={label} disabled={disabled}>
      {(id) => (
        <>
          <ColourPicker colour={token} label={`${label} swatches`} onChange={(next) => onChange(colourValueFor(next))} />
          <Input
            id={id}
            type="text"
            value={value ?? ""}
            disabled={disabled}
            placeholder="auto"
            title="Any CSS colour, or pick a swatch. Empty uses Plot's own default."
            onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
            className="w-28"
          />
        </>
      )}
    </Field>
  );
}

import { Button } from "@/components/ui/button";
import { ColourPicker } from "@/components/ui/colour-picker";
import { Field } from "@/components/ui/field";
import { colourValueFor, tokenInColourValue } from "@/components/ui/colourValue";

/**
 * A labelled colour swatch picker (ruling R212 item 5), over the app's
 * existing eight-token {@link ColourPicker}.
 *
 * **Why it still shows the raw value.** R212 says "no change to what the
 * form edits": a mark's `stroke` is a free string in `plotForm`'s types and
 * a workbook may already hold `red`, a hex, or a Plot expression there. The
 * swatches write the eight brand tokens (R117 item 6: a picker never
 * reaches a hex), and the readout beside them shows whatever is actually
 * stored, including a value no swatch can represent. Clear sets it back to
 * unset, which is Plot's own default — not black.
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
  onChange: (value: string | undefined) => void;
}) {
  const token = tokenInColourValue(value);
  const unrecognised = value !== undefined && value !== "" && token === "";

  return (
    <Field label={label} disabled={disabled} hint={unrecognised ? value : undefined}>
      {() => (
        <>
          <ColourPicker colour={token} label={label} onChange={(next) => onChange(colourValueFor(next))} />
          <Button
            type="button"
            size="sm"
            emphasis="normal"
            disabled={disabled || value === undefined}
            onClick={() => onChange(undefined)}
            title="Use Plot's own default colour"
          >
            Clear
          </Button>
        </>
      )}
    </Field>
  );
}

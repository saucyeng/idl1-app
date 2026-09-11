import type { ReactNode } from "react";

import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

/** One option in a {@link SelectField}. */
export interface SelectFieldOption {
  /** The stored value. Use {@link SELECT_FIELD_UNSET} for "not set" — never
   *  the empty string (see {@link SelectField}). */
  value: string;
  label: string;
  disabled?: boolean;
  /** Why this option cannot be chosen — shown as its tooltip, per R136: a
   *  disabled option says why, it is never silently omitted. */
  disabledReason?: string;
}

/**
 * The sentinel a {@link SelectField} uses for "not set".
 *
 * Radix's `Select` reserves the empty string (an item with `value=""`
 * throws, because that is how it represents "nothing selected" internally).
 * Several Properties controls genuinely have an unset state — a y-axis with
 * no explicit scale type, a mark with no lap scope — so they map it to this
 * sentinel on the way in and back to `undefined` on the way out. Callers
 * never see the string.
 */
export const SELECT_FIELD_UNSET = "__unset__";

/** Props for {@link SelectField}. */
export interface SelectFieldProps {
  label: string;
  /** The current value, or `undefined` for "not set". */
  value: string | undefined;
  options: readonly SelectFieldOption[];
  disabled?: boolean;
  hint?: ReactNode;
  /** Fires with the chosen value, or `undefined` when the unset option is
   *  chosen. */
  onChange: (value: string | undefined) => void;
  /** Trigger width — the one thing a call site legitimately tunes, since a
   *  field holding "Density (PSD)" needs more room than one holding "Lin". */
  className?: string;
}

/**
 * A labelled compact select (ruling R212 item 5), built on the app's
 * existing Radix `Select` primitive rather than a bare `<select>`: a native
 * dropdown cannot be themed to the palette, and the app already carries the
 * Radix one for every other picker.
 */
export function SelectField({ label, value, options, disabled = false, hint, onChange, className }: SelectFieldProps) {
  return (
    <Field label={label} hint={hint} disabled={disabled}>
      {(id) => (
        <Select
          value={value ?? SELECT_FIELD_UNSET}
          disabled={disabled}
          onValueChange={(next) => onChange(next === SELECT_FIELD_UNSET ? undefined : next)}
        >
          <SelectTrigger id={id} size="sm" className={className ?? "w-32"} aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled === true} title={option.disabledReason}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

/** A labelled single-line text input at the density scale. */
export function TextField({
  label,
  value,
  placeholder,
  disabled = false,
  hint,
  onChange,
  className,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} disabled={disabled}>
      {(id) => (
        <Input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={className ?? "w-32"}
        />
      )}
    </Field>
  );
}

/**
 * A labelled toggle switch (R212 item 5). Wraps the existing
 * `components/ui/switch.tsx` rather than adding a second on/off control —
 * a checkbox and a switch side by side in one form would be two answers to
 * the same question.
 */
export function SwitchField({
  label,
  checked,
  disabled = false,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Field label={label} hint={hint} disabled={disabled}>
      {(id) => <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />}
    </Field>
  );
}

/**
 * The Properties form's controls for an overlay readout cell (video overlay
 * spec §7c, C2 §5.3 `readout_cell`): gauge, number and g-g. Every change
 * regenerates the cell through `generateReadout`. A gauge's typed range is
 * shown and typed in the person's display units and stored in the
 * channel's recorded unit (Isaac, 2026-11-15). Rendering, not unit-tested;
 * the logic is `model/readoutForm.ts` and `plotForm/readout.ts`.
 */
import { FieldGroup } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { SelectField, SwitchField, TextField } from "@/components/ui/select-field";
import type { GaugeReadoutProps, GgReadoutProps, NumberReadoutProps, ReadoutProps } from "../plotForm/readout";
import { defaultGaugeRange, displayUnitLabel, fromDisplay, toDisplay, type ReadoutChannelOption } from "../model/readoutForm";
import type { DisplayUnits } from "../readout/units";

/** What {@link ReadoutPropertiesForm} needs. */
export interface ReadoutPropertiesFormProps {
  props: ReadoutProps;
  channels: readonly ReadoutChannelOption[];
  display: DisplayUnits;
  onChange: (next: ReadoutProps) => void;
}

/** Sets or clears an optional string option: an empty string removes it. */
function withLabel<T extends { label?: string }>(p: T, label: string): T {
  const next = { ...p };
  if (label === "") delete next.label;
  else next.label = label;
  return next;
}

/** Sets or clears the decimals option: null or 0 removes it. */
function withDigits<T extends { digits?: number }>(p: T, digits: number | null): T {
  const next = { ...p };
  if (digits === null || digits <= 0) delete next.digits;
  else next.digits = Math.min(6, Math.round(digits));
  return next;
}

/** Sets or clears the heart icon. */
function withHeart<T extends { icon?: "heart" }>(p: T, on: boolean): T {
  const next = { ...p };
  if (on) next.icon = "heart";
  else delete next.icon;
  return next;
}

/** The controls for one readout cell. */
export function ReadoutPropertiesForm({ props, channels, display, onChange }: ReadoutPropertiesFormProps) {
  const options = channels.map((c) => ({ value: c.id, label: c.label }));
  if (props.readout === "gauge") return <GaugeControls props={props} channels={channels} options={options} display={display} onChange={onChange} />;
  if (props.readout === "number") return <NumberControls props={props} options={options} onChange={onChange} />;
  return <GgControls props={props} options={options} onChange={onChange} />;
}

type Options = { value: string; label: string }[];

function GaugeControls({
  props,
  channels,
  options,
  display,
  onChange,
}: {
  props: GaugeReadoutProps;
  channels: readonly ReadoutChannelOption[];
  options: Options;
  display: DisplayUnits;
  onChange: (next: ReadoutProps) => void;
}) {
  const unit = channels.find((c) => c.id === props.channel)?.unit;
  const shownUnit = displayUnitLabel(unit, display);
  const range = props.range;
  return (
    <>
      <FieldGroup title="Gauge" className="properties-form-mark">
        <SelectField
          label="Channel"
          value={props.channel}
          options={options}
          onChange={(value) => value !== undefined && onChange({ ...props, channel: value })}
        />
        <TextField label="Label" value={props.label ?? ""} placeholder="none" onChange={(v) => onChange(withLabel(props, v))} />
        <SelectField
          label="Style"
          value={props.style ?? "speedo"}
          options={[
            { value: "speedo", label: "Speedo (needle)" },
            { value: "tach", label: "Tach (sweep)" },
          ]}
          onChange={(value) => {
            if (value === "tach") onChange({ ...props, style: "tach" });
            else if (value === "speedo") {
              const next = { ...props };
              delete next.style;
              onChange(next);
            }
          }}
        />
        <SwitchField label="Heart icon" checked={props.icon === "heart"} onChange={(on) => onChange(withHeart(props, on))} />
        <NumberField label="Decimals" value={props.digits ?? 0} min={0} max={6} step={1} onChange={(d) => onChange(withDigits(props, d))} />
      </FieldGroup>
      <FieldGroup title="Range" className="properties-form-range">
        <SwitchField
          label="Whole ride"
          checked={range.kind === "ride"}
          hint="Scale the dial to this ride's lowest and highest values"
          onChange={(on) => {
            if (on) onChange({ ...props, range: { kind: "ride" } });
            else {
              const [min, max] = defaultGaugeRange(unit);
              onChange({ ...props, range: { kind: "fixed", min, max } });
            }
          }}
        />
        {range.kind === "fixed" && (
          <>
            <NumberField
              label="Min"
              unit={shownUnit}
              value={toDisplay(range.min, unit, display)}
              onChange={(v) => {
                if (v === null) return;
                const min = fromDisplay(v, unit, display);
                if (min < range.max) onChange({ ...props, range: { kind: "fixed", min, max: range.max } });
              }}
            />
            <NumberField
              label="Max"
              unit={shownUnit}
              value={toDisplay(range.max, unit, display)}
              onChange={(v) => {
                if (v === null) return;
                const max = fromDisplay(v, unit, display);
                if (max > range.min) onChange({ ...props, range: { kind: "fixed", min: range.min, max } });
              }}
            />
          </>
        )}
      </FieldGroup>
    </>
  );
}

function NumberControls({ props, options, onChange }: { props: NumberReadoutProps; options: Options; onChange: (next: ReadoutProps) => void }) {
  return (
    <FieldGroup title="Number" className="properties-form-mark">
      <SelectField
        label="Channel"
        value={props.channel}
        options={options}
        onChange={(value) => value !== undefined && onChange({ ...props, channel: value })}
      />
      <TextField label="Label" value={props.label ?? ""} placeholder="none" onChange={(v) => onChange(withLabel(props, v))} />
      <NumberField label="Decimals" value={props.digits ?? 0} min={0} max={6} step={1} onChange={(d) => onChange(withDigits(props, d))} />
      <SwitchField label="Heart icon" checked={props.icon === "heart"} onChange={(on) => onChange(withHeart(props, on))} />
    </FieldGroup>
  );
}

function GgControls({ props, options, onChange }: { props: GgReadoutProps; options: Options; onChange: (next: ReadoutProps) => void }) {
  return (
    <FieldGroup title="g-g" className="properties-form-mark">
      <SelectField
        label="Lateral (x)"
        value={props.xChannel}
        options={options}
        onChange={(value) => value !== undefined && onChange({ ...props, xChannel: value })}
      />
      <SelectField
        label="Longitudinal (y)"
        value={props.yChannel}
        options={options}
        onChange={(value) => value !== undefined && onChange({ ...props, yChannel: value })}
      />
      <TextField label="Label" value={props.label ?? ""} placeholder="none" onChange={(v) => onChange(withLabel(props, v))} />
      <NumberField label="Edge" unit="g" value={props.limit} min={0.1} step={0.1} onChange={(v) => v !== null && v > 0 && onChange({ ...props, limit: v })} />
      <NumberField label="Rings every" unit="g" value={props.rings} min={0.05} step={0.05} onChange={(v) => v !== null && v > 0 && onChange({ ...props, rings: v })} />
      <NumberField label="Tail" unit="s" value={props.tailS} min={0} step={0.5} onChange={(v) => v !== null && v >= 0 && onChange({ ...props, tailS: v })} />
    </FieldGroup>
  );
}

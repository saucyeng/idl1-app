import { removeAnalogChannel, upsertAnalogChannel } from "../config/edit";
import type { AnalogChannel, DeviceConfig } from "../config/model";
import { validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";

/** Props for {@link AnalogForm}. */
export interface AnalogFormProps {
  /** The config this form reads from and edits. */
  config: DeviceConfig;
  /** `analog.channels[].key` of the entry this instance edits — stable
   *  across renders even though the entry's own `label` can change. */
  channelKey: string;
  /** Called with the whole next `DeviceConfig` after every edit. */
  onConfigChange: (next: DeviceConfig) => void;
  /** Closes the form. */
  onClose: () => void;
}

/** Filters `issues` to the ones whose `path` starts with `prefix`. */
function issuesFor(issues: ValidationIssue[], prefix: string): ValidationIssue[] {
  return issues.filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`));
}

/** Renders one `ValidationIssue` as a labelled line. */
function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="device-form__issues">
      {issues.map((issue) => (
        <li key={issue.path + issue.message} data-severity={issue.severity}>
          {issue.severity === "error" ? "Error: " : "Warning: "}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/** Parses a pin `<input type="number">`'s string value: empty means
 *  unassigned (`null`); anything else is read as an integer, `NaN` (a
 *  stray non-numeric string the input still let through) also treated as
 *  unassigned rather than written into the config. */
function parsePinInput(value: string): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * The Analog source form (SPEC §23.3.4): one `analog.channels[]` entry's
 * label, units, scale/offset, ADC pin and enable flag, plus Delete. The pin
 * control is a plain non-negative-integer input starting empty when
 * unassigned — SPEC §8 states no valid `adc_pin` range for a `<select>` to
 * enumerate (ruling R58), so the user types the pin they wired and
 * `validateConfig`'s collision/unassigned checks catch a mistake, never a
 * range check this form invents.
 */
export default function AnalogForm({ config, channelKey, onConfigChange, onClose }: AnalogFormProps) {
  const index = config.analog.channels.findIndex((c) => c.key === channelKey);
  const channel = config.analog.channels[index];
  if (channel === undefined) return null;

  const issues = validateConfig(config);
  const path = `analog.channels[${index}]`;

  function patch(fields: Partial<AnalogChannel>): void {
    onConfigChange(upsertAnalogChannel(config, { ...channel, ...fields }));
  }

  return (
    <div className="device-form device-form--analog" role="dialog" aria-label="Analog channel settings">
      <h3>Analog channel</h3>

      <label>
        Label
        <input type="text" value={channel.label} onChange={(e) => patch({ label: e.target.value })} />
      </label>
      <IssueList issues={issuesFor(issues, `${path}.label`)} />

      <label>
        Units
        <input type="text" value={channel.units} onChange={(e) => patch({ units: e.target.value })} />
      </label>

      <label>
        ADC pin
        <input
          type="number"
          min={0}
          step={1}
          value={channel.adc_pin ?? ""}
          placeholder="unassigned"
          onChange={(e) => patch({ adc_pin: parsePinInput(e.target.value) })}
        />
      </label>
      <IssueList issues={issuesFor(issues, `${path}.adc_pin`)} />

      <label>
        Scale
        <input type="number" value={channel.scale} onChange={(e) => patch({ scale: Number(e.target.value) })} />
      </label>
      <IssueList issues={issuesFor(issues, `${path}.scale`)} />

      <label>
        Offset
        <input type="number" value={channel.offset} onChange={(e) => patch({ offset: Number(e.target.value) })} />
      </label>

      <label>
        <input type="checkbox" checked={channel.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        Enabled
      </label>

      <button
        type="button"
        onClick={() => {
          onConfigChange(removeAnalogChannel(config, channelKey));
          onClose();
        }}
      >
        Delete
      </button>
      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

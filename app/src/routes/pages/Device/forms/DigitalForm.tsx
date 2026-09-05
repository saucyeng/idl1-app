import { removeDigitalChannel, upsertDigitalChannel } from "../config/edit";
import type { DeviceConfig, DigitalChannel } from "../config/model";
import { validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";

/** Props for {@link DigitalForm}. */
export interface DigitalFormProps {
  /** The config this form reads from and edits. */
  config: DeviceConfig;
  /** `digital.channels[].key` of the entry this instance edits. */
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
 *  unassigned (`null`), same rule as `AnalogForm`'s pin input. */
function parsePinInput(value: string): number | null {
  if (value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

/**
 * The Digital source form (SPEC §23.3.5): one `digital.channels[]` entry's
 * label, GPIO pin, active-low polarity, debounce window and enable flag,
 * plus Delete. `kind` is shown as read-only text, never a picker — Spec 1
 * only ever creates `"marker"` channels (`+ Add channel…`'s picker), and
 * `"level"`/`"pwm"` are reserved in the schema but not exposed for editing
 * even if a loaded file already carries one. The pin control is the same
 * unconstrained non-negative-integer input as `AnalogForm`'s, for the same
 * "no declared range" reason (ruling R58).
 */
export default function DigitalForm({ config, channelKey, onConfigChange, onClose }: DigitalFormProps) {
  const index = config.digital.channels.findIndex((c) => c.key === channelKey);
  const channel = config.digital.channels[index];
  if (channel === undefined) return null;

  const issues = validateConfig(config);
  const path = `digital.channels[${index}]`;

  function patch(fields: Partial<DigitalChannel>): void {
    onConfigChange(upsertDigitalChannel(config, { ...channel, ...fields }));
  }

  return (
    <div className="device-form device-form--digital" role="dialog" aria-label="Digital channel settings">
      <h3>Digital channel</h3>

      <label>
        Label
        <input type="text" value={channel.label} onChange={(e) => patch({ label: e.target.value })} />
      </label>
      <IssueList issues={issuesFor(issues, `${path}.label`)} />

      <p>
        Kind: <strong>{channel.kind}</strong>
      </p>
      <IssueList issues={issuesFor(issues, `${path}.kind`)} />

      <label>
        GPIO pin
        <input
          type="number"
          min={0}
          step={1}
          value={channel.gpio_pin ?? ""}
          placeholder="unassigned"
          onChange={(e) => patch({ gpio_pin: parsePinInput(e.target.value) })}
        />
      </label>
      <IssueList issues={issuesFor(issues, `${path}.gpio_pin`)} />

      <label>
        <input type="checkbox" checked={channel.active_low} onChange={(e) => patch({ active_low: e.target.checked })} />
        Active low
      </label>

      <label>
        Debounce (ms)
        <input type="number" min={0} value={channel.debounce_ms} onChange={(e) => patch({ debounce_ms: Number(e.target.value) })} />
      </label>
      <IssueList issues={issuesFor(issues, `${path}.debounce_ms`)} />

      <label>
        <input type="checkbox" checked={channel.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        Enabled
      </label>

      <button
        type="button"
        onClick={() => {
          onConfigChange(removeDigitalChannel(config, channelKey));
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

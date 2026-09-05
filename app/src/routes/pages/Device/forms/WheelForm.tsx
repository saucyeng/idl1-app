import { setWheelSlot } from "../config/edit";
import type { DeviceConfig, WheelSlot } from "../config/model";
import { validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";

/** Props for {@link WheelForm}. */
export interface WheelFormProps {
  /** The config this form reads from and edits. */
  config: DeviceConfig;
  /** Called with the whole next `DeviceConfig` after every edit. */
  onConfigChange: (next: DeviceConfig) => void;
  /** Closes the form. */
  onClose: () => void;
}

const WHEEL_SIDES = ["front", "rear"] as const;
const WHEEL_SIDE_LABELS: Record<(typeof WHEEL_SIDES)[number], string> = { front: "Front", rear: "Rear" };

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

/**
 * The wheel-speed source form (SPEC §23.3.3): both `wheel_speed.front` and
 * `.rear` slots, each with its own enable flag, Hall-sensor points-per-
 * revolution count, and wheel circumference (mm). Task 3's validator skips
 * a disabled slot's geometry entirely, so this form does too — its
 * points/circumference issues only ever show once the slot is enabled.
 */
export default function WheelForm({ config, onConfigChange, onClose }: WheelFormProps) {
  const issues = validateConfig(config);

  return (
    <div className="device-form device-form--wheel" role="dialog" aria-label="Wheel speed settings">
      <h3>Wheel speed</h3>

      {WHEEL_SIDES.map((side) => {
        const slot: WheelSlot = config.wheel_speed[side];
        const slotPath = `wheel_speed.${side}`;
        return (
          <fieldset key={side}>
            <legend>{WHEEL_SIDE_LABELS[side]}</legend>
            <label>
              <input
                type="checkbox"
                checked={slot.enabled}
                onChange={(e) => onConfigChange(setWheelSlot(config, side, { enabled: e.target.checked }))}
              />
              Enabled
            </label>

            <label>
              Points per revolution
              <input
                type="number"
                min={1}
                value={slot.points_per_revolution}
                onChange={(e) => onConfigChange(setWheelSlot(config, side, { points_per_revolution: Number(e.target.value) }))}
              />
            </label>

            <label>
              Wheel circumference (mm)
              <input
                type="number"
                min={1}
                value={slot.wheel_circumference_mm}
                onChange={(e) => onConfigChange(setWheelSlot(config, side, { wheel_circumference_mm: Number(e.target.value) }))}
              />
            </label>

            <IssueList issues={issuesFor(issues, slotPath)} />
          </fieldset>
        );
      })}

      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

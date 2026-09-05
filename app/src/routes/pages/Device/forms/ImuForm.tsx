import { setImuAxis, setImuRate, setImuSlot } from "../config/edit";
import type { DeviceConfig, ImuSlot } from "../config/model";
import { ACCEL_RANGES_G, GYRO_RANGES_DPS, IMU_ODR_HIGH_PERF_HZ, IMU_ODR_LOW_POWER_HZ, validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";

/** Props for {@link ImuForm}. */
export interface ImuFormProps {
  /** The config this form reads from and edits. */
  config: DeviceConfig;
  /** Called with the whole next `DeviceConfig` after every edit — this form
   *  never holds its own copy of the config, so a re-render always shows
   *  the value the caller committed. */
  onConfigChange: (next: DeviceConfig) => void;
  /** Closes the form without discarding anything — every edit already
   *  committed through `onConfigChange` as it was made. */
  onClose: () => void;
}

const IMU_SLOT_KEYS = ["imu0", "imu1", "imu2"] as const;
const IMU_SLOT_LABELS: Record<(typeof IMU_SLOT_KEYS)[number], string> = {
  imu0: "IMU0 (sprung)",
  imu1: "IMU1 (front fork)",
  imu2: "IMU2 (rear)",
};
const AXIS_KEYS = ["accel_x", "accel_y", "accel_z", "gyro_x", "gyro_y", "gyro_z"] as const;

/** Filters `issues` to the ones whose `path` starts with `prefix` — the
 *  join `ChannelsTable`'s narrower forms use to show only their own
 *  problems inline (Task 6 brief). */
function issuesFor(issues: ValidationIssue[], prefix: string): ValidationIssue[] {
  return issues.filter((issue) => issue.path === prefix || issue.path.startsWith(`${prefix}.`) || issue.path.startsWith(`${prefix}[`));
}

/** Renders one `ValidationIssue` as a labelled line, error text distinct
 *  from warning text so a form never looks the same whether it blocks a
 *  push or not. */
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
 * The IMU source form (SPEC §23.3.1): the SPI-bus-shared sample rate and
 * mode flags, the top-level default accel/gyro ranges, and the three
 * `imu0`/`imu1`/`imu2` sub-blocks (each its own enable flag, range
 * overrides, and six axis checkboxes). Every control's valid-value list is
 * Task 3's named constant — an invalid value cannot be picked, only
 * arrive already-invalid from a file or device, which `validateConfig`
 * catches and this form shows inline rather than snapping.
 */
export default function ImuForm({ config, onConfigChange, onClose }: ImuFormProps) {
  const issues = validateConfig(config);
  const odrList = config.imu.low_power_mode ? IMU_ODR_LOW_POWER_HZ : IMU_ODR_HIGH_PERF_HZ;

  return (
    <div className="device-form device-form--imu" role="dialog" aria-label="IMU settings">
      <h3>IMU</h3>

      <label>
        Sample rate (Hz, shared bus)
        <select
          value={config.imu.sample_rate_hz}
          onChange={(e) => onConfigChange(setImuRate(config, Number(e.target.value)))}
        >
          {odrList.map((hz) => (
            <option key={hz} value={hz}>
              {hz}
            </option>
          ))}
        </select>
      </label>
      <IssueList issues={issuesFor(issues, "imu.sample_rate_hz")} />

      <label>
        <input
          type="checkbox"
          checked={config.imu.low_power_mode}
          onChange={(e) => onConfigChange({ ...config, imu: { ...config.imu, low_power_mode: e.target.checked } })}
        />
        Low power mode
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.imu.high_performance_mode}
          onChange={(e) => onConfigChange({ ...config, imu: { ...config.imu, high_performance_mode: e.target.checked } })}
        />
        High performance mode
      </label>
      <IssueList issues={issuesFor(issues, "imu.low_power_mode")} />

      <label>
        Default accel range (g)
        <select
          value={config.imu.accel_range_g}
          onChange={(e) => onConfigChange({ ...config, imu: { ...config.imu, accel_range_g: Number(e.target.value) } })}
        >
          {ACCEL_RANGES_G.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <IssueList issues={issuesFor(issues, "imu.accel_range_g")} />

      <label>
        Default gyro range (dps)
        <select
          value={config.imu.gyro_range_dps}
          onChange={(e) => onConfigChange({ ...config, imu: { ...config.imu, gyro_range_dps: Number(e.target.value) } })}
        >
          {GYRO_RANGES_DPS.map((dps) => (
            <option key={dps} value={dps}>
              {dps}
            </option>
          ))}
        </select>
      </label>
      <IssueList issues={issuesFor(issues, "imu.gyro_range_dps")} />

      {IMU_SLOT_KEYS.map((slotKey) => {
        const slot: ImuSlot = config.imu[slotKey];
        return (
          <fieldset key={slotKey}>
            <legend>{IMU_SLOT_LABELS[slotKey]}</legend>
            <label>
              <input
                type="checkbox"
                checked={slot.enabled}
                onChange={(e) => onConfigChange(setImuSlot(config, slotKey, { enabled: e.target.checked }))}
              />
              Enabled
            </label>

            <label>
              Accel range (g)
              <select
                value={slot.accel_range_g}
                onChange={(e) => onConfigChange(setImuSlot(config, slotKey, { accel_range_g: Number(e.target.value) }))}
              >
                {ACCEL_RANGES_G.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Gyro range (dps)
              <select
                value={slot.gyro_range_dps}
                onChange={(e) => onConfigChange(setImuSlot(config, slotKey, { gyro_range_dps: Number(e.target.value) }))}
              >
                {GYRO_RANGES_DPS.map((dps) => (
                  <option key={dps} value={dps}>
                    {dps}
                  </option>
                ))}
              </select>
            </label>

            {AXIS_KEYS.map((axis) => (
              <label key={axis}>
                <input
                  type="checkbox"
                  checked={slot.channels[axis]}
                  onChange={(e) => onConfigChange(setImuAxis(config, slotKey, axis, e.target.checked))}
                />
                {axis}
              </label>
            ))}

            <IssueList issues={issuesFor(issues, slotKey)} />
          </fieldset>
        );
      })}

      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

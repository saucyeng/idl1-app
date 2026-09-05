import { setGps } from "../config/edit";
import type { DeviceConfig } from "../config/model";
import { GPS_DYNAMIC_MODELS, GPS_RATE_HZ_MAX, GPS_RATE_HZ_MIN, NMEA_SENTENCES, validateConfig } from "../config/validate";
import type { ValidationIssue } from "../config/validate";

/** Props for {@link GpsForm}. */
export interface GpsFormProps {
  /** The config this form reads from and edits. */
  config: DeviceConfig;
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

/** The `1..10` Hz integer choices Task 3's `GPS_RATE_HZ_MIN`/`MAX` bound —
 *  built once per render rather than exported, since only this form's rate
 *  control needs the full enumerated list (the validator only needs the
 *  bounds). */
function gpsRateChoices(): number[] {
  const choices: number[] = [];
  for (let hz = GPS_RATE_HZ_MIN; hz <= GPS_RATE_HZ_MAX; hz++) {
    choices.push(hz);
  }
  return choices;
}

/**
 * The GPS source form (SPEC §23.3.2): fix rate (1–10 Hz integer), dynamic
 * model, the NMEA sentence checklist, and SBAS. Every control is
 * constrained to Task 3's named valid-value sets, so an invalid value can
 * only arrive from a file or device — `validateConfig` catches it and this
 * form shows the issue inline rather than snapping it.
 */
export default function GpsForm({ config, onConfigChange, onClose }: GpsFormProps) {
  const issues = validateConfig(config);
  const rateChoices = gpsRateChoices();

  function toggleSentence(sentence: string, checked: boolean): void {
    const next = checked
      ? [...config.gps.nmea_sentences, sentence]
      : config.gps.nmea_sentences.filter((s) => s !== sentence);
    onConfigChange(setGps(config, { nmea_sentences: next }));
  }

  return (
    <div className="device-form device-form--gps" role="dialog" aria-label="GPS settings">
      <h3>GPS</h3>

      <label>
        Fix rate (Hz)
        <select value={config.gps.sample_rate_hz} onChange={(e) => onConfigChange(setGps(config, { sample_rate_hz: Number(e.target.value) }))}>
          {rateChoices.map((hz) => (
            <option key={hz} value={hz}>
              {hz}
            </option>
          ))}
        </select>
      </label>
      <IssueList issues={issuesFor(issues, "gps.sample_rate_hz")} />

      <label>
        Dynamic model
        <select
          value={config.gps.dynamic_model}
          onChange={(e) => onConfigChange(setGps(config, { dynamic_model: e.target.value as DeviceConfig["gps"]["dynamic_model"] }))}
        >
          {GPS_DYNAMIC_MODELS.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <IssueList issues={issuesFor(issues, "gps.dynamic_model")} />

      <fieldset>
        <legend>NMEA sentences</legend>
        {NMEA_SENTENCES.map((sentence) => (
          <label key={sentence}>
            <input
              type="checkbox"
              checked={config.gps.nmea_sentences.includes(sentence)}
              onChange={(e) => toggleSentence(sentence, e.target.checked)}
            />
            {sentence}
          </label>
        ))}
        <IssueList issues={issuesFor(issues, "gps.nmea_sentences")} />
      </fieldset>

      <label>
        <input
          type="checkbox"
          checked={config.gps.sbas_enabled}
          onChange={(e) => onConfigChange(setGps(config, { sbas_enabled: e.target.checked }))}
        />
        SBAS
      </label>

      <button type="button" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

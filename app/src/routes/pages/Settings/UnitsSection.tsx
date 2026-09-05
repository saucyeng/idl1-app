import { useState } from "react";

import type { PrefsStore } from "./prefsStore";
import { UNIT_SYSTEMS, unitSummary } from "./units";

/** Props for {@link UnitsSection}. */
export interface UnitsSectionProps {
  /** The prefs store this section reads from and writes to. */
  store: PrefsStore;
}

/** The Units section: a two-way imperial/metric toggle plus a read-only
 *  summary of the units each choice applies to speed, distance, pressure,
 *  temperature, force, power and spring rate ({@link unitSummary}).
 *
 * The toggle writes to `store` immediately — unlike the rider-name field,
 * there is no keystroke stream to debounce here. */
export default function UnitsSection({ store }: UnitsSectionProps) {
  const [system, setSystem] = useState(store.get().engine.unit_system);
  const summary = unitSummary(system);

  function handleSelect(value: typeof system): void {
    setSystem(value);
    const current = store.get();
    store.set({ engine: { ...current.engine, unit_system: value } });
  }

  return (
    <div className="idl1-settings__section">
      <div role="radiogroup" aria-label="Unit system">
        {UNIT_SYSTEMS.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="idl1-settings-unit-system"
              value={option.value}
              checked={system === option.value}
              onChange={() => handleSelect(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <p className="idl1-settings__hint">
        Changing the unit system does not retroactively convert existing channel values.
      </p>
      <table className="idl1-settings__unit-summary">
        <tbody>
          <tr>
            <th>Speed</th>
            <td>{summary.speed}</td>
          </tr>
          <tr>
            <th>Distance</th>
            <td>{summary.distance}</td>
          </tr>
          <tr>
            <th>Pressure</th>
            <td>{summary.pressure}</td>
          </tr>
          <tr>
            <th>Temperature</th>
            <td>{summary.temperature}</td>
          </tr>
          <tr>
            <th>Force</th>
            <td>{summary.force}</td>
          </tr>
          <tr>
            <th>Power</th>
            <td>{summary.power}</td>
          </tr>
          <tr>
            <th>Spring rate</th>
            <td>{summary.springRate}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

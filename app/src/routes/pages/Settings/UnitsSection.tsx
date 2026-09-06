import { useEffect, useState } from "react";

import type { PrefsStore } from "./prefsStore";
import { UNIT_SYSTEMS, unitSummary, type UnitSystem } from "./units";

/** Props for {@link UnitsSection}. */
export interface UnitsSectionProps {
  /** The prefs store this section reads from and writes to. */
  store: PrefsStore;
  /** A one-line status message about the one-time `localStorage` →
   *  `settings.json` migration (R78 L7c Task 8, Q3), or `null` when there is
   *  nothing to say. Owned by `index.tsx`, which runs the migration once for
   *  the whole tab and knows whether `unit_system` was the field imported
   *  (or the import failed). */
  migrationNotice?: string | null;
}

/** The Units section: a two-way imperial/metric toggle plus a read-only
 *  summary of the units each choice applies to speed, distance, pressure,
 *  temperature, force, power and spring rate ({@link unitSummary}).
 *
 * The toggle writes to `store` immediately — unlike the rider-name field,
 * there is no keystroke stream to debounce here. `store.get()`/`set()` are
 * async, so the initial value is seeded in an effect rather than read
 * synchronously at render time; the toggle defaults to `"imperial"` for one
 * paint while that read is in flight. */
export default function UnitsSection({ store, migrationNotice = null }: UnitsSectionProps) {
  const [system, setSystem] = useState<UnitSystem>("imperial");
  const [writeFailed, setWriteFailed] = useState<boolean>(false);
  const summary = unitSummary(system);

  useEffect(() => {
    let cancelled = false;
    void store.get().then((prefs) => {
      if (!cancelled) {
        setSystem(prefs.engine.unit_system);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  function handleSelect(value: UnitSystem): void {
    setSystem(value);
    setWriteFailed(false);
    void store.get().then((current) =>
      store.set({ engine: { ...current.engine, unit_system: value } }).then((result) => {
        if (!result.ok) {
          setWriteFailed(true);
        }
      }),
    );
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
      {writeFailed ? (
        <p role="status" className="idl1-settings__hint idl1-settings__hint--error">
          Your unit system could not be saved to this device. It will keep showing until you leave this screen.
        </p>
      ) : null}
      {migrationNotice !== null ? (
        <p role="status" className="idl1-settings__hint">
          {migrationNotice}
        </p>
      ) : null}
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

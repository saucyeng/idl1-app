import { useEffect, useState } from "react";

import { SpecRow } from "@/components/brand/SpecRow";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        aria-label="Unit system"
        value={system}
        onValueChange={(value) => value && handleSelect(value as UnitSystem)}
      >
        {UNIT_SYSTEMS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="font-mono text-xs text-fg-faint">
        Changing the unit system does not retroactively convert existing channel values.
      </p>
      {writeFailed ? (
        <p role="status" className="font-mono text-xs text-brand-accent">
          Your unit system could not be saved to this device. It will keep showing until you leave this screen.
        </p>
      ) : null}
      {migrationNotice !== null ? (
        <p role="status" className="font-mono text-xs text-fg-dim">
          {migrationNotice}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <SpecRow label="Speed" value={summary.speed} />
        <SpecRow label="Distance" value={summary.distance} />
        <SpecRow label="Pressure" value={summary.pressure} />
        <SpecRow label="Temperature" value={summary.temperature} />
        <SpecRow label="Force" value={summary.force} />
        <SpecRow label="Power" value={summary.power} />
        <SpecRow label="Spring rate" value={summary.springRate} />
      </div>
    </div>
  );
}

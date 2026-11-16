/**
 * The person's display units (video overlay spec §7a), read from the app
 * settings (C3 §3.10) when the caller mounts. Metric until the read lands
 * or if it fails. Shared by the readout host and the Properties form.
 */
import { useEffect, useState } from "react";

import { getSettings } from "../../../../ipc/app";
import { displayUnitsFor, type DisplayUnits } from "./units";

/** Metric: what is shown before the settings read lands. */
export const METRIC_DISPLAY_UNITS: DisplayUnits = { distance: "km", temperature: "C" };

/** The person's display units. */
export function useDisplayUnits(): DisplayUnits {
  const [display, setDisplay] = useState<DisplayUnits>(METRIC_DISPLAY_UNITS);
  useEffect(() => {
    let live = true;
    getSettings().then(
      (s) => {
        if (live) setDisplay(displayUnitsFor(s.unit_system));
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, []);
  return display;
}

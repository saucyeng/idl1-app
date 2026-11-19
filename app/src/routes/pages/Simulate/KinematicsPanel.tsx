import * as Plot from "@observablehq/plot";

import type { KinematicsView } from "@/ipc/simulate";

import { PLOT_STYLE, PlotBox } from "./PlotBox";

/** One curve the panel can draw. */
const CURVES = [
  { key: "growth_mm", label: "Chain growth (mm)", hint: "Top run, tooth to tooth, wheel held to the seatstay. Positive pulls the cranks back." },
  { key: "kickback_deg", label: "Kickback (° of crank)", hint: "With the wheel held to the seatstay." },
  { key: "cage_deg", label: "Cage angle (° forward)", hint: "Relative to the seatstay, from its drawn angle; forward is slack." },
  { key: "loop_change_mm", label: "Loop change at a held cage (mm)", hint: "What the cage has to take up: positive pulls it back against the spring, negative lets it forward." },
] as const;

/** Props for {@link KinematicsPanel}. */
export interface KinematicsPanelProps {
  kin: KinematicsView | null;
  gear: number;
  travelIndex: number;
  surfaceNames: string[];
}

/**
 * Growth, kickback, cage angle and loop change through travel for every
 * gear (drivetrain sim spec §2.2), the chosen gear on top, and the travel
 * the stage shows as a rule. Clearance to each contact surface below.
 */
export function KinematicsPanel({ kin, gear, travelIndex, surfaceNames }: KinematicsPanelProps) {
  if (kin === null) return <p className="text-sm text-[var(--fg-dim)]">Place the points to see the kinematics.</p>;
  const rows = kin.gears.flatMap((g) =>
    g.travel_mm.map((t, i) => ({
      travel: t,
      gear: `${g.teeth}T`,
      chosen: g.gear === gear,
      growth_mm: g.growth_mm[i],
      kickback_deg: g.kickback_deg[i],
      cage_deg: g.cage_deg[i],
      loop_change_mm: g.loop_change_mm[i],
    }))
  );
  const at = kin.snapshots[travelIndex]?.travel_mm ?? 0;
  const chosen = kin.gears.find((g) => g.gear === gear);
  const clearance = chosen ? chosen.clearance_mm.flatMap((series, j) => series.map((c, i) => ({ travel: chosen.travel_mm[i], clearance: c, surface: surfaceNames[j] ?? `Surface ${j + 1}` }))) : [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--fg-dim)]">
        {kin.chain_fit ? `A chain of ${Math.ceil(kin.chain_fit[0])}–${Math.floor(kin.chain_fit[1])} links closes the loop in every gear through travel.` : "No chain length closes the loop in every gear through travel: check the derailleur points."}
        {kin.failed.length > 0 && ` Gears that don't close: ${kin.failed.map(([g]) => g + 1).join(", ")}.`}
      </p>
      {CURVES.map((c) => (
        <div key={c.key} title={c.hint}>
          <div className="text-xs font-medium text-[var(--fg-dim)]">{c.label}</div>
          <PlotBox
            deps={[kin, gear, at]}
            make={(width) =>
              Plot.plot({
                width,
                height: 150,
                style: PLOT_STYLE,
                marginLeft: 44,
                x: { label: "Rear travel (mm)" },
                y: { label: null, grid: true },
                marks: [
                  Plot.ruleY([0], { stroke: "var(--rule)" }),
                  Plot.line(rows.filter((r) => !r.chosen), { x: "travel", y: c.key, z: "gear", stroke: "var(--fg-faint)", strokeWidth: 1 }),
                  Plot.line(rows.filter((r) => r.chosen), { x: "travel", y: c.key, stroke: "var(--hivis)", strokeWidth: 2.5 }),
                  Plot.ruleX([at], { stroke: "var(--info)", strokeDasharray: "3,3" }),
                  Plot.tip(rows, Plot.pointer({ x: "travel", y: c.key, title: (d: (typeof rows)[number]) => `${d.gear} at ${d.travel.toFixed(0)} mm: ${(d[c.key] as number).toFixed(2)}` })),
                ],
              })
            }
          />
        </div>
      ))}
      {clearance.length > 0 && (
        <div>
          <div className="text-xs font-medium text-[var(--fg-dim)]">Chain to surface clearance, chosen gear (mm)</div>
          <PlotBox
            deps={[kin, gear, at]}
            make={(width) =>
              Plot.plot({
                width,
                height: 140,
                style: PLOT_STYLE,
                marginLeft: 44,
                x: { label: "Rear travel (mm)" },
                y: { label: null, grid: true },
                color: { legend: true },
                marks: [Plot.ruleY([0], { stroke: "var(--accent)" }), Plot.line(clearance, { x: "travel", y: "clearance", stroke: "surface", strokeWidth: 2 }), Plot.ruleX([at], { stroke: "var(--info)", strokeDasharray: "3,3" })],
              })
            }
          />
        </div>
      )}
    </div>
  );
}

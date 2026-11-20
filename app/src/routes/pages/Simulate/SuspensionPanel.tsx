import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { setBikeParameters } from "@/ipc/bikelog";
import { simSuspension, type SetupPx, type SpringFitView, type SuspensionView } from "@/ipc/simulate";

import { PLOT_STYLE, PlotBox } from "./PlotBox";

/** Props for {@link SuspensionPanel}. */
export interface SuspensionPanelProps {
  bikeId: string;
  /** The drawing as it stands (unsaved edits included). */
  setup: SetupPx;
  /** A variant has no log, so it can't hold sag measurements. */
  variant: boolean;
  /** Called after this panel changes the bike's parameters. */
  onParamsChanged?: () => void;
}

function message(e: unknown): string {
  return e !== null && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
}

/**
 * The springs (whole-bike sim spec §9, stride 3): the shock's leverage and
 * the rear wheel's force through travel, the fork's force through its
 * stroke, the sag both give at the logged pressures, and the measure →
 * identify step: log a sag test, fit each air spring to the tests, use the
 * fit. All numbers come from `sim_suspension`.
 */
export function SuspensionPanel({ bikeId, setup, variant, onParamsChanged }: SuspensionPanelProps) {
  const [view, setView] = useState<SuspensionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    const t = window.setTimeout(() => {
      simSuspension(bikeId, setup)
        .then((v) => {
          if (mine !== seq.current) return;
          setView(v);
          setError(null);
        })
        .catch((e: unknown) => mine === seq.current && setError(message(e)));
    }, 250);
    return () => window.clearTimeout(t);
  }, [bikeId, setup, refresh]);

  const changed = () => {
    setRefresh((r) => r + 1);
    onParamsChanged?.();
  };

  if (view === null) return error !== null ? <p className="text-xs text-[var(--accent)]">{error}</p> : <p className="text-xs text-[var(--fg-dim)]">Working out the springs…</p>;
  const rear = view.travel_mm.map((t, i) => ({ travel: t, leverage: view.leverage[i], slow: view.rear_force_n[i], fast: view.rear_force_fast_n[i] }));
  const fork = view.fork_mm.map((x, i) => ({ stroke: x, slow: view.fork_force_n[i], fast: view.fork_force_fast_n[i] }));
  const sag = (label: string, s: SuspensionView["rear_sag"], what: string) =>
    s === null ? null : (
      <>
        <span className="text-[var(--fg-dim)]">{label}</span>
        <span>{`${s.stroke_mm.toFixed(1)} mm of ${what} (${s.pct.toFixed(0)} %)${s.wheel_mm !== null ? `, ${s.wheel_mm.toFixed(0)} mm at the wheel` : ""}`}</span>
      </>
    );

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs tabular-nums">
        <span className="text-[var(--fg-dim)]">Rider and bike</span>
        <span>{`${view.mass_kg.toFixed(1)} kg, ${view.rear_pct.toFixed(0)} % on the rear`}</span>
        <span className="text-[var(--fg-dim)]">Sprung load</span>
        <span>{`front ${view.sprung_load_n[0].toFixed(0)} N, rear ${view.sprung_load_n[1].toFixed(0)} N`}</span>
        {sag("Rear sag", view.rear_sag, "shaft")}
        {sag("Fork sag", view.fork_sag, "stanchion")}
      </div>
      {view.assumed.length > 0 && (
        <p className="text-xs text-[var(--fg-dim)]">
          {"Standing in for what isn't entered yet: "}
          {view.assumed.join("; ")}.
        </p>
      )}

      {rear.length > 0 && (
        <>
          <div title="Wheel travel per shock stroke: falling means the bike gets stiffer through travel (progressive)">
            <div className="text-xs font-medium text-[var(--fg-dim)]">Leverage ratio</div>
            <PlotBox
              deps={[view]}
              make={(width) =>
                Plot.plot({
                  width,
                  height: 130,
                  style: PLOT_STYLE,
                  marginLeft: 44,
                  x: { label: "Rear travel (mm)" },
                  y: { label: null, grid: true, zero: false },
                  marks: [Plot.line(rear, { x: "travel", y: "leverage", stroke: "var(--hivis)", strokeWidth: 2 }), Plot.tip(rear, Plot.pointer({ x: "travel", y: "leverage", title: (d: (typeof rear)[number]) => `${d.travel.toFixed(0)} mm: ${d.leverage.toFixed(2)}` }))],
                })
              }
            />
          </div>
          <div title="The shock's force at the wheel through the leverage. Slow: sag, isothermal. Fast: a bump, adiabatic. The flat line is the rear's sprung load.">
            <div className="text-xs font-medium text-[var(--fg-dim)]">Rear wheel force (N), slow and over a bump</div>
            <PlotBox
              deps={[view]}
              make={(width) =>
                Plot.plot({
                  width,
                  height: 150,
                  style: PLOT_STYLE,
                  marginLeft: 48,
                  x: { label: "Rear travel (mm)" },
                  y: { label: null, grid: true },
                  marks: [
                    Plot.ruleY([view.sprung_load_n[1]], { stroke: "var(--info)", strokeDasharray: "3,3" }),
                    Plot.line(rear, { x: "travel", y: "fast", stroke: "var(--fg-faint)", strokeWidth: 1.5 }),
                    Plot.line(rear, { x: "travel", y: "slow", stroke: "var(--hivis)", strokeWidth: 2 }),
                    Plot.tip(rear, Plot.pointer({ x: "travel", y: "slow", title: (d: (typeof rear)[number]) => `${d.travel.toFixed(0)} mm: ${d.slow.toFixed(0)} N slow, ${d.fast.toFixed(0)} N fast` })),
                  ],
                })
              }
            />
          </div>
        </>
      )}
      <div title="Along the legs. The flat line is the front's sprung load along the legs.">
        <div className="text-xs font-medium text-[var(--fg-dim)]">Fork force (N), slow and over a bump</div>
        <PlotBox
          deps={[view]}
          make={(width) =>
            Plot.plot({
              width,
              height: 150,
              style: PLOT_STYLE,
              marginLeft: 48,
              x: { label: "Fork stroke (mm)" },
              y: { label: null, grid: true },
              marks: [
                Plot.line(fork, { x: "stroke", y: "fast", stroke: "var(--fg-faint)", strokeWidth: 1.5 }),
                Plot.line(fork, { x: "stroke", y: "slow", stroke: "var(--hivis)", strokeWidth: 2 }),
                Plot.tip(fork, Plot.pointer({ x: "stroke", y: "slow", title: (d: (typeof fork)[number]) => `${d.stroke.toFixed(0)} mm: ${d.slow.toFixed(0)} N slow, ${d.fast.toFixed(0)} N fast` })),
              ],
            })
          }
        />
      </div>

      <SagTests view={view} />
      <Fit label="Shock" fit={view.shock_fit} bikeId={bikeId} onApplied={changed} />
      <Fit label="Fork" fit={view.fork_fit} bikeId={bikeId} onApplied={changed} />
      {variant ? (
        <p className="text-xs text-[var(--fg-dim)]">Sag tests go in a real bike's log: log them on the bike this variant came from, then copy the fitted springs here.</p>
      ) : (
        <SagTestForm bikeId={bikeId} onLogged={changed} />
      )}
      {error !== null && <p className="text-xs text-[var(--accent)]">{error}</p>}
    </div>
  );
}

function SagTests({ view }: { view: SuspensionView }) {
  if (view.tests.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-[var(--fg-dim)]">Sag tests in the log (mm)</div>
      <table className="w-full text-xs tabular-nums">
        <thead className="text-[var(--fg-dim)]">
          <tr>
            <th className="text-left font-normal">When</th>
            <th className="text-left font-normal">End</th>
            <th className="text-right font-normal">psi</th>
            <th className="text-right font-normal">Pack</th>
            <th className="text-right font-normal">Measured</th>
            <th className="text-right font-normal">Now</th>
            <th className="text-right font-normal">Fit</th>
          </tr>
        </thead>
        <tbody>
          {view.tests.map((t, i) => (
            <tr key={i}>
              <td>{new Date(t.at_ms).toLocaleDateString()}</td>
              <td>{t.end}</td>
              <td className="text-right">{t.psi.toFixed(0)}</td>
              <td className="text-right">{t.carried_kg > 0 ? `${t.carried_kg.toFixed(0)} kg` : "—"}</td>
              <td className="text-right">{t.measured_mm.toFixed(1)}</td>
              <td className="text-right">{t.predicted_mm.toFixed(1)}</td>
              <td className="text-right">{t.fitted_mm === null ? "—" : t.fitted_mm.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fit({ label, fit, bikeId, onApplied }: { label: string; fit: SpringFitView | null; bikeId: string; onApplied: () => void }) {
  const [error, setError] = useState<string | null>(null);
  if (fit === null) return null;
  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius)] border border-[var(--rule)] p-2 text-xs">
      <div className="font-medium">{`${label} spring fitted to the sag tests`}</div>
      <div className="tabular-nums text-[var(--fg-dim)]">
        {`Air piston ${fit.piston_area_cm2.toFixed(2)} cm², positive chamber ${fit.positive_volume_cc.toFixed(0)} cc, negative ${fit.negative_volume_cc.toFixed(0)} cc; misses the tests by ${fit.rms_mm.toFixed(1)} mm.`}
        {fit.unknowns === 1 ? " One test fixes the area only: a second, with a pack on, fixes the chamber's volume too." : ""}
      </div>
      <div>
        <Button
          size="sm"
          filled
          emphasis="good"
          onClick={() =>
            setBikeParameters(bikeId, fit.values, "")
              .then(onApplied)
              .catch((e: unknown) => setError(message(e)))
          }
        >
          Use the fit
        </Button>
      </div>
      {error !== null && <p className="text-[var(--accent)]">{error}</p>}
    </div>
  );
}

/** Logs a sag test: the pressures it was done at and the sag measured, as one log note. */
function SagTestForm({ bikeId, onLogged }: { bikeId: string; onLogged: () => void }) {
  const [v, setV] = useState<Record<string, number | null>>({ "shock.psi": null, "shock.sag_mm": null, "fork.psi": null, "fork.sag_mm": null, "rider.carried_kg": 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (n: number | null) => setV((o) => ({ ...o, [k]: n !== null && Number.isFinite(n) ? n : null }));
  const values = Object.fromEntries(Object.entries(v).filter(([, n]) => n !== null));
  const ok = "shock.sag_mm" in values || "fork.sag_mm" in values;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--rule)] p-2">
      <div className="text-xs font-medium">Log a sag test</div>
      <p className="text-xs text-[var(--fg-dim)]">
        Set the pressures, push the o-rings down, get on in your riding position with your feet on the pedals, bounce, settle, step off gently and measure how far each o-ring moved. Then do it again carrying about 10 kg: two loads fix each spring's size and progression.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Shock" unit="psi" value={v["shock.psi"]} step={5} min={0} max={400} onChange={set("shock.psi")} />
        <NumberField label="Shock sag" unit="mm" value={v["shock.sag_mm"]} step={0.5} min={0} max={100} onChange={set("shock.sag_mm")} />
        <NumberField label="Fork" unit="psi" value={v["fork.psi"]} step={1} min={0} max={200} onChange={set("fork.psi")} />
        <NumberField label="Fork sag" unit="mm" value={v["fork.sag_mm"]} step={0.5} min={0} max={200} onChange={set("fork.sag_mm")} />
        <NumberField label="Carrying" unit="kg" value={v["rider.carried_kg"]} step={0.5} min={0} max={50} onChange={set("rider.carried_kg")} hint="A pack, bottles: on top of your mass in kit" />
      </div>
      <div>
        <Button
          size="sm"
          filled
          emphasis="good"
          disabled={!ok || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await setBikeParameters(bikeId, values, "Sag test");
              setV((o) => ({ ...o, "shock.sag_mm": null, "fork.sag_mm": null }));
              onLogged();
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Log the sag test
        </Button>
      </div>
      {error !== null && <p className="text-xs text-[var(--accent)]">{error}</p>}
    </div>
  );
}

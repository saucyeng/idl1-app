import * as Plot from "@observablehq/plot";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { SelectField } from "@/components/ui/select-field";
import type { BumpTrain, SimRun } from "@/ipc/simulate";

import { PLOT_STYLE, PlotBox } from "./PlotBox";

/** A finished run, labelled for the A/B table. */
export interface LabelledRun {
  label: string;
  run: SimRun;
}

/** Props for {@link PlaybackPanel}. */
export interface PlaybackPanelProps {
  bumps: BumpTrain;
  onBumps: (b: BumpTrain) => void;
  running: boolean;
  progress: number;
  onRun: () => void;
  runs: LabelledRun[];
  shown: number;
  onShown: (i: number) => void;
  frame: number;
  playing: boolean;
  speed: number;
  onPlay: (p: boolean) => void;
  onSpeed: (s: number) => void;
  onFrame: (k: number) => void;
  error: string | null;
}

const SPEEDS = [
  { value: "1", label: "1×" },
  { value: "0.25", label: "¼×" },
  { value: "0.0625", label: "1/16×" },
  { value: "0.015625", label: "1/64×" },
];

const SUMMARY: { key: keyof SimRun["summary"]; label: string; unit: string; digits: number }[] = [
  { key: "impacts", label: "Hits on surfaces", unit: "", digits: 0 },
  { key: "max_impact_mps", label: "Fastest hit", unit: "m/s", digits: 2 },
  { key: "clutch_slip_deg", label: "Clutch slip", unit: "°", digits: 1 },
  { key: "max_top_tension_n", label: "Peak top-span tension", unit: "N", digits: 0 },
  { key: "max_pedal_force_n", label: "Peak pedal force", unit: "N", digits: 0 },
  { key: "max_top_deflection_mm", label: "Top span deflection", unit: "mm", digits: 1 },
  { key: "max_lower_deflection_mm", label: "Lower span deflection", unit: "mm", digits: 1 },
  { key: "max_link_error_mm", label: "Solver link error", unit: "mm", digits: 2 },
];

/**
 * The dynamic run (drivetrain sim spec §2.4, §7): the bump train's inputs,
 * Run, then transport controls, a timeline with the playhead, and every
 * run's totals side by side for an A/B.
 */
export function PlaybackPanel(props: PlaybackPanelProps) {
  const { bumps, onBumps, runs, shown, frame } = props;
  const run = runs[shown]?.run ?? null;
  const [channel, setChannel] = useState("Lower span deflection");
  const set = (patch: Partial<BumpTrain>) => onBumps({ ...bumps, ...patch });
  const n = (v: number | null, f: number) => (v === null || !Number.isFinite(v) ? f : v);
  const at = run ? Math.max(0, Math.min(run.frames - 1, Math.floor(frame) || 0)) : 0;
  const t = run ? run.frameT[at] : 0;
  const series = run?.channels.find((c) => c.name === channel) ?? null;

  return (
    <div className="flex flex-col gap-5 text-sm">
      <FieldGroup title="Bumps">
        <NumberField label="Speed" unit="m/s" value={bumps.speed_mps} step={0.5} min={0} max={25} onChange={(v) => set({ speed_mps: n(v, bumps.speed_mps) })} />
        <NumberField label="Sag" unit="mm" value={bumps.sag_m * 1000} step={1} min={0} max={200} onChange={(v) => set({ sag_m: n(v, bumps.sag_m * 1000) / 1000 })} />
        <NumberField label="Hit depth" unit="mm" value={bumps.depth_m * 1000} step={1} min={0} max={300} onChange={(v) => set({ depth_m: n(v, bumps.depth_m * 1000) / 1000 })} />
        <NumberField label="Compression" unit="ms" value={bumps.compress_s * 1000} step={5} min={5} max={1000} onChange={(v) => set({ compress_s: n(v, bumps.compress_s * 1000) / 1000 })} />
        <NumberField label="Rebound" unit="ms" value={bumps.rebound_s * 1000} step={5} min={5} max={2000} onChange={(v) => set({ rebound_s: n(v, bumps.rebound_s * 1000) / 1000 })} />
        <NumberField label="Frame jolt" unit="g" value={bumps.chassis_g} step={0.5} min={0} max={30} onChange={(v) => set({ chassis_g: n(v, bumps.chassis_g) })} hint="Front triangle's extra upward acceleration at each hit" />
        <NumberField label="Hits" value={bumps.count} step={1} min={1} max={50} onChange={(v) => set({ count: Math.round(n(v, bumps.count)) })} />
        <NumberField label="Spacing" unit="ms" value={bumps.spacing_s * 1000} step={10} min={20} max={5000} onChange={(v) => set({ spacing_s: n(v, bumps.spacing_s * 1000) / 1000 })} />
        <Button filled emphasis="good" disabled={props.running} onClick={props.onRun}>
          {props.running ? `Simulating… ${Math.round(props.progress * 100)}%` : "Run"}
        </Button>
        {props.error !== null && <p className="text-xs text-[var(--accent)]">{props.error}</p>}
      </FieldGroup>

      {run !== null && (
        <FieldGroup title="Playback">
          {runs.length > 1 && <SelectField label="Run" value={String(shown)} options={runs.map((r, i) => ({ value: String(i), label: r.label }))} onChange={(v) => props.onShown(Number(v ?? 0))} />}
          <div className="flex items-center gap-2">
            <Button size="icon-sm" aria-label="Step back" onClick={() => props.onFrame(Math.max(0, Math.floor(frame) - 1))}>
              <SkipBack />
            </Button>
            <Button size="icon-sm" filled emphasis="good" aria-label={props.playing ? "Pause" : "Play"} onClick={() => props.onPlay(!props.playing)}>
              {props.playing ? <Pause /> : <Play />}
            </Button>
            <Button size="icon-sm" aria-label="Step forward" onClick={() => props.onFrame(Math.min(run.frames - 1, Math.floor(frame) + 1))}>
              <SkipForward />
            </Button>
            <span className="tabular-nums text-xs text-[var(--fg-dim)]">{t.toFixed(3)} s</span>
          </div>
          <SelectField label="Speed" value={String(props.speed)} options={SPEEDS} onChange={(v) => props.onSpeed(Number(v ?? 1))} />
          <input type="range" min={0} max={run.frames - 1} step={1} value={Math.floor(frame)} onChange={(e) => props.onFrame(Number(e.target.value))} className="w-full accent-[var(--good)]" aria-label="Playhead" />
          <SelectField label="Chart" value={channel} options={run.channels.map((c) => ({ value: c.name, label: c.unit ? `${c.name} (${c.unit})` : c.name }))} onChange={(v) => setChannel(v ?? channel)} className="w-56" />
          {series !== null && <Timeline run={run} values={series.values} name={channel} t={t} />}
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
            {run.channels
              .filter((c) => ["Rear travel", "Cage angle", "Top span tension", "Lower span tension", "Top span deflection", "Lower span deflection", "Clutch slip total", "Links on chainring"].includes(c.name))
              .map((c) => (
                <div key={c.name} className="contents">
                  <span className="text-[var(--fg-dim)]">{c.name}</span>
                  <span className="tabular-nums">
                    {c.values[at].toFixed(1)} {c.unit}
                  </span>
                </div>
              ))}
          </div>
        </FieldGroup>
      )}

      {runs.length > 0 && (
        <FieldGroup title="Totals">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--fg-dim)]">
                <th className="text-left font-normal" />
                {runs.map((r, i) => (
                  <th key={i} className="text-right font-normal">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUMMARY.map((s) => (
                <tr key={s.key}>
                  <td className="text-[var(--fg-dim)]">{s.label}</td>
                  {runs.map((r, i) => (
                    <td key={i} className="text-right tabular-nums">
                      {r.run.summary[s.key].toFixed(s.digits)} {s.unit}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </FieldGroup>
      )}
    </div>
  );
}

/** The run's travel and one channel over time, with the playhead drawn over the chart (the chart itself is built once per run and channel). */
function Timeline({ run, values, name, t }: { run: SimRun; values: Float32Array; name: string; t: number }) {
  const [chart, setChart] = useState<Plot.Plot | null>(null);
  const travel = run.channels.find((c) => c.name === "Rear travel")?.values ?? null;
  const rows = Array.from(run.frameT, (time, i) => ({ t: time, v: values[i], s: travel ? travel[i] : 0 }));
  const x = chart?.scale("x");
  const left = x?.apply !== undefined ? (x.apply(t) as number) : null;
  return (
    <div className="relative">
      <PlotBox
        deps={[run, name]}
        onChart={setChart}
        make={(width) =>
          Plot.plot({
            width,
            height: 160,
            style: PLOT_STYLE,
            marginLeft: 44,
            x: { label: "Time (s)" },
            y: { label: null, grid: true },
            marks: [Plot.areaY(rows, { x: "t", y: "s", fill: "var(--fg-faint)", fillOpacity: 0.25 }), Plot.line(rows, { x: "t", y: "v", stroke: "var(--hivis)", strokeWidth: 1.5 })],
          })
        }
      />
      {left !== null && <div className="pointer-events-none absolute top-0 h-[130px] w-px bg-[var(--info)]" style={{ left }} />}
    </div>
  );
}

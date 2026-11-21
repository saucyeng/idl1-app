import * as Plot from "@observablehq/plot";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { SelectField } from "@/components/ui/select-field";
import { listSessions, type SessionSummary } from "@/ipc/catalog";
import type { BumpTrain, ReplayRequest, RideShape, SimRun } from "@/ipc/simulate";

import { PLOT_STYLE, PlotBox } from "./PlotBox";

/** A finished run, labelled for the A/B table. */
export interface LabelledRun {
  label: string;
  run: SimRun;
  /** Runs made by one press of Run (the ticked bikes over the same bumps) share a group. */
  group: number;
}

/** Props for {@link PlaybackPanel}. */
export interface PlaybackPanelProps {
  bumps: BumpTrain;
  onBumps: (b: BumpTrain) => void;
  /** Ride the springs over bumps of this shape; null prescribes the travel. */
  ride: RideShape | null;
  onRide: (r: RideShape | null) => void;
  /** A recorded stretch drives the run instead of bumps; null: bumps. */
  replay: ReplayRequest | null;
  onReplay: (r: ReplayRequest | null) => void;
  running: boolean;
  progress: number;
  /** What a running replay is doing before it simulates ("estimating travel"…), else null. */
  phase: string | null;
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
  // the runs made with this one (the ticked bikes over the same bumps), the first as the reference
  const groupRuns = run ? runs.filter((r) => r.group === runs[shown].group) : [];
  const [delta, setDelta] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const replay = props.replay;
  useEffect(() => {
    if (replay === null || sessions !== null) return;
    listSessions()
      .then((s) => setSessions([...s].sort((a, b) => b.timestamp_utc_ms - a.timestamp_utc_ms)))
      .catch((e: unknown) => setSessionsError(String((e as { message?: string })?.message ?? e)));
  }, [replay, sessions]);
  const sessionLabel = (s: SessionSummary) => {
    const when = s.timestamp_utc_ms > 0 ? new Date(s.timestamp_utc_ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "undated";
    const where = [s.venue_name, s.event_name, s.bike].filter((x) => x !== "").join(" · ");
    const mins = s.duration_ms !== null ? ` (${Math.round(s.duration_ms / 60000)} min)` : "";
    return `${when}${where ? ` · ${where}` : ""}${mins}`;
  };
  const travelMode = replay !== null ? "recorded" : props.ride !== null ? "ride" : "prescribed";

  return (
    <div className="flex flex-col gap-5 text-sm">
      <FieldGroup title={replay !== null ? "Recorded ride" : "Bumps"}>
        <SelectField
          label="Travel"
          value={travelMode}
          options={[
            { value: "recorded", label: "Recorded ride (a stretch of a session)" },
            { value: "ride", label: "Ride over bumps (springs, damper, tyre)" },
            { value: "prescribed", label: "Prescribed bumps (a shape you set)" },
          ]}
          onChange={(v) => {
            props.onReplay(v === "recorded" ? (replay ?? { session_id: "", from_s: 0, to_s: 20 }) : null);
            if (v !== "recorded") props.onRide(v === "ride" ? (props.ride ?? { bump_height_m: 0.08, bump_length_m: 0.6 }) : null);
          }}
          hint="Recorded: IMU0, the physics estimator's rear travel and GPS speed from a ride drive every ticked bike's drivetrain. Riding: each bike's own shock, pressure, clicks, masses and tyre decide its travel. Prescribed: every bike gets the same travel."
        />
        {replay !== null ? (
          <>
            <SelectField
              label="Session"
              value={replay.session_id === "" ? undefined : replay.session_id}
              className="w-full"
              options={(sessions ?? []).map((s) => ({ value: s.session_id, label: sessionLabel(s) }))}
              onChange={(v) => props.onReplay({ ...replay, session_id: v ?? "" })}
              hint={sessions === null ? "Loading sessions…" : "Its bike's calibration turns IMU0 into the bike's plane; the first replay of a bike fits the estimator on the whole session, which takes a while"}
            />
            {sessionsError !== null && <p className="text-xs text-[var(--accent)]">{sessionsError}</p>}
            <NumberField label="From" unit="s" value={replay.from_s} step={1} min={0} onChange={(v) => props.onReplay({ ...replay, from_s: Math.max(0, n(v, replay.from_s)) })} />
            <NumberField label="To" unit="s" value={replay.to_s} step={1} min={0} onChange={(v) => props.onReplay({ ...replay, to_s: n(v, replay.to_s) })} hint="At most 120 s after From" />
            <NumberField label="IMU0 cut-off" unit="Hz" value={replay.cutoff_hz ?? 100} step={10} min={5} max={500} onChange={(v) => props.onReplay({ ...replay, cutoff_hz: n(v, replay.cutoff_hz ?? 100) })} hint="Low-pass on the frame's motion" />
          </>
        ) : (
          <NumberField label="Speed" unit="m/s" value={bumps.speed_mps} step={0.5} min={0} max={25} onChange={(v) => set({ speed_mps: n(v, bumps.speed_mps) })} />
        )}
        {replay !== null ? null : props.ride !== null ? (
          <>
            <NumberField label="Bump height" unit="mm" value={props.ride.bump_height_m * 1000} step={5} min={-500} max={500} onChange={(v) => props.ride && props.onRide({ ...props.ride, bump_height_m: n(v, props.ride.bump_height_m * 1000) / 1000 })} hint="Negative for a step down" />
            <NumberField label="Bump length" unit="mm" value={props.ride.bump_length_m * 1000} step={50} min={60} max={5000} onChange={(v) => props.ride && props.onRide({ ...props.ride, bump_length_m: n(v, props.ride.bump_length_m * 1000) / 1000 })} />
            <NumberField
              label="Pedalling"
              unit="N·m"
              value={props.ride.pedal_torque_nm ?? 0}
              step={5}
              min={0}
              max={300}
              onChange={(v) => props.ride && props.onRide({ ...props.ride, pedal_torque_nm: n(v, props.ride.pedal_torque_nm ?? 0) })}
              hint="Mean crank torque (0 coasts). The load it moves onto the rear squats the suspension except the share the bike's anti-squat in this gear carries: pedal bob"
            />
            {(props.ride.pedal_torque_nm ?? 0) > 0 && (
              <NumberField label="Cadence" unit="rpm" value={props.ride.cadence_rpm ?? 80} step={5} min={10} max={200} onChange={(v) => props.ride && props.onRide({ ...props.ride, cadence_rpm: n(v, props.ride.cadence_rpm ?? 80) })} />
            )}
          </>
        ) : (
          <>
            <NumberField label="Sag" unit="mm" value={bumps.sag_m * 1000} step={1} min={0} max={200} onChange={(v) => set({ sag_m: n(v, bumps.sag_m * 1000) / 1000 })} />
            <NumberField label="Hit depth" unit="mm" value={bumps.depth_m * 1000} step={1} min={0} max={300} onChange={(v) => set({ depth_m: n(v, bumps.depth_m * 1000) / 1000 })} />
            <NumberField label="Compression" unit="ms" value={bumps.compress_s * 1000} step={5} min={5} max={1000} onChange={(v) => set({ compress_s: n(v, bumps.compress_s * 1000) / 1000 })} />
            <NumberField label="Rebound" unit="ms" value={bumps.rebound_s * 1000} step={5} min={5} max={2000} onChange={(v) => set({ rebound_s: n(v, bumps.rebound_s * 1000) / 1000 })} />
            <NumberField label="Frame jolt" unit="g" value={bumps.chassis_g} step={0.5} min={0} max={30} onChange={(v) => set({ chassis_g: n(v, bumps.chassis_g) })} hint="Front triangle's extra upward acceleration at each hit" />
          </>
        )}
        {replay === null && (
          <>
            <NumberField label="Hits" value={bumps.count} step={1} min={1} max={50} onChange={(v) => set({ count: Math.round(n(v, bumps.count)) })} />
            <NumberField label="Spacing" unit="ms" value={bumps.spacing_s * 1000} step={10} min={20} max={5000} onChange={(v) => set({ spacing_s: n(v, bumps.spacing_s * 1000) / 1000 })} />
          </>
        )}
        <Button filled emphasis="good" disabled={props.running || (replay !== null && replay.session_id === "")} onClick={props.onRun}>
          {props.running ? (props.phase !== null ? `${props.phase[0].toUpperCase()}${props.phase.slice(1)}…` : `Simulating… ${Math.round(props.progress * 100)}%`) : "Run"}
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
          {groupRuns.length > 1 && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={delta} onChange={(e) => setDelta(e.target.checked)} />
              {`Difference from ${groupRuns[0].label}`}
            </label>
          )}
          {series !== null && <Timeline run={run} values={series.values} name={channel} t={t} group={groupRuns} delta={delta} />}
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
                  {runs.map((r, i) => {
                    const ref = runs.find((x) => x.group === r.group);
                    const d = ref !== undefined && ref !== r ? r.run.summary[s.key] - ref.run.summary[s.key] : null;
                    return (
                      <td key={i} className="text-right tabular-nums">
                        {r.run.summary[s.key].toFixed(s.digits)} {s.unit}
                        {d !== null && <span className={`block text-[10px] ${d === 0 ? "text-[var(--fg-faint)]" : "text-[var(--info)]"}`}>{`${d > 0 ? "+" : ""}${d.toFixed(s.digits)}`}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </FieldGroup>
      )}
    </div>
  );
}

/** The run's travel and one channel over time, every run made with it overlaid (or each one's difference from the first), with the playhead drawn over the chart (the chart itself is built once per run and channel). */
function Timeline({ run, values, name, t, group, delta }: { run: SimRun; values: Float32Array; name: string; t: number; group: LabelledRun[]; delta: boolean }) {
  const [chart, setChart] = useState<Plot.Plot | null>(null);
  const travel = run.channels.find((c) => c.name === "Rear travel")?.values ?? null;
  const rows = Array.from(run.frameT, (time, i) => ({ t: time, v: values[i], s: travel ? travel[i] : 0 }));
  const ref = group[0]?.run.channels.find((c) => c.name === name)?.values ?? null;
  const others =
    group.length > 1
      ? group.flatMap((g) => {
          const v = g.run.channels.find((c) => c.name === name)?.values;
          if (v === undefined) return [];
          return Array.from(g.run.frameT, (time, i) => ({ t: time, v: delta && ref !== null && i < ref.length ? v[i] - ref[i] : v[i], run: g.label }));
        })
      : [];
  const x = chart?.scale("x");
  const left = x?.apply !== undefined ? (x.apply(t) as number) : null;
  return (
    <div className="relative">
      <PlotBox
        deps={[run, name, group, delta]}
        onChart={setChart}
        make={(width) =>
          Plot.plot({
            width,
            height: 180,
            style: PLOT_STYLE,
            marginLeft: 44,
            x: { label: "Time (s)" },
            y: { label: null, grid: true },
            color: others.length > 0 ? { legend: true } : undefined,
            marks:
              others.length > 0
                ? [Plot.ruleY([0], { stroke: "var(--rule)" }), Plot.line(others, { x: "t", y: "v", stroke: "run", strokeWidth: 1.5 })]
                : [Plot.areaY(rows, { x: "t", y: "s", fill: "var(--fg-faint)", fillOpacity: 0.25 }), Plot.line(rows, { x: "t", y: "v", stroke: "var(--hivis)", strokeWidth: 1.5 })],
          })
        }
      />
      {left !== null && <div className="pointer-events-none absolute top-0 h-[130px] w-px bg-[var(--info)]" style={{ left }} />}
    </div>
  );
}

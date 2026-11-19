import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { NumberField } from "@/components/ui/number-field";
import { SelectField, SwitchField, TextField } from "@/components/ui/select-field";
import type { Body, DrivetrainParams, RollerPx, SetupPx, SurfacePx } from "@/ipc/simulate";

import { groupColour, newRoller, newSurface, parseCassette, POINTS } from "./model";

const BODIES = [
  { value: "front_triangle", label: "Front triangle" },
  { value: "chainstay", label: "Chainstay" },
  { value: "seatstay", label: "Seatstay" },
];

/** Props for {@link SetupPanel}. */
export interface SetupPanelProps {
  setup: SetupPx;
  placing: string | null;
  onPlacing: (key: string | null) => void;
  onChange: (setup: SetupPx) => void;
  selected: { kind: "roller" | "surface"; index: number } | null;
  onSelect: (s: { kind: "roller" | "surface"; index: number } | null) => void;
}

/**
 * The setup form (drivetrain sim spec §4): which points are placed, the
 * scale and travel, the drivetrain's numbers, and the rollers and contact
 * surfaces. Every number is typed here and converted in Rust.
 */
export function SetupPanel({ setup, placing, onPlacing, onChange, selected, onSelect }: SetupPanelProps) {
  const p = setup.params;
  const setParams = (patch: Partial<DrivetrainParams>) => onChange({ ...setup, params: { ...p, ...patch } });
  const num = (v: number | null, fallback: number) => (v === null || !Number.isFinite(v) ? fallback : v);
  const [cassette, setCassette] = useState(p.cassette_teeth.join(", "));
  useEffect(() => setCassette(p.cassette_teeth.join(", ")), [p.cassette_teeth]);
  const cassetteOk = parseCassette(cassette) !== null;
  const spring0 = p.spring_torque_nm[0]?.[1] ?? 0.45;
  const spring60 = p.spring_torque_nm[1]?.[1] ?? 0.9;

  const setRoller = (i: number, patch: Partial<RollerPx>) => onChange({ ...setup, rollers: setup.rollers.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const setSurface = (i: number, patch: Partial<SurfacePx>) => onChange({ ...setup, surfaces: setup.surfaces.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  const addRoller = (span: "top" | "lower") => {
    const at = span === "top" ? (setup.points.main_pivot ?? [0, 0]) : (setup.points.bb ?? [0, 0]);
    const count = setup.rollers.filter((r) => r.span === span).length;
    const centre: [number, number] = span === "top" ? [at[0], at[1]] : [at[0] - 60, at[1] + 40];
    onChange({ ...setup, rollers: [...setup.rollers, newRoller(centre, span, count)] });
    onSelect({ kind: "roller", index: setup.rollers.length });
  };
  const addSurface = () => {
    const a = setup.points.horst ?? [0, 0];
    const b = setup.points.main_pivot ?? [100, 0];
    onChange({ ...setup, surfaces: [...setup.surfaces, newSurface(a, b, 25, "chainstay")] });
    onSelect({ kind: "surface", index: setup.surfaces.length });
  };

  return (
    <div className="flex flex-col gap-5 text-sm">
      <FieldGroup title="Points">
        <p className="text-xs text-[var(--fg-dim)]">Pick a point, then click it on the photo. Drag any point to adjust. Wheel zooms, Shift-drag pans.</p>
        <div className="grid grid-cols-1 gap-1">
          {POINTS.map((pt) => {
            const placed = setup.points[pt.key] !== undefined;
            const active = placing === pt.key;
            return (
              <button
                key={pt.key}
                type="button"
                onClick={() => onPlacing(active ? null : pt.key)}
                className={`flex items-center justify-between rounded-[var(--radius)] border px-2 py-1 text-left ${active ? "border-[var(--hivis)] bg-[var(--control-active)]" : "border-[var(--rule)] bg-[var(--control)]"}`}
              >
                <span className="flex items-center gap-2">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: groupColour(pt.group) }} />
                  {pt.label}
                  {pt.optional && <span className="text-[var(--fg-faint)]">(optional)</span>}
                </span>
                <span className={placed ? "text-[var(--good)]" : "text-[var(--fg-faint)]"}>{placed ? "placed" : "—"}</span>
              </button>
            );
          })}
        </div>
      </FieldGroup>

      <FieldGroup title="Scale and travel">
        <NumberField label="Wheelbase" unit="mm" value={setup.wheelbase_m * 1000} step={1} min={500} max={2000} onChange={(v) => onChange({ ...setup, wheelbase_m: num(v, setup.wheelbase_m * 1000) / 1000 })} />
        <NumberField label="Rear travel" unit="mm" value={setup.rear_travel_m * 1000} step={1} min={20} max={300} onChange={(v) => onChange({ ...setup, rear_travel_m: num(v, setup.rear_travel_m * 1000) / 1000 })} />
      </FieldGroup>

      <FieldGroup title="Drivetrain">
        <NumberField label="Chainring" unit="T" value={p.chainring_teeth} step={1} min={20} max={60} onChange={(v) => setParams({ chainring_teeth: Math.round(num(v, p.chainring_teeth)) })} />
        <TextField label="Cassette" value={cassette} className="w-56" hint={cassetteOk ? undefined : "Teeth separated by commas, 9 to 60"} onChange={(t) => { setCassette(t); const c = parseCassette(t); if (c) setParams({ cassette_teeth: c, photo_gear: Math.min(p.photo_gear, c.length - 1) }); }} />
        <SelectField label="Photo's gear" value={String(p.photo_gear)} options={p.cassette_teeth.map((t, i) => ({ value: String(i), label: `${t}T` }))} onChange={(v) => setParams({ photo_gear: Number(v ?? 0) })} hint="The cog the chain is on in the photo" />
        <NumberField label="Chain" unit="links" value={p.chain_links} step={2} min={80} max={160} onChange={(v) => setParams({ chain_links: Math.round(num(v, p.chain_links)) })} />
        <NumberField label="Chain mass" unit="g" value={p.chain_mass_kg * 1000} step={1} min={100} max={500} onChange={(v) => setParams({ chain_mass_kg: num(v, p.chain_mass_kg * 1000) / 1000 })} />
        <NumberField label="Upper jockey" unit="T" value={p.jockey_teeth[0]} step={1} min={8} max={20} onChange={(v) => setParams({ jockey_teeth: [Math.round(num(v, p.jockey_teeth[0])), p.jockey_teeth[1]] })} />
        <NumberField label="Lower jockey" unit="T" value={p.jockey_teeth[1]} step={1} min={8} max={20} onChange={(v) => setParams({ jockey_teeth: [p.jockey_teeth[0], Math.round(num(v, p.jockey_teeth[1]))] })} />
      </FieldGroup>

      <FieldGroup title="Derailleur (measure these)">
        <NumberField label="Spring at drawn" unit="N·m" value={spring0} step={0.01} min={0} max={5} onChange={(v) => setParams({ spring_torque_nm: [[0, num(v, spring0)], [60, spring60]] })} hint="Toward tension, at the cage angle in the photo" />
        <NumberField label="Spring 60° forward" unit="N·m" value={spring60} step={0.01} min={0} max={5} onChange={(v) => setParams({ spring_torque_nm: [[0, spring0], [60, num(v, spring60)]] })} />
        <NumberField label="Clutch" unit="N·m" value={p.clutch_torque_nm} step={0.05} min={0} max={10} onChange={(v) => setParams({ clutch_torque_nm: num(v, p.clutch_torque_nm) })} hint="Friction against the cage swinging forward" />
        <NumberField label="Cage bearing" unit="N·m" value={p.bearing_torque_nm} step={0.005} min={0} max={1} onChange={(v) => setParams({ bearing_torque_nm: num(v, p.bearing_torque_nm) })} />
        <NumberField label="Cage mass" unit="g" value={p.cage_mass_kg * 1000} step={1} min={5} max={300} onChange={(v) => setParams({ cage_mass_kg: num(v, p.cage_mass_kg * 1000) / 1000 })} />
        <NumberField label="Cage inertia" unit="g·cm²" value={p.cage_inertia_kgm2 * 1e7} step={10} min={10} max={20000} onChange={(v) => setParams({ cage_inertia_kgm2: num(v, p.cage_inertia_kgm2 * 1e7) / 1e7 })} />
        <NumberField label="Jockey inertia" unit="g·cm²" value={p.jockey_inertia_kgm2 * 1e7} step={1} min={1} max={500} onChange={(v) => setParams({ jockey_inertia_kgm2: num(v, p.jockey_inertia_kgm2 * 1e7) / 1e7 })} />
      </FieldGroup>

      <FieldGroup title="Hub and wheel">
        <NumberField label="Cassette inertia" unit="g·cm²" value={p.cassette_inertia_kgm2 * 1e7} step={100} min={100} max={50000} onChange={(v) => setParams({ cassette_inertia_kgm2: num(v, p.cassette_inertia_kgm2 * 1e7) / 1e7 })} />
        <NumberField label="Freehub engagement" unit="°" value={p.freehub_engagement_deg} step={0.1} min={0.5} max={40} onChange={(v) => setParams({ freehub_engagement_deg: num(v, p.freehub_engagement_deg) })} />
        <NumberField label="Freehub drag" unit="N·m" value={p.freehub_drag_nm} step={0.01} min={0} max={2} onChange={(v) => setParams({ freehub_drag_nm: num(v, p.freehub_drag_nm) })} />
        <NumberField label="Wheel radius" unit="mm" value={p.wheel_radius_m * 1000} step={1} min={200} max={450} onChange={(v) => setParams({ wheel_radius_m: num(v, p.wheel_radius_m * 1000) / 1000 })} />
        <NumberField label="Crank length" unit="mm" value={p.crank_length_m * 1000} step={2.5} min={140} max={190} onChange={(v) => setParams({ crank_length_m: num(v, p.crank_length_m * 1000) / 1000 })} />
      </FieldGroup>

      <FieldGroup title="Rollers">
        <div className="flex gap-2">
          <Button size="xs" onClick={() => addRoller("top")}>Add top roller</Button>
          <Button size="xs" onClick={() => addRoller("lower")}>Add lower guide</Button>
        </div>
        {setup.rollers.map((r, i) => (
          <div key={i} className={`flex flex-col gap-1 rounded-[var(--radius)] border p-2 ${selected?.kind === "roller" && selected.index === i ? "border-[var(--hivis)]" : "border-[var(--rule)]"}`} onClick={() => onSelect({ kind: "roller", index: i })}>
            <TextField label="Name" value={r.name} className="w-40" onChange={(t) => setRoller(i, { name: t })} />
            <SwitchField label="Fitted" checked={r.enabled} onChange={(c) => setRoller(i, { enabled: c })} />
            <SwitchField label="Chain threaded round it" checked={r.threaded} onChange={(c) => setRoller(i, { threaded: c })} hint={r.threaded ? "An idler: the chain stays on it at every travel" : "A guide: it acts only when the chain reaches it"} />
            <SelectField label="Mounted on" value={r.body} options={BODIES} onChange={(v) => setRoller(i, { body: (v ?? "front_triangle") as Body })} />
            <SelectField label="Span" value={r.span} options={[{ value: "top", label: "Top" }, { value: "lower", label: "Lower" }]} onChange={(v) => setRoller(i, { span: v === "lower" ? "lower" : "top" })} />
            <SelectField label="Chain runs" value={r.side} options={[{ value: "over", label: "Over it" }, { value: "under", label: "Under it" }]} onChange={(v) => setRoller(i, { side: v === "over" ? "over" : "under" })} />
            <NumberField label="Teeth (0 smooth)" value={r.teeth ?? 0} step={1} min={0} max={40} onChange={(v) => setRoller(i, { teeth: v === null || v < 6 ? null : Math.round(v) })} />
            {r.teeth === null && <NumberField label="Radius" unit="mm" value={r.radius_mm} step={0.5} min={3} max={40} onChange={(v) => setRoller(i, { radius_mm: num(v, r.radius_mm) })} />}
            <Button size="xs" emphasis="accent" onClick={(e) => { e.stopPropagation(); onSelect(null); onChange({ ...setup, rollers: setup.rollers.filter((_, k) => k !== i) }); }}>
              Remove
            </Button>
          </div>
        ))}
      </FieldGroup>

      <FieldGroup title="Contact surfaces">
        <Button size="xs" onClick={addSurface}>Add a surface</Button>
        <p className="text-xs text-[var(--fg-dim)]">Drag its squares onto the protector's edge. Click the line to add a point there; right-click a point to remove it.</p>
        {setup.surfaces.map((s, i) => (
          <div key={i} className={`flex flex-col gap-1 rounded-[var(--radius)] border p-2 ${selected?.kind === "surface" && selected.index === i ? "border-[var(--good)]" : "border-[var(--rule)]"}`} onClick={() => onSelect({ kind: "surface", index: i })}>
            <TextField label="Name" value={s.name} className="w-40" onChange={(t) => setSurface(i, { name: t })} />
            <SelectField label="On" value={s.body} options={BODIES} onChange={(v) => setSurface(i, { body: (v ?? "chainstay") as Body })} />
            <SelectField label="Chain stays" value={s.side} options={[{ value: "above", label: "Above it" }, { value: "below", label: "Below it" }]} onChange={(v) => setSurface(i, { side: v === "below" ? "below" : "above" })} />
            <div className="flex gap-2">
              <Button size="xs" onClick={(e) => { e.stopPropagation(); const pl = s.polyline_px; const last = pl[pl.length - 1]; setSurface(i, { polyline_px: [...pl, [last[0] + 30, last[1]]] }); }}>Add a point</Button>
              <Button size="xs" disabled={s.polyline_px.length <= 2} onClick={(e) => { e.stopPropagation(); setSurface(i, { polyline_px: s.polyline_px.slice(0, -1) }); }}>Remove a point</Button>
              <Button size="xs" emphasis="accent" onClick={(e) => { e.stopPropagation(); onSelect(null); onChange({ ...setup, surfaces: setup.surfaces.filter((_, k) => k !== i) }); }}>Remove</Button>
            </div>
          </div>
        ))}
      </FieldGroup>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { SelectField, TextField } from "@/components/ui/select-field";
import { getBikeParameters, setBikeParameters, type BikeParametersView, type ParamFamily, type ParamSpec } from "@/ipc/bikelog";
import { readGeometryTable, type GeometryTable } from "@/ipc/simulate";

const FAMILY_TITLES: Record<ParamFamily, string> = {
  tyres: "Tyres",
  wheels: "Wheels",
  fork: "Fork",
  shock: "Shock",
  frame: "Frame",
  geometry: "Geometry",
  cockpit: "Cockpit",
  masses: "Masses",
  rider: "Rider",
};

/** The families in the order the vocabulary first uses them. */
function families(specs: ParamSpec[]): ParamFamily[] {
  return specs.map((s) => s.family).filter((f, i, all) => all.indexOf(f) === i);
}

/**
 * A bike's parameters (whole-bike sim spec §12) as folding families, with
 * the mass table under Masses. Edits wait for Apply: on a real bike, the
 * logged ones (pressures, clicks) become one log note with the text typed
 * here; the rest, and everything on a variant, change the bike's own values.
 */
/** Props for {@link ParamFamilies}. */
export interface ParamFamiliesProps {
  bikeId: string;
  /** Bumped when something else changed the bike's parameters: fetch again. */
  version?: number;
  /** The effective parameters whenever they load or change. */
  onEffective?: (effective: Record<string, unknown>) => void;
  /** Sets the drawing's wheelbase (m) from an imported table. */
  onWheelbase?: (m: number) => void;
  /** The geometry import takes dropped images while open: it hands its handler here, then null. */
  onDropTarget?: (fn: ((path: string) => void) | null) => void;
}

export function ParamFamilies({ bikeId, version = 0, onEffective, onWheelbase, onDropTarget }: ParamFamiliesProps) {
  const [view, setView] = useState<BikeParametersView | null>(null);
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setView(null);
    setPending({});
    getBikeParameters(bikeId)
      .then((v) => {
        if (!live) return;
        setView(v);
        onEffective?.(v.effective);
      })
      .catch((e: unknown) => live && setError(String((e as { message?: unknown })?.message ?? e)));
    return () => {
      live = false;
    };
    // refetch on a new bike or a new version only, not a new callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bikeId, version]);

  if (view === null) return error !== null ? <p className="text-xs text-[var(--accent)]">{error}</p> : null;
  const value = (k: string) => (k in pending ? pending[k] : view.effective[k]);
  const loggedPending = !view.variant && Object.keys(pending).some((k) => view.specs.find((s) => s.key === k)?.logged);
  const m = view.masses;
  const kg = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)} kg`);

  async function apply(): Promise<void> {
    try {
      setError(null);
      const v = await setBikeParameters(bikeId, pending, note.trim());
      setView(v);
      onEffective?.(v.effective);
      setPending({});
      setNote("");
    } catch (e) {
      setError(String((e as { message?: unknown })?.message ?? e));
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {families(view.specs).map((f) => (
        <details key={f} className="flex flex-col">
          <summary className="cursor-pointer select-none py-1 text-xs font-medium tracking-[var(--tracking-label)] text-[var(--fg-dim)] uppercase">{FAMILY_TITLES[f]}</summary>
          <div className="flex flex-col gap-[var(--nb-gap)] pt-1 pb-2">
            {view.specs
              .filter((s) => s.family === f)
              .map((s) => {
                const v = value(s.key);
                const hint = s.logged && !view.variant ? "A setup change: Apply adds it to the log" : undefined;
                return s.kind === "number" ? (
                  <NumberField
                    key={s.key}
                    label={s.label}
                    unit={s.unit || undefined}
                    value={typeof v === "number" ? v : null}
                    hint={hint}
                    onChange={(n) => setPending((p) => ({ ...p, [s.key]: n === null || !Number.isFinite(n) ? null : n }))}
                  />
                ) : (
                  <TextField key={s.key} label={s.label} value={typeof v === "string" ? v : ""} hint={hint} onChange={(t) => setPending((p) => ({ ...p, [s.key]: t === "" ? null : t }))} />
                );
              })}
            {f === "geometry" && <GeometryImport onDropTarget={onDropTarget} onApply={(values) => setPending((p) => ({ ...p, ...values }))} onWheelbase={onWheelbase} />}
            {f === "masses" && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 text-xs tabular-nums">
                <span className="text-[var(--fg-dim)]">Front wheel rolling</span>
                <span>{`${kg(m.front.mass_kg)}, ${m.front.inertia_kgm2.toFixed(3)} kg·m²${m.front.complete ? "" : " (parts missing)"}`}</span>
                <span className="text-[var(--fg-dim)]">Rear wheel rolling</span>
                <span>{`${kg(m.rear.mass_kg)}, ${m.rear.inertia_kgm2.toFixed(3)} kg·m²${m.rear.complete ? "" : " (parts missing)"}`}</span>
                <span className="text-[var(--fg-dim)]">Front unsprung</span>
                <span>{kg(m.front_unsprung_kg)}</span>
                <span className="text-[var(--fg-dim)]">Rear unsprung</span>
                <span>{kg(m.rear_unsprung_kg)}</span>
                <span className="text-[var(--fg-dim)]">Bike sprung</span>
                <span>{kg(m.bike_sprung_kg)}</span>
                <span className="text-[var(--fg-dim)]">Everything else on the bike</span>
                <span>{kg(m.rest_kg)}</span>
              </div>
            )}
          </div>
        </details>
      ))}
      {Object.keys(pending).length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--rule)] p-2">
          {loggedPending && <TextField label="Log note" value={note} onChange={setNote} placeholder="more support for the jumps" />}
          <div className="flex gap-2">
            <Button size="sm" filled emphasis="good" onClick={() => void apply()}>
              {loggedPending ? "Apply and log" : "Apply"}
            </Button>
            <Button size="sm" onClick={() => setPending({})}>
              Discard
            </Button>
          </div>
        </div>
      )}
      {error !== null && <p className="text-xs text-[var(--accent)]">{error}</p>}
    </div>
  );
}


/**
 * Reads a maker's geometry table from a screenshot (paste it, drop its
 * file on the stage, or pick it) and fills the Geometry family for one size
 * and setting. The OCR and the table's reading are the bridge's and the
 * engine's (`read_geometry_table`); this only picks the column.
 */
function GeometryImport({ onDropTarget, onApply, onWheelbase }: { onDropTarget?: (fn: ((path: string) => void) | null) => void; onApply: (values: Record<string, number>) => void; onWheelbase?: (m: number) => void }) {
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState<GeometryTable | null>(null);
  const [size, setSize] = useState(0);
  const [choice, setChoice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  async function read(from: { image: Uint8Array } | { path: string }): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const t = await readGeometryTable(from);
      setTable(t);
      setSize((s) => Math.min(s, t.sizes.length - 1));
    } catch (e) {
      setError(String((e as { message?: unknown })?.message ?? e));
    } finally {
      setBusy(false);
    }
  }
  const readRef = useRef(read);
  readRef.current = read;
  const targetRef = useRef(onDropTarget);
  targetRef.current = onDropTarget;
  useEffect(() => {
    if (!open) return;
    const target = targetRef.current;
    target?.((path) => void readRef.current({ path }));
    box.current?.focus();
    return () => target?.(null);
  }, [open]);

  if (!open) {
    return (
      <div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Import from a screenshot…
        </Button>
      </div>
    );
  }
  const most = table === null ? 0 : Math.max(1, ...table.rows.map((r) => r.values[size]?.length ?? 0));
  const picked = table === null ? [] : table.rows.filter((r) => r.key !== null && (r.values[size]?.length ?? 0) > 0).map((r) => ({ r, v: r.values[size][Math.min(choice, r.values[size].length - 1)] }));
  const wheelbase = picked.find((p) => p.r.key === "geometry.wheelbase_mm")?.v;
  return (
    <div
      ref={box}
      tabIndex={0}
      className="flex flex-col gap-2 rounded-[var(--radius)] border border-dashed border-[var(--rule)] p-2 text-xs outline-none focus:border-[var(--info)]"
      onPaste={(e) => {
        const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
        const file = item?.getAsFile();
        if (file) {
          e.preventDefault();
          void file.arrayBuffer().then((b) => read({ image: new Uint8Array(b) }));
        }
      }}
    >
      <p className="text-[var(--fg-dim)]">
        Screenshot the maker&apos;s geometry table (Win+Shift+S), click here and paste with Ctrl+V, or drop the image file on the photo. Sizes across the top, measurements down the side.
      </p>
      {busy && <p>Reading the table…</p>}
      {error !== null && <p className="text-[var(--accent)]">{error}</p>}
      {table !== null && (
        <>
          <div className="flex gap-2">
            <SelectField label="Size" value={String(size)} options={table.sizes.map((s, i) => ({ value: String(i), label: s }))} onChange={(v) => setSize(Number(v ?? 0))} className="w-24" />
            {most > 1 && (
              <SelectField
                label="Setting"
                value={String(choice)}
                options={Array.from({ length: most }, (_, i) => ({ value: String(i), label: i === 0 ? "First (short / low)" : `Value ${i + 1} (long / high)` }))}
                onChange={(v) => setChoice(Number(v ?? 0))}
                className="w-48"
              />
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
            {table.rows.map((r, i) => (
              <div key={i} className="contents">
                <span className={r.key === null ? "text-[var(--fg-faint)]" : ""}>{r.label}</span>
                <span className={r.key === null ? "text-[var(--fg-faint)]" : ""}>{(r.values[size] ?? []).join(" / ") || "—"}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" filled emphasis="good" disabled={picked.length === 0} onClick={() => onApply(Object.fromEntries(picked.map((p) => [p.r.key as string, p.v])))}>
              {`Fill ${picked.length} values`}
            </Button>
            {wheelbase !== undefined && onWheelbase !== undefined && (
              <Button size="sm" onClick={() => onWheelbase(wheelbase / 1000)} title="The photo's scale comes from the wheelbase between the axles">
                {`Scale the photo to ${wheelbase.toFixed(0)} mm`}
              </Button>
            )}
          </div>
          <p className="text-[var(--fg-dim)]">Greyed rows weren&apos;t recognised and aren&apos;t filled. Check the values against the table, then Apply below.</p>
        </>
      )}
      <div>
        <Button
          size="sm"
          onClick={() => {
            setOpen(false);
            setTable(null);
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

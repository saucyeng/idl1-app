import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { TextField } from "@/components/ui/select-field";
import { getBikeParameters, setBikeParameters, type BikeParametersView, type ParamFamily, type ParamSpec } from "@/ipc/bikelog";

const FAMILY_TITLES: Record<ParamFamily, string> = {
  tyres: "Tyres",
  wheels: "Wheels",
  fork: "Fork",
  shock: "Shock",
  frame: "Frame",
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
export function ParamFamilies({ bikeId }: { bikeId: string }) {
  const [view, setView] = useState<BikeParametersView | null>(null);
  const [pending, setPending] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setView(null);
    setPending({});
    getBikeParameters(bikeId)
      .then((v) => live && setView(v))
      .catch((e: unknown) => live && setError(String((e as { message?: unknown })?.message ?? e)));
    return () => {
      live = false;
    };
  }, [bikeId]);

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

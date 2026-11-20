import { ChevronDown, ChevronRight, Copy, GitBranch, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TextField } from "@/components/ui/select-field";
import type { Bike, BikeNaming } from "@/ipc/bikelog";

import { bikeTree } from "./model";

const INITIALS_KEY = "idl1.simulate.initials";

function readInitials(): string {
  try {
    return localStorage.getItem(INITIALS_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeInitials(v: string): void {
  try {
    localStorage.setItem(INITIALS_KEY, v);
  } catch {
    // a per-viewer convenience only
  }
}

/** Props for {@link BikeTree}. */
export interface BikeTreeProps {
  bikes: Bike[];
  /** The bike on the stage, whose families show under it. */
  activeId: string | null;
  /** Bikes ticked to run together. */
  compare: ReadonlySet<string>;
  onOpen: (bikeId: string) => void;
  onToggleCompare: (bikeId: string) => void;
  onCreate: (naming: BikeNaming) => Promise<void>;
  onCopy: (fromId: string, naming: BikeNaming, kind: "variant" | "copy") => Promise<void>;
  /** The open bike's parameter families. */
  families: ReactNode;
}

/** What a form is making, if one is open. */
type Making = { kind: "new" } | { kind: "variant"; from: Bike } | { kind: "copy"; from: Bike } | null;

/**
 * The Simulate tab's sidebar (whole-bike sim spec §12): every bike, its
 * variants under it, the open bike's parameter families folded beneath
 * it, a tick to run a bike with the others, and forms to make a new bike,
 * a variant, or a copy for someone else's bike of the same model.
 */
export function BikeTree({ bikes, activeId, compare, onOpen, onToggleCompare, onCreate, onCopy, families }: BikeTreeProps) {
  const [making, setMaking] = useState<Making>(null);
  const tree = bikeTree(bikes);

  const row = (b: Bike, depth: number) => {
    const open = b.bike_id === activeId;
    return (
      <div key={b.bike_id} className="flex flex-col">
        <div className={`group flex items-center gap-1.5 rounded-[var(--radius)] py-1 pr-1 ${open ? "bg-[var(--control-active)]" : "hover:bg-[var(--control)]"}`} style={{ paddingLeft: 4 + depth * 14 }}>
          <Checkbox checked={compare.has(b.bike_id)} onCheckedChange={() => onToggleCompare(b.bike_id)} aria-label={`Run ${b.name || b.bike_id} with the others`} title="Run with the others" />
          <button type="button" onClick={() => onOpen(b.bike_id)} className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm">
            {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0 text-[var(--fg-faint)]" />}
            <span className="truncate">{b.name || b.bike_id}</span>
          </button>
          <span className="hidden gap-0.5 group-hover:flex">
            <Button size="icon-sm" aria-label="New variant" title="New variant: an idea for this bike" onClick={() => setMaking({ kind: "variant", from: b })}>
              <GitBranch />
            </Button>
            {b.variant_of === undefined && (
              <Button size="icon-sm" aria-label="Copy as a new bike" title="Copy as a new bike (someone else's of the same model)" onClick={() => setMaking({ kind: "copy", from: b })}>
                <Copy />
              </Button>
            )}
          </span>
        </div>
        {open && <div className="flex flex-col gap-3 py-2 pr-1" style={{ paddingLeft: 10 + depth * 14 }}>{families}</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1 p-2 text-sm">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-xs text-[var(--fg-dim)]">Tick bikes to run them together</span>
        <Button size="sm" onClick={() => setMaking({ kind: "new" })}>
          <Plus /> New bike
        </Button>
      </div>
      {making !== null && <NamingForm making={making} onCancel={() => setMaking(null)} onDone={async (n) => {
        if (making.kind === "new") await onCreate(n);
        else await onCopy(making.from.bike_id, n, making.kind);
        setMaking(null);
      }} />}
      {tree.map((node) => (
        <div key={node.bike.bike_id} className="flex flex-col">
          {row(node.bike, 0)}
          {node.variants.map((v) => row(v, 1))}
        </div>
      ))}
      {tree.length === 0 && <p className="px-1 text-xs text-[var(--fg-dim)]">No bikes yet. Make one with New bike.</p>}
    </div>
  );
}

/** The form for a new bike, a variant or a copy: the parts of its name. */
function NamingForm({ making, onCancel, onDone }: { making: Exclude<Making, null>; onCancel: () => void; onDone: (n: BikeNaming) => Promise<void> }) {
  const from = making.kind === "new" ? null : making.from;
  const m = from?.model;
  // a variant keeps its bike's name; a bike made before models were recorded lends its name as the model
  const [initials, setInitials] = useState(making.kind === "copy" ? "" : making.kind === "variant" ? (m !== undefined ? (from?.name.split(" ")[0] ?? "") : "") : readInitials());
  const [year, setYear] = useState(m?.year !== undefined ? String(m.year) : "");
  const [make, setMake] = useState(m?.make ?? "");
  const [model, setModel] = useState(m?.model ?? (from?.name ?? ""));
  const [size, setSize] = useState(m?.size ?? "");
  const [variant, setVariant] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yearN = year.trim() === "" ? null : Number(year);
  const yearOk = yearN === null || (Number.isInteger(yearN) && yearN > 1900 && yearN < 2200);
  const ok = making.kind === "variant" ? variant.trim() !== "" : initials.trim() !== "" && (make.trim() !== "" || model.trim() !== "") && yearOk;
  const title = making.kind === "new" ? "New bike" : making.kind === "variant" ? `Variant of ${from?.name}` : `New bike from ${from?.name}`;
  return (
    <form
      className="mb-2 flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--rule)] p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ok) return;
        setBusy(true);
        setError(null);
        try {
          if (making.kind !== "copy") writeInitials(initials.trim());
          await onDone({ initials: initials.trim(), year: yearN, make: make.trim(), model: model.trim(), size: size.trim() || null, variant: making.kind === "variant" ? variant.trim() : null });
        } catch (err) {
          setError(err !== null && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="text-xs font-medium">{title}</div>
      {making.kind === "variant" ? (
        <TextField label="Variant" value={variant} onChange={setVariant} placeholder="lower idler" />
      ) : (
        <>
          <TextField label="Owner's initials" value={initials} onChange={setInitials} placeholder="IA" />
          <TextField label="Model year" value={year} onChange={setYear} placeholder="2023" />
          <TextField label="Make" value={make} onChange={setMake} placeholder="GT" />
          <TextField label="Model" value={model} onChange={setModel} placeholder="Force" />
          <TextField label="Size" value={size} onChange={setSize} placeholder="LG" />
        </>
      )}
      {error !== null && <p className="text-xs text-[var(--accent)]">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" filled emphasis="good" type="submit" disabled={!ok || busy}>
          {making.kind === "variant" ? "Make variant" : "Make bike"}
        </Button>
        <Button size="sm" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

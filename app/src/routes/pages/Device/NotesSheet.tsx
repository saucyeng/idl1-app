import { useEffect, useState } from "react";

import { BrandSheet } from "../../../components/brand/BrandSheet";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { bikeForName, getBikeLog, listBikes, saveBikeLogEntry } from "../../../ipc/bikelog";
import type { Bike, BikeLogView } from "../../../ipc/bikelog";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { deleteNote, deviceName, editNote, formatWhen, newNote, noteRows } from "./notesModel";
import { newSheet, SHEET_SECTIONS, sectionsFor, sheetValues, toInput } from "./sheetFields";

/** Field key → "Fork LSC (clicks)" for the sheet display. */
const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  SHEET_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, `${s.title} ${f.label}${f.unit ? ` (${f.unit})` : ""}`])),
);

/** Props for {@link NotesSheet}. */
export interface NotesSheetProps {
  open: boolean;
  onClose: () => void;
  /** The logger's bike name, which picks the bike; null or empty with no
   *  logger (the Data tab), when the sheet offers a bike picker. */
  bikeName: string | null;
}

/** Shows a sheet value: numbers and text as they are, anything else as JSON. */
function showValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

/**
 * The bike log notepad the dashboard's Notes chip opens (bike-log spec
 * §1), and the Data tab's Bike notes with no logger connected. Type a note
 * and it is stamped with the time and the bike (the logger's, or the one
 * picked here);
 * the next ride on that bike takes it. Below: the log, newest first, and
 * the running setup sheet. Notes edited on two devices show both texts to
 * pick from.
 */
export default function NotesSheet({ open, onClose, bikeName }: NotesSheetProps) {
  const [bike, setBike] = useState<Bike | null>(null);
  const [log, setLog] = useState<BikeLogView | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The confirm-setup form's inputs by field key, or null when closed. */
  const [confirming, setConfirming] = useState<Record<string, string> | null>(null);
  const [comment, setComment] = useState("");
  const device = typeof navigator === "undefined" ? "desktop" : deviceName(navigator.userAgent);
  const name = bikeName?.trim() ?? "";
  /** A bike picked in the sheet, over the logger's. */
  const [picked, setPicked] = useState<Bike | null>(null);
  const [bikes, setBikes] = useState<Bike[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [newBike, setNewBike] = useState("");

  useEffect(() => {
    if (!open) return;
    let live = true;
    listBikes()
      .then((b) => live && setBikes(b))
      .catch(() => live && setBikes([]));
    return () => {
      live = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setError(null);
    // The picked bike, else the logger's, else the only bike there is.
    const target: Promise<Bike | null> =
      picked !== null ? Promise.resolve(picked) : name !== "" ? bikeForName(name) : Promise.resolve(bikes?.length === 1 ? bikes[0] : null);
    target
      .then(async (b) => {
        const view = b === null ? null : await getBikeLog(b.bike_id);
        if (live) {
          setBike(b);
          setLog(view);
        }
      })
      .catch((e: DeviceIpcError) => live && setError(describeIpcError(e)));
    return () => {
      live = false;
    };
  }, [open, name, picked, bikes]);

  async function addBike(): Promise<void> {
    try {
      const b = await bikeForName(newBike);
      setNewBike("");
      setBikes(await listBikes());
      setPicked(b);
      setPicking(false);
    } catch (e) {
      setError(describeIpcError(e as DeviceIpcError));
    }
  }

  const picker = (
    <div className="flex flex-col gap-px border border-rule bg-rule">
      {(bikes ?? []).map((b) => (
        <button
          key={b.bike_id}
          type="button"
          className="min-h-12 bg-bg px-3 text-left text-base text-fg"
          onClick={() => {
            setPicked(b);
            setPicking(false);
          }}
        >
          {b.name || b.bike_id}
        </button>
      ))}
      <div className="flex gap-2 bg-bg p-2">
        <Input className="h-10 text-base" placeholder="New bike name" value={newBike} onChange={(e) => setNewBike(e.target.value)} />
        <Button type="button" className="h-10" disabled={newBike.trim() === ""} onClick={() => void addBike()}>
          Add
        </Button>
      </div>
    </div>
  );

  async function save(entry: Parameters<typeof saveBikeLogEntry>[0]): Promise<void> {
    if (bike === null) return;
    setBusy(true);
    setError(null);
    try {
      await saveBikeLogEntry(entry);
      setLog(await getBikeLog(bike.bike_id));
    } catch (e) {
      setError(describeIpcError(e as DeviceIpcError));
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    if (bike === null || draft.trim() === "") return;
    await save(newNote(bike.bike_id, draft, Date.now(), device));
    setDraft("");
  }

  function startConfirm(): void {
    if (log === null) return;
    setConfirming(Object.fromEntries(Object.entries(log.running_sheet.values).map(([k, v]) => [k, toInput(v)])));
    setComment("");
  }

  async function confirm(): Promise<void> {
    if (bike === null || confirming === null) return;
    await save(newSheet(bike.bike_id, sheetValues(confirming, sectionsFor(bike.fields)), comment, Date.now(), device));
    setConfirming(null);
  }

  function find(entryId: string) {
    return log?.entries.find((e) => e.entry.entry_id === entryId) ?? null;
  }

  const rows = log === null ? [] : noteRows(log);
  const now = Date.now();
  const runningValues = log === null ? [] : Object.entries(log.running_sheet.values);

  return (
    <BrandSheet open={open} onOpenChange={(o) => !o && onClose()} title={bike === null ? "Bike notes" : `Notes · ${bike.name || bike.bike_id}`}>
      {bike === null ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-dim">Which bike are these notes for?</p>
          {picker}
          {error !== null && <p className="text-sm text-brand-accent">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-fg-dim">{picked === null && name !== "" ? "The logger's bike" : "Bike"}</span>
            <button type="button" className="text-sm text-fg-dim underline" onClick={() => setPicking(!picking)}>
              {picking ? "Cancel" : "Change bike"}
            </button>
          </div>
          {picking && picker}
          <div className="flex flex-col gap-2">
            <textarea
              className="min-h-24 w-full rounded-[var(--radius-card)] border border-rule bg-surface p-3 text-base text-fg"
              value={draft}
              placeholder="e.g. +1 LSC fork, rear 26 psi"
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="button" emphasis="accent" filled className="h-11" disabled={busy || bike === null || draft.trim() === ""} onClick={() => void add()}>
              Add note
            </Button>
            <p className="text-xs text-fg-dim">Stamped with the time. The next ride on this bike takes every note since the last one.</p>
          </div>

          {error !== null && <p className="text-sm text-brand-accent">{error}</p>}

          <section className="flex flex-col gap-2">
            <h3 className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Log</h3>
            {log !== null && rows.length === 0 && <p className="text-sm text-fg-dim">No notes yet.</p>}
            {rows.map((row) => {
              const view = find(row.entryId);
              return (
                <div key={row.entryId} className="flex flex-col gap-1 rounded-[var(--radius-card)] border border-rule bg-surface px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs text-fg-dim">{formatWhen(row.atMs, now)}</span>
                    {view?.current && (
                      <button
                        type="button"
                        className="text-xs text-fg-dim underline"
                        disabled={busy}
                        onClick={() => void save(deleteNote(view.entry, view.current!, Date.now(), device))}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {row.kind === "sheet" ? (
                    <span className="text-sm font-medium text-fg">Setup confirmed{row.text ? ` · ${row.text}` : ""}</span>
                  ) : row.inConflict ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-hivis">Changed on two devices. Keep which?</span>
                      {row.choices.map((text, i) => (
                        <button
                          key={i}
                          type="button"
                          className="rounded border border-rule px-2 py-1 text-left text-sm text-fg"
                          disabled={busy}
                          onClick={() => view?.current && void save(editNote(view.entry, view.current, text, Date.now(), device))}
                        >
                          {text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm whitespace-pre-wrap text-fg">{row.text}</span>
                  )}
                </div>
              );
            })}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">Setup sheet</h3>
            {log !== null && log.running_sheet.baseline === null && runningValues.length === 0 ? (
              <p className="text-sm text-fg-dim">No confirmed setup sheet yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-sm">
                {runningValues.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-fg-dim">{FIELD_LABELS[key] ?? key}</dt>
                    <dd className="text-fg">{showValue(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {log !== null && log.running_sheet.since.length > 0 && (
              <p className="text-xs text-fg-dim">
                {log.running_sheet.since.length} note{log.running_sheet.since.length === 1 ? "" : "s"} since the last confirmed sheet.
              </p>
            )}
            {confirming === null ? (
              <Button type="button" className="h-11" disabled={busy || log === null || bike === null} onClick={startConfirm}>
                Confirm setup…
              </Button>
            ) : (
              <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-rule p-3">
                <p className="text-xs text-fg-dim">Check every value against the bike. Leave a field blank if it doesn&apos;t apply. Clicks are counted from fully closed.</p>
                {sectionsFor(bike?.fields ?? []).map((section) => (
                  <fieldset key={section.title} className="flex flex-col gap-1.5">
                    <legend className="text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase">{section.title}</legend>
                    {section.fields.map((field) => (
                      <label key={field.key} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                        <span className="text-sm text-fg">
                          {field.label}
                          {field.unit && <span className="text-fg-dim"> ({field.unit})</span>}
                        </span>
                        <Input
                          className="h-10 text-base"
                          inputMode={field.numeric ? "decimal" : "text"}
                          value={confirming[field.key] ?? ""}
                          onChange={(e) => setConfirming({ ...confirming, [field.key]: e.target.value })}
                        />
                      </label>
                    ))}
                  </fieldset>
                ))}
                <Input className="h-10 text-base" placeholder="Comment, e.g. after fork service" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" className="h-11" onClick={() => setConfirming(null)}>
                    Cancel
                  </Button>
                  <Button type="button" emphasis="accent" filled className="h-11" disabled={busy} onClick={() => void confirm()}>
                    Confirm
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </BrandSheet>
  );
}

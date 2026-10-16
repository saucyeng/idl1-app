import { useEffect, useState } from "react";

import { BrandSheet } from "../../../components/brand/BrandSheet";
import { Button } from "../../../components/ui/button";
import { bikeForName, getBikeLog, saveBikeLogEntry } from "../../../ipc/bikelog";
import type { Bike, BikeLogView } from "../../../ipc/bikelog";
import { describeIpcError } from "./errors";
import type { DeviceIpcError } from "./errors";
import { deleteNote, deviceName, editNote, formatWhen, newNote, noteRows } from "./notesModel";

/** Props for {@link NotesSheet}. */
export interface NotesSheetProps {
  open: boolean;
  onClose: () => void;
  /** The logger's bike name; the log belongs to that bike. */
  bikeName: string | null;
}

/** Shows a sheet value: numbers and text as they are, anything else as JSON. */
function showValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value);
}

/**
 * The bike log notepad the dashboard's Notes chip opens (bike-log spec
 * §1). Type a note and it is stamped with the time and the logger's bike;
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
  const device = typeof navigator === "undefined" ? "desktop" : deviceName(navigator.userAgent);
  const name = bikeName?.trim() ?? "";

  useEffect(() => {
    if (!open || name === "") return;
    let live = true;
    setError(null);
    bikeForName(name)
      .then(async (b) => {
        const view = await getBikeLog(b.bike_id);
        if (live) {
          setBike(b);
          setLog(view);
        }
      })
      .catch((e: DeviceIpcError) => live && setError(describeIpcError(e)));
    return () => {
      live = false;
    };
  }, [open, name]);

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

  function find(entryId: string) {
    return log?.entries.find((e) => e.entry.entry_id === entryId) ?? null;
  }

  const rows = log === null ? [] : noteRows(log);
  const now = Date.now();
  const sheetValues = log === null ? [] : Object.entries(log.running_sheet.values);

  return (
    <BrandSheet open={open} onOpenChange={(o) => !o && onClose()} title={name === "" ? "Notes" : `Notes · ${name}`}>
      {name === "" ? (
        <p className="text-sm text-fg-dim">Name this logger&apos;s bike first (the Bike chip), so notes know which bike they belong to.</p>
      ) : (
        <div className="flex flex-col gap-4">
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
            {log !== null && log.running_sheet.baseline === null && sheetValues.length === 0 ? (
              <p className="text-sm text-fg-dim">No confirmed setup sheet yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-sm">
                {sheetValues.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-fg-dim">{key}</dt>
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
          </section>
        </div>
      )}
    </BrandSheet>
  );
}

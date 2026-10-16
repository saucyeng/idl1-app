import { useEffect, useState } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../components/ui/sheet";
import { sheetSideFor, type SheetSide } from "../components/overlays/sheetSide";
import { attachBikeLog, bikeForName, getBikeLog, listBikes } from "../ipc/bikelog";
import type { Bike, BikeLogView } from "../ipc/bikelog";
import { getSession, listSessions, saveSessionMetadata } from "../ipc/catalog";
import type { SessionDetail } from "../ipc/catalog";
import { formatDateMs, formatDurationMs, formatLapTimeMs, formatTimeMs } from "../routes/pages/Data/format";
import { formatWhen } from "../routes/pages/Device/notesModel";
import { dispatchRideFlow, draftsToSave, sessionIdFor, useRideFlow } from "./rideFlow";
import type { RideFlowState } from "./rideFlow";
import { attachedNotes, notesPatch, rideFacts, setupRows } from "./rideFormModel";

const LABEL = "text-label-2 tracking-[var(--tracking-label)] text-fg-dim uppercase";

/** Writes typed notes into their ride's `session.json` once the ride exists,
 *  a moment after typing stops. The file is the truth; the draft is only
 *  what has not reached it yet. */
function useDraftSaver(flow: RideFlowState): void {
  useEffect(() => {
    const pending = draftsToSave(flow);
    if (pending.length === 0) return;
    const timer = setTimeout(() => {
      void (async () => {
        for (const { key, sessionId, draft } of pending) {
          try {
            const detail = await getSession(sessionId);
            await saveSessionMetadata(sessionId, notesPatch(detail, draft.title, draft.notes));
            dispatchRideFlow({ type: "DRAFT_SAVED", key, title: draft.title, notes: draft.notes });
          } catch {
            // Left unsaved: kept on this device and retried on the next edit.
          }
        }
      })();
    }, 800);
    return () => clearTimeout(timer);
  }, [flow]);
}

function useSheetSide(): SheetSide {
  const [side, setSide] = useState<SheetSide>(() => sheetSideFor(typeof window === "undefined" ? 1024 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setSide(sheetSideFor(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return side;
}

/** "Downloading 64%" and the like for a ride still coming in, else null. */
function rowStatus(flow: RideFlowState, key: string): string | null {
  const row = flow.rows.find((r) => r.name === key);
  if (row === undefined) return null;
  switch (row.status) {
    case "queued":
      return "Waiting to download";
    case "downloading":
      return `Downloading ${row.sizeBytes > 0 ? Math.min(99, Math.floor((row.doneBytes / row.sizeBytes) * 100)) : 0}%`;
    case "importing":
      return "Importing";
    case "failed":
      return `Download failed: ${row.error ?? ""}`;
    default:
      return null;
  }
}

/**
 * The ride form (ride-form mockup, 2026-10-16). It slides up over the
 * bottom half of whatever tab is open as soon as a single ride starts
 * downloading, with the title and notes first: filling those in is the
 * whole routine. "Open the full form" shows the ride's facts, its bike and
 * setup at the start, and the setup changes it took from the bike log.
 * Closing it keeps what was typed; notes save into the ride by themselves.
 */
export default function RideFormSheet() {
  const flow = useRideFlow();
  useDraftSaver(flow);
  const side = useSheetSide();
  const key = flow.open;
  const sessionId = key === null ? null : sessionIdFor(flow, key);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [log, setLog] = useState<BikeLogView | null>(null);
  const [reload, setReload] = useState(0);
  const [picking, setPicking] = useState(false);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [newBike, setNewBike] = useState("");
  const [offerDefault, setOfferDefault] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDetail(null);
    setLog(null);
    setDurationMs(null);
    setPicking(false);
    setOfferDefault(null);
    if (sessionId === null) return;
    let live = true;
    void (async () => {
      try {
        const d = await getSession(sessionId);
        if (!live) return;
        setDetail(d);
        const row = (await listSessions()).find((s) => s.session_id === sessionId);
        if (live) setDurationMs(row?.duration_ms ?? null);
        if (d.bike_id) {
          const l = await getBikeLog(d.bike_id);
          if (live) setLog(l);
        }
      } catch {
        // The ride may still be importing; the form keeps the notes box.
      }
    })();
    return () => {
      live = false;
    };
  }, [sessionId, reload]);

  if (key === null) return null;
  const draft = flow.drafts[key];
  const title = draft?.title ?? detail?.short_comment ?? "";
  const notes = draft?.notes ?? detail?.long_comment ?? "";
  const status = rowStatus(flow, key);
  const expanded = flow.expanded || side === "right";
  const heading = detail && detail.timestamp_utc_ms > 0 ? `${formatDateMs(detail.timestamp_utc_ms)} ride` : "This ride";
  const titleHint = `${detail?.venue_name || "Ride"} · ${detail && detail.timestamp_utc_ms > 0 ? formatDateMs(detail.timestamp_utc_ms) : "today"}`;
  const facts = detail === null ? [] : rideFacts(detail, durationMs, { duration: formatDurationMs, lap: formatLapTimeMs, time: formatTimeMs });
  const setup = detail?.bike_log ? setupRows(detail.bike_log.setup_sheet, log) : [];
  const changes = detail === null ? [] : attachedNotes(detail, log);

  async function choose(bike: Bike): Promise<void> {
    if (sessionId === null) return;
    setError(null);
    try {
      const before = detail?.bike ?? "";
      await attachBikeLog(sessionId, bike.bike_id);
      setPicking(false);
      setOfferDefault(bike.name.trim().toLowerCase() === before.trim().toLowerCase() ? null : bike.name);
      setReload((n) => n + 1);
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    }
  }

  async function startPicking(): Promise<void> {
    setPicking(true);
    try {
      setBikes(await listBikes());
    } catch {
      setBikes([]);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && dispatchRideFlow({ type: "CLOSE" })}>
      <SheetContent
        side={side}
        className={side === "bottom" ? `gap-0 p-0 ${expanded ? "h-[94vh]" : "h-[58vh]"}` : "gap-0 p-0 sm:max-w-md"}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b border-rule">
          <SheetTitle>{heading}</SheetTitle>
          {status !== null && <span className="font-mono text-xs text-hivis">{status}</span>}
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Title</span>
            <Input className="h-12 text-base" value={title} placeholder={titleHint} onChange={(e) => dispatchRideFlow({ type: "DRAFT", key, title: e.target.value, notes })} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Ride notes</span>
            <textarea
              className="min-h-40 w-full rounded-[var(--radius-card)] border border-rule bg-surface p-3 text-base leading-relaxed text-fg"
              value={notes}
              placeholder="How it went, the conditions, how you felt. Type or tap the keyboard mic and talk."
              onChange={(e) => dispatchRideFlow({ type: "DRAFT", key, title, notes: e.target.value })}
            />
            <span className="text-xs text-fg-dim">{sessionId === null ? "Saved into the ride as soon as it finishes downloading." : "Saved into the ride as you type."}</span>
          </label>

          {!expanded ? (
            <Button type="button" className="h-11" onClick={() => dispatchRideFlow({ type: "EXPAND", expanded: true })}>
              Open the full form
            </Button>
          ) : detail === null ? (
            <p className="text-sm text-fg-dim">Laps, bike and setup fill in when the ride finishes downloading.</p>
          ) : (
            <>
              {facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-px border border-rule bg-rule">
                  {facts.map((f) => (
                    <div key={f.label} className="flex flex-col bg-surface px-3 py-2">
                      <dt className={LABEL}>{f.label}</dt>
                      <dd className="font-mono text-base text-fg">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {detail.venue_name !== "" && (
                <div className="flex flex-col gap-1">
                  <span className={LABEL}>Venue</span>
                  <span className="text-base text-fg">{detail.venue_name}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className={LABEL}>Bike</span>
                <div className="flex gap-2">
                  <div className="flex min-h-12 flex-1 items-center border border-rule bg-surface px-3 text-base font-semibold text-fg">{detail.bike || "Not set"}</div>
                  <Button type="button" className="h-12 px-4" onClick={() => void startPicking()}>
                    Change
                  </Button>
                </div>
                {picking && (
                  <div className="flex flex-col gap-px border border-rule bg-rule">
                    {bikes.map((b) => (
                      <button key={b.bike_id} type="button" className="min-h-12 bg-bg px-3 text-left text-base text-fg" onClick={() => void choose(b)}>
                        {b.name || b.bike_id}
                      </button>
                    ))}
                    <div className="flex gap-2 bg-bg p-2">
                      <Input className="h-10 text-base" placeholder="New bike name" value={newBike} onChange={(e) => setNewBike(e.target.value)} />
                      <Button
                        type="button"
                        className="h-10"
                        disabled={newBike.trim() === ""}
                        onClick={() => void bikeForName(newBike).then((b) => { setNewBike(""); return choose(b); })}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                )}
                {offerDefault !== null && (
                  <div className="flex flex-col gap-2 border border-rule p-3">
                    <span className="text-sm text-fg">Make {offerDefault} this logger&apos;s default bike?</span>
                    <span className="text-xs text-fg-dim">Future rides from this logger would start on it. Sent with your next Send to logger.</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" className="h-11" onClick={() => setOfferDefault(null)}>
                        Just this ride
                      </Button>
                      <Button
                        type="button"
                        emphasis="accent"
                        filled
                        className="h-11"
                        onClick={() => {
                          dispatchRideFlow({ type: "LOGGER_BIKE", name: offerDefault });
                          setOfferDefault(null);
                        }}
                      >
                        Make default
                      </Button>
                    </div>
                  </div>
                )}
                {error !== null && <span className="text-sm text-brand-accent">{error}</span>}
              </div>

              {setup.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>Setup at the start</span>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 font-mono text-sm">
                    {setup.map((r) => (
                      <div key={r.label} className="contents">
                        <dt className="text-fg-dim">{r.label}</dt>
                        <dd className="text-fg">
                          {r.value}
                          {r.was !== null && <span className="text-hivis"> (was {r.was})</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {changes.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className={LABEL}>Setup changes this ride took</span>
                  <div className="flex flex-col gap-px border border-rule bg-rule">
                    {changes.map((c) => (
                      <div key={c.entryId} className="flex flex-col gap-0.5 bg-surface px-3 py-2">
                        <span className={`font-mono text-xs ${c.during ? "text-hivis" : "text-fg-dim"}`}>
                          {formatWhen(c.atMs, Date.now())}
                          {c.lap !== null ? ` · during lap ${c.lap}` : c.during ? " · during the ride" : ""}
                        </span>
                        <span className="text-sm text-fg">{c.kind === "sheet" ? `Setup confirmed${c.text ? ` · ${c.text}` : ""}` : c.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

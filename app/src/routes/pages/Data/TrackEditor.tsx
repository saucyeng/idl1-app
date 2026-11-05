import { interpolateTurbo } from "d3";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { SectionHead } from "../../../components/brand/SectionHead";
import { IconBtn } from "../../../components/brand/ToolGroup";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { getTrack, saveTrack, type Gate, type SaveTrackResult, type TrackDetail } from "../../../ipc/catalog";
import { fetchMapTile, fetchSessionFixes, MAP_MAX_ZOOM, previewTrackRuns, type LatLonTrace, type TrackRunsPreview } from "../../../ipc/trackEditor";
import { describeIpcError } from "./errors";
import { formatRescanSessionsLabel } from "./trackDetailFormat";
import {
  formatRunDuration,
  formatSessionTime,
  initialEditorState,
  lapTimingOf,
  saveBlocker,
  toTrackDraft,
  trackEditorReducer,
  type GateTarget,
} from "./trackEditorModel";

/** Props for [[TrackEditor]]. */
export interface TrackEditorProps {
  /** The ride drawn on the map and checked against the gates; `null` to
   *  edit a track on its own reference line. */
  sessionId: string | null;
  /** The track being edited; `null` to create one. */
  trackId: string | null;
  /** Whether the session records `GPS_SpeedKmh`, to colour the line by it. */
  hasSpeed: boolean;
  onClose: () => void;
  /** After a save, the list behind the editor refreshes. */
  onSaved: (result: SaveTrackResult) => void;
  /** Runs `save_track`'s `stale_session_ids` through the Data tab's
   *  maintenance driver, as the track pane's own button does. */
  onRescanSessions: (sessionIds: string[]) => void;
}

/** How many points of the ride the map draws (C2 §5.3's upper budget). */
const TRACE_BUDGET = 8000;
/** Colour steps for the speed-coloured line. */
const SPEED_STEPS = 12;
/** Wait after a gate change before checking the gates against the ride. */
const PREVIEW_DEBOUNCE_MS = 250;
const ATTRIBUTION = "Imagery © Esri, Maxar, Earthstar Geographics";

/** A token's value from the page's own stylesheet, for Leaflet, which
 *  draws on a canvas and cannot read `var(--x)` itself. */
function token(name: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v === "" ? "white" : v;
}

/** A Leaflet grid layer whose tiles come through `fetch_map_tile` (Rust
 *  fetches and caches them; the webview never touches the network). A tile
 *  that cannot be had is left blank. */
function satelliteLayer(): L.GridLayer {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement("img");
      img.alt = "";
      fetchMapTile("esri_world_imagery", coords.z, coords.x, coords.y)
        .then((buf) => {
          const url = URL.createObjectURL(new Blob([buf]));
          img.onload = () => {
            URL.revokeObjectURL(url);
            done(undefined, img);
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            done(undefined, img);
          };
          img.src = url;
        })
        .catch(() => done(undefined, img));
      return img;
    },
  });
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)({ maxNativeZoom: MAP_MAX_ZOOM, maxZoom: MAP_MAX_ZOOM + 2, attribution: ATTRIBUTION });
}

/** The gate's two ends as Leaflet points. */
function gateLatLngs(g: Gate): L.LatLngExpression[] {
  return [
    [g.lat1, g.lon1],
    [g.lat2, g.lon2],
  ];
}

/** Same target, compared by value. */
function sameTarget(a: GateTarget | undefined, b: GateTarget): boolean {
  if (a === undefined || a.kind !== b.kind) return false;
  return a.kind !== "sector" || (b.kind === "sector" && a.index === b.index);
}

/**
 * The track editor (track editor spec §1): a satellite map with the ride's
 * GPS line on it, gates placed by clicking their two ends, a sidebar with
 * the gates, the runs they catch, and the name and venue. Saves through
 * `save_track`. Every decision is `trackEditorModel.ts`'s; this component
 * wires Leaflet and the commands to it. Rendering is not unit-tested.
 */
export function TrackEditor({ sessionId, trackId, hasSpeed, onClose, onSaved, onRescanSessions }: TrackEditorProps) {
  const [base, setBase] = useState<TrackDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(trackId === null);
  const [trace, setTrace] = useState<LatLonTrace | null>(null);
  const [state, dispatch] = useReducer(trackEditorReducer, null, () => initialEditorState(null));
  const [preview, setPreview] = useState<TrackRunsPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveTrackResult | null>(null);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const traceLayer = useRef<L.LayerGroup | null>(null);
  const gateLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  // The track being edited.
  useEffect(() => {
    if (trackId === null) return;
    let cancelled = false;
    getTrack(trackId)
      .then((t) => {
        if (cancelled) return;
        setBase(t);
        dispatch({ type: "LOAD", state: initialEditorState(t) });
        setLoaded(true);
      })
      .catch((e: unknown) => !cancelled && setLoadError(describeIpcError(e).text));
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  // The ride.
  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    fetchSessionFixes({ session_id: sessionId, span: { kind: "session" }, colour: "--chart-1" }, hasSpeed ? "GPS_SpeedKmh" : null, TRACE_BUDGET)
      .then((t) => {
        if (cancelled) return;
        setTrace(t);
        if (t.ts.length > 0) setRange([t.ts[0], t.ts[t.ts.length - 1]]);
      })
      .catch((e: unknown) => !cancelled && setLoadError(describeIpcError(e).text));
    return () => {
      cancelled = true;
    };
  }, [sessionId, hasSpeed]);

  // The map, once.
  useEffect(() => {
    if (mapEl.current === null) return;
    const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true, maxZoom: MAP_MAX_ZOOM + 2, preferCanvas: true });
    map.attributionControl.setPrefix(false);
    satelliteLayer().addTo(map);
    traceLayer.current = L.layerGroup().addTo(map);
    gateLayer.current = L.layerGroup().addTo(map);
    map.setView([0, 0], 2);
    map.on("click", (e: L.LeafletMouseEvent) => dispatch({ type: "MAP_CLICK", at: { lat: e.latlng.lat, lon: e.latlng.lng } }));
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(mapEl.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Esc cancels a placement.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CANCEL_PLACING" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Crosshair while placing.
  useEffect(() => {
    const c = mapRef.current?.getContainer();
    if (c !== undefined) c.style.cursor = state.placing === null ? "" : "crosshair";
  }, [state.placing]);

  // Speed range for the colour scale.
  const speedDomain = useMemo(() => {
    if (trace?.cs == null) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of trace.cs) {
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    return Number.isFinite(lo) && hi > lo ? ([lo, hi] as const) : null;
  }, [trace]);

  // The line: the ride (coloured by speed, dimmed outside the range), or
  // the track's own reference line when there is no ride.
  useEffect(() => {
    const layer = traceLayer.current;
    const map = mapRef.current;
    if (layer === null || map === null) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    if (trace !== null && trace.lons.length > 1) {
      const [r0, r1] = range ?? [-Infinity, Infinity];
      const plain = token("--chart-1");
      const colourAt = (i: number): string => {
        if (speedDomain === null || trace.cs === null || !Number.isFinite(trace.cs[i])) return plain;
        const f = (trace.cs[i] - speedDomain[0]) / (speedDomain[1] - speedDomain[0]);
        return interpolateTurbo(Math.round(f * (SPEED_STEPS - 1)) / (SPEED_STEPS - 1));
      };
      let run: L.LatLngExpression[] = [[trace.lats[0], trace.lons[0]]];
      let key = "";
      const flush = (k: string) => {
        if (run.length < 2) return;
        const [colour, inside] = k.split("|");
        L.polyline(run, { color: colour, weight: inside === "1" ? 4 : 2, opacity: inside === "1" ? 0.95 : 0.25, interactive: false }).addTo(layer);
      };
      for (let i = 0; i + 1 < trace.lons.length; i++) {
        const inside = trace.ts[i] >= r0 && trace.ts[i + 1] <= r1;
        const k = `${colourAt(i)}|${inside ? "1" : "0"}`;
        if (k !== key && key !== "") {
          flush(key);
          run = [run[run.length - 1]];
        }
        key = k;
        run.push([trace.lats[i + 1], trace.lons[i + 1]]);
        if (inside) bounds.push([trace.lats[i + 1], trace.lons[i + 1]]);
      }
      flush(key);
    } else if (base !== null && base.reference_polyline.length > 1) {
      const pts: L.LatLngExpression[] = base.reference_polyline.map((f) => [f.lat, f.lon]);
      L.polyline(pts, { color: token("--chart-6"), weight: 4, interactive: false }).addTo(layer);
      bounds.push(...pts);
    }
    if (!fitted.current && bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24] });
      fitted.current = true;
    }
  }, [trace, base, range, speedDomain]);

  // The gates, and the first end of one being placed.
  useEffect(() => {
    const layer = gateLayer.current;
    const map = mapRef.current;
    if (layer === null || map === null) return;
    layer.clearLayers();
    const draw = (g: Gate, colour: string, label: string) => {
      L.polyline(gateLatLngs(g), { color: colour, weight: 5, interactive: false })
        .bindTooltip(label, { permanent: true, direction: "top", className: "font-mono" })
        .addTo(layer);
    };
    if (state.start !== null) draw(state.start, token("--good"), state.finish === null ? "Start/finish" : "Start");
    if (state.finish !== null) draw(state.finish, token("--accent"), "Finish");
    state.sectors.forEach((s) => draw(s.gate, token("--hivis"), s.name));
    if (state.placing?.first != null) {
      L.circleMarker([state.placing.first.lat, state.placing.first.lon], { radius: 6, color: token("--hivis"), weight: 2, interactive: false }).addTo(layer);
    }
    if (!fitted.current && trace === null && state.start !== null) {
      map.fitBounds(L.latLngBounds(gateLatLngs(state.start)), { padding: [80, 80], maxZoom: 17 });
      fitted.current = true;
    }
  }, [state.start, state.finish, state.sectors, state.placing, trace]);

  // What the gates catch on the ride.
  const timing = lapTimingOf(state);
  useEffect(() => {
    if (sessionId === null || state.placing !== null) return;
    let cancelled = false;
    setPreview(null);
    const id = setTimeout(() => {
      previewTrackRuns(sessionId, timing, state.sectors)
        .then((p) => {
          if (cancelled) return;
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e: unknown) => !cancelled && setPreviewError(describeIpcError(e).text));
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // `timing` is derived from start/finish, listed instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, state.start, state.finish, state.sectors, state.placing]);

  const previewPending = sessionId !== null && preview === null && previewError === null && timing !== null;
  const blocker = previewPending ? "Checking the gates against the ride…" : saveBlocker(state, sessionId === null || timing === null ? null : (preview?.runs.length ?? null));

  const handleSave = () => {
    setSaving(true);
    setSaveError(null);
    saveTrack(toTrackDraft(state, base, sessionId === null ? null : (preview?.reference_polyline ?? null)))
      .then((result) => {
        setSaved(result);
        setBase(result.track);
        onSaved(result);
      })
      .catch((e: unknown) => setSaveError(describeIpcError(e).text))
      .finally(() => setSaving(false));
  };

  const placingHint =
    state.placing === null ? null : state.placing.first === null ? "Click one end of the gate, across the trail." : "Click the other end. Esc cancels.";

  const gateRow = (label: string, target: GateTarget, placed: boolean) => (
    <div key={label} className="flex items-center justify-between gap-2">
      <span className="font-mono text-sm text-fg">{label}</span>
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          emphasis={sameTarget(state.placing?.target, target) ? "good" : "normal"}
          onClick={() => dispatch({ type: "PLACE", target })}
        >
          {placed ? "Move" : "Place"}
        </Button>
        {placed && (
          <Button type="button" size="sm" emphasis="accent" onClick={() => dispatch({ type: "DELETE", target })}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );

  const tMin = trace !== null && trace.ts.length > 0 ? trace.ts[0] : 0;
  const tMax = trace !== null && trace.ts.length > 0 ? trace.ts[trace.ts.length - 1] : 0;

  return (
    <div className="flex h-full min-h-0" role="region" aria-label="Track editor">
      <div className="relative min-w-0 flex-1">
        <div ref={mapEl} className="absolute inset-0" />
        {placingHint !== null && (
          <div className="pointer-events-none absolute top-2 left-1/2 z-[1000] -translate-x-1/2 rounded-[var(--radius-structural)] bg-surface px-3 py-1.5 font-mono text-sm text-fg">
            {placingHint}
          </div>
        )}
      </div>

      <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-rule p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-mono text-sm font-medium text-fg">{trackId === null ? "New track" : "Edit track"}</h2>
          <IconBtn icon={XIcon} label="Close" onClick={onClose} />
        </div>

        {loadError !== null && (
          <p role="alert" className="font-mono text-sm text-brand-accent">
            {loadError}
          </p>
        )}

        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Name
          <Input type="text" value={state.name} onChange={(e) => dispatch({ type: "SET_NAME", name: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs text-fg-dim">
          Venue
          <Input type="text" value={state.venue} onChange={(e) => dispatch({ type: "SET_VENUE", venue: e.target.value })} />
        </label>

        <div className="flex flex-col gap-2">
          <SectionHead>Gates</SectionHead>
          {gateRow(state.finish === null ? "Start (or start/finish)" : "Start", { kind: "start" }, state.start !== null)}
          {gateRow("Finish", { kind: "finish" }, state.finish !== null)}
          {state.sectors.map((s, i) => gateRow(s.name, { kind: "sector", index: i }, true))}
          <Button
            type="button"
            size="sm"
            className="self-start"
            emphasis={state.placing?.target.kind === "new-sector" ? "good" : "normal"}
            onClick={() => dispatch({ type: "PLACE", target: { kind: "new-sector" } })}
          >
            Add sector
          </Button>
          <p className="font-mono text-xs text-fg-dim">
            {timing === null ? "No timing yet." : timing.kind === "point_to_point" ? "Point to point: start gate to finish gate." : "Loop: one gate is start and finish."}
          </p>
        </div>

        {sessionId !== null && trace !== null && trace.ts.length > 1 && range !== null && (
          <div className="flex flex-col gap-1">
            <SectionHead>Show</SectionHead>
            <p className="font-mono text-xs text-fg-dim">
              {formatSessionTime(range[0])} – {formatSessionTime(range[1])} of the ride
            </p>
            <input
              type="range"
              aria-label="From"
              min={tMin}
              max={tMax}
              step={1}
              value={range[0]}
              onChange={(e) => setRange([Math.min(Number(e.target.value), range[1] - 1), range[1]])}
            />
            <input
              type="range"
              aria-label="To"
              min={tMin}
              max={tMax}
              step={1}
              value={range[1]}
              onChange={(e) => setRange([range[0], Math.max(Number(e.target.value), range[0] + 1)])}
            />
            <Button type="button" size="sm" className="self-start" onClick={() => setRange([tMin, tMax])}>
              Whole ride
            </Button>
          </div>
        )}

        {sessionId !== null && (
          <div className="flex flex-col gap-1">
            <SectionHead>Runs on this ride</SectionHead>
            {timing === null && <p className="font-mono text-xs text-fg-dim">Place a start gate.</p>}
            {previewPending && <p className="font-mono text-xs text-fg-dim">Checking…</p>}
            {previewError !== null && (
              <p role="alert" className="font-mono text-xs text-brand-accent">
                {previewError}
              </p>
            )}
            {preview !== null && timing !== null && preview.runs.length === 0 && <p className="font-mono text-xs text-brand-accent">No run: a gate the line never crosses?</p>}
            {preview?.runs.map((r, i) => (
              <button
                key={i}
                type="button"
                className="flex justify-between rounded-[var(--radius-structural)] px-1 py-0.5 text-left font-mono text-sm text-fg hover:bg-surface-2"
                onClick={() => setRange([r.start_secs, r.end_secs])}
                title="Show this run on the map"
              >
                <span>
                  {i + 1}. at {formatSessionTime(r.start_secs)}
                </span>
                <span>{formatRunDuration(r.duration_secs)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2">
          {saved !== null ? (
            <>
              <p className="font-mono text-sm text-fg">Saved.</p>
              {saved.stale_session_ids.length > 0 && (
                <Button type="button" size="sm" className="self-start" onClick={() => onRescanSessions(saved.stale_session_ids)}>
                  {formatRescanSessionsLabel(saved.stale_session_ids.length)}
                </Button>
              )}
              <Button type="button" size="sm" className="self-start" onClick={onClose}>
                Done
              </Button>
            </>
          ) : (
            <>
              {blocker !== null && <p className="font-mono text-xs text-fg-dim">{blocker}</p>}
              <div className="flex gap-2">
                <Button type="button" emphasis="good" filled size="sm" disabled={!loaded || blocker !== null || saving} onClick={handleSave}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" size="sm" onClick={onClose} disabled={saving}>
                  Cancel
                </Button>
              </div>
              {saveError !== null && (
                <p role="alert" className="font-mono text-sm text-brand-accent">
                  Couldn't save: {saveError}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { SelectField, TextField } from "@/components/ui/select-field";
import { bikeForName, listBikes, type Bike } from "@/ipc/bikelog";
import {
  DEFAULT_BUMPS,
  getBikePhoto,
  getSimSetup,
  runDrivetrainSim,
  saveSimSetup,
  setBikePhoto,
  simKinematics,
  type BumpTrain,
  type KinematicsView,
  type P2,
  type PhotoFrame,
  type SetupPx,
  type SimSetupView,
} from "@/ipc/simulate";

import { KinematicsPanel } from "./KinematicsPanel";
import { deleteVertex, insertVertex, movePoint, playbackFrame, runFrame } from "./model";
import { PlaybackPanel, type LabelledRun } from "./PlaybackPanel";
import { SetupPanel } from "./SetupPanel";
import { Stage } from "./Stage";

type Mode = "setup" | "kinematics" | "playback";

/** Pixels per metre of the blank canvas a bike without a photo is drawn on. */
const BLANK_PPM = 1000;
const KIN_SAMPLES = 17;
const PREF_KEY = "idl1.simulate.bike";

function blankFrame(wheelbase_m: number): PhotoFrame {
  return { rear_axle_px: [450, 800], front_axle_px: [450 + wheelbase_m * BLANK_PPM, 800], wheelbase_m };
}

function readPref(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

function writePref(v: string): void {
  try {
    localStorage.setItem(PREF_KEY, v);
  } catch {
    // a per-viewer convenience only
  }
}

function message(e: unknown): string {
  if (e !== null && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * The Simulate tab (drivetrain sim spec §7): the bike's photo with its
 * linkage and drivetrain placed on it, the chain's growth through travel,
 * and a played-back run of the chain loop over bumps.
 */
export default function SimulatePage() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [bikeId, setBikeId] = useState<string | null>(null);
  const [newBike, setNewBike] = useState("");
  const [view, setView] = useState<SimSetupView | null>(null);
  const [setup, setSetup] = useState<SetupPx | null>(null);
  const [axles, setAxles] = useState<Record<string, P2>>({});
  const [wheelbaseMm, setWheelbaseMm] = useState(1250);
  const [photo, setPhoto] = useState<{ url: string; w: number; h: number } | null>(null);
  const [blank, setBlank] = useState(false);
  const [mode, setMode] = useState<Mode>("setup");
  const [placing, setPlacing] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ kind: "roller" | "surface"; index: number } | null>(null);
  const [kin, setKin] = useState<KinematicsView | null>(null);
  const [kinError, setKinError] = useState<string | null>(null);
  const [gear, setGear] = useState(5);
  const [travelIndex, setTravelIndex] = useState(0);
  const [bumps, setBumps] = useState<BumpTrain>(DEFAULT_BUMPS);
  const [runs, setRuns] = useState<LabelledRun[]>([]);
  const [shown, setShown] = useState(0);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.25);
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // --- bikes ---
  const refreshBikes = useCallback(async () => {
    try {
      const list = await listBikes();
      setBikes(list);
      setBikeId((cur) => cur ?? (list.find((b) => b.bike_id === readPref())?.bike_id ?? list[0]?.bike_id ?? null));
    } catch (e) {
      setStatus(message(e));
    }
  }, []);
  useEffect(() => {
    void refreshBikes();
  }, [refreshBikes]);

  // --- load a bike's setup and photo ---
  const loadPhoto = useCallback(async (id: string, file: string) => {
    const bytes = await getBikePhoto(id, file);
    const type = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("the photo didn't load"));
      img.src = url;
    });
    setPhoto((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { url, w: img.naturalWidth, h: img.naturalHeight };
    });
  }, []);

  const loadBike = useCallback(
    async (id: string) => {
      setStatus(null);
      setKin(null);
      setRuns([]);
      setSetup(null);
      setAxles({});
      setPlaying(false);
      setBlank(false);
      setPhoto(null);
      try {
        const v = await getSimSetup(id, null);
        setView(v);
        setWheelbaseMm(Math.round(v.wheelbase_m * 1000));
        if (v.photo_file !== null) {
          await loadPhoto(id, v.photo_file);
        }
        if (v.setup !== null) {
          setSetup(v.setup);
        } else if (v.photo_file === null && v.has_linkage) {
          // a linkage from the photo tool but no photo here yet: draw it on a blank canvas
          const b = await getSimSetup(id, blankFrame(v.wheelbase_m));
          setBlank(true);
          setSetup(b.setup);
        }
        setDirty(false);
      } catch (e) {
        setStatus(message(e));
      }
    },
    [loadPhoto]
  );
  useEffect(() => {
    if (bikeId !== null) {
      writePref(bikeId);
      void loadBike(bikeId);
    }
  }, [bikeId, loadBike]);

  // --- kinematics on settle (newest wins) ---
  const kinSeq = useRef(0);
  const kinTimer = useRef<number | null>(null);
  const setupRef = useRef<SetupPx | null>(null);
  setupRef.current = setup;
  const requestKin = useCallback(
    (delayMs = 250) => {
      if (kinTimer.current !== null) window.clearTimeout(kinTimer.current);
      kinTimer.current = window.setTimeout(async () => {
        const s = setupRef.current;
        if (s === null) return;
        const seq = ++kinSeq.current;
        try {
          const k = await simKinematics(s, gear, KIN_SAMPLES);
          if (seq !== kinSeq.current) return;
          setKin(k);
          setKinError(null);
        } catch (e) {
          if (seq !== kinSeq.current) return;
          setKinError(message(e));
        }
      }, delayMs);
    },
    [gear]
  );
  useEffect(() => {
    if (setup !== null) requestKin(0);
    // a new bike's setup, or a new gear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gear, setup === null]);

  const edit = (next: SetupPx) => {
    setSetup(next);
    setDirty(true);
    requestKin();
  };

  // --- photo ---
  async function addPhoto(): Promise<void> {
    if (bikeId === null) return;
    try {
      const path = await open({ multiple: false, filters: [{ name: "Photo", extensions: ["jpg", "jpeg", "png", "webp"] }] });
      if (path === null) return;
      const file = await setBikePhoto(bikeId, path);
      await loadPhoto(bikeId, file);
      setView((v) => (v ? { ...v, photo_file: file } : v));
      // a new photo needs its axles clicked; the metres stay
      setSetup(null);
      setBlank(false);
      setAxles({});
      setPlacing("rear_axle");
      setMode("setup");
    } catch (e) {
      setStatus(message(e));
    }
  }

  async function startBlank(): Promise<void> {
    if (bikeId === null) return;
    try {
      const b = await getSimSetup(bikeId, blankFrame(wheelbaseMm / 1000));
      setBlank(true);
      setSetup(b.setup);
      setDirty(true);
    } catch (e) {
      setStatus(message(e));
    }
  }

  async function confirmAxles(): Promise<void> {
    if (bikeId === null || !axles.rear_axle || !axles.front_axle) return;
    try {
      const frame: PhotoFrame = { rear_axle_px: axles.rear_axle, front_axle_px: axles.front_axle, wheelbase_m: wheelbaseMm / 1000 };
      const v = await getSimSetup(bikeId, frame);
      const s = v.setup;
      if (s === null) return;
      setSetup({ ...s, photo_file: view?.photo_file ?? null });
      setPlacing(null);
      setDirty(true);
    } catch (e) {
      setStatus(message(e));
    }
  }

  async function save(): Promise<void> {
    if (bikeId === null || setup === null) return;
    try {
      const v = await saveSimSetup(bikeId, { ...setup, photo_file: blank ? null : (view?.photo_file ?? null) });
      setView(v);
      setDirty(false);
      setStatus("Saved to the bike file.");
    } catch (e) {
      setStatus(message(e));
    }
  }

  // --- run ---
  async function run(): Promise<void> {
    if (setup === null) return;
    setRunning(true);
    setRunError(null);
    setProgress(0);
    try {
      const r = await runDrivetrainSim(setup, gear, bumps, (p) => setProgress(p.total ? p.done / p.total : 0));
      const teeth = setup.params.cassette_teeth[Math.min(gear, setup.params.cassette_teeth.length - 1)];
      const fitted = setup.rollers.filter((x) => x.enabled).map((x) => x.name);
      const label = `${runs.length + 1}: ${teeth}T${fitted.length ? `, ${fitted.join(", ")}` : ", no rollers"}`;
      setRuns((rs) => {
        const next = [...rs, { label, run: r }].slice(-4);
        setShown(next.length - 1);
        return next;
      });
      setFrame(0);
      setPlaying(true);
    } catch (e) {
      setRunError(message(e));
    } finally {
      setRunning(false);
    }
  }

  // --- playback clock ---
  const shownRun = runs[shown]?.run ?? null;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    if (!playing || shownRun === null || mode !== "playback") return;
    const start = performance.now();
    const startFrame = frameRef.current;
    let id = 0;
    const tick = (now: number) => {
      setFrame(playbackFrame(shownRun, startFrame, (now - start) / 1000, speed));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, shownRun, speed, mode]);

  // --- what the stage shows ---
  const size = photo !== null ? { w: photo.w, h: photo.h } : { w: 450 + (setup?.wheelbase_m ?? wheelbaseMm / 1000) * BLANK_PPM + 350, h: 1200 };
  const frameOf: PhotoFrame | null =
    setup !== null && setup.points.rear_axle && setup.points.front_axle ? { rear_axle_px: setup.points.rear_axle, front_axle_px: setup.points.front_axle, wheelbase_m: setup.wheelbase_m } : null;
  const axleStep = setup === null && (photo !== null || blank);
  const stageSetup: SetupPx | null = setup ?? (axleStep && view ? { photo_file: null, wheelbase_m: wheelbaseMm / 1000, rear_travel_m: view.rear_travel_m, points: axles, rollers: [], surfaces: [], params: view.params } : null);
  const snapshot = kin?.snapshots[mode === "kinematics" ? Math.min(travelIndex, (kin?.snapshots.length ?? 1) - 1) : 0] ?? null;
  const rf = mode === "playback" && shownRun !== null ? runFrame(shownRun, frame) : null;
  // fit the view to the rear of the bike (everything but the front axle), with room around it
  const placed = setup?.points ?? axles;
  const fitPts = Object.entries(placed)
    .filter(([k]) => setup === null || k !== "front_axle")
    .map(([, p]) => p);
  const fit =
    fitPts.length >= 2
      ? (() => {
          const xs = fitPts.map((p) => p[0]);
          const ys = fitPts.map((p) => p[1]);
          const pad = 0.25 * Math.max(...xs) - 0.25 * Math.min(...xs) + 40;
          return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
        })()
      : null;
  const fitKey = `${bikeId ?? ""}|${photo?.url ?? (blank ? "blank" : "")}|${setup === null ? "axles" : "setup"}`;
  const gears = (setup?.params.cassette_teeth ?? view?.params.cassette_teeth ?? []).map((t, i) => ({ value: String(i), label: `${i + 1} · ${t}T` }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--rule)] px-3 py-2">
        <SelectField label="Bike" value={bikeId ?? undefined} options={bikes.map((b) => ({ value: b.bike_id, label: b.name }))} onChange={(v) => v && setBikeId(v)} className="w-44" />
        {bikes.length === 0 && (
          <>
            <TextField label="New bike" value={newBike} placeholder="GT Force" onChange={setNewBike} />
            <Button size="sm" disabled={newBike.trim() === ""} onClick={async () => { const b = await bikeForName(newBike.trim()); await refreshBikes(); setBikeId(b.bike_id); }}>
              Add
            </Button>
          </>
        )}
        <div className="flex gap-1" role="tablist" aria-label="Simulate view">
          {(["setup", "kinematics", "playback"] as const).map((m) => (
            <Button key={m} size="sm" role="tab" aria-selected={mode === m} filled={mode === m} emphasis={mode === m ? "good" : "normal"} disabled={m !== "setup" && setup === null} onClick={() => setMode(m)}>
              {m === "setup" ? "Setup" : m === "kinematics" ? "Kinematics" : "Playback"}
            </Button>
          ))}
        </div>
        {mode !== "setup" && gears.length > 0 && <SelectField label="Gear" value={String(Math.min(gear, gears.length - 1))} options={gears} onChange={(v) => setGear(Number(v ?? 0))} className="w-28" />}
        <div className="ml-auto flex items-end gap-2">
          <Button size="sm" onClick={() => void addPhoto()} disabled={bikeId === null}>
            {photo ? "Replace photo…" : "Add photo…"}
          </Button>
          <Button size="sm" filled emphasis="good" disabled={setup === null || !dirty} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
      {(status !== null || kinError !== null) && (
        <div className="border-b border-[var(--rule)] px-3 py-1 text-xs">
          {status !== null && <span className="mr-4 text-[var(--fg-dim)]">{status}</span>}
          {kinError !== null && setup !== null && <span className="text-[var(--accent)]">{kinError}</span>}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative min-h-[320px] flex-1">
          {stageSetup !== null || photo !== null ? (
            <Stage
              size={size}
              photoUrl={photo?.url ?? null}
              mode={mode}
              setup={stageSetup}
              frame={frameOf ?? kin?.frame ?? null}
              snapshot={snapshot}
              runFrame={rf}
              placing={placing}
              selected={selected}
              onPlace={(key, at) => {
                if (setup === null) {
                  const next = { ...axles, [key]: at };
                  setAxles(next);
                  setPlacing(key === "rear_axle" && !next.front_axle ? "front_axle" : null);
                } else {
                  edit(movePoint(setup, key, at));
                  setPlacing(null);
                }
              }}
              onMovePoint={(key, at) => {
                if (setup === null) setAxles((a) => ({ ...a, [key]: at }));
                else {
                  setSetup(movePoint(setup, key, at));
                  setDirty(true);
                }
              }}
              onMoveRoller={(i, at) => setup && (setSetup({ ...setup, rollers: setup.rollers.map((r, k) => (k === i ? { ...r, centre_px: at } : r)) }), setDirty(true))}
              onMoveSurfaceVertex={(i, v, at) =>
                setup && (setSetup({ ...setup, surfaces: setup.surfaces.map((s, k) => (k === i ? { ...s, polyline_px: s.polyline_px.map((p, j) => (j === v ? at : p)) } : s)) }), setDirty(true))
              }
              onInsertSurfaceVertex={(i, seg, at) =>
                setup && (setSetup({ ...setup, surfaces: setup.surfaces.map((sf, k) => (k === i ? { ...sf, polyline_px: insertVertex(sf.polyline_px, seg, at) } : sf)) }), setDirty(true))
              }
              onDeleteSurfaceVertex={(i, v) =>
                setup && (setSetup({ ...setup, surfaces: setup.surfaces.map((sf, k) => (k === i ? { ...sf, polyline_px: deleteVertex(sf.polyline_px, v) } : sf)) }), setDirty(true))
              }
              onDragEnd={() => requestKin()}
              fit={fit}
              fitKey={fitKey}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--fg-dim)]">
              <p>Add a side-on photo of the bike (drive side) to place its linkage and drivetrain on it,</p>
              <Button filled emphasis="good" disabled={bikeId === null} onClick={() => void addPhoto()}>
                Add photo…
              </Button>
              <p>or start on a blank canvas with a typical Horst-link layout.</p>
              <NumberField label="Wheelbase" unit="mm" value={wheelbaseMm} step={1} min={900} max={1500} onChange={(v) => setWheelbaseMm(v ?? wheelbaseMm)} />
              <Button disabled={bikeId === null} onClick={() => void startBlank()}>
                Start on a blank canvas
              </Button>
            </div>
          )}
          {axleStep && setup === null && (
            <div className="absolute left-3 top-3 flex max-w-sm flex-col gap-2 rounded-[var(--radius)] border border-[var(--rule)] bg-[var(--surface)] p-3 text-sm">
              <p>{!axles.rear_axle ? "Click the rear axle's centre." : !axles.front_axle ? "Now click the front axle's centre." : "Give the wheelbase, then place the rest."}</p>
              <NumberField label="Wheelbase" unit="mm" value={wheelbaseMm} step={1} min={900} max={1500} onChange={(v) => setWheelbaseMm(v ?? wheelbaseMm)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setAxles({}); setPlacing("rear_axle"); }}>
                  Start over
                </Button>
                <Button size="sm" filled emphasis="good" disabled={!axles.rear_axle || !axles.front_axle} onClick={() => void confirmAxles()}>
                  Place the rest
                </Button>
              </div>
              {placing === null && !axles.rear_axle && (
                <Button size="sm" onClick={() => setPlacing("rear_axle")}>
                  Click the axles
                </Button>
              )}
            </div>
          )}
          {mode === "kinematics" && kin !== null && kin.snapshots.length > 1 && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-[var(--radius)] bg-[var(--surface)]/90 px-3 py-2 text-xs">
              <span className="w-28 tabular-nums">Travel {kin.snapshots[Math.min(travelIndex, kin.snapshots.length - 1)].travel_mm.toFixed(0)} mm</span>
              <input type="range" min={0} max={kin.snapshots.length - 1} value={Math.min(travelIndex, kin.snapshots.length - 1)} onChange={(e) => setTravelIndex(Number(e.target.value))} className="flex-1 accent-[var(--good)]" aria-label="Rear travel" />
              <span className="w-24 tabular-nums">Cage {kin.snapshots[Math.min(travelIndex, kin.snapshots.length - 1)].cage_deg.toFixed(1)}°</span>
            </div>
          )}
        </div>

        <aside className="max-h-[50vh] w-full overflow-y-auto border-t border-[var(--rule)] p-3 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0">
          {mode === "setup" && setup !== null && <SetupPanel setup={setup} placing={placing} onPlacing={setPlacing} onChange={edit} selected={selected} onSelect={setSelected} />}
          {mode === "setup" && setup === null && <p className="text-sm text-[var(--fg-dim)]">{bikeId === null ? "Pick or add a bike." : "Set the photo's scale first: click both axles."}</p>}
          {mode === "kinematics" && <KinematicsPanel kin={kin} gear={gear} travelIndex={travelIndex} surfaceNames={setup?.surfaces.map((s) => s.name) ?? []} />}
          {mode === "playback" && (
            <PlaybackPanel
              bumps={bumps}
              onBumps={setBumps}
              running={running}
              progress={progress}
              onRun={() => void run()}
              runs={runs}
              shown={shown}
              onShown={(i) => { setShown(i); setFrame(0); }}
              frame={frame}
              playing={playing}
              speed={speed}
              onPlay={setPlaying}
              onSpeed={setSpeed}
              onFrame={(k) => { setPlaying(false); setFrame(k); }}
              error={runError}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

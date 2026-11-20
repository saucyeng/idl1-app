import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";

import { toM, toPx, type P2, type PhotoFrame, type SetupPx, type Snapshot } from "@/ipc/simulate";

import { CAGE_LINKS, groupColour, hitPoint, hitSegment, LINKS, POINTS, polyPoints, type RunFrame } from "./model";

/** What a drag is moving. */
type DragTarget = { kind: "point"; key: string } | { kind: "roller"; index: number } | { kind: "surface"; index: number; vertex: number } | { kind: "pan"; from: P2; view: View };

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the kinematics view draws over the bike. */
export interface Overlays {
  /** The rear axle's path through travel. */
  axlePath: boolean;
  /** The seatstay's instant centre's path through travel. */
  icPath: boolean;
  /** The squat line and the load transfer line at this travel. */
  squat: boolean;
}

/** Props for {@link Stage}. */
export interface StageProps {
  /** Photo size in pixels (the drawing's user units). */
  size: { w: number; h: number };
  /** Object URL of the photo, or null for a blank canvas. */
  photoUrl: string | null;
  /** What the stage shows. */
  mode: "setup" | "kinematics" | "playback";
  /** The setup being edited (pixels). */
  setup: SetupPx | null;
  /** The open bike's parameters: its `geometry.*` values draw stack, reach and the head angle in setup. */
  geometry?: Record<string, unknown>;
  /** The photo's frame, to draw metres on it. */
  frame: PhotoFrame | null;
  /** The bike drawn at one travel (kinematics, and the chain under the setup). */
  snapshot: Snapshot | null;
  /** The run's frame being played. */
  runFrame: RunFrame | null;
  /** Kinematics overlays, and every travel sample's snapshot for the paths. */
  overlays: Overlays;
  snapshots: Snapshot[];
  /** Centre of mass height above the ground, m (the load transfer line). */
  cogHeightM: number;
  /** The point the next click places, or null. */
  placing: string | null;
  /** The selected roller or surface, for highlighting. */
  selected: { kind: "roller" | "surface"; index: number } | null;
  onPlace: (key: string, at: P2) => void;
  onMovePoint: (key: string, at: P2) => void;
  onMoveRoller: (index: number, at: P2) => void;
  onMoveSurfaceVertex: (index: number, vertex: number, at: P2) => void;
  /** A click on a surface's line: insert a vertex after `segment` at `at` (it is then dragged). */
  onInsertSurfaceVertex: (index: number, segment: number, at: P2) => void;
  /** A right-click on a surface's vertex: remove it. */
  onDeleteSurfaceVertex: (index: number, vertex: number) => void;
  /** A drag ended: the moment to recompute. */
  onDragEnd: () => void;
  /** Region to fit the view to (photo pixels); the view refits when `fitKey` changes. */
  fit: { x: number; y: number; w: number; h: number } | null;
  /** Changes when a new bike or photo loads. */
  fitKey: string;
}

/**
 * The bike, side-on, over its photo (drivetrain sim spec §7). In setup mode
 * the points, rollers and surfaces drag; in kinematics and playback the
 * bike is drawn from metres the engine computed, mapped onto the photo.
 * Nothing here waits on IPC: drags update local state, and the page asks
 * for new kinematics only when a drag ends.
 */
export function Stage(props: StageProps) {
  const { size, photoUrl, mode, setup, frame, snapshot, runFrame, placing, selected } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: size.w, h: size.h });
  const drag = useRef<DragTarget | null>(null);

  const { fit, fitKey } = props;
  useEffect(() => {
    setView(fit ?? { x: 0, y: 0, w: size.w, h: size.h });
    // refit for a new bike or photo, not for every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.w, size.h, fit === null]);

  const toUser = useCallback(
    (clientX: number, clientY: number): P2 => {
      const svg = svgRef.current;
      if (svg === null) return [0, 0];
      const r = svg.getBoundingClientRect();
      // preserveAspectRatio meet: the view is scaled uniformly and centred
      const s = Math.min(r.width / view.w, r.height / view.h);
      const ox = (r.width - view.w * s) / 2;
      const oy = (r.height - view.h * s) / 2;
      return [view.x + (clientX - r.left - ox) / s, view.y + (clientY - r.top - oy) / s];
    },
    [view]
  );

  // the stage's size on screen, re-measured whenever it changes (a hidden tab measures 0)
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);
  const pxPerUser = box.w > 0 && box.h > 0 ? Math.min(box.w / view.w, box.h / view.h) : 1;
  // handles and strokes keep their screen size as the view zooms
  const u = 1 / pxPerUser;

  const m2px = useCallback((m: P2): P2 => (frame === null ? m : toPx(frame, m)), [frame]);

  function onWheel(e: ReactWheelEvent<SVGSVGElement>): void {
    const at = toUser(e.clientX, e.clientY);
    const k = Math.exp(e.deltaY * 0.0015);
    setView((v) => {
      const w = Math.min(size.w * 4, Math.max(40, v.w * k));
      const h = (w / v.w) * v.h;
      return { x: at[0] - ((at[0] - v.x) * w) / v.w, y: at[1] - ((at[1] - v.y) * h) / v.h, w, h };
    });
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>): void {
    const at = toUser(e.clientX, e.clientY);
    if (e.button === 2 && mode === "setup" && setup !== null) {
      // right-click a surface's vertex to remove it; anywhere else pans
      const grab = 10 * u;
      for (let si = 0; si < setup.surfaces.length; si++) {
        const vi = setup.surfaces[si].polyline_px.findIndex((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) <= grab);
        if (vi >= 0) {
          props.onDeleteSurfaceVertex(si, vi);
          props.onDragEnd();
          return;
        }
      }
    }
    if (e.button === 2 || e.button === 1 || e.shiftKey || mode !== "setup" || setup === null) {
      drag.current = { kind: "pan", from: [e.clientX, e.clientY], view };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const grab = 10 * u;
    if (placing !== null) {
      props.onPlace(placing, at);
      drag.current = { kind: "point", key: placing };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    const key = hitPoint(setup.points, at, grab);
    if (key !== null) {
      drag.current = { kind: "point", key };
    } else {
      const ri = setup.rollers.findIndex((r) => Math.hypot(r.centre_px[0] - at[0], r.centre_px[1] - at[1]) <= grab);
      if (ri >= 0) {
        drag.current = { kind: "roller", index: ri };
      } else {
        let found: DragTarget | null = null;
        setup.surfaces.forEach((s, si) =>
          s.polyline_px.forEach((p, vi) => {
            if (found === null && Math.hypot(p[0] - at[0], p[1] - at[1]) <= grab) found = { kind: "surface", index: si, vertex: vi };
          })
        );
        if (found === null) {
          // a click on a surface's line puts a vertex there, and drags it
          for (let si = 0; si < setup.surfaces.length && found === null; si++) {
            const hit = hitSegment(setup.surfaces[si].polyline_px, at, grab);
            if (hit !== null) {
              props.onInsertSurfaceVertex(si, hit.segment, hit.point);
              found = { kind: "surface", index: si, vertex: hit.segment + 1 };
            }
          }
        }
        drag.current = found ?? { kind: "pan", from: [e.clientX, e.clientY], view };
      }
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>): void {
    const d = drag.current;
    if (d === null) return;
    if (d.kind === "pan") {
      const r = svgRef.current?.getBoundingClientRect();
      if (r === undefined) return;
      const s = Math.min(r.width / d.view.w, r.height / d.view.h);
      setView({ ...d.view, x: d.view.x - (e.clientX - d.from[0]) / s, y: d.view.y - (e.clientY - d.from[1]) / s });
      return;
    }
    const at = toUser(e.clientX, e.clientY);
    if (d.kind === "point") props.onMovePoint(d.key, at);
    else if (d.kind === "roller") props.onMoveRoller(d.index, at);
    else props.onMoveSurfaceVertex(d.index, d.vertex, at);
  }

  function onPointerUp(): void {
    const d = drag.current;
    drag.current = null;
    if (d !== null && d.kind !== "pan") props.onDragEnd();
  }

  const stroke = (w: number) => w * u;

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none bg-[var(--surface-2)]"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: placing !== null ? "crosshair" : "default" }}
    >
      {photoUrl !== null ? (
        <image href={photoUrl} x={0} y={0} width={size.w} height={size.h} opacity={mode === "setup" ? 0.9 : 0.55} />
      ) : (
        <rect x={0} y={0} width={size.w} height={size.h} fill="var(--surface-2)" />
      )}

      {mode === "setup" && setup !== null && frame !== null && props.geometry !== undefined && <GeometryLayer setup={setup} frame={frame} params={props.geometry} m2px={m2px} stroke={stroke} />}
      {mode === "setup" && setup !== null && <SetupLayer setup={setup} snapshot={snapshot} m2px={m2px} u={u} stroke={stroke} selected={selected} labels={pxPerUser >= 0.55} placing={placing} />}
      {mode === "kinematics" && snapshot !== null && <SnapshotLayer snapshot={snapshot} m2px={m2px} stroke={stroke} />}
      {mode === "kinematics" && snapshot !== null && <OverlayLayer snapshot={snapshot} snapshots={props.snapshots} overlays={props.overlays} cogHeightM={props.cogHeightM} m2px={m2px} stroke={stroke} />}
      {mode === "playback" && runFrame !== null && <RunLayer f={runFrame} m2px={m2px} stroke={stroke} />}
    </svg>
  );
}

function SetupLayer({ setup, snapshot, m2px, u, stroke, selected, labels, placing }: { setup: SetupPx; snapshot: Snapshot | null; m2px: (m: P2) => P2; u: number; stroke: (w: number) => number; selected: StageProps["selected"]; labels: boolean; placing: string | null }) {
  const pts = setup.points;
  const line = (a: string, b: string, colour: string, w: number) =>
    pts[a] !== undefined && pts[b] !== undefined ? <line key={`${a}-${b}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke={colour} strokeWidth={stroke(w)} strokeLinecap="round" /> : null;
  return (
    <g>
      {snapshot !== null &&
        snapshot.wheels.map((w) => {
          const c = m2px(w.centre);
          return <circle key={w.role} cx={c[0]} cy={c[1]} r={w.radius * scaleOf(m2px)} fill="none" stroke="var(--fg-faint)" strokeWidth={stroke(1.5)} />;
        })}
      {snapshot !== null && <polygon points={polyPoints(snapshot.chain, m2px)} fill="none" stroke="var(--fg)" strokeOpacity={0.7} strokeWidth={stroke(2)} strokeDasharray={`${stroke(6)} ${stroke(4)}`} />}
      {LINKS.map(([a, b]) => line(a, b, "var(--accent)", 3))}
      {CAGE_LINKS.map(([a, b]) => line(a, b, "var(--info)", 3))}
      {setup.surfaces.map((s, i) => (
        <g key={`s${i}`}>
          <polyline points={polyPoints(s.polyline_px, (p) => p)} fill="none" stroke="var(--good)" strokeOpacity={0.22} strokeWidth={stroke(14)} strokeLinejoin="round" strokeLinecap="round">
            <title>{`${s.name}: click the line to add a point, right-click a point to remove it`}</title>
          </polyline>
          <polyline points={polyPoints(s.polyline_px, (p) => p)} fill="none" stroke="var(--good)" strokeWidth={stroke(selected?.kind === "surface" && selected.index === i ? 4 : 2.5)} strokeLinejoin="round" />
          {s.polyline_px.map((p, k) => (
            <rect key={k} x={p[0] - 4 * u} y={p[1] - 4 * u} width={8 * u} height={8 * u} fill="var(--good)" />
          ))}
        </g>
      ))}
      {setup.rollers.map((r, i) => {
        const scale = setupScale(setup);
        const radius = (r.teeth !== null ? 0.0127 / (2 * Math.sin(Math.PI / r.teeth)) : r.radius_mm / 1000 + 0.0039) * scale;
        const on = selected?.kind === "roller" && selected.index === i;
        return (
          <g key={`r${i}`} opacity={r.enabled ? 1 : 0.4}>
            <circle cx={r.centre_px[0]} cy={r.centre_px[1]} r={radius} fill="none" stroke="var(--hivis)" strokeWidth={stroke(on ? 4 : 2)} strokeDasharray={r.enabled ? undefined : `${stroke(4)} ${stroke(4)}`} />
            <circle cx={r.centre_px[0]} cy={r.centre_px[1]} r={5 * u} fill="var(--hivis)" />
          </g>
        );
      })}
      {POINTS.map((p) => {
        const at = pts[p.key];
        if (at === undefined) return null;
        return (
          <g key={p.key}>
            <circle cx={at[0]} cy={at[1]} r={7 * u} fill={groupColour(p.group)} stroke="var(--bg)" strokeWidth={stroke(1.5)}>
              <title>{p.label}</title>
            </circle>
            {(labels || placing === p.key) && <text x={at[0] + 10 * u} y={at[1] - 8 * u} fontSize={12 * u} fill="var(--fg)" stroke="var(--bg)" strokeWidth={stroke(3)} paintOrder="stroke">
              {p.label}
            </text>}
          </g>
        );
      })}
    </g>
  );
}

/** Pixels per metre of a setup, from its axles and wheelbase. */
function setupScale(setup: SetupPx): number {
  const a = setup.points.rear_axle;
  const b = setup.points.front_axle;
  if (a === undefined || b === undefined || !(setup.wheelbase_m > 0)) return 1000;
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / setup.wheelbase_m;
}

function SnapshotLayer({ snapshot, m2px, stroke }: { snapshot: Snapshot; m2px: (m: P2) => P2; stroke: (w: number) => number }) {
  const pts = Object.fromEntries(snapshot.linkage.map(([k, v]) => [k, m2px(v)])) as Record<string, P2>;
  const scale = scaleOf(m2px);
  const wheelPx = (role: string) => snapshot.wheels.find((w) => w.role === role);
  const uj = wheelPx("upper_jockey");
  const lj = wheelPx("lower_jockey");
  const cage: P2[] = [pts.cage_pivot, uj ? m2px(uj.centre) : undefined, lj ? m2px(lj.centre) : undefined].filter((p): p is P2 => p !== undefined);
  return (
    <g>
      {LINKS.map(([a, b]) => (pts[a] && pts[b] ? <line key={`${a}-${b}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="var(--accent)" strokeWidth={stroke(4)} strokeLinecap="round" /> : null))}
      <polyline points={polyPoints(cage, (p) => p)} fill="none" stroke="var(--info)" strokeWidth={stroke(4)} strokeLinecap="round" />
      {snapshot.surfaces.map((s, i) => (
        <polyline key={i} points={polyPoints(s, m2px)} fill="none" stroke="var(--good)" strokeWidth={stroke(4)} />
      ))}
      {snapshot.wheels.map((w) => {
        const c = m2px(w.centre);
        return <circle key={w.role} cx={c[0]} cy={c[1]} r={w.radius * scale} fill="none" stroke={w.touching ? "var(--fg-dim)" : "var(--fg-faint)"} strokeWidth={stroke(1.5)} strokeDasharray={w.touching ? undefined : `${stroke(4)} ${stroke(4)}`} />;
      })}
      <polygon points={polyPoints(snapshot.chain, m2px)} fill="none" stroke="var(--fg)" strokeWidth={stroke(3)} strokeLinejoin="round" />
      <Pins pins={snapshot.pins} m2px={m2px} stroke={stroke} />
    </g>
  );
}

/** A dot on every chain pin. */
function Pins({ pins, m2px, stroke }: { pins: P2[]; m2px: (m: P2) => P2; stroke: (w: number) => number }) {
  return (
    <g>
      {pins.map((n, i) => {
        const p = m2px(n);
        return <circle key={i} cx={p[0]} cy={p[1]} r={stroke(2.2)} fill="var(--bg)" stroke="var(--fg)" strokeWidth={stroke(1)} />;
      })}
    </g>
  );
}

/**
 * The axle's and instant centre's paths through travel and the squat
 * construction at this travel (engine `Squat`: Cossalter §6.1.3). The lines
 * run on to the front axle, where their heights compare: the squat line
 * through A, the load transfer line to the centre of mass's height.
 */
/**
 * The maker's geometry over the photo, from the bottom bracket as placed:
 * stack up, reach forward to the head tube's top, and the steering axis at
 * the head angle down to the axles' height. Where the photo's front axle
 * sits off that axis, compared with the table's fork offset, says how well
 * the photo and the table agree.
 */
function GeometryLayer({ setup, frame, params, m2px, stroke }: { setup: SetupPx; frame: PhotoFrame; params: Record<string, unknown>; m2px: (m: P2) => P2; stroke: (w: number) => number }) {
  const num = (k: string) => (typeof params[k] === "number" ? (params[k] as number) : null);
  const [stack, reach, hta, offset] = [num("geometry.stack_mm"), num("geometry.reach_mm"), num("geometry.head_angle_deg"), num("geometry.fork_offset_mm")];
  const bbPx = setup.points.bb;
  if (bbPx === undefined || (stack === null && reach === null && hta === null)) return null;
  const bb = toM(frame, bbPx);
  const top: P2 = [bb[0] + (reach ?? 0) / 1000, bb[1] + (stack ?? 0) / 1000];
  const font = stroke(13);
  const label = (at: P2, text: string, dx = 6, dy = -6) => {
    const p = m2px(at);
    return (
      <text x={p[0] + stroke(dx)} y={p[1] + stroke(dy)} fontSize={font} fill="var(--info)" stroke="var(--bg)" strokeWidth={stroke(3)} paintOrder="stroke">
        {text}
      </text>
    );
  };
  const line = (a: P2, b: P2, dash = true) => <polyline points={polyPoints([a, b], m2px)} fill="none" stroke="var(--info)" strokeWidth={stroke(1.75)} strokeDasharray={dash ? `${stroke(6)} ${stroke(4)}` : undefined} />;
  let axis: ReactNode = null;
  let offsetNote: string | null = null;
  if (hta !== null && stack !== null && reach !== null) {
    const a = (hta * Math.PI) / 180;
    const d: P2 = [Math.cos(a), -Math.sin(a)];
    const t = top[1] / Math.sin(a);
    const above: P2 = [top[0] - 0.12 * d[0], top[1] - 0.12 * d[1]];
    const foot: P2 = [top[0] + (t + 0.03) * d[0], top[1] + (t + 0.03) * d[1]];
    axis = line(above, foot, false);
    // the front axle's perpendicular distance ahead of the steering axis
    const fa: P2 = [frame.wheelbase_m, 0];
    const off = ((fa[0] - top[0]) * d[1] - (fa[1] - top[1]) * d[0]) * -1000;
    offsetNote = `front axle ${off.toFixed(0)} mm ahead of the axis${offset !== null ? ` (fork offset ${offset.toFixed(0)})` : ""}`;
  }
  return (
    <g pointerEvents="none">
      {stack !== null && line(bb, [bb[0], top[1]])}
      {reach !== null && line([bb[0], top[1]], top)}
      {axis}
      <circle cx={m2px(top)[0]} cy={m2px(top)[1]} r={stroke(4)} fill="var(--info)" />
      {stack !== null && label([bb[0], (bb[1] + top[1]) / 2], `Stack ${stack.toFixed(0)}`)}
      {reach !== null && label([(bb[0] + top[0]) / 2, top[1]], `Reach ${reach.toFixed(0)}`, -20, -8)}
      {hta !== null && label(top, `HTA ${hta.toFixed(1)}°`, 8, -10)}
      {offsetNote !== null && label([frame.wheelbase_m, 0], offsetNote, 8, 22)}
    </g>
  );
}

function OverlayLayer({ snapshot, snapshots, overlays, cogHeightM, m2px, stroke }: { snapshot: Snapshot; snapshots: Snapshot[]; overlays: Overlays; cogHeightM: number; m2px: (m: P2) => P2; stroke: (w: number) => number }) {
  const q = snapshot.squat;
  const ics = snapshots.map((s) => s.squat.ic).filter((p): p is P2 => p !== null);
  const dot = (m: P2, colour: string, r: number, key: string) => {
    const p = m2px(m);
    return <circle key={key} cx={p[0]} cy={p[1]} r={stroke(r)} fill={colour} />;
  };
  // a line from the contact through `through`, on to the front axle's x
  const toFront = (through: P2): P2 => {
    const dx = through[0] - q.contact[0];
    const t = Math.abs(dx) < 1e-9 ? 1 : (q.front_contact[0] - q.contact[0]) / dx;
    return [q.contact[0] + t * dx, q.contact[1] + t * (through[1] - q.contact[1])];
  };
  const cog: P2 = [q.front_contact[0], q.front_contact[1] + cogHeightM];
  return (
    <g>
      {overlays.axlePath && <polyline points={polyPoints(snapshots.map((s) => s.squat.axle), m2px)} fill="none" stroke="var(--info)" strokeWidth={stroke(2)} />}
      {overlays.axlePath && dot(q.axle, "var(--info)", 4, "axle")}
      {overlays.icPath && ics.length > 1 && <polyline points={polyPoints(ics, m2px)} fill="none" stroke="var(--hivis)" strokeWidth={stroke(2)} />}
      {overlays.icPath && q.ic !== null && dot(q.ic, "var(--hivis)", 5, "ic")}
      {overlays.squat && (
        <g>
          <polyline points={polyPoints([q.contact, q.front_contact], m2px)} fill="none" stroke="var(--fg-faint)" strokeWidth={stroke(1.5)} />
          <polyline points={polyPoints([q.contact, cog], m2px)} fill="none" stroke="var(--fg-dim)" strokeWidth={stroke(1.5)} strokeDasharray={`${stroke(6)} ${stroke(4)}`} />
          {q.point !== null && q.ic !== null && <polyline points={polyPoints([q.axle, q.ic], m2px)} fill="none" stroke="var(--hivis)" strokeOpacity={0.6} strokeWidth={stroke(1.5)} strokeDasharray={`${stroke(3)} ${stroke(3)}`} />}
          {q.point !== null && <polyline points={polyPoints([q.contact, toFront(q.point)], m2px)} fill="none" stroke="var(--good)" strokeWidth={stroke(2.5)} />}
          {q.point !== null && dot(q.point, "var(--good)", 4, "a")}
          {dot(cog, "var(--fg-dim)", 4, "cog")}
        </g>
      )}
    </g>
  );
}

/** Pixels per metre of a metres-to-pixels map. */
function scaleOf(m2px: (m: P2) => P2): number {
  const a = m2px([0, 0]);
  const b = m2px([1, 0]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function RunLayer({ f, m2px, stroke }: { f: RunFrame; m2px: (m: P2) => P2; stroke: (w: number) => number }) {
  const pts = Object.fromEntries(Object.entries(f.points).map(([k, v]) => [k, m2px(v)])) as Record<string, P2>;
  const scale = scaleOf(m2px);
  const impact = (f.values["Impact speed"] ?? 0) > 0;
  const touching = (f.values["Links on surfaces"] ?? 0) > 0;
  const slipping = (f.values["Clutch slipping"] ?? 0) > 0;
  const cage: P2[] = [pts.cage_pivot, pts["wheel:upper_jockey"], pts["wheel:lower_jockey"]].filter((p): p is P2 => p !== undefined);
  const tyre = f.tyre ? { c: m2px(f.tyre.centre), r: f.tyre.radius * scale } : null;
  return (
    <g>
      {f.ground ? <polyline points={polyPoints(f.ground, m2px)} fill="none" stroke="var(--fg-dim)" strokeWidth={stroke(3)} strokeLinejoin="round" /> : null}
      {tyre ? <circle cx={tyre.c[0]} cy={tyre.c[1]} r={tyre.r} fill="none" stroke="var(--fg-faint)" strokeWidth={stroke(6)} /> : null}
      {LINKS.map(([a, b]) => (pts[a] && pts[b] ? <line key={`${a}-${b}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke="var(--accent)" strokeWidth={stroke(4)} strokeLinecap="round" /> : null))}
      <polyline points={polyPoints(cage, (p) => p)} fill="none" stroke={slipping ? "var(--hivis)" : "var(--info)"} strokeWidth={stroke(slipping ? 6 : 4)} strokeLinecap="round" />
      {f.surfaces.map((s, i) => (
        <g key={i}>
          <polyline points={polyPoints(s, m2px)} fill="none" stroke="var(--good)" strokeOpacity={0.18} strokeWidth={stroke(14)} strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={polyPoints(s, m2px)} fill="none" stroke={impact ? "var(--accent)" : touching ? "var(--hivis)" : "var(--good)"} strokeWidth={stroke(impact ? 6 : 3)} strokeLinejoin="round" />
        </g>
      ))}
      {f.wheels.map((w) => {
        const c = m2px(w.centre);
        const r = w.radius * scale;
        const spokes = [0, 1, 2, 3].map((k) => {
          const a = w.angle + (k * Math.PI) / 2;
          // metres are y-up, pixels y-down: a CCW angle draws with -sin
          return <line key={k} x1={c[0]} y1={c[1]} x2={c[0] + r * Math.cos(a)} y2={c[1] - r * Math.sin(a)} stroke="var(--fg-faint)" strokeWidth={stroke(1.5)} />;
        });
        return (
          <g key={w.role}>
            <circle cx={c[0]} cy={c[1]} r={r} fill="none" stroke="var(--fg-dim)" strokeWidth={stroke(1.5)} />
            {spokes}
          </g>
        );
      })}
      <polygon points={polyPoints(f.nodes, m2px)} fill="none" stroke="var(--fg)" strokeWidth={stroke(3)} strokeLinejoin="round" />
      {f.nodes.map((n, i) => {
        const p = m2px(n);
        return <circle key={i} cx={p[0]} cy={p[1]} r={stroke(1.6)} fill="var(--fg)" />;
      })}
    </g>
  );
}

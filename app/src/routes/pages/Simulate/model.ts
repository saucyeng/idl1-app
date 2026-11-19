/**
 * Pure helpers for the Simulate tab (drivetrain sim spec §7): the points the
 * tab asks for, the lines that draw the bike, the playback clock, and a run's
 * frame as pictures. No IPC and no React; every number here is a picture
 * (pixels, frame indices), never one the bike file stores.
 */
import type { Body, P2, RollerPx, SetupPx, SimRun, SurfacePx } from "@/ipc/simulate";

/** One point the tab asks for. */
export interface PointSpec {
  /** Key in `SetupPx.points`. */
  key: string;
  /** What to click, in sentence case. */
  label: string;
  /** Optional points can be left off. */
  optional: boolean;
  /** Group for colour: linkage, drivetrain, frame. */
  group: "axle" | "linkage" | "drivetrain" | "pod";
}

/** Every point, in the order the tab asks for them. Axles first: they set the photo's scale. */
export const POINTS: readonly PointSpec[] = [
  { key: "rear_axle", label: "Rear axle", optional: false, group: "axle" },
  { key: "front_axle", label: "Front axle", optional: false, group: "axle" },
  { key: "main_pivot", label: "Main pivot", optional: false, group: "linkage" },
  { key: "horst", label: "Chainstay–seatstay pivot", optional: false, group: "linkage" },
  { key: "ss_rocker", label: "Seatstay–rocker pivot", optional: false, group: "linkage" },
  { key: "rocker_frame", label: "Rocker pivot (frame)", optional: false, group: "linkage" },
  { key: "shock_frame", label: "Shock frame eye", optional: true, group: "linkage" },
  { key: "shock_rocker", label: "Shock rocker eye", optional: true, group: "linkage" },
  { key: "bb", label: "Bottom bracket", optional: false, group: "drivetrain" },
  { key: "cage_pivot", label: "Cage pivot", optional: false, group: "drivetrain" },
  { key: "upper_jockey", label: "Upper jockey", optional: false, group: "drivetrain" },
  { key: "lower_jockey", label: "Lower jockey", optional: false, group: "drivetrain" },
  { key: "imu0", label: "Frame pod", optional: false, group: "pod" },
];

/** Colour token for a point group. */
export function groupColour(group: PointSpec["group"]): string {
  switch (group) {
    case "axle":
      return "var(--hivis)";
    case "linkage":
      return "var(--accent)";
    case "drivetrain":
      return "var(--info)";
    case "pod":
      return "var(--fg-dim)";
  }
}

/** The lines that draw the frame and linkage, as pairs of point keys. */
export const LINKS: readonly [string, string][] = [
  ["main_pivot", "horst"],
  ["horst", "rear_axle"],
  ["horst", "ss_rocker"],
  ["ss_rocker", "rear_axle"],
  ["rocker_frame", "ss_rocker"],
  ["rocker_frame", "shock_rocker"],
  ["ss_rocker", "shock_rocker"],
  ["shock_frame", "shock_rocker"],
  ["rear_axle", "front_axle"],
];

/** The lines drawn with the cage. */
export const CAGE_LINKS: readonly [string, string][] = [
  ["cage_pivot", "upper_jockey"],
  ["upper_jockey", "lower_jockey"],
];

/** The first required point not yet placed, or null when all are. */
export function nextMissing(points: Record<string, P2>): PointSpec | null {
  return POINTS.find((p) => !p.optional && points[p.key] === undefined) ?? null;
}

/** The nearest point within `radius` px of `at`, or null. */
export function hitPoint(points: Record<string, P2>, at: P2, radius: number): string | null {
  let best: string | null = null;
  let bestD = radius;
  for (const [k, p] of Object.entries(points)) {
    const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (d <= bestD) {
      best = k;
      bestD = d;
    }
  }
  return best;
}

/** A new roller placed at `centre` (pixels). Isaac's case is the default: a 16T top roller on the chainstay pivot. */
export function newRoller(centre: P2, span: "top" | "lower", count: number): RollerPx {
  return {
    name: span === "top" ? `Top roller${count > 0 ? ` ${count + 1}` : ""}` : `Lower guide${count > 0 ? ` ${count + 1}` : ""}`,
    body: span === "top" ? "chainstay" : "front_triangle",
    centre_px: centre,
    teeth: span === "top" ? 16 : null,
    radius_mm: 14,
    span,
    side: span === "top" ? "under" : "over",
    inertia_kgm2: 2e-6,
    enabled: true,
  };
}

/** A new contact surface: three points from `a` to `b` (pixels), lifted `lift` px off the line (up the image). */
export function newSurface(a: P2, b: P2, lift: number, body: Body): SurfacePx {
  const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - lift];
  return { name: "Chainstay protector", body, polyline_px: [[a[0], a[1] - lift], mid, [b[0], b[1] - lift]], side: "above" };
}

/** `setup` with point `key` moved to `at`. */
export function movePoint(setup: SetupPx, key: string, at: P2): SetupPx {
  return { ...setup, points: { ...setup.points, [key]: at } };
}

/** Parses a cassette like "10, 12, 14-16" into teeth, smallest first; null when it isn't one. */
export function parseCassette(text: string): number[] | null {
  const teeth = text
    .split(/[\s,]+/)
    .filter((t) => t.length > 0)
    .map((t) => Number(t));
  if (teeth.length === 0 || teeth.some((t) => !Number.isInteger(t) || t < 9 || t > 60)) return null;
  return [...teeth].sort((a, b) => a - b);
}

/** A run's frame, unpacked for drawing (metres). */
export interface RunFrame {
  t: number;
  nodes: P2[];
  points: Record<string, P2>;
  wheels: { role: string; centre: P2; radius: number; angle: number; teeth: number }[];
  surfaces: P2[][];
  /** Channel values at this frame, by name. */
  values: Record<string, number>;
}

/** Frame `k` of `run` (clamped). */
export function runFrame(run: SimRun, k: number): RunFrame {
  const f = Math.max(0, Math.min(run.frames - 1, Math.floor(k)));
  const nodes: P2[] = [];
  const nb = f * run.nodes * 2;
  for (let i = 0; i < run.nodes; i++) nodes.push([run.nodeXy[nb + 2 * i], run.nodeXy[nb + 2 * i + 1]]);
  const points: Record<string, P2> = {};
  const pb = f * run.points.length * 2;
  run.points.forEach((name, i) => {
    points[name] = [run.pointXy[pb + 2 * i], run.pointXy[pb + 2 * i + 1]];
  });
  const wheels = run.wheels.map((w, i) => ({
    role: w.role,
    centre: points[`wheel:${w.role}`] ?? [0, 0],
    radius: w.radius_m,
    angle: run.wheelAngle[f * run.wheels.length + i],
    teeth: w.teeth,
  }));
  const surfaces: P2[][] = [];
  for (const name of run.points) {
    const m = /^surface:(\d+):(\d+)$/.exec(name);
    if (m === null) continue;
    const j = Number(m[1]);
    (surfaces[j] ??= []).push(points[name]);
  }
  const values: Record<string, number> = {};
  for (const c of run.channels) values[c.name] = c.values[f];
  return { t: run.frameT[f], nodes, points, wheels, surfaces, values };
}

/** The frame to show `elapsed` seconds of real time after `startFrame`, at `speed` (1 = real time). Wraps at the end. */
export function playbackFrame(run: SimRun, startFrame: number, elapsed: number, speed: number): number {
  if (run.frames < 2) return 0;
  const rate = (run.frames - 1) / Math.max(1e-9, run.frameT[run.frames - 1] - run.frameT[0]);
  const k = startFrame + elapsed * speed * rate;
  return k % run.frames;
}

/** An SVG `points` attribute for `pts` mapped through `map`. */
export function polyPoints(pts: readonly P2[], map: (p: P2) => P2): string {
  return pts.map((p) => map(p)).map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ");
}

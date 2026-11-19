/**
 * The drivetrain simulator's commands (C3 §3.15, drivetrain sim spec
 * `2026-11-19-idl1-drivetrain-sim-DRAFT.md`).
 *
 * **Pixels in, metres out.** The Simulate tab edits points on the bike's
 * photo in pixels; Rust turns them into metres (from the two axles and the
 * wheelbase) for the bike file and for every number the simulator reports.
 * Kinematic snapshots and run frames come back in metres with the photo's
 * `PhotoFrame`, so the tab draws them on the photo with {@link toPx} — a
 * picture transform, never stored.
 */
import { Channel, invoke } from "@tauri-apps/api/core";

import type { Progress } from "./import";

/** A point, `[x, y]`. Pixels (image y down) or metres (y up), as named. */
export type P2 = [number, number];

/** The rigid part a point is drawn on. */
export type Body = "front_triangle" | "chainstay" | "seatstay";
/** The span a roller guides. */
export type Span = "top" | "lower";
/** The side of a roller the chain runs on. */
export type ChainSide = "over" | "under";
/** The side of a surface the chain stays on. */
export type SurfaceSide = "above" | "below";

/** The photo's scale and axes (Rust `PhotoFrame`). */
export interface PhotoFrame {
  rear_axle_px: P2;
  front_axle_px: P2;
  wheelbase_m: number;
}

/** A roller as the tab edits it. */
export interface RollerPx {
  name: string;
  body: Body;
  centre_px: P2;
  /** Teeth, or null for a smooth roller. */
  teeth: number | null;
  /** A smooth roller's radius, mm. */
  radius_mm: number;
  span: Span;
  side: ChainSide;
  /** kg·m². */
  inertia_kgm2: number;
  enabled: boolean;
  /** An idler the chain is threaded round (always on that side), not a guide
   *  that acts only when the chain reaches it. */
  threaded: boolean;
}

/** A contact surface as the tab edits it. */
export interface SurfacePx {
  name: string;
  body: Body;
  polyline_px: P2[];
  side: SurfaceSide;
}

/** The drivetrain's numbers. Units in the names. */
export interface DrivetrainParams {
  chainring_teeth: number;
  cassette_teeth: number[];
  chain_links: number;
  chain_mass_kg: number;
  jockey_teeth: [number, number];
  /** `[[deg forward from drawn, N·m toward tension], …]`. */
  spring_torque_nm: P2[];
  clutch_torque_nm: number;
  bearing_torque_nm: number;
  cage_inertia_kgm2: number;
  cage_mass_kg: number;
  jockey_inertia_kgm2: number;
  /** The gear the photo shows, 0 = smallest cog. */
  photo_gear: number;
  cassette_inertia_kgm2: number;
  freehub_engagement_deg: number;
  freehub_drag_nm: number;
  wheel_radius_m: number;
  crank_length_m: number;
}

/** The whole setup in photo pixels. */
export interface SetupPx {
  photo_file: string | null;
  wheelbase_m: number;
  rear_travel_m: number;
  /** By name: the linkage's and drivetrain's points, pixels. */
  points: Record<string, P2>;
  rollers: RollerPx[];
  surfaces: SurfacePx[];
  params: DrivetrainParams;
}

/** `get_sim_setup`'s return. */
export interface SimSetupView {
  bike_id: string;
  has_linkage: boolean;
  has_drivetrain: boolean;
  frame: PhotoFrame | null;
  setup: SetupPx | null;
  params: DrivetrainParams;
  wheelbase_m: number;
  rear_travel_m: number;
  photo_file: string | null;
}

/** One gear's curves through travel (one value per travel sample). */
export interface GearCurves {
  gear: number;
  teeth: number;
  travel_mm: number[];
  growth_mm: number[];
  kickback_deg: number[];
  cage_deg: number[];
  loop_change_mm: number[];
  top_span_mm: number[];
  /** One series per contact surface. */
  clearance_mm: number[][];
  /** One series per roller. */
  roller_touching: boolean[][];
}

/** A wheel to draw (metres). */
export interface WheelView {
  role: string;
  centre: P2;
  radius: number;
  touching: boolean;
}

/** The bike at one travel (metres). */
export interface Snapshot {
  travel_mm: number;
  cage_deg: number;
  chain: P2[];
  wheels: WheelView[];
  linkage: [string, P2][];
  surfaces: P2[][];
}

/** `sim_kinematics`'s return. */
export interface KinematicsView {
  gears: GearCurves[];
  failed: [number, string][];
  snapshots: Snapshot[];
  /** Chain lengths (links) that fit every gear through travel, or null. */
  chain_fit: [number, number] | null;
  frame: PhotoFrame;
}

/** A bump train (Rust `BumpTrain`), SI units. */
export interface BumpTrain {
  speed_mps: number;
  depth_m: number;
  sag_m: number;
  compress_s: number;
  rebound_s: number;
  chassis_g: number;
  count: number;
  spacing_s: number;
  lead_s: number;
}

/** The engine's default bump train. */
export const DEFAULT_BUMPS: BumpTrain = {
  speed_mps: 6,
  depth_m: 0.11,
  sag_m: 0.045,
  compress_s: 0.06,
  rebound_s: 0.14,
  chassis_g: 3,
  count: 4,
  spacing_s: 0.35,
  lead_s: 0.25,
};

/** A run's totals. */
export interface RunSummary {
  impacts: number;
  max_impact_mps: number;
  clutch_slip_deg: number;
  max_top_tension_n: number;
  max_pedal_force_n: number;
  max_top_deflection_mm: number;
  max_lower_deflection_mm: number;
  max_link_error_mm: number;
}

/** A decoded run (`IDLS` v1). Arrays are views on the response's bytes. */
export interface SimRun {
  frames: number;
  nodes: number;
  gear: number;
  /** Names of the moving points, as the run's `point_xy` orders them. */
  points: string[];
  wheels: { role: string; radius_m: number; teeth: number }[];
  channels: { name: string; unit: string; values: Float32Array }[];
  summary: RunSummary;
  frame: PhotoFrame;
  input: BumpTrain;
  /** `[frame][node][x, y]`, metres. */
  nodeXy: Float32Array;
  /** `[frame][point][x, y]`, metres. */
  pointXy: Float32Array;
  /** `[frame][wheel]`, rad. */
  wheelAngle: Float32Array;
  /** Seconds, one per frame. */
  frameT: Float32Array;
}

const RUN_MAGIC = "IDLS";

/** Decodes `run_drivetrain_sim`'s bytes (`IDLS` v1, C3 §3.15).
 *
 *  @throws Error on bad magic, version or a short buffer. */
export function decodeSimRun(buf: ArrayBuffer): SimRun {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 12 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== RUN_MAGIC) {
    throw new Error("not a drivetrain run (bad magic)");
  }
  const view = new DataView(buf);
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`drivetrain run version ${version} is not supported`);
  const headLen = view.getUint32(8, true);
  if (12 + headLen > bytes.length) throw new Error("drivetrain run is shorter than its header");
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headLen))) as {
    frames: number;
    nodes: number;
    gear: number;
    points: string[];
    wheels: { role: string; radius_m: number; teeth: number }[];
    channels: { name: string; unit: string }[];
    summary: RunSummary;
    frame: PhotoFrame;
    input: BumpTrain;
  };
  let off = Math.ceil((12 + headLen) / 4) * 4;
  const take = (n: number): Float32Array => {
    if (off + 4 * n > bytes.length) throw new Error("drivetrain run is shorter than its header says");
    const a = new Float32Array(buf, off, n);
    off += 4 * n;
    return a;
  };
  const f = head.frames;
  const nodeXy = take(f * head.nodes * 2);
  const pointXy = take(f * head.points.length * 2);
  const wheelAngle = take(f * head.wheels.length);
  const channels = head.channels.map((c) => ({ name: c.name, unit: c.unit, values: take(f) }));
  const frameT = take(f);
  return { ...head, channels, nodeXy, pointXy, wheelAngle, frameT };
}

/** Metres in the bike's side plane to photo pixels: the inverse of Rust's
 *  `PhotoFrame::to_bike`, for drawing only. */
export function toPx(frame: PhotoFrame, m: P2): P2 {
  const [rx, ry] = frame.rear_axle_px;
  const dx = frame.front_axle_px[0] - rx;
  const dy = frame.front_axle_px[1] - ry;
  const len = Math.hypot(dx, dy) || 1e-9;
  const ex: P2 = [dx / len, dy / len];
  let ey: P2 = [ex[1], -ex[0]];
  if (ey[1] > 0) ey = [-ey[0], -ey[1]];
  const ppm = len / (frame.wheelbase_m || 1e-9);
  return [rx + (m[0] * ex[0] + m[1] * ey[0]) * ppm, ry + (m[0] * ex[1] + m[1] * ey[1]) * ppm];
}

/** C3 §3.15 `get_sim_setup`: the bike's setup, in the frame just clicked or the saved one. */
export async function getSimSetup(bikeId: string, frame: PhotoFrame | null): Promise<SimSetupView> {
  return invoke<SimSetupView>("get_sim_setup", { bikeId, frame });
}

/** C3 §3.15 `save_sim_setup`: saves the setup as the bike's linkage and drivetrain. */
export async function saveSimSetup(bikeId: string, setup: SetupPx): Promise<SimSetupView> {
  return invoke<SimSetupView>("save_sim_setup", { bikeId, setup });
}

/** C3 §3.15 `set_bike_photo`: copies the photo beside the bike file; returns its name. */
export async function setBikePhoto(bikeId: string, path: string): Promise<string> {
  return invoke<string>("set_bike_photo", { bikeId, path });
}

/** C3 §3.15 `get_bike_photo`: the photo's bytes. */
export async function getBikePhoto(bikeId: string, file: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("get_bike_photo", { bikeId, file });
}

/** C3 §3.15 `sim_kinematics`: every gear's curves and the chosen gear's snapshots. */
export async function simKinematics(setup: SetupPx, gear: number, samples: number): Promise<KinematicsView> {
  return invoke<KinematicsView>("sim_kinematics", { setup, gear, samples });
}

/** C3 §3.15 `run_drivetrain_sim`: the chain loop through a bump train. */
export async function runDrivetrainSim(setup: SetupPx, gear: number, input: BumpTrain, onProgress: (p: Progress) => void): Promise<SimRun> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  const buf = await invoke<ArrayBuffer>("run_drivetrain_sim", { setup, gear, input, progress });
  return decodeSimRun(buf);
}

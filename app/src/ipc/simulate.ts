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
import { decodeSimResult, track } from "./simResult";

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
  /** Take the chain's length from the photo (nearest even link count) instead of `chain_links`. */
  chain_from_photo: boolean;
  chain_mass_kg: number;
  jockey_teeth: [number, number];
  /** The spring's force at the lower jockey, along the chain: `[[deg forward from drawn, N], …]`. */
  spring_force_n: P2[];
  /** The force to pull the lower jockey forward at the drawn angle (spring and clutch), N. */
  pull_force_n: number;
  /** How far the lower jockey moves forward along the chain before the clutch holds, mm. */
  clutch_free_play_mm: number;
  bearing_torque_nm: number;
  cage_inertia_kgm2: number;
  cage_mass_kg: number;
  jockey_inertia_kgm2: number;
  /** The gear the photo shows, 0 = smallest cog. */
  photo_gear: number;
  /** How far the parallelogram drops the cage pivot toward the axle as it shifts, a fraction of the change in cog radius: 0 horizontal (SRAM Eagle), 1 slant. */
  slant?: number;
  cassette_inertia_kgm2: number;
  freehub_engagement_deg: number;
  freehub_drag_nm: number;
  wheel_radius_m: number;
  crank_length_m: number;
  /** Rider and bike's centre of mass above the ground, m, for anti-squat (not saved). */
  cog_height_m: number;
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
  /** The squat line's angle above the ground, degrees; null where undefined. */
  squat_angle_deg: (number | null)[];
}

/** The squat construction at one travel (Rust `Squat`, metres). */
export interface Squat {
  axle: P2;
  /** The seatstay's instant centre about the frame; null when the links are parallel. */
  ic: P2 | null;
  /** Where the chain's top span meets the line from the axle through the instant centre. */
  point: P2 | null;
  contact: P2;
  front_contact: P2;
  angle_deg: number | null;
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
  /** The chain's pins, one per link. */
  pins: P2[];
  wheels: WheelView[];
  linkage: [string, P2][];
  surfaces: P2[][];
  squat: Squat;
}

/** `sim_kinematics`'s return. */
export interface KinematicsView {
  gears: GearCurves[];
  failed: [number, string][];
  /** Anti-squat, percent, per gear (as `gears`) and travel sample; null where undefined. */
  anti_squat_pct: (number | null)[][];
  /** The centre of mass height anti-squat used, m: the placed point's, else the params'. */
  cog_height_m: number;
  snapshots: Snapshot[];
  /** Travels (mm) where the chosen gear's loop doesn't close, with why. */
  unclosed: [number, string][];
  /** The chain's links used. */
  chain_links: number;
  /** The chain the photo implies, links (fractional), or null. */
  photo_links: number | null;
  /** The bike as photographed (topped out, the photo's gear, the cage as drawn), or null. */
  drawn: Snapshot | null;
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

/** A decoded drivetrain run (the `drivetrain` component of an `IDLM` v1 sim
 *  result). Arrays are views on the response's bytes. */
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
  /** The ground the rear wheel follows (the `terrain` component), when the
   *  run has one: `ground` is `[frame][point][x, y]` metres in the bike's
   *  frame, a window round the rear axle that scrolls as the bike moves. */
  terrain: { wheelRadiusM: number; groundPoints: number; ground: Float32Array } | null;
}

/** The tracks a drivetrain run lays out before its channels. */
const RUN_FIXED_TRACKS = new Set(["chain", "points", "wheel_angle"]);

/** Decodes `run_drivetrain_sim`'s bytes (`IDLM` v1, C3 §3.15) into the
 *  drivetrain's view: `chain`, `points` and `wheel_angle` tracks, and every
 *  other drivetrain scalar track as a channel, in order.
 *
 *  @throws Error on bad bytes (see `decodeSimResult`) or a result with no
 *  drivetrain component or one of its tracks. */
export function decodeSimRun(buf: ArrayBuffer): SimRun {
  const r = decodeSimResult(buf);
  const meta = r.components.drivetrain as
    | { gear: number; nodes: number; wheels: SimRun["wheels"]; summary: RunSummary; frame: PhotoFrame; input: BumpTrain }
    | undefined;
  if (!meta) throw new Error("sim result has no drivetrain");
  const points = track(r, "points");
  const terrainMeta = r.components.terrain as { wheel_radius_m: number } | undefined;
  const ground = r.tracks.find((t) => t.component === "terrain" && t.name === "ground");
  const terrain = terrainMeta && ground ? { wheelRadiusM: terrainMeta.wheel_radius_m, groundPoints: ground.count, ground: ground.values } : null;
  const channels = r.tracks
    .filter((t) => t.component === "drivetrain" && t.kind === "scalar" && !RUN_FIXED_TRACKS.has(t.name))
    .map((t) => ({ name: t.name, unit: t.unit, values: t.values }));
  return {
    frames: r.frames,
    nodes: meta.nodes,
    gear: meta.gear,
    points: points.labels ?? [],
    wheels: meta.wheels,
    channels,
    summary: meta.summary,
    frame: meta.frame,
    input: meta.input,
    nodeXy: track(r, "chain").values,
    pointXy: points.values,
    wheelAngle: track(r, "wheel_angle").values,
    frameT: r.frameT,
    terrain,
  };
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

/** Photo pixels to metres in the bike's side plane: {@link toPx} inverted, for drawing only. */
export function toM(frame: PhotoFrame, px: P2): P2 {
  const [rx, ry] = frame.rear_axle_px;
  const dx = frame.front_axle_px[0] - rx;
  const dy = frame.front_axle_px[1] - ry;
  const len = Math.hypot(dx, dy) || 1e-9;
  const ex: P2 = [dx / len, dy / len];
  let ey: P2 = [ex[1], -ex[0]];
  if (ey[1] > 0) ey = [-ey[0], -ey[1]];
  const ppm = len / (frame.wheelbase_m || 1e-9);
  const v: P2 = [(px[0] - rx) / ppm, (px[1] - ry) / ppm];
  return [v[0] * ex[0] + v[1] * ex[1], v[0] * ey[0] + v[1] * ey[1]];
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

/** The bumps' shape when the bike rides over them (C3 §3.15 `run_drivetrain_sim`'s `ride`). */
export interface RideShape {
  /** Each bump's height, m (negative: a step down). */
  bump_height_m: number;
  /** Each bump's length along the trail, m. */
  bump_length_m: number;
}

/** Ride a bike's springs over the bumps instead of prescribing the travel. */
export interface RideRequest extends RideShape {
  bike_id: string;
}

/** C3 §3.15 `run_drivetrain_sim`: the chain loop through a bump train. */
export async function runDrivetrainSim(setup: SetupPx, gear: number, input: BumpTrain, onProgress: (p: Progress) => void, ride: RideRequest | null = null): Promise<SimRun> {
  const progress = new Channel<Progress>();
  progress.onmessage = onProgress;
  const buf = await invoke<ArrayBuffer>("run_drivetrain_sim", { setup, gear, input, ride, progress });
  return decodeSimRun(buf);
}

/** One end's spring fitted to the logged sag measurements (C3 §3.15). */
export interface SpringFitView {
  piston_area_cm2: number;
  positive_volume_cc: number;
  negative_volume_cc: number;
  /** Root-mean-square miss, mm. */
  rms_mm: number;
  /** 1: the area only; 2: area and positive volume. */
  unknowns: number;
  /** The fitted values as parameters, for `setBikeParameters`. */
  values: Record<string, unknown>;
}

/** A logged sag measurement beside the predictions. */
export interface SagTestView {
  at_ms: number;
  end: "fork" | "shock";
  psi: number;
  carried_kg: number;
  measured_mm: number;
  predicted_mm: number;
  fitted_mm: number | null;
}

/** One end's predicted sag. */
export interface SagView {
  stroke_mm: number;
  pct: number;
  wheel_mm: number | null;
}

/** C3 §3.15 `sim_suspension` result. */
export interface SuspensionView {
  travel_mm: number[];
  shock_stroke_mm: number[];
  leverage: number[];
  rear_force_n: number[];
  rear_force_fast_n: number[];
  fork_mm: number[];
  fork_force_n: number[];
  fork_force_fast_n: number[];
  mass_kg: number;
  /** Front, rear: static load less unsprung weight, N. */
  sprung_load_n: [number, number];
  rear_pct: number;
  rear_sag: SagView | null;
  fork_sag: SagView | null;
  tests: SagTestView[];
  fork_fit: SpringFitView | null;
  shock_fit: SpringFitView | null;
  assumed: string[];
}

/** C3 §3.15 `sim_suspension`: springs, loads, sag and the fit to logged sag tests. */
export async function simSuspension(bikeId: string, setup: SetupPx): Promise<SuspensionView> {
  return invoke<SuspensionView>("sim_suspension", { bikeId, setup });
}

/** One row of a maker's geometry table. */
export interface GeometryRow {
  label: string;
  /** The parameter key (`geometry.reach_mm`), or null when the label wasn't recognised. */
  key: string | null;
  /** Per size: the values printed in that cell (more than one for an adjustable setting). */
  values: number[][];
}

/** A maker's geometry table read from a screenshot. */
export interface GeometryTable {
  sizes: string[];
  rows: GeometryRow[];
}

/** C3 §3.15 `read_geometry_table`: OCR a screenshot (its encoded bytes, or a file) and read the table. */
export async function readGeometryTable(from: { image: Uint8Array } | { path: string }): Promise<GeometryTable> {
  return invoke<GeometryTable>("read_geometry_table", "image" in from ? { image: Array.from(from.image), path: null } : { image: null, path: from.path });
}

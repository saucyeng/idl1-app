/**
 * `IDLM` v1 decoder: a simulation's result (C3 §3.15; whole-bike sim loop
 * spec §6, D1). The bridge's `sim_result_wire` is the encoder. One layout for
 * every component the simulator grows: a new component adds tracks.
 *
 * Bytes, little-endian: `"IDLM"`, `u32` version, `u32` header length, the
 * header (UTF-8 JSON), zero padding to a multiple of 4, then `f32` frame
 * times, then each track's values in header order, `[frame][count][dims]`.
 */

/** What one sample of a track is. */
export type TrackKind = "xy" | "xyz" | "angle" | "scalar";

/** A decoded track. `values` is a view on the response's bytes. */
export interface SimTrack {
  name: string;
  /** The component it belongs to (a key of `SimResult.components`). */
  component: string;
  kind: TrackKind;
  /** Samples per frame. */
  count: number;
  /** Unit of every number ("" for a count or a flag). */
  unit: string;
  /** A name per sample, when the samples are named. */
  labels?: string[];
  /** `[frame][count][dims]`. */
  values: Float32Array;
}

/** A decoded sim result. */
export interface SimResult {
  version: number;
  frames: number;
  /** Each component's own metadata, by name. */
  components: Record<string, unknown>;
  /** Seconds, one per frame. */
  frameT: Float32Array;
  tracks: SimTrack[];
}

const MAGIC = "IDLM";
const DIMS: Record<TrackKind, number> = { xy: 2, xyz: 3, angle: 1, scalar: 1 };

/** Numbers per sample of `kind`. */
export function trackDims(kind: TrackKind): number {
  return DIMS[kind];
}

/** Decodes `IDLM` v1 bytes.
 *
 *  @throws Error on bad magic, an unsupported version, an unknown track kind,
 *  or a buffer shorter than its header says. */
export function decodeSimResult(buf: ArrayBuffer): SimResult {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 12 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== MAGIC) {
    throw new Error("not a sim result (bad magic)");
  }
  const view = new DataView(buf);
  const version = view.getUint32(4, true);
  if (version !== 1) throw new Error(`sim result version ${version} is not supported`);
  const headLen = view.getUint32(8, true);
  if (12 + headLen > bytes.length) throw new Error("sim result is shorter than its header");
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headLen))) as {
    frames: number;
    components: Record<string, unknown>;
    tracks: Omit<SimTrack, "values">[];
  };
  let off = Math.ceil((12 + headLen) / 4) * 4;
  const take = (n: number): Float32Array => {
    if (off + 4 * n > bytes.length) throw new Error("sim result is shorter than its header says");
    const a = new Float32Array(buf, off, n);
    off += 4 * n;
    return a;
  };
  const f = head.frames;
  const frameT = take(f);
  const tracks = head.tracks.map((t) => {
    const dims = DIMS[t.kind];
    if (dims === undefined) throw new Error(`sim result track ${t.name} has an unknown kind ${t.kind}`);
    return { ...t, values: take(f * t.count * dims) };
  });
  return { version, frames: f, components: head.components, frameT, tracks };
}

/** The track called `name`.
 *
 *  @throws Error when the result has none. */
export function track(r: SimResult, name: string): SimTrack {
  const t = r.tracks.find((x) => x.name === name);
  if (!t) throw new Error(`sim result has no track ${name}`);
  return t;
}

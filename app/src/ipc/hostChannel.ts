import type { IpcError } from "./workbook";

/** What an `IDLH` payload's `t` array measures — C3 §3.4's `axis_kind`
 *  (version 2). Mirrors `AxisKind` in
 *  `rust/core/src/workbook/v3/host_channel_wire.rs`, numbering included.
 *
 *  Version 1 said only *that* a recorded axis existed, never what it was, so
 *  a reader had to assume seconds. A `[lap]` definition's axis is ordinal lap
 *  numbers (C2 §3.6.1) and a reader that cannot tell them apart draws lap 3
 *  at three seconds. */
export const AxisKind = {
  /** No recorded axis; always paired with an empty `t`. */
  None: 0,
  /** Seconds since the session's first sample. */
  Time: 1,
  /** Hertz. */
  Frequency: 2,
  /** Ordinal lap number, 1-based. */
  Lap: 3,
} as const;

/** One of {@link AxisKind}'s values. */
export type AxisKindValue = (typeof AxisKind)[keyof typeof AxisKind];

/** A decoded `IDLH` v2 host channel (C3 §3.4's `fetch_host_channel`): the
 *  decimated `t`/`v` sample arrays for one `math`-cell definition,
 *  `t` empty when the source has no recorded axis (a scalar or
 *  table-column result). Copied out of the response buffer via `DataView`
 *  (ruling R59 Q3(a): decoders copy, they never view the buffer in place),
 *  never a zero-copy view. */
export interface DecodedHostChannel {
  /** Whether the source carries a recorded axis (header `flags` bit 0). */
  hasT: boolean;
  /** What {@link t} measures. `AxisKind.None` whenever `hasT` is false — the
   *  encoder refuses to claim a kind for an empty axis. A consumer that plots
   *  `t` as seconds must check this first. */
  axisKind: AxisKindValue;
  /** One coordinate per value in `v`, in {@link axisKind}'s own unit (seconds
   *  for `Time`, 1-based lap numbers for `Lap`); empty when `hasT` is false. */
  t: Float64Array;
  /** The definition's decimated values. */
  v: Float64Array;
}

const MAGIC = "IDLH";
/** IDLH version 2 (ruling R217 item 5): `axis_kind` occupies two of version
 *  1's eight reserved bytes, so every payload offset is unchanged. The engine
 *  emits 2 and nothing emits 1 any more, so 2 is the one accepted version --
 *  accepting 1 as well would mean reading its zeroed reserved bytes as
 *  `AxisKind.None` and silently losing the axis of every v1 payload. */
const SUPPORTED_VERSION = 2;
const HEADER_LEN = 24;
const HAS_T_FLAG = 0x1;

/** The `internal`-kind {@link IpcError} this decoder throws on a malformed
 *  buffer (C3 §3.4's `IDLH` layout is produced by a command this frontend
 *  trusts, so a mismatch here is an unexpected condition, not a caller
 *  mistake). An `Error` subclass (so `toThrowError`/generic `catch (e:
 *  unknown)` handling both work) that also structurally satisfies
 *  `IpcError`, so a caller that wants to route on `kind` can. */
export class HostChannelDecodeError extends Error implements IpcError {
  kind = "internal";
  constructor(message: string) {
    super(message);
    this.name = "HostChannelDecodeError";
  }
}

/** Decodes a `fetch_host_channel` response per C3 §3.4's `IDLH` v2 layout:
 *  a fixed 24-byte little-endian header (`magic`, `version`, `flags`,
 *  `length`, `t_length`, `axis_kind`, `reserved`), then `t_length` `f64`s
 *  (the axis coordinates), then `length` `f64`s. Copies every value out via `DataView` rather than
 *  constructing a `Float64Array` view directly over `buf` — the header's
 *  24-byte length keeps the payload arrays 8-byte aligned for a real
 *  `fetch_host_channel` response, but a caller that slices `buf` first
 *  (e.g. a test fixture) could hand this an unaligned `ArrayBuffer`, and
 *  `Float64Array`'s in-place constructor throws on misalignment while
 *  `DataView.getFloat64` never does.
 *
 * @throws {@link IpcError} (`kind: "internal"`) on a buffer too short for
 *  the header, wrong magic bytes, an unsupported `version`, or a buffer
 *  shorter than the header's own declared lengths require. */
export function decodeHostChannel(buf: ArrayBuffer): DecodedHostChannel {
  if (buf.byteLength < HEADER_LEN) {
    throw new HostChannelDecodeError(`host channel buffer ${buf.byteLength} bytes, header needs ${HEADER_LEN} bytes`);
  }
  const view = new DataView(buf);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== MAGIC) {
    throw new HostChannelDecodeError(`host channel magic bytes "${magic}" != "${MAGIC}"`);
  }
  const version = view.getUint16(4, true);
  if (version !== SUPPORTED_VERSION) {
    throw new HostChannelDecodeError(`host channel version ${version} != supported version ${SUPPORTED_VERSION}`);
  }
  const flags = view.getUint16(6, true);
  const hasT = (flags & HAS_T_FLAG) !== 0;
  const length = view.getUint32(8, true);
  const tLength = view.getUint32(12, true);
  const axisKind = view.getUint16(16, true) as AxisKindValue;

  const total = HEADER_LEN + tLength * 8 + length * 8;
  if (buf.byteLength < total) {
    throw new HostChannelDecodeError(
      `host channel buffer ${buf.byteLength} bytes too short for length=${length}, t_length=${tLength} (need ${total})`
    );
  }

  const t = new Float64Array(tLength);
  for (let i = 0; i < tLength; i++) {
    t[i] = view.getFloat64(HEADER_LEN + i * 8, true);
  }
  const vOffset = HEADER_LEN + tLength * 8;
  const v = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    v[i] = view.getFloat64(vOffset + i * 8, true);
  }

  return { hasT, axisKind, t, v };
}

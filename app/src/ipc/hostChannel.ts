import type { IpcError } from "./workbook";

/** A decoded `IDLH` v1 host channel (C3 §3.4's `fetch_host_channel`): the
 *  decimated `t`/`v` sample arrays for one `math`-cell definition,
 *  `t` empty when the source has no recorded axis (a scalar or
 *  table-column result). Copied out of the response buffer via `DataView`
 *  (ruling R59 Q3(a): decoders copy, they never view the buffer in place),
 *  never a zero-copy view. */
export interface DecodedHostChannel {
  /** Whether the source carries a recorded time axis (header `flags` bit 0). */
  hasT: boolean;
  /** Seconds, one per value in `v`; empty when `hasT` is false. */
  t: Float64Array;
  /** The definition's decimated values. */
  v: Float64Array;
}

const MAGIC = "IDLH";
const SUPPORTED_VERSION = 1;
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

/** Decodes a `fetch_host_channel` response per C3 §3.4's `IDLH` v1 layout:
 *  a fixed 24-byte little-endian header (`magic`, `version`, `flags`,
 *  `length`, `t_length`, `reserved`), then `t_length` `f64`s (seconds), then
 *  `length` `f64`s. Copies every value out via `DataView` rather than
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

  return { hasT, t, v };
}

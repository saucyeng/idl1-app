/**
 * The `postMessage` protocol between the notebook host (this realm) and the
 * origin-isolated sandbox `<iframe>` that runs `js` cells (design §6). Two
 * directions are named distinctly — `HostToSandboxMessage` for what this
 * realm sends, `SandboxToHostMessage` for what it receives — even though the
 * plan lists both in one table for readability.
 */

/**
 * A host variable's value as it travels over `postMessage`. A plain JSON
 * scalar/object (`laps`, `session`, `constants`, per C2 §5.1) is wrapped as
 * `{ kind: "json" }`; a decoded channel travels as two `ArrayBuffer`s in
 * `postMessage`'s transfer list rather than as a copied JSON array of
 * numbers (performance budget P7). A decoded FFT spectrum (L6 Task 19) is
 * its own sibling arm rather than reusing `"channel"`'s `{ t, v }` shape:
 * its axis is frequency, not time, so silently relabelling `t` as Hz would
 * be the wrong unit under the right name. `f` (Hz) and `m` (magnitude) are
 * the raw bytes backing a **`Float64Array`** on each end, same convention
 * as `"channel"`'s `t`/`v` -- `sandbox/main.ts`'s `materializeHostVar` does
 * `new Float64Array(payload.f)`/`new Float64Array(payload.m)`
 * unconditionally on receipt.
 */
export type HostVarPayload =
  | { kind: "json"; value: unknown }
  | { kind: "channel"; length: number; t: ArrayBuffer; v: ArrayBuffer }
  | { kind: "spectrum"; length: number; f: ArrayBuffer; m: ArrayBuffer };

/** One cell as the host hands it to the sandbox for (re)definition. */
export interface SandboxCell {
  /** Stable cell id (C2 §2.2), used to route `cellResult`/`cellError` back. */
  id: string;
  /** The cell's source code, exactly as authored inside its fence. */
  code: string;
}

/** A message this realm (the host) sends into the sandbox iframe. */
export type HostToSandboxMessage =
  | { type: "init"; runtimeVersion: string }
  | { type: "setCells"; cells: SandboxCell[] }
  | { type: "setHostVar"; name: string; value: HostVarPayload }
  | { type: "evalInline"; spanId: string; expr: string }
  | { type: "transform"; cellId: string; translateXPx: number; scaleX: number }
  | { type: "layout"; cellId: string; top: number; left: number; width: number }
  | { type: "ping"; nonce: number }
  | { type: "teardown" };

/**
 * A host→sandbox message that asks the sandbox to evaluate one inline
 * `${…}` prose span (C2 §5.2, the 2026-09-05 tracked note "L6 inline
 * `${…}` prose spans have no host→sandbox trigger yet",
 * `runs/2026-09-03/decisions.md`). `spanId` is Rust's own id for this
 * occurrence (`CellOutput.prose_spans[i].id`, ledger R70/R78,
 * `model/proseBlocks.ts`'s `ProseSpanRef.id`), not a C2 fence-string cell
 * id — it never names an actual cell. `expr` is the
 * raw text between `${` and `}` (C2 §5.2's `js_expression`), evaluated in
 * the sandbox's current host-mediated scope (`sandbox/main.ts`'s
 * `SandboxRuntime.evalInline`, which reuses `compileCell`) — never parsed
 * or type-checked on this side.
 */
export function evalInlineMessage(spanId: string, expr: string): Extract<HostToSandboxMessage, { type: "evalInline" }> {
  return { type: "evalInline", spanId, expr };
}

/**
 * Builds a `transform` message (R69 item (b)): one gesture frame's CSS
 * transform, sent host->sandbox via `postMessage` (never IPC) so the
 * sandbox can apply it to that cell's own rendered Plot with no re-fetch,
 * mirroring `ChartCell`'s existing local `transformFor` application to its
 * host-rendered raster underlay. `translateXPx` in CSS px, `scaleX`
 * dimensionless (`model/viewport.ts`'s `transformFor` return shape).
 */
export function transformMessage(
  cellId: string,
  translateXPx: number,
  scaleX: number
): Extract<HostToSandboxMessage, { type: "transform" }> {
  return { type: "transform", cellId, translateXPx, scaleX };
}

/**
 * Builds a `layout` message: this cell's on-screen rectangle, in viewport
 * px (`getBoundingClientRect()`), so the sandbox can absolutely position
 * that cell's own rendered container to appear under the host's
 * gesture-capturing frame at the right document position -- a plumbing
 * addition beyond R69's two named messages (`cellRendered`/`transform`),
 * needed because a single shared iframe (design section 6) cannot
 * otherwise place a cell's picture at the same on-screen spot as its host
 * placeholder when other cell kinds (prose/math/table) are interleaved
 * between chart cells in document order. `top`/`left`/`width` in CSS px.
 */
export function layoutMessage(
  cellId: string,
  rect: { top: number; left: number; width: number }
): Extract<HostToSandboxMessage, { type: "layout" }> {
  return { type: "layout", cellId, top: rect.top, left: rect.left, width: rect.width };
}

/** A message the sandbox iframe sends back to this realm (the host). */
export type SandboxToHostMessage =
  | { type: "ready" }
  | { type: "pong"; nonce: number }
  | { type: "cellRendered"; cellId: string; heightPx: number }
  | { type: "cellError"; cellId: string; message: string }
  | { type: "inlineResult"; spanId: string; text: string }
  | { type: "spanError"; spanId: string; message: string };

/** Narrows `unknown` to a non-null object so its fields may be probed. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates a value received via `postMessage` from the (untrusted) sandbox
 * realm. Named for its caller — the host — not for the message's own
 * taxonomy: every message it accepts originates in the sandbox and is bound
 * for the host. Returns false, never throws, on anything malformed.
 */
export function isHostMessage(msg: unknown): msg is SandboxToHostMessage {
  if (!isRecord(msg) || typeof msg.type !== "string") {
    return false;
  }

  switch (msg.type) {
    case "ready":
      return true;
    case "pong":
      return typeof msg.nonce === "number";
    case "cellRendered":
      return typeof msg.cellId === "string" && typeof msg.heightPx === "number";
    case "cellError":
      return typeof msg.cellId === "string" && typeof msg.message === "string";
    case "inlineResult":
      return typeof msg.spanId === "string" && typeof msg.text === "string";
    case "spanError":
      return typeof msg.spanId === "string" && typeof msg.message === "string";
    default:
      return false;
  }
}

/**
 * Builds a `setHostVar` message for a decoded channel plus the transfer list
 * `postMessage` needs so the two buffers move by reference, not by copy
 * (P7). `t`/`v` must not be read again by the caller after this call — they
 * are neutered once transferred.
 *
 * `t` and `v` are the raw bytes backing a **`Float64Array`** on each end —
 * `t` in seconds since session start, `v` the channel's value (C1 channels
 * are natively `f64`) — matching, byte for byte, `sandbox/main.ts`'s
 * `materializeHostVar`, which unconditionally does `new
 * Float64Array(payload.t)`/`new Float64Array(payload.v)` on receipt. The
 * caller (`model/channelData.ts`'s `ChannelData`) must build both typed
 * arrays as `Float64Array` and pass their `.buffer`s here — a narrower
 * element type on this end would silently corrupt every value once
 * received, since the sandbox's reinterpretation is fixed and unconditional
 * (review-task7.md Important finding; see `protocol.test.ts`'s round-trip
 * test for the byte-for-bit proof).
 *
 * `name` is added as the first argument (deviating from the brief's sketch,
 * which omitted it) because `setHostVar` requires a variable name to bind
 * under; the point under test is that both buffers land in `transfer`
 * exactly once, not this argument order.
 */
export function channelPayload(
  name: string,
  length: number,
  t: ArrayBuffer,
  v: ArrayBuffer
): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] } {
  return {
    message: {
      type: "setHostVar",
      name,
      value: { kind: "channel", length, t, v },
    },
    transfer: [t, v],
  };
}

/**
 * Builds a `setHostVar` message for a decoded FFT spectrum (L6 Task 19; C2
 * §5.3) plus its transfer list, mirroring {@link channelPayload} exactly
 * except for the axis: `f` (Hz, built from `model/fftRequest.ts`'s
 * `frequencyAxisHz`) and `m` (magnitude, `DecodedFft.magnitudes` widened
 * from `Float32Array` to `Float64Array`) rather than `t`/`v`. `f`/`m` must
 * not be read again by the caller after this call -- they are neutered once
 * transferred.
 */
export function spectrumPayload(
  name: string,
  length: number,
  f: ArrayBuffer,
  m: ArrayBuffer
): { message: { type: "setHostVar"; name: string; value: HostVarPayload }; transfer: Transferable[] } {
  return {
    message: {
      type: "setHostVar",
      name,
      value: { kind: "spectrum", length, f, m },
    },
    transfer: [f, m],
  };
}

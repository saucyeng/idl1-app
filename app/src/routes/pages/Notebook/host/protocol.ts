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
 * numbers (performance budget P7).
 */
export type HostVarPayload =
  | { kind: "json"; value: unknown }
  | { kind: "channel"; length: number; t: ArrayBuffer; v: ArrayBuffer };

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
  | { type: "ping"; nonce: number }
  | { type: "teardown" };

/**
 * A host→sandbox message that asks the sandbox to evaluate one inline
 * `${…}` prose span (C2 §5.2, the 2026-09-05 tracked note "L6 inline
 * `${…}` prose spans have no host→sandbox trigger yet",
 * `runs/2026-09-03/decisions.md`). `spanId` is a UI-assigned id for this
 * one occurrence (`components/ProseSpan.tsx`'s `extractInlineSpans`), not a
 * C2 fence-string cell id — it never names an actual cell. `expr` is the
 * raw text between `${` and `}` (C2 §5.2's `js_expression`), evaluated in
 * the sandbox's current host-mediated scope (`sandbox/main.ts`'s
 * `SandboxRuntime.evalInline`, which reuses `compileCell`) — never parsed
 * or type-checked on this side.
 */
export function evalInlineMessage(spanId: string, expr: string): Extract<HostToSandboxMessage, { type: "evalInline" }> {
  return { type: "evalInline", spanId, expr };
}

/** A message the sandbox iframe sends back to this realm (the host). */
export type SandboxToHostMessage =
  | { type: "ready" }
  | { type: "pong"; nonce: number }
  | { type: "cellResult"; cellId: string; html: string }
  | { type: "cellError"; cellId: string; message: string }
  | { type: "inlineResult"; spanId: string; text: string };

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
    case "cellResult":
      return typeof msg.cellId === "string" && typeof msg.html === "string";
    case "cellError":
      return typeof msg.cellId === "string" && typeof msg.message === "string";
    case "inlineResult":
      return typeof msg.spanId === "string" && typeof msg.text === "string";
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

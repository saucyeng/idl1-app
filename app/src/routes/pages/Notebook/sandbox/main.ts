/**
 * The origin-isolated sandbox realm's own entry point (design §6). Runs
 * inside an `<iframe sandbox="allow-scripts">` (no `allow-same-origin`)
 * built by `../host/SandboxHost.ts`. This module is never imported by the
 * host app shell — it is bundled as a *separate* Vite entry
 * (`vite.config.ts`'s `notebookSandbox` input, R56) so `@observablehq/plot`,
 * `d3`, `@observablehq/inputs` and `htl` resolve into one real, loadable
 * script rather than staying as raw unbundled source.
 *
 * Not unit-tested (CLAUDE.md §4: rendering). The host realm's rule against
 * `eval`/`new Function` does not apply here — cell code legitimately runs
 * inside this, a *different* realm, through mechanisms this file owns.
 */
import { Runtime } from "@observablehq/runtime";
import * as Plot from "@observablehq/plot";
import * as d3 from "d3";
import * as Inputs from "@observablehq/inputs";
import { html } from "htl";

import type {
  HostToSandboxMessage,
  HostVarPayload,
  SandboxCell,
  SandboxToHostMessage,
} from "../host/protocol";
import { bindHostVariables, type HostVariableSink } from "./hostVariables";

/**
 * Sends a message to the host realm. `targetOrigin: "*"` is the standard,
 * correct choice for a sandboxed iframe with no `allow-same-origin`: this
 * document's own origin is opaque ("null"), so it has no way to assert the
 * host's real origin. The security boundary here is the `sandbox` flags and
 * the host's own `isHostMessage` validation, not `postMessage` origin
 * filtering.
 */
function postToHost(message: SandboxToHostMessage): void {
  window.parent.postMessage(message, "*");
}

/**
 * Renders `value` into `container`'s own DOM (R69 item (a) -- the sandbox
 * renders each cell's output itself; nothing crosses `postMessage` as an
 * HTML string for the host to inject). A DOM node (`Plot.plot(...)`'s
 * usual return, or any `html`-tagged fragment) is appended directly, never
 * cloned into an HTML string first -- there is no host-side
 * `dangerouslySetInnerHTML` left to feed. Any other value (a bare number,
 * string, or object a custom-code cell returns) becomes `textContent`,
 * never `innerHTML`, so a string value can never be interpreted as markup
 * even inside this already-isolated realm.
 */
function renderCellValue(container: HTMLElement, value: unknown): void {
  container.replaceChildren();
  if (value instanceof Node) {
    container.appendChild(value);
  } else {
    container.textContent = String(value);
  }
}

/**
 * Materialises a `postMessage`d host-variable payload into the value cell
 * code actually sees. A `json` payload passes through unchanged. A
 * `channel` payload's two transferred buffers become an array of `{t, v}`
 * records (R52 Q2 — chosen over the SoA `{length, t, v}` shape C2 §5.1
 * originally proposed, pending that spec's own amendment) rather than the
 * raw `Float64Array` views, since record objects are what Observable Plot's
 * tabular-data protocol iterates.
 */
function materializeHostVar(payload: HostVarPayload): unknown {
  if (payload.kind === "json") {
    return payload.value;
  }

  const t = new Float64Array(payload.t);
  const v = new Float64Array(payload.v);
  const records = new Array<{ t: number; v: number }>(payload.length);
  for (let i = 0; i < payload.length; i++) {
    records[i] = { t: t[i], v: v[i] };
  }
  return records;
}

/**
 * Owns every `js` cell's own rendering container inside this document (R69
 * item (a)): a `position: fixed` `<div>` per cell id, appended to
 * `document.body`, positioned/sized by the host's `layout` message and
 * transformed live by the host's `transform` message (item (b)) -- the
 * host's own `ChartCell` frame is a same-rect, pointer-events-only overlay
 * (`components/ChartCell.tsx`'s doc comment) that this container's pixels
 * show through underneath. `position: fixed` matches viewport px 1:1 with
 * `getBoundingClientRect()`, the coordinate space the host's `layout`
 * message is computed in.
 */
class CellContainers {
  private readonly byId = new Map<string, HTMLDivElement>();

  /** Returns cell `cellId`'s container, creating and appending it on first use. */
  get(cellId: string): HTMLDivElement {
    let container = this.byId.get(cellId);
    if (container === undefined) {
      container = document.createElement("div");
      container.dataset.cellId = cellId;
      container.style.position = "fixed";
      container.style.transformOrigin = "left";
      document.body.appendChild(container);
      this.byId.set(cellId, container);
    }
    return container;
  }

  /** Applies a host `layout` message's rect to cell `cellId`'s container. */
  layout(cellId: string, top: number, left: number, width: number): void {
    const container = this.get(cellId);
    container.style.top = `${top}px`;
    container.style.left = `${left}px`;
    container.style.width = `${width}px`;
  }

  /** Applies a host `transform` message to cell `cellId`'s container (R69 item (b)). */
  transform(cellId: string, translateXPx: number, scaleX: number): void {
    const container = this.byId.get(cellId);
    if (container === undefined) return;
    container.style.transform = `translateX(${translateXPx}px) scaleX(${scaleX})`;
  }

  /** Removes every container -- called on `teardown`, ahead of the whole iframe being discarded. */
  clear(): void {
    for (const container of this.byId.values()) {
      container.remove();
    }
    this.byId.clear();
  }
}

const cellContainers = new CellContainers();

/**
 * A small custom `Observer` (Runtime's own interface: `pending`/`fulfilled`/
 * `rejected`) rather than `@observablehq/inspector` — that package is not
 * among the eight approved dependencies and is not installed; the brief
 * explicitly allows either. `fulfilled` renders the value into this cell's
 * own container ({@link CellContainers}) and reports the container's
 * rendered height back to the host as `cellRendered` (R69 item (a)) --
 * nothing crosses `postMessage` as a serialized HTML string. `rejected`
 * still posts `cellError` as plain text (never HTML), and clears the
 * container so a stale successful render never lingers under a new error.
 */
function makeObserver(cellId: string) {
  return {
    pending(): void {
      // No host message on "pending" — the protocol has no such state, and
      // the host's own UI decides how to show "running" (or doesn't).
    },
    fulfilled(value: unknown): void {
      const container = cellContainers.get(cellId);
      renderCellValue(container, value);
      const heightPx = container.getBoundingClientRect().height;
      postToHost({ type: "cellRendered", cellId, heightPx });
    },
    rejected(error: unknown): void {
      cellContainers.get(cellId).replaceChildren();
      const message = error instanceof Error ? error.message : String(error);
      postToHost({ type: "cellError", cellId, message });
    },
  };
}

/**
 * Compiles a cell's fenced source into a function the Runtime can call with
 * `inputNames`' current values as positional arguments. Tries the common
 * case first — a single implicit-return expression (`Plot.plot({...})`) —
 * and falls back to treating `code` as a statement body requiring an
 * explicit `return`, the way a multi-statement cell must write it.
 *
 * // TODO(idl0): this has no free-identifier analysis — every cell receives
 * // every currently bound host-variable name as an input regardless of
 * // whether its code uses it, and cells cannot reference each other by
 * // name. A real Observable-style compiler (AST-based free-variable
 * // extraction) is out of this task's scope; revisit in Task 13 if
 * // cross-cell references are needed.
 */
function compileCell(inputNames: string[], code: string): (...args: unknown[]) => unknown {
  try {
    return new Function(...inputNames, `return (\n${code}\n);`) as (...args: unknown[]) => unknown;
  } catch {
    return new Function(...inputNames, code) as (...args: unknown[]) => unknown;
  }
}

/** Owns the one `Runtime`/`module` pair this sandbox document runs for its whole lifetime. */
class SandboxRuntime {
  private readonly runtime = new Runtime();
  private readonly module = this.runtime.module();
  private readonly hostVars = new Map<string, unknown>();
  private readonly hostVariables = new Map<string, HostVariableSink>();
  private readonly boundNames = new Set<string>();
  private readonly cellVariables = new Map<string, { delete(): void }>();

  constructor() {
    // Library bindings never change after construction, so a plain
    // `module.builtin()` (whose value a dependent cell reads verbatim, per
    // `bindHostVariables`'s doc comment) is correct and simpler here — no
    // update path is needed for these.
    this.module.builtin("Plot", Plot);
    this.module.builtin("d3", d3);
    this.module.builtin("Inputs", Inputs);
    this.module.builtin("html", html);
    // Also mirrored into `hostVars` (never used for `channelLookup`, which
    // only ever finds arrays) so `evalInline` can build the exact same
    // `inputNames`/argument-value pairing `compileCell` gives a persistent
    // cell, without a second bookkeeping structure.
    this.hostVars.set("Plot", Plot);
    this.hostVars.set("d3", d3);
    this.hostVars.set("Inputs", Inputs);
    this.hostVars.set("html", html);
    for (const name of ["Plot", "d3", "Inputs", "html"]) {
      this.boundNames.add(name);
    }
    // C2 §5.1's three ambient host variables, plus `channel`, start with
    // their documented defaults and are bound through `bindHostVariables`
    // (never `module.builtin()`) so a later `setHostVar` reaches every cell
    // that already resolved them — see that function's doc comment for why.
    this.bindHostVar("laps", []);
    this.bindHostVar("session", null);
    this.bindHostVar("constants", {});
    this.bindHostVar("channel", (name: string, opts?: { lap?: number; session?: string }) =>
      this.channelLookup(name, opts)
    );
  }

  /** Updates `hostVars` (used by `channelLookup`'s by-name search), the
   *  reactive Runtime binding (via `bindHostVariables`), and the set of
   *  names every cell is given as an input (`setCells`). */
  private bindHostVar(name: string, value: unknown): void {
    this.hostVars.set(name, value);
    bindHostVariables(this.module, this.hostVariables, { [name]: value });
    this.boundNames.add(name);
  }

  /**
   * `channel(name, {lap?, session?})` (C2 §5.1): general lookup by name.
   *
   * // TODO(idl0): `lap`/`session` scoping is not implemented here — the
   * // host is responsible for deciding which pre-resolved buffer to push
   * // for a given `(name, lap, session)` combination (that resolution is
   * // Task 7's `tileToChannelData`, per this task's brief); this is a
   * // bare-name lookup over whatever the host has already sent.
   */
  private channelLookup(name: string, _opts?: { lap?: number; session?: string }): { t: number; v: number }[] {
    const value = this.hostVars.get(name);
    return Array.isArray(value) ? (value as { t: number; v: number }[]) : [];
  }

  /** Binds or updates one host variable (`setHostVar`). */
  setHostVar(name: string, payload: HostVarPayload): void {
    this.bindHostVar(name, materializeHostVar(payload));
  }

  /**
   * Evaluates one inline `${…}` prose span (C2 §5.2) as a one-shot
   * expression — not a persistent Runtime `Variable` the way `setCells`'
   * cells are, since a span has no lifetime beyond "get this one string
   * now". Reuses `compileCell`'s exact construction (same `inputNames`,
   * same `new Function` wrapping, including its implicit-return-expression
   * fallback) so `${…}`'s scope is identical to a `js` cell's, per C2
   * §5.2's "same host-mediated scope" requirement — the difference is only
   * that the result is `String(value)`-coerced and posted as
   * `inlineResult`/`spanError` instead of becoming a Runtime observer's
   * `fulfilled`/`rejected` callback.
   *
   * On success, posts `{ type: "inlineResult", spanId, text }`; on a
   * throw, posts `{ type: "spanError", spanId, message }` (R66 item 2,
   * L6 Task 13b) — a distinct message from `cellError`, since a span id
   * and a fence-string cell id are conceptually different and, before
   * this task, both travelled in `cellError`'s `cellId` slot, which made
   * a span failure indistinguishable from an actual cell's failure on the
   * host side.
   */
  evalInline(spanId: string, expr: string): void {
    const inputNames = [...this.boundNames];
    const args = inputNames.map((name) => this.hostVars.get(name));
    try {
      const fn = compileCell(inputNames, expr);
      const value = fn(...args);
      postToHost({ type: "inlineResult", spanId, text: String(value) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      postToHost({ type: "spanError", spanId, message });
    }
  }

  /**
   * Replaces the whole cell set. Every previously defined cell `Variable` is
   * deleted first — simpler and safer than trying to diff and redefine
   * anonymous variables, at the cost of re-running every cell (not just
   * changed ones) on every edit.
   *
   * // TODO(idl0): this redefine-all approach, and giving every cell every
   * // currently bound name as an input (see `compileCell`'s own TODO)
   * // rather than just the names its code actually uses, are both
   * // judgment calls for this task, not settled design — a finer-grained
   * // diff and free-identifier analysis can replace both later without
   * // changing the message protocol.
   */
  setCells(cells: SandboxCell[]): void {
    for (const variable of this.cellVariables.values()) {
      variable.delete();
    }
    this.cellVariables.clear();

    const inputNames = [...this.boundNames];
    for (const cell of cells) {
      const fn = compileCell(inputNames, cell.code);
      const variable = this.module.variable(makeObserver(cell.id)).define(inputNames, fn);
      this.cellVariables.set(cell.id, variable);
    }
  }

  /** Tears down every cell ahead of the whole iframe being discarded. */
  teardown(): void {
    for (const variable of this.cellVariables.values()) {
      variable.delete();
    }
    this.cellVariables.clear();
  }
}

let sandboxRuntime: SandboxRuntime | null = null;

function handleMessage(message: HostToSandboxMessage): void {
  switch (message.type) {
    case "init":
      sandboxRuntime = new SandboxRuntime();
      break;
    case "setHostVar":
      sandboxRuntime?.setHostVar(message.name, message.value);
      break;
    case "setCells":
      sandboxRuntime?.setCells(message.cells);
      break;
    case "evalInline":
      sandboxRuntime?.evalInline(message.spanId, message.expr);
      break;
    case "transform":
      cellContainers.transform(message.cellId, message.translateXPx, message.scaleX);
      break;
    case "layout":
      cellContainers.layout(message.cellId, message.top, message.left, message.width);
      break;
    case "ping":
      postToHost({ type: "pong", nonce: message.nonce });
      break;
    case "teardown":
      sandboxRuntime?.teardown();
      sandboxRuntime = null;
      cellContainers.clear();
      break;
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  // The host is a trusted party (this document's own creator), unlike the
  // sandbox→host direction the host must itself validate; the check here is
  // only "did this come from our parent frame", not a payload shape check.
  if (event.source !== window.parent) {
    return;
  }
  handleMessage(event.data as HostToSandboxMessage);
});

// `ready` now means "this document has loaded and attached its message
// listener" — sent unconditionally, once, right after the listener above is
// registered, rather than only as `init`'s reply (review-task5b.md Critical
// finding: gating `ready` on `init` made it impossible for the host to know
// *when* it's safe to send `init` itself in the first place). The host's
// `OutboundQueue` (`host/outboundQueue.ts`) holds every outbound message
// (including `init`) until this arrives, then flushes in order.
postToHost({ type: "ready" });

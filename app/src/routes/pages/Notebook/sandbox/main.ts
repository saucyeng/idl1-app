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

/** Turns a DOM node into its outer HTML; any other value into its string form. */
function serializeCellValue(value: unknown): string {
  if (value instanceof Node) {
    const container = document.createElement("div");
    container.appendChild(value.cloneNode(true));
    return container.innerHTML;
  }
  return String(value);
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
 * A small custom `Observer` (Runtime's own interface: `pending`/`fulfilled`/
 * `rejected`) rather than `@observablehq/inspector` — that package is not
 * among the eight approved dependencies and is not installed; the brief
 * explicitly allows either. Values render to nothing visible inside this
 * iframe; instead `fulfilled`/`rejected` post the cell's result back to the
 * host as `cellResult`/`cellError`, which is what actually reaches the
 * screen (in the host document).
 */
function makeObserver(cellId: string) {
  return {
    pending(): void {
      // No host message on "pending" — the protocol has no such state, and
      // the host's own UI decides how to show "running" (or doesn't).
    },
    fulfilled(value: unknown): void {
      postToHost({ type: "cellResult", cellId, html: serializeCellValue(value) });
    },
    rejected(error: unknown): void {
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

// TODO(idl0): inline `${…}` span evaluation (design §6's inline-math
// spans) is not wired here — the host side (`SandboxHost.onInlineResult`,
// `inlineResult` in `protocol.ts`) is ready to receive it, but nothing in
// this file ever evaluates a span or posts `inlineResult` back. Out of this
// task's scope (brief Steps 1-5); a later task owns the sandbox-side half.
function handleMessage(message: HostToSandboxMessage): void {
  switch (message.type) {
    case "init":
      sandboxRuntime = new SandboxRuntime();
      postToHost({ type: "ready" });
      break;
    case "setHostVar":
      sandboxRuntime?.setHostVar(message.name, message.value);
      break;
    case "setCells":
      sandboxRuntime?.setCells(message.cells);
      break;
    case "ping":
      postToHost({ type: "pong", nonce: message.nonce });
      break;
    case "teardown":
      sandboxRuntime?.teardown();
      sandboxRuntime = null;
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

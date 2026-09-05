/**
 * Ambient module declarations for two of the eight approved sandbox
 * dependencies that ship no `.d.ts` of their own and have no
 * `@types/observablehq__*` package on npm (checked 2026-09-05) — adding one
 * would be a ninth dependency the brief rules out, so these are hand-written
 * instead. `@observablehq/plot`, `d3`, and `htl` all ship or already have
 * types and need no shim here.
 */
declare module "@observablehq/runtime" {
  /** A single cell's live binding inside a {@link Module}. */
  export interface Variable {
    /** Redefines this variable's inputs and definition function. Returns itself. */
    define(inputs: string[], definition: (...args: unknown[]) => unknown): Variable;
    /** Deletes this variable's current definition and name, if any. */
    delete(): void;
  }

  /** An Observer per runtime-README.md's Observers section. */
  export interface Observer {
    pending(): void;
    fulfilled(value: unknown): void;
    rejected(error: unknown): void;
  }

  /** One Observable Runtime module: a set of variables sharing builtins. */
  export interface Module {
    /** Creates a new (initially undefined) variable, optionally observed. */
    variable(observer?: Observer): Variable;
    /** Defines a built-in constant visible to every variable in this module. */
    builtin(name: string, value: unknown): void;
  }

  /** `@observablehq/runtime`'s root object; see runtime-README.md. */
  export class Runtime {
    constructor(builtins?: Record<string, unknown>, global?: (name: string) => unknown);
    /** Creates (or returns the existing) module for the given `define` function. */
    module(define?: (runtime: Runtime, observer?: (name: string) => Observer) => void): Module;
  }
}

// `@observablehq/inputs` ships no types and is used here only as an opaque
// module namespace handed to cell code (`Inputs.range(...)` etc., authored
// inside the sandbox, not called from this file) — an untyped shim is
// sufficient.
declare module "@observablehq/inputs";

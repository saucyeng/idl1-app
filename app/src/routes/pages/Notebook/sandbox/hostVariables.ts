/**
 * Pure host-variable binding for the sandbox's `@observablehq/runtime`
 * module (design §6, C2 §5.1). Split out of `main.ts` (which has import-time
 * `window`/`iframe` side effects and cannot be unit-tested — CLAUDE.md §4)
 * so this binding logic itself can be, against a fake module.
 */

/** The one `Module` method {@link bindHostVariables} needs — narrow enough
 *  that a test can supply a fake module without a real
 *  `@observablehq/runtime` `Runtime`/`Module` pair. */
export interface HostVariableModule {
  variable(): HostVariableSink;
}

/** The one `Variable` method {@link bindHostVariables} needs. */
export interface HostVariableSink {
  define(name: string, inputs: string[], definition: () => unknown): unknown;
}

/**
 * Registers or updates each `name -> value` pair in `vars` as a genuinely
 * reactive Runtime `Variable` — never `module.builtin()`.
 *
 * Rationale (confirmed against the installed `@observablehq/runtime`
 * source, not just its README): `module.js`'s `module_resolve` captures
 * `constant(this._builtins.get(name))` into the *first* dependent variable
 * that resolves `name`, where `constant(x) = () => x` (`constant.js`) — so
 * whatever value `module.builtin(name, value)` stores becomes that
 * dependent's fixed value unchanged, and a *later* `module.builtin(name,
 * newValue)` call is invisible to any cell that already resolved `name`
 * (the runtime README's own "must not be redefined after [dependents are
 * resolved]" caution). A named `module.variable().define(name, [],
 * definition)` has no such limitation: calling `.define(name, [],
 * newDefinition)` again on the *same* `Variable` object
 * (`variable.js`'s `variable_defineImpl`, reached because `name` and the
 * scope entry are unchanged) marks every dependent dirty and the Runtime
 * recomputes them. That is why every host variable here — including
 * `channel`, which is itself a callable — goes through `module.variable()`,
 * not `module.builtin()`: the Runtime always *invokes* a `Variable`'s
 * definition function when computing it (`runtime.js`'s `variable_compute`
 * calls `definition.apply(...)`), so `() => value` correctly hands a cell
 * `value` itself, whatever `value` is (array, object, or function) — no
 * extra unwrapping needed at the call site the way the old, double-wrapped
 * `module.builtin(name, () => value)` required.
 *
 * @param module The Runtime module (or a fake with the same shape) to bind into.
 * @param variables The caller's persistent `name -> Variable` cache, reused
 *  across calls so a later call for the same `name` redefines the *same*
 *  `Variable` (creating a fresh one each time would leave the old one
 *  stuck at its first value, since cells already resolved to it).
 * @param vars The name/value pairs to bind or update.
 */
export function bindHostVariables(
  module: HostVariableModule,
  variables: Map<string, HostVariableSink>,
  vars: Readonly<Record<string, unknown>>
): void {
  for (const name of Object.keys(vars)) {
    const value = vars[name];
    let variable = variables.get(name);
    if (variable === undefined) {
      variable = module.variable();
      variables.set(name, variable);
    }
    variable.define(name, [], () => value);
  }
}

/**
 * `channelKey` (C2 §5.3 "Channel scope", added 2026-11-05) -- the one shared
 * pure function that names the sandbox host variable one `channel(...)`
 * call's data is published under. Dependency-free, beside `spectrumKey.ts`,
 * for the same reason: `sandbox/main.ts` (a separate bundle) imports it.
 *
 * A call without a scope follows the chart's viewport and is published under
 * the bare name, exactly as before. A scoped call (`{ lap: n }` or
 * `{ from: a, to: b }`) has its own fixed range, so it gets its own key:
 * otherwise two calls over different ranges of one channel would overwrite
 * each other's data, the last fetch winning for every cell.
 *
 * Computed on the host from the parsed literals (`jsCellCalls.ts`) and in the
 * sandbox from the call's own runtime arguments; both format numbers through
 * {@link formatScopeNumber}, so the two agree for any literal the parser
 * accepts.
 */

/** Where one `channel(...)` call's data comes from in time. */
export type ChannelScope =
  /** Follows the chart: the selected window, then pan/zoom. */
  | { kind: "view" }
  /** One lap of the primary window's session, 1-based. */
  | { kind: "lap"; lap: number }
  /** Session seconds `from`..`to`, `from < to`. */
  | { kind: "range"; from: number; to: number };

/** The scope a call's options object names: `{lap}`, `{from, to}`, or
 *  nothing (`undefined`, `{}`, or anything else -- a malformed options object
 *  falls back to the chart's own range rather than inventing one). */
export function scopeFromOptions(opts: unknown): ChannelScope {
  if (opts === null || typeof opts !== "object") return { kind: "view" };
  const o = opts as Record<string, unknown>;
  if (typeof o.lap === "number" && Number.isInteger(o.lap)) return { kind: "lap", lap: o.lap };
  if (typeof o.from === "number" && typeof o.to === "number" && Number.isFinite(o.from) && Number.isFinite(o.to) && o.from < o.to) {
    return { kind: "range", from: o.from, to: o.to };
  }
  return { kind: "view" };
}

/** A number as it appears in a key: JavaScript's own shortest round-trip
 *  rendering, so `5827.27` is `"5827.27"` on both sides. */
export function formatScopeNumber(n: number): string {
  return String(n);
}

/** The host-variable name for `name` under `scope`: the bare name for the
 *  chart's own view, `name@lap:3`, or `name@5827.27..5829.77` (seconds).
 *  `@` cannot appear in a channel or definition name (C1 channel ids and C2
 *  §3.1 identifiers are identifier-shaped), so a scoped key never collides
 *  with a real name. */
export function channelKey(name: string, scope: ChannelScope): string {
  switch (scope.kind) {
    case "view":
      return name;
    case "lap":
      return `${name}@lap:${formatScopeNumber(scope.lap)}`;
    case "range":
      return `${name}@${formatScopeNumber(scope.from)}..${formatScopeNumber(scope.to)}`;
  }
}

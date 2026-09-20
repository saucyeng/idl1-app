/**
 * The 75-entry builtin function catalog transcribed verbatim, row by row,
 * from C2 §3.3 "Builtin catalog"
 * (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`). C2 §3.3
 * states the contract table's own source of truth is
 * `rust/core/src/math/eval.rs`'s `call_function` dispatch — this module
 * transcribes the contract table, not the Rust source, per C2 §8-4's
 * assignment of the CodeMirror mode's implementation to this lane (the
 * lane brief for L6 Task 11 explicitly directs "do not open `rust/` to
 * cross-check").
 *
 * Brought current with the scipy-alignment lane
 * (`runs/2026-09-08/scipy-alignment-plan.md`, ledger R151/R157) — 69 → 72
 * entries: `fft` retired and split into `periodogram`/`welch`, `cumtrapz`
 * added as `cumulative_trapezoid`'s permanent second spelling, and
 * `gradient` added alongside `differentiate` — cross-checked directly
 * against `rust/core/src/math/catalog.rs`'s `math_builtin_catalog()` (the
 * engine's own list this lane's dispatch names as ground truth) rather than
 * re-derived from memory, since that file is what `list_math_builtins`
 * actually serves and what {@link diffFunctionCatalog} below checks this
 * table against at runtime.
 *
 * Brought current again 2026-09-20, after the running app reported five
 * mismatches against the live engine — 72 → 75 entries, all five of them
 * this table lagging C2 §3.3 rather than any disagreement with it:
 * `hilbert` became `envelope` on 2026-09-09 (R151 item 8 / R167, C2 §3.3's
 * own retired-names table; `math/alias.rs` still migrates the old spelling
 * in saved expressions, but the *catalog* no longer names it, so offering
 * it in completion taught a name the engine had retired), and the three
 * shape-polymorphic lap scalars `lap_number()`, `lap_time()` and
 * `sector_time(i)` landed on 2026-09-13 (R217 item 2, R233) without the
 * transcription following. Cross-checked row by row against
 * `rust/core/src/math/catalog.rs` again, as the paragraph above did.
 *
 * A row naming several functions together (e.g. `floor` `ceil` `round`) is
 * expanded into one {@link CatalogEntry} per name here, each carrying its
 * own single-function signature, so `CodePane`'s completion and
 * {@link tokenizeMath}'s function-name lookup can each key on one name.
 * `and`/`or`/`not` are C2 §3.2 grammar operators, not catalog entries —
 * see `mathMode.ts`'s `KEYWORDS` set — and are not listed here. Likewise
 * `main(col[])` (C2 §4) is a table-cell-only function documented in C2 §4,
 * not part of this 75-entry catalog.
 */

/** Whether a catalog entry's engine implementation is complete. A
 *  `"notImplemented"` entry still parses and validates in the grammar (C2
 *  §3.3) — it is shown in completion, greyed, rather than omitted. */
export type CatalogStatus = "implemented" | "notImplemented";

/** One `MATH_FUNCTIONS` row: a single callable name, its call signature as
 *  C2 §3.3 documents it, its category column, and its implementation
 *  status. */
export interface CatalogEntry {
  /** The bare function name as it appears before `(` in a math expression. */
  name: string;
  /** The call signature, transcribed from C2 §3.3's Signature column
   *  (one alternative per `name` when the source row covers several call
   *  shapes with `|`). A `key=value` segment is a keyword argument (C2
   *  §3.2) — additive to the positional form shown alongside it. */
  signature: string;
  /** C2 §3.3's Category column verbatim. */
  category: string;
  status: CatalogStatus;
}

/** C2 §3.3's 75 named builtin functions, transcribed verbatim from the
 *  contract table. 70 `"implemented"`, 5 `"notImplemented"` (`sosfilt`,
 *  `spectrogram`, `envelope`, `correlate`, `convolve`), per
 *  `rust/core/src/math/catalog.rs`'s own counting tests. */
export const MATH_FUNCTIONS: CatalogEntry[] = [
  { name: "butter", signature: 'butter(order, cutoff_hz, "low"|"lowpass"|"high"|"highpass", ch)', category: "Filter", status: "implemented" },
  { name: "sosfilt", signature: "sosfilt(sos, ch)", category: "Filter", status: "notImplemented" },
  { name: "declip", signature: "declip(ch)", category: "Reconstruction", status: "implemented" },
  { name: "cumulative_trapezoid", signature: "cumulative_trapezoid(ch)", category: "Time-domain", status: "implemented" },
  { name: "cumtrapz", signature: "cumtrapz(ch)", category: "Time-domain", status: "implemented" },
  { name: "differentiate", signature: "differentiate(ch)", category: "Time-domain", status: "implemented" },
  { name: "gradient", signature: "gradient(ch)", category: "Time-domain", status: "implemented" },
  { name: "detrend", signature: 'detrend(ch) | detrend(ch, "linear"|"constant"|"mean"|"none")', category: "Time-domain", status: "implemented" },
  { name: "rms", signature: "rms(ch) | rms(ch, w)", category: "Time-domain / aggregate", status: "implemented" },
  { name: "mean", signature: "mean(ch) | mean(ch, w) | mean(ch, window=w)", category: "Time-domain / aggregate", status: "implemented" },
  { name: "std", signature: "std(ch) | std(ch, w)", category: "Time-domain / aggregate", status: "implemented" },
  { name: "median", signature: "median(ch)", category: "Aggregate", status: "implemented" },
  { name: "sum", signature: "sum(ch)", category: "Aggregate", status: "implemented" },
  { name: "count", signature: "count(ch)", category: "Aggregate", status: "implemented" },
  { name: "first", signature: "first(ch)", category: "Aggregate", status: "implemented" },
  { name: "last", signature: "last(ch)", category: "Aggregate", status: "implemented" },
  { name: "percentile", signature: "percentile(ch, quantile)", category: "Aggregate", status: "implemented" },
  { name: "abs", signature: "abs(x)", category: "Elementwise", status: "implemented" },
  { name: "sqrt", signature: "sqrt(x)", category: "Elementwise", status: "implemented" },
  { name: "sign", signature: "sign(x)", category: "Elementwise", status: "implemented" },
  { name: "floor", signature: "floor(x)", category: "Elementwise", status: "implemented" },
  { name: "ceil", signature: "ceil(x)", category: "Elementwise", status: "implemented" },
  { name: "round", signature: "round(x)", category: "Elementwise", status: "implemented" },
  { name: "pow", signature: "pow(x, y)", category: "Elementwise", status: "implemented" },
  { name: "min", signature: "min(ch) | min(a, b)", category: "Aggregate / elementwise", status: "implemented" },
  { name: "max", signature: "max(ch) | max(a, b)", category: "Aggregate / elementwise", status: "implemented" },
  { name: "clip", signature: "clip(ch, lo, hi)", category: "Elementwise", status: "implemented" },
  { name: "sin", signature: "sin(x)", category: "Trig", status: "implemented" },
  { name: "cos", signature: "cos(x)", category: "Trig", status: "implemented" },
  { name: "tan", signature: "tan(x)", category: "Trig", status: "implemented" },
  { name: "asin", signature: "asin(x)", category: "Trig", status: "implemented" },
  { name: "acos", signature: "acos(x)", category: "Trig", status: "implemented" },
  { name: "atan", signature: "atan(x)", category: "Trig", status: "implemented" },
  { name: "atan2", signature: "atan2(y, x)", category: "Trig", status: "implemented" },
  { name: "sinh", signature: "sinh(x)", category: "Trig", status: "implemented" },
  { name: "cosh", signature: "cosh(x)", category: "Trig", status: "implemented" },
  { name: "tanh", signature: "tanh(x)", category: "Trig", status: "implemented" },
  { name: "deg2rad", signature: "deg2rad(x)", category: "Trig conversion", status: "implemented" },
  { name: "rad2deg", signature: "rad2deg(x)", category: "Trig conversion", status: "implemented" },
  {
    name: "periodogram",
    signature: 'periodogram(ch, window="boxcar", detrend="constant", scaling="density"|"spectrum"|"raw_magnitude")',
    category: "Frequency",
    status: "implemented",
  },
  {
    name: "welch",
    signature:
      'welch(ch, window="hann", nperseg=n, noverlap=n, detrend="constant", average="mean"|"median"|"max"|"none", scaling="density"|"spectrum"|"raw_magnitude")',
    category: "Frequency",
    status: "implemented",
  },
  { name: "spectrogram", signature: "spectrogram(ch, window_size, hop_size, window, detrend, scaling)", category: "Frequency", status: "notImplemented" },
  { name: "envelope", signature: "envelope(ch)", category: "Frequency", status: "notImplemented" },
  { name: "correlate", signature: "correlate(a, b)", category: "Correlation", status: "notImplemented" },
  { name: "convolve", signature: "convolve(ch, kernel)", category: "Correlation", status: "notImplemented" },
  { name: "resample", signature: "resample(x, onto)", category: "Resampling", status: "implemented" },
  { name: "where", signature: "where(cond, t, f)", category: "Logic", status: "implemented" },
  { name: "current_lap", signature: "current_lap()", category: "Lap", status: "implemented" },
  { name: "lap_start_time", signature: "lap_start_time(n)", category: "Lap", status: "implemented" },
  { name: "lap_start_distance", signature: "lap_start_distance(n)", category: "Lap", status: "implemented" },
  { name: "sector_number", signature: "sector_number()", category: "Lap", status: "implemented" },
  { name: "lap_number", signature: "lap_number()", category: "Lap", status: "implemented" },
  { name: "lap_time", signature: "lap_time()", category: "Lap", status: "implemented" },
  { name: "sector_time", signature: "sector_time(i)", category: "Lap", status: "implemented" },
  { name: "lap_delta_time", signature: "lap_delta_time(ch)", category: "Lap delta", status: "implemented" },
  { name: "lap_delta_dist", signature: "lap_delta_dist(ch)", category: "Lap delta", status: "implemented" },
  { name: "attitude", signature: 'attitude("roll"|"pitch")', category: "Estimator (diagnostic)", status: "implemented" },
  { name: "body_accel", signature: 'body_accel("long"|"lat")', category: "Estimator (diagnostic)", status: "implemented" },
  { name: "wheel_travel", signature: 'wheel_travel("front"|"rear")', category: "Estimator", status: "implemented" },
  { name: "wheel_velocity", signature: 'wheel_velocity("front"|"rear")', category: "Estimator", status: "implemented" },
  { name: "vec", signature: "vec(x, y, z)", category: "Vector", status: "implemented" },
  { name: "vx", signature: "vx(v)", category: "Vector", status: "implemented" },
  { name: "vy", signature: "vy(v)", category: "Vector", status: "implemented" },
  { name: "vz", signature: "vz(v)", category: "Vector", status: "implemented" },
  { name: "vadd", signature: "vadd(a, b)", category: "Vector", status: "implemented" },
  { name: "vsub", signature: "vsub(a, b)", category: "Vector", status: "implemented" },
  { name: "vscale", signature: "vscale(v, s)", category: "Vector", status: "implemented" },
  { name: "cross", signature: "cross(a, b)", category: "Vector", status: "implemented" },
  { name: "dot", signature: "dot(a, b)", category: "Vector", status: "implemented" },
  { name: "norm", signature: "norm(v)", category: "Vector", status: "implemented" },
  { name: "normalize", signature: "normalize(v)", category: "Vector", status: "implemented" },
  { name: "angle_between", signature: "angle_between(a, b)", category: "Vector", status: "implemented" },
  { name: "rotate_mat", signature: "rotate_mat(v, m00..m22)", category: "Rotation", status: "implemented" },
  { name: "rotate_axis", signature: "rotate_axis(v, ax, ay, az, angle)", category: "Rotation", status: "implemented" },
  { name: "rotate_euler", signature: "rotate_euler(v, roll, pitch, yaw)", category: "Rotation", status: "implemented" },
];

/** The subset of `ipc/workbook.ts`'s `MathBuiltinDto` this module's
 *  self-check needs — `list_math_builtins` (C3 §3.4, ledger R64.2). Kept
 *  narrow (name + status only) rather than importing the full DTO, since
 *  this module owns no IPC dependency of its own (the caller fetches and
 *  passes the list in). */
export interface RemoteMathBuiltin {
  name: string;
  status: "implemented" | "not_implemented";
}

/** One disagreement between this module's hand-transcribed `MATH_FUNCTIONS`
 *  and the engine's own `list_math_builtins` catalog. */
export interface FunctionCatalogMismatch {
  /** `"missing_locally"`: the engine has this builtin, this transcription
   *  doesn't (a completion gap, not a correctness bug — the function still
   *  works, this file's own list is just stale). `"missing_remotely"`: this
   *  transcription names a builtin the engine does not — a copy/paste or
   *  spelling error, or a builtin the engine has since removed.
   *  `"status_mismatch"`: both have `name`, but one says `"implemented"`
   *  and the other `"notImplemented"`/`"not_implemented"`. */
  kind: "missing_locally" | "missing_remotely" | "status_mismatch";
  name: string;
  /** Present only for `"status_mismatch"`: `"local=<x> remote=<y>"`. */
  detail?: string;
}

/**
 * Compares this module's hand-transcribed `MATH_FUNCTIONS` (C2 §3.3,
 * transcribed by hand per that section's own assignment rule — see this
 * module's doc comment) against `list_math_builtins`'s wire catalog (C3
 * §3.4). Pure and total: never throws, returns `[]` when the two agree on
 * every name's presence and status. A caller (`Notebook/index.tsx`) runs
 * this once at notebook open and surfaces any non-empty result as a
 * warning, never a thrown error (CLAUDE.md §5: a transcription drift is
 * not a reason to block the editor) and never patches `MATH_FUNCTIONS`
 * from the remote list at runtime (this file's own transcription is the
 * one this lane's `CodePane`/`mathMode.ts` completion reads; silently
 * overwriting it from a live fetch would make completion depend on session
 * order rather than this committed file).
 *
 * @param local Defaults to `MATH_FUNCTIONS`; a parameter only so this
 *   function's tests can exercise it against small fixtures instead of the
 *   full 75-entry table.
 */
export function diffFunctionCatalog(
  remote: RemoteMathBuiltin[],
  local: CatalogEntry[] = MATH_FUNCTIONS
): FunctionCatalogMismatch[] {
  const remoteByName = new Map(remote.map((r) => [r.name, r]));
  const localByName = new Map(local.map((l) => [l.name, l]));
  const mismatches: FunctionCatalogMismatch[] = [];

  for (const l of local) {
    const r = remoteByName.get(l.name);
    if (r === undefined) {
      mismatches.push({ kind: "missing_remotely", name: l.name });
      continue;
    }
    const localStatus = l.status === "implemented" ? "implemented" : "not_implemented";
    if (localStatus !== r.status) {
      mismatches.push({ kind: "status_mismatch", name: l.name, detail: `local=${localStatus} remote=${r.status}` });
    }
  }

  for (const r of remote) {
    if (!localByName.has(r.name)) {
      mismatches.push({ kind: "missing_locally", name: r.name });
    }
  }

  return mismatches;
}

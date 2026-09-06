/**
 * The 69-entry builtin function catalog transcribed verbatim, row by row,
 * from C2 §3.3 "Builtin catalog"
 * (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`). C2 §3.3
 * states the contract table's own source of truth is
 * `rust/core/src/math/eval.rs`'s `call_function` dispatch — this module
 * transcribes the contract table, not the Rust source, per C2 §8-4's
 * assignment of the CodeMirror mode's implementation to this lane (the
 * lane brief for L6 Task 11 explicitly directs "do not open `rust/` to
 * cross-check").
 *
 * A row naming several functions together (e.g. `floor` `ceil` `round`) is
 * expanded into one {@link CatalogEntry} per name here, each carrying its
 * own single-function signature, so `CodePane`'s completion and
 * {@link tokenizeMath}'s function-name lookup can each key on one name.
 * `and`/`or`/`not` are C2 §3.2 grammar operators, not catalog entries —
 * see `mathMode.ts`'s `KEYWORDS` set — and are not listed here. Likewise
 * `main(col[])` (C2 §4) is a table-cell-only function documented in C2 §4,
 * not part of this 69-entry catalog.
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
   *  shapes with `|`). */
  signature: string;
  /** C2 §3.3's Category column verbatim. */
  category: string;
  status: CatalogStatus;
}

/** C2 §3.3's 69 named builtin functions, transcribed verbatim from the
 *  contract table. 63 `"implemented"`, 6 `"notImplemented"` (`sosfilt`,
 *  `spectrogram`, `hilbert`, `correlate`, `convolve`, `resample`), per
 *  C2 §3.3's own recount. */
export const MATH_FUNCTIONS: CatalogEntry[] = [
  { name: "butter", signature: 'butter(order, cutoff_hz, "low"|"lowpass"|"high"|"highpass", ch)', category: "Filter", status: "implemented" },
  { name: "sosfilt", signature: "sosfilt(sos, ch)", category: "Filter", status: "notImplemented" },
  { name: "declip", signature: "declip(ch)", category: "Reconstruction", status: "implemented" },
  { name: "integrate", signature: "integrate(ch)", category: "Time-domain", status: "implemented" },
  { name: "differentiate", signature: "differentiate(ch)", category: "Time-domain", status: "implemented" },
  { name: "detrend", signature: 'detrend(ch) | detrend(ch, "linear"|"constant"|"mean"|"none")', category: "Time-domain", status: "implemented" },
  { name: "rms", signature: "rms(ch) | rms(ch, w)", category: "Time-domain / aggregate", status: "implemented" },
  { name: "mean", signature: "mean(ch) | mean(ch, w)", category: "Time-domain / aggregate", status: "implemented" },
  { name: "std", signature: "std(ch) | std(ch, w)", category: "Time-domain / aggregate", status: "implemented" },
  { name: "median", signature: "median(ch)", category: "Aggregate", status: "implemented" },
  { name: "sum", signature: "sum(ch)", category: "Aggregate", status: "implemented" },
  { name: "count", signature: "count(ch)", category: "Aggregate", status: "implemented" },
  { name: "first", signature: "first(ch)", category: "Aggregate", status: "implemented" },
  { name: "last", signature: "last(ch)", category: "Aggregate", status: "implemented" },
  { name: "p", signature: "p(ch, quantile)", category: "Aggregate", status: "implemented" },
  { name: "abs", signature: "abs(x)", category: "Elementwise", status: "implemented" },
  { name: "sqrt", signature: "sqrt(x)", category: "Elementwise", status: "implemented" },
  { name: "sign", signature: "sign(x)", category: "Elementwise", status: "implemented" },
  { name: "floor", signature: "floor(x)", category: "Elementwise", status: "implemented" },
  { name: "ceil", signature: "ceil(x)", category: "Elementwise", status: "implemented" },
  { name: "round", signature: "round(x)", category: "Elementwise", status: "implemented" },
  { name: "pow", signature: "pow(x, y)", category: "Elementwise", status: "implemented" },
  { name: "min", signature: "min(ch) | min(a, b)", category: "Aggregate / elementwise", status: "implemented" },
  { name: "max", signature: "max(ch) | max(a, b)", category: "Aggregate / elementwise", status: "implemented" },
  { name: "clamp", signature: "clamp(ch, lo, hi)", category: "Elementwise", status: "implemented" },
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
  { name: "fft", signature: 'fft(ch, "hann"|"hamming"|"rect"|"rectangular")', category: "Frequency", status: "implemented" },
  { name: "spectrogram", signature: "spectrogram(ch)", category: "Frequency", status: "notImplemented" },
  { name: "hilbert", signature: "hilbert(ch)", category: "Frequency", status: "notImplemented" },
  { name: "correlate", signature: "correlate(a, b)", category: "Correlation", status: "notImplemented" },
  { name: "convolve", signature: "convolve(ch, kernel)", category: "Correlation", status: "notImplemented" },
  { name: "resample", signature: "resample(ch, hz)", category: "Resampling", status: "notImplemented" },
  { name: "if", signature: "if(cond, t, f)", category: "Logic", status: "implemented" },
  { name: "current_lap", signature: "current_lap()", category: "Lap", status: "implemented" },
  { name: "lap_start_time", signature: "lap_start_time(n)", category: "Lap", status: "implemented" },
  { name: "lap_start_distance", signature: "lap_start_distance(n)", category: "Lap", status: "implemented" },
  { name: "sector_number", signature: "sector_number()", category: "Lap", status: "implemented" },
  { name: "variance_time", signature: "variance_time(ch)", category: "Variance", status: "implemented" },
  { name: "variance_dist", signature: "variance_dist(ch)", category: "Variance", status: "implemented" },
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
  { name: "angle", signature: "angle(a, b)", category: "Vector", status: "implemented" },
  { name: "rotate_mat", signature: "rotate_mat(v, m00..m22)", category: "Rotation", status: "implemented" },
  { name: "rotate_axis", signature: "rotate_axis(v, ax, ay, az, angle)", category: "Rotation", status: "implemented" },
  { name: "rotate_euler", signature: "rotate_euler(v, roll, pitch, yaw)", category: "Rotation", status: "implemented" },
];

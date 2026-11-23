/**
 * The notebook's Solve bar (2026-11-23): whether a workbook reads the physics
 * solver's channels, and what the bar says while a solve runs. Pure; the bar
 * itself is `components/SolveBar.tsx`.
 */

/** The solver's channels and the builtins that read them (`idl_library::estimated`). */
const SOLVER_REFERENCE =
  /wheel_travel\s*\(|attitude\s*\(\s*"steer"|\[(Front travel|Rear travel|Steer|Fork bend[^\]]*|Rear flex[^\]]*|Frame flex[^\]]*|Airborne)\b[^\]]*\]|"(Front travel|Rear travel|Steer) \(/;

/** Whether `markdown` reads anything the physics solver makes, so the bar is worth showing. */
export function readsSolverChannels(markdown: string | null): boolean {
  return markdown !== null && SOLVER_REFERENCE.test(markdown);
}

/** The bar's state. */
export type SolveBarState =
  | { kind: "idle" }
  | { kind: "solving"; done: number; total: number | null }
  | { kind: "done"; text: string }
  | { kind: "failed"; text: string };

/** The line the bar shows for `state`, `null` for idle. */
export function solveBarText(state: SolveBarState): string | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "solving":
      return state.total === null || state.total === 0 ? "Solving…" : `Solving: ${state.done} of ${state.total} windows`;
    case "done":
    case "failed":
      return state.text;
  }
}

/** The finished line: what was solved and the medians, or what failed. */
export function solvedText(s: { solved_s: number; windows: number; failed_windows: number; front_median_mm: number; rear_median_mm: number; fitted_geometry: boolean; seconds: number }): string {
  const failed = s.failed_windows > 0 ? `, ${s.failed_windows} of ${s.windows} windows failed` : "";
  const fit = s.fitted_geometry ? ", bike geometry fitted first" : "";
  const med = (v: number) => (Number.isFinite(v) ? `${Math.round(v)} mm` : "—");
  return `Solved ${s.solved_s.toFixed(0)} s in ${s.seconds.toFixed(0)} s${fit}${failed}. Median travel front ${med(s.front_median_mm)}, rear ${med(s.rear_median_mm)}.`;
}

/** How much of `[startUs, endUs)` the solved `spans` cover, 0..1. Pure. */
export function coveredFraction(spans: readonly (readonly [number, number])[], startUs: number, endUs: number): number {
  const length = endUs - startUs;
  if (!(length > 0)) return 0;
  let covered = 0;
  for (const [a, b] of spans) covered += Math.max(0, Math.min(b, endUs) - Math.max(a, startUs));
  return Math.min(1, covered / length);
}

/** Whether "Solve automatically: when I select a lap" should solve a window covered `fraction`: anything under 90 %. */
export function needsSolve(fraction: number): boolean {
  return fraction < 0.9;
}

/** The stretches "Solve automatically: every lap after a download" solves: each lap's
 *  `[startUs, endUs]` (µs since the ride's first sample), widened by `padS` seconds each side
 *  for an overlay's pre-roll, overlapping ones merged. Pure. */
export function lapSolveSpans(laps: readonly { start_time_secs: number; end_time_secs: number }[], padS = 5): [number, number][] {
  const spans = laps
    .map((l): [number, number] => [Math.max(0, Math.round((l.start_time_secs - padS) * 1e6)), Math.round((l.end_time_secs + padS) * 1e6)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last !== undefined && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

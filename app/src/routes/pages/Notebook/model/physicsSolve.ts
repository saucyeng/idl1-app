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

/**
 * The Notebook output's two user-switchable registers (UI-DIRECTION
 * decision 31): `paper` is prose in Plex Sans at a ~72ch measure with 24 px
 * cell gaps; `studio` is raw `--bg`, dense, no measure, chart slots edge to
 * edge. The type and the width-to-default rule already live in
 * `Settings/theme.ts` (UI-7, `OutputRegister`/`resolveRegister`) because the
 * register is a stored `UiPrefs` field the Settings tab also shows — this
 * module re-exports the type and thins `resolveRegister` down to the
 * "nothing stored yet" case ({@link defaultRegister}) rather than
 * re-implementing the width breakpoint a second time, and adds the one
 * piece `theme.ts` has no reason to know about: the CSS metrics each
 * register renders with ({@link registerMetrics}).
 */
import { resolveRegister, type OutputRegister } from "../../Settings/theme";

export type { OutputRegister };

/** Paper's measure, in `ch` units (UI-DIRECTION "Notebook"). */
const PAPER_MEASURE_CH = 72;

/** Paper's gap between cells, in CSS px (UI-DIRECTION "Notebook"). */
const PAPER_CELL_GAP_PX = 24;

/** Studio's gap between cells, in CSS px — "chart slots edge to edge"
 *  (UI-DIRECTION decision 31) reads as no gap at all; a documented judgment
 *  call, not a spec number. */
const STUDIO_CELL_GAP_PX = 0;

/** The CSS shape one register renders with — measure, cell gap and type
 *  family — read by `index.tsx`'s output container to style itself without
 *  a second copy of these numbers. */
export interface RegisterMetrics {
  /** The prose measure, in `ch`, or `null` for a register with none (studio). */
  measureCh: number | null;
  /** Gap between adjacent cells, in CSS px. */
  cellGapPx: number;
  /** Which token family (`--font-sans`/`--font-mono`) this register uses. */
  family: "sans" | "mono";
}

/**
 * The register a viewport defaults to when the user has made no explicit
 * choice (R92's rule: paper on narrow, studio on wide) — `resolveRegister`
 * called with a `null` stored value, so the one width breakpoint lives only
 * in `theme.ts`.
 *
 * @param widthPx - The current viewport width, in CSS px.
 */
export function defaultRegister(widthPx: number): OutputRegister {
  return resolveRegister(null, widthPx);
}

/**
 * The CSS metrics `r` renders with (UI-DIRECTION "Notebook"/decision 31).
 *
 * @param r - The register to describe.
 */
export function registerMetrics(r: OutputRegister): RegisterMetrics {
  if (r === "paper") {
    return { measureCh: PAPER_MEASURE_CH, cellGapPx: PAPER_CELL_GAP_PX, family: "sans" };
  }
  return { measureCh: null, cellGapPx: STUDIO_CELL_GAP_PX, family: "mono" };
}

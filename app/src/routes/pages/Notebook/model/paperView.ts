/**
 * Whether the Notebook renders as **paper** — the mobile read-first view
 * (design doc line 154, ruling R184): the built report document rendered
 * to the screen in place of the cell list, tap-to-edit through the
 * existing narrow `Sheet`.
 *
 * Paper is not a new mode with a breakpoint of its own. R184: "the narrow
 * `sheet` placement *is* the paper view" — `editorPlacement(width) ===
 * "sheet"` (`model/editorPlacement.ts`) has described exactly this
 * condition since R161 ("narrow: the output is read-only paper",
 * `outputIsReadOnly`). This module names that condition so callers read
 * intent rather than a placement enum, and **delegates** rather than
 * restating 600 — a second copy of the breakpoint is a second truth that
 * drifts (the same reason `editorPlacement.ts` itself defers to
 * `shell/layout.ts`'s `resolveLayout`).
 *
 * **Width only, in v1 (R184 item 6).** No platform check, no user agent,
 * no coarse-pointer query: a narrowed desktop window gets paper, which is
 * how paper is testable at all on this machine (no Android device has run
 * this app — L9-SURVEY §1). The named gap: a large phone in landscape can
 * report more than 600 CSS px and falls back to the medium inline layout.
 * That is closed after a real device has run the app, not guessed at now.
 */
import { editorPlacement } from "./editorPlacement";

/**
 * Whether the paper view is active at `widthPx`.
 *
 * @param widthPx - The current viewport width, in CSS px.
 */
export function paperViewActive(widthPx: number): boolean {
  return editorPlacement(widthPx) === "sheet";
}

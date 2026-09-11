/**
 * `scatterKey` (C2 §5.3, ruling R215 item 3) -- the one shared pure function
 * that names the sandbox host variable one scatter cell's cloud is published
 * under. The counterpart of `spectrumKey.ts`/`histogramKey.ts`, and in its
 * own dependency-free module for the same reason: `sandbox/main.ts` is a
 * separate Vite bundle (R56) and imports this directly, so it must never be
 * able to acquire a value import from `app/src/ipc/**`.
 *
 * **Never window-qualified**, for the reason ruling R129 settled for spectra
 * and R215 item 2 repeated for histograms: `scatter_call`'s grammar has no
 * window token, so cell code would have no way to address a per-window key.
 * The window dimension travels in the payload instead
 * (`host/protocol.ts`'s `combineScatterWindows`).
 */
import type { ScatterParams } from "./types";

const SEPARATOR = " | ";

/**
 * A `"scatter"` tag, both channel ids, then the two `scatter_params` values
 * joined in C2 §5.3's fixed grammar order. Computed identically on the host
 * side (`model/jsCellBinding.ts`, which pushes the fetched cloud under this
 * name) and the sandbox side (`sandbox/main.ts`'s `scatterLookup`, which
 * recomputes it from the `scatter(...)` call's own arguments) so the two
 * cannot drift.
 *
 * The leading tag makes this key space disjoint from the spectrum and
 * histogram ones by construction, for the reason `histogramKey`'s own doc
 * comment gives. `pointBudget` is part of the key because two budgets over
 * the same pair are genuinely different clouds -- the same reasoning that
 * puts `fft_params` in a spectrum's key. The key is opaque: nothing parses
 * it back into its parts.
 */
export function scatterKey(xChannel: string, yChannel: string, params: ScatterParams): string {
  return ["scatter", xChannel, yChannel, String(params.pointBudget), String(params.equalAspect)].join(SEPARATOR);
}

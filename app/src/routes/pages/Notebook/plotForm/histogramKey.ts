/**
 * `histogramKey` (C2 §5.3, ruling R215 item 2) -- the one shared pure
 * function that names the sandbox host variable one histogram cell's binned
 * distribution is published under. The exact counterpart of
 * `spectrumKey.ts`, and in its own dependency-free module for the same
 * reason: `sandbox/main.ts` is a *separate* Vite bundle (R56) and imports
 * this directly, so it must never be able to acquire a value import from
 * `app/src/ipc/**` and pull `@tauri-apps/api/core` into that bundle.
 * `types.ts` (this module's only import) has no import at all, so this
 * module transitively has none either.
 *
 * **Never window-qualified**, for the reason ruling R129 settled for
 * spectra: `histogram_call`'s grammar has no window token, so cell code
 * would have no way to address a per-window key. A histogram host variable
 * carries its window dimension in the **payload** instead (`host/
 * protocol.ts`'s `histogramPayload`/`combineHistogramWindows`, `{ length,
 * v0, v1, n, w }` plus a `windows` descriptor array) -- one host variable
 * per (channel, `histogram_params`).
 */
import type { HistogramParams } from "./types";

const SEPARATOR = " | ";

/**
 * A `"histogram"` tag, the channel id, then the four `histogram_params`
 * values joined in C2 §5.3's fixed grammar order, so two cells on the same
 * channel with different binning are different distributions. Computed
 * identically on the host side (`model/jsCellBinding.ts`, which pushes the
 * fetched distribution under this name) and the sandbox side
 * (`sandbox/main.ts`'s `histogramLookup`, which recomputes it from the
 * `histogram(...)` call's own arguments) so the two cannot drift.
 *
 * The leading `"histogram"` tag is what `spectrumKey` does not have and
 * does not need: a spectrum's key always carries seven fields and a
 * histogram's five, but both begin with a channel id, and a channel named
 * (say) `count` followed by a bin mode could otherwise be spelled the same
 * way as some spectrum key. The tag makes the two key spaces disjoint by
 * construction rather than by counting fields. `spectrumKey`'s own
 * untagged form is left exactly as it is: changing it would rename every
 * spectrum host variable in every landed workbook's live session for no
 * gain, and the two functions only need to not collide, not to match.
 *
 * The separator is a space, a pipe, then a space. Every field after the
 * channel id is a small closed enum, a `Boolean` rendering, or a decimal
 * rendering of a `js_number` -- none can contain a space or a pipe. The key
 * is opaque: nothing parses it back into its parts.
 */
export function histogramKey(channelId: string, params: HistogramParams): string {
  return [
    "histogram",
    channelId,
    params.binMode,
    String(params.binValue),
    String(params.symmetric),
    params.normalise,
  ].join(SEPARATOR);
}

/**
 * `gpsKey` and `rasterKey` (C2 §5.3, ruling R217 items 1 and 4) -- the two
 * shared pure functions that name the sandbox host variables a map cell's
 * trace and a spectrogram cell's raster are published under. The
 * counterparts of `spectrumKey.ts`/`histogramKey.ts`/`scatterKey.ts`, in
 * their own dependency-free module for the same reason: `sandbox/main.ts` is
 * a separate Vite bundle (R56) and imports these directly, so this module
 * must never be able to acquire a value import from `app/src/ipc/**`.
 *
 * **Neither is window-qualified**, for the reason ruling R129 settled for
 * spectra: neither `gps_call` nor `spectrogram_call` has a window token, so
 * cell code would have no way to address a per-window key. A trace carries
 * the window dimension in its payload (`host/protocol.ts`'s own combiner,
 * with a `NaN` break row, since a path is a connected mark); a raster cannot
 * -- pixels do not interleave -- so a spectrogram cell facets one raster per
 * window under `fx: "w"` instead.
 */
import type { FftParams } from "./types";

const SEPARATOR = " | ";

/**
 * A `"gps"` tag and the colour-by channel, or the literal `"null"` for an
 * uncoloured trace. Computed identically on the host side
 * (`model/jsCellBinding.ts`) and the sandbox side (`sandbox/main.ts`), so
 * the two cannot drift.
 *
 * The geometry is the same whatever the colour, so the colour-by channel is
 * the whole key beyond the tag: two map cells over one selection that colour
 * by different channels are two different payloads, and two that colour by
 * the same channel are one. The key is opaque; nothing parses it back.
 */
export function gpsKey(colourBy: string | null): string {
  return ["gps", colourBy ?? "null"].join(SEPARATOR);
}

/**
 * A `"raster"` tag, the channel id, then the six `fft_params` values joined
 * in C2 §5.3's fixed grammar order -- the same six, in the same order, a
 * spectrum's key uses, because they parameterise the same STFT.
 *
 * `averaging` is in the key even though a spectrogram keeps every frame:
 * dropping it would make this key's derivation differ from `spectrumKey`'s
 * for no gain, and a key is opaque anyway. The leading tag keeps this key
 * space disjoint from every other by construction.
 */
export function rasterKey(channel: string, params: FftParams): string {
  return [
    "raster",
    channel,
    String(params.windowSize),
    String(params.hopSize),
    params.window,
    params.detrend,
    params.scaling,
    params.averaging,
  ].join(SEPARATOR);
}

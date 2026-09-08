/**
 * `spectrumKey` (C2 par. 5.3, ruling R79 Q2, R80 Q4) -- the one shared pure
 * function that names the sandbox host variable one FFT cell's spectrum is
 * published under. Lives in its own dependency-free module under
 * `plotForm/`, not `model/fftRequest.ts`, because `sandbox/main.ts` (a
 * *separate* Vite bundle, R56) imports it directly: `fftRequest.ts` type-only
 * imports from `app/src/ipc/rasters.ts`, and while a type-only import is
 * erased and therefore safe today, R80 Q4 puts the shared key/params type in
 * a module that can never accidentally acquire a value import from
 * `app/src/ipc/**` and pull `@tauri-apps/api/core` into the sandbox bundle.
 * `types.ts` (this module's only import) has no import at all, so this
 * module transitively has none either.
 *
 * **Never window-qualified (ruling R129, amending R127 item 5).** R127
 * item 5 originally had this function take a `windowIndex` so *n* selected
 * windows would publish *n* distinct spectra -- but `spectrum_call`'s
 * grammar (C2 §5.3) has no window token, so cell code would have had no way
 * to *address* the extra keys. R129 amends this: a spectrum host variable
 * now carries its window dimension in the **payload**, exactly like a
 * channel host variable (`host/protocol.ts`'s `spectrumPayload`/
 * `combineSpectrumWindows`, `{ length, f, m, w }` plus a `windows`
 * descriptor array) rather than in the key. This key therefore never
 * varies by window -- one host variable per (channel, `fft_params`), same
 * as before multi-window selection existed.
 */
import type { FftParams } from "./types";

const SEPARATOR = " | ";

/**
 * The channel id plus the six `fft_params` values, joined in C2 par. 5.3's
 * fixed grammar order, so two cells on the same channel with different
 * `fft_params` are different spectra. Computed identically on the host side
 * (`model/jsCellBinding.ts`'s `bindingFor`, which pushes the decoded
 * spectrum under this name) and the sandbox side (`sandbox/main.ts`'s
 * `spectrumLookup`, which recomputes it from the `spectrum(...)` call's own
 * arguments) so the two cannot drift (C2 par. 5.3: "computed identically on
 * both sides").
 *
 * The separator is a space, a pipe, then a space. Every field after the
 * channel id is drawn from a small closed enum or is a decimal-integer
 * rendering of a `js_number`/the literal `"all"` (C2 par. 5.3's `fft_params`
 * grammar), none of which ever contains a space or a pipe, so only the
 * leading `channelId` field could embed the separator -- engine-generated
 * channel ids (C1) are identifier-shaped and do not contain either
 * character in practice. The key is opaque: nothing parses it back into its
 * parts, so an unlikely collision would at worst reuse a cached spectrum,
 * never corrupt state.
 */
export function spectrumKey(channelId: string, params: FftParams): string {
  return [
    channelId,
    String(params.windowSize),
    String(params.hopSize),
    params.window,
    params.detrend,
    params.scaling,
    params.averaging,
  ].join(SEPARATOR);
}

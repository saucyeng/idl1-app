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
 * Open gap (ruling R127 item 5, flagged rather than guessed): `windowIndex`
 * lets the *host* publish `n` distinct spectra for `n` selected windows,
 * but `spectrum_call`'s grammar (C2 §5.3) has no window token, so nothing
 * lets a **sandboxed cell's own code** ask for a specific `windowIndex`'s
 * spectrum by calling `spectrum(channel, fft_params)` — `sandbox/main.ts`'s
 * `spectrumLookup` always recomputes `windowIndex = 0`'s key from a cell
 * call's own arguments. Resolving that (a per-window `SandboxCell`
 * instance? a grammar extension?) is left to whichever task wires multi-
 * window FFT rendering (S1 Task 11-13 territory) — R127 only specifies the
 * host-side naming this function performs.
 */
import type { FftParams } from "./types";

const SEPARATOR = " | ";

/**
 * The channel id plus the six `fft_params` values, joined in C2 par. 5.3's
 * fixed grammar order, so two cells on the same channel with different
 * windows are different spectra. Computed identically on the host side
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
 *
 * @param windowIndex The selected window's ordinal among the notebook's
 *   currently selected windows (R127 item 5: `fft` is a per-window
 *   aggregation, R124, so *n* selected windows over the same channel and
 *   `fft_params` must publish *n* distinct spectra, not one overwritten by
 *   the next `setHostVar` call). Defaults to `0` and, at `0` only, is
 *   **not** appended -- so a single selected window (the ordinary case, and
 *   every case before multi-window selection existed) produces exactly the
 *   same key as before this parameter was added (R127 item 3's
 *   byte-identical guarantee, extended to this key). Only `windowIndex >
 *   0` appends a further `" | "` plus the decimal index.
 */
export function spectrumKey(channelId: string, params: FftParams, windowIndex = 0): string {
  const base = [
    channelId,
    String(params.windowSize),
    String(params.hopSize),
    params.window,
    params.detrend,
    params.scaling,
    params.averaging,
  ].join(SEPARATOR);
  return windowIndex === 0 ? base : `${base}${SEPARATOR}${windowIndex}`;
}

/**
 * Pure request-building math for one FFT chart's `fetch_fft_v2` call (L6
 * Task 19; C3 §3.6, ruling R76, ruling R63 (3); migrated from `fetch_fft`'s
 * `lap: number | null` to `fetch_fft_v2`'s `window: Window`, C1 §6.1,
 * ruling R117/R127). No React, no DOM -- and, beyond
 * `SpectrogramParams`/`FftAveraging`/`DecodedFft`/`Window` as **types**, no
 * import from `app/src/ipc/**`, so this module carries no
 * `@tauri-apps/api/core` *value* import and stays free to be imported by
 * the sandbox bundle too (`app/src/ipc/rasters.ts` and `ipc/workbook.ts`
 * import `invoke` as a value; a value import of either module here would
 * pull it along transitively).
 */
import type { DecodedFft, FftAveraging, SpectrogramParams } from "../../../../ipc/rasters";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";

/** The whole FFT request one chart cell makes, as a pure function of the
 *  channel and the user's segmentation choice (C3 §3.6). */
export interface FftRequest {
  channelId: string;
  /** The window this spectrum is scoped to (C1 §6.1, ruling R117 --
   *  replaces the pre-windows `lap: number | null`), or `null` for the
   *  whole channel -- C3 §3.6's FFT grammar carries no per-mark lap or
   *  window token (R79), so this is always the caller's own selected
   *  window (`Notebook/model/jsCellBinding.ts`'s `bindingFor`'s `window`
   *  parameter), never a value parsed from the cell's own code. A caller
   *  wanting "the whole channel, no restriction" passes a window whose
   *  `span` is `{ kind: "session" }`, or `null` when there is nothing
   *  selected at all (mirrors the old `lap: null` default). */
  window: SelectedWindow | null;
  params: SpectrogramParams;
  averaging: FftAveraging;
}

/** The user's segmentation choice, before `averaging: "none"`'s forcing
 *  rule (below) is applied -- named so `fftRequestFor`'s six related values
 *  read at the call site instead of six positional arguments. */
export interface FftSegmentation {
  /** samples */
  windowSize: number;
  /** samples */
  hopSize: number;
  window: SpectrogramParams["window"];
  detrend: SpectrogramParams["detrend"];
  scaling: SpectrogramParams["scaling"];
}

/**
 * Builds one `fetch_fft_v2` request from a channel and a segmentation
 * choice (R76, "sizing a single-segment request"). `sampleCount` is
 * `ChannelSummary.sample_count` -- the whole channel's sample count, used to
 * size the request's `window_size`/`hop_size` under `"none"` averaging and
 * to resolve `"all"` (`bindingForFft`) -- regardless of `selectedWindow`.
 * `selectedWindow` (C1 §6.1, ruling R117 -- replaces the pre-windows `lap:
 * number | null`, R83/L2b Task 6) selects which window `fetch_fft_v2`
 * slices server-side: `null` for the whole channel, or a resolved
 * {@link SelectedWindow} for that window's own span (C3 §3.6); this
 * function does not know the selected window's own sample count, so its
 * request's `window_size`/`hop_size` are still sized against the whole
 * channel here -- R76's segment/rate guards re-run server-side against the
 * sliced window's own `t_us` (ruling R85), which is what actually governs
 * whether the request succeeds.
 *
 * With `averaging === "none"`, `window_size`/`hop_size` are forced to
 * `sampleCount`, ignoring `segmentation`'s own `windowSize`/`hopSize`, so
 * the request produces exactly one segment ({@link segmentCount} is the
 * function that counts it; R76: `"none"` means exactly one segment, and
 * more is server-side `invalid_argument` with `detail: { segments: n }`).
 * For the three averaging modes, `segmentation`'s window/hop pass straight
 * through unmodified -- more than one segment is the user's own choice.
 *
 * This function never refuses a channel: it does not check `sampleCount`
 * against a minimum, and it does not check `segmentation.hopSize`/
 * `windowSize` for sanity. A channel with fewer than two samples is
 * *unrequestable* per R76, but deciding that and refusing to call this
 * function at all is the caller's job (L6 Task 20's `jsCellBinding.ts`
 * binds `unrequestable` from `sampleCount` alone, before ever building a
 * request) -- this function stays a pure, total function of its arguments
 * and returns a mechanically consistent (if practically unrequestable)
 * `FftRequest` even at `sampleCount` 0 or 1, forcing `window_size`/
 * `hop_size` to that same 0 or 1 under `"none"` rather than throwing.
 */
export function fftRequestFor(
  channelId: string,
  sampleCount: number,
  segmentation: FftSegmentation,
  averaging: FftAveraging,
  selectedWindow: SelectedWindow | null = null
): FftRequest {
  const { windowSize, hopSize } =
    averaging === "none"
      ? { windowSize: sampleCount, hopSize: sampleCount }
      : { windowSize: segmentation.windowSize, hopSize: segmentation.hopSize };

  return {
    channelId,
    window: selectedWindow,
    params: {
      window_size: windowSize,
      hop_size: hopSize,
      window: segmentation.window,
      detrend: segmentation.detrend,
      scaling: segmentation.scaling,
    },
    averaging,
  };
}

/**
 * Number of segments `window_size`/`hop_size` produce over `sampleCount` --
 * the quantity R76's `invalid_argument` counts in `detail: { segments: n }`.
 * A window of `windowSize` samples starting at every multiple of `hopSize`
 * from `0` fits `floor((sampleCount - windowSize) / hopSize) + 1` times; a
 * partial trailing remainder narrower than `windowSize` is not counted
 * (mirrors a segmenter that never emits a short final window). Returns `0`
 * -- "no segment fits at all" -- for any input that cannot produce one:
 * `windowSize > sampleCount`, or a non-positive `windowSize`/`hopSize`/
 * `sampleCount`. Pure; never throws.
 */
export function segmentCount(sampleCount: number, windowSize: number, hopSize: number): number {
  if (sampleCount <= 0 || windowSize <= 0 || hopSize <= 0 || windowSize > sampleCount) {
    return 0;
  }
  return Math.floor((sampleCount - windowSize) / hopSize) + 1;
}

/**
 * Bin `k`'s frequency in Hz (C3 §3.6, "derived frontend-side from the two
 * header fields" -- the one piece of arithmetic C3 §3.6 authorises outside
 * core, CLAUDE.md §2): `k * sampleRateHz / (2 * binCount)`. `binCount === 0`
 * returns `0` rather than dividing by zero -- an empty spectrum has no bin
 * to ask a frequency of, so `k` is meaningless there regardless of its
 * value.
 */
export function binFrequencyHz(k: number, sampleRateHz: number, binCount: number): number {
  if (binCount === 0) {
    return 0;
  }
  return (k * sampleRateHz) / (2 * binCount);
}

/**
 * The full frequency axis for a decoded spectrum, in Hz, one entry per bin
 * (C3 §3.6). Built from {@link binFrequencyHz} over every bin index in
 * `fft.magnitudes`.
 */
export function frequencyAxisHz(fft: DecodedFft): Float64Array {
  const binCount = fft.magnitudes.length;
  const axis = new Float64Array(binCount);
  for (let k = 0; k < binCount; k++) {
    axis[k] = binFrequencyHz(k, fft.sampleRateHz, binCount);
  }
  return axis;
}

/** Content equality for a {@link SelectedWindow}, ignoring `colour` --
 *  recolouring a window is not fetch-relevant, mirrors
 *  `state/selection.ts`'s `windowKey`, which excludes it for the same
 *  reason. `null` compares equal only to `null`. */
function selectedWindowEquals(a: SelectedWindow | null, b: SelectedWindow | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.session_id === b.session_id && JSON.stringify(a.span) === JSON.stringify(b.span);
}

/**
 * Pure "did anything fetch-relevant change" -- the `rasterFetchKeyEquals`
 * pattern (`model/rasterLayer.ts`), so a closure identity can never trigger
 * a refetch. `null` compares equal only to `null`. `window` is compared by
 * content (R117/R127): a selected window changing -- a different lap, a
 * redragged range, or a different session entirely -- must trigger a
 * refetch of the same channel's spectrum over the newly selected window.
 */
export function fftRequestEquals(a: FftRequest | null, b: FftRequest | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return (
    a.channelId === b.channelId &&
    selectedWindowEquals(a.window, b.window) &&
    a.averaging === b.averaging &&
    a.params.window_size === b.params.window_size &&
    a.params.hop_size === b.params.hop_size &&
    a.params.window === b.params.window &&
    a.params.detrend === b.params.detrend &&
    a.params.scaling === b.params.scaling
  );
}

/**
 * Host-side cap on a spectrum's bin count (R79 Q4, R80 Q2: 16384 -- roughly
 * a 32k-sample window, comfortably above every entry in the Properties
 * panel's window-size `<select>`). No source fixes this number: it is a
 * judgment call, checked conservatively before the fetch (against the
 * resolved window size in samples, a conservative upper bound on the bin
 * count under any real-FFT convention C3 §3.6 does not state) and again
 * after decode (against the decoded spectrum's actual `magnitudes.length`,
 * `model/jsCellBinding.ts`'s `bindingFor`/binding-consumer). Above it an FFT
 * cell shows a note and does not fetch -- a cap is not a parameter of the
 * picture, so it is a host constant and not a grammar token (R79 Q4).
 * Decimating in TypeScript is forbidden (CLAUDE.md §3), and `fetch_fft` has
 * no bin-budget argument, so refusing is the only honest option.
 */
export const MAX_FFT_BINS = 16384;

/**
 * True when a request whose resolved window is `resolvedWindowSizeSamples`
 * samples wide would exceed {@link MAX_FFT_BINS}. Checked before the fetch
 * against the resolved window size (after `"all"` has been resolved to the
 * channel's `sample_count`) -- this function never assumes a
 * bins-per-window relation C3 §3.6 does not state; it treats the window
 * size itself as the conservative upper bound on the eventual bin count, so
 * a request this function passes may still (rarely) be refused by a second,
 * exact check on `magnitudes.length` after decode.
 */
export function exceedsBinCap(resolvedWindowSizeSamples: number): boolean {
  return resolvedWindowSizeSamples > MAX_FFT_BINS;
}

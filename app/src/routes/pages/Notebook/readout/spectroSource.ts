/**
 * A fetched spectrogram raster held as a canvas, cut per frame into the
 * strip a `Readout.spectrogram` shows (`spectroSlice.ts` decides which
 * pixels). DOM glue, not unit-tested (CLAUDE.md §4).
 */
import type { DecodedRaster } from "../../../../ipc/rasters";
import { logFrequencyAt, sliceRect, type RasterExtent } from "./spectroSlice";

/** What a spectrogram readout draws for one frame: the slice as an image and where it sits in the strip. */
export interface SpectroImage {
  /** A PNG data URL of the slice. */
  href: string;
  destX: number;
  destW: number;
  fmaxHz: number;
  /** Where the cursor sits across the strip, 0..1. */
  cursorX: number;
  /** The frequency axis drawn, and its bottom (Hz; 0 on a linear axis). */
  scale: "log" | "linear";
  fminHz: number;
}

/** Rows of a log-frequency slice. */
const LOG_ROWS = 96;

/** One raster, sliceable at any cursor time. */
export interface SpectroSource {
  extent: RasterExtent;
  slice(tUs: number, windowS: number, fmaxHz: number, aheadS?: number, log?: { fminHz: number } | null): SpectroImage | null;
}

/** Holds `raster` (covering `extent`) on a canvas for slicing. */
export function makeSpectroSource(raster: DecodedRaster, extent: RasterExtent): SpectroSource {
  const full = document.createElement("canvas");
  full.width = raster.width;
  full.height = raster.height;
  full.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(raster.pixels), raster.width, raster.height), 0, 0);
  const out = document.createElement("canvas");
  return {
    extent,
    slice(tUs, windowS, fmaxHz, aheadS = 0, log = { fminHz: 2 }) {
      const r = sliceRect(extent, tUs, windowS, fmaxHz, aheadS);
      if (r === null) return null;
      const fTop = Math.min(fmaxHz, extent.fHiHz);
      const fmin = log === null ? 0 : Math.max(log.fminHz, extent.fLoHz + 1e-6);
      const isLog = log !== null && fmin < fTop;
      out.width = Math.max(1, Math.round(r.sw));
      out.height = isLog ? LOG_ROWS : Math.max(1, Math.round(r.sh));
      const ctx = out.getContext("2d");
      if (ctx === null) return null;
      ctx.imageSmoothingEnabled = true;
      if (isLog) {
        // One raster row per output row, at that row's frequency on a log axis.
        const rowOf = (f: number) => ((extent.fHiHz - f) / (extent.fHiHz - extent.fLoHz)) * extent.height;
        for (let y = 0; y < LOG_ROWS; y++) {
          const f = logFrequencyAt((y + 0.5) / LOG_ROWS, fmin, fTop);
          const sy = Math.min(extent.height - 1, Math.max(0, Math.floor(rowOf(f))));
          ctx.drawImage(full, r.sx, sy, r.sw, 1, 0, y, out.width, 1);
        }
      } else {
        ctx.drawImage(full, r.sx, r.sy, r.sw, r.sh, 0, 0, out.width, out.height);
      }
      const ahead = Math.max(0, Math.min(aheadS, windowS));
      return { href: out.toDataURL("image/png"), destX: r.destX, destW: r.destW, fmaxHz: fTop, cursorX: 1 - ahead / windowS, scale: isLog ? "log" : "linear", fminHz: isLog ? fmin : 0 };
    },
  };
}

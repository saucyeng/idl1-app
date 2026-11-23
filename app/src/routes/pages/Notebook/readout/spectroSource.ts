/**
 * A fetched spectrogram raster held as a canvas, cut per frame into the
 * strip a `Readout.spectrogram` shows (`spectroSlice.ts` decides which
 * pixels). DOM glue, not unit-tested (CLAUDE.md §4).
 */
import type { DecodedRaster } from "../../../../ipc/rasters";
import { sliceRect, type RasterExtent } from "./spectroSlice";

/** What a spectrogram readout draws for one frame: the slice as an image and where it sits in the strip. */
export interface SpectroImage {
  /** A PNG data URL of the slice. */
  href: string;
  destX: number;
  destW: number;
  fmaxHz: number;
}

/** One raster, sliceable at any cursor time. */
export interface SpectroSource {
  extent: RasterExtent;
  slice(tUs: number, windowS: number, fmaxHz: number): SpectroImage | null;
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
    slice(tUs, windowS, fmaxHz) {
      const r = sliceRect(extent, tUs, windowS, fmaxHz);
      if (r === null) return null;
      out.width = Math.max(1, Math.round(r.sw));
      out.height = Math.max(1, Math.round(r.sh));
      const ctx = out.getContext("2d");
      if (ctx === null) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(full, r.sx, r.sy, r.sw, r.sh, 0, 0, out.width, out.height);
      return { href: out.toDataURL("image/png"), destX: r.destX, destW: r.destW, fmaxHz: Math.min(fmaxHz, extent.fHiHz) };
    },
  };
}

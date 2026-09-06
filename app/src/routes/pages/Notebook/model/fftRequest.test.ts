import { describe, expect, it } from "vitest";

import {
  binFrequencyHz,
  exceedsBinCap,
  fftRequestEquals,
  fftRequestFor,
  frequencyAxisHz,
  MAX_FFT_BINS,
  segmentCount,
  type FftSegmentation,
} from "./fftRequest";

const segmentation: FftSegmentation = {
  windowSize: 1024,
  hopSize: 512,
  window: "hann",
  detrend: "mean",
  scaling: "magnitude",
};

describe("fftRequestFor", () => {
  it("fftRequestFor — averaging none — forces window_size and hop_size to sampleCount", () => {
    const request = fftRequestFor("fork_travel", 4096, segmentation, "none");

    expect(request.params.window_size).toBe(4096);
    expect(request.params.hop_size).toBe(4096);
  });

  it("fftRequestFor — averaging none — ignores segmentation's own window/hop", () => {
    const request = fftRequestFor("fork_travel", 4096, { ...segmentation, windowSize: 64, hopSize: 32 }, "none");

    expect(request.params.window_size).toBe(4096);
    expect(request.params.hop_size).toBe(4096);
  });

  it("fftRequestFor — averaging mean — passes segmentation's window/hop through unmodified", () => {
    const request = fftRequestFor("fork_travel", 4096, segmentation, "mean");

    expect(request.params.window_size).toBe(1024);
    expect(request.params.hop_size).toBe(512);
  });

  it("fftRequestFor — every mode — always sets lap to null", () => {
    const request = fftRequestFor("fork_travel", 4096, segmentation, "median");

    expect(request.lap).toBeNull();
  });

  it("fftRequestFor — every mode — carries window/detrend/scaling and averaging straight through", () => {
    const request = fftRequestFor("fork_travel", 4096, segmentation, "max");

    expect(request.params.window).toBe("hann");
    expect(request.params.detrend).toBe("mean");
    expect(request.params.scaling).toBe("magnitude");
    expect(request.averaging).toBe("max");
    expect(request.channelId).toBe("fork_travel");
  });

  it("fftRequestFor — sampleCount of 0, averaging none — still returns a mechanically consistent request, not a throw", () => {
    const request = fftRequestFor("fork_travel", 0, segmentation, "none");

    expect(request.params.window_size).toBe(0);
    expect(request.params.hop_size).toBe(0);
  });

  it("fftRequestFor — sampleCount of 1, averaging none — forces window/hop to 1", () => {
    const request = fftRequestFor("fork_travel", 1, segmentation, "none");

    expect(request.params.window_size).toBe(1);
    expect(request.params.hop_size).toBe(1);
  });

  it("fftRequestFor — hopSize <= 0 in segmentation, a non-none averaging — passes the value through unmodified", () => {
    const request = fftRequestFor("fork_travel", 4096, { ...segmentation, hopSize: 0 }, "mean");

    expect(request.params.hop_size).toBe(0);
  });

  it("fftRequestFor — windowSize greater than sampleCount, a non-none averaging — passes the value through unmodified", () => {
    const request = fftRequestFor("fork_travel", 100, { ...segmentation, windowSize: 4096 }, "mean");

    expect(request.params.window_size).toBe(4096);
  });
});

describe("segmentCount", () => {
  it("segmentCount — window and hop divide sampleCount exactly — counts every segment", () => {
    const count = segmentCount(4096, 1024, 1024);

    expect(count).toBe(4);
  });

  it("segmentCount — a partial trailing remainder narrower than windowSize — does not count it", () => {
    const count = segmentCount(4500, 1024, 1024);

    expect(count).toBe(4);
  });

  it("segmentCount — overlapping hop smaller than window — counts every overlapping start", () => {
    const count = segmentCount(2048, 1024, 512);

    expect(count).toBe(3);
  });

  it("segmentCount — windowSize equal to sampleCount — counts exactly one segment", () => {
    const count = segmentCount(4096, 4096, 4096);

    expect(count).toBe(1);
  });

  it("segmentCount — windowSize greater than sampleCount — counts zero segments", () => {
    const count = segmentCount(100, 4096, 4096);

    expect(count).toBe(0);
  });

  it("segmentCount — sampleCount of 0 — counts zero segments", () => {
    const count = segmentCount(0, 1024, 1024);

    expect(count).toBe(0);
  });

  it("segmentCount — sampleCount of 1 with matching window/hop of 1 — counts exactly one segment", () => {
    const count = segmentCount(1, 1, 1);

    expect(count).toBe(1);
  });

  it("segmentCount — hopSize of 0 — counts zero segments rather than dividing by zero", () => {
    const count = segmentCount(4096, 1024, 0);

    expect(count).toBe(0);
  });

  it("segmentCount — negative hopSize — counts zero segments", () => {
    const count = segmentCount(4096, 1024, -1);

    expect(count).toBe(0);
  });
});

describe("binFrequencyHz", () => {
  it("binFrequencyHz — bin 0 at any sample rate — is always 0 Hz", () => {
    expect(binFrequencyHz(0, 48000, 1024)).toBe(0);
  });

  it("binFrequencyHz — the last bin of a 1024-bin spectrum at 48000 Hz — is half the sample rate", () => {
    const hz = binFrequencyHz(1024, 48000, 1024);

    expect(hz).toBe(24000);
  });

  it("binFrequencyHz — a mid bin — matches k * sampleRateHz / (2 * binCount) exactly", () => {
    const hz = binFrequencyHz(256, 48000, 1024);

    expect(hz).toBe((256 * 48000) / (2 * 1024));
  });

  it("binFrequencyHz — binCount of 0 — returns 0 rather than dividing by zero", () => {
    expect(binFrequencyHz(0, 48000, 0)).toBe(0);
    expect(Number.isNaN(binFrequencyHz(5, 48000, 0))).toBe(false);
  });
});

describe("frequencyAxisHz", () => {
  it("frequencyAxisHz — a decoded spectrum with 4 bins — builds one Hz entry per bin, ascending from 0", () => {
    const fft = { sampleRateHz: 8000, magnitudes: new Float32Array([1, 2, 3, 4]) };

    const axis = frequencyAxisHz(fft);

    expect(axis).toBeInstanceOf(Float64Array);
    expect(Array.from(axis)).toEqual([0, 1000, 2000, 3000]);
  });

  it("frequencyAxisHz — an empty spectrum — returns an empty Float64Array", () => {
    const fft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };

    const axis = frequencyAxisHz(fft);

    expect(axis.length).toBe(0);
  });
});

describe("fftRequestEquals", () => {
  it("fftRequestEquals — two requests with identical fields — are equal", () => {
    const a = fftRequestFor("fork_travel", 4096, segmentation, "mean");
    const b = fftRequestFor("fork_travel", 4096, segmentation, "mean");

    expect(fftRequestEquals(a, b)).toBe(true);
  });

  it("fftRequestEquals — a different channelId — are not equal", () => {
    const a = fftRequestFor("fork_travel", 4096, segmentation, "mean");
    const b = fftRequestFor("rear_travel", 4096, segmentation, "mean");

    expect(fftRequestEquals(a, b)).toBe(false);
  });

  it("fftRequestEquals — a different window_size — are not equal", () => {
    const a = fftRequestFor("fork_travel", 4096, segmentation, "mean");
    const b = fftRequestFor("fork_travel", 4096, { ...segmentation, windowSize: 2048 }, "mean");

    expect(fftRequestEquals(a, b)).toBe(false);
  });

  it("fftRequestEquals — both null — are equal", () => {
    expect(fftRequestEquals(null, null)).toBe(true);
  });

  it("fftRequestEquals — one null, one not — are not equal", () => {
    const a = fftRequestFor("fork_travel", 4096, segmentation, "mean");

    expect(fftRequestEquals(a, null)).toBe(false);
    expect(fftRequestEquals(null, a)).toBe(false);
  });
});

describe("exceedsBinCap", () => {
  it("exceedsBinCap — exactly at MAX_FFT_BINS — does not exceed", () => {
    expect(exceedsBinCap(MAX_FFT_BINS)).toBe(false);
  });

  it("exceedsBinCap — one under MAX_FFT_BINS — does not exceed", () => {
    expect(exceedsBinCap(MAX_FFT_BINS - 1)).toBe(false);
  });

  it("exceedsBinCap — one over MAX_FFT_BINS — exceeds", () => {
    expect(exceedsBinCap(MAX_FFT_BINS + 1)).toBe(true);
  });

  it("exceedsBinCap — a small window far under the cap — does not exceed", () => {
    expect(exceedsBinCap(1024)).toBe(false);
  });
});

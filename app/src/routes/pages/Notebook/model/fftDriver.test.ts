import { describe, expect, it, vi } from "vitest";

import type { DecodedFft } from "../../../../ipc/rasters";
import { runFft, type FftAction, type FftDeps } from "./fftDriver";
import { fftRequestFor, type FftSegmentation } from "./fftRequest";

const segmentation: FftSegmentation = {
  windowSize: 1024,
  hopSize: 1024,
  window: "hann",
  detrend: "mean",
  scaling: "magnitude",
};

const request = fftRequestFor("fork_travel", 4096, segmentation, "none");

function recordingDispatch(): { actions: FftAction[]; dispatch: (a: FftAction) => void } {
  const actions: FftAction[] = [];
  return { actions, dispatch: (a) => actions.push(a) };
}

describe("runFft", () => {
  it("runFft — fetchFft resolves — dispatches exactly one spectrum action", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([1, 2, 3]) };
    const deps: FftDeps = { fetchFft: vi.fn().mockResolvedValue(fft) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "s1", "cell-a", request, dispatch, () => false);

    expect(actions).toEqual([{ type: "spectrum", cellId: "cell-a", fft }]);
  });

  it("runFft — fetchFft is called with the request's channel, lap, params, and averaging", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const fetchFft = vi.fn().mockResolvedValue(fft);
    const { dispatch } = recordingDispatch();

    await runFft({ fetchFft }, "s1", "cell-a", request, dispatch, () => false);

    expect(fetchFft).toHaveBeenCalledWith("s1", "fork_travel", null, request.params, "none");
  });

  it("runFft — fetchFft rejects with a typed IpcError — dispatches exactly one fftError with it intact", async () => {
    const error = { kind: "invalid_argument", message: "too many segments", detail: { segments: 3 } };
    const deps: FftDeps = { fetchFft: vi.fn().mockRejectedValue(error) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "s1", "cell-a", request, dispatch, () => false);

    expect(actions).toEqual([{ type: "fftError", cellId: "cell-a", error }]);
  });

  it("runFft — fetchFft rejects with an untyped Error — dispatches an internal-kind fftError", async () => {
    const deps: FftDeps = { fetchFft: vi.fn().mockRejectedValue(new Error("network down")) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "s1", "cell-a", request, dispatch, () => false);

    expect(actions).toEqual([{ type: "fftError", cellId: "cell-a", error: { kind: "internal", message: "network down" } }]);
  });

  it("runFft — stale after the await, on a resolved fetch — dispatches nothing", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const deps: FftDeps = { fetchFft: vi.fn().mockResolvedValue(fft) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "s1", "cell-a", request, dispatch, () => true);

    expect(actions).toEqual([]);
  });

  it("runFft — stale after the await, on a rejected fetch — dispatches nothing", async () => {
    const deps: FftDeps = { fetchFft: vi.fn().mockRejectedValue({ kind: "invalid_argument", message: "boom" }) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "s1", "cell-a", request, dispatch, () => true);

    expect(actions).toEqual([]);
  });
});

import { describe, expect, it, vi } from "vitest";

import type { DecodedFft } from "../../../../ipc/rasters";
import type { Window as SelectedWindow } from "../../../../ipc/workbook";
import { runFft, type FftAction, type FftDeps } from "./fftDriver";
import { fftRequestFor, type FftSegmentation } from "./fftRequest";

const segmentation: FftSegmentation = {
  windowSize: 1024,
  hopSize: 1024,
  window: "hann",
  detrend: "mean",
  scaling: "magnitude",
};

function selectedWindow(span: SelectedWindow["span"]): SelectedWindow {
  return { session_id: "session-a", span, colour: "--chart-1" };
}

const lapRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", selectedWindow({ kind: "lap", lap_number: 3 }));
const sessionRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", selectedWindow({ kind: "session" }));
const rangeRequest = fftRequestFor(
  "fork_travel",
  4096,
  segmentation,
  "none",
  selectedWindow({ kind: "range", t0_us: 0, t1_us: 10_000_000 })
);
const noWindowRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", null);

function recordingDispatch(): { actions: FftAction[]; dispatch: (a: FftAction) => void } {
  const actions: FftAction[] = [];
  return { actions, dispatch: (a) => actions.push(a) };
}

describe("runFft", () => {
  it("runFft — fetchFftV2 resolves — dispatches exactly one spectrum action carrying its window", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([1, 2, 3]) };
    const deps: FftDeps = { fetchFftV2: vi.fn().mockResolvedValue(fft) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "cell-a", lapRequest, dispatch, () => false);

    expect(actions).toEqual([{ type: "spectrum", cellId: "cell-a", window: lapRequest.window, fft }]);
  });

  it("runFft — fetchFftV2 is called with the window, channel, params and averaging (no session id -- the window carries it)", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const fetchFftV2 = vi.fn().mockResolvedValue(fft);
    const { dispatch } = recordingDispatch();

    await runFft({ fetchFftV2 }, "cell-a", lapRequest, dispatch, () => false);

    expect(fetchFftV2).toHaveBeenCalledWith(lapRequest.window, "fork_travel", lapRequest.params, "none");
  });

  it("runFft — a session-windowed request — fetches over the whole-channel window (ruling R117, replaces the old lap:null convention)", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const fetchFftV2 = vi.fn().mockResolvedValue(fft);
    const { dispatch } = recordingDispatch();

    await runFft({ fetchFftV2 }, "cell-a", sessionRequest, dispatch, () => false);

    expect(fetchFftV2).toHaveBeenCalledWith(sessionRequest.window, "fork_travel", sessionRequest.params, "none");
  });

  it("runFft — a range-windowed request — fetches it directly, no shim, no widening (ruling R129: must work by this task)", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const fetchFftV2 = vi.fn().mockResolvedValue(fft);
    const { actions, dispatch } = recordingDispatch();

    await runFft({ fetchFftV2 }, "cell-a", rangeRequest, dispatch, () => false);

    expect(fetchFftV2).toHaveBeenCalledWith(rangeRequest.window, "fork_travel", rangeRequest.params, "none");
    expect(actions).toEqual([{ type: "spectrum", cellId: "cell-a", window: rangeRequest.window, fft }]);
  });

  it("runFft — request.window is null — dispatches nothing and never calls fetchFftV2", async () => {
    const fetchFftV2 = vi.fn();
    const { actions, dispatch } = recordingDispatch();

    await runFft({ fetchFftV2 }, "cell-a", noWindowRequest, dispatch, () => false);

    expect(fetchFftV2).not.toHaveBeenCalled();
    expect(actions).toEqual([]);
  });

  it("runFft — fetchFftV2 rejects with a typed IpcError — dispatches exactly one fftError with it intact, carrying the window", async () => {
    const error = { kind: "invalid_argument", message: "too many segments", detail: { segments: 3 } };
    const deps: FftDeps = { fetchFftV2: vi.fn().mockRejectedValue(error) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "cell-a", lapRequest, dispatch, () => false);

    expect(actions).toEqual([{ type: "fftError", cellId: "cell-a", window: lapRequest.window, error }]);
  });

  it("runFft — fetchFftV2 rejects with an untyped Error — dispatches an internal-kind fftError", async () => {
    const deps: FftDeps = { fetchFftV2: vi.fn().mockRejectedValue(new Error("network down")) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "cell-a", lapRequest, dispatch, () => false);

    expect(actions).toEqual([{ type: "fftError", cellId: "cell-a", window: lapRequest.window, error: { kind: "internal", message: "network down" } }]);
  });

  it("runFft — stale after the await, on a resolved fetch — dispatches nothing", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const deps: FftDeps = { fetchFftV2: vi.fn().mockResolvedValue(fft) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "cell-a", lapRequest, dispatch, () => true);

    expect(actions).toEqual([]);
  });

  it("runFft — stale after the await, on a rejected fetch — dispatches nothing", async () => {
    const deps: FftDeps = { fetchFftV2: vi.fn().mockRejectedValue({ kind: "invalid_argument", message: "boom" }) };
    const { actions, dispatch } = recordingDispatch();

    await runFft(deps, "cell-a", lapRequest, dispatch, () => true);

    expect(actions).toEqual([]);
  });
});

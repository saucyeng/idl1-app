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

const request = fftRequestFor("fork_travel", 4096, segmentation, "none");

function selectedWindow(span: SelectedWindow["span"]): SelectedWindow {
  return { session_id: "session-a", span, colour: "--chart-1" };
}

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

  it("runFft — a lap-windowed request — calls fetchFft with that lap number (ruling R129, an interim shim may narrow scope)", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const fetchFft = vi.fn().mockResolvedValue(fft);
    const { dispatch } = recordingDispatch();
    const lapRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", selectedWindow({ kind: "lap", lap_number: 3 }));

    await runFft({ fetchFft }, "s1", "cell-a", lapRequest, dispatch, () => false);

    expect(fetchFft).toHaveBeenCalledWith("s1", "fork_travel", 3, lapRequest.params, "none");
  });

  it("runFft — a session-windowed request — calls fetchFft with lap null (whole channel, correct by the span's own meaning)", async () => {
    const fft: DecodedFft = { sampleRateHz: 8000, magnitudes: new Float32Array([]) };
    const fetchFft = vi.fn().mockResolvedValue(fft);
    const { dispatch } = recordingDispatch();
    const sessionRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", selectedWindow({ kind: "session" }));

    await runFft({ fetchFft }, "s1", "cell-a", sessionRequest, dispatch, () => false);

    expect(fetchFft).toHaveBeenCalledWith("s1", "fork_travel", null, sessionRequest.params, "none");
  });

  it("runFft — a range-windowed request — dispatches a typed fftError and never calls fetchFft (ruling R129: an interim shim may not silently widen a range to the whole session)", async () => {
    const fetchFft = vi.fn();
    const { actions, dispatch } = recordingDispatch();
    const rangeRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", selectedWindow({ kind: "range", t0_us: 0, t1_us: 10_000_000 }));

    await runFft({ fetchFft }, "s1", "cell-a", rangeRequest, dispatch, () => false);

    expect(fetchFft).not.toHaveBeenCalled();
    expect(actions).toEqual([
      {
        type: "fftError",
        cellId: "cell-a",
        error: {
          kind: "unsupported_window",
          message: "An FFT over a dragged range is not yet supported here — select a lap or the whole session instead.",
        },
      },
    ]);
  });

  it("runFft — a range-windowed request, stale after the (synchronous) check — dispatches nothing", async () => {
    const fetchFft = vi.fn();
    const { actions, dispatch } = recordingDispatch();
    const rangeRequest = fftRequestFor("fork_travel", 4096, segmentation, "none", selectedWindow({ kind: "range", t0_us: 0, t1_us: 10_000_000 }));

    await runFft({ fetchFft }, "s1", "cell-a", rangeRequest, dispatch, () => true);

    expect(fetchFft).not.toHaveBeenCalled();
    expect(actions).toEqual([]);
  });
});

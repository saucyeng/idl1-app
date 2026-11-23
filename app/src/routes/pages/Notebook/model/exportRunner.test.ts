import { describe, expect, it, vi } from "vitest";

import { runOverlayExport, type ExportDeps, type ExportJob } from "./exportRunner";

const PLAN = { startS: 10, clipFromS: 2, durationS: 3 / 24, frames: 3, fps: 24, width: 640, height: 480, videoBox: { x: 0, y: 0, w: 640, h: 480 } };

function job(over: Partial<ExportJob> = {}): ExportJob {
  return { plan: PLAN, videoSha256: "ab", quality: "draft", outPath: "C:/o.mp4", ffmpeg: null, names: ["GPS_SpeedKmh"], tailS: 0, display: { distance: "km", temperature: "C" }, ...over };
}

function deps(): ExportDeps & { pushed: number[]; reads: number[] } {
  const pushed: number[] = [];
  const reads: number[] = [];
  return {
    pushed,
    reads,
    openReadout: vi.fn(async () => ({ handle: 5, units: { GPS_SpeedKmh: "km/h" }, extent: { GPS_SpeedKmh: [0, 40] as [number, number] } })),
    readReadout: vi.fn(async (_h: number, tUs: number) => {
      reads.push(tUs);
      return { t_us: tUs, values: { GPS_SpeedKmh: 20 } };
    }),
    closeReadout: vi.fn(async () => undefined),
    start: vi.fn(async () => 9),
    push: vi.fn(async (_id: number, png: Uint8Array) => {
      pushed.push(png[0]);
    }),
    finish: vi.fn(async () => ({ path: "C:/o.mp4", bytes: 100, seconds: 1 })),
    cancel: vi.fn(async () => true),
    render: vi.fn(async (frame) => new Uint8Array([frame.values.GPS_SpeedKmh as number])),
  };
}

describe("runOverlayExport", () => {
  it("runOverlayExport — three frames — read at each frame's time, pushed, finished, handle closed", async () => {
    const d = deps();
    const progress: number[] = [];

    const outcome = await runOverlayExport(d, job(), (done) => progress.push(done), () => false);

    expect(outcome.kind).toBe("done");
    expect(d.reads).toEqual([10_000_000, Math.round((10 + 1 / 24) * 1e6), Math.round((10 + 2 / 24) * 1e6)]);
    expect(d.pushed).toEqual([20, 20, 20]);
    expect(progress).toEqual([1, 2, 3]);
    expect(d.closeReadout).toHaveBeenCalledWith(5);
    expect(d.start).toHaveBeenCalledWith(expect.objectContaining({ clip_from_s: 2, width: 640, quality: "draft" }));
  });

  it("runOverlayExport — cancelled after the first frame — ffmpeg cancelled, not finished", async () => {
    const d = deps();
    let calls = 0;

    const outcome = await runOverlayExport(d, job(), () => {}, () => calls++ >= 1);

    expect(outcome.kind).toBe("cancelled");
    expect(d.cancel).toHaveBeenCalledWith(9);
    expect(d.finish).not.toHaveBeenCalled();
  });

  it("runOverlayExport — a push fails — ffmpeg cancelled, the error rethrown, handle closed", async () => {
    const d = deps();
    d.push = vi.fn(async () => {
      throw new Error("pipe closed");
    });

    await expect(runOverlayExport(d, job(), () => {}, () => false)).rejects.toThrow("pipe closed");

    expect(d.cancel).toHaveBeenCalledWith(9);
    expect(d.closeReadout).toHaveBeenCalledWith(5);
  });

  it("runOverlayExport — a g-g tail of 2 s at 24 fps — 48 points a frame apart", async () => {
    const d = deps();

    await runOverlayExport(d, job({ tailS: 2 }), () => {}, () => false);

    expect(d.readReadout).toHaveBeenCalledWith(5, 10_000_000, { count: 48, step_us: 41_667 });
  });
});

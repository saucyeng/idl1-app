import { describe, expect, it } from "vitest";

import { even, exportPlan, frameTimeUs, presetLayout, presetSize } from "./overlayPlan";

const READOUTS = [
  { id: "8e4a0020", kind: "gauge" as const },
  { id: "8e4a0021", kind: "gg" as const },
  { id: "8e4a0022", kind: "number" as const },
  { id: "8e4a0023", kind: "number" as const },
];
const LINK = { offset_s: 3686.229, duration_s: 103.895, fps: 23.976, width_px: 2704, height_px: 2028 };
const LAP = { startS: 3693.332, endS: 3782.355 };

function inside(b: { x: number; y: number; w: number; h: number }): boolean {
  return b.x >= 0 && b.y >= 0 && b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001 && b.w > 0 && b.h > 0;
}

describe("presetLayout", () => {
  it("presetLayout — every preset — every readout and the video placed inside the frame", () => {
    for (const preset of ["classic", "side", "reel"] as const) {
      const layout = presetLayout(preset, "8e4a0001", READOUTS, 4 / 3);

      expect(Object.keys(layout.cells).sort()).toEqual(["8e4a0001", "8e4a0020", "8e4a0021", "8e4a0022", "8e4a0023"]);
      for (const box of Object.values(layout.cells)) expect(inside(box)).toBe(true);
    }
  });

  it("presetLayout — classic on a 4:3 clip — 4:3 frame, video full frame under the readouts", () => {
    const layout = presetLayout("classic", "8e4a0001", READOUTS, 4 / 3);

    expect(layout.size).toBe("4:3");
    expect(layout.cells["8e4a0001"]).toEqual({ x: 0, y: 0, w: 1, h: 1, z: 0 });
    expect(layout.cells["8e4a0020"].z).toBe(1);
  });

  it("presetLayout — reel on a 4:3 clip — the clip full width at the top, 0.42 of the height", () => {
    const layout = presetLayout("reel", "8e4a0001", READOUTS, 4 / 3);

    expect(layout.size).toBe("9:16");
    expect(layout.cells["8e4a0001"].w).toBe(1);
    expect(layout.cells["8e4a0001"].h).toBeCloseTo(9 / 16 / (4 / 3));
  });

  it("presetSize — a 16:9 clip in classic — 16:9", () => {
    expect(presetSize("classic", 16 / 9)).toBe("16:9");
  });
});

describe("exportPlan", () => {
  it("exportPlan — lap inside the clip, full — the lap, at clip resolution", () => {
    const layout = presetLayout("classic", "8e4a0001", READOUTS, 4 / 3);

    const plan = exportPlan(layout, "8e4a0001", LINK, LAP, "full");

    expect(plan).not.toBeNull();
    expect(plan!.startS).toBeCloseTo(3693.332);
    expect(plan!.clipFromS).toBeCloseTo(7.103);
    expect(plan!.frames).toBe(Math.floor((3782.355 - 3693.332) * 23.976));
    expect([plan!.width, plan!.height]).toEqual([2704, 2028]);
    expect(plan!.videoBox).toEqual({ x: 0, y: 0, w: 2704, h: 2028 });
  });

  it("exportPlan — draft — at most 960 tall, even sizes", () => {
    const layout = presetLayout("classic", "8e4a0001", READOUTS, 4 / 3);

    const plan = exportPlan(layout, "8e4a0001", LINK, LAP, "draft")!;

    expect([plan.width, plan.height]).toEqual([1280, 960]);
  });

  it("exportPlan — a reel — tall frame, the clip's box at its own width", () => {
    const layout = presetLayout("reel", "8e4a0001", READOUTS, 4 / 3);

    const plan = exportPlan(layout, "8e4a0001", LINK, LAP, "full")!;

    expect(plan.videoBox.w).toBe(plan.width);
    expect(plan.width % 2 + plan.height % 2).toBe(0);
    expect(plan.height).toBeGreaterThan(plan.width);
  });

  it("exportPlan — a window the clip does not cover — null", () => {
    const layout = presetLayout("classic", "8e4a0001", READOUTS, 4 / 3);

    expect(exportPlan(layout, "8e4a0001", LINK, { startS: 100, endS: 200 }, "full")).toBeNull();
  });
});

describe("frameTimeUs / even", () => {
  it("frameTimeUs — frame 24 at 23.976 — just over a second after the start", () => {
    expect(frameTimeUs({ startS: 10, fps: 23.976 }, 24)).toBe(Math.round((10 + 24 / 23.976) * 1e6));
    expect(even(1013)).toBe(1014);
    expect(even(0)).toBe(2);
  });
});

describe("presetLayout — classic with three dials", () => {
  it("presetLayout — classic, a third dial — no two readout boxes overlap", () => {
    const readouts = [...READOUTS, { id: "8e4a0024", kind: "gauge" as const }];

    const layout = presetLayout("classic", "8e4a0001", readouts, 4 / 3);

    const boxes = Object.entries(layout.cells).filter(([id]) => id !== "8e4a0001").map(([, b]) => b);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
  });
});

describe("presetLayout — side and reel with traces", () => {
  const ALL = [
    { id: "8e4a0020", kind: "gauge" as const },
    { id: "8e4a0021", kind: "gg" as const },
    { id: "8e4a0022", kind: "number" as const },
    { id: "8e4a0023", kind: "number" as const },
    { id: "8e4a0024", kind: "gauge" as const },
    { id: "8e4a0025", kind: "trace" as const },
    { id: "8e4a0026", kind: "trace" as const },
  ];
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;

  it("presetLayout — every preset with traces — readouts inside the frame, none overlapping another", () => {
    for (const preset of ["classic", "side", "reel"] as const) {
      const layout = presetLayout(preset, "8e4a0001", ALL, 4 / 3);
      const boxes = ALL.map((r) => layout.cells[r.id]);

      for (const b of boxes) expect(inside(b)).toBe(true);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
    }
  });

  it("presetLayout — side — the clip centred, readouts on both sides and none over the footage", () => {
    const layout = presetLayout("side", "8e4a0001", ALL, 4 / 3);
    const video = layout.cells["8e4a0001"];

    expect(video.x).toBeCloseTo((1 - 0.75) / 2);
    const boxes = ALL.map((r) => layout.cells[r.id]);
    expect(boxes.some((b) => b.x + b.w <= video.x)).toBe(true);
    expect(boxes.some((b) => b.x >= video.x + video.w)).toBe(true);
    for (const b of boxes) expect(overlaps(b, video)).toBe(false);
  });

  it("presetLayout — reel — the clip centred, readouts above and below and none over the footage", () => {
    const layout = presetLayout("reel", "8e4a0001", ALL, 4 / 3);
    const video = layout.cells["8e4a0001"];

    const boxes = ALL.map((r) => layout.cells[r.id]);
    expect(boxes.some((b) => b.y + b.h <= video.y)).toBe(true);
    expect(boxes.some((b) => b.y >= video.y + video.h)).toBe(true);
    for (const b of boxes) expect(overlaps(b, video)).toBe(false);
  });
});

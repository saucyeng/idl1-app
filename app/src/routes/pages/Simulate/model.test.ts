import { describe, expect, it } from "vitest";

import type { SetupPx, SimRun } from "@/ipc/simulate";

import { groupColour, hitPoint, movePoint, newRoller, newSurface, nextMissing, parseCassette, playbackFrame, polyPoints, POINTS, runFrame } from "./model";

function run(): SimRun {
  // 3 frames, 2 nodes, 2 points (a wheel centre and a surface point), 1 wheel, 1 channel
  return {
    frames: 3,
    nodes: 2,
    gear: 0,
    points: ["wheel:cog", "surface:0:0"],
    wheels: [{ role: "cog", radius_m: 0.04, teeth: 21 }],
    channels: [{ name: "Cage angle", unit: "deg", values: new Float32Array([1, 2, 3]) }],
    summary: { impacts: 0, max_impact_mps: 0, clutch_slip_deg: 0, max_top_tension_n: 0, max_pedal_force_n: 0, max_top_deflection_mm: 0, max_lower_deflection_mm: 0, max_link_error_mm: 0 },
    frame: { rear_axle_px: [0, 0], front_axle_px: [100, 0], wheelbase_m: 1 },
    input: { speed_mps: 6, depth_m: 0.1, sag_m: 0.04, compress_s: 0.06, rebound_s: 0.1, chassis_g: 2, count: 1, spacing_s: 0.3, lead_s: 0.1 },
    nodeXy: new Float32Array([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]),
    pointXy: new Float32Array([0, 0, 9, 9, 1, 1, 8, 8, 2, 2, 7, 7]),
    wheelAngle: new Float32Array([0.1, 0.2, 0.3]),
    frameT: new Float32Array([0, 0.5, 1]),
  };
}

describe("Simulate model", () => {
  it("nextMissing — axles placed — asks for the main pivot next and skips optional points", () => {
    // Arrange
    const points = { rear_axle: [0, 0] as [number, number], front_axle: [10, 0] as [number, number] };

    // Act
    const next = nextMissing(points);
    const all = nextMissing(Object.fromEntries(POINTS.filter((p) => !p.optional).map((p) => [p.key, [0, 0]])));

    // Assert
    expect(next?.key).toBe("main_pivot");
    expect(all).toBeNull();
  });

  it("hitPoint — a click near one point — finds the nearest within the radius and nothing outside it", () => {
    // Arrange
    const points = { a: [0, 0] as [number, number], b: [5, 0] as [number, number] };

    // Act / Assert
    expect(hitPoint(points, [4, 0], 3)).toBe("b");
    expect(hitPoint(points, [20, 20], 3)).toBeNull();
  });

  it("movePoint — a moved point — returns a new setup and leaves the old one", () => {
    // Arrange
    const setup = { points: { a: [0, 0] } } as unknown as SetupPx;

    // Act
    const moved = movePoint(setup, "a", [3, 4]);

    // Assert
    expect(moved.points.a).toEqual([3, 4]);
    expect(setup.points.a).toEqual([0, 0]);
  });

  it("newRoller and newSurface — defaults — a 16T top roller on the chainstay and a lifted three-point surface", () => {
    // Arrange / Act
    const top = newRoller([1, 2], "top", 0);
    const lower = newRoller([1, 2], "lower", 1);
    const s = newSurface([0, 100], [100, 100], 10, "chainstay");

    // Assert
    expect(top).toMatchObject({ teeth: 16, body: "chainstay", span: "top", side: "under", name: "Top roller" });
    expect(lower).toMatchObject({ teeth: null, span: "lower", side: "over", name: "Lower guide 2" });
    expect(s.polyline_px).toEqual([[0, 90], [50, 90], [100, 90]]);
  });

  it("parseCassette — a list — sorts it and rejects nonsense", () => {
    // Arrange / Act / Assert
    expect(parseCassette("52, 10 12")).toEqual([10, 12, 52]);
    expect(parseCassette("10, x")).toBeNull();
    expect(parseCassette("")).toBeNull();
    expect(parseCassette("4")).toBeNull();
  });

  it("runFrame — a frame — unpacks nodes, points, wheels, surfaces and values", () => {
    // Arrange
    const r = run();

    // Act
    const f = runFrame(r, 1);

    // Assert
    expect(f.nodes).toEqual([[2, 2], [3, 3]]);
    expect(f.wheels[0]).toMatchObject({ role: "cog", centre: [1, 1], teeth: 21 });
    expect(f.wheels[0].angle).toBeCloseTo(0.2);
    expect(f.surfaces).toEqual([[[8, 8]]]);
    expect(f.values["Cage angle"]).toBe(2);
    expect(runFrame(r, 99).t).toBe(1);
  });

  it("playbackFrame — real time and slow motion — advances by the frame rate and wraps", () => {
    // Arrange: 3 frames over 1 s is 2 frames per second
    const r = run();

    // Act / Assert
    expect(playbackFrame(r, 0, 0.5, 1)).toBeCloseTo(1);
    expect(playbackFrame(r, 0, 0.5, 0.25)).toBeCloseTo(0.25);
    expect(playbackFrame(r, 2, 0.5, 1)).toBeCloseTo(0);
  });

  it("polyPoints and groupColour — formatting — map points and give every group a token", () => {
    // Arrange / Act / Assert
    expect(polyPoints([[1, 2], [3, 4]], (p) => [p[0] * 2, p[1]])).toBe("2.0,2.0 6.0,4.0");
    for (const p of POINTS) expect(groupColour(p.group)).toMatch(/^var\(--/);
  });
});

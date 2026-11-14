import { describe, expect, it } from "vitest";

import { isVideoPath, planVideoDrop } from "./videoDrop";

const time = (ms: number) => String(ms);

describe("isVideoPath", () => {
  it("isVideoPath — mp4 in either case — true; a log — false", () => {
    expect(isVideoPath("C:\\GoPro\\GX010123.MP4")).toBe(true);
    expect(isVideoPath("/clips/run.mp4")).toBe(true);
    expect(isVideoPath("C:\\logs\\ride.idl0")).toBe(false);
  });
});

describe("planVideoDrop", () => {
  it("planVideoDrop — one, several and no overlapping rides — link, choose and failed", () => {
    const matches = [
      { path: "C:\\a.mp4", session_ids: ["s1"], error: null },
      { path: "C:\\b.mp4", session_ids: ["s1", "s2"], error: null },
      { path: "C:\\c.mp4", session_ids: [], error: null },
    ];

    const plan = planVideoDrop(matches, time);

    expect(plan.link).toEqual([{ path: "C:\\a.mp4", sessionId: "s1" }]);
    expect(plan.choose).toEqual([{ path: "C:\\b.mp4", sessionIds: ["s1", "s2"] }]);
    expect(plan.failed).toEqual(["c.mp4: its recording time overlaps no ride in the library."]);
  });

  it("planVideoDrop — an unreadable file — failed with its file name", () => {
    const matches = [{ path: "/x/bad.mp4", session_ids: [], error: { kind: "io" as const, message: "boom" } }];

    const plan = planVideoDrop(matches, time);

    expect(plan.link).toEqual([]);
    expect(plan.failed[0]).toContain("bad.mp4");
  });
});

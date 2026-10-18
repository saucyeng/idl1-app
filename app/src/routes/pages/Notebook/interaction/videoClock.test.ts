import { describe, expect, it } from "vitest";

import type { SessionVideo } from "../../../../ipc/video";
import type { ScannedCell } from "../model/cells";
import type { VideoAtTime } from "../model/videoSpan";
import { clockSourceFor, cursorSessionUs, masterVideoCellId, mediaTimeToSessionUs, sameClockSource, seekFor, sessionUsToS } from "./videoClock";

function cell(kind: ScannedCell["kind"], id: string | null): ScannedCell {
  return { id, idRaw: id, kind, infoLine: kind, bodyRange: [0, 0], proseBeforeRange: null, proseAfterRange: null };
}

const link: SessionVideo = {
  blob_sha256: "a".repeat(64),
  size_bytes: 1,
  file_name: "GX010001.MP4",
  video_codec: "h264",
  width_px: 1920,
  height_px: 1080,
  fps: 30,
  duration_s: 100,
  offset_s: 10,
  sync_method: "gpmf",
  updated_at_ms: 0,
  on_device: true,
};

const atVideo: VideoAtTime = { kind: "video", link, videoTimeS: 5 };

describe("masterVideoCellId", () => {
  it("several video cells among others — the first video cell with an id, in document order", () => {
    // Arrange
    const cells = [cell("js", "11111111"), cell("video", null), cell("video", "22222222"), cell("video", "33333333")];

    // Act
    const id = masterVideoCellId(cells);

    // Assert
    expect(id).toBe("22222222");
  });

  it("no video cell — null", () => {
    // Arrange
    const cells = [cell("math", "11111111")];

    // Act
    const id = masterVideoCellId(cells);

    // Assert
    expect(id).toBeNull();
  });
});

describe("clockSourceFor", () => {
  it("playing with playable video at the cursor and a master cell — the video clock", () => {
    // Arrange
    const playing = true;

    // Act
    const source = clockSourceFor(playing, "22222222", atVideo);

    // Assert
    expect(source).toEqual({ kind: "video", cellId: "22222222", blobSha256: link.blob_sha256 });
  });

  it("paused, no video cell, gap, none, not on device — the rAF clock", () => {
    // Arrange
    const cases: [boolean, string | null, VideoAtTime][] = [
      [false, "22222222", atVideo],
      [true, null, atVideo],
      [true, "22222222", { kind: "gap" }],
      [true, "22222222", { kind: "none" }],
      [true, "22222222", { kind: "not-on-device", link: { ...link, on_device: false } }],
    ];

    // Act
    const kinds = cases.map(([playing, master, at]) => clockSourceFor(playing, master, at).kind);

    // Assert
    expect(kinds).toEqual(["raf", "raf", "raf", "raf", "raf"]);
  });

  it("sameClockSource — raf/raf, same video, another chapter, raf/video — true, true, false, false", () => {
    // Arrange
    const video = { kind: "video" as const, cellId: "c", blobSha256: "a" };

    // Act
    const results = [
      sameClockSource({ kind: "raf" }, { kind: "raf" }),
      sameClockSource(video, { ...video }),
      sameClockSource(video, { ...video, blobSha256: "b" }),
      sameClockSource({ kind: "raf" }, video),
    ];

    // Assert
    expect(results).toEqual([true, true, false, false]);
  });
});

describe("time conversions", () => {
  it("mediaTimeToSessionUs — media 5.0333 s, offset 10 s — 15 033 300 µs", () => {
    // Arrange
    const mediaTimeS = 5.0333;

    // Act
    const us = mediaTimeToSessionUs(mediaTimeS, 10);

    // Assert
    expect(us).toBe(15_033_300n);
  });

  it("sessionUsToS — bigint and number µs — seconds", () => {
    // Arrange
    const tUs = 15_500_000n;

    // Act
    const results = [sessionUsToS(tUs), sessionUsToS(250_000)];

    // Assert
    expect(results).toEqual([15.5, 0.25]);
  });

  it("cursorSessionUs — a window-elapsed offset in a lap starting at 120 s — session µs; null without cursor or window", () => {
    // Arrange
    const lap = { startUs: 120_000_000, endUs: 180_000_000 };

    // Act
    const results = [cursorSessionUs(5_000_000, lap), cursorSessionUs(null, lap), cursorSessionUs(5_000_000, null), cursorSessionUs(70_000_000, lap)];

    // Assert
    expect(results).toEqual([125_000_000, null, null, null]);
  });
});

describe("seekFor", () => {
  it("paused — pin exact, drag fast, settle exact, hover none", () => {
    // Arrange
    const triggers = ["pin", "drag", "settle", "hover"] as const;

    // Act
    const results = triggers.map((t) => seekFor(t, false, atVideo));

    // Assert
    expect(results).toEqual([{ mode: "exact", videoTimeS: 5 }, { mode: "fast", videoTimeS: 5 }, { mode: "exact", videoTimeS: 5 }, null]);
  });

  it("playing, or no playable video at the cursor — no seek", () => {
    // Arrange
    const gap: VideoAtTime = { kind: "gap" };

    // Act
    const results = [seekFor("pin", true, atVideo), seekFor("pin", false, gap), seekFor("drag", false, { kind: "none" })];

    // Assert
    expect(results).toEqual([null, null, null]);
  });
});

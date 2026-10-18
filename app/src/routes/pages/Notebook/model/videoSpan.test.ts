import { describe, expect, it } from "vitest";

import type { SessionVideo } from "../../../../ipc/video";
import {
  alignedOffsetS,
  deleteFileByDefault,
  formatVideoSize,
  linkErrorText,
  linkProgressText,
  nudgedOffsetS,
  playbackErrorText,
  sessionTimeOf,
  steppedVideoTimeS,
  videoAspect,
  videoAtSessionTime,
  videoSessionSpan,
  videoTimeOf,
} from "./videoSpan";

function video(overrides: Partial<SessionVideo> = {}): SessionVideo {
  return {
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
    other_links: 0,
    ...overrides,
  };
}

describe("videoSessionSpan / sessionTimeOf / videoTimeOf", () => {
  it("offset 10 s, duration 100 s — span [10, 110) and the two conversions invert each other", () => {
    // Arrange
    const link = video();

    // Act
    const span = videoSessionSpan(link);
    const session = sessionTimeOf(link, 5);
    const back = videoTimeOf(link, session);

    // Assert
    expect(span).toEqual({ startS: 10, endS: 110 });
    expect(session).toBe(15);
    expect(back).toBe(5);
  });
});

describe("videoAtSessionTime", () => {
  it("no videos — none (the Add video state)", () => {
    // Arrange
    const videos: SessionVideo[] = [];

    // Act
    const result = videoAtSessionTime(videos, 20);

    // Assert
    expect(result).toEqual({ kind: "none" });
  });

  it("cursor inside a chapter — that chapter at video time = session time − offset", () => {
    // Arrange
    const first = video({ blob_sha256: "1".repeat(64) });

    // Act
    const result = videoAtSessionTime([first], 25);

    // Assert
    expect(result).toEqual({ kind: "video", link: first, videoTimeS: 15 });
  });

  it("cursor in a gap between chapters, before the footage, and with no cursor — gap", () => {
    // Arrange
    const videos = [video({ offset_s: 10, duration_s: 10 }), video({ blob_sha256: "b".repeat(64), offset_s: 30, duration_s: 10 })];

    // Act
    const results = [videoAtSessionTime(videos, 25), videoAtSessionTime(videos, 5), videoAtSessionTime(videos, null)];

    // Assert
    expect(results.map((r) => r.kind)).toEqual(["gap", "gap", "gap"]);
  });

  it("cursor exactly at a chapter boundary — the later chapter (half-open spans)", () => {
    // Arrange
    const first = video({ blob_sha256: "1".repeat(64), offset_s: 0, duration_s: 10 });
    const second = video({ blob_sha256: "2".repeat(64), offset_s: 10, duration_s: 10 });

    // Act
    const result = videoAtSessionTime([first, second], 10);

    // Assert
    expect(result).toEqual({ kind: "video", link: second, videoTimeS: 0 });
  });

  it("covering entry not on this device — not-on-device", () => {
    // Arrange
    const link = video({ on_device: false });

    // Act
    const result = videoAtSessionTime([link], 20);

    // Assert
    expect(result).toEqual({ kind: "not-on-device", link });
  });

  it("overlapping entries — the first in session.json order wins; unlinked tombstones are skipped", () => {
    // Arrange
    const tomb = video({ blob_sha256: "0".repeat(64), unlinked: true });
    const first = video({ blob_sha256: "1".repeat(64) });
    const second = video({ blob_sha256: "2".repeat(64) });

    // Act
    const result = videoAtSessionTime([tomb, first, second], 20);
    const onlyTomb = videoAtSessionTime([tomb], 20);

    // Assert
    expect(result).toMatchObject({ kind: "video", link: first });
    expect(onlyTomb).toEqual({ kind: "none" });
  });
});

describe("offset maths", () => {
  it("alignedOffsetS — cursor at 42 s, paused video at 30 s — offset 12 s", () => {
    // Arrange
    const cursorS = 42;

    // Act
    const offset = alignedOffsetS(cursorS, 30);

    // Assert
    expect(offset).toBe(12);
  });

  it("nudgedOffsetS — ±1 frame at 30 fps and ±10 ms — moves by 1/30 s and 0.01 s", () => {
    // Arrange
    const offset = 12;

    // Act
    const results = [
      nudgedOffsetS(offset, { kind: "frames", frames: 1 }, 30),
      nudgedOffsetS(offset, { kind: "frames", frames: -1 }, 30),
      nudgedOffsetS(offset, { kind: "ms", ms: 10 }, 30),
      nudgedOffsetS(offset, { kind: "ms", ms: -10 }, 30),
    ];

    // Assert
    expect(results[0]).toBeCloseTo(12 + 1 / 30, 12);
    expect(results[1]).toBeCloseTo(12 - 1 / 30, 12);
    expect(results[2]).toBeCloseTo(12.01, 12);
    expect(results[3]).toBeCloseTo(11.99, 12);
  });

  it("nudgedOffsetS — a frame nudge with fps 0 — offset unchanged, no invented rate", () => {
    // Arrange
    const offset = 12;

    // Act
    const result = nudgedOffsetS(offset, { kind: "frames", frames: 1 }, 0);

    // Assert
    expect(result).toBe(12);
  });

  it("steppedVideoTimeS — frame and second steps — move and clamp to [0, duration]", () => {
    // Arrange
    const link = { fps: 25, duration_s: 10 };

    // Act
    const results = [
      steppedVideoTimeS(5, { kind: "frames", frames: 1 }, link),
      steppedVideoTimeS(5, { kind: "seconds", seconds: -1 }, link),
      steppedVideoTimeS(0.5, { kind: "seconds", seconds: -1 }, link),
      steppedVideoTimeS(9.5, { kind: "seconds", seconds: 1 }, link),
      steppedVideoTimeS(5, { kind: "frames", frames: 1 }, { fps: 0, duration_s: 10 }),
    ];

    // Assert
    expect(results[0]).toBeCloseTo(5.04, 12);
    expect(results.slice(1)).toEqual([4, 0, 10, 5]);
  });
});

describe("videoAspect", () => {
  it("1920×1080, 1080×1920, no entry and an unknown size — 9/16, 16/9, 9/16, 9/16", () => {
    // Arrange
    const landscape = { width_px: 1920, height_px: 1080 };

    // Act
    const results = [videoAspect(landscape), videoAspect({ width_px: 1080, height_px: 1920 }), videoAspect(null), videoAspect({ width_px: 0, height_px: 0 })];

    // Assert
    expect(results).toEqual([9 / 16, 16 / 9, 9 / 16, 9 / 16]);
  });
});

describe("playbackErrorText", () => {
  it("an HEVC file — names the codec and the Most Compatible setting", () => {
    // Arrange
    const link = { file_name: "GX010001.MP4", video_codec: "hevc" };

    // Act
    const text = playbackErrorText(link);

    // Assert
    expect(text).toContain("GX010001.MP4");
    expect(text).toContain("HEVC");
    expect(text).toContain("Most Compatible");
  });

  it("an unrecognised fourcc — names it verbatim", () => {
    // Arrange
    const link = { file_name: "a.mp4", video_codec: "av01" };

    // Act
    const text = playbackErrorText(link);

    // Assert
    expect(text).toContain("av01");
  });
});

describe("linkErrorText", () => {
  const formatTime = (ms: number) => `T${ms}`;

  it("each video error kind — routed on kind, naming the file", () => {
    // Arrange
    const errors = [
      { kind: "video_parse", message: "x", detail: { reason: "no moov box" } },
      { kind: "video_no_overlap", message: "x", detail: { video_start_utc_ms: 1, video_end_utc_ms: 2, session_start_utc_ms: 3, session_end_utc_ms: 4 } },
      { kind: "video_no_time", message: "x" },
      { kind: "io", message: "disk full" },
    ];

    // Act
    const texts = errors.map((e) => linkErrorText("GX01.MP4", e, formatTime));

    // Assert
    expect(texts[0]).toBe("GX01.MP4 isn't an MP4 this app can read (no moov box).");
    expect(texts[1]).toBe("GX01.MP4 was recorded at T1–T2, outside this session (T3–T4).");
    expect(texts[2]).toContain("no recording time");
    expect(texts[3]).toBe("GX01.MP4: disk full");
  });

  it("a rejection that is not the C3 error shape — still reported with the file name", () => {
    // Arrange
    const error = new Error("boom");

    // Act
    const text = linkErrorText("a.mp4", error, formatTime);

    // Assert
    expect(text).toBe("a.mp4: could not be linked.");
  });
});

describe("linkProgressText", () => {
  it("copying with a total, copying without, probing — percent, no percent, reading", () => {
    // Arrange
    const progress = [
      { done: 421, total: 1000, phase: "copying" },
      { done: 5, total: null, phase: "copying" },
      { done: 0, total: null, phase: "probing" },
    ];

    // Act
    const texts = progress.map((p) => linkProgressText("GX01.MP4", p));

    // Assert
    expect(texts).toEqual(["Copying GX01.MP4 42%", "Copying GX01.MP4", "Reading GX01.MP4"]);
  });
});

describe("unlink prompt", () => {
  it("deleteFileByDefault — other_links 0 / 1 — ticked / unticked", () => {
    // Arrange
    const links = [{ other_links: 0 }, { other_links: 1 }];

    // Act
    const results = links.map(deleteFileByDefault);

    // Assert
    expect(results).toEqual([true, false]);
  });

  it("formatVideoSize — 4.1 GB, 250 MB, 2 KB — decimal units", () => {
    // Arrange
    const sizes = [4_100_000_000, 250_000_000, 2_000];

    // Act
    const results = sizes.map(formatVideoSize);

    // Assert
    expect(results).toEqual(["4.1 GB", "250.0 MB", "2 KB"]);
  });
});

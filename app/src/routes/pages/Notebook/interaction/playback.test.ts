import { describe, expect, it } from "vitest";

import {
  formatPlaybackTime,
  PLAYBACK_SPEEDS,
  playableSpanUs,
  setSpeed,
  shouldRenderPlaybackTransport,
  tick,
  togglePlay,
  type PlaybackState,
} from "./playback";

describe("tick", () => {
  it("tick — playing at speed 1 for 1000 ms — the cursor advances 1 000 000 µs", () => {
    const state: PlaybackState = { tUs: 0n, playing: true, speed: 1 };

    const next = tick(state, 1000, [0n, 10_000_000n]);

    expect(next.tUs).toBe(1_000_000n);
    expect(next.playing).toBe(true);
  });

  it("tick — elapsed past the span end — clamped to the end and playing false", () => {
    const state: PlaybackState = { tUs: 9_500_000n, playing: true, speed: 1 };

    const next = tick(state, 5000, [0n, 10_000_000n]);

    expect(next.tUs).toBe(10_000_000n);
    expect(next.playing).toBe(false);
  });

  it("tick — a long frame gap overshooting by more than one span — still clamps to exactly the end", () => {
    const state: PlaybackState = { tUs: 0n, playing: true, speed: 1 };

    const next = tick(state, 60_000, [0n, 10_000_000n]);

    expect(next.tUs).toBe(10_000_000n);
    expect(next.playing).toBe(false);
  });

  it("tick — not playing — unchanged", () => {
    const state: PlaybackState = { tUs: 5_000_000n, playing: false, speed: 1 };

    const next = tick(state, 1000, [0n, 10_000_000n]);

    expect(next).toBe(state);
  });

  it("tick — speed 2 for 500 ms — the cursor advances 1 000 000 µs", () => {
    const state: PlaybackState = { tUs: 0n, playing: true, speed: 2 };

    const next = tick(state, 500, [0n, 10_000_000n]);

    expect(next.tUs).toBe(1_000_000n);
  });
});

describe("togglePlay", () => {
  it("togglePlay — from paused — starts playing with tUs unchanged", () => {
    const state: PlaybackState = { tUs: 2_000_000n, playing: false, speed: 1 };

    const next = togglePlay(state);

    expect(next.playing).toBe(true);
    expect(next.tUs).toBe(2_000_000n);
  });

  it("togglePlay — from the end of the span — restarts from the beginning or stays put (stays put, and the next tick immediately re-stops it)", () => {
    const span: [bigint, bigint] = [0n, 10_000_000n];
    const atEnd: PlaybackState = { tUs: span[1], playing: false, speed: 1 };

    const resumed = togglePlay(atEnd);
    expect(resumed.playing).toBe(true);
    expect(resumed.tUs).toBe(span[1]);

    const afterOneTick = tick(resumed, 16, span);
    expect(afterOneTick.playing).toBe(false);
    expect(afterOneTick.tUs).toBe(span[1]);
  });
});

describe("shouldRenderPlaybackTransport", () => {
  it("shouldRenderPlaybackTransport — route visible and a cursor time — true", () => {
    expect(shouldRenderPlaybackTransport(true, 0n)).toBe(true);
  });

  it("shouldRenderPlaybackTransport — route hidden even with a cursor time — false", () => {
    expect(shouldRenderPlaybackTransport(false, 5_000_000n)).toBe(false);
  });

  it("shouldRenderPlaybackTransport — route visible but no cursor time — false", () => {
    expect(shouldRenderPlaybackTransport(true, null)).toBe(false);
  });

  it("shouldRenderPlaybackTransport — route hidden and no cursor time — false", () => {
    expect(shouldRenderPlaybackTransport(false, null)).toBe(false);
  });
});

describe("setSpeed", () => {
  it("setSpeed — changes speed, leaves tUs and playing untouched", () => {
    const state: PlaybackState = { tUs: 3_000_000n, playing: true, speed: 1 };

    const next = setSpeed(state, 4);

    expect(next).toEqual({ tUs: 3_000_000n, playing: true, speed: 4 });
  });
});

describe("PLAYBACK_SPEEDS", () => {
  it("PLAYBACK_SPEEDS — includes live speed 1×, ascending order", () => {
    expect(PLAYBACK_SPEEDS.map((s) => s.value)).toEqual([0.25, 0.5, 1, 2, 4]);
    expect(PLAYBACK_SPEEDS.some((s) => s.value === 1)).toBe(true);
  });
});

describe("playableSpanUs", () => {
  it("playableSpanUs — an unresolved window (null) — null, never a fabricated bound", () => {
    expect(playableSpanUs(null)).toBeNull();
  });

  it("playableSpanUs — a lap that does not start at session t=0 — the window's own start, not clamped to 0", () => {
    const span = playableSpanUs({ startUs: 120_000_000, endUs: 150_000_000 });

    expect(span).toEqual([120_000_000n, 150_000_000n]);
  });

  it("playableSpanUs — the whole session window — start 0", () => {
    const span = playableSpanUs({ startUs: 0, endUs: 60_000_000 });

    expect(span).toEqual([0n, 60_000_000n]);
  });
});

describe("formatPlaybackTime", () => {
  it("formatPlaybackTime — a time under a minute — mm:ss.mmm", () => {
    expect(formatPlaybackTime(0n)).toBe("00:00.000");
    expect(formatPlaybackTime(1_234_000n)).toBe("00:01.234");
  });

  it("formatPlaybackTime — a time over a minute — minutes carry", () => {
    expect(formatPlaybackTime(65_500_000n)).toBe("01:05.500");
  });
});

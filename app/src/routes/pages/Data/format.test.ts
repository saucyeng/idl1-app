import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBytes, formatDurationMs, formatLapTimeMs, localIsoDate } from "./format";

describe("formatLapTimeMs", () => {
  it("formatLapTimeMs — 83_456 ms — reads \"1:23.456\"", () => {
    const text = formatLapTimeMs(83_456);

    expect(text).toBe("1:23.456");
  });

  it("formatLapTimeMs — under a minute — still shows a leading \"0:\"", () => {
    const text = formatLapTimeMs(5_012);

    expect(text).toBe("0:05.012");
  });

  it("formatLapTimeMs — negative or NaN — reads \"—\", never a nonsense clock", () => {
    expect(formatLapTimeMs(-1)).toBe("—");
    expect(formatLapTimeMs(NaN)).toBe("—");
  });
});

describe("formatDurationMs", () => {
  it("formatDurationMs — 3_723_000 ms — reads \"1:02:03\"", () => {
    const text = formatDurationMs(3_723_000);

    expect(text).toBe("1:02:03");
  });

  it("formatDurationMs — under an hour — omits the hour field", () => {
    const text = formatDurationMs(62_000);

    expect(text).toBe("1:02");
  });
});

describe("formatBytes", () => {
  it("formatBytes — 1_048_576 bytes — reads \"1.0 MB\"", () => {
    const text = formatBytes(1_048_576);

    expect(text).toBe("1.0 MB");
  });
});

describe("localIsoDate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("localIsoDate — a UTC ms value — groups by the viewer's local date, not the UTC date", () => {
    // Etc/GMT+12 is a fixed UTC-12 offset (no DST), independent of wherever
    // this test happens to run. 2026-01-01T00:30:00Z is 2025-12-31 12:30 in
    // that zone — a different calendar date than the UTC one.
    vi.stubEnv("TZ", "Etc/GMT+12");

    const utcMs = Date.UTC(2026, 0, 1, 0, 30, 0);

    const text = localIsoDate(utcMs);

    expect(text).toBe("2025-12-31");
  });
});

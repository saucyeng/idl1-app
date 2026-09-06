import { describe, expect, it } from "vitest";

import { spectrumKey } from "./spectrumKey";
import type { FftParams } from "./types";

const baseParams: FftParams = {
  windowSize: 2048,
  hopSize: 1024,
  window: "hann",
  detrend: "mean",
  scaling: "magnitude",
  averaging: "mean",
};

describe("spectrumKey", () => {
  it("spectrumKey — same channel and params — produces the same key", () => {
    const a = spectrumKey("fork_velocity", baseParams);
    const b = spectrumKey("fork_velocity", { ...baseParams });

    expect(a).toBe(b);
  });

  it("spectrumKey — a different channel id — produces a different key", () => {
    const a = spectrumKey("fork_velocity", baseParams);
    const b = spectrumKey("rear_velocity", baseParams);

    expect(a).not.toBe(b);
  });

  it("spectrumKey — a different windowSize — produces a different key", () => {
    const a = spectrumKey("fork_velocity", baseParams);
    const b = spectrumKey("fork_velocity", { ...baseParams, windowSize: 4096 });

    expect(a).not.toBe(b);
  });

  it("spectrumKey — windowSize/hopSize of \"all\" versus a matching sample count — produce different keys", () => {
    const a = spectrumKey("fork_velocity", { ...baseParams, windowSize: "all", hopSize: "all", averaging: "none" });
    const b = spectrumKey("fork_velocity", { ...baseParams, windowSize: 2048, hopSize: 2048, averaging: "none" });

    expect(a).not.toBe(b);
  });

  it("spectrumKey — every other field held constant, each averaging mode — produces a distinct key", () => {
    const keys = (["none", "mean", "median", "max"] as const).map((averaging) =>
      spectrumKey("fork_velocity", { ...baseParams, windowSize: "all", hopSize: "all", averaging })
    );

    expect(new Set(keys).size).toBe(4);
  });
});

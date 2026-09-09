import { describe, expect, it } from "vitest";

import { engineVersionBanner } from "./engineVersionBanner";

describe("engineVersionBanner", () => {
  it("no selected sessions — no banner", () => {
    expect(engineVersionBanner([], "0.2.0")).toBeNull();
  });

  it("every selected session already matches the live engine — no banner", () => {
    const banner = engineVersionBanner(
      [
        { sessionId: "s1", engineVersion: "0.2.0" },
        { sessionId: "s2", engineVersion: "0.2.0" },
      ],
      "0.2.0"
    );

    expect(banner).toBeNull();
  });

  it("one selected session recorded an older engine version — banner names it and the live version", () => {
    const banner = engineVersionBanner([{ sessionId: "s1", engineVersion: "0.1.0" }], "0.2.0");

    expect(banner).toEqual({ currentEngineVersion: "0.2.0", outdated: [{ sessionId: "s1", engineVersion: "0.1.0" }] });
  });

  it("a mix of matching and outdated sessions — lists only the outdated ones, in order", () => {
    const banner = engineVersionBanner(
      [
        { sessionId: "s1", engineVersion: "0.2.0" },
        { sessionId: "s2", engineVersion: "0.1.0" },
        { sessionId: "s3", engineVersion: "0.1.5" },
      ],
      "0.2.0"
    );

    expect(banner?.outdated).toEqual([
      { sessionId: "s2", engineVersion: "0.1.0" },
      { sessionId: "s3", engineVersion: "0.1.5" },
    ]);
  });
});

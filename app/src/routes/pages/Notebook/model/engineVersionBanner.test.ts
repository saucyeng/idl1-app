import { describe, expect, it } from "vitest";

import {
  engineVersionBanner,
  parseEvaluatedWith,
  workbookVersionBanner,
  workbookVersionBannerMessage,
} from "./engineVersionBanner";

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

/** Decision 62's workbook half: the build that last evaluated this file
 *  against the build the reader is on. The recorded value is an advisory
 *  front-matter key (C2 §3.7's `graph` precedent, preserved by R135), read
 *  here and never written. */
describe("parseEvaluatedWith", () => {
  it("parseEvaluatedWith — front matter carrying the key — returns the recorded version", () => {
    const markdown = "---\nid: 0f3a\nevaluated_with: 0.1.4\n---\n\n# Notes\n";

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBe("0.1.4");
  });

  it("parseEvaluatedWith — a quoted value — strips the quotes", () => {
    const markdown = '---\nevaluated_with: "0.1.4"\n---\n';

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBe("0.1.4");
  });

  it("parseEvaluatedWith — a workbook with no such key — null, not a guess", () => {
    const markdown = "---\nid: 0f3a\n---\n\n# Notes\n";

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBeNull();
  });

  it("parseEvaluatedWith — a file with no front matter at all — null", () => {
    const markdown = "# Notes\n\nevaluated_with: 0.1.4\n";

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBeNull();
  });

  it("parseEvaluatedWith — an indented key inside another mapping — ignored, it is not top level", () => {
    const markdown = "---\ngraph:\n  evaluated_with: 0.0.1\n---\n";

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBeNull();
  });

  it("parseEvaluatedWith — an empty value — null rather than an empty version", () => {
    const markdown = "---\nevaluated_with:\n---\n";

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBeNull();
  });

  it("parseEvaluatedWith — a --- in the body below the front matter — does not extend the scan", () => {
    const markdown = "---\nid: 0f3a\n---\n\n# Notes\n\n---\n\nevaluated_with: 9.9.9\n";

    const recorded = parseEvaluatedWith(markdown);

    expect(recorded).toBeNull();
  });

  it("parseEvaluatedWith — no markdown read yet — null", () => {
    const recorded = parseEvaluatedWith(null);

    expect(recorded).toBeNull();
  });
});

describe("workbookVersionBanner", () => {
  it("workbookVersionBanner — a recorded version differing from the live one — announces both", () => {
    const markdown = "---\nevaluated_with: 0.1.4\n---\n";

    const banner = workbookVersionBanner(markdown, "0.1.7");

    expect(banner).toEqual({ evaluatedWith: "0.1.4", currentVersion: "0.1.7" });
  });

  it("workbookVersionBanner — the recorded version matching the live one — null, nothing to announce", () => {
    const markdown = "---\nevaluated_with: 0.1.7\n---\n";

    const banner = workbookVersionBanner(markdown, "0.1.7");

    expect(banner).toBeNull();
  });

  it("workbookVersionBanner — a workbook recording nothing — null, the common case today", () => {
    const markdown = "---\nid: 0f3a\n---\n";

    const banner = workbookVersionBanner(markdown, "0.1.7");

    expect(banner).toBeNull();
  });

  it("workbookVersionBanner — the live version not resolved yet — null rather than a half-stated comparison", () => {
    const markdown = "---\nevaluated_with: 0.1.4\n---\n";

    const banner = workbookVersionBanner(markdown, null);

    expect(banner).toBeNull();
  });

  it("workbookVersionBanner — a workbook evaluated by a NEWER build — announced the same way", () => {
    const markdown = "---\nevaluated_with: 0.2.0\n---\n";

    const banner = workbookVersionBanner(markdown, "0.1.7");

    expect(banner).toEqual({ evaluatedWith: "0.2.0", currentVersion: "0.1.7" });
  });
});

describe("workbookVersionBannerMessage", () => {
  it("workbookVersionBannerMessage — a banner — reads in decision 62's own wording", () => {
    const banner = { evaluatedWith: "0.1.4", currentVersion: "0.1.7" };

    const message = workbookVersionBannerMessage(banner);

    expect(message).toBe("Evaluated with idl1 0.1.4; you are on 0.1.7.");
  });
});

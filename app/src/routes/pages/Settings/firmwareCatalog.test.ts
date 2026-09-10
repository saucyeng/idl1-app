import { describe, expect, it } from "vitest";

import type { FirmwareRelease } from "../../../ipc/device";
import {
  catalogVerdict,
  compareVersions,
  describeVerdict,
  forChannel,
  newestFirst,
  parseVersion,
  updateButtonLabel,
} from "./firmwareCatalog";

/** A catalog entry for `version`, marked prerelease when the version
 *  carries a prerelease identifier. */
function release(version: string): FirmwareRelease {
  return {
    version,
    tag: `v${version}`,
    name: version,
    notes: "",
    prerelease: version.includes("-"),
    published_at: "2026-09-01T00:00:00Z",
    image_url: `https://example.invalid/idl1-firmware-${version}.bin`,
    image_size_bytes: 1600,
    sha256_url: null,
  };
}

describe("parseVersion", () => {
  it("parseVersion — leading v, plain and build metadata — all parse to the same core", () => {
    // Arrange
    const inputs = ["1.5.0", "v1.5.0", "1.5.0+abc"];

    // Act
    const parsed = inputs.map(parseVersion);

    // Assert
    for (const version of parsed) {
      expect(version).toEqual({ major: 1, minor: 5, patch: 0, prerelease: "" });
    }
  });

  it("parseVersion — prerelease suffix — keeps it separate from the numeric core", () => {
    // Arrange
    const input = "v1.6.0-beta.1";

    // Act
    const parsed = parseVersion(input);

    // Assert
    expect(parsed).toEqual({ major: 1, minor: 6, patch: 0, prerelease: "beta.1" });
  });

  it("parseVersion — non-semver text — returns null rather than guessing", () => {
    // Arrange
    const inputs = ["nightly", "1.5", "1.5.0.1", "v1.x.0", ""];

    // Act
    const parsed = inputs.map(parseVersion);

    // Assert
    expect(parsed).toEqual([null, null, null, null, null]);
  });
});

describe("compareVersions", () => {
  it("compareVersions — differing numeric fields — orders major then minor then patch", () => {
    // Arrange / Act / Assert
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.5.1", "1.5.0")).toBe(1);
    expect(compareVersions("1.4.9", "1.5.0")).toBe(-1);
    expect(compareVersions("v1.5.0", "1.5.0")).toBe(0);
  });

  it("compareVersions — a prerelease against its release — ranks the prerelease lower", () => {
    // Arrange / Act / Assert
    expect(compareVersions("1.6.0-beta.1", "1.6.0")).toBe(-1);
    expect(compareVersions("1.6.0", "1.6.0-beta.1")).toBe(1);
  });

  it("compareVersions — two prereleases — compares identifiers part by part, numerics numerically", () => {
    // Arrange / Act / Assert
    expect(compareVersions("1.6.0-beta.2", "1.6.0-beta.1")).toBe(1);
    expect(compareVersions("1.6.0-beta.10", "1.6.0-beta.9")).toBe(1);
    expect(compareVersions("1.6.0-alpha", "1.6.0-beta")).toBe(-1);
    expect(compareVersions("1.6.0-beta", "1.6.0-beta.1")).toBe(-1);
  });

  it("compareVersions — either side unparseable — returns null", () => {
    // Arrange / Act / Assert
    expect(compareVersions("nightly", "1.5.0")).toBeNull();
    expect(compareVersions("1.5.0", "")).toBeNull();
  });
});

describe("newestFirst and forChannel", () => {
  it("newestFirst — mixed releases and prereleases — sorts by semver precedence", () => {
    // Arrange
    const releases = [release("1.5.0"), release("1.6.0"), release("1.6.0-beta.1"), release("1.4.0")];

    // Act
    const sorted = newestFirst(releases).map((r) => r.version);

    // Assert
    expect(sorted).toEqual(["1.6.0", "1.6.0-beta.1", "1.5.0", "1.4.0"]);
  });

  it("newestFirst — does not mutate its input", () => {
    // Arrange
    const releases = [release("1.4.0"), release("1.6.0")];

    // Act
    newestFirst(releases);

    // Assert
    expect(releases.map((r) => r.version)).toEqual(["1.4.0", "1.6.0"]);
  });

  it("forChannel — stable — drops prereleases; beta keeps them", () => {
    // Arrange
    const releases = [release("1.6.0-beta.1"), release("1.5.0")];

    // Act
    const stable = forChannel(releases, "stable").map((r) => r.version);
    const beta = forChannel(releases, "beta").map((r) => r.version);

    // Assert
    expect(stable).toEqual(["1.5.0"]);
    expect(beta).toEqual(["1.6.0-beta.1", "1.5.0"]);
  });
});

describe("catalogVerdict", () => {
  it("catalogVerdict — no repository configured — is disabled before anything else is considered", () => {
    // Arrange
    const inputs = { firmwareRepo: "  ", channel: "stable" as const, deviceVersion: "1.5.0", releases: [release("1.6.0")] };

    // Act
    const verdict = catalogVerdict(inputs);

    // Assert
    expect(verdict.kind).toBe("disabled");
  });

  it("catalogVerdict — no connected device — is not-connected, so no verdict outlives the link", () => {
    // Arrange
    const inputs = { firmwareRepo: "o/n", channel: "stable" as const, deviceVersion: null, releases: [release("1.6.0")] };

    // Act
    const verdict = catalogVerdict(inputs);

    // Assert
    expect(verdict.kind).toBe("not-connected");
  });

  it("catalogVerdict — no check run yet — is distinct from a check that found nothing", () => {
    // Arrange
    const notChecked = { firmwareRepo: "o/n", channel: "stable" as const, deviceVersion: "1.5.0", releases: null };
    const foundNothing = { ...notChecked, releases: [] };

    // Act / Assert
    expect(catalogVerdict(notChecked).kind).toBe("not-checked");
    expect(catalogVerdict(foundNothing).kind).toBe("empty");
  });

  it("catalogVerdict — device behind the channel's latest — offers the update", () => {
    // Arrange
    const inputs = {
      firmwareRepo: "o/n",
      channel: "stable" as const,
      deviceVersion: "1.5.0",
      releases: [release("1.6.0"), release("1.5.0")],
    };

    // Act
    const verdict = catalogVerdict(inputs);

    // Assert
    expect(verdict).toMatchObject({ kind: "update-available", deviceVersion: "1.5.0" });
    expect(describeVerdict(verdict)).toBe("Update available — v1.5.0 → v1.6.0");
    expect(updateButtonLabel(verdict)).toBe("Update to v1.6.0");
  });

  it("catalogVerdict — stable channel with only a newer prerelease — reports up to date", () => {
    // Arrange
    const inputs = {
      firmwareRepo: "o/n",
      channel: "stable" as const,
      deviceVersion: "1.5.0",
      releases: [release("1.6.0-beta.1"), release("1.5.0")],
    };

    // Act
    const verdict = catalogVerdict(inputs);

    // Assert
    expect(verdict.kind).toBe("up-to-date");
    expect(updateButtonLabel(verdict)).toBeNull();
  });

  it("catalogVerdict — device ahead of the channel — says so rather than offering a downgrade", () => {
    // Arrange
    const inputs = {
      firmwareRepo: "o/n",
      channel: "stable" as const,
      deviceVersion: "1.7.0",
      releases: [release("1.6.0")],
    };

    // Act
    const verdict = catalogVerdict(inputs);

    // Assert
    expect(verdict.kind).toBe("ahead");
    expect(describeVerdict(verdict)).toBe(
      "Device firmware v1.7.0 is ahead of the stable channel (latest v1.6.0); no action needed.",
    );
    expect(updateButtonLabel(verdict)).toBeNull();
  });

  it("catalogVerdict — device version that is not semver — offers nothing and says why", () => {
    // Arrange
    const inputs = {
      firmwareRepo: "o/n",
      channel: "beta" as const,
      deviceVersion: "dev-build",
      releases: [release("1.6.0")],
    };

    // Act
    const verdict = catalogVerdict(inputs);

    // Assert
    expect(verdict.kind).toBe("unknown-device-version");
    expect(updateButtonLabel(verdict)).toBeNull();
    expect(describeVerdict(verdict)).toContain("unrecognised firmware version");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

import { effectiveChannel, inPlaceVersionLabel, updatesInPlace } from "./channelUpdate";

describe("effectiveChannel", () => {
  const build = { channel: "nightly" as const, build_channel: "nightly" as const, version: "0.1.0", build: 20 };

  it("no pick — the build's own channel", () => {
    expect(effectiveChannel(null, build)).toBe("nightly");
  });

  it("a pick — the pick", () => {
    expect(effectiveChannel("stable", build)).toBe("stable");
  });
});

describe("updatesInPlace", () => {
  const build = (build_channel: "stable" | "beta" | "nightly") => ({ channel: build_channel, build_channel, version: "0.1.0", build: 20 });

  it("desktop nightly — in place", () => {
    expect(updatesInPlace(build("nightly"), false)).toBe(true);
  });

  it("desktop stable — in place", () => {
    expect(updatesInPlace(build("stable"), false)).toBe(true);
  });

  it("desktop beta — a download", () => {
    expect(updatesInPlace(build("beta"), false)).toBe(false);
  });

  it("Android nightly — a download", () => {
    expect(updatesInPlace(build("nightly"), true)).toBe(false);
  });
});

describe("inPlaceVersionLabel", () => {
  it("a nightly after a prerelease — the build number", () => {
    expect(inPlaceVersionLabel("0.1.0-beta.3.nightly.31")).toBe("build 31");
  });

  it("a nightly after a release — the build number", () => {
    expect(inPlaceVersionLabel("0.2.0-nightly.7")).toBe("build 7");
  });

  it("a tagged version — unchanged", () => {
    expect(inPlaceVersionLabel("0.2.0")).toBe("0.2.0");
  });
});

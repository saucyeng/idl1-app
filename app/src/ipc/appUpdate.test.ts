import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { currentBuild, isAndroid, updateLink, type AppUpdate } from "./appUpdate";

const UPDATE: AppUpdate = {
  channel: "nightly",
  label: "build 19",
  build: 19,
  switch: false,
  notes: "",
  published_at: "",
  page_url: "https://github.com/saucyeng/idl1-app/releases/tag/nightly",
  apk_url: "https://github.com/saucyeng/idl1-app/releases/download/nightly/idl1-app-nightly-arm64.apk",
};

describe("currentBuild", () => {
  it("CI nightly variables — channel, version and build number", () => {
    // Arrange
    const env = { VITE_RELEASE_CHANNEL: "nightly", VITE_APP_VERSION: "0.1.0", VITE_BUILD_NUMBER: "19" };

    // Act
    const build = currentBuild(env);

    // Assert
    expect(build).toEqual({ channel: "nightly", build_channel: "nightly", version: "0.1.0", build: 19 });
  });

  it("no channel (a local build) — null, so no check runs", () => {
    expect(currentBuild({ VITE_APP_VERSION: "0.1.0", VITE_BUILD_NUMBER: "19" })).toBeNull();
  });

  it("unknown channel or no version — null", () => {
    expect(currentBuild({ VITE_RELEASE_CHANNEL: "alpha", VITE_APP_VERSION: "0.1.0" })).toBeNull();
    expect(currentBuild({ VITE_RELEASE_CHANNEL: "stable" })).toBeNull();
  });

  it("missing or garbage build number — 0", () => {
    expect(currentBuild({ VITE_RELEASE_CHANNEL: "beta", VITE_APP_VERSION: "0.2.0-beta.1" })?.build).toBe(0);
    expect(currentBuild({ VITE_RELEASE_CHANNEL: "beta", VITE_APP_VERSION: "0.2.0-beta.1", VITE_BUILD_NUMBER: "x" })?.build).toBe(0);
  });
});

describe("updateLink", () => {
  it("Android with an APK — the APK", () => {
    expect(updateLink(UPDATE, true)).toBe(UPDATE.apk_url);
  });

  it("Android, APK not uploaded yet — the release page", () => {
    expect(updateLink({ ...UPDATE, apk_url: null }, true)).toBe(UPDATE.page_url);
  });

  it("desktop — the release page", () => {
    expect(updateLink(UPDATE, false)).toBe(UPDATE.page_url);
  });
});

describe("isAndroid", () => {
  it("Android webview user agent — true; Windows — false", () => {
    expect(isAndroid("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 wv")).toBe(true);
    expect(isAndroid("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
  });
});

describe("checkAppUpdate", () => {
  it("invokes check_app_update with the build — returns its answer", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(UPDATE);
    const { checkAppUpdate } = await import("./appUpdate");
    const build = { channel: "nightly" as const, build_channel: "nightly" as const, version: "0.1.0", build: 18 };

    // Act
    const update = await checkAppUpdate(build);

    // Assert
    expect(update).toEqual(UPDATE);
    expect(invoke).toHaveBeenCalledWith("check_app_update", { current: build });
  });
});

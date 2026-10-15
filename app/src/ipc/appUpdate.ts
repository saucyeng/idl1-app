import { invoke } from "@tauri-apps/api/core";

/** A release channel (C3 §3.10). A build belongs to exactly one, fixed when
 *  it is built, and is only offered updates published on it. */
export type AppChannel = "stable" | "beta" | "nightly";

/** What the running build is (C3 §3.10 `CurrentBuild`). As
 *  {@link currentBuild} returns it, `channel` and `build_channel` are both
 *  the build's own; a check against another channel sets `channel` only. */
export interface CurrentBuild {
  /** The channel to check. */
  channel: AppChannel;
  /** The channel the running build was made for. */
  build_channel: AppChannel;
  /** Semver, `tauri.conf.json`'s `version`. */
  version: string;
  /** CI run number (the APK's `versionCode`); 0 when unknown. */
  build: number;
}

/** A newer release on the build's channel (C3 §3.10 `AppUpdate`). */
export interface AppUpdate {
  channel: AppChannel;
  /** `"0.2.0"`, or `"build 19"` on nightly. */
  label: string;
  /** The release's build number (its title's `(build <n>`), or `null` for
   *  a tagged release published before titles carried one. */
  build: number | null;
  /** True when the check was against another channel: a switch, always
   *  offered, rather than an update. */
  switch: boolean;
  /** Release body, markdown as published. */
  notes: string;
  /** RFC 3339; `""` when GitHub reported none. */
  published_at: string;
  /** The release's web page. */
  page_url: string;
  /** The arm64 APK, or `null` when the release carries none. */
  apk_url: string | null;
}

/** The build-time variables {@link currentBuild} reads: `release.yml` sets
 *  them for CI builds; a local build has none and so never checks. */
export interface BuildEnv {
  VITE_RELEASE_CHANNEL?: string;
  VITE_APP_VERSION?: string;
  VITE_BUILD_NUMBER?: string;
}

/** What this build was built as, or `null` when it carries no channel (a
 *  local or dev build), which turns the update check off. A missing or
 *  unparseable build number reads as 0. */
export function currentBuild(env: BuildEnv): CurrentBuild | null {
  const channel = env.VITE_RELEASE_CHANNEL;
  if (channel !== "stable" && channel !== "beta" && channel !== "nightly") return null;
  const version = env.VITE_APP_VERSION ?? "";
  if (version === "") return null;
  const build = Number.parseInt(env.VITE_BUILD_NUMBER ?? "", 10);
  return { channel, build_channel: channel, version, build: Number.isFinite(build) && build > 0 ? build : 0 };
}

/** Where "Download" should go: the APK on Android when the release has one,
 *  otherwise the release page (desktop, or an APK still uploading). */
export function updateLink(update: AppUpdate, android: boolean): string {
  return android && update.apk_url !== null ? update.apk_url : update.page_url;
}

/** True on an Android webview. */
export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

/** Checks the build's channel for a newer release (C3 §3.10); `null` means
 *  up to date. Rejects with the C3 IPC error shape when the feed can't be
 *  reached. */
export async function checkAppUpdate(current: CurrentBuild): Promise<AppUpdate | null> {
  return invoke<AppUpdate | null>("check_app_update", { current });
}

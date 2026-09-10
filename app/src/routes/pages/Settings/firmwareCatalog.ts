import type { FirmwareChannel, FirmwareRelease } from "../../../ipc/device";

/**
 * The catalog half of the Firmware section, as pure functions: comparing
 * the device's running version to what a channel publishes, and turning the
 * comparison into the one line the card shows.
 *
 * The *fetch* is Rust's (`firmware_catalog`, C3 §3.8) and so is channel
 * filtering — this module compares what came back against the connected
 * device, which is a UI verdict about a live link, not a number the sync
 * model depends on (CLAUDE.md §2's "Rust = numbers, JS = pictures").
 *
 * The verdict is a function of the live device, never a value that stays
 * true once computed (SPEC §27.7): recompute it whenever the connection or
 * the device's reported version changes.
 */

/** A version parsed into semver's four precedence fields. */
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  /** The `-`-suffixed prerelease identifier without its dash; `""` for a
   *  plain release. */
  prerelease: string;
}

/** Parses `text` as semver, tolerating a leading `v` and ignoring `+build`
 *  metadata (which takes no part in precedence).
 *
 * @returns `null` for anything that is not `MAJOR.MINOR.PATCH` with numeric
 *  fields — the device reporting an unparseable version is a real state
 *  ("unknown version"), not a parse failure to paper over. */
export function parseVersion(text: string): ParsedVersion | null {
  const withoutBuild = text.trim().replace(/^v/, "").split("+")[0];
  const dash = withoutBuild.indexOf("-");
  const core = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const prerelease = dash === -1 ? "" : withoutBuild.slice(dash + 1);
  const fields = core.split(".");
  if (fields.length !== 3) return null;
  const [major, minor, patch] = fields.map((field) => (/^\d+$/.test(field) ? Number(field) : Number.NaN));
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) return null;
  return { major, minor, patch, prerelease };
}

/** Compares two dot-separated prerelease identifiers (semver §11.4):
 *  numeric parts numerically and below alphanumeric ones, and a shorter
 *  identifier below a longer one when every shared part is equal. */
function comparePrerelease(left: string, right: string): number {
  const leftParts = left.split(".");
  const rightParts = right.split(".");
  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i += 1) {
    const l = leftParts[i];
    const r = rightParts[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const lNumeric = /^\d+$/.test(l);
    const rNumeric = /^\d+$/.test(r);
    if (lNumeric && rNumeric) {
      if (Number(l) !== Number(r)) return Number(l) < Number(r) ? -1 : 1;
    } else if (lNumeric !== rNumeric) {
      return lNumeric ? -1 : 1;
    } else if (l !== r) {
      return l < r ? -1 : 1;
    }
  }
  return 0;
}

/** Semver precedence between two version strings.
 *
 * @returns `-1`/`0`/`1` as `left` sorts before/with/after `right`, or `null`
 *  when either side does not parse — the caller's cue to say "unknown
 *  version" rather than to offer an update (R198). */
export function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === null || b === null) return null;
  for (const [x, y] of [
    [a.major, b.major],
    [a.minor, b.minor],
    [a.patch, b.patch],
  ]) {
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.prerelease === "" && b.prerelease === "") return 0;
  if (a.prerelease === "") return 1;
  if (b.prerelease === "") return -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/** Sorts `releases` newest first. Anything that does not parse as semver
 *  keeps the order it arrived in, behind everything that does. */
export function newestFirst(releases: readonly FirmwareRelease[]): FirmwareRelease[] {
  return [...releases].sort((a, b) => {
    const ordering = compareVersions(b.version, a.version);
    return ordering ?? 0;
  });
}

/** Keeps the releases `channel` admits: `stable` drops prereleases, `beta`
 *  keeps everything (R198). Rust already filters this way; the app filters
 *  again so a channel switch redraws without a second network call. */
export function forChannel(releases: readonly FirmwareRelease[], channel: FirmwareChannel): FirmwareRelease[] {
  return releases.filter((release) => (channel === "stable" ? !release.prerelease : true));
}

/** What the catalog has to say about the connected device. */
export type CatalogVerdict =
  | { kind: "disabled" }
  | { kind: "not-connected" }
  | { kind: "not-checked" }
  | { kind: "empty" }
  | { kind: "unknown-device-version"; latest: FirmwareRelease }
  | { kind: "up-to-date"; latest: FirmwareRelease; deviceVersion: string }
  | { kind: "ahead"; latest: FirmwareRelease; deviceVersion: string; channel: FirmwareChannel }
  | { kind: "update-available"; latest: FirmwareRelease; deviceVersion: string };

/** Inputs to {@link catalogVerdict}, gathered by the section. */
export interface CatalogInputs {
  /** `""` means no repository is configured, so the catalog is off. */
  firmwareRepo: string;
  channel: FirmwareChannel;
  /** `null` while no device is connected — the verdict clears with the
   *  link, it never outlives it (SPEC §27.7). */
  deviceVersion: string | null;
  /** The releases last fetched, or `null` if no check has run yet.
   *  Distinguishes "not checked" from "checked, nothing published". */
  releases: readonly FirmwareRelease[] | null;
}

/** Decides what the catalog card says. Pure: every branch is reachable in a
 *  test without a network, a device, or a clock. */
export function catalogVerdict(inputs: CatalogInputs): CatalogVerdict {
  if (inputs.firmwareRepo.trim() === "") return { kind: "disabled" };
  if (inputs.deviceVersion === null) return { kind: "not-connected" };
  if (inputs.releases === null) return { kind: "not-checked" };

  const candidates = newestFirst(forChannel(inputs.releases, inputs.channel));
  const latest = candidates[0];
  if (latest === undefined) return { kind: "empty" };

  const ordering = compareVersions(latest.version, inputs.deviceVersion);
  if (ordering === null) return { kind: "unknown-device-version", latest };
  if (ordering > 0) return { kind: "update-available", latest, deviceVersion: inputs.deviceVersion };
  if (ordering < 0) {
    return { kind: "ahead", latest, deviceVersion: inputs.deviceVersion, channel: inputs.channel };
  }
  return { kind: "up-to-date", latest, deviceVersion: inputs.deviceVersion };
}

/** The one line the catalog card shows for `verdict`.
 *
 * The `update-available` and `ahead` strings are the Flutter app's own,
 * kept verbatim (R198: "verbatim strings from the Flutter extract where
 * they were good"); the rest are new, because idl0 had no disabled-catalog
 * or never-checked state to describe. */
export function describeVerdict(verdict: CatalogVerdict): string {
  switch (verdict.kind) {
    case "disabled":
      return "No firmware repository is set, so update checks are off. You can still push a .bin file by hand.";
    case "not-connected":
      return "Connect to device first";
    case "not-checked":
      return "No update check has run yet.";
    case "empty":
      return "That repository publishes no firmware for this channel.";
    case "unknown-device-version":
      return `The device reports an unrecognised firmware version, so there is nothing to compare against v${verdict.latest.version}.`;
    case "up-to-date":
      return `Device firmware v${verdict.deviceVersion} is up to date.`;
    case "ahead":
      return `Device firmware v${verdict.deviceVersion} is ahead of the ${verdict.channel} channel (latest v${verdict.latest.version}); no action needed.`;
    case "update-available":
      return `Update available — v${verdict.deviceVersion} → v${verdict.latest.version}`;
  }
}

/** The label of the button that starts a catalog push, or `null` when the
 *  verdict offers nothing to install. A device that is behind is the only
 *  case that offers one — this is never a downgrade prompt (SPEC §27.7). */
export function updateButtonLabel(verdict: CatalogVerdict): string | null {
  return verdict.kind === "update-available" ? `Update to v${verdict.latest.version}` : null;
}

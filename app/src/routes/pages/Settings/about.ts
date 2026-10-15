import type { CurrentBuild } from "../../../ipc/appUpdate";

/** A single label/value row in the About section. */
export interface AboutRow {
  /** Row label, e.g. `"App version"`. */
  label: string;
  /** Row value, already formatted for display. */
  value: string;
}

/** The app's version for a local build, which carries no build variables
 *  (a CI build passes its own through `build`). Keep in sync with
 *  `tauri.conf.json` by hand. */
const APP_VERSION = "0.1.0";

/** The session/workbook schema version this build understands, per C1's
 *  `session.json` `schema_version` field
 *  (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`).
 *  Hardcoded for the same reason as {@link APP_VERSION} — no command or
 *  `SessionSummary` field surfaces this value today, so it is an invented
 *  display string that mirrors C1's numeric `schema_version: 1` by hand.
 *  Keep it in sync with that field by hand, and supersede this constant
 *  with a real read the day a command exposes the schema version
 *  (review-task6.md Minor, 2026-09-05). */
const SCHEMA_VERSION = "session schema v1";

/** The build identifier of a local build, matching idl0's `_AboutSection`
 *  constant of the same name. */
const LOCAL_BUILD = "dev";

/** Builds the About section's label/value rows.
 *
 * @param engineVersion - The `idl-rs` engine version, as already fetched
 *  once by the app shell (`AppState.engineVersion`, C3 §3.1
 *  `engine_version`) and passed down — this function never calls
 *  `engine_version` itself, so About never triggers a second IPC round
 *  trip for a value the shell already has. `null` while the shell's fetch
 *  is still in flight.
 * @returns Four rows: app version, engine version, schema, build. The
 *  engine version row reads `"…"` (an in-progress ellipsis, never
 *  `"unknown"` — `"unknown"` would imply the call failed rather than
 *  simply not having returned yet) when `engineVersion` is `null`.
 * @param build - What a CI build was built as (`shell/channelUpdate.ts`'s
 *  `BUILD`), or `null` for a local build: the version and build rows then
 *  read the hand-kept constants and `"dev"`. */
export function aboutRows(engineVersion: string | null, build: CurrentBuild | null = null): AboutRow[] {
  const buildLabel = build === null ? LOCAL_BUILD : `${build.build > 0 ? build.build : "?"} · ${build.channel}`;
  return [
    { label: "App version", value: build?.version ?? APP_VERSION },
    { label: "Engine version", value: engineVersion ?? "…" },
    { label: "Schema", value: SCHEMA_VERSION },
    { label: "Build", value: buildLabel },
  ];
}

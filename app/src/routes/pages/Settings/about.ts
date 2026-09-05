/** A single label/value row in the About section. */
export interface AboutRow {
  /** Row label, e.g. `"App version"`. */
  label: string;
  /** Row value, already formatted for display. */
  value: string;
}

/** The app's own version, from `app/package.json`'s `version` field.
 *  Hardcoded rather than read at build time (no version-injection step is
 *  wired into the Vite build yet) — same treatment idl0 gave its own
 *  `_appVersion` constant, with the same caveat: keep this in sync with
 *  `package.json` by hand until a build step does it. */
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

/** The build identifier. `"dev"` outside of a tagged release build, matching
 *  idl0's `_AboutSection` constant of the same name. */
const BUILD = "dev";

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
 *  simply not having returned yet) when `engineVersion` is `null`. */
export function aboutRows(engineVersion: string | null): AboutRow[] {
  return [
    { label: "App version", value: APP_VERSION },
    { label: "Engine version", value: engineVersion ?? "…" },
    { label: "Schema", value: SCHEMA_VERSION },
    { label: "Build", value: BUILD },
  ];
}

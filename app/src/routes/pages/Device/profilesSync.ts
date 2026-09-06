import type { BikeProfile, ProfileLoadReport } from "../../../ipc/app";
import { parseConfig, serializeConfig } from "./config/model";
import type { DeviceIpcError } from "./errors";
import type { ProfileView, ProfilesState } from "./profiles";

/** Injected IO for the persistence functions below — same shape as
 *  `app/src/ipc/app.ts`'s exports, so a test can supply fakes instead of a
 *  real `invoke` call (wave-2 operating brief §4's effects rule). */
export interface ProfilesSyncDeps {
  listProfiles: () => Promise<ProfileLoadReport>;
  saveProfile: (profile: BikeProfile) => Promise<BikeProfile>;
  deleteProfile: (profileId: string) => Promise<void>;
}

/** One entry `loadProfiles` could not turn into a usable `ProfileView` —
 *  same shape as `ProfileLoadReport.skipped` (`list_profiles`'s own
 *  parse failures), so the two sources are shown together in one list
 *  (lane brief Interface 3). `path` is the file path for a `list_profiles`
 *  parse failure, or the `profile_id` for a profile this module itself
 *  rejected on config validation — there is no file path available for the
 *  latter case, since `list_profiles` already parsed the file into a
 *  `BikeProfile` before handing it over. */
export interface SkippedProfile {
  path: string;
  reason: string;
}

/** `loadProfiles`'s return: a `ProfilesState` ready for `profilesReducer`,
 *  plus every entry that could not be loaded, from either source. */
export interface ProfilesLoadResult {
  state: ProfilesState;
  skipped: SkippedProfile[];
}

/** Converts a `BikeProfile` (as `list_profiles`/`save_profile` carry it,
 *  `config: Record<string, unknown>`) into a `ProfileView` (`config:
 *  DeviceConfig`) — the one place this boundary conversion happens (lane
 *  brief Interface 3). Runs the document through `parseConfig` and treats
 *  any repair as a validation failure: `parseConfig` is a best-effort,
 *  defaulting parser (it never throws), so a config that needed even one
 *  repair is, by definition, a config this app would silently have changed
 *  — the never-silently-defaulted rule means that case is rejected here
 *  instead of accepted with the repair applied. */
function bikeProfileToView(profile: BikeProfile): { ok: true; view: ProfileView } | { ok: false; reason: string } {
  const { config, repairs } = parseConfig(profile.config);
  if (repairs.length > 0) {
    const reason = `config failed validation — ${repairs.map((r) => `${r.path}: ${r.reason}`).join("; ")}`;
    return { ok: false, reason };
  }
  return {
    ok: true,
    view: {
      profile_id: profile.profile_id,
      profile_name: profile.profile_name,
      created_at_ms: profile.created_at_ms,
      updated_at_ms: profile.updated_at_ms,
      config,
    },
  };
}

/** The inverse of {@link bikeProfileToView}: turns this tab's `ProfileView`
 *  into the `Record<string, unknown>`-carrying `BikeProfile` document
 *  `save_profile` accepts, via `serializeConfig`/`JSON.parse` so the wire
 *  document is exactly what a device push would send (never a hand-built
 *  object literal). */
function viewToBikeProfile(view: ProfileView): BikeProfile {
  return {
    profile_id: view.profile_id,
    profile_name: view.profile_name,
    created_at_ms: view.created_at_ms,
    updated_at_ms: view.updated_at_ms,
    config: JSON.parse(serializeConfig(view.config)) as Record<string, unknown>,
  };
}

/** Loads every saved bike profile over `deps.listProfiles` (C3 §3.10) and
 *  converts each into a `ProfileView`. A profile `list_profiles` itself
 *  could not parse, and a profile whose `config` fails this module's own
 *  validation (see {@link bikeProfileToView}), both land in `skipped` —
 *  together, never a silently defaulted config. The returned state always
 *  starts with `activeId: null` — wave 2 does not persist which profile
 *  was active (SPEC §23.2), so a fresh load never assumes a selection. */
export async function loadProfiles(deps: ProfilesSyncDeps): Promise<ProfilesLoadResult> {
  const report = await deps.listProfiles();
  const skipped: SkippedProfile[] = [...report.skipped];
  const profiles: ProfileView[] = [];
  for (const bikeProfile of report.profiles) {
    const converted = bikeProfileToView(bikeProfile);
    if (converted.ok) {
      profiles.push(converted.view);
    } else {
      skipped.push({ path: bikeProfile.profile_id, reason: converted.reason });
    }
  }
  return { state: { profiles, activeId: null }, skipped };
}

/** `persistProfile`'s success case: the profile as the backend actually
 *  wrote it. `save_profile` is a whole-document replace (last-write-wins,
 *  R77.4) — the caller must install this returned `profile`, not keep its
 *  own optimistic copy. */
export interface PersistSucceeded {
  ok: true;
  profile: ProfileView;
}

/** `persistProfile`'s failure case: local state must be left untouched and
 *  `error` reported to the user (route through `describeIpcError`). */
export interface PersistFailed {
  ok: false;
  error: DeviceIpcError;
}

/**
 * Persists `profile` over `deps.saveProfile` (C3 §3.10): a whole-document
 * replace, last-write-wins. `profile.updated_at_ms` must already be set by
 * the caller (e.g. `Date.now()`) — this function is otherwise pure IO
 * plumbing and never reads the clock itself (lane brief Interface 3: every
 * `updated_at_ms` is supplied by the caller, never computed inside a pure
 * function).
 *
 * The backend's returned document wins over what was sent — `PersistSucceeded.profile`
 * is built from the response, not from `profile` — so a concurrent write
 * elsewhere, or a server-side normalisation, is reflected locally rather
 * than silently overwritten by this tab's optimistic copy.
 *
 * A rejection (e.g. `invalid_argument` when `config` is not a JSON object)
 * is returned as `PersistFailed`, never thrown — the caller is expected to
 * leave its local profile list untouched and show `error` via
 * `describeIpcError`.
 */
export async function persistProfile(deps: ProfilesSyncDeps, profile: ProfileView): Promise<PersistSucceeded | PersistFailed> {
  try {
    const saved = await deps.saveProfile(viewToBikeProfile(profile));
    const converted = bikeProfileToView(saved);
    if (!converted.ok) {
      // The backend accepted and echoed back a document this module cannot
      // itself parse — never install it locally; report it like any other
      // failure rather than silently defaulting it.
      return { ok: false, error: { kind: "internal", message: converted.reason } };
    }
    return { ok: true, profile: converted.view };
  } catch (error) {
    return { ok: false, error: error as DeviceIpcError };
  }
}

/** `removeProfile`'s outcome: `ok: true` on a successful delete, or
 *  `ok: false` with the rejection (e.g. `not_found` for a stale id) —
 *  never thrown, so a caller cannot forget to handle it. */
export type RemoveOutcome = { ok: true } | { ok: false; error: DeviceIpcError };

/** Deletes `profileId` over `deps.deleteProfile` (C3 §3.10). Rejects (as
 *  `ok: false`) with `not_found` if the backend does not recognise the id —
 *  a delete of a stale id never silently "succeeds" locally. */
export async function removeProfile(deps: ProfilesSyncDeps, profileId: string): Promise<RemoveOutcome> {
  try {
    await deps.deleteProfile(profileId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error as DeviceIpcError };
  }
}

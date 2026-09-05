import { defaultConfig } from "./config/defaults";
import type { DeviceConfig } from "./config/model";

/**
 * One bike profile as this tab holds it, field for field matching
 * `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 11's `BikeProfile` — the
 * shape `save_profile`/`list_profiles` will carry once the Rust track
 * lands them. Copied verbatim rather than imported: this lane has no
 * generated-IPC-types module, and the field names are the contract.
 */
export interface ProfileView {
  profile_id: string;
  profile_name: string;
  /** ms since epoch. */
  created_at_ms: number;
  /** ms since epoch. */
  updated_at_ms: number;
  /** The SPEC §8 device-config document this profile pushes, verbatim. */
  config: DeviceConfig;
}

/**
 * The Device tab's profile library. **In-memory for the session only** —
 * `list_profiles`/`save_profile`/`delete_profile` (IPC need 11) are stubs
 * until the Rust write lane lands them, so nothing here survives an app
 * restart. `ProfileBar` renders this plainly rather than in a tooltip, so
 * a rider doesn't spend ten minutes configuring channels and lose it
 * silently.
 */
export interface ProfilesState {
  profiles: ProfileView[];
  /** `null` when the library is empty. Never assumed to still point at an
   *  existing profile after a `DELETE` — this reducer keeps it consistent
   *  on every action. */
  activeId: string | null;
}

/** The reducer's state before any profile exists. */
export const initialProfilesState: ProfilesState = {
  profiles: [],
  activeId: null,
};

/** Actions `profilesReducer` accepts, dispatched by `ProfileBar`. */
export type ProfilesAction =
  | { type: "CREATE"; profileName: string; deviceId: string; nowMs: number }
  | { type: "DUPLICATE"; profileId: string; nowMs: number }
  | { type: "RENAME"; profileId: string; profileName: string }
  | { type: "DELETE"; profileId: string }
  | { type: "SELECT"; profileId: string };

/** Deep-copies a `DeviceConfig` so editing a duplicate can never reach back
 *  into the profile it was copied from. `structuredClone` is available in
 *  every target this app ships to (Tauri's WebView2/WebKit, both current). */
function cloneConfig(config: DeviceConfig): DeviceConfig {
  return structuredClone(config);
}

/**
 * Pure reducer over the Device tab's in-memory profile library (plan
 * Task 8). Never calls `listProfiles`/`saveProfile`/`deleteProfile`
 * itself — `ProfileBar` (or a future persistence task) is responsible for
 * that; this reducer only keeps `profiles`/`activeId` internally
 * consistent so a `DELETE` never leaves `activeId` pointing at a profile
 * that no longer exists.
 */
export function profilesReducer(state: ProfilesState, action: ProfilesAction): ProfilesState {
  switch (action.type) {
    case "CREATE": {
      const profile: ProfileView = {
        profile_id: crypto.randomUUID(),
        profile_name: action.profileName,
        created_at_ms: action.nowMs,
        updated_at_ms: action.nowMs,
        config: defaultConfig(action.deviceId),
      };
      return { profiles: [...state.profiles, profile], activeId: profile.profile_id };
    }
    case "DUPLICATE": {
      const source = state.profiles.find((p) => p.profile_id === action.profileId);
      if (source === undefined) return state;
      const profile: ProfileView = {
        profile_id: crypto.randomUUID(),
        profile_name: `${source.profile_name} (copy)`,
        created_at_ms: action.nowMs,
        updated_at_ms: action.nowMs,
        config: cloneConfig(source.config),
      };
      return { profiles: [...state.profiles, profile], activeId: profile.profile_id };
    }
    case "RENAME":
      return {
        ...state,
        profiles: state.profiles.map((p) => (p.profile_id === action.profileId ? { ...p, profile_name: action.profileName } : p)),
      };
    case "DELETE": {
      const profiles = state.profiles.filter((p) => p.profile_id !== action.profileId);
      if (state.activeId !== action.profileId) {
        return { profiles, activeId: state.activeId };
      }
      return { profiles, activeId: profiles.length > 0 ? profiles[0].profile_id : null };
    }
    case "SELECT":
      return { ...state, activeId: action.profileId };
    default:
      return state;
  }
}

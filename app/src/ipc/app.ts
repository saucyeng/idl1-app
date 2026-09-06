import { invoke } from "@tauri-apps/api/core";

/** Exactly `idl_rs::store::settings::AppSettings` and C4 §1's settings.json
 *  keys (C3 §3.10) — no translation layer. */
export interface AppSettings {
  /** The `<data>` root override, or `null` when the platform default is in
   *  use (C4 §1). */
  data_dir: string | null;
  /** "" = not set (C4 §1) */
  rider_name: string;
  /** Engine default "imperial" */
  unit_system: "imperial" | "metric";
}

/** Reads persisted app settings (C3 §3.10). Never fails — a missing or
 *  malformed `settings.json` yields defaults (C4 §1). */
export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

/** Persists `rider_name`/`unit_system` (C3 §3.10). `settings.data_dir` is
 *  present on the wire for symmetry but ignored — `setDataDir` is the sole
 *  writer of that key (ruling R59 Q5). Returns the state actually on disk
 *  after the write. */
export async function setSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke<AppSettings>("set_settings", { settings });
}

/** `getDataDir`/`setDataDir`'s return (C3 §3.10). */
export interface DataDirInfo {
  /** The `<data>` root in use for this process (C4 §1). */
  resolved_path: string;
  /** The override from `settings.json`, or `null` when the platform
   *  default is in use. */
  override_path: string | null;
  /** `true` when `resolved_path` differs from what `override_path` would
   *  give right now — the override changed and the app has not restarted. */
  restart_required: boolean;
}

/** Reads the `<data>` root in effect for this process, plus the override on
 *  disk (C3 §3.10). `resolved_path` is fixed at startup, so `restart_required`
 *  is a real condition, not defensive coding. */
export async function getDataDir(): Promise<DataDirInfo> {
  return invoke<DataDirInfo>("get_data_dir");
}

/** Writes only the `data_dir` key of `settings.json`, preserving
 *  `rider_name`/`unit_system` (C3 §3.10, ruling R59 Q5). Does not move
 *  existing files. `path` must be an absolute, creatable path; `null`
 *  clears the override. Explicit, confirmed user action — takes effect on
 *  restart. */
export async function setDataDir(path: string | null): Promise<DataDirInfo> {
  return invoke<DataDirInfo>("set_data_dir", { path });
}

/** The SPEC §8 device-config document a bike profile stores and pushes
 *  verbatim (C3 §3.10). */
export interface BikeProfile {
  profile_id: string;
  profile_name: string;
  /** i64, Unix epoch ms */
  created_at_ms: number;
  /** i64, Unix epoch ms */
  updated_at_ms: number;
  config: Record<string, unknown>;
}

/** `listProfiles`'s return (C3 §3.10). */
export interface ProfileLoadReport {
  /** Sorted by `profile_name` ascending. */
  profiles: BikeProfile[];
  /** Files that failed to parse — never a failure of the whole load. */
  skipped: { path: string; reason: string }[];
}

/** Lists every saved bike profile (C3 §3.10). A malformed file lands in
 *  `skipped`, never aborts the load. */
export async function listProfiles(): Promise<ProfileLoadReport> {
  return invoke<ProfileLoadReport>("list_profiles");
}

/** Persists `profile` (create or whole-document replace, last-write-wins)
 *  (C3 §3.10). Rejects with `invalid_argument` when `config` is not a JSON
 *  object. Returns the profile as written. */
export async function saveProfile(profile: BikeProfile): Promise<BikeProfile> {
  return invoke<BikeProfile>("save_profile", { profile });
}

/** Deletes the profile named `profileId` (C3 §3.10). Rejects with
 *  `not_found` if it doesn't exist — a delete of a stale id never silently
 *  succeeds. */
export async function deleteProfile(profileId: string): Promise<void> {
  return invoke<void>("delete_profile", { profileId });
}

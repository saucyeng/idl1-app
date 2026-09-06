import { useState } from "react";

import type { ProfilesAction, ProfilesState } from "./profiles";
import type { SkippedProfile } from "./profilesSync";

/** Props for {@link ProfileBar}. */
export interface ProfileBarProps {
  state: ProfilesState;
  /** `profilesReducer`'s dispatch — `ProfileBar` builds every action's
   *  `nowMs`/`deviceId` fields itself so the reducer stays a pure function
   *  of its inputs. Covers `CREATE`/`DUPLICATE`/`RENAME`/`SELECT`; delete
   *  goes through {@link ProfileBarProps.onDelete} instead, since it must
   *  call `delete_profile` before the local library forgets the profile. */
  dispatch: (action: ProfilesAction) => void;
  /** The connected device's id, seeded into a newly created profile's
   *  config (SPEC §8: `device_id` is read-only, set once at creation). */
  deviceId: string;
  /** True when the active profile's in-memory state (name or config)
   *  differs from what `save_profile` last returned — an explicit "Save
   *  profile" is the only way to clear this (ruling R78 Q3, 2026-09-06: no
   *  autosave, matching Push Config's "review and press" rule). */
  dirty: boolean;
  /** True while a `save_profile` call for the active profile is in flight —
   *  disables the Save button so a double click cannot stack two saves. */
  saving: boolean;
  onSave: () => void;
  /** Deletes the profile named `profileId` over `delete_profile`, then (on
   *  success) dispatches the reducer's own `DELETE` action — never the
   *  reverse, so a rejected delete never removes the profile locally. */
  onDelete: (profileId: string) => void;
  /** Profiles `list_profiles` or this tab's own config validation could not
   *  load — shown plainly rather than silently dropped or defaulted (lane
   *  brief Interface 3). */
  skipped: SkippedProfile[];
  /** Text from the most recent failed save or delete, or null. */
  error: string | null;
}

/**
 * The Device tab's profile bar (SPEC §23.2): a dropdown over the persisted
 * profile library (`list_profiles`/`save_profile`/`delete_profile`, C3
 * §3.10), plus New/Duplicate/Rename/Delete and an explicit Save. Wave 2's
 * save policy (ruling R78 Q3): every edit — a rename, a duplicate, a new
 * profile, or a channel-table change via `onConfigChange` — stays local
 * until the user presses **Save profile**; nothing autosaves, so
 * last-write-wins (R77.4) stays comprehensible and a config editor
 * keystroke never triggers a file write.
 */
export default function ProfileBar({ state, dispatch, deviceId, dirty, saving, onSave, onDelete, skipped, error }: ProfileBarProps) {
  const [draftName, setDraftName] = useState("");
  const active = state.profiles.find((p) => p.profile_id === state.activeId) ?? null;

  function onCreate(): void {
    const profileName = draftName.trim() === "" ? "Untitled profile" : draftName.trim();
    dispatch({ type: "CREATE", profileName, deviceId, nowMs: Date.now() });
    setDraftName("");
  }

  function onDuplicate(): void {
    if (active === null) return;
    dispatch({ type: "DUPLICATE", profileId: active.profile_id, nowMs: Date.now() });
  }

  function onRename(): void {
    if (active === null || draftName.trim() === "") return;
    dispatch({ type: "RENAME", profileId: active.profile_id, profileName: draftName.trim() });
    setDraftName("");
  }

  function onDeleteActive(): void {
    if (active === null) return;
    onDelete(active.profile_id);
  }

  return (
    <div className="device-tab__profile-bar">
      <label>
        Active profile
        <select
          value={state.activeId ?? ""}
          onChange={(e) => dispatch({ type: "SELECT", profileId: e.target.value })}
          disabled={state.profiles.length === 0}
        >
          {state.profiles.length === 0 && <option value="">No profiles yet</option>}
          {state.profiles.map((p) => (
            <option key={p.profile_id} value={p.profile_id}>
              {p.profile_name}
            </option>
          ))}
        </select>
      </label>
      <input
        type="text"
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        placeholder="Profile name"
        aria-label="Profile name"
      />
      <button type="button" onClick={onCreate}>
        + New profile
      </button>
      <button type="button" onClick={onDuplicate} disabled={active === null}>
        Duplicate active
      </button>
      <button type="button" onClick={onRename} disabled={active === null}>
        Rename active
      </button>
      <button type="button" onClick={onDeleteActive} disabled={active === null}>
        Delete active
      </button>
      <button type="button" onClick={onSave} disabled={active === null || !dirty || saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
      {active !== null && dirty && !saving && (
        <span role="status" className="device-tab__profile-bar-dirty">
          Unsaved changes
        </span>
      )}
      {error && <p role="alert">{error}</p>}
      {skipped.length > 0 && (
        <div className="device-tab__profile-bar-skipped">
          <p role="status">
            {skipped.length} profile{skipped.length === 1 ? "" : "s"} couldn&apos;t be loaded:
          </p>
          <ul>
            {skipped.map((s) => (
              <li key={s.path}>
                {s.path}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";

import type { ProfilesAction, ProfilesState } from "./profiles";

/** Props for {@link ProfileBar}. */
export interface ProfileBarProps {
  state: ProfilesState;
  /** `profilesReducer`'s dispatch — `ProfileBar` builds every action's
   *  `nowMs`/`deviceId` fields itself so the reducer stays a pure function
   *  of its inputs. */
  dispatch: (action: ProfilesAction) => void;
  /** The connected device's id, seeded into a newly created profile's
   *  config (SPEC §8: `device_id` is read-only, set once at creation). */
  deviceId: string;
}

/**
 * The Device tab's profile bar (SPEC §23.2): a dropdown over the in-memory
 * profile library, plus New/Duplicate/Rename/Delete. **The library is not
 * persisted** — `list_profiles`/`save_profile`/`delete_profile` (IPC need
 * 11) are stubs until the Rust write lane lands them, so this bar states
 * that plainly rather than in a tooltip: closing the app loses every
 * profile created this session.
 */
export default function ProfileBar({ state, dispatch, deviceId }: ProfileBarProps) {
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

  function onDelete(): void {
    if (active === null) return;
    dispatch({ type: "DELETE", profileId: active.profile_id });
  }

  return (
    <div className="device-tab__profile-bar">
      <p role="status" className="device-tab__profile-bar-notice">
        Profiles are in-memory for this session only — they are not saved yet (IPC need 11 is not landed). Closing the app loses
        them.
      </p>
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
      <button type="button" onClick={onDelete} disabled={active === null}>
        Delete active
      </button>
    </div>
  );
}

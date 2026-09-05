import { describe, expect, it } from "vitest";

import { defaultConfig } from "./config/defaults";
import { profilesReducer, type ProfilesState } from "./profiles";

/** Two seeded profiles, "b" active, close enough to exercise every action
 *  without depending on `list_profiles` (IPC need 11, stubbed) ever
 *  resolving in a test. */
function seededState(): ProfilesState {
  return {
    profiles: [
      { profile_id: "a", profile_name: "Road bike", created_at_ms: 1, updated_at_ms: 1, config: defaultConfig("aabbccddeeff") },
      { profile_id: "b", profile_name: "Gravel bike", created_at_ms: 2, updated_at_ms: 2, config: defaultConfig("112233445566") },
    ],
    activeId: "b",
  };
}

describe("profilesReducer", () => {
  it("profilesReducer — CREATE — the new profile becomes active and carries defaultConfig", () => {
    // Arrange
    const state = seededState();

    // Act
    const next = profilesReducer(state, { type: "CREATE", profileName: "TT bike", deviceId: "aabbccddeeff", nowMs: 100 });

    // Assert
    const created = next.profiles.find((p) => p.profile_id === next.activeId);
    expect(created).toBeDefined();
    expect(created?.profile_name).toBe("TT bike");
    expect(created?.config).toEqual(defaultConfig("aabbccddeeff"));
    expect(created?.created_at_ms).toBe(100);
    expect(created?.updated_at_ms).toBe(100);
    expect(next.profiles).toHaveLength(3);
  });

  it("profilesReducer — DUPLICATE — a new id, a distinct name, and a deep copy of the config (editing the copy must not touch the original)", () => {
    // Arrange
    const state = seededState();

    // Act
    const next = profilesReducer(state, { type: "DUPLICATE", profileId: "b", nowMs: 200 });
    const duplicate = next.profiles.find((p) => p.profile_id === next.activeId)!;
    duplicate.config.bike_profile.name = "edited only on the copy";

    // Assert
    expect(duplicate.profile_id).not.toBe("b");
    expect(duplicate.profile_name).not.toBe("Gravel bike");
    expect(next.activeId).toBe(duplicate.profile_id);
    const original = next.profiles.find((p) => p.profile_id === "b")!;
    expect(original.config.bike_profile.name).toBe("");
    expect(next.profiles).toHaveLength(3);
  });

  it("profilesReducer — RENAME to an existing name — allowed, names are not unique; ids are", () => {
    // Arrange
    const state = seededState();

    // Act
    const next = profilesReducer(state, { type: "RENAME", profileId: "a", profileName: "Gravel bike" });

    // Assert
    const renamed = next.profiles.find((p) => p.profile_id === "a")!;
    const original = next.profiles.find((p) => p.profile_id === "b")!;
    expect(renamed.profile_name).toBe("Gravel bike");
    expect(original.profile_name).toBe("Gravel bike");
    expect(next.profiles.map((p) => p.profile_id)).toEqual(["a", "b"]);
  });

  it("profilesReducer — DELETE the active profile — activeId moves to another profile, or null when none remain", () => {
    // Arrange
    const state = seededState();

    // Act
    const afterOne = profilesReducer(state, { type: "DELETE", profileId: "b" });
    const afterBoth = profilesReducer(afterOne, { type: "DELETE", profileId: "a" });

    // Assert
    expect(afterOne.profiles.map((p) => p.profile_id)).toEqual(["a"]);
    expect(afterOne.activeId).toBe("a");
    expect(afterBoth.profiles).toEqual([]);
    expect(afterBoth.activeId).toBeNull();
  });

  it("profilesReducer — DELETE a profile that is not active — activeId unchanged", () => {
    // Arrange
    const state = seededState();

    // Act
    const next = profilesReducer(state, { type: "DELETE", profileId: "a" });

    // Assert
    expect(next.profiles.map((p) => p.profile_id)).toEqual(["b"]);
    expect(next.activeId).toBe("b");
  });

  it("profilesReducer — SELECT — activeId moves to the chosen profile, list unchanged", () => {
    // Arrange
    const state = seededState();

    // Act
    const next = profilesReducer(state, { type: "SELECT", profileId: "a" });

    // Assert
    expect(next.activeId).toBe("a");
    expect(next.profiles).toEqual(state.profiles);
  });

  it("profilesReducer — DUPLICATE an unknown profile_id — no-op, state unchanged", () => {
    // Arrange
    const state = seededState();

    // Act
    const next = profilesReducer(state, { type: "DUPLICATE", profileId: "does-not-exist", nowMs: 300 });

    // Assert
    expect(next).toBe(state);
  });
});

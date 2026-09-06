import { describe, expect, it, vi } from "vitest";

import type { BikeProfile, ProfileLoadReport } from "../../../ipc/app";
import { defaultConfig } from "./config/defaults";
import type { ProfileView } from "./profiles";
import { loadProfiles, persistProfile, removeProfile, type ProfilesSyncDeps } from "./profilesSync";

/** A well-formed `BikeProfile` whose `config` round-trips through
 *  `parseConfig` with zero repairs. */
function goodBikeProfile(id: string): BikeProfile {
  const view: ProfileView = {
    profile_id: id,
    profile_name: `Profile ${id}`,
    created_at_ms: 1,
    updated_at_ms: 1,
    config: defaultConfig("aabbccddeeff"),
  };
  return { ...view, config: JSON.parse(JSON.stringify(view.config)) as Record<string, unknown> };
}

describe("loadProfiles", () => {
  it("loadProfiles — an empty library — returns no profiles, no skipped entries, and a null activeId", async () => {
    // Arrange
    const report: ProfileLoadReport = { profiles: [], skipped: [] };
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn().mockResolvedValue(report),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    };

    // Act
    const result = await loadProfiles(deps);

    // Assert
    expect(result.state).toEqual({ profiles: [], activeId: null });
    expect(result.skipped).toEqual([]);
  });

  it("loadProfiles — a library with skipped entries from list_profiles — surfaces them verbatim", async () => {
    // Arrange
    const report: ProfileLoadReport = {
      profiles: [goodBikeProfile("a")],
      skipped: [{ path: "/profiles/bad.json", reason: "invalid JSON" }],
    };
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn().mockResolvedValue(report),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    };

    // Act
    const result = await loadProfiles(deps);

    // Assert
    expect(result.state.profiles).toHaveLength(1);
    expect(result.skipped).toEqual([{ path: "/profiles/bad.json", reason: "invalid JSON" }]);
  });

  it("loadProfiles — a profile whose config fails validation — is skipped, not silently defaulted", async () => {
    // Arrange
    const badProfile: BikeProfile = {
      profile_id: "bad-config",
      profile_name: "Bad config",
      created_at_ms: 1,
      updated_at_ms: 1,
      config: { imu: { sample_rate_hz: "not-a-number" } },
    };
    const report: ProfileLoadReport = { profiles: [badProfile], skipped: [] };
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn().mockResolvedValue(report),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn(),
    };

    // Act
    const result = await loadProfiles(deps);

    // Assert
    expect(result.state.profiles).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].path).toBe("bad-config");
    expect(result.skipped[0].reason).toContain("imu.sample_rate_hz");
  });
});

describe("persistProfile", () => {
  it("persistProfile — a save whose returned document differs from what was sent — the returned one wins", async () => {
    // Arrange
    const localView: ProfileView = {
      profile_id: "a",
      profile_name: "Local name",
      created_at_ms: 1,
      updated_at_ms: 5,
      config: defaultConfig("aabbccddeeff"),
    };
    const serverConfig = defaultConfig("aabbccddeeff");
    serverConfig.bike_profile.name = "Server-side name";
    const serverProfile: BikeProfile = {
      profile_id: "a",
      profile_name: "Server-renamed", // last-write-wins means the caller's own edit is what was sent, but the server response is authoritative
      created_at_ms: 1,
      updated_at_ms: 6,
      config: JSON.parse(JSON.stringify(serverConfig)) as Record<string, unknown>,
    };
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn(),
      saveProfile: vi.fn().mockResolvedValue(serverProfile),
      deleteProfile: vi.fn(),
    };

    // Act
    const outcome = await persistProfile(deps, localView);

    // Assert
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.profile.profile_name).toBe("Server-renamed");
      expect(outcome.profile.updated_at_ms).toBe(6);
      expect(outcome.profile.config.bike_profile.name).toBe("Server-side name");
    }
  });

  it("persistProfile — a save rejection — leaves local state untouched and is reported", async () => {
    // Arrange
    const localView: ProfileView = {
      profile_id: "a",
      profile_name: "Local name",
      created_at_ms: 1,
      updated_at_ms: 5,
      config: defaultConfig("aabbccddeeff"),
    };
    const rejection = { kind: "invalid_argument", message: "config must be a JSON object" };
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn(),
      saveProfile: vi.fn().mockRejectedValue(rejection),
      deleteProfile: vi.fn(),
    };

    // Act
    const outcome = await persistProfile(deps, localView);

    // Assert
    expect(outcome).toEqual({ ok: false, error: rejection });
  });
});

describe("removeProfile", () => {
  it("removeProfile — a successful delete — resolves ok", async () => {
    // Arrange
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn(),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn().mockResolvedValue(undefined),
    };

    // Act
    const outcome = await removeProfile(deps, "a");

    // Assert
    expect(outcome).toEqual({ ok: true });
  });

  it("removeProfile — deleting an id the backend says is not_found — reports the rejection rather than pretending success", async () => {
    // Arrange
    const rejection = { kind: "not_found", message: "no such profile" };
    const deps: ProfilesSyncDeps = {
      listProfiles: vi.fn(),
      saveProfile: vi.fn(),
      deleteProfile: vi.fn().mockRejectedValue(rejection),
    };

    // Act
    const outcome = await removeProfile(deps, "stale-id");

    // Assert
    expect(outcome).toEqual({ ok: false, error: rejection });
  });
});

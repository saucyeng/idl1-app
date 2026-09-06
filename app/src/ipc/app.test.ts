import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("getSettings", () => {
  it("get_settings resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const settings = { data_dir: null, rider_name: "Isaac", unit_system: "imperial" };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(settings);
    const { getSettings } = await import("./app");

    // Act
    const result = await getSettings();

    // Assert
    expect(result).toBe(settings);
    expect(invoke).toHaveBeenCalledWith("get_settings");
  });
});

describe("setSettings", () => {
  it("set_settings resolves — calls invoke with the settings argument and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const settings = { data_dir: null, rider_name: "Isaac", unit_system: "metric" as const };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(settings);
    const { setSettings } = await import("./app");

    // Act
    const result = await setSettings(settings);

    // Assert
    expect(result).toBe(settings);
    expect(invoke).toHaveBeenCalledWith("set_settings", { settings });
  });
});

describe("getDataDir", () => {
  it("get_data_dir resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const info = { resolved_path: "D:\\data", override_path: null, restart_required: false };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(info);
    const { getDataDir } = await import("./app");

    // Act
    const result = await getDataDir();

    // Assert
    expect(result).toBe(info);
    expect(invoke).toHaveBeenCalledWith("get_data_dir");
  });
});

describe("setDataDir", () => {
  it("set_data_dir resolves — calls invoke with the path argument and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const info = { resolved_path: "D:\\data", override_path: "D:\\race-data", restart_required: true };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(info);
    const { setDataDir } = await import("./app");

    // Act
    const result = await setDataDir("D:\\race-data");

    // Assert
    expect(result).toBe(info);
    expect(invoke).toHaveBeenCalledWith("set_data_dir", { path: "D:\\race-data" });
  });

  it("set_data_dir with null — clears the override", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ resolved_path: "D:\\data", override_path: null, restart_required: false });
    const { setDataDir } = await import("./app");

    // Act
    await setDataDir(null);

    // Assert
    expect(invoke).toHaveBeenCalledWith("set_data_dir", { path: null });
  });
});

describe("listProfiles", () => {
  it("list_profiles resolves — calls invoke with no arguments and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const report = { profiles: [], skipped: [] };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(report);
    const { listProfiles } = await import("./app");

    // Act
    const result = await listProfiles();

    // Assert
    expect(result).toBe(report);
    expect(invoke).toHaveBeenCalledWith("list_profiles");
  });
});

describe("saveProfile", () => {
  it("save_profile resolves — calls invoke with the profile argument and returns the value unchanged", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    const profile = { profile_id: "p1", profile_name: "Trek", created_at_ms: 1, updated_at_ms: 2, config: {} };
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(profile);
    const { saveProfile } = await import("./app");

    // Act
    const result = await saveProfile(profile);

    // Assert
    expect(result).toBe(profile);
    expect(invoke).toHaveBeenCalledWith("save_profile", { profile });
  });
});

describe("deleteProfile", () => {
  it("delete_profile resolves — calls invoke with the profile id", async () => {
    // Arrange
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { deleteProfile } = await import("./app");

    // Act
    await deleteProfile("p1");

    // Assert
    expect(invoke).toHaveBeenCalledWith("delete_profile", { profileId: "p1" });
  });
});

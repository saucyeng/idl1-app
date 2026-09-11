import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadAndInstall = vi.fn();
const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));

beforeEach(() => {
  checkMock.mockReset();
  downloadAndInstall.mockReset();
  relaunchMock.mockReset();
  // `ipc/updater.ts` keeps `pending` as module-level state; without this,
  // the singleton persists across tests in this file even though each one
  // re-imports it (the import cache is what's shared).
  vi.resetModules();
});

describe("checkForUpdate", () => {
  it("check() resolves null — returns null", async () => {
    // Arrange
    checkMock.mockResolvedValue(null);
    const { checkForUpdate } = await import("./updater");

    // Act
    const info = await checkForUpdate();

    // Assert
    expect(info).toBeNull();
  });

  it("check() resolves an update — returns its version, body and date", async () => {
    // Arrange
    checkMock.mockResolvedValue({ version: "0.2.0", date: "2026-09-11", body: "### Added\n- thing", downloadAndInstall });
    const { checkForUpdate } = await import("./updater");

    // Act
    const info = await checkForUpdate();

    // Assert
    expect(info).toEqual({ version: "0.2.0", notes: "### Added\n- thing", date: "2026-09-11" });
  });

  it("check() resolves an update with no body or date — notes empty, date null", async () => {
    // Arrange
    checkMock.mockResolvedValue({ version: "0.2.0", downloadAndInstall });
    const { checkForUpdate } = await import("./updater");

    // Act
    const info = await checkForUpdate();

    // Assert
    expect(info).toEqual({ version: "0.2.0", notes: "", date: null });
  });
});

describe("downloadAndInstallUpdate", () => {
  it("no prior checkForUpdate call — throws rather than calling the plugin", async () => {
    // Arrange
    const { downloadAndInstallUpdate } = await import("./updater");

    // Act / Assert
    await expect(downloadAndInstallUpdate(() => {})).rejects.toThrow(/check/);
  });

  it("a pending update — reports whole-percent progress from Started/Progress/Finished events", async () => {
    // Arrange
    checkMock.mockResolvedValue({
      version: "0.2.0",
      downloadAndInstall: (onEvent: (e: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 200 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Finished" });
        return Promise.resolve();
      },
    });
    const { checkForUpdate, downloadAndInstallUpdate } = await import("./updater");
    await checkForUpdate();
    const progress: number[] = [];

    // Act
    await downloadAndInstallUpdate((pct) => progress.push(pct));

    // Assert
    expect(progress).toEqual([50, 100, 100]);
  });

  it("after installing — a second call throws again (the pending update is consumed)", async () => {
    // Arrange
    checkMock.mockResolvedValue({
      version: "0.2.0",
      downloadAndInstall: (onEvent: (e: unknown) => void) => {
        onEvent({ event: "Finished" });
        return Promise.resolve();
      },
    });
    const { checkForUpdate, downloadAndInstallUpdate } = await import("./updater");
    await checkForUpdate();
    await downloadAndInstallUpdate(() => {});

    // Act / Assert
    await expect(downloadAndInstallUpdate(() => {})).rejects.toThrow(/check/);
  });
});

describe("relaunchApp", () => {
  it("calls the process plugin's relaunch", async () => {
    // Arrange
    relaunchMock.mockResolvedValue(undefined);
    const { relaunchApp } = await import("./updater");

    // Act
    await relaunchApp();

    // Assert
    expect(relaunchMock).toHaveBeenCalledOnce();
  });
});

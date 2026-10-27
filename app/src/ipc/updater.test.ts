import { beforeEach, describe, expect, it, vi } from "vitest";

const installMock = vi.fn();
const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({ check: checkMock }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: relaunchMock }));

beforeEach(() => {
  checkMock.mockReset();
  installMock.mockReset();
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
    checkMock.mockResolvedValue({ version: "0.2.0", date: "2026-09-11", body: "### Added\n- thing", install: installMock });
    const { checkForUpdate } = await import("./updater");

    // Act
    const info = await checkForUpdate();

    // Assert
    expect(info).toEqual({ version: "0.2.0", notes: "### Added\n- thing", date: "2026-09-11" });
  });

  it("check() resolves an update with no body or date — notes empty, date null", async () => {
    // Arrange
    checkMock.mockResolvedValue({ version: "0.2.0", install: installMock });
    const { checkForUpdate } = await import("./updater");

    // Act
    const info = await checkForUpdate();

    // Assert
    expect(info).toEqual({ version: "0.2.0", notes: "", date: null });
  });
});

describe("downloadUpdate", () => {
  it("no prior checkForUpdate call — throws rather than calling the plugin", async () => {
    // Arrange
    const { downloadUpdate } = await import("./updater");

    // Act / Assert
    await expect(downloadUpdate(() => {})).rejects.toThrow(/check/);
  });

  it("a pending update — reports whole-percent progress from Started/Progress/Finished events", async () => {
    // Arrange
    checkMock.mockResolvedValue({
      version: "0.2.0",
      download: (onEvent: (e: unknown) => void) => {
        onEvent({ event: "Started", data: { contentLength: 200 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Progress", data: { chunkLength: 100 } });
        onEvent({ event: "Finished" });
        return Promise.resolve();
      },
      install: installMock,
    });
    const { checkForUpdate, downloadUpdate } = await import("./updater");
    await checkForUpdate();
    const progress: number[] = [];

    // Act
    await downloadUpdate((pct) => progress.push(pct));

    // Assert
    expect(progress).toEqual([50, 100, 100]);
    expect(installMock).not.toHaveBeenCalled();
  });
});

describe("installUpdate", () => {
  it("found but not downloaded — throws rather than calling the plugin", async () => {
    // Arrange
    checkMock.mockResolvedValue({ version: "0.2.0", download: () => Promise.resolve(), install: installMock });
    const { checkForUpdate, installUpdate } = await import("./updater");
    await checkForUpdate();

    // Act / Assert
    await expect(installUpdate()).rejects.toThrow(/downloadUpdate/);
    expect(installMock).not.toHaveBeenCalled();
  });

  it("downloaded — installs; a second call throws (the update is consumed)", async () => {
    // Arrange
    installMock.mockResolvedValue(undefined);
    checkMock.mockResolvedValue({ version: "0.2.0", download: () => Promise.resolve(), install: installMock });
    const { checkForUpdate, downloadUpdate, installUpdate } = await import("./updater");
    await checkForUpdate();
    await downloadUpdate(() => {});

    // Act
    await installUpdate();

    // Assert
    expect(installMock).toHaveBeenCalledOnce();
    await expect(installUpdate()).rejects.toThrow(/downloadUpdate/);
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

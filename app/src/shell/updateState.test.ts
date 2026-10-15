import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clampPct,
  dismissUpdate,
  getUpdateState,
  LAUNCH_CHECK_DELAY_MS,
  RECHECK_INTERVAL_MS,
  restartToUpdate,
  resetUpdateStateForTests,
  runUpdateCheck,
  startUpdateChecker,
  updateChipLabel,
  versionLabel,
  type UpdateIO,
} from "./updateState";

function fakeIo(overrides: Partial<UpdateIO> = {}): UpdateIO {
  return {
    checkForUpdate: vi.fn().mockResolvedValue(null),
    downloadAndInstallUpdate: vi.fn().mockResolvedValue(undefined),
    relaunchApp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  resetUpdateStateForTests();
});

describe("clampPct", () => {
  it("in range — unchanged, rounded", () => {
    expect(clampPct(42.6)).toBe(43);
  });

  it("above 100 — clamped to 100", () => {
    expect(clampPct(140)).toBe(100);
  });

  it("negative — clamped to 0", () => {
    expect(clampPct(-5)).toBe(0);
  });

  it("NaN — 0", () => {
    expect(clampPct(NaN)).toBe(0);
  });
});

describe("updateChipLabel", () => {
  it("idle — null", () => {
    expect(updateChipLabel({ kind: "idle" })).toBeNull();
  });

  it("checking — null", () => {
    expect(updateChipLabel({ kind: "checking" })).toBeNull();
  });

  it("available — names the version", () => {
    expect(updateChipLabel({ kind: "available", version: "0.2.0", notes: "", date: null })).toBe(
      "Update available · v0.2.0"
    );
  });

  it("downloading — names the percent", () => {
    expect(updateChipLabel({ kind: "downloading", pct: 40 })).toBe("Downloading update · 40%");
  });

  it("ready — says restart to apply", () => {
    expect(updateChipLabel({ kind: "ready" })).toBe("Update ready · restart to apply");
  });

  it("error — null (a failed check is silent in the status bar)", () => {
    expect(updateChipLabel({ kind: "error", message: "boom" })).toBeNull();
  });
});

describe("runUpdateCheck", () => {
  it("no update found — idle via checking", async () => {
    // Arrange
    const io = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue(null) });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "idle" });
  });

  it("an update found — available with its fields", async () => {
    // Arrange
    const io = fakeIo({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "### Added", date: "2026-09-11" }),
    });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "available", version: "0.2.0", notes: "### Added", date: "2026-09-11" });
  });

  it("the check rejects — error with the message, never throws", async () => {
    // Arrange
    const io = fakeIo({ checkForUpdate: vi.fn().mockRejectedValue(new Error("network down")) });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "error", message: "network down" });
  });

  it("state is downloading — does not run (never interrupts an in-flight install)", async () => {
    // Arrange
    const availableIo = fakeIo({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }),
      downloadAndInstallUpdate: vi.fn(() => new Promise<void>(() => {})), // never resolves — stays "downloading"
    });
    await runUpdateCheck(availableIo);
    void restartToUpdate(availableIo);
    await Promise.resolve();
    expect(getUpdateState().kind).toBe("downloading");
    const recheckIo = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.3.0", notes: "", date: null }) });

    // Act
    await runUpdateCheck(recheckIo);

    // Assert
    expect(getUpdateState().kind).toBe("downloading");
    expect(recheckIo.checkForUpdate).not.toHaveBeenCalled();
  });
});

describe("restartToUpdate", () => {
  it("not available — no-op", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    await restartToUpdate(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "idle" });
    expect(io.downloadAndInstallUpdate).not.toHaveBeenCalled();
  });

  it("available — downloads with progress, installs, relaunches, ends ready", async () => {
    // Arrange
    const checkIo = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) });
    await runUpdateCheck(checkIo);
    const progressSeen: number[] = [];
    const io = fakeIo({
      downloadAndInstallUpdate: vi.fn(async (onProgress: (pct: number) => void) => {
        onProgress(50);
        progressSeen.push(50);
        onProgress(100);
        progressSeen.push(100);
      }),
    });

    // Act
    await restartToUpdate(io);

    // Assert
    expect(progressSeen).toEqual([50, 100]);
    expect(io.relaunchApp).toHaveBeenCalledOnce();
    expect(getUpdateState()).toEqual({ kind: "ready" });
  });

  it("the download rejects — error with the message", async () => {
    // Arrange
    const checkIo = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) });
    await runUpdateCheck(checkIo);
    const io = fakeIo({ downloadAndInstallUpdate: vi.fn().mockRejectedValue(new Error("disk full")) });

    // Act
    await restartToUpdate(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "error", message: "disk full" });
    expect(io.relaunchApp).not.toHaveBeenCalled();
  });
});

describe("dismissUpdate", () => {
  it("available — drops to idle", async () => {
    // Arrange
    const io = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) });
    await runUpdateCheck(io);

    // Act
    dismissUpdate();

    // Assert
    expect(getUpdateState()).toEqual({ kind: "idle" });
  });

  it("idle — no-op", () => {
    // Act
    dismissUpdate();

    // Assert
    expect(getUpdateState()).toEqual({ kind: "idle" });
  });
});

describe("startUpdateChecker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("before the launch delay — never checks", () => {
    // Arrange
    const io = fakeIo();

    // Act
    startUpdateChecker(io);
    vi.advanceTimersByTime(LAUNCH_CHECK_DELAY_MS - 1);

    // Assert
    expect(io.checkForUpdate).not.toHaveBeenCalled();
  });

  it("at the launch delay — checks once, then again every recheck interval", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    startUpdateChecker(io);
    await vi.advanceTimersByTimeAsync(LAUNCH_CHECK_DELAY_MS);
    expect(io.checkForUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS);

    // Assert
    expect(io.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("stopped before the launch delay — never checks", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    const stop = startUpdateChecker(io);
    stop();
    await vi.advanceTimersByTimeAsync(LAUNCH_CHECK_DELAY_MS + RECHECK_INTERVAL_MS);

    // Assert
    expect(io.checkForUpdate).not.toHaveBeenCalled();
  });

  it("stopped after the first check — no further rechecks", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    const stop = startUpdateChecker(io);
    await vi.advanceTimersByTimeAsync(LAUNCH_CHECK_DELAY_MS);
    stop();
    await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS * 2);

    // Assert
    expect(io.checkForUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("startUpdateChecker — options", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A resume source the test fires by hand. */
  function resumeSource() {
    let fire: () => void = () => {};
    const onResume = vi.fn((handler: () => void) => {
      fire = handler;
      return () => {
        fire = () => {};
      };
    });
    return { onResume, resume: () => fire() };
  }

  it("launchDelayMs — the first check runs at that delay", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    startUpdateChecker(io, { launchDelayMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    // Assert
    expect(io.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("resume before the launch check — left to the timer", async () => {
    // Arrange
    const io = fakeIo();
    const { onResume, resume } = resumeSource();
    startUpdateChecker(io, { onResume });

    // Act
    resume();
    await Promise.resolve();

    // Assert
    expect(io.checkForUpdate).not.toHaveBeenCalled();
  });

  it("resume — rechecks only once the last check is old enough", async () => {
    // Arrange
    const io = fakeIo();
    let clock = 0;
    const { onResume, resume } = resumeSource();
    startUpdateChecker(io, { launchDelayMs: 0, onResume, resumeMinAgeMs: 1_000, now: () => clock });
    await vi.advanceTimersByTimeAsync(0);
    expect(io.checkForUpdate).toHaveBeenCalledTimes(1);

    // Act
    clock = 999;
    resume();
    const afterEarlyResume = (io.checkForUpdate as ReturnType<typeof vi.fn>).mock.calls.length;
    clock = 1_000;
    resume();

    // Assert
    expect(afterEarlyResume).toBe(1);
    expect(io.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it("stop — unsubscribes from resume", () => {
    // Arrange
    let unsubscribed = false;
    const stop = startUpdateChecker(fakeIo(), { onResume: () => () => (unsubscribed = true) });

    // Act
    stop();

    // Assert
    expect(unsubscribed).toBe(true);
  });
});

describe("channel-check releases", () => {
  it("a check that returns a link — available carries it", async () => {
    // Arrange
    const io = fakeIo({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "build 19", notes: "", date: null, link: "https://example.invalid/a.apk" }),
    });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "available", version: "build 19", notes: "", date: null, link: "https://example.invalid/a.apk" });
  });

  it("versionLabel — semver gets a v, a build label does not", () => {
    expect(versionLabel("0.2.0")).toBe("v0.2.0");
    expect(versionLabel("build 19")).toBe("build 19");
    expect(updateChipLabel({ kind: "available", version: "build 19", notes: "", date: null })).toBe("Update available · build 19");
  });
});

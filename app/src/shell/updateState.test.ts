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
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    installUpdate: vi.fn().mockResolvedValue(undefined),
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

  it("downloading — null (the download runs in the background)", () => {
    expect(updateChipLabel({ kind: "downloading", pct: 40 })).toBeNull();
  });

  it("ready — says restart to apply", () => {
    expect(updateChipLabel({ kind: "ready" })).toBe("Update ready · restart to apply");
  });

  it("installing — says so", () => {
    expect(updateChipLabel({ kind: "installing" })).toBe("Installing update…");
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

  it("an in-place update found — downloaded in the background with progress, ends ready", async () => {
    // Arrange
    const seen: unknown[] = [];
    const io = fakeIo({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "### Added", date: "2026-09-11" }),
      downloadUpdate: vi.fn(async (onProgress: (pct: number) => void) => {
        seen.push(getUpdateState());
        onProgress(50);
        seen.push(getUpdateState());
      }),
    });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(seen).toEqual([{ kind: "downloading", pct: 0 }, { kind: "downloading", pct: 50 }]);
    expect(io.installUpdate).not.toHaveBeenCalled();
    expect(getUpdateState()).toEqual({ kind: "ready" });
  });

  it("the background download rejects — error with the message", async () => {
    // Arrange
    const io = fakeIo({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }),
      downloadUpdate: vi.fn().mockRejectedValue(new Error("disk full")),
    });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "error", message: "disk full" });
  });

  it("the check rejects — error with the message, never throws", async () => {
    // Arrange
    const io = fakeIo({ checkForUpdate: vi.fn().mockRejectedValue(new Error("network down")) });

    // Act
    await runUpdateCheck(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "error", message: "network down" });
  });

  it("state is downloading — does not run (never interrupts an in-flight download)", async () => {
    // Arrange
    const firstIo = fakeIo({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }),
      downloadUpdate: vi.fn(() => new Promise<void>(() => {})), // never resolves — stays "downloading"
    });
    void runUpdateCheck(firstIo);
    await vi.waitFor(() => expect(getUpdateState().kind).toBe("downloading"));
    const recheckIo = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.3.0", notes: "", date: null }) });

    // Act
    await runUpdateCheck(recheckIo);

    // Assert
    expect(getUpdateState().kind).toBe("downloading");
    expect(recheckIo.checkForUpdate).not.toHaveBeenCalled();
  });

  it("state is ready — does not run (the download waits for its restart)", async () => {
    // Arrange
    await runUpdateCheck(fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) }));
    const recheckIo = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.3.0", notes: "", date: null }) });

    // Act
    await runUpdateCheck(recheckIo);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "ready" });
    expect(recheckIo.checkForUpdate).not.toHaveBeenCalled();
  });
});

describe("restartToUpdate", () => {
  it("not ready — no-op", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    await restartToUpdate(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "idle" });
    expect(io.installUpdate).not.toHaveBeenCalled();
  });

  it("ready — installs then relaunches, installing meanwhile", async () => {
    // Arrange
    await runUpdateCheck(fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) }));
    let stateDuringInstall = "";
    const io = fakeIo({
      installUpdate: vi.fn(async () => {
        stateDuringInstall = getUpdateState().kind;
      }),
    });

    // Act
    await restartToUpdate(io);

    // Assert
    expect(stateDuringInstall).toBe("installing");
    expect(io.relaunchApp).toHaveBeenCalledOnce();
  });

  it("the install rejects — error with the message, no relaunch", async () => {
    // Arrange
    await runUpdateCheck(fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) }));
    const io = fakeIo({ installUpdate: vi.fn().mockRejectedValue(new Error("password prompt dismissed")) });

    // Act
    await restartToUpdate(io);

    // Assert
    expect(getUpdateState()).toEqual({ kind: "error", message: "password prompt dismissed" });
    expect(io.relaunchApp).not.toHaveBeenCalled();
  });
});

describe("dismissUpdate", () => {
  it("available — drops to idle", async () => {
    // Arrange
    const io = fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null, link: "https://example.invalid/a" }) });
    await runUpdateCheck(io);

    // Act
    dismissUpdate();

    // Assert
    expect(getUpdateState()).toEqual({ kind: "idle" });
  });

  it("ready — stays ready (the download is kept)", async () => {
    // Arrange
    await runUpdateCheck(fakeIo({ checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", notes: "", date: null }) }));

    // Act
    dismissUpdate();

    // Assert
    expect(getUpdateState()).toEqual({ kind: "ready" });
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

  it("launchDelayMs — the first check runs at that delay", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    startUpdateChecker(io, { launchDelayMs: 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    // Assert
    expect(io.checkForUpdate).toHaveBeenCalledOnce();
  });

  it("recheckIntervalMs null — checks at launch only", async () => {
    // Arrange
    const io = fakeIo();

    // Act
    startUpdateChecker(io, { launchDelayMs: 5_000, recheckIntervalMs: null });
    await vi.advanceTimersByTimeAsync(5_000 + RECHECK_INTERVAL_MS * 3);

    // Assert
    expect(io.checkForUpdate).toHaveBeenCalledOnce();
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
    expect(io.downloadUpdate).not.toHaveBeenCalled();
  });

  it("versionLabel — semver gets a v, a build label does not", () => {
    expect(versionLabel("0.2.0")).toBe("v0.2.0");
    expect(versionLabel("build 19")).toBe("build 19");
    expect(updateChipLabel({ kind: "available", version: "build 19", notes: "", date: null })).toBe("Update available · build 19");
  });
});

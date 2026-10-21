import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { combinedReport, crashReports, dismissCrashReports, shareCrashReport } from "./crash";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("crash reports IPC", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("crashReports — called — invokes crash_reports with no arguments", async () => {
    vi.mocked(invoke).mockResolvedValue([]);

    const reports = await crashReports();

    expect(invoke).toHaveBeenCalledWith("crash_reports");
    expect(reports).toEqual([]);
  });

  it("dismissCrashReports — ids — passes them through", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await dismissCrashReports(["panic-1.txt"]);

    expect(invoke).toHaveBeenCalledWith("dismiss_crash_reports", { ids: ["panic-1.txt"] });
  });

  it("shareCrashReport — text — passes it through", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await shareCrashReport("boom");

    expect(invoke).toHaveBeenCalledWith("share_crash_report", { text: "boom" });
  });
});

describe("combinedReport", () => {
  it("combinedReport — two reports — each headed by UTC time and id, in the given order", () => {
    const reports = [
      { id: "panic-2000.txt", at_ms: 2000, text: "second\n\n" },
      { id: "exit-1000.txt", at_ms: 1000, text: "first" },
    ];

    const text = combinedReport(reports);

    expect(text).toBe(
      "=== 1970-01-01T00:00:02.000Z (panic-2000.txt) ===\nsecond\n\n=== 1970-01-01T00:00:01.000Z (exit-1000.txt) ===\nfirst\n",
    );
  });

  it("combinedReport — no reports — is empty", () => {
    const text = combinedReport([]);

    expect(text).toBe("");
  });
});

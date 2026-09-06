import { describe, expect, it } from "vitest";

import type { QuarantineEntry, VerifyReport } from "../../../ipc/maintenance";
import { formatQuarantineEntry, summarizeVerifyReport } from "./quarantinePanel";

describe("formatQuarantineEntry", () => {
  it("formatQuarantineEntry — known original_path — names the reason, date and source path", () => {
    const entry: QuarantineEntry = {
      entry_id: "e1",
      path: "/data/tmp/quarantine/e1-blob",
      original_path: "/data/blobs/sha256/ab/c",
      reason: "hash mismatch",
      quarantined_at_ms: Date.UTC(2026, 8, 6),
    };

    const text = formatQuarantineEntry(entry);

    expect(text).toContain("hash mismatch");
    expect(text).toContain("(from /data/blobs/sha256/ab/c)");
  });

  it("formatQuarantineEntry — empty original_path — omits the parenthetical", () => {
    const entry: QuarantineEntry = {
      entry_id: "e2",
      path: "/data/tmp/quarantine/e2-blob",
      original_path: "",
      reason: "unknown (no sidecar)",
      quarantined_at_ms: Date.UTC(2026, 8, 6),
    };

    const text = formatQuarantineEntry(entry);

    expect(text).not.toContain("(from");
    expect(text).toContain("unknown (no sidecar)");
  });
});

describe("summarizeVerifyReport", () => {
  it("summarizeVerifyReport — no findings — reads as no issues found", () => {
    const report: VerifyReport = { findings: [], quarantined: [], elapsed_ms: 1200 };

    const summary = summarizeVerifyReport(report, false);

    expect(summary).toBe("No issues found (1.2 s).");
  });

  it("summarizeVerifyReport — mixed severities, repair false — names counts, no quarantine sentence", () => {
    const report: VerifyReport = {
      findings: [
        { severity: "error", path: "p1", message: "m1" },
        { severity: "warning", path: "p2", message: "m2" },
        { severity: "warning", path: "p3", message: "m3" },
      ],
      quarantined: [],
      elapsed_ms: 500,
    };

    const summary = summarizeVerifyReport(report, false);

    expect(summary).toBe("3 findings (1 error, 2 warnings) in 0.5 s.");
  });

  it("summarizeVerifyReport — repair true with a quarantined file — names it quarantined", () => {
    const report: VerifyReport = {
      findings: [{ severity: "error", path: "p1", message: "m1" }],
      quarantined: [{ entry_id: "e1", path: "p", original_path: "op", reason: "r", quarantined_at_ms: 1 }],
      elapsed_ms: 800,
    };

    const summary = summarizeVerifyReport(report, true);

    expect(summary).toContain("1 file quarantined.");
  });

  it("summarizeVerifyReport — repair true with findings but nothing quarantined — says so explicitly", () => {
    const report: VerifyReport = {
      findings: [{ severity: "info", path: "p1", message: "m1" }],
      quarantined: [],
      elapsed_ms: 300,
    };

    const summary = summarizeVerifyReport(report, true);

    expect(summary).toContain("Nothing needed quarantining.");
  });
});

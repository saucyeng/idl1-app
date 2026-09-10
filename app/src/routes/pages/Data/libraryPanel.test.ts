import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../ipc/catalog";
import type { InboxStatus, ReimportReport, ScanEntry, StaleSession } from "../../../ipc/library";
import {
  defaultSelectedPaths,
  describeInboxStatus,
  importablePaths,
  importableRows,
  parseStartInput,
  selectedRows,
  togglePath,
  shouldPromptForStart,
  staleRebuildLabel,
  summarizeReimportReport,
  summarizeScanPreview,
  summarizeStaleSessions,
  toScanPreviewRows,
} from "./libraryPanel";

function entry(over: Partial<ScanEntry> = {}): ScanEntry {
  return {
    path: "C:\\rides\\a.idl0",
    file_name: "a.idl0",
    size_bytes: 2048,
    importer_id: "idl0",
    already_imported: false,
    session_start_utc_ms: 0,
    ...over,
  };
}

describe("toScanPreviewRows", () => {
  it("toScanPreviewRows — a fresh importable file — is importable with no skip reason", () => {
    const rows = toScanPreviewRows([entry()]);

    expect(rows[0].importable).toBe(true);
    expect(rows[0].skipReason).toBeNull();
    expect(rows[0].sizeText).toBe("2.0 KB");
    expect(rows[0].importerText).toBe("idl0");
  });

  it("toScanPreviewRows — an already-imported file — is listed but not importable", () => {
    const rows = toScanPreviewRows([entry({ already_imported: true })]);

    expect(rows[0].importable).toBe(false);
    expect(rows[0].skipReason).toBe("already imported");
  });

  it("toScanPreviewRows — no importer covers the extension — reads as no importer", () => {
    const rows = toScanPreviewRows([entry({ file_name: "notes.txt", importer_id: null, session_start_utc_ms: null })]);

    expect(rows[0].importerText).toBe("—");
    expect(rows[0].startText).toBe("—");
    expect(rows[0].skipReason).toBe("no importer");
  });

  it("toScanPreviewRows — a header peek of 0 — start reads unknown, never 1970", () => {
    const rows = toScanPreviewRows([entry({ session_start_utc_ms: 0 })]);

    expect(rows[0].startText).toBe("unknown");
  });

  it("toScanPreviewRows — a real header start — start is rendered, not unknown", () => {
    const rows = toScanPreviewRows([entry({ session_start_utc_ms: Date.UTC(2026, 8, 10, 12, 0) })]);

    expect(rows[0].startText).not.toBe("unknown");
    expect(rows[0].startText).toContain("2026");
  });
});

describe("importableRows", () => {
  it("importableRows — a mixed-format folder — each row keeps its own detected importer id", () => {
    const rows = toScanPreviewRows([
      entry({ path: "a", file_name: "a.idl0", importer_id: "idl0" }),
      entry({ path: "b", file_name: "b.gpx", importer_id: "gpx", session_start_utc_ms: null }),
    ]);

    const importable = importableRows(rows);

    expect(importable.map((row) => row.importerId)).toEqual(["idl0", "gpx"]);
  });
});

describe("importablePaths", () => {
  it("importablePaths — a mixed folder — returns only the importable rows' paths", () => {
    const rows = toScanPreviewRows([
      entry({ path: "a", file_name: "a.idl0" }),
      entry({ path: "b", file_name: "b.idl0", already_imported: true }),
      entry({ path: "c", file_name: "c.txt", importer_id: null }),
    ]);

    const paths = importablePaths(rows);

    expect(paths).toEqual(["a"]);
  });
});

describe("summarizeScanPreview", () => {
  it("summarizeScanPreview — an empty folder — says so instead of counting to zero", () => {
    const text = summarizeScanPreview([]);

    expect(text).toBe("No files in that folder.");
  });

  it("summarizeScanPreview — skipped files — names each reason with its count", () => {
    const rows = toScanPreviewRows([
      entry({ path: "a", file_name: "a.idl0" }),
      entry({ path: "b", file_name: "b.idl0", already_imported: true }),
      entry({ path: "c", file_name: "c.txt", importer_id: null }),
    ]);

    const text = summarizeScanPreview(rows);

    expect(text).toBe("1 of 3 files can be imported (1 already imported, 1 with no importer).");
  });

  it("summarizeScanPreview — nothing skipped — omits the parenthetical entirely", () => {
    const text = summarizeScanPreview(toScanPreviewRows([entry()]));

    expect(text).toBe("1 of 1 file can be imported.");
  });
});

function stale(over: Partial<StaleSession> = {}): StaleSession {
  return { session_id: "s1", importer_id: "idl0", stored_version: "0.0.1", current_version: "0.1.0", ...over };
}

describe("staleRebuildLabel", () => {
  it("staleRebuildLabel — nothing stale — is null so no no-op button is offered", () => {
    expect(staleRebuildLabel([])).toBeNull();
  });

  it("staleRebuildLabel — one stale session — is singular", () => {
    expect(staleRebuildLabel([stale()])).toBe("Rebuild 1 stale session");
  });

  it("staleRebuildLabel — several stale sessions — is plural", () => {
    expect(staleRebuildLabel([stale(), stale({ session_id: "s2" })])).toBe("Rebuild 2 stale sessions");
  });
});

describe("summarizeStaleSessions", () => {
  it("summarizeStaleSessions — many sessions from one build — names the version step once", () => {
    const text = summarizeStaleSessions([stale(), stale({ session_id: "s2" }), stale({ session_id: "s3" })]);

    expect(text).toBe("3 sessions to rebuild: idl0 0.0.1 → 0.1.0.");
  });

  it("summarizeStaleSessions — nothing stale — says everything is current", () => {
    expect(summarizeStaleSessions([])).toBe("Every session was built with the current importer.");
  });
});

describe("summarizeReimportReport", () => {
  it("summarizeReimportReport — every session rebuilt — is one clean sentence", () => {
    const report: ReimportReport = { rebuilt: ["s1", "s2"], failed: [] };

    expect(summarizeReimportReport(report)).toBe("Rebuilt 2 sessions.");
  });

  it("summarizeReimportReport — a partial batch — reports the failures without hiding the successes", () => {
    const report: ReimportReport = {
      rebuilt: ["s1"],
      failed: [{ session_id: "s2", error: { kind: "io", message: "blob missing" } }],
    };

    const text = summarizeReimportReport(report);

    expect(text).toContain("Rebuilt 1 session.");
    expect(text).toContain("1 session failed: s2 (");
  });
});

function detail(timestampUtcMs: number): SessionDetail {
  return { timestamp_utc_ms: timestampUtcMs } as SessionDetail;
}

describe("shouldPromptForStart", () => {
  it("shouldPromptForStart — a start of 0 — prompts", () => {
    expect(shouldPromptForStart(detail(0))).toBe(true);
  });

  it("shouldPromptForStart — a known start — does not prompt, even though the command would accept one", () => {
    expect(shouldPromptForStart(detail(1_700_000_000_000))).toBe(false);
  });
});

describe("parseStartInput", () => {
  it("parseStartInput — a datetime-local value — is that local wall-clock time in epoch ms", () => {
    const ms = parseStartInput("2026-09-10T14:30");

    expect(ms).toBe(new Date(2026, 8, 10, 14, 30).getTime());
  });

  it("parseStartInput — blank or unparseable input — is null", () => {
    expect(parseStartInput("")).toBeNull();
    expect(parseStartInput("   ")).toBeNull();
    expect(parseStartInput("not a date")).toBeNull();
  });

  it("parseStartInput — the epoch itself — is null, matching the command's invalid_argument rule", () => {
    expect(parseStartInput("1970-01-01T00:00:00Z")).toBeNull();
  });
});

describe("describeInboxStatus", () => {
  it("describeInboxStatus — a quiet inbox — still names the folder to drop files into", () => {
    const status: InboxStatus = { path: "C:\\data\\inbox", imported_since_launch: 0, failed: [] };

    expect(describeInboxStatus(status)).toBe("Inbox: C:\\data\\inbox — 0 imported since launch.");
  });

  it("describeInboxStatus — failures present — counts them", () => {
    const status: InboxStatus = {
      path: "/data/inbox",
      imported_since_launch: 3,
      failed: [{ file_name: "broken.idl0", error: { kind: "parse_invalid_magic_bytes", message: "bad" } }],
    };

    expect(describeInboxStatus(status)).toBe("Inbox: /data/inbox — 3 imported since launch, 1 failed.");
  });
});

describe("toScanPreviewRows — unchecked already_imported", () => {
  it("toScanPreviewRows — already_imported null — the row is importable and reads \"checked on import\"", () => {
    const rows = toScanPreviewRows([entry({ already_imported: null })]);

    expect(rows[0].importable).toBe(true);
    expect(rows[0].skipReason).toBeNull();
    expect(rows[0].alreadyText).toBe("checked on import");
  });

  it("toScanPreviewRows — already_imported true or false — the column still reads yes or no", () => {
    const rows = toScanPreviewRows([
      entry({ path: "a", already_imported: true }),
      entry({ path: "b", already_imported: false }),
    ]);

    expect(rows.map((row) => row.alreadyText)).toEqual(["yes", "no"]);
  });
});

describe("preview selection", () => {
  it("defaultSelectedPaths — a mixed folder — every importable row starts selected", () => {
    const rows = toScanPreviewRows([
      entry({ path: "a", file_name: "a.idl0", already_imported: null }),
      entry({ path: "b", file_name: "b.txt", importer_id: null }),
    ]);

    const selected = defaultSelectedPaths(rows);

    expect(selected).toEqual(["a"]);
  });

  it("togglePath — a path already selected — is removed, and the input array is untouched", () => {
    const selected = ["a", "b"];

    const next = togglePath(selected, "a");

    expect(next).toEqual(["b"]);
    expect(selected).toEqual(["a", "b"]);
  });

  it("togglePath — a path not selected — is added", () => {
    const next = togglePath(["a"], "b");

    expect(next).toEqual(["a", "b"]);
  });

  it("selectedRows — a selection in click order — returns the rows in preview order", () => {
    const rows = toScanPreviewRows([
      entry({ path: "a", file_name: "a.idl0", already_imported: null }),
      entry({ path: "b", file_name: "b.idl0", already_imported: null }),
      entry({ path: "c", file_name: "c.idl0", already_imported: null }),
    ]);

    const chosen = selectedRows(rows, ["c", "a"]);

    expect(chosen.map((row) => row.path)).toEqual(["a", "c"]);
  });

  it("selectedRows — a selection naming a non-importable row — never returns it", () => {
    const rows = toScanPreviewRows([entry({ path: "b", file_name: "b.txt", importer_id: null })]);

    const chosen = selectedRows(rows, ["b"]);

    expect(chosen).toEqual([]);
  });
});

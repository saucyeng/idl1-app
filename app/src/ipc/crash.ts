import { invoke } from "@tauri-apps/api/core";

/** One pending crash report (C3 §3.13, added 2026-10-21). */
export interface CrashReport {
  /** The report's file name. */
  id: string;
  /** When it was written, ms since the Unix epoch. */
  at_ms: number;
  /** The report text (at most 64 KiB). */
  text: string;
}

/** Pending crash reports, newest first (`crash_reports`). */
export async function crashReports(): Promise<CrashReport[]> {
  return invoke<CrashReport[]>("crash_reports");
}

/** Marks reports as dealt with (`dismiss_crash_reports`). */
export async function dismissCrashReports(ids: string[]): Promise<void> {
  return invoke<void>("dismiss_crash_reports", { ids });
}

/** Android's share sheet with `text` (`share_crash_report`). */
export async function shareCrashReport(text: string): Promise<void> {
  return invoke<void>("share_crash_report", { text });
}

/** Every report as one text to share or copy, newest first, each headed by
 *  its time in UTC. */
export function combinedReport(reports: CrashReport[]): string {
  return reports
    .map((r) => `=== ${new Date(r.at_ms).toISOString()} (${r.id}) ===\n${r.text.trimEnd()}\n`)
    .join("\n");
}

import { invoke } from "@tauri-apps/api/core";

/** One quarantined file (C3 §3.2, ruling R86). A payload already inside
 *  `<data>` whose bytes failed their own content-address check
 *  (C4 §7 findings #1/#5), moved (never deleted) to
 *  `tmp/quarantine/<uuid>-<original-name>` by `verifyDataDir(repair: true)`
 *  — the sole producer. */
export interface QuarantineEntry {
  /** The uuid in the filename. */
  entry_id: string;
  /** Absolute, under `<data>/tmp/quarantine/`. */
  path: string;
  /** Where the payload was pulled from, `""` if unknown. */
  original_path: string;
  /** C4 §7 finding text. */
  reason: string;
  /** i64 */
  quarantined_at_ms: number;
}

/** Lists every quarantined entry (C3 §3.2). Never on a hot path — explicit
 *  review action. */
export async function listQuarantine(): Promise<QuarantineEntry[]> {
  return invoke<QuarantineEntry[]>("list_quarantine");
}

/** Resolves one quarantined entry (C3 §3.2, ruling R86 Q2). `"restore"`
 *  moves the payload back to `original_path` when that path is free
 *  (`invalid_argument` if occupied); `"discard"` deletes the payload
 *  outright. Both then delete the sidecar. Explicit, destructive-adjacent
 *  user action — confirm `"discard"` first. */
export async function resolveQuarantine(entryId: string, action: "restore" | "discard"): Promise<void> {
  return invoke<void>("resolve_quarantine", { entryId, action });
}

/** One `verifyDataDir` finding (C3 §3.10). */
export interface VerifyFinding {
  severity: "info" | "warning" | "error";
  path: string;
  message: string;
}

/** `verifyDataDir`'s return (C3 §3.10). */
export interface VerifyReport {
  findings: VerifyFinding[];
  /** Empty unless `repair` was `true`. */
  quarantined: QuarantineEntry[];
  /** u32 */
  elapsed_ms: number;
}

/** Runs whole-`<data>`-tree maintenance (C4 §7's numbered check list,
 *  C3 §3.10, ruling R86 Q8). `repair: false` is read-only — `findings`
 *  only, `quarantined` always empty. `repair: true` additionally moves a
 *  corrupt `blobs/`/`derived/` file into `tmp/quarantine/` and returns it
 *  in `quarantined`. Explicit user action, never a hot path. */
export async function verifyDataDir(repair: boolean): Promise<VerifyReport> {
  return invoke<VerifyReport>("verify_data_dir", { repair });
}

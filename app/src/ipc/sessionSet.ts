import { Channel, invoke } from "@tauri-apps/api/core";

import type { IpcError } from "./workbook";

/** `idl_rs::table::TableModel` of a session-row table as planned (C2 §4):
 *  one row per member, row id = session id, context `{ sessionId }`. */
export interface SetTableModel {
  columns: { id: string; name?: string | null; template?: string | null }[];
  rows: { id: string; context?: { sessionId: string } | null }[];
  rowSource?: string;
  rowGroup?: string | null;
}

/** One evaluated grid cell (`idl_rs::table::CellResult`). */
export interface SetTableCellResult {
  value: number | null;
  error: string | null;
}

/** `eval_session_set`'s progress (C3 §3.4): one message as each member of the
 *  set enters each phase. */
export interface SetProgress {
  /** Members finished before this one. */
  done: number;
  /** Members in the set. */
  total: number;
  /** The member in progress. */
  session_id: string;
  phase: "cached" | "decoding" | "evaluating";
}

/** Where one member's results came from, or why it has none (C3 §3.4). */
export type SetMemberStatus = "computed" | "cached" | "cached_data_elsewhere" | "missing" | "not_found" | "error";

/** One member of the workbook's session set, in set order. */
export interface SetMember {
  session_id: string;
  /** The authored label, else `session.json`'s `event_session`, else the
   *  id's first 8 hex digits. */
  label: string;
  /** Index into {@link SessionSetResult.groups}. */
  group: number;
  /** Session start, ms since the Unix epoch; `null` when not catalogued. */
  start_utc_ms: number | null;
  status: SetMemberStatus;
  /** Present when `status` is `"error"`: `io` or `resource_exhausted`. */
  error?: IpcError;
}

/** One evaluated `rowSource: "sessions"` table. */
export interface SetTable {
  cell_id: string;
  /** The planned model: one row per member (row id = session id). */
  model: SetTableModel;
  results: SetTableCellResult[][];
  /** Each row's index into {@link SessionSetResult.members}. */
  row_members: number[];
}

/** A value over the set computed over the members present on this device
 *  only (ruling Q3, 2026-10-28). `missing` names each member left out, so
 *  the UI can offer to fetch it. */
export interface SetWarning {
  /** The table concerned; `null` for the whole set. */
  cell_id: string | null;
  missing: string[];
  message: string;
}

/** `eval_session_set`'s result (C3 §3.4). */
export interface SessionSetResult {
  /** SHA-256 hex of the resolved set and the maths text. */
  set_key: string;
  /** The set's groups in order; `name` is `null` for an unnamed group. */
  groups: { name: string | null }[];
  members: SetMember[];
  tables: SetTable[];
  warnings: SetWarning[];
  /** A newer call for the same workbook superseded this one; ignore it. */
  cancelled: boolean;
}

/** Evaluates workbook `workbookId`'s session set (C3 §3.4,
 *  `eval_session_set`): every `rowSource: "sessions"` table, one member at a
 *  time, served from the result cache where it can be. Async on the Rust
 *  side; `onProgress` receives each member's phase. A newer call for the
 *  same workbook supersedes this one, which then resolves with
 *  `cancelled: true`. */
export async function evalSessionSet(
  workbookId: string,
  onProgress: (p: SetProgress) => void = () => {},
): Promise<SessionSetResult> {
  const channel = new Channel<SetProgress>();
  channel.onmessage = onProgress;
  return invoke<SessionSetResult>("eval_session_set", { workbookId, onProgress: channel });
}

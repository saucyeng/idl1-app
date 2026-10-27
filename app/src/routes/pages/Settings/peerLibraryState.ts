import type { AutoSync, PeerLibrary, PeerStatus, Progress, SyncResult, SyncSelection } from "../../../ipc/sync";
import { formatSyncBytes } from "./peerLibraryView";

/** Where the browse panel's fetch of a peer's library stands. */
export type LibraryLoadState =
  | { status: "loading" }
  | { status: "ready"; library: PeerLibrary }
  | { status: "error"; message: string };

/** An event for {@link libraryLoadReducer}. */
export type LibraryLoadAction =
  | { type: "refreshing" }
  | { type: "loaded"; library: PeerLibrary }
  | { type: "failed"; message: string };

/** Pure reducer over {@link LibraryLoadState}. A refresh keeps showing the
 *  library it already has (so the list does not flash empty after a pull); only
 *  a refresh from loading/error goes back to "loading". */
export function libraryLoadReducer(state: LibraryLoadState, action: LibraryLoadAction): LibraryLoadState {
  switch (action.type) {
    case "refreshing":
      return state.status === "ready" ? state : { status: "loading" };
    case "loaded":
      return { status: "ready", library: action.library };
    case "failed":
      return { status: "error", message: action.message };
  }
}

/** Injected IO for {@link runSelectionSync}. */
export interface SelectionSyncDeps {
  /** `ipc/sync.ts`'s `syncSelection`. */
  syncSelection: (peerId: string, selection: SyncSelection, onProgress: (p: Progress) => void) => Promise<SyncResult>;
  /** Turns a rejection into user-facing text that carries the backend reason. */
  describeError: (error: unknown) => string;
}

/** What {@link runSelectionSync} settled with. */
export type SelectionSyncOutcome = { ok: true; result: SyncResult } | { ok: false; message: string };

/** Runs one selective sync against `peerId`, forwarding progress, and settles
 *  with an outcome instead of rejecting so callers have one branch for the
 *  toast and the refresh. */
export async function runSelectionSync(
  deps: SelectionSyncDeps,
  peerId: string,
  selection: SyncSelection,
  onProgress: (p: Progress) => void,
): Promise<SelectionSyncOutcome> {
  try {
    const result = await deps.syncSelection(peerId, selection, onProgress);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: deps.describeError(error) };
  }
}

/** One-line summary of what a selective sync moved, e.g. "2 sessions, 1
 *  workbook · 3 MB". Size is the session, workbook and blob bytes together. */
export function describeTransferred(result: SyncResult): string {
  const parts: string[] = [];
  if (result.sessions_updated > 0) parts.push(`${result.sessions_updated} session${result.sessions_updated === 1 ? "" : "s"}`);
  if (result.workbooks_merged > 0) parts.push(`${result.workbooks_merged} workbook${result.workbooks_merged === 1 ? "" : "s"}`);
  if (parts.length === 0) return "Nothing new to transfer";

  const bytes = result.session_bytes + result.workbook_bytes + result.blob_bytes;
  return `${parts.join(", ")} · ${formatSyncBytes(bytes)}`;
}

/** The peers a push can go to right now. */
export function onlinePeers(peers: readonly PeerStatus[]): PeerStatus[] {
  return peers.filter((p) => p.online);
}

/** The automatic-rule choices, in menu order. */
export const AUTO_SYNC_OPTIONS: readonly { value: AutoSync; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "send_new", label: "Send new" },
  { value: "mirror", label: "Mirror" },
];

/** The menu label for an automatic rule. */
export function autoSyncLabel(rule: AutoSync): string {
  return AUTO_SYNC_OPTIONS.find((o) => o.value === rule)?.label ?? rule;
}

/** User-facing text for a rejected library or transfer call that leads with
 *  the backend's own reason (library tiers §4a: "show the backend reason"),
 *  e.g. "peer is still indexing". Anything without a `message` falls back to a
 *  generic line. */
export function describeBackendReason(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message;
  }
  return "Something unexpected happened. Please try again.";
}

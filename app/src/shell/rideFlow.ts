import { useSyncExternalStore } from "react";

/**
 * The core ride routine's shared state (ride-form mockup, 2026-10-16): the
 * downloads the Logger screen runs, shown in the Data tab, and the ride
 * form sheet that slides up over any tab. Pure reducer plus a tiny store;
 * the IPC lives in the components that dispatch.
 */

/** Where one downloaded file is. */
export type RowStatus = "queued" | "downloading" | "importing" | "imported" | "failed";

/** One file of the current download batch. */
export interface DownloadRow {
  /** The logger's file name; also the ride's draft key until it imports. */
  name: string;
  /** Bytes. */
  sizeBytes: number;
  status: RowStatus;
  /** Bytes received so far. */
  doneBytes: number;
  /** Set once imported. */
  sessionId: string | null;
  /** Set when it failed. */
  error: string | null;
}

/** What the rider has typed for one ride. */
export interface RideDraft {
  title: string;
  notes: string;
  /** Written to the session since the last edit. */
  saved: boolean;
}

/** The whole flow. */
export interface RideFlowState {
  rows: DownloadRow[];
  /** By key: a download's file name, or `session:<id>` for a ride opened
   *  from the library. */
  drafts: Record<string, RideDraft>;
  /** The ride the form shows, by key, or null when closed. */
  open: string | null;
  /** Full screen (true) or the bottom half (false). */
  expanded: boolean;
  /** A bike name the form asked to make the logger's default; the Logger
   *  screen puts it in its settings draft and clears it. */
  pendingLoggerBike: string | null;
  /** The ride the form will slide up for once its first bytes arrive: a
   *  download that fails before then opens nothing (2026-10-16). */
  autoOpen: string | null;
}

export const initialRideFlow: RideFlowState = { rows: [], drafts: {}, open: null, expanded: false, pendingLoggerBike: null, autoOpen: null };

/** Actions. */
export type RideFlowAction =
  | { type: "BATCH_START"; files: { name: string; sizeBytes: number }[] }
  | { type: "PROGRESS"; name: string; doneBytes: number }
  | { type: "IMPORTING"; name: string }
  | { type: "IMPORTED"; name: string; sessionId: string }
  | { type: "FAILED"; name: string; error: string }
  | { type: "OPEN"; key: string; expanded: boolean }
  | { type: "CLOSE" }
  | { type: "EXPAND"; expanded: boolean }
  | { type: "DRAFT"; key: string; title?: string; notes?: string }
  | { type: "DRAFT_SAVED"; key: string; title: string; notes: string }
  | { type: "LOGGER_BIKE"; name: string | null };

/** The key for a ride opened from the library. */
export function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/** The session behind `key`, once there is one. */
export function sessionIdFor(state: RideFlowState, key: string): string | null {
  if (key.startsWith("session:")) return key.slice("session:".length);
  return state.rows.find((r) => r.name === key)?.sessionId ?? null;
}

/** A logger file's start, UTC ms, from its name: the firmware renames each
 *  file to its UTC start (`2026-10-16_14-05-12.idl1`) once GPS gives the
 *  time. `null` for a file still named `tmp_…` (no GPS fix). */
export function fileStartMs(name: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\./.exec(name);
  if (m === null) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

/** Local calendar day of a UTC-ms instant, as `YYYY-M-D`. */
function localDay(ms: number): string {
  const t = new Date(ms);
  return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`;
}

/** The form slides up by itself for a single ride, or for rides all from
 *  the same local day; anything else waits in the Data tab (Isaac,
 *  2026-10-16). */
export function autoOpens(files: { name: string }[]): boolean {
  if (files.length === 1) return true;
  const starts = files.map((f) => fileStartMs(f.name));
  if (files.length === 0 || starts.some((t) => t === null)) return false;
  return new Set(starts.map((t) => localDay(t as number))).size === 1;
}

/** Which ride the form opens on: the latest by start time (the one just
 *  ridden), else the last listed. */
function autoOpenTarget(files: { name: string }[]): string {
  const timed = files.map((f) => ({ name: f.name, t: fileStartMs(f.name) ?? -Infinity }));
  return timed.reduce((a, b) => (b.t >= a.t ? b : a)).name;
}

/** Drafts with unsaved edits whose session exists, ready to write. */
export function draftsToSave(state: RideFlowState): { key: string; sessionId: string; draft: RideDraft }[] {
  return Object.entries(state.drafts)
    .filter(([, d]) => !d.saved)
    .flatMap(([key, draft]) => {
      const sessionId = sessionIdFor(state, key);
      return sessionId === null ? [] : [{ key, sessionId, draft }];
    });
}

function setRow(state: RideFlowState, name: string, patch: Partial<DownloadRow>): RideFlowState {
  return { ...state, rows: state.rows.map((r) => (r.name === name ? { ...r, ...patch } : r)) };
}

/** Pure reducer. */
export function rideFlowReducer(state: RideFlowState, action: RideFlowAction): RideFlowState {
  switch (action.type) {
    case "BATCH_START": {
      // Earlier imported rows leave the "new" list: they are in the library.
      const kept = state.rows.filter((r) => r.status !== "imported" && r.status !== "failed" && !action.files.some((f) => f.name === r.name));
      const rows = [
        ...kept,
        ...action.files.map((f): DownloadRow => ({ name: f.name, sizeBytes: f.sizeBytes, status: "queued", doneBytes: 0, sessionId: null, error: null })),
      ];
      const autoOpen = autoOpens(action.files) && state.open === null ? autoOpenTarget(action.files) : null;
      return { ...state, rows, autoOpen };
    }
    case "PROGRESS": {
      const next = setRow(state, action.name, { status: "downloading", doneBytes: action.doneBytes });
      if (action.name !== state.autoOpen || action.doneBytes <= 0 || state.open !== null) return next;
      return { ...next, open: action.name, expanded: false, autoOpen: null };
    }
    case "IMPORTING":
      return setRow(state, action.name, { status: "importing" });
    case "IMPORTED": {
      // From here the ride is a session: its draft and the open form follow
      // the session key, so a draft kept across a restart still finds it.
      const next = setRow(state, action.name, { status: "imported", sessionId: action.sessionId });
      const key = sessionKey(action.sessionId);
      const { [action.name]: draft, ...rest } = next.drafts;
      const drafts = draft === undefined ? next.drafts : { ...rest, [key]: draft };
      return { ...next, drafts, open: next.open === action.name ? key : next.open };
    }
    case "FAILED": {
      const next = setRow(state, action.name, { status: "failed", error: action.error });
      return action.name === state.autoOpen ? { ...next, autoOpen: null } : next;
    }
    case "OPEN":
      return { ...state, open: action.key, expanded: action.expanded };
    case "CLOSE":
      return { ...state, open: null, expanded: false };
    case "EXPAND":
      return { ...state, expanded: action.expanded };
    case "DRAFT": {
      const prev = state.drafts[action.key] ?? { title: "", notes: "", saved: true };
      const next = { title: action.title ?? prev.title, notes: action.notes ?? prev.notes, saved: false };
      return { ...state, drafts: { ...state.drafts, [action.key]: next } };
    }
    case "DRAFT_SAVED": {
      const cur = state.drafts[action.key];
      // Typed again while the save was in flight: still unsaved.
      if (cur === undefined || cur.title !== action.title || cur.notes !== action.notes) return state;
      return { ...state, drafts: { ...state.drafts, [action.key]: { ...cur, saved: true } } };
    }
    case "LOGGER_BIKE":
      return { ...state, pendingLoggerBike: action.name };
    default:
      return state;
  }
}

const DRAFTS_KEY = "idl1.rideDrafts";

/** Unsaved drafts only: once a draft is in its session's `session.json`
 *  the disk copy is the truth, and the phone keeps nothing. */
export function draftsToKeep(state: RideFlowState): Record<string, RideDraft> {
  return Object.fromEntries(Object.entries(state.drafts).filter(([, d]) => !d.saved));
}

/** Unsaved drafts kept on this device from a previous run, so notes typed
 *  before a ride finished importing survive the app closing. */
function loadKeptDrafts(): Record<string, RideDraft> {
  try {
    const raw = globalThis.localStorage?.getItem(DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RideDraft>) : {};
  } catch {
    return {};
  }
}

function keepDrafts(state: RideFlowState): void {
  try {
    globalThis.localStorage?.setItem(DRAFTS_KEY, JSON.stringify(draftsToKeep(state)));
  } catch {
    // Storage unavailable: the drafts still live in memory this run.
  }
}

let current: RideFlowState = { ...initialRideFlow, drafts: loadKeptDrafts() };
const listeners = new Set<() => void>();

/** Applies `action` to the shared state. */
export function dispatchRideFlow(action: RideFlowAction): void {
  const before = current;
  current = rideFlowReducer(current, action);
  if (current.drafts !== before.drafts) keepDrafts(current);
  listeners.forEach((l) => l());
}

/** The shared state now. */
export function getRideFlow(): RideFlowState {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The shared state, re-rendering on change. */
export function useRideFlow(): RideFlowState {
  return useSyncExternalStore(subscribe, getRideFlow, getRideFlow);
}

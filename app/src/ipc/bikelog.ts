import { invoke } from "@tauri-apps/api/core";

/** One bike (C3 §3.11, bike-log spec §4). */
export interface Bike {
  bike_id: string;
  name: string;
  /** UTC ms. */
  name_updated_at_ms: number;
  /** Dotted sheet keys this bike has, in display order, e.g. "fork.lsc". */
  fields: string[];
  /** UTC ms. */
  fields_updated_at_ms: number;
}

/** A note, or a confirmed sheet. */
export type EntryKind = "note" | "sheet";

/** One exact field change carried by a note. */
export interface FieldChange {
  field: string;
  /** The new absolute value: clicks from fully closed, psi, mm, text. */
  value: unknown;
}

/** One version of an entry; versions are never edited. */
export interface EntryVersion {
  version_id: string;
  /** The version(s) this one was edited from. */
  parents: string[];
  /** When the noted thing happened, UTC ms. */
  at_ms: number;
  /** When this version was written, UTC ms. */
  updated_at_ms: number;
  device: string;
  text: string;
  changes: FieldChange[];
  /** A sheet's values by dotted key; empty for a note. */
  sheet: Record<string, unknown>;
  deleted: boolean;
}

/** One log entry with every version. */
export interface Entry {
  entry_id: string;
  bike_id: string;
  kind: EntryKind;
  versions: EntryVersion[];
}

/** The running setup sheet: baseline plus later notes' changes. */
export interface RunningSheet {
  /** The confirmed sheet it starts from, or null before the first. */
  baseline: string | null;
  values: Record<string, unknown>;
  /** Notes since the baseline, in time order. */
  since: string[];
}

/** One entry as the screens show it; core works out the derived fields. */
export interface BikeLogEntryView {
  entry: Entry;
  current: EntryVersion | null;
  in_conflict: boolean;
  /** Newest first; the texts to pick from when `in_conflict`. */
  heads: EntryVersion[];
  deleted: boolean;
}

/** `get_bike_log`'s return. */
export interface BikeLogView {
  entries: BikeLogEntryView[];
  running_sheet: RunningSheet;
  skipped: string[];
}

/** What a session took from its bike's log (C1 §6). */
export interface SessionBikeLog {
  entry_ids: string[];
  /** UTC ms, or null for the bike's first session. */
  after_ms: number | null;
  /** UTC ms. */
  until_ms: number;
  setup_sheet: RunningSheet;
}

/** C3 §3.11 `list_bikes`. */
export async function listBikes(): Promise<Bike[]> {
  return invoke<Bike[]>("list_bikes");
}

/** C3 §3.11 `bike_for_name`: the bike with that name, created if new. */
export async function bikeForName(name: string): Promise<Bike> {
  return invoke<Bike>("bike_for_name", { name });
}

/** C3 §3.11 `save_bike`. */
export async function saveBike(bike: Bike): Promise<Bike> {
  return invoke<Bike>("save_bike", { bike });
}

/** C3 §3.11 `get_bike_log`. */
export async function getBikeLog(bikeId: string): Promise<BikeLogView> {
  return invoke<BikeLogView>("get_bike_log", { bikeId });
}

/** C3 §3.11 `save_bike_log_entry`. */
export async function saveBikeLogEntry(entry: Entry): Promise<Entry> {
  return invoke<Entry>("save_bike_log_entry", { entry });
}

/** C3 §3.11 `attach_bike_log`. */
export async function attachBikeLog(sessionId: string, bikeId: string): Promise<SessionBikeLog> {
  return invoke<SessionBikeLog>("attach_bike_log", { sessionId, bikeId });
}

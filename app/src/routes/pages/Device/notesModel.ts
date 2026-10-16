import type { BikeLogView, Entry, EntryVersion } from "../../../ipc/bikelog";

/**
 * Pure helpers for the bike log's Notes sheet (bike-log spec §3–4). They
 * build entries and versions to hand to `save_bike_log_entry`; everything
 * derived from versions (current text, conflicts, the running sheet) comes
 * from Rust in `get_bike_log`.
 */

/** A source of randomness in [0, 1), injectable for tests. */
export type Random = () => number;

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A new id that sorts by creation time: the time in base 36, zero-padded,
 *  then six random characters. Only letters and digits, so it is a safe
 *  file name (the store's id rule). */
export function newId(nowMs: number, random: Random = Math.random): string {
  let tail = "";
  for (let i = 0; i < 6; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return Math.max(0, Math.floor(nowMs)).toString(36).padStart(9, "0") + tail;
}

/** Which device writes: "phone" on Android, "desktop" otherwise. */
export function deviceName(userAgent: string): string {
  return /android/i.test(userAgent) ? "phone" : "desktop";
}

function version(nowMs: number, device: string, random: Random, fields: Partial<EntryVersion>): EntryVersion {
  return {
    version_id: newId(nowMs, random),
    parents: [],
    at_ms: nowMs,
    updated_at_ms: nowMs,
    device,
    text: "",
    changes: [],
    sheet: {},
    deleted: false,
    ...fields,
  };
}

/** A new note for `bikeId`, happening now. */
export function newNote(bikeId: string, text: string, nowMs: number, device: string, random: Random = Math.random): Entry {
  return { entry_id: newId(nowMs, random), bike_id: bikeId, kind: "note", versions: [version(nowMs, device, random, { text: text.trim() })] };
}

/** The ids of `entry`'s heads: the versions nothing was edited from. */
export function headIds(entry: Entry): string[] {
  const parents = new Set(entry.versions.flatMap((v) => v.parents));
  return entry.versions.filter((v) => !parents.has(v.version_id)).map((v) => v.version_id);
}

/** `entry` carrying only a new version that edits every current head, so
 *  it also resolves a conflict. Keeps the noted time unless `atMs` is
 *  given. Saving it merges with the stored versions. */
export function editNote(entry: Entry, current: EntryVersion, text: string, nowMs: number, device: string, random: Random = Math.random, atMs?: number): Entry {
  const next = version(nowMs, device, random, { parents: headIds(entry), at_ms: atMs ?? current.at_ms, text: text.trim(), changes: current.changes, sheet: current.sheet });
  return { ...entry, versions: [next] };
}

/** `entry` carrying only a version that deletes it. */
export function deleteNote(entry: Entry, current: EntryVersion, nowMs: number, device: string, random: Random = Math.random): Entry {
  return { ...entry, versions: [version(nowMs, device, random, { parents: headIds(entry), at_ms: current.at_ms, text: current.text, deleted: true })] };
}

/** One row of the Notes list. */
export interface NoteRow {
  entryId: string;
  kind: "note" | "sheet";
  text: string;
  /** UTC ms. */
  atMs: number;
  inConflict: boolean;
  /** Each side's text when in conflict, newest first. */
  choices: string[];
}

/** The log's live entries as rows, newest first. */
export function noteRows(view: BikeLogView): NoteRow[] {
  return view.entries
    .filter((e) => !e.deleted && e.current !== null)
    .map((e) => ({
      entryId: e.entry.entry_id,
      kind: e.entry.kind,
      text: e.current!.text,
      atMs: e.current!.at_ms,
      inConflict: e.in_conflict,
      choices: e.in_conflict ? e.heads.map((h) => h.text) : [],
    }))
    .sort((a, b) => b.atMs - a.atMs || b.entryId.localeCompare(a.entryId));
}

/** "Today 14:05", "Yesterday 09:30", or "Mon 12 Oct 14:05" in local time. */
export function formatWhen(atMs: number, nowMs: number): string {
  const at = new Date(atMs);
  const now = new Date(nowMs);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(at)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  const weekday = at.toLocaleDateString("en-GB", { weekday: "short" });
  const date = at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${weekday} ${date} ${time}`;
}

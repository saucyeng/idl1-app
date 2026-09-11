import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * `decode_progress`'s payload (C3 §3.2, ruling R221 item 1) — one
 * observation of one channel's decode out of `data.parquet`.
 *
 * Mirrors `idl-rs-tauri`'s `session_cache::DecodeProgressEvent` field for
 * field. Rows, not bytes and not seconds: the engine knows how many rows the
 * file has and how many it has read, and nothing else about the decode is
 * knowable in advance.
 *
 * Only decodes that have already been running about 200 ms report at all, so
 * the absence of events means "nothing slow is happening", never "nothing is
 * happening". Events for one channel arrive at most ten a second and end
 * with exactly one carrying `finished: true` — including when the decode
 * failed, so a listener never leaves a ring spinning on a decode that is
 * over.
 */
export interface DecodeProgressEvent {
  session_id: string;
  channel: string;
  /** Rows decoded so far, over every pass this decode makes. */
  done_rows: number;
  /** Rows this decode has to get through. Never `0`. */
  total_rows: number;
  /** `true` on this decode's one terminal observation, success or failure. */
  finished: boolean;
}

/** Subscribes to `decode_progress` (C3 §3.2). Resolves with an unlisten
 *  function; call it on unmount. */
export async function onDecodeProgress(
  handler: (event: DecodeProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<DecodeProgressEvent>("decode_progress", (event) => handler(event.payload));
}

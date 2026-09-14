import { invoke } from "@tauri-apps/api/core";

/** `fetch_seams`'s return (C3 §3.5, ruling R237): one `[t0Us, t1Us]` pair
 *  per burst-seam boundary on the channel's corrected time axis. Empty for
 *  a channel that was never burst-corrected -- "no seams" is a true
 *  answer, not a failure. */
export interface SeamsResult {
  spans: [number, number][];
}

/** Fetches one channel's burst-seam boundary spans (C3 §3.5, ruling R237)
 *  -- a small JSON sibling to `fetch_tile`, served once per channel from
 *  the session cache, never per tile/tier (the spans are a property of the
 *  channel's whole burst structure, not of any one tile's window). */
export async function fetchSeams(sessionId: string, channel: string): Promise<SeamsResult> {
  return invoke<SeamsResult>("fetch_seams", { sessionId, channel });
}

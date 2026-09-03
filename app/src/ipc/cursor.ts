import { invoke } from "@tauri-apps/api/core";

/** `cursor_readout`'s return (C3 §3.7). */
export interface CursorReadout {
  /** i64, echoes the request */
  t_us: number;
  /** channel_id → interpolated/nearest value, null if the channel has no
   *  sample near t_us */
  values: Record<string, number | null>;
}

/** Reads interpolated/nearest values for `channels` at `tUs` (C3 §3.7).
 *  `tUs` is a point on the session's `t` axis (C1 §3.1). Called once on
 *  cursor settle (debounced) — never per pointer move (design §6). */
export async function cursorReadout(
  sessionId: string,
  channels: string[],
  tUs: number
): Promise<CursorReadout> {
  return invoke<CursorReadout>("cursor_readout", { sessionId, channels, tUs });
}

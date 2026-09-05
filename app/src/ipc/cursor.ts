import { invoke } from "@tauri-apps/api/core";

/** `cursor_readout`'s return (C3 §3.7). */
export interface CursorReadout {
  /** i64, echoes the request */
  t_us: number;
  /** channel_id → nearest **recorded** sample (no interpolation, no
   *  proximity bound; a tie resolves to the earlier sample), null outside
   *  that channel's own recorded span, when it has no samples, or when it
   *  has no recorded time axis (ledger R31) */
  values: Record<string, number | null>;
}

/** Reads the nearest recorded sample for `channels` at `tUs` (C3 §3.7,
 *  ledger R31 — a channel that stops early reads null past its last
 *  sample, never a frozen value). `tUs` is a point on the session's `t`
 *  axis (C1 §3.1). Called once on cursor settle (debounced) — never per
 *  pointer move (design §6). */
export async function cursorReadout(
  sessionId: string,
  channels: string[],
  tUs: number
): Promise<CursorReadout> {
  return invoke<CursorReadout>("cursor_readout", { sessionId, channels, tUs });
}

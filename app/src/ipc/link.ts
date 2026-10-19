import { Channel, invoke } from "@tauri-apps/api/core";

import type { ConnectionInfo, DeviceStatus } from "./device";

/** What a logger's link is doing (logger link design §4, C3 §3.8 `link_*`,
 *  added 2026-10-19). */
export type LinkPhase = "seeking" | "connecting" | "ready" | "wifi" | "handed_off" | "returning" | "forgotten";

/** One logger's link, as the Rust link actor reports it. */
export interface LinkView {
  device_id: string;
  /** What connect reported, once it has connected. */
  info: ConnectionInfo | null;
  phase: LinkPhase;
  /** The last status the logger sent. */
  status: DeviceStatus | null;
  /** When `status` arrived, ms since the Unix epoch. */
  status_at_ms: number | null;
  /** Record was asked for and isn't carried out yet. */
  pending_record: boolean;
  /** The last connect failure, cleared on connect. */
  error: { kind: string; message: string } | null;
}

/** Every logger's view now, then each change (`link_watch`). */
export async function linkWatch(onView: (view: LinkView) => void): Promise<void> {
  const channel = new Channel<LinkView>();
  channel.onmessage = onView;
  return invoke<void>("link_watch", { onView: channel });
}

/** The app wants this logger from now on: its actor connects and keeps it
 *  connected (`link_pair`). */
export async function linkPair(deviceId: string): Promise<void> {
  return invoke<void>("link_pair", { deviceId });
}

/** The app no longer wants this logger (`link_forget`). */
export async function linkForget(deviceId: string): Promise<void> {
  return invoke<void>("link_forget", { deviceId });
}

/** Every logger that isn't connected tries now (`link_kick`). */
export async function linkKick(): Promise<void> {
  return invoke<void>("link_kick");
}

/** Start or stop recording whatever the link is doing (`link_record`):
 *  now when connected; a WiFi download ends with Record; otherwise the
 *  moment the link is back. */
export async function linkRecord(deviceId: string, start: boolean): Promise<void> {
  return invoke<void>("link_record", { deviceId, start });
}

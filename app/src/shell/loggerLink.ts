import { useSyncExternalStore } from "react";

/**
 * The logger link's shared state during a WiFi transfer with the radio
 * handoff (SPEC §10.4, 2026-10-16). The downloader (Logger screen's
 * new-sessions runner) says when the logger has dropped Bluetooth and when
 * the transfer is over; the Logger screen pauses its Bluetooth status poll
 * while handed off and reconnects afterwards. Screen state only: nothing
 * here is saved.
 */
export interface LoggerLinkState {
  /** The device whose Bluetooth link the logger dropped for a transfer. */
  handedOff: string | null;
  /** A reconnect the Logger screen should run, once the transfer ended. */
  reconnect: { deviceId: string; longWait: boolean; thenRecord: boolean } | null;
  /** Record was pressed during the transfer: start recording once back. */
  recordWhenBack: boolean;
}

export const initialLoggerLink: LoggerLinkState = { handedOff: null, reconnect: null, recordWhenBack: false };

/** Actions. */
export type LoggerLinkAction =
  | { type: "HANDED_OFF"; deviceId: string }
  | { type: "TRANSFER_ENDED"; deviceId: string; handedOff: boolean; wifiClosed: boolean }
  | { type: "RECORD_WHEN_BACK" }
  | { type: "RECONNECT_TAKEN" };

/** Pure reducer. A transfer that handed off ends with a reconnect request:
 *  a long wait when WiFi did not close cleanly (the logger's five-minute
 *  failsafe brings it back). */
export function loggerLinkReducer(state: LoggerLinkState, action: LoggerLinkAction): LoggerLinkState {
  switch (action.type) {
    case "HANDED_OFF":
      return { ...state, handedOff: action.deviceId };
    case "TRANSFER_ENDED":
      if (!action.handedOff) return { ...state, handedOff: null, recordWhenBack: false };
      return {
        handedOff: null,
        reconnect: { deviceId: action.deviceId, longWait: !action.wifiClosed, thenRecord: state.recordWhenBack },
        recordWhenBack: false,
      };
    case "RECORD_WHEN_BACK":
      return { ...state, recordWhenBack: true };
    case "RECONNECT_TAKEN":
      return { ...state, reconnect: null };
    default:
      return state;
  }
}

let current: LoggerLinkState = initialLoggerLink;
const listeners = new Set<() => void>();

/** Applies `action` to the shared state. */
export function dispatchLoggerLink(action: LoggerLinkAction): void {
  current = loggerLinkReducer(current, action);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function get(): LoggerLinkState {
  return current;
}

/** The shared state, re-rendering on change. */
export function useLoggerLink(): LoggerLinkState {
  return useSyncExternalStore(subscribe, get, get);
}

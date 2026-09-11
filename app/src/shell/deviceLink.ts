import { useSyncExternalStore } from "react";

import type { DeviceLink } from "./activityBadges";

/**
 * The device's link state, published by the Device page for the shell's
 * chrome to read (ruling R220 item 1: the activity bar's "device connected
 * dot", and the status bar beside it).
 *
 * A store rather than a prop chain because the publisher and the readers
 * are siblings: `routes/pages/Device/index.tsx` owns the connection and the
 * 1 Hz `device_status` poll it already runs, while the activity bar and the
 * status bar sit outside every route. The same publish/subscribe shape as
 * `shell/toolbarSlot.ts`.
 *
 * R220 item 4 — no new polling: nothing here polls anything. The Device
 * page is mounted from launch (mount-and-hide, R93) and its existing poll
 * is the only source; this module just makes its conclusion readable from
 * the chrome. It replaces `TopBar.tsx`'s stated gap ("device status is not
 * wired into the shell yet").
 */
let link: DeviceLink = "disconnected";

const listeners = new Set<() => void>();

/** Publishes the Device page's current link state. A repeat of the current
 *  value is a no-op, so the 1 Hz poll's steady "still connected" does not
 *  re-render the chrome once a second. */
export function setDeviceLink(next: DeviceLink): void {
  if (link === next) return;
  link = next;
  for (const listener of listeners) listener();
}

/** The current link state; `"disconnected"` before the Device page has
 *  published anything. */
export function getDeviceLink(): DeviceLink {
  return link;
}

/** Subscribes `handler` to link-state changes. Returns an unsubscribe. */
export function subscribeDeviceLink(handler: () => void): () => void {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

/** React hook: the device's link state, re-rendering when it changes. */
export function useDeviceLink(): DeviceLink {
  return useSyncExternalStore(subscribeDeviceLink, getDeviceLink, getDeviceLink);
}

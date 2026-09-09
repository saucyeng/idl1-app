import type { DeviceDiscovered } from "../../../../ipc/device";

/**
 * Pure filtering logic for {@link HrmForm}'s "Search nearby" list
 * (`runs/2026-09-07/ui/UI-DIRECTION-2.md` decision 68: filtered to the
 * heart-rate service by default, with a "show all devices" toggle). No
 * `@/components/*` import (CLAUDE.md §4) — `HrmForm.tsx` renders this, it
 * does not decide it.
 */

/** Standard Bluetooth GATT Heart Rate Service UUID (SPEC §7.5), in the
 *  lowercase hyphenated full-128-bit form `DeviceDiscovered.service_uuids`
 *  carries (`ble_transport.rs` converts every advertised UUID — 16-bit or
 *  128-bit — through `Uuid::to_string`, which always emits this form). */
export const HEART_RATE_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";

/**
 * Filters `devices` to likely heart-rate straps. `showAll` true returns
 * `devices` unchanged (the toggle's "show all devices" state).
 *
 * When filtering, a device is kept if it advertised
 * {@link HEART_RATE_SERVICE_UUID}, **or** if it advertised no service UUIDs
 * at all. The second case is deliberate, not an oversight: an empty
 * `service_uuids` means the scan record this app saw didn't carry a
 * service list — a common BLE truncation (the full list can arrive in a
 * later scan response the app never asked for) — not a claim "this device
 * has no services." Filtering those out would risk hiding a real strap
 * that just hadn't advertised its service list in the packet this scan
 * caught, which is the one thing decision 68's filter must not do. Only a
 * device that positively advertised a different, non-empty service set
 * (and so is known not to be a heart-rate strap) is excluded.
 */
export function filterHrmCandidates(devices: DeviceDiscovered[], showAll: boolean): DeviceDiscovered[] {
  if (showAll) return devices;
  return devices.filter(
    (d) => d.service_uuids.length === 0 || d.service_uuids.some((uuid) => uuid.toLowerCase() === HEART_RATE_SERVICE_UUID),
  );
}

/** Count of `devices` the filter is currently hiding — lets the UI say
 *  "N device(s) hidden by filter" instead of letting an empty filtered
 *  list read as "no devices nearby" when it actually means "everything was
 *  filtered out" (R153). `0` both when `showAll` is true and when nothing
 *  was filtered. */
export function hiddenByFilterCount(devices: DeviceDiscovered[], showAll: boolean): number {
  if (showAll) return 0;
  return devices.length - filterHrmCandidates(devices, false).length;
}

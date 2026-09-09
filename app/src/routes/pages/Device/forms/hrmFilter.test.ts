import { describe, expect, it } from "vitest";

import type { DeviceDiscovered } from "../../../../ipc/device";
import { filterHrmCandidates, hiddenByFilterCount, HEART_RATE_SERVICE_UUID } from "./hrmFilter";

/** One `DeviceDiscovered`, `service_uuids` overridden per test. */
function device(id: string, serviceUuids: string[]): DeviceDiscovered {
  return { device_id: id, name: id, rssi_dbm: -60, service_uuids: serviceUuids };
}

describe("filterHrmCandidates", () => {
  it("filterHrmCandidates — showAll true — every device kept, unfiltered", () => {
    // Arrange
    const devices = [device("strap", [HEART_RATE_SERVICE_UUID]), device("watch", ["0000180f-0000-1000-8000-00805f9b34fb"])];

    // Act
    const result = filterHrmCandidates(devices, true);

    // Assert
    expect(result).toEqual(devices);
  });

  it("filterHrmCandidates — showAll false — a device advertising the heart-rate service is kept", () => {
    // Arrange
    const strap = device("strap", [HEART_RATE_SERVICE_UUID]);

    // Act
    const result = filterHrmCandidates([strap], false);

    // Assert
    expect(result).toEqual([strap]);
  });

  it("filterHrmCandidates — showAll false — a device advertising only other services is hidden", () => {
    // Arrange
    const watch = device("watch", ["0000180f-0000-1000-8000-00805f9b34fb"]);

    // Act
    const result = filterHrmCandidates([watch], false);

    // Assert
    expect(result).toEqual([]);
  });

  it("filterHrmCandidates — showAll false — a device advertising no service UUIDs at all is kept, not hidden", () => {
    // Arrange
    const unknown = device("unknown", []);

    // Act
    const result = filterHrmCandidates([unknown], false);

    // Assert — an empty service list means the scan record didn't carry
    // one, not that the device has no services; hiding it risks hiding a
    // real strap.
    expect(result).toEqual([unknown]);
  });

  it("filterHrmCandidates — showAll false — matching is case-insensitive on the service UUID", () => {
    // Arrange
    const strap = device("strap", ["0000180D-0000-1000-8000-00805F9B34FB"]);

    // Act
    const result = filterHrmCandidates([strap], false);

    // Assert
    expect(result).toEqual([strap]);
  });

  it("filterHrmCandidates — showAll false — a mix of matching, non-matching and empty-list devices filters to matching + empty-list", () => {
    // Arrange
    const strap = device("strap", [HEART_RATE_SERVICE_UUID]);
    const watch = device("watch", ["0000180f-0000-1000-8000-00805f9b34fb"]);
    const unknown = device("unknown", []);

    // Act
    const result = filterHrmCandidates([strap, watch, unknown], false);

    // Assert
    expect(result).toEqual([strap, unknown]);
  });
});

describe("hiddenByFilterCount", () => {
  it("hiddenByFilterCount — showAll true — always 0, even with non-matching devices present", () => {
    // Arrange
    const watch = device("watch", ["0000180f-0000-1000-8000-00805f9b34fb"]);

    // Act
    const result = hiddenByFilterCount([watch], true);

    // Assert
    expect(result).toBe(0);
  });

  it("hiddenByFilterCount — showAll false — counts devices the filter removed", () => {
    // Arrange
    const strap = device("strap", [HEART_RATE_SERVICE_UUID]);
    const watch1 = device("watch1", ["0000180f-0000-1000-8000-00805f9b34fb"]);
    const watch2 = device("watch2", ["0000180f-0000-1000-8000-00805f9b34fb"]);

    // Act
    const result = hiddenByFilterCount([strap, watch1, watch2], false);

    // Assert
    expect(result).toBe(2);
  });

  it("hiddenByFilterCount — showAll false, nothing filtered out — 0", () => {
    // Arrange
    const strap = device("strap", [HEART_RATE_SERVICE_UUID]);

    // Act
    const result = hiddenByFilterCount([strap], false);

    // Assert
    expect(result).toBe(0);
  });
});

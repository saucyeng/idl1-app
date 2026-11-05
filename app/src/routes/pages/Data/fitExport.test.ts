import { describe, expect, it } from "vitest";

import type { SessionDetail } from "../../../ipc/catalog";
import { canExportFit, fitExportFileName, withFitExtension } from "./fitExport";

function detail(channels: [string, number][]): SessionDetail {
  return { channels: channels.map(([channel_id, sample_count]) => ({ channel_id, sample_count })) } as unknown as SessionDetail;
}

/** 2026-11-04 15:12 local time. */
const BEACON_START = new Date(2026, 10, 4, 15, 12).getTime();

describe("canExportFit", () => {
  it("canExportFit — latitude, longitude and epoch all present — true", () => {
    // Act
    const result = canExportFit(detail([["GPS_Latitude", 3], ["GPS_Longitude", 3], ["GPS_EpochMs", 3], ["HR_BPM", 10]]));

    // Assert
    expect(result).toBe(true);
  });

  it("canExportFit — no GPS epoch — false, the encoder would refuse", () => {
    // Act
    const result = canExportFit(detail([["GPS_Latitude", 3], ["GPS_Longitude", 3]]));

    // Assert
    expect(result).toBe(false);
  });

  it("canExportFit — GPS channels with no samples — false", () => {
    // Act
    const result = canExportFit(detail([["GPS_Latitude", 0], ["GPS_Longitude", 0], ["GPS_EpochMs", 0]]));

    // Assert
    expect(result).toBe(false);
  });
});

describe("fitExportFileName", () => {
  it("fitExportFileName — a venue — date and venue, spaces as underscores", () => {
    // Act
    const name = fitExportFileName(BEACON_START, "Beacon Mountain");

    // Assert
    expect(name).toBe("2026-11-04_Beacon_Mountain.fit");
  });

  it("fitExportFileName — no venue — date and local start time", () => {
    // Act
    const name = fitExportFileName(BEACON_START, "  ");

    // Assert
    expect(name).toBe("2026-11-04_1512.fit");
  });

  it("fitExportFileName — a venue with characters Windows refuses — those dropped", () => {
    // Act
    const name = fitExportFileName(BEACON_START, 'A/B: "C"?');

    // Assert
    expect(name).toBe("2026-11-04_AB_C.fit");
  });

  it("fitExportFileName — start unknown (0) — ride.fit", () => {
    // Act
    const name = fitExportFileName(0, "Beacon");

    // Assert
    expect(name).toBe("ride.fit");
  });
});

describe("withFitExtension", () => {
  it("withFitExtension — no extension — .fit appended", () => {
    // Act
    const path = withFitExtension("C:\\Rides\\beacon");

    // Assert
    expect(path).toBe("C:\\Rides\\beacon.fit");
  });

  it("withFitExtension — upper-case .FIT — unchanged", () => {
    // Act
    const path = withFitExtension("C:\\Rides\\BEACON.FIT");

    // Assert
    expect(path).toBe("C:\\Rides\\BEACON.FIT");
  });
});

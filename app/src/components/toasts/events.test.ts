import { describe, expect, it } from "vitest";

import { toastFor, type CoreToastEvent } from "./events";

describe("toastFor — transferComplete — good tone naming the file count", () => {
  it("returns a good-tone descriptor mentioning the transfer", () => {
    // Arrange
    const event: CoreToastEvent = { kind: "transferComplete", fileCount: 3 };

    // Act
    const descriptor = toastFor(event);

    // Assert
    expect(descriptor.tone).toBe("good");
    expect(descriptor.title).toMatch(/transfer/i);
  });
});

describe("toastFor — configPushed — info tone naming the profile", () => {
  it("returns an info-tone descriptor mentioning config", () => {
    // Arrange
    const event: CoreToastEvent = { kind: "configPushed", profileName: "Trek" };

    // Act
    const descriptor = toastFor(event);

    // Assert
    expect(descriptor.tone).toBe("info");
    expect(descriptor.title).toMatch(/config/i);
  });
});

describe("toastFor — syncFinished — good tone naming sync", () => {
  it("returns a good-tone descriptor mentioning sync", () => {
    // Arrange
    const event: CoreToastEvent = { kind: "syncFinished", changed: 5 };

    // Act
    const descriptor = toastFor(event);

    // Assert
    expect(descriptor.tone).toBe("good");
    expect(descriptor.title).toMatch(/sync/i);
  });
});

describe("toastFor — importFailed — accent tone and the file name in the detail", () => {
  it("returns an accent-tone descriptor with the file name in the detail", () => {
    // Arrange
    const event: CoreToastEvent = {
      kind: "importFailed",
      fileName: "ride-042.fit",
      message: "checksum mismatch",
    };

    // Act
    const descriptor = toastFor(event);

    // Assert
    expect(descriptor.tone).toBe("accent");
    expect(descriptor.detail).toContain("ride-042.fit");
  });
});

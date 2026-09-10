import { describe, expect, it } from "vitest";

import { channelDataKeysForCell, channelDataKeysToEvict, splitChannelDataKey } from "./channelDataRetention";

/** `${cellId}::${channelId}`, the key shape `combinedChannelDataRef` uses. */
function key(cellId: string, channelId: string): string {
  return `${cellId}::${channelId}`;
}

describe("splitChannelDataKey", () => {
  it("a well-formed key — an eight-character cell id and a channel id — splits into both halves", () => {
    // Arrange
    const k = key("a1b2c3d4", "IMU0_AccelX");

    // Act
    const got = splitChannelDataKey(k);

    // Assert
    expect(got).toEqual({ cellId: "a1b2c3d4", channelId: "IMU0_AccelX" });
  });

  it("a channel id containing the separator — splits at the fixed cell-id length, not the first separator", () => {
    // Arrange
    const k = key("a1b2c3d4", "weird::name");

    // Act
    const got = splitChannelDataKey(k);

    // Assert
    expect(got).toEqual({ cellId: "a1b2c3d4", channelId: "weird::name" });
  });

  it("a key that is not cell-id-then-separator — yields an empty channel id, which nothing live can match", () => {
    // Arrange
    const k = "garbage";

    // Act
    const got = splitChannelDataKey(k);

    // Assert
    expect(got.channelId).toBe("");
  });
});

describe("channelDataKeysForCell", () => {
  it("keys from several cells — only the named cell's keys come back, in order", () => {
    // Arrange
    const keys = [key("a1b2c3d4", "Speed"), key("00112233", "Speed"), key("a1b2c3d4", "Distance")];

    // Act
    const own = channelDataKeysForCell(keys, "a1b2c3d4");

    // Assert
    expect(own).toEqual([key("a1b2c3d4", "Speed"), key("a1b2c3d4", "Distance")]);
  });

  it("a cell with no entries — an empty list, not every other cell's keys", () => {
    // Arrange
    const keys = [key("00112233", "Speed")];

    // Act
    const own = channelDataKeysForCell(keys, "a1b2c3d4");

    // Assert
    expect(own).toEqual([]);
  });
});

describe("channelDataKeysToEvict", () => {
  it("a cell that is still mounted with bindings unknown — its entries are retained", () => {
    // Arrange
    const keys = [key("a1b2c3d4", "Speed"), key("a1b2c3d4", "Distance")];

    // Act
    const evict = channelDataKeysToEvict(keys, new Set(["a1b2c3d4"]));

    // Assert
    expect(evict).toEqual([]);
  });

  it("a cell that has been removed — every one of its entries is evicted", () => {
    // Arrange
    const keys = [key("a1b2c3d4", "Speed"), key("deadbeef", "Speed"), key("deadbeef", "Distance")];

    // Act
    const evict = channelDataKeysToEvict(keys, new Set(["a1b2c3d4"]));

    // Assert
    expect(evict).toEqual([key("deadbeef", "Speed"), key("deadbeef", "Distance")]);
  });

  it("a mounted cell that no longer binds a channel — only that channel's entry is evicted", () => {
    // Arrange
    const keys = [key("a1b2c3d4", "Speed"), key("a1b2c3d4", "Distance")];
    const bound = new Map([["a1b2c3d4", new Set(["Speed"])]]);

    // Act
    const evict = channelDataKeysToEvict(keys, new Set(["a1b2c3d4"]), bound);

    // Assert
    expect(evict).toEqual([key("a1b2c3d4", "Distance")]);
  });

  it("a mounted cell whose binding went away entirely — an empty bound set evicts all of its entries", () => {
    // Arrange
    const keys = [key("a1b2c3d4", "Speed"), key("a1b2c3d4", "Distance")];
    const bound = new Map([["a1b2c3d4", new Set<string>()]]);

    // Act
    const evict = channelDataKeysToEvict(keys, new Set(["a1b2c3d4"]), bound);

    // Assert
    expect(evict).toEqual(keys);
  });

  it("a bindings map naming only one cell — the other mounted cells are left alone", () => {
    // Arrange
    const keys = [key("a1b2c3d4", "Speed"), key("00112233", "Speed")];
    const bound = new Map([["a1b2c3d4", new Set<string>()]]);

    // Act
    const evict = channelDataKeysToEvict(keys, new Set(["a1b2c3d4", "00112233"]), bound);

    // Assert
    expect(evict).toEqual([key("a1b2c3d4", "Speed")]);
  });

  it("no keys at all — nothing to evict, and the input is not mutated", () => {
    // Arrange
    const keys: string[] = [];

    // Act
    const evict = channelDataKeysToEvict(keys, new Set(["a1b2c3d4"]));

    // Assert
    expect(evict).toEqual([]);
    expect(keys).toEqual([]);
  });
});

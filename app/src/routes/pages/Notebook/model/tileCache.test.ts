import { describe, expect, it, vi } from "vitest";

import type { DecodedTile } from "../../../../ipc/tiles";
import { ensureTiles, TileCache, type TileCacheKey } from "./tileCache";

/** Builds a small fake `DecodedTile` with typed arrays of a chosen length,
 *  so cache byte-accounting tests can compute the expected size exactly
 *  instead of guessing at a real tile's byte count. */
function fakeTile(sampleCount: number, columnCount: number): DecodedTile {
  return {
    version: 2,
    tier: 0,
    tileIndex: 0,
    sampleMin: new Float32Array(sampleCount),
    sampleMax: new Float32Array(sampleCount),
    columnMin: new Float32Array(columnCount),
    columnMax: new Float32Array(columnCount),
    columnMean: new Float32Array(columnCount),
    columnTUs: new BigInt64Array(columnCount),
  };
}

function key(overrides: Partial<TileCacheKey> = {}): TileCacheKey {
  return {
    sessionId: "session-a",
    channelId: "front-fork",
    tier: 0,
    tileIndex: 0,
    columnCount: 256,
    ...overrides,
  };
}

describe("TileCache", () => {
  it("TileCache — a tile put then read — is returned and promoted to most-recently-used", () => {
    const cache = new TileCache(1_000_000);
    const tile = fakeTile(1024, 256);
    const k = key();

    cache.put(k, tile);
    const read = cache.get(k);

    expect(read).toBe(tile);
  });

  it("TileCache — two tiles differing only in columnCount — are cached separately (R43)", () => {
    const cache = new TileCache(1_000_000);
    const narrow = fakeTile(1024, 128);
    const wide = fakeTile(1024, 512);

    cache.put(key({ columnCount: 128 }), narrow);
    cache.put(key({ columnCount: 512 }), wide);

    expect(cache.get(key({ columnCount: 128 }))).toBe(narrow);
    expect(cache.get(key({ columnCount: 512 }))).toBe(wide);
  });

  it("TileCache — the same tile key across two sessions — does not collide", () => {
    const cache = new TileCache(1_000_000);
    const tileA = fakeTile(1024, 256);
    const tileB = fakeTile(1024, 256);

    cache.put(key({ sessionId: "session-a" }), tileA);
    cache.put(key({ sessionId: "session-b" }), tileB);

    expect(cache.get(key({ sessionId: "session-a" }))).toBe(tileA);
    expect(cache.get(key({ sessionId: "session-b" }))).toBe(tileB);
  });

  it("TileCache — puts exceeding the byte cap — evicts the least recently used until under it", () => {
    const tileBytes = fakeTile(1024, 256);
    // Byte accounting: sampleMin/sampleMax (4 bytes/elem) + columnMin/columnMax/columnMean
    // (4 bytes/elem) + columnTUs (8 bytes/elem).
    const oneTileSize =
      tileBytes.sampleMin.byteLength +
      tileBytes.sampleMax.byteLength +
      tileBytes.columnMin.byteLength +
      tileBytes.columnMax.byteLength +
      tileBytes.columnMean.byteLength +
      tileBytes.columnTUs.byteLength;
    const cache = new TileCache(oneTileSize * 2);

    cache.put(key({ tileIndex: 0 }), fakeTile(1024, 256));
    cache.put(key({ tileIndex: 1 }), fakeTile(1024, 256));
    // Touch tileIndex 1 so tileIndex 0 becomes least-recently-used.
    cache.get(key({ tileIndex: 1 }));
    cache.put(key({ tileIndex: 2 }), fakeTile(1024, 256));

    expect(cache.has(key({ tileIndex: 0 }))).toBe(false);
    expect(cache.has(key({ tileIndex: 1 }))).toBe(true);
    expect(cache.has(key({ tileIndex: 2 }))).toBe(true);
    expect(cache.bytesUsed()).toBeLessThanOrEqual(oneTileSize * 2);
  });

  it("TileCache — a miss — returns undefined without calling the fetcher", () => {
    const cache = new TileCache(1_000_000);

    const read = cache.get(key());

    expect(read).toBeUndefined();
  });
});

describe("ensureTiles", () => {
  it("ensureTiles — a range partly cached — requests only the missing indices", async () => {
    const cache = new TileCache(1_000_000);
    cache.put(key({ tileIndex: 1 }), fakeTile(1024, 256));
    const fetcher = vi.fn(async (_tileIndex: number) => fakeTile(1024, 256));

    await ensureTiles(cache, key(), { first: 0, last: 2 }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(0);
    expect(fetcher).toHaveBeenCalledWith(2);
    expect(fetcher).not.toHaveBeenCalledWith(1);
  });

  it("ensureTiles — the same missing index requested twice concurrently — issues one fetch", async () => {
    const cache = new TileCache(1_000_000);
    let resolveFetch: (tile: DecodedTile) => void = () => {};
    const fetcher = vi.fn(
      () =>
        new Promise<DecodedTile>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const first = ensureTiles(cache, key(), { first: 0, last: 0 }, fetcher);
    const second = ensureTiles(cache, key(), { first: 0, last: 0 }, fetcher);

    resolveFetch(fakeTile(1024, 256));
    await Promise.all([first, second]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

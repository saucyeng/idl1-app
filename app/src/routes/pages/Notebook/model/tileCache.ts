import type { DecodedTile } from "../../../../ipc/tiles";

/** Identifies one decoded tile. `columnCount` is part of the key per lead
 *  ruling R43 (C3 §3.5): `column_count` is chosen by the caller to match
 *  the rendered chart width and is independent of the bucket grid, so the
 *  same `(session, channel, tier, tileIndex)` at two chart widths is two
 *  different payloads, not two views of one payload. */
export interface TileCacheKey {
  sessionId: string;
  channelId: string;
  tier: number;
  tileIndex: number;
  columnCount: number;
}

/** Default byte cap for the in-memory tile cache. No documented cap was
 *  found carried over from idl0 to mirror, so this is an implementation-time
 *  default: generous enough to hold several tiers' worth of tiles for a
 *  handful of channels at once on a desktop-class machine, without letting
 *  an idle Notebook tab grow unbounded. Callers needing a different budget
 *  (e.g. mobile) pass their own cap to the `TileCache` constructor. */
export const DEFAULT_CACHE_BYTES = 64 * 1024 * 1024; // 64 MiB

/** Builds the deterministic string key `TileCache` and `ensureTiles` use
 *  internally — structural equality over the five `TileCacheKey` fields,
 *  never object identity. */
function cacheKeyString(key: TileCacheKey): string {
  return `${key.sessionId} ${key.channelId} ${key.tier} ${key.tileIndex} ${key.columnCount}`;
}

/** Number of bytes a decoded tile's typed arrays occupy, for byte-tracked
 *  eviction. Counts only the typed-array buffers (`Float32Array`s at 4
 *  bytes/element, the `BigInt64Array` at 8 bytes/element) — not per-object
 *  JS overhead, which is not observable from the cache's own accounting. */
function tileByteSize(tile: DecodedTile): number {
  return (
    tile.sampleMin.byteLength +
    tile.sampleMax.byteLength +
    tile.columnMin.byteLength +
    tile.columnMax.byteLength +
    tile.columnMean.byteLength +
    tile.columnTUs.byteLength
  );
}

/** A byte-tracked LRU cache of decoded tiles, keyed
 *  `(sessionId, channelId, tier, tileIndex, columnCount)` (R43 — see
 *  {@link TileCacheKey}). Pure in-memory bookkeeping: never calls
 *  `fetchTile` or `invoke`. Backed by a `Map`, whose iteration order is
 *  insertion order — re-inserting an entry on access is the standard trick
 *  for turning that into "most recently used at the end". */
export class TileCache {
  private readonly entries = new Map<string, DecodedTile>();
  private totalBytes = 0;

  /** @param capBytes Maximum total tile bytes retained before the
   *   least-recently-used entries are evicted. Defaults to
   *   {@link DEFAULT_CACHE_BYTES}. */
  constructor(private readonly capBytes: number = DEFAULT_CACHE_BYTES) {}

  /** Reads a cached tile, promoting it to most-recently-used. Returns
   *  `undefined` on a miss — never fetches. */
  get(key: TileCacheKey): DecodedTile | undefined {
    const k = cacheKeyString(key);
    const tile = this.entries.get(k);
    if (tile === undefined) {
      return undefined;
    }
    // Re-insert to move this entry to the "most recent" end of iteration order.
    this.entries.delete(k);
    this.entries.set(k, tile);
    return tile;
  }

  /** Returns whether `key` is currently cached, without affecting recency. */
  has(key: TileCacheKey): boolean {
    return this.entries.has(cacheKeyString(key));
  }

  /** Inserts or replaces a decoded tile, then evicts least-recently-used
   *  entries (from the front of iteration order) until total bytes are
   *  under {@link capBytes}. */
  put(key: TileCacheKey, tile: DecodedTile): void {
    const k = cacheKeyString(key);
    const existing = this.entries.get(k);
    if (existing !== undefined) {
      this.totalBytes -= tileByteSize(existing);
      this.entries.delete(k);
    }
    this.entries.set(k, tile);
    this.totalBytes += tileByteSize(tile);

    for (const [oldestKey, oldestTile] of this.entries) {
      if (this.totalBytes <= this.capBytes) {
        break;
      }
      this.entries.delete(oldestKey);
      this.totalBytes -= tileByteSize(oldestTile);
    }
  }

  /** Total bytes of all currently cached tiles, per {@link tileByteSize}. */
  bytesUsed(): number {
    return this.totalBytes;
  }
}

/** In-flight fetches shared across all `ensureTiles` calls, keyed the same
 *  way as `TileCache`'s own entries, so two concurrent callers requesting
 *  the same missing index await one fetch instead of issuing two. Cleared
 *  per key once its fetch settles (success or failure), so a later miss
 *  can retry. */
const inFlightFetches = new Map<string, Promise<void>>();

/** Requests only the tile indices in `[range.first, range.last]` missing
 *  from `cache`, coalescing concurrent requests for the same missing index
 *  into one in-flight `fetcher` call — a second caller awaiting the same
 *  index gets the first caller's promise, not a duplicate fetch. `fetcher`
 *  is injected; this function never imports `ipc/tiles.ts`. Resolves once
 *  every requested tile is either already cached or has been fetched and
 *  put into `cache`.
 *
 *  @param cache The tile cache to check and fill.
 *  @param key The cache key fields shared by every tile in `range`
 *   (everything but `tileIndex`, which comes from `range`).
 *  @param range Inclusive tile-index range to ensure is cached.
 *  @param fetcher Fetches and decodes one tile by index.
 */
export function ensureTiles(
  cache: TileCache,
  key: Omit<TileCacheKey, "tileIndex">,
  range: { first: number; last: number },
  fetcher: (tileIndex: number) => Promise<DecodedTile>
): Promise<void> {
  const puts: Promise<void>[] = [];

  for (let tileIndex = range.first; tileIndex <= range.last; tileIndex++) {
    const fullKey: TileCacheKey = { ...key, tileIndex };
    if (cache.has(fullKey)) {
      continue;
    }
    const flightKey = cacheKeyString(fullKey);
    let promise = inFlightFetches.get(flightKey);
    if (promise === undefined) {
      promise = fetcher(tileIndex)
        .then((tile) => {
          cache.put(fullKey, tile);
        })
        .finally(() => {
          inFlightFetches.delete(flightKey);
        });
      inFlightFetches.set(flightKey, promise);
    }
    puts.push(promise);
  }

  return Promise.all(puts).then(() => undefined);
}

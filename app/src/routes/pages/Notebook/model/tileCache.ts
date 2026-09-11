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

/** Default byte cap for the in-memory tile cache. Mirrors idl0's
 *  `ChartTileCache.defaultMaxBytes`
 *  (`idl0-app/app/lib/ui/tabs/analyze/chart_tile_cache.dart:24-25`:
 *  `static const int defaultMaxBytes = 30 * 1024 * 1024; // Default cache
 *  size cap — 30 MB allows ~1900 tiles cached.`) rather than picking a new
 *  number, per the brief's own preference for a documented idl0 figure over
 *  an implementation-time guess. Callers needing a different budget (e.g.
 *  mobile) pass their own cap to the `TileCache` constructor. */
export const DEFAULT_CACHE_BYTES = 30 * 1024 * 1024; // 30 MiB

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
  /** In-flight fetches for *this* cache instance only (review-task6.md
   *  Important finding: a module-level map let two independent `TileCache`s
   *  requesting the same five-tuple resolve into each other's cache
   *  instead of their own). Used by {@link TileCache.getOrStartFetch},
   *  `ensureTiles`'s only entry point into this bookkeeping. */
  private readonly inFlight = new Map<string, Promise<void>>();

  /** @param capBytes Maximum total tile bytes retained before the
   *   least-recently-used entries are evicted. Defaults to
   *   {@link DEFAULT_CACHE_BYTES}.
   *  @param onChange Called after every {@link TileCache.put} with the
   *   cache's total bytes and its cap, for an owner that wants to report
   *   the number (the shell's status-bar memory meter, ruling R220 item 1,
   *   through `shell/memoryBudget.ts`). Injected rather than imported: this
   *   module stays pure in-memory bookkeeping with no store and no React
   *   dependency, the same way `ensureTiles` takes its `fetcher`. */
  constructor(
    private readonly capBytes: number = DEFAULT_CACHE_BYTES,
    private readonly onChange?: (usedBytes: number, capBytes: number) => void
  ) {}

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

    this.onChange?.(this.totalBytes, this.capBytes);
  }

  /** Total bytes of all currently cached tiles, per {@link tileByteSize}. */
  bytesUsed(): number {
    return this.totalBytes;
  }

  /**
   * Returns the in-flight fetch promise already registered for `key` on
   * *this* cache, or starts one via `start()` and registers it. Scoped to
   * this cache instance so two independent `TileCache`s requesting the same
   * five-tuple never resolve into each other's promise (review-task6.md
   * Important finding — the previous module-level map did exactly that).
   * The in-flight entry is cleared once `start()`'s promise settles
   * (success or failure), so a later miss can retry.
   */
  getOrStartFetch(key: TileCacheKey, start: () => Promise<void>): Promise<void> {
    const k = cacheKeyString(key);
    let promise = this.inFlight.get(k);
    if (promise === undefined) {
      promise = start().finally(() => this.inFlight.delete(k));
      this.inFlight.set(k, promise);
    }
    return promise;
  }
}

/** Requests only the tile indices in `[range.first, range.last]` missing
 *  from `cache`, coalescing concurrent requests for the same missing index
 *  into one in-flight `fetcher` call scoped to `cache`
 *  ({@link TileCache.getOrStartFetch}) — a second caller awaiting the same
 *  index on the *same* cache gets the first caller's promise, not a
 *  duplicate fetch; a different `TileCache` instance always starts its own.
 *  `fetcher` is injected; this function never imports `ipc/tiles.ts`.
 *  Resolves once every requested tile is either already cached or has been
 *  fetched and put into `cache`.
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
    const promise = cache.getOrStartFetch(fullKey, () =>
      fetcher(tileIndex).then((tile) => {
        cache.put(fullKey, tile);
      })
    );
    puts.push(promise);
  }

  return Promise.all(puts).then(() => undefined);
}

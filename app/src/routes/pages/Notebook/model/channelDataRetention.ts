/**
 * Which `combinedChannelDataRef` entries a notebook may still need
 * (ruling R203.5).
 *
 * `combinedChannelDataRef` holds one {@link CombinedChannelPayload} per
 * `${cellId}::${channelId}` — full-resolution `Float64Array` t/v/w for a
 * bound window. Its sibling refs (`boundIdentityRef`,
 * `cellRunSequencerRef`, `retainedSpectraRef`) are all cleaned up when a
 * cell is removed or a binding goes away; this one only ever grew, so a
 * long session accumulated every channel every cell was ever bound to,
 * long after the cells and bindings were gone. That unbounded retention is
 * the app-side half of the out-of-memory incident R203 answers.
 *
 * The decision is pure and lives here so it can be tested without a
 * notebook: `index.tsx` calls {@link channelDataKeysToEvict} and deletes
 * exactly the keys it names.
 */

/** A `combinedChannelDataRef` key, split into its two halves. */
export interface ChannelDataKey {
  /** The cell the payload was fetched for — a hex8 (C2 §2.2, ruling R21). */
  readonly cellId: string;
  /** The channel id bound in that cell. May itself contain any characters. */
  readonly channelId: string;
}

/** Length of a cell id: always eight hex characters (C2 §2.2, ruling R21). */
const CELL_ID_LENGTH = 8;

/** The fixed separator between the two halves of a key. */
const SEPARATOR = "::";

/**
 * Splits a `${cellId}::${channelId}` key.
 *
 * A cell id is always exactly eight characters, so the split point is
 * fixed and a channel id containing `"::"` of its own cannot confuse it —
 * the same reasoning `groupChannelDataByCell` in `index.tsx` relies on.
 * A key that is not shaped this way (nothing produces one today) returns
 * an empty `channelId`, which no live binding can match, so such a key is
 * evicted rather than retained forever.
 */
export function splitChannelDataKey(key: string): ChannelDataKey {
  const cellId = key.slice(0, CELL_ID_LENGTH);
  const rest = key.slice(CELL_ID_LENGTH);
  return { cellId, channelId: rest.startsWith(SEPARATOR) ? rest.slice(SEPARATOR.length) : "" };
}

/**
 * Every key of `keys` belonging to `cellId`, in iteration order.
 *
 * For the caller that knows one cell has stopped binding anything and
 * knows nothing about the others: {@link channelDataKeysToEvict} would
 * read every other cell as unmounted, so the keys are narrowed to the one
 * cell first rather than the live set being widened to all of them.
 */
export function channelDataKeysForCell(keys: Iterable<string>, cellId: string): string[] {
  const own: string[] = [];
  for (const key of keys) {
    if (splitChannelDataKey(key).cellId === cellId) own.push(key);
  }
  return own;
}

/**
 * The keys of `keys` whose cell is no longer mounted, in iteration order.
 *
 * Mounted-ness is the only test here. A cell that is still mounted but has
 * rebound to a different channel keeps its old channel's payload until the
 * cell itself goes away — that residue is bounded by the channels a cell
 * has named rather than by how long the session runs, and evicting it
 * would need a reliable map from a bound channel back to this key's
 * `channelId`, which `ChannelBindAction`'s `boundChannels` payload does
 * not carry (its `name` is the sandbox host-variable name).
 *
 * Returns a new array; it mutates nothing.
 */
export function channelDataKeysToEvict(keys: Iterable<string>, liveCellIds: ReadonlySet<string>): string[] {
  const evict: string[] = [];
  for (const key of keys) {
    if (!liveCellIds.has(splitChannelDataKey(key).cellId)) evict.push(key);
  }
  return evict;
}

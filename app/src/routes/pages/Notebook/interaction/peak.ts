import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";

/**
 * The `cursorToPeak` action's pure search: the time of the tile column with
 * the largest `|columnMean|` across `tiles` (the tiles a chart already has
 * decoded for its current viewport — no new fetch, no IPC). Ties keep the
 * earliest (lowest-index) column. Returns `null` when every column is
 * empty (`COLUMN_T_US_EMPTY`, checked as `bigint` before any `Number`
 * conversion, matching `model/hover.ts`'s own sentinel check) or `tiles` is
 * empty.
 *
 * @param tiles Decoded tiles covering the chart's current viewport, in ascending time order.
 */
export function findPeakTUs(tiles: DecodedTile[]): bigint | null {
  let bestTUs: bigint | null = null;
  let bestMagnitude = -Infinity;

  for (const tile of tiles) {
    for (let i = 0; i < tile.columnTUs.length; i++) {
      const tUs = tile.columnTUs[i];
      if (tUs === COLUMN_T_US_EMPTY) {
        continue;
      }
      const magnitude = Math.abs(tile.columnMean[i]);
      if (magnitude > bestMagnitude) {
        bestMagnitude = magnitude;
        bestTUs = tUs;
      }
    }
  }

  return bestTUs;
}

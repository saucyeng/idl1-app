import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";

/**
 * The pixel-to-time mapping `ChartCell` already holds for its plotted area,
 * as much of it as {@link hoverAt} needs. `tiles` is assumed to cover
 * exactly the columns plotted across `[originPx, originPx + pixelWidth)`,
 * in ascending time order and with no gaps between tiles' column ranges —
 * the same assumption `tileToChannelData` makes about tile ordering. A
 * pixel's column index is chosen by linear interpolation across the total
 * column count spanned by `tiles`, not from `startUs`/`endUs` directly, so
 * this stays correct however many tiles cover the window.
 */
export interface HoverGeometry {
  /** CSS px offset from the left edge of `ChartCell`'s bounding box to the first plotted column. */
  originPx: number;
  /** CSS px width of the plotted area (matches the `columnCount` tiles were fetched at). */
  pixelWidth: number;
}

/**
 * Reads the tile column under `pixelX`, with no IPC (performance budget
 * P2 — hover never calls `cursor_readout`). Returns `null` when `pixelX`
 * falls outside `[geometry.originPx, geometry.originPx + geometry.pixelWidth)`,
 * when `tiles` has no columns at all, or when the resolved column carries
 * the `COLUMN_T_US_EMPTY` sentinel (checked as `bigint`, before any
 * conversion to `Number`, so the sentinel comparison is exact).
 *
 * @param tiles Decoded tiles covering the plotted area, in ascending time order.
 * @param pixelX Pointer position, in CSS px, in the same coordinate space as `geometry`.
 * @param geometry The pixel-to-column mapping for the plotted area.
 */
export function hoverAt(
  tiles: DecodedTile[],
  pixelX: number,
  geometry: HoverGeometry
): { tUs: bigint; min: number; max: number; mean: number } | null {
  const relative = pixelX - geometry.originPx;
  if (relative < 0 || relative >= geometry.pixelWidth || geometry.pixelWidth <= 0) {
    return null;
  }

  const totalColumns = tiles.reduce((sum, tile) => sum + tile.columnTUs.length, 0);
  if (totalColumns === 0) {
    return null;
  }

  const fraction = relative / geometry.pixelWidth;
  let globalIndex = Math.floor(fraction * totalColumns);
  if (globalIndex >= totalColumns) {
    globalIndex = totalColumns - 1;
  }

  for (const tile of tiles) {
    if (globalIndex < tile.columnTUs.length) {
      const tUs = tile.columnTUs[globalIndex];
      if (tUs === COLUMN_T_US_EMPTY) {
        return null;
      }
      return {
        tUs,
        min: tile.columnMin[globalIndex],
        max: tile.columnMax[globalIndex],
        mean: tile.columnMean[globalIndex],
      };
    }
    globalIndex -= tile.columnTUs.length;
  }

  return null;
}

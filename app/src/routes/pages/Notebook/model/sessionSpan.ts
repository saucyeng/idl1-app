/**
 * Pure helper for the session-span fallback named in lead pre-ruling
 * 2026-09-05 #1 (`runs/2026-09-05/lanes/l6/brief-task13b.md`): when
 * `SessionSummary.duration_ms` is `null`, fall back to the recorded span
 * of a channel's coarsest tile (`MAX_TIER`, tile index 0) -- data the
 * engine produced, never `sample_count / nominal_rate_hz` recomputed in
 * TypeScript (CLAUDE.md section 2: that division is "physics of the
 * bike", `core`'s job, not this lane's). No IPC, no DOM -- the caller
 * (`Notebook/index.tsx`) fetches the tile; this module only reads it.
 */
import { COLUMN_T_US_EMPTY, type DecodedTile } from "../../../../ipc/tiles";

/**
 * The recorded span covered by `tile`'s non-empty columns, in µs since
 * session start -- `[first non-empty columnTUs, last non-empty
 * columnTUs]`. `null` when every column is `COLUMN_T_US_EMPTY` (an
 * entirely empty tile, e.g. a channel with no samples in this range).
 */
export function spanFromCoarsestTile(tile: DecodedTile): { startUs: number; endUs: number } | null {
  let firstUs: bigint | null = null;
  let lastUs: bigint | null = null;

  for (let i = 0; i < tile.columnTUs.length; i++) {
    const tUs = tile.columnTUs[i];
    if (tUs === COLUMN_T_US_EMPTY) continue;
    if (firstUs === null) firstUs = tUs;
    lastUs = tUs;
  }

  if (firstUs === null || lastUs === null) return null;
  return { startUs: Number(firstUs), endUs: Number(lastUs) };
}

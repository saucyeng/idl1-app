import { useCallback, useState, type PointerEvent } from "react";

import type { DecodedTile } from "../../../../ipc/tiles";
import { hoverAt, type HoverGeometry } from "../model/hover";

/** The value a successful {@link hoverAt} lookup adds to on-screen hover state. */
interface HoverReading {
  /** CSS px position of the pointer within this cell, for placing the tooltip. */
  pixelX: number;
  /** µs since session start of the hovered column. */
  tUs: bigint;
  min: number;
  max: number;
  mean: number;
}

/**
 * Props for {@link ChartCell}. `tiles` are already-decoded and already
 * cached — this component never fetches (Task 8's settle-bound
 * `ensureTiles`/`fetchTile` orchestration owns that); it only reads the
 * tiles it's handed to answer hover queries locally (performance budget
 * P2).
 */
export interface ChartCellProps {
  /** Decoded tiles currently covering this cell's plotted window, in ascending time order. */
  tiles: DecodedTile[];
  /** CSS px width of the plotted area; also the `columnCount` the tiles were fetched at (R43). */
  width: number;
  /** CSS px height of the plotted area. */
  height: number;
}

/**
 * The chart frame for one notebook cell (design §6): a positioning
 * container holding the sandbox iframe's rendered Plot output (mounted by
 * `host/SandboxHost.ts`, not this component) plus a `<canvas>` raster
 * underlay (its content wired by Task 9 — this component only needs the
 * element to exist so that task doesn't have to restructure this one) and
 * an absolutely positioned hover tooltip.
 *
 * The pointer handler below calls {@link hoverAt} — a pure read of the
 * tiles already in memory — and only ever calls `setHover` (React state).
 * It never calls `invoke` or any `ipc/*` function (performance budget P1);
 * hover never reaches `cursor_readout` (P2).
 */
export default function ChartCell({ tiles, width, height }: ChartCellProps) {
  const [hover, setHover] = useState<HoverReading | null>(null);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const pixelX = event.clientX - bounds.left;
      const geometry: HoverGeometry = { originPx: 0, pixelWidth: width };

      const reading = hoverAt(tiles, pixelX, geometry);
      setHover(reading === null ? null : { pixelX, ...reading });
    },
    [tiles, width]
  );

  const handlePointerLeave = useCallback(() => {
    setHover(null);
  }, []);

  return (
    <div
      className="chart-cell"
      style={{ position: "relative", width, height }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <canvas
        className="chart-cell-underlay"
        width={width}
        height={height}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
      <div className="chart-cell-sandbox-mount" style={{ position: "absolute", inset: 0 }} />
      {hover !== null && (
        <div
          className="chart-cell-tooltip"
          style={{ position: "absolute", left: hover.pixelX, top: 0, pointerEvents: "none" }}
        >
          {`t=${Number(hover.tUs) / 1_000_000}s min=${hover.min} max=${hover.max} mean=${hover.mean}`}
        </div>
      )}
    </div>
  );
}

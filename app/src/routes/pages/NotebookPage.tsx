import { useEffect, useRef, useState } from "react";
import { getSession, listSessions } from "../../ipc/catalog";
import { fetchTile, type DecodedTile } from "../../ipc/tiles";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;

/** Minimal end-to-end tile render (L5 Task 14) — proves parse → store →
 *  tile encoder → binary IPC → pixels for a real session, ahead of L6's
 *  sandboxed-iframe cell viewer replacing this page. No Observable Plot,
 *  no axes, no interaction: a `<canvas>` polyline over the tile's sample
 *  min/max envelope, plus the channel name and byte length so a screenshot
 *  proves which bytes arrived. */
export default function NotebookPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [byteLength, setByteLength] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessions = await listSessions();
        if (sessions.length === 0) {
          if (!cancelled) setEmpty(true);
          return;
        }
        const detail = await getSession(sessions[0].session_id);
        const channel = detail.channels.find((c) => c.channel_kind === "fixed-rate" && c.sample_count > 0);
        if (!channel) {
          if (!cancelled) setError(`session '${detail.session_id}' has no fixed-rate channel with samples`);
          return;
        }
        const tile: DecodedTile = await fetchTile(detail.session_id, channel.channel_id, 0, 0, CANVAS_WIDTH);
        if (cancelled) return;
        setChannelName(channel.channel_id);
        setByteLength(32 + tile.sampleMin.length * 8 + tile.columnMin.length * 20);
        drawEnvelope(canvasRef.current, tile);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (empty) {
    return <p>No sessions in &lt;data&gt; — import one with: idl-rs import --data-dir &lt;data&gt; &lt;file&gt;.idl0</p>;
  }
  if (error) {
    return <p>Notebook error: {error}</p>;
  }
  return (
    <div>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
      <p>
        {channelName ?? "…"} — {byteLength ?? "…"} bytes
      </p>
    </div>
  );
}

/** Draws `tile.sampleMin`/`sampleMax`'s envelope onto `canvas`, scaling x by
 *  bucket index over the sample count and y by the min/max across the
 *  whole tile. Buckets past the source data are `NaN` (right-edge padding,
 *  `chart_decimation.rs`) and are skipped rather than plotted as zero. */
function drawEnvelope(canvas: HTMLCanvasElement | null, tile: DecodedTile) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const finiteValues = [...tile.sampleMin, ...tile.sampleMax].filter((v) => Number.isFinite(v));
  if (finiteValues.length === 0) return;
  const vMin = Math.min(...finiteValues);
  const vMax = Math.max(...finiteValues);
  const span = vMax - vMin || 1;
  const n = tile.sampleMin.length;
  const y = (v: number) => canvas.height - ((v - vMin) / span) * canvas.height;

  ctx.strokeStyle = "black";
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(tile.sampleMax[i])) {
      started = false;
      continue;
    }
    const x = (i / n) * canvas.width;
    if (!started) {
      ctx.moveTo(x, y(tile.sampleMax[i]));
      started = true;
    } else {
      ctx.lineTo(x, y(tile.sampleMax[i]));
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (!Number.isFinite(tile.sampleMin[i])) continue;
    const x = (i / n) * canvas.width;
    ctx.lineTo(x, y(tile.sampleMin[i]));
  }
  ctx.stroke();
}

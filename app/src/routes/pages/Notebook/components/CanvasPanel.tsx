import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { join, videoDir } from "@tauri-apps/api/path";

import { NoteBlock } from "@/components/brand/NoteBlock";

import { cancelOverlayExport, ffmpegInfo, finishOverlayExport, pushOverlayFrame, startOverlayExport, type FfmpegInfo } from "../../../../ipc/export";
import { fetchRasterMetaV2, fetchRasterV2, type SpectrogramParams } from "../../../../ipc/rasters";
import { closeReadout, openReadout, readReadout } from "../../../../ipc/readout";
import { videoUrl, type SessionVideo } from "../../../../ipc/video";
import { aspectOf, CANVAS_SIZES, readCanvasLayout, writeCanvasLayout, type CanvasLayout, type CanvasSize } from "../model/canvasLayout";
import { runOverlayExport } from "../model/exportRunner";
import { exportPlan, presetLayout, type ExportResolution, type OverlayPreset } from "../model/overlayPlan";
import { parseReadoutCall, type ReadoutCall } from "../readout/call";
import type { ReadoutFrame } from "../readout/frame";
import type { SpectroLookup } from "../readout/module";
import { composeOverlay, rasterise } from "../readout/overlayLayer";
import { makeSpectroSource, type SpectroSource } from "../readout/spectroSource";
import { scanReadouts } from "../readout/scan";
import { useDisplayUnits } from "../readout/useDisplayUnits";

/** Props for {@link CanvasPanel}. */
export interface CanvasPanelProps {
  markdown: string;
  workbookId: string;
  workbookName: string;
  /** The workbook's first `video` cell. */
  videoCellId: string;
  /** Every `js` cell, id and source, in document order. */
  jsCells: readonly { id: string; code: string }[];
  sessionId: string;
  /** The primary window, µs since the ride's first sample. */
  windowUs: { startUs: number; endUs: number } | null;
  videos: readonly SessionVideo[] | null;
  cursorUs: number | null;
  playing: boolean;
  /** The latest readout values the notebook bound (`useReadoutHost`'s `onFrame`), as a store so a new frame redraws only this panel. */
  frames: ReadoutFrameStore;
  /** Writes the workbook (the `canvas` key changed). */
  onMarkdownChange: (markdown: string) => void;
}

/** The latest readout frame, readable and watchable without re-rendering the page. */
export interface ReadoutFrameStore {
  get(): ReadoutFrame | null;
  subscribe(listener: () => void): () => void;
}

/** A {@link ReadoutFrameStore} and its setter. */
export function makeReadoutFrameStore(): ReadoutFrameStore & { set(frame: ReadoutFrame): void } {
  let current: ReadoutFrame | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(frame) {
      current = frame;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const SELECT = "rounded-[var(--radius-structural)] border border-rule bg-control px-1 py-0.5 font-mono text-label-2";

/** The encoders' names as a person knows them. */
const ENCODER_NAMES: Record<string, string> = { libx264: "H.264", libx265: "H.265", h264_nvenc: "H.264 (NVIDIA)", hevc_nvenc: "H.265 (NVIDIA)" };

const BUTTON = "shrink-0 rounded-[var(--radius-structural)] border border-rule px-2 py-1 font-mono text-label-2 text-fg-dim hover:text-fg disabled:opacity-50";

type ExportState =
  | { kind: "idle" }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; text: string }
  | { kind: "failed"; text: string };

/**
 * The overlay canvas (video step 2) and its export (step 3), 2026-11-23: the
 * frame with the video and the readouts placed by the workbook's `canvas`
 * key, following the cursor and playback; presets to start a layout; Draft
 * and Full export through the person's own ffmpeg. The readouts are drawn
 * here by `overlayLayer.ts` from the same values the notebook's readouts get.
 */
export function CanvasPanel(props: CanvasPanelProps) {
  const { markdown, videoCellId, jsCells, videos, cursorUs, playing } = props;
  const frame = useSyncExternalStore(props.frames.subscribe, props.frames.get);
  const display = useDisplayUnits();
  const stored = useMemo(() => readCanvasLayout(markdown), [markdown]);
  const calls = useMemo(() => {
    const m = new Map<string, ReadoutCall>();
    for (const c of jsCells) {
      const call = parseReadoutCall(c.code);
      if (call !== null) m.set(c.id, call);
    }
    return m;
  }, [jsCells]);
  const link = useMemo(() => {
    const live = (videos ?? []).filter((v) => v.unlinked !== true && v.on_device);
    if (props.windowUs === null) return live[0] ?? null;
    const startS = props.windowUs.startUs / 1e6;
    const endS = props.windowUs.endUs / 1e6;
    return live.find((v) => v.offset_s < endS && v.offset_s + v.duration_s > startS) ?? live[0] ?? null;
  }, [videos, props.windowUs]);
  const clipAspect = link !== null && link.height_px > 0 ? link.width_px / link.height_px : 16 / 9;
  const placed = useMemo(() => [...calls.entries()].map(([id, c]) => ({ id, kind: c.kind })), [calls]);
  const layout: CanvasLayout = stored ?? presetLayout("classic", videoCellId, placed, clipAspect);

  const save = (next: CanvasLayout) => props.onMarkdownChange(writeCanvasLayout(markdown, next));

  // Spectrograms: one raster per channel over the window and the lead-in
  // its strip shows, fetched when the window or the readouts change, then
  // sliced per frame (`spectroSource.ts`). Off the drawing path: a frame
  // with no raster yet draws an empty strip.
  const [spectra, setSpectra] = useState<ReadonlyMap<string, SpectroSource>>(new Map());
  const spectroKey = [...calls.values()]
    .filter((c) => c.kind === "spectrogram")
    .map((c) => (c.kind === "spectrogram" ? `${c.name}:${c.opts.window_s ?? 6}` : ""))
    .join("|");
  useEffect(() => {
    if (spectroKey === "" || props.windowUs === null) {
      setSpectra(new Map());
      return;
    }
    let live = true;
    const wanted = [...calls.values()].flatMap((c) => (c.kind === "spectrogram" ? [c] : []));
    const leadUs = Math.max(...wanted.map((c) => (c.opts.window_s ?? 6) * 1e6));
    const t0 = Math.max(0, Math.floor(props.windowUs.startUs - leadUs));
    const t1 = Math.ceil(props.windowUs.endUs);
    const window = { session_id: props.sessionId, span: { kind: "range" as const, t0_us: t0, t1_us: t1 }, colour: "--chart-1" };
    const width = Math.min(2048, Math.max(64, Math.ceil(((t1 - t0) / 1e6) * 20)));
    const params: SpectrogramParams = { window_size: 256, hop_size: 16, window: "hann", detrend: "mean", scaling: "density" };
    const names = [...new Set(wanted.map((c) => c.name))];
    void Promise.all(
      names.map(async (name) => {
        const [raster, meta] = await Promise.all([fetchRasterV2(window, name, "spectrogram", width, 128, params), fetchRasterMetaV2(window, name, "spectrogram", width, 128, params)]);
        const source = makeSpectroSource(raster, { t0Us: t0, t1Us: t1, width: raster.width, height: raster.height, fLoHz: meta.y_domain[0], fHiHz: meta.y_domain[1] });
        return [name, source] as const;
      })
    ).then(
      (entries) => {
        if (live) setSpectra(new Map(entries));
      },
      () => {
        if (live) setSpectra(new Map());
      }
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `calls` is summarised by `spectroKey`
  }, [spectroKey, props.windowUs?.startUs, props.windowUs?.endUs, props.sessionId]);
  const spectroAt = (tUs: number | null): SpectroLookup => (name, opts) =>
    tUs === null ? null : (spectra.get(name)?.slice(tUs, opts.window_s ?? 6, opts.fmax ?? Number.POSITIVE_INFINITY) ?? null);

  // The preview's size, measured.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = useState(640);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth));
    ro.observe(el);
    setFrameW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const frameH = frameW / aspectOf(layout.size);

  // The video follows the cursor: seeks when paused or drifting, plays along while playing.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (v === null || link === null || cursorUs === null) return;
    const t = cursorUs / 1e6 - link.offset_s;
    if (t < 0 || t > link.duration_s) return;
    if (playing) {
      if (Math.abs(v.currentTime - t) > 0.25) v.currentTime = t;
      if (v.paused) void v.play().catch(() => undefined);
    } else {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;
    }
  }, [cursorUs, playing, link]);

  // The readout layer, redrawn on every frame of values.
  const layerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = layerRef.current;
    if (el === null || frame === null) return;
    el.replaceChildren(composeOverlay(layout, calls, frame, Math.round(frameW), Math.round(frameH), spectroAt(cursorUs)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spectroAt` reads `spectra` and `cursorUs`, both listed
  }, [frame, layout, calls, frameW, frameH, spectra, cursorUs]);

  const [ffmpeg, setFfmpeg] = useState<FfmpegInfo | null>(null);
  useEffect(() => {
    void ffmpegInfo(null).then(setFfmpeg, () => setFfmpeg(null));
  }, []);

  const [exportState, setExportState] = useState<ExportState>({ kind: "idle" });
  const cancelRef = useRef(false);
  // ffmpeg's own simple choices; the last ones used stay for next time (this viewer only).
  const [opts, setOpts] = useState<{ resolution: ExportResolution; encoder: string; quality: number; speed: "fast" | "medium" | "slow" }>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("idl1.overlayExport") ?? "null") as unknown;
      if (saved !== null && typeof saved === "object") return { resolution: 1080, encoder: "libx264", quality: 20, speed: "medium", ...(saved as object) };
    } catch {
      // storage refused: defaults
    }
    return { resolution: 1080, encoder: "libx264", quality: 20, speed: "medium" };
  });
  const setOpt = (patch: Partial<typeof opts>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    try {
      window.localStorage.setItem("idl1.overlayExport", JSON.stringify(next));
    } catch {
      // storage refused: kept for this session only
    }
  };
  const encoders = ffmpeg?.encoders ?? [];
  const encoder = encoders.includes(opts.encoder) ? opts.encoder : (encoders[0] ?? "libx264");

  const exportVideo = async () => {
    if (link === null || props.windowUs === null) return;
    const plan = exportPlan(layout, videoCellId, link, { startS: props.windowUs.startUs / 1e6, endS: props.windowUs.endUs / 1e6 }, opts.resolution);
    if (plan === null) {
      setExportState({ kind: "failed", text: "The clip does not cover the selected window." });
      return;
    }
    cancelRef.current = false;
    setExportState({ kind: "running", done: 0, total: plan.frames });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const safe = props.workbookName.replace(/[^A-Za-z0-9 _-]+/g, "").trim().replace(/\s+/g, "-") || "overlay";
    try {
      const outPath = await join(await videoDir(), "idl1", `${safe}-${plan.width}x${plan.height}-${stamp}.mp4`);
      const scan = scanReadouts(jsCells.map((c) => c.code));
      const outcome = await runOverlayExport(
        {
          openReadout: (names) => openReadout(props.workbookId, { session_id: props.sessionId, span: { kind: "session" }, colour: "--chart-1" }, names),
          readReadout,
          closeReadout,
          start: startOverlayExport,
          push: pushOverlayFrame,
          finish: finishOverlayExport,
          cancel: cancelOverlayExport,
          render: (f, tUs) => rasterise(composeOverlay(layout, calls, f, plan.width, plan.height, spectroAt(tUs)), plan.width, plan.height),
        },
        { plan, videoSha256: link.blob_sha256, encoder, quality: opts.quality, speed: opts.speed, outPath, ffmpeg: null, names: scan.names, tailS: scan.tailS, display },
        (done, total) => setExportState({ kind: "running", done, total }),
        () => cancelRef.current
      );
      setExportState(
        outcome.kind === "done"
          ? { kind: "done", text: `Saved ${outcome.done.path} (${(outcome.done.bytes / 1e6).toFixed(1)} MB, ${outcome.done.seconds.toFixed(0)} s).` }
          : { kind: "idle" }
      );
    } catch (error) {
      const message = typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
      setExportState({ kind: "failed", text: `Export failed: ${message}` });
    }
  };

  const videoBox = layout.cells[videoCellId];
  const running = exportState.kind === "running";
  const status =
    exportState.kind === "running"
      ? `Exporting: frame ${exportState.done} of ${exportState.total}`
      : exportState.kind === "done" || exportState.kind === "failed"
        ? exportState.text
        : ffmpeg !== null && !ffmpeg.usable
          ? ffmpeg.problem
          : null;

  return (
    <NoteBlock role="region" aria-label="Overlay canvas" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-label-2 text-fg">Overlay</span>
        <select
          aria-label="Frame shape"
          className="rounded-[var(--radius-structural)] border border-rule bg-control px-1 py-0.5 font-mono text-label-2"
          value={layout.size}
          onChange={(e) => save({ ...layout, size: e.target.value as CanvasSize })}
        >
          {CANVAS_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {(["classic", "side", "reel"] as OverlayPreset[]).map((p) => (
          <button key={p} type="button" className={BUTTON} onClick={() => save(presetLayout(p, videoCellId, placed, clipAspect))}>
            {p === "classic" ? "Classic" : p === "side" ? "Side panel" : "Reel 9:16"}
          </button>
        ))}
        <span className="grow" />
        {running ? (
          <button type="button" className={BUTTON} onClick={() => (cancelRef.current = true)}>
            Cancel
          </button>
        ) : (
          <>
            <select aria-label="Resolution" className={SELECT} value={String(opts.resolution)} onChange={(e) => setOpt({ resolution: e.target.value === "source" ? "source" : (Number(e.target.value) as ExportResolution) })}>
              <option value="source">Source</option>
              <option value="1440">1440</option>
              <option value="1080">1080</option>
              <option value="720">720</option>
            </select>
            <select aria-label="Encoder" className={SELECT} value={encoder} onChange={(e) => setOpt({ encoder: e.target.value })}>
              {(encoders.length > 0 ? encoders : ["libx264"]).map((e) => (
                <option key={e} value={e}>
                  {ENCODER_NAMES[e] ?? e}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 font-mono text-label-2 text-fg-dim">
              Quality
              <input
                aria-label="Quality (CRF, lower is better)"
                type="number"
                min={14}
                max={40}
                value={opts.quality}
                onChange={(e) => setOpt({ quality: Math.min(40, Math.max(14, Math.round(Number(e.target.value) || 20))) })}
                className="w-12 rounded-[var(--radius-structural)] border border-rule bg-control px-1 py-0.5 font-mono text-label-2"
              />
            </label>
            <select aria-label="Speed" className={SELECT} value={opts.speed} onChange={(e) => setOpt({ speed: e.target.value as "fast" | "medium" | "slow" })}>
              <option value="fast">Fast</option>
              <option value="medium">Medium</option>
              <option value="slow">Slow</option>
            </select>
            <button type="button" className={BUTTON} disabled={ffmpeg?.usable !== true || link === null} onClick={() => void exportVideo()}>
              Export
            </button>
          </>
        )}
      </div>
      <div ref={frameRef} className="relative overflow-hidden bg-black" style={{ width: `min(100%, 720px, ${Math.round(560 * aspectOf(layout.size))}px)`, height: frameH }}>
        {link !== null && videoBox !== undefined && (
          <video
            ref={videoRef}
            src={videoUrl(link.blob_sha256)}
            muted
            playsInline
            preload="auto"
            className="absolute object-contain"
            style={{ left: `${videoBox.x * 100}%`, top: `${videoBox.y * 100}%`, width: `${videoBox.w * 100}%`, height: `${videoBox.h * 100}%` }}
          />
        )}
        <div ref={layerRef} className="pointer-events-none absolute inset-0" />
      </div>
      {status !== null && <p className="font-mono text-label-2 text-fg-dim">{status}</p>}
    </NoteBlock>
  );
}

import { Component, type ReactNode } from "react";

/** Keeps a failing overlay panel from taking the notebook down; shows why it failed. */
export class CanvasPanelBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? `${error.message}` : String(error) };
  }
  render() {
    if (this.state.error !== null) return <NoteBlock className="border-accent text-accent">Overlay canvas failed: {this.state.error}</NoteBlock>;
    return this.props.children;
  }
}

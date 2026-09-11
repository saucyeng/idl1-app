import { useEffect, useState } from "react";

import { indexStatus, onIndexProgress, startIndexJob, type IndexProgressEvent } from "../ipc/index_job";
import { onRebuildProgress, rebuildStatus, type RebuildProgressEvent } from "../ipc/rebuild_job";
import type { IpcError } from "../ipc/workbook";
import { isDrained } from "../routes/pages/Data/importDriver";
import { useImportQueue } from "../state/ImportQueue";
import { importChip, indexChip, rebuildChip } from "./importStatus";

/** Props for {@link ImportStatusChip}. */
export interface ImportStatusChipProps {
  /** Navigates to the Data tab, where the import panel lives — the chip's
   *  whole click behaviour (ruling R201 item 3). */
  onOpenImportPanel: () => void;
}

/** The shell's global import status (ruling R201 item 3): "Importing 12 /
 *  193 · ride-03.idl0" with the current file's own progress while the queue
 *  runs, "Import done · 190 ok, 3 failed" for a minute after it drains, and
 *  nothing at all otherwise. Rendered by `AppShell` rather than by `TopBar`
 *  because the top bar is `hidden` at narrow widths (`shell/layout.ts`'s
 *  `navPlacement`) and this has to be visible on every route at every size.
 *
 *  All the text and the fraction come from `shell/importStatus.ts`'s pure
 *  `importChip`; this component owns only the pixels, the click, and the
 *  one-second tick that lets the "done" chip expire (CLAUDE.md §2 — no
 *  number the sync model depends on is computed here; nothing is unit-
 *  tested here either, per CLAUDE.md §4).
 */
export default function ImportStatusChip({ onOpenImportPanel }: ImportStatusChipProps) {
  const [state] = useImportQueue();
  const [drainedAtMs, setDrainedAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [index, setIndex] = useState<IndexProgressEvent | null>(null);
  const [indexFinishedAtMs, setIndexFinishedAtMs] = useState<number | null>(null);
  const [indexError, setIndexError] = useState<IpcError | null>(null);
  const [rebuild, setRebuild] = useState<RebuildProgressEvent | null>(null);
  const [rebuildFinishedAtMs, setRebuildFinishedAtMs] = useState<number | null>(null);
  const [rebuildError, setRebuildError] = useState<IpcError | null>(null);
  const drained = isDrained(state);

  // The background catalog rebuild (ruling R219): read whatever is already
  // running and subscribe. Unlike indexing, nothing is *started* here — a
  // rebuild is a response to a user action or an empty catalog, not a thing
  // the shell does on every launch.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      const status = await rebuildStatus();
      if (cancelled) return;
      if (status.running && status.phase !== null) {
        setRebuild({ done: status.done, total: status.total, phase: status.phase, finished: false });
      }
      setRebuildError(status.last_error);
      const stop = await onRebuildProgress((event) => {
        setRebuild(event);
        // Only the observation carrying `finished` ends a run: every phase
        // reaches `done === total`, the last one before the swap.
        if (!event.finished) {
          setRebuildFinishedAtMs(null);
          return;
        }
        setRebuildFinishedAtMs(Date.now());
        void rebuildStatus().then((after) => setRebuildError(after.last_error));
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // The library index job (rulings R207/R208.1): read whatever is already
  // running, subscribe, then ask for one. `startIndexJob` resolves as soon
  // as the job is *started*, never when it finishes, so nothing here waits
  // on indexing — it must never sit between the user and a workbook.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    (async () => {
      const status = await indexStatus();
      if (cancelled) return;
      if (status.running && status.current_session_id !== null && status.phase !== null) {
        setIndex({
          done: status.done,
          total: status.total,
          current_session_id: status.current_session_id,
          phase: status.phase,
        });
      }
      setIndexError(status.last_error === null ? null : status.last_error);
      const stop = await onIndexProgress((event) => {
        setIndex(event);
        if (event.done < event.total) return;
        setIndexFinishedAtMs(Date.now());
        // The terminal observation carries counts, not the reason a run
        // never started — that only exists in `index_status`.
        void indexStatus().then((after) => setIndexError(after.last_error));
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
      await startIndexJob();
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Stamps the moment the queue drained, and clears it the moment more
  // files are enqueued — so a second batch never inherits the first
  // batch's already-expiring "done" chip.
  useEffect(() => {
    if (!drained) {
      setDrainedAtMs(null);
      return;
    }
    const at = Date.now();
    setDrainedAtMs(at);
    setNowMs(at);
  }, [drained]);

  // Only ticks while a "done" chip is up: a running queue (or a running
  // index job) re-renders on its own dispatches and events, and an idle app
  // renders nothing, so neither needs a timer.
  const indexDone = indexFinishedAtMs !== null;
  const rebuildDone = rebuildFinishedAtMs !== null;
  useEffect(() => {
    if (!drained && !indexDone && !rebuildDone) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [drained, indexDone, rebuildDone]);

  // An import in flight outranks everything: it is what the user just asked
  // for, and both background jobs follow it anyway. A rebuild outranks
  // indexing for the same reason one step down — indexing is what a rebuild
  // starts when it lands.
  const chip =
    importChip(state, drainedAtMs === null ? null : nowMs - drainedAtMs) ??
    rebuildChip(rebuild, rebuildFinishedAtMs === null ? null : nowMs - rebuildFinishedAtMs, rebuildError) ??
    indexChip(index, indexFinishedAtMs === null ? null : nowMs - indexFinishedAtMs, indexError);
  if (chip === null) return null;

  const toneClass =
    chip.tone === "failed" ? "text-brand-accent" : chip.tone === "done" ? "text-good" : "text-fg-dim";

  return (
    <button
      type="button"
      onClick={onOpenImportPanel}
      aria-label="Background work status — open the import panel"
      className="flex w-full items-center gap-2 border-b border-rule bg-surface px-2 py-1 text-left font-mono text-sm hover:bg-surface-2"
    >
      <span className={`truncate ${toneClass}`}>{chip.text}</span>
      {chip.fraction !== null && (
        <progress className="h-1 w-24 shrink-0 accent-good" value={chip.fraction * 100} max={100} />
      )}
    </button>
  );
}

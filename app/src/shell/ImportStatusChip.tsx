import { useEffect, useState } from "react";

import { isDrained } from "../routes/pages/Data/importDriver";
import { useImportQueue } from "../state/ImportQueue";
import { importChip } from "./importStatus";

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
  const drained = isDrained(state);

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

  // Only ticks while a "done" chip is up: a running queue re-renders on its
  // own `PROGRESS` dispatches, and an idle one renders nothing, so neither
  // needs a timer (no interval survives an idle app).
  useEffect(() => {
    if (!drained) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [drained]);

  const chip = importChip(state, drainedAtMs === null ? null : nowMs - drainedAtMs);
  if (chip === null) return null;

  const toneClass =
    chip.tone === "failed" ? "text-brand-accent" : chip.tone === "done" ? "text-good" : "text-fg-dim";

  return (
    <button
      type="button"
      onClick={onOpenImportPanel}
      aria-label="Import status — open the import panel"
      className="flex w-full items-center gap-2 border-b border-rule bg-surface px-2 py-1 text-left font-mono text-sm hover:bg-surface-2"
    >
      <span className={`truncate ${toneClass}`}>{chip.text}</span>
      {chip.fraction !== null && (
        <progress className="h-1 w-24 shrink-0 accent-good" value={chip.fraction * 100} max={100} />
      )}
    </button>
  );
}

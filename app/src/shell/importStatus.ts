import type { ImportQueueState } from "../routes/pages/Data/importQueue";

/** How long the "Import done" chip stays up after the queue drains, in
 *  milliseconds (ruling R201 item 3: "for a minute afterwards"). Long
 *  enough that a user who was on another tab still learns the batch
 *  finished, short enough that it is gone before it becomes furniture. */
export const DONE_CHIP_LINGER_MS = 60_000;

/** What the shell's import chip shows, or `null` for "show no chip"
 *  (nothing has been imported, or the done chip has lingered its minute).
 *  A pure projection of the queue — the chip component adds the pixels and
 *  the click, nothing else (CLAUDE.md §2). */
export interface ImportChip {
  /** The whole chip text, e.g. `"Importing 12 / 193 · ride-03.idl0"` or
   *  `"Import done · 190 ok, 3 failed"`. */
  text: string;
  /** The *current file's* own progress, `0`–`1`, or `null` when the running
   *  item has not reported a total yet (C3 §1 allows an unknown total; a
   *  fake fraction is worse than none). Always `null` once drained. */
  fraction: number | null;
  /** `"running"` while the queue is working, `"done"` when it drained with
   *  every item successful, `"failed"` when it drained with at least one
   *  failure — the chip's colour, not its text. */
  tone: "running" | "done" | "failed";
}

/** The file's own name out of an absolute path, handling both separators
 *  because a path from the Windows picker and one pasted from a POSIX shell
 *  both reach the queue verbatim. Falls back to the whole string for a path
 *  with no separator at all. */
export function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** The chip for `state`, `msSinceDrain` milliseconds after the queue last
 *  drained (`null` when it has never drained, or has been refilled since).
 *
 *  Counting: the "12" of "Importing 12 / 193" is the file being worked on —
 *  the number of finished items plus one — not the number finished, so the
 *  chip reads the way a person counts a stack of files. Progress inside the
 *  chip is the running file's own fraction, per R201 item 3; the panel's
 *  own bar (`overallPercent`) remains the whole-queue view. */
export function importChip(state: ImportQueueState, msSinceDrain: number | null): ImportChip | null {
  if (state.items.length === 0) return null;

  const running = state.items.find((item) => item.status === "running") ?? null;
  const terminal = state.items.filter((item) => item.status === "done" || item.status === "failed");

  if (running !== null || terminal.length < state.items.length) {
    const position = Math.min(terminal.length + 1, state.items.length);
    const name = running === null ? "waiting" : fileNameOf(running.path);
    return {
      text: `Importing ${position} / ${state.items.length} · ${name}`,
      fraction: fractionOf(running),
      tone: "running",
    };
  }

  // Drained: every item is terminal.
  if (msSinceDrain === null || msSinceDrain >= DONE_CHIP_LINGER_MS) return null;

  const failed = terminal.filter((item) => item.status === "failed").length;
  const ok = terminal.length - failed;
  const counts = failed > 0 ? `${ok} ok, ${failed} failed` : `${ok} ok`;
  return { text: `Import done · ${counts}`, fraction: null, tone: failed > 0 ? "failed" : "done" };
}

/** The running item's own progress as `0`–`1`, or `null` when there is no
 *  running item or its total is unknown. A total of `0` counts as complete
 *  rather than dividing by zero. */
function fractionOf(running: { done: number; total: number | null } | null): number | null {
  if (running === null || running.total === null) return null;
  if (running.total === 0) return 1;
  return running.done / running.total;
}

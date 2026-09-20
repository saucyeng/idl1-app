import { useState } from "react";

/**
 * The maths map's legend for ruling R250's state treatments — a chip that
 * opens a short key.
 *
 * A chip rather than an always-open panel: the grammar is small and a
 * reader learns it once, so a permanent key would spend canvas on something
 * that is useful for about a minute. Collapsed it says "Legend" and costs
 * one line of the toolbar.
 *
 * Every swatch is drawn from the same tokens the cards and edges use — no
 * new colour literal, which is also what keeps the legend honest: it cannot
 * drift from what the canvas draws without the token changing under both.
 *
 * Rendering only; not unit-tested (CLAUDE.md §4).
 */
export default function EvalLegend({ buttonClass }: { buttonClass: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((was) => !was)} aria-expanded={open} title="What the node states mean" className={buttonClass}>
        Legend
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1 w-[230px] rounded-[var(--radius-structural)] border border-rule bg-surface p-2 text-label-2 text-fg-dim">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
            <dt aria-hidden className="size-[8px] rounded-full bg-good" />
            <dd>Evaluated</dd>

            <dt aria-hidden className="size-[8px] rounded-full bg-accent" />
            <dd>Failed — this node is the cause</dd>

            <dt aria-hidden className="size-[8px] animate-pulse rounded-full bg-fg-faint motion-reduce:animate-none" />
            <dd>Working now (an arc while fetching)</dd>

            <dt aria-hidden className="size-[8px] rounded-full bg-fg-faint opacity-50" />
            <dd>Not in this session</dd>

            <dt aria-hidden>
              <svg viewBox="0 0 16 8" className="h-2 w-4 text-fg-faint">
                <line x1="0" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
              </svg>
            </dt>
            <dd>Blocked — an upstream step failed</dd>
          </dl>
        </div>
      )}
    </div>
  );
}

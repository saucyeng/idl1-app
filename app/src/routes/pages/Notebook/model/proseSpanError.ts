/**
 * Decision 63 (`runs/2026-09-07/ui/UI-DIRECTION-2.md`, section D): an inline
 * prose `${…}` span whose definition errored renders as an `--accent`
 * `⚠ name` marker — never the stale number the span last resolved to, and
 * never the raw "${expr} failed: message" text this app showed before this
 * task. The full failure message is available only on hover (the caller's
 * `title` attribute) — R153's rule applies here too: a marker that quietly
 * degrades to plain text on error would itself be a `catch` broadening a
 * specific failure into something that reads as ordinary prose.
 *
 * Pure text builder, mirroring `theme/slotStates.ts`'s separation of
 * message text from the caller's own styling — `ProseBlock.tsx` applies the
 * `--accent` colour and the `title` attribute; this module only decides the
 * two strings.
 */

/** What a failed `${…}` span shows in place of its value. */
export interface ProseSpanErrorMarker {
  /** The `⚠ name` text shown inline. `name` is the span's own expression
   *  text (`ProseSpanRef.expr`, C2 §5.2) — the identifier or expression the
   *  reader wrote, so the marker names exactly what failed to resolve. */
  text: string;
  /** The full error message — shown only on hover (`title`), never inline,
   *  so the sentence around the marker stays readable. */
  title: string;
}

/** Builds the marker for one failed span. `expr` and `message` are used
 *  verbatim; a caller with an empty `message` (not expected in practice —
 *  `evalInline`'s own error always carries text) still gets a marker whose
 *  hover text is simply empty, never a fabricated placeholder. */
export function proseSpanErrorMarker(expr: string, message: string): ProseSpanErrorMarker {
  return { text: `⚠ ${expr}`, title: message };
}

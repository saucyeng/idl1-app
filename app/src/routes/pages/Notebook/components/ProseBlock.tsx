import { useEffect, useRef } from "react";

import type { ProseBlockContent } from "../model/proseBlocks";
import { proseSpanErrorMarker } from "../model/proseSpanError";

/** Props for {@link ProseBlock}. */
export interface ProseBlockProps {
  /** What this block shows right now (`model/proseBlocks.ts`). */
  content: ProseBlockContent;
  /** Every inline `${…}` span's last-received `inlineResult.text`, by span id. A span with no entry yet shows its pending placeholder. */
  inlineResults: ReadonlyMap<string, string>;
  /** Every inline `${…}` span's last-received `spanError.message`, by span id (R66 item 2). Checked before `inlineResults` — the two are kept mutually exclusive per id by `Notebook/index.tsx`'s callbacks. */
  spanErrors?: ReadonlyMap<string, string>;
  /**
   * Ruling R132: `null` with zero or one window selected (no marker,
   * byte-identical to today), otherwise the primary window's label
   * (`model/jsCellNote.ts`'s `primaryWindowNote`). A resolved `${…}` span
   * is that window's own `evalInline` result — with more than one window
   * selected, appended in parentheses so the rendered sentence names which
   * window's value it is showing, rather than presenting it as the whole
   * selection's. A span already showing its error is left alone — the
   * error text names no window's value to attribute. Optional; defaults to
   * `null` so a caller from before this task is unaffected.
   */
  windowNote?: string | null;
}

/**
 * Renders one prose block (a cell's `prose_before`/`prose_after`, C2 §2.4).
 *
 * A `raw` block (no `eval_workbook` result yet for its cell) renders as
 * plain text, `${…}` sources intact — the fallback ledger R77.2 states.
 *
 * An `html` block renders `CellOutput.prose_before_html`/`prose_after_html`
 * (C3 §3.4) via `dangerouslySetInnerHTML` — **the one place this app does
 * so** (ledger R78, `runs/2026-09-03/decisions.md`). This is safe because
 * the string is core output, not sandbox output: it is `pulldown-cmark`
 * HTML rendered by Rust with any author-typed HTML escaped (ledger R70),
 * never text that has passed through the untrusted sandbox realm — R69's
 * "the host never calls `dangerouslySetInnerHTML` on sandbox output" is
 * unaffected, because this string never touches the sandbox. Every `${…}`
 * placeholder (`<span data-span-id="…">`) inside it is filled below, after
 * render, by setting that element's `textContent` only — never by
 * re-injecting HTML — from the sandbox's own `evalInline` result
 * (`spanId`/`inlineResult`/`spanError`, unchanged since before this task).
 */
export default function ProseBlock({ content, inlineResults, spanErrors, windowNote = null }: ProseBlockProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (content.kind !== "html") return;
    const container = containerRef.current;
    if (container === null) return;

    for (const span of content.spans) {
      const el = container.querySelector(`[data-span-id="${CSS.escape(span.id)}"]`);
      if (el === null) continue;

      const error = spanErrors?.get(span.id);
      if (error !== undefined) {
        // Decision 63: an errored span never renders a stale or plausible
        // number — an `--accent` `⚠ name` marker in place, the failure
        // message only on hover (`model/proseSpanError.ts`).
        const marker = proseSpanErrorMarker(span.expr, error);
        el.textContent = marker.text;
        el.setAttribute("title", marker.title);
        el.classList.add("text-accent");
        continue;
      }
      el.classList.remove("text-accent");
      el.removeAttribute("title");
      const resolved = inlineResults.get(span.id);
      if (resolved === undefined) {
        el.textContent = `\${${span.expr}}`;
        continue;
      }
      el.textContent = windowNote !== null ? `${resolved} (${windowNote})` : resolved;
    }
  }, [content, inlineResults, spanErrors, windowNote]);

  if (content.kind === "raw") {
    return <div className="prose-block">{content.text}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="prose-block"
      // SAFETY: `content.html` is core's own `prose_before_html`/
      // `prose_after_html` (C3 §3.4, ledger R70/R78) — see this
      // component's doc comment for why this is the one permitted
      // `dangerouslySetInnerHTML` in the app.
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  );
}

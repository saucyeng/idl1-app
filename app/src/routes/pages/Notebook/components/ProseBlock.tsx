import { useEffect, useRef } from "react";

import type { ProseBlockContent } from "../model/proseBlocks";

/** Props for {@link ProseBlock}. */
export interface ProseBlockProps {
  /** What this block shows right now (`model/proseBlocks.ts`). */
  content: ProseBlockContent;
  /** Every inline `${…}` span's last-received `inlineResult.text`, by span id. A span with no entry yet shows its pending placeholder. */
  inlineResults: ReadonlyMap<string, string>;
  /** Every inline `${…}` span's last-received `spanError.message`, by span id (R66 item 2). Checked before `inlineResults` — the two are kept mutually exclusive per id by `Notebook/index.tsx`'s callbacks. */
  spanErrors?: ReadonlyMap<string, string>;
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
export default function ProseBlock({ content, inlineResults, spanErrors }: ProseBlockProps) {
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
        el.textContent = `\${${span.expr}} failed: ${error}`;
        continue;
      }
      const resolved = inlineResults.get(span.id);
      el.textContent = resolved ?? `\${${span.expr}}`;
    }
  }, [content, inlineResults, spanErrors]);

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

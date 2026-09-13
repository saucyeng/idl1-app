import { useEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

import type { ProseBlockContent } from "../model/proseBlocks";
import { proseSpanErrorMarker, proseSpanNoSelectionMarker } from "../model/proseSpanError";

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
  /**
   * Decision 61: `true` when no session/window is selected at all
   * (`AppState.selection.windows.length === 0`). An unresolved span then
   * shows the no-selection marker instead of its `${expr}` placeholder,
   * since no result can arrive for a selection that does not exist.
   * Optional; defaults to `false`, so a read-only caller (print, the
   * report view) that never has an empty selection is unaffected.
   */
  noSelection?: boolean;
  /**
   * Ruling R226 item 1: opens this block in the prose mini-editor. When
   * given, the rendered block becomes a click target and a focus stop that
   * answers Enter; when omitted (print, the report view, any read-only
   * surface) the block renders exactly as it did before this task, with no
   * affordance at all.
   */
  onEdit?: () => void;
}

/** Whether a click on a rendered prose block means "edit this". A click
 *  that finished a text selection, or landed on a link, meant the
 *  selection or the link — opening an editor would throw either away. */
function clickMeansEdit(target: EventTarget | null): boolean {
  if (target instanceof Element && target.closest("a") !== null) return false;

  const selection = typeof window === "undefined" ? null : window.getSelection();
  return selection === null || selection.isCollapsed;
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
export default function ProseBlock({ content, inlineResults, spanErrors, windowNote = null, noSelection = false, onEdit }: ProseBlockProps) {
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
        if (noSelection) {
          // Decision 61: with nothing selected no result can ever arrive,
          // so the span says so in place rather than showing the raw
          // template text (or, worse, the number it last resolved to).
          const marker = proseSpanNoSelectionMarker(span.expr);
          el.textContent = marker.text;
          el.setAttribute("title", marker.title);
          el.classList.add("text-accent");
          continue;
        }
        el.textContent = `\${${span.expr}}`;
        continue;
      }
      el.textContent = windowNote !== null ? `${resolved} (${windowNote})` : resolved;
    }
  }, [content, inlineResults, spanErrors, windowNote, noSelection]);

  const editProps =
    onEdit === undefined
      ? {}
      : {
          className: "prose-block prose-block-editable cursor-text rounded-sm outline-none hover:bg-control focus-visible:ring-1 focus-visible:ring-accent",
          role: "button",
          tabIndex: 0,
          title: "Click to edit this text",
          onClick: (event: MouseEvent) => {
            if (clickMeansEdit(event.target)) onEdit();
          },
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key !== "Enter" || event.target !== event.currentTarget) return;
            event.preventDefault();
            onEdit();
          },
        };

  if (content.kind === "raw") {
    return (
      <div className="prose-block" {...editProps}>
        {content.text}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="prose-block"
      {...editProps}
      // SAFETY: `content.html` is core's own `prose_before_html`/
      // `prose_after_html` (C3 §3.4, ledger R70/R78) — see this
      // component's doc comment for why this is the one permitted
      // `dangerouslySetInnerHTML` in the app.
      dangerouslySetInnerHTML={{ __html: content.html }}
    />
  );
}

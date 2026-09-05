import type { ReactNode } from "react";

/**
 * Renders one block of prose (C2 §2.4's `prose_before`/`prose_after`) with
 * its inline `${…}` splices (C2 §5.2) filled from the sandbox's
 * `inlineResult` messages. `extractInlineSpans` is exported so
 * `Notebook/index.tsx` can find every span in a document's prose without
 * duplicating this regex — the C2 §5.2 grammar it implements is one line
 * (`inline_expr ::= "${" js_expression "}"`), so a plain, non-nested `${...}`
 * scan is exact for this grammar (it would not be for arbitrary JS
 * containing a literal `}` inside a string or object literal inside the
 * expression — out of scope for this task, matching `compileCell`'s own
 * lack of real parsing).
 */

/** One `${…}` occurrence found in a block of prose text. */
export interface InlineSpan {
  /** Stable id for this occurrence, used to route `evalInline`/`inlineResult` (`host/protocol.ts`).
   *  Not a C2 fence-string cell id — `spanIdPrefix` plus this span's ordinal position in the text. */
  spanId: string;
  /** The raw text between `${` and `}`, exclusive of the delimiters (C2 §5.2's `js_expression`). */
  expr: string;
  /** `[start, end)` JS string (UTF-16 code unit) offsets of the whole `${…}` occurrence within `text` —
   *  UI-only slicing, not the UTF-8 byte-offset convention `model/cells.ts` uses for IPC ranges. */
  range: [number, number];
}

const INLINE_SPAN_RE = /\$\{([^}]*)\}/g;

/** Finds every `${…}` occurrence in `text`, in left-to-right order, naming each `${spanIdPrefix}:{i}`. */
export function extractInlineSpans(text: string, spanIdPrefix: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  INLINE_SPAN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let ordinal = 0;
  while ((match = INLINE_SPAN_RE.exec(text)) !== null) {
    spans.push({
      spanId: `${spanIdPrefix}:${ordinal}`,
      expr: match[1],
      range: [match.index, match.index + match[0].length],
    });
    ordinal++;
  }
  return spans;
}

/** Props for {@link ProseSpan}. */
export interface ProseSpanProps {
  /** The raw prose text, `${…}` occurrences included verbatim. */
  text: string;
  /** Prefix used to derive each occurrence's `spanId` — stable across re-renders of the same document location (e.g. the owning cell's id, or `"doc"` for trailing prose with no following cell, C2 §2.4). */
  spanIdPrefix: string;
  /** Every span's last-received `inlineResult.text`, by `spanId`. A span with no entry yet renders its pending placeholder. */
  results: ReadonlyMap<string, string>;
  /**
   * Every span's last-received `spanError.message`, by `spanId` (R66 item
   * 2, `host/protocol.ts`'s distinct `spanError` message). `Notebook/
   * index.tsx`'s `onInlineResult`/`onSpanError` handlers keep this map and
   * `results` mutually exclusive per `spanId` (a new result clears that
   * span's prior error and vice versa), so this component checks
   * `spanErrors` first with no recency ordering to guess at — at most one
   * of the two maps holds an entry for any given `spanId` at a time.
   * Optional so existing call sites (none yet outside this lane) are not
   * forced to plumb an empty map; `undefined` behaves like an empty map.
   */
  spanErrors?: ReadonlyMap<string, string>;
}

/**
 * Renders `text` as plain text with every `${…}` occurrence replaced by its
 * resolved value once available. Before the first `inlineResult` for a span
 * arrives, that occurrence renders its literal source text (`${expr}`) —
 * chosen over a generic "loading…" placeholder so a reader mid-evaluation
 * sees exactly what will be replaced, not an opaque spinner, and so a
 * `${…}` whose sandbox round trip never completes (e.g. `evalInline` was
 * never wired up for an as-yet-uncreated sandbox) degrades to showing the
 * source expression rather than silently vanishing.
 *
 * Markdown formatting beyond the `${…}` splice itself is intentionally not
 * rendered here (no bold/italic/link handling) — this component's whole
 * job is the splice; a full Markdown renderer for prose blocks generally is
 * out of this task's scope (not named in the brief's Interfaces section).
 */
export default function ProseSpan({ text, spanIdPrefix, results, spanErrors }: ProseSpanProps) {
  const spans = extractInlineSpans(text, spanIdPrefix);

  if (spans.length === 0) {
    return <span className="prose-span">{text}</span>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.range[0] > cursor) {
      parts.push(<span key={`text-${i}`}>{text.slice(cursor, span.range[0])}</span>);
    }
    const error = spanErrors?.get(span.spanId);
    if (error !== undefined) {
      parts.push(
        <span key={`splice-${i}`} className="prose-span-inline prose-span-inline-error">
          {`\${${span.expr}} failed: ${error}`}
        </span>
      );
    } else {
      const resolved = results.get(span.spanId);
      parts.push(
        <span key={`splice-${i}`} className="prose-span-inline">
          {resolved ?? `\${${span.expr}}`}
        </span>
      );
    }
    cursor = span.range[1];
  });
  if (cursor < text.length) {
    parts.push(<span key="text-tail">{text.slice(cursor)}</span>);
  }

  return <span className="prose-span">{parts}</span>;
}

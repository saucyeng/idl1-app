import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { readWorkbookReference } from "../ipc/docs";
import { closeDocs, useDocsPanel } from "./docsPanelStore";
import { filterBlocks, parseDocsMarkdown, type Block, type Inline } from "./docsMarkdown";

/**
 * The Docs panel: the bundled workbook reference, rendered in the sidebar
 * (ruling R222 item 2).
 *
 * It shows in the sidebar rather than in a modal or a new window because
 * the reader is reading it *while* writing a cell — a dialog you must
 * dismiss to type is the wrong shape for a reference. The code column
 * stays visible and editable beside it.
 *
 * The document is fetched once, on first open, and kept. It is a static
 * file inside the bundle; refetching it on every open would be a command
 * round-trip for bytes that cannot have changed.
 *
 * Not unit-tested (CLAUDE.md §4: UI rendering is not unit-tested) — its
 * pure pieces are `docsMarkdown.ts` and `docsPanelStore.ts`, both tested.
 */

/** Renders one run of inlines. Links are rendered as anchors only for
 *  in-document `#` targets; an external URL is shown as plain text,
 *  because a navigation inside a Tauri webview would replace the app. */
function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        switch (inline.kind) {
          case "code":
            return (
              <code key={index} className="rounded-[var(--radius-structural)] bg-surface-2 px-1 font-mono text-[0.92em]">
                {inline.text}
              </code>
            );
          case "strong":
            return (
              <strong key={index} className="font-semibold text-fg">
                {inline.text}
              </strong>
            );
          case "link":
            return inline.href.startsWith("#") ? (
              <a
                key={index}
                href={inline.href}
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(inline.href.slice(1))?.scrollIntoView({ block: "start" });
                }}
                className="text-accent underline underline-offset-2"
              >
                {inline.text}
              </a>
            ) : (
              <span key={index}>{inline.text}</span>
            );
          default:
            return <span key={index}>{inline.text}</span>;
        }
      })}
    </>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-heading-1 text-fg",
  2: "text-heading-2 text-fg",
  3: "text-heading-3 text-fg",
  4: "font-mono text-label-1 text-fg",
};

/** Renders one parsed block. */
function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return (
        <h3
          id={block.anchor}
          className={cn("scroll-mt-2 pt-3 pb-1", HEADING_CLASS[block.level] ?? "text-label-1 text-fg")}
        >
          <Inlines inlines={block.inlines} />
        </h3>
      );
    case "paragraph":
      return (
        <p className="py-1 text-body-2 text-fg-dim">
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "code":
      return (
        <pre className="my-1 overflow-x-auto rounded-[var(--radius-structural)] bg-surface-2 p-2 font-mono text-label-2 text-fg">
          {block.text}
        </pre>
      );
    case "list":
      return (
        <ul className="list-disc py-1 pl-4 text-body-2 text-fg-dim">
          {block.items.map((item, index) => (
            <li key={index} className="py-0.5">
              <Inlines inlines={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="my-1 overflow-x-auto">
          <table className="w-full border-collapse text-label-2">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th key={index} className="border-b border-rule py-1 pr-2 text-left font-mono text-fg-faint">
                    <Inlines inlines={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-rule py-1 pr-2 align-top text-fg-dim">
                      <Inlines inlines={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** The panel itself. Mounted by `Sidebar.tsx` whenever the store says it is
 *  open. */
export default function DocsPanel() {
  const { anchor, nonce } = useDocsPanel();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (markdown !== null) return;
    let cancelled = false;
    readWorkbookReference()
      .then((text) => {
        if (!cancelled) setMarkdown(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e !== null && typeof e === "object" && "message" in e
              ? String((e as { message: unknown }).message)
              : "The workbook reference could not be read."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [markdown]);

  const blocks = useMemo(() => (markdown === null ? [] : parseDocsMarkdown(markdown)), [markdown]);
  const shown = useMemo(() => filterBlocks(blocks, query), [blocks, query]);

  // Scroll to the requested anchor once the document is on screen. Depends
  // on `nonce` as well as `anchor` so pressing F1 twice on the same word
  // scrolls both times (see `docsPanelStore.ts`).
  useEffect(() => {
    if (anchor === null || markdown === null) return;
    // A search in progress can have filtered the target out from under the
    // request; clearing it is the only way the anchor exists to scroll to.
    if (query !== "") setQuery("");
    const target = scrollRef.current?.querySelector(`#${CSS.escape(anchor)}`);
    target?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` is
    // written here, not read as a dependency; adding it would re-run the
    // scroll on every keystroke in the search box.
  }, [anchor, nonce, markdown]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-rule px-2 py-1">
        <Search aria-hidden size={13} strokeWidth={1.5} className="shrink-0 text-fg-faint" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the reference"
          aria-label="Search the workbook reference"
          className="min-w-0 flex-1 bg-transparent text-label-2 text-fg outline-none placeholder:text-fg-faint"
        />
        <button
          type="button"
          onClick={closeDocs}
          aria-label="Close the reference"
          title="Close the reference"
          className="rounded-[var(--radius-structural)] p-1 text-fg-faint hover:text-fg"
        >
          <X aria-hidden size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-3 pb-6">
        {error !== null && <p className="py-3 text-body-2 text-hivis">{error}</p>}
        {error === null && markdown === null && <p className="py-3 text-body-2 text-fg-faint">Loading the reference…</p>}
        {error === null && markdown !== null && shown.length === 0 && (
          <p className="py-3 text-body-2 text-fg-faint">Nothing in the reference matches “{query}”.</p>
        )}
        {shown.map((block, index) => (
          <BlockView key={index} block={block} />
        ))}
      </div>
    </div>
  );
}

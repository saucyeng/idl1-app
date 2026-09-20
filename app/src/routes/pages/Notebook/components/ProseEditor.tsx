import { useEffect, useRef, useState } from "react";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Loader2Icon } from "lucide-react";

import type { CellStatus } from "../model/cellStatus";
import { brandEditorTheme, brandHighlightStyle } from "../editor/cmTheme";
import { languageFor } from "../editor/idl1Language";
import { documentVars } from "../theme/series";

/** Props for {@link ProseEditor}. */
export interface ProseEditorProps {
  /** The block's Markdown source, verbatim — inline `${…}` spans included
   *  (ruling R226 item 1: the editor holds source, not rich text). Seeds
   *  the document once; this component owns the text from then on. */
  source: string;
  /** The owning cell's evaluation status (ruling R210), shown beside the
   *  editor while a commit's re-evaluation settles (R226 item 3). */
  status: CellStatus;
  /** The last commit's rejection message, shown under the editor until the
   *  user types again (R226 item 3). `null` when nothing was rejected. */
  error: string | null;
  /** Ctrl/Cmd+Enter or blur. Receives the editor's current text; the
   *  caller decides whether it is valid and whether the editor stays
   *  open. */
  onCommit(draft: string): void;
  /** Esc — the draft is discarded and the block re-renders. */
  onCancel(): void;
}

/**
 * The prose mini-editor ruling R226 item 1 puts in place of a rendered
 * prose block while it is being edited: one CodeMirror 6 view over that
 * block's own Markdown, committed with Ctrl/Cmd+Enter or blur and
 * abandoned with Esc.
 *
 * Not unit-tested (CLAUDE.md §4: UI rendering is not unit-tested) — the
 * open/commit/cancel decisions and the document transform live in
 * `model/proseEdit.ts`, which is.
 *
 * The draft is deliberately **not** lifted into the notebook's state on
 * every keystroke: a prose block sits inside the cell list, and a state
 * update per character would re-render the whole notebook on the
 * interaction path (CLAUDE.md §3). The caller sees the text once, when the
 * editor commits.
 */
export default function ProseEditor({ source, status, error, onCommit, onCancel }: ProseEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onCommitRef = useRef(onCommit);
  const onCancelRef = useRef(onCancel);
  /** Set by an explicit commit or cancel, so the blur those cause on the
   *  way out does not fire a second commit behind them. */
  const settledRef = useRef(false);
  /** The rejection message is hidden the moment the user types again — the
   *  message describes the commit that was refused, not the draft in
   *  front of them. */
  const [errorDismissed, setErrorDismissed] = useState(false);

  onCommitRef.current = onCommit;
  onCancelRef.current = onCancel;

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const read = documentVars();

    const state = EditorState.create({
      doc: source,
      extensions: [
        EditorView.lineWrapping,
        history(),
        syntaxHighlighting(brandHighlightStyle(read)),
        brandEditorTheme(read),
        keymap.of([
          {
            key: "Mod-Enter",
            run: (view) => {
              settledRef.current = true;
              onCommitRef.current(view.state.doc.toString());
              return true;
            },
          },
          {
            key: "Escape",
            run: () => {
              settledRef.current = true;
              onCancelRef.current();
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        languageFor("prose"),
        EditorView.domEventHandlers({
          blur: (_event, view) => {
            if (settledRef.current) return false;
            settledRef.current = true;
            onCommitRef.current(view.state.doc.toString());
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setErrorDismissed(true);
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `source`
    // seeds the initial document only; a rejected commit keeps the user's
    // own draft on screen rather than reverting it to the file's text.
  }, []);

  // A commit that was refused leaves the editor open (R226 item 3), so the
  // blur guard has to re-arm or the next blur would be ignored.
  useEffect(() => {
    if (error === null) return;
    settledRef.current = false;
    setErrorDismissed(false);
    viewRef.current?.focus();
  }, [error]);

  const showError = error !== null && !errorDismissed;

  return (
    <div className="prose-editor rounded-sm border border-accent bg-surface">
      <div className="prose-editor-row flex items-start gap-1 p-1">
        <div className="prose-editor-view min-w-0 flex-1" ref={containerRef} />
        <span className="prose-editor-status mt-[2px] flex size-[12px] shrink-0 items-center justify-center" role="status" aria-label={statusLabel(status)} title={statusLabel(status)}>
          {status === "done" || status === "idle" || status === "blocked" ? null : status === "error" ? (
            <span className="text-accent">✕</span>
          ) : (
            <Loader2Icon className="size-[12px] animate-spin text-fg-faint" />
          )}
        </span>
      </div>
      {showError && <p className="prose-editor-error px-1 pb-1 text-label-2 text-accent">{error}</p>}
    </div>
  );
}

/** The status glyph's accessible name — R210's states as amended by
 *  decision 59 (which split waiting-with-a-previous-result out of
 *  `"evaluating"`) and by ruling R250, which added the four states an
 *  inline `${…}` span can also be in. */
function statusLabel(status: CellStatus): string {
  switch (status) {
    case "idle":
      return "No session selected";
    case "queued":
      return "Queued";
    case "fetching":
      return "Loading channels";
    case "evaluating":
      return "Evaluating";
    case "rendering":
      return "Rendering";
    case "blocked":
      return "Blocked by an upstream failure";
    case "stale":
      return "Recomputing, showing the previous result";
    case "error":
      return "Evaluation failed";
    case "done":
      return "Settled";
  }
}

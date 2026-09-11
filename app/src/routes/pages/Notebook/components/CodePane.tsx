import { useEffect, useRef } from "react";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

import { brandEditorTheme, brandHighlightStyle } from "../editor/cmTheme";
import { completionExtension, languageFor } from "../editor/idl1Language";
import { documentVars } from "../theme/series";

/** How long typing pauses in the Code pane before {@link CodePaneProps.onChange}
 *  fires (P6: no IPC on the interaction path — only a debounced settle
 *  should reach the caller, which decides whether/when to re-evaluate).
 *  No spec number is given; 400ms follows the same order of magnitude as
 *  `Settings/ProfileSection.tsx`'s 500ms field-write debounce, chosen a
 *  little shorter here since a code edit's feedback (re-evaluation) is
 *  more central to what the pane is for than a settings field's write. */
export const CODE_CHANGE_DEBOUNCE_MS = 400;

/** Props for {@link CodePane}. */
export interface CodePaneProps {
  /** The fence's cell kind (C2 §2.1); selects the language mode. */
  kind: "prose" | "math" | "table" | "js";
  /** The cell's current source text (one cell's body, not the whole
   *  document — addressed by `model/cells.ts`'s byte ranges one layer up). */
  code: string;
  /** Called with the pane's new text, debounced by
   *  {@link CODE_CHANGE_DEBOUNCE_MS} after the user stops typing. Never
   *  called for a programmatic `code` prop change this component itself
   *  applied. This component never calls IPC, `evalWorkbook`, or any
   *  `ipc/*` function — a later task decides whether/when a change here
   *  triggers re-evaluation (P1, P6). */
  onChange(nextCode: string): void;
  /** Known channel ids offered as completions, independent of the cell's
   *  own kind. */
  channelIds: string[];
  /** Known workbook math-definition names offered as completions. */
  definitionNames: string[];
}

/**
 * The Notebook's Code pane: one CodeMirror 6 `EditorView` per open cell,
 * with the language chosen by {@link CodePaneProps.kind}. Not unit-tested
 * (CLAUDE.md §4: UI rendering is not unit-tested) — its pure pieces
 * (`tokenizeMath`, `MATH_FUNCTIONS`) are tested in `model/mathMode.test.ts`.
 */
export default function CodePane({ kind, code, onChange, channelIds, definitionNames }: CodePaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const channelIdsRef = useRef(channelIds);
  const definitionNamesRef = useRef(definitionNames);
  const onChangeRef = useRef(onChange);

  channelIdsRef.current = channelIds;
  definitionNamesRef.current = definitionNames;
  onChangeRef.current = onChange;

  // One EditorView per (container, kind): the language extension is fixed
  // at construction, so a kind change tears down and rebuilds the view
  // rather than reconfiguring it in place (a cell's kind does not change
  // while it is open in practice — C2 §2.1's fence language is part of the
  // fence-open line, edited by replacing the fence, not by this pane).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    const read = documentVars();

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        // The pane is now hosted in the studio's properties column (R108),
        // which is ~320 px wide -- far narrower than the wide-layout pane it
        // was built for, so an unwrapped line hides its own tail behind a
        // horizontal scrollbar. Wrapping is unconditional rather than
        // column-only: a wrapped long line reads the same in every
        // placement, and a renderer-only parameter would be a P-rule
        // violation (CLAUDE.md: no renderer-only parameters).
        EditorView.lineWrapping,
        history(),
        syntaxHighlighting(brandHighlightStyle(read)),
        brandEditorTheme(read),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        completionExtension(channelIdsRef, definitionNamesRef),
        languageFor(kind),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) {
            return;
          }
          if (debounceRef.current !== undefined) {
            clearTimeout(debounceRef.current);
          }
          const nextCode = update.state.doc.toString();
          debounceRef.current = setTimeout(() => {
            onChangeRef.current(nextCode);
          }, CODE_CHANGE_DEBOUNCE_MS);
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      if (debounceRef.current !== undefined) {
        clearTimeout(debounceRef.current);
      }
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `code` seeds
    // the initial doc only; external updates are applied by the effect
    // below rather than by rebuilding the view on every keystroke's own
    // resulting `code` prop change.
  }, [kind]);

  // Keep the editor's document in sync with an externally changed `code`
  // prop (e.g. a different revision loaded) without disturbing it for the
  // pane's own debounced edits (which is why this does not fire on every
  // `code` change — see the guard below, comparing against the live doc).
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) {
      return;
    }
    const currentText = view.state.doc.toString();
    if (currentText === code) {
      return;
    }
    view.dispatch({ changes: { from: 0, to: currentText.length, insert: code } });
  }, [code]);

  return <div className="code-pane" ref={containerRef} />;
}

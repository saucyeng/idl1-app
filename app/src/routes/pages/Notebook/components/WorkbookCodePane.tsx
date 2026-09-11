import { useEffect, useRef } from "react";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { codeFolding, foldGutter, foldKeymap, foldService, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, keymap, lineNumbers, type DecorationSet } from "@codemirror/view";

import { openDocs } from "../../../../shell/docsPanelStore";
import { builtinDocAt, builtinHover } from "../editor/builtinDocs";
import { brandEditorTheme, brandHighlightStyle } from "../editor/cmTheme";
import { completionExtension, workbookLanguage } from "../editor/idl1Language";
import { cellIdAtOffset, documentCellRanges, rangeForCell } from "../model/documentRanges";
import { documentVars } from "../theme/series";
import { CODE_CHANGE_DEBOUNCE_MS } from "./CodePane";

/** The banded range, as the editor's own state sees it: `null` clears the
 *  band (nothing selected, or a selection naming a cell this document no
 *  longer has). */
const setBandedRange = StateEffect.define<{ from: number; to: number } | null>();

/** Line decorations for the banded cell (ruling R214 item 3: "a subtle
 *  line-gutter band, not a selection" — so the cell's extent is legible
 *  while the caret and the real text selection stay the user's). Mapped
 *  through document changes so an edit above the band does not leave it
 *  pointing at the wrong lines before the next effect arrives. */
const bandedCellField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setBandedRange)) continue;
      const range = effect.value;
      if (range === null) {
        next = Decoration.none;
        continue;
      }
      const builder = [];
      const lastLine = tr.state.doc.lineAt(Math.min(range.to, tr.state.doc.length)).number;
      for (let n = tr.state.doc.lineAt(Math.min(range.from, tr.state.doc.length)).number; n <= lastLine; n++) {
        builder.push(Decoration.line({ class: "idl-cell-band" }).range(tr.state.doc.line(n).from));
      }
      next = Decoration.set(builder);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The band's own look — a faint ground and a rule down the gutter edge,
 *  deliberately weaker than a text selection so the two can be told apart
 *  at a glance. */
const bandTheme = EditorView.theme({
  ".idl-cell-band": {
    backgroundColor: "color-mix(in srgb, var(--hivis) 7%, transparent)",
    boxShadow: "inset 2px 0 0 0 var(--hivis)",
  },
});

/** Folds each cell's body from the end of its fence-open line to the end of
 *  its body (C2 §2.2), so the fold marker sits on the fence line and a
 *  folded cell still shows what kind it is and what its id is. Reads the
 *  ranges from the live document rather than a captured prop — a fold is a
 *  user gesture, not a render, and the document may have moved on. */
const cellFolding = foldService.of((state, lineStart, lineEnd) => {
  const ranges = documentCellRanges(state.doc.toString());
  const cell = ranges.find((range) => range.fenceFrom === lineStart);
  if (cell === undefined || cell.to <= lineEnd) return null;
  return { from: lineEnd, to: cell.to };
});

/** Props for {@link WorkbookCodePane}. */
export interface WorkbookCodePaneProps {
  /** The whole `.idl1wb` document — the file is the truth (R214 item 3),
   *  so this pane edits the document itself, not one cell's body. */
  markdown: string;
  /** The Notebook's selected cell, or `null`. The pane scrolls to it and
   *  bands its range; it never changes the text selection for it. */
  selectedCellId: string | null;
  /** Fired when the caret moves into a different cell's range (or out of
   *  every cell, with `null`) — R214 item 3's inbound half of the two-way
   *  highlight. Never fired for a selection this pane's own
   *  {@link selectedCellId} prop already names. */
  onSelectCell: (cellId: string | null) => void;
  /** Fired with the whole new document text, debounced by the same
   *  {@link CODE_CHANGE_DEBOUNCE_MS} a per-cell edit uses (R214 item 3:
   *  "the same debounce as per-cell edits today"). Never called for a
   *  programmatic `markdown` prop change this component itself applied. */
  onChange: (nextMarkdown: string) => void;
  /** Known channel ids offered as completions. */
  channelIds: string[];
  /** Known workbook math-definition names offered as completions. */
  definitionNames: string[];
}

/**
 * The Properties/Code column's code pane: **the whole workbook in one
 * CodeMirror instance** (ruling R214 item 3), markdown-highlighted with
 * each cell's body in its own fence language, folding per cell, and a
 * two-way selection tie to the rest of the Notebook — selecting a graph
 * node, a subgraph frame, an output chart or a cell in the Cells column
 * scrolls the document to that cell and bands its range; placing the caret
 * inside a cell's range selects that cell everywhere else.
 *
 * Replaces the per-cell `CodePane` in that column only. The per-cell
 * editors in the Cells column (`JsCellFrame`) are untouched, and `CodePane`
 * itself still serves them and the narrow sheet.
 *
 * Rendering only; not unit-tested (CLAUDE.md §4) — the decisions behind
 * every offset here are `model/documentRanges.ts`'s, which is.
 */
export default function WorkbookCodePane({ markdown, selectedCellId, onSelectCell, onChange, channelIds, definitionNames }: WorkbookCodePaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const channelIdsRef = useRef(channelIds);
  const definitionNamesRef = useRef(definitionNames);
  const onChangeRef = useRef(onChange);
  const onSelectCellRef = useRef(onSelectCell);
  const selectedCellIdRef = useRef(selectedCellId);

  channelIdsRef.current = channelIds;
  definitionNamesRef.current = definitionNames;
  onChangeRef.current = onChange;
  onSelectCellRef.current = onSelectCell;
  selectedCellIdRef.current = selectedCellId;

  // One EditorView for the pane's whole life: unlike `CodePane`, there is
  // no `kind` to rebuild for — the document is the document.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const read = documentVars();

    const state = EditorState.create({
      doc: markdown,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        history(),
        codeFolding(),
        foldGutter(),
        cellFolding,
        bandedCellField,
        bandTheme,
        syntaxHighlighting(brandHighlightStyle(read)),
        brandEditorTheme(read),
        // `F1` on a builtin opens its entry in the Docs panel, and hovering
        // one shows its catalog line (ruling R222 item 2) -- the same two
        // extensions `CodePane` carries, since this pane is the code column
        // wherever there is room for the whole document.
        keymap.of([
          {
            key: "F1",
            preventDefault: true,
            run: (view) => {
              const doc = builtinDocAt(view.state.doc.toString(), view.state.selection.main.head);
              openDocs(doc?.doc_anchor ?? null);
              return true;
            },
          },
        ]),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        builtinHover(),
        completionExtension(channelIdsRef, definitionNamesRef),
        workbookLanguage(),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);
            const nextMarkdown = update.state.doc.toString();
            debounceRef.current = setTimeout(() => onChangeRef.current(nextMarkdown), CODE_CHANGE_DEBOUNCE_MS);
          }
          // The caret's own half of the two-way tie. `selectionSet` alone
          // would also fire for the selection a document replacement
          // carries, which is why the "same cell as the prop already
          // names" guard below matters more than a cheap early return.
          if (!update.selectionSet && !update.docChanged) return;
          const ranges = documentCellRanges(update.state.doc.toString());
          const cellId = cellIdAtOffset(ranges, update.state.selection.main.head);
          if (cellId === selectedCellIdRef.current) return;
          onSelectCellRef.current(cellId);
        }),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;

    return () => {
      if (debounceRef.current !== undefined) clearTimeout(debounceRef.current);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `markdown`
    // seeds the initial doc only; external updates are applied by the
    // effect below rather than by rebuilding the view.
  }, []);

  // An externally changed document (a graph edit, a watch event, a
  // different workbook) replaces the doc — guarded against the pane's own
  // debounced edits by comparing with the live text first.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const currentText = view.state.doc.toString();
    if (currentText === markdown) return;
    view.dispatch({ changes: { from: 0, to: currentText.length, insert: markdown } });
  }, [markdown]);

  // Selection in: scroll the document to the selected cell and band its
  // range. Never touches the text selection — R214 item 3 is explicit that
  // this is a band, not a selection.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    if (selectedCellId === null) {
      view.dispatch({ effects: setBandedRange.of(null) });
      return;
    }
    const range = rangeForCell(documentCellRanges(view.state.doc.toString()), selectedCellId);
    if (range === null) {
      view.dispatch({ effects: setBandedRange.of(null) });
      return;
    }
    view.dispatch({
      effects: [setBandedRange.of({ from: range.fenceFrom, to: range.to }), EditorView.scrollIntoView(range.fenceFrom, { y: "start", yMargin: 24 })],
    });
  }, [selectedCellId, markdown]);

  return <div className="code-pane h-full overflow-auto" ref={containerRef} />;
}

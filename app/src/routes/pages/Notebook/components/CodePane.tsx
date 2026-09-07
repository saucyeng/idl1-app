import { useEffect, useRef } from "react";

import { autocompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage, LanguageSupport, syntaxHighlighting, type StreamParser } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags, type Tag } from "@lezer/highlight";

import { brandEditorTheme, brandHighlightStyle } from "../editor/cmTheme";
import { tokenizeMath, type MathTokenKind } from "../model/mathMode";
import { MATH_FUNCTIONS } from "../model/functionCatalog";
import { documentVars } from "../theme/series";

/** How long typing pauses in the Code pane before {@link CodePaneProps.onChange}
 *  fires (P6: no IPC on the interaction path — only a debounced settle
 *  should reach the caller, which decides whether/when to re-evaluate).
 *  No spec number is given; 400ms follows the same order of magnitude as
 *  `Settings/ProfileSection.tsx`'s 500ms field-write debounce, chosen a
 *  little shorter here since a code edit's feedback (re-evaluation) is
 *  more central to what the pane is for than a settings field's write. */
const CODE_CHANGE_DEBOUNCE_MS = 400;

/** Maps this lane's {@link MathTokenKind} to a `@lezer/highlight` tag, for
 *  the math `StreamLanguage`'s `tokenTable` (`docs/vendor/codemirror-6/
 *  reference-index.md`'s `StreamParser.tokenTable`: "when the tokenizer
 *  returns a token name that exists as a property in this object, the
 *  corresponding tags will be assigned to the token"). `@lezer/highlight`
 *  is a transitive dependency of the three M0-pinned CodeMirror packages
 *  (present under `node_modules/@lezer/highlight`), not a new dependency. */
const MATH_TOKEN_TAGS: Record<MathTokenKind, Tag> = {
  keyword: tags.keyword,
  identifier: tags.variableName,
  channelRef: tags.special(tags.variableName),
  cellRef: tags.special(tags.atom),
  number: tags.number,
  operator: tags.operator,
  function: tags.function(tags.variableName),
  comment: tags.lineComment,
  labelComment: tags.docComment,
};

/** The math `StreamParser` wrapping the pure {@link tokenizeMath}. Stateless
 *  (`State = null`): the math grammar has no cross-line construct (no
 *  multi-line comments or strings, C2 §3.1), so nothing needs to survive
 *  from one line to the next. Recomputes `tokenizeMath(stream.string)` on
 *  every `token()` call, which is once per token boundary on one line of
 *  source — cheap enough at Code-pane line lengths that a per-line memo
 *  was not worth the extra state. */
const mathStreamParser: StreamParser<null> = {
  name: "idl1-math",
  startState: () => null,
  token(stream) {
    const lineTokens = tokenizeMath(stream.string);
    const match = lineTokens.find((t) => t.start === stream.pos);
    if (match) {
      stream.pos = match.end;
      return match.kind;
    }
    stream.next();
    return null;
  },
  tokenTable: MATH_TOKEN_TAGS,
};

const mathLanguage = StreamLanguage.define(mathStreamParser);

/** The four cell kinds `CodePane` can edit (C2 §2.1). `prose`/`table`/`js`
 *  reuse the two M0-pinned language packages; `math` is this lane's own
 *  `StreamLanguage` over {@link tokenizeMath}. */
function languageFor(kind: CodePaneProps["kind"]): Extension {
  switch (kind) {
    case "prose":
      return markdown();
    case "table":
    case "js":
      // C2 §4: a table cell's fence body is one JSON object, so the JS
      // language mode's tokenizer (a superset of JSON) is reused rather
      // than adding a JSON-only language.
      return javascript();
    case "math":
      return new LanguageSupport(mathLanguage);
  }
}

/** Builds the completion source for one `CodePane` instance from its
 *  current props, read through refs so a prop change (a newly landed
 *  channel, say) is picked up by the next completion query without
 *  recreating the `EditorView`/its extensions. Offers every
 *  {@link MATH_FUNCTIONS} name (detail text = its signature; a
 *  `notImplemented` entry is still offered, per the plan's "known catalog
 *  function names… greyed" — `type: "notImplemented"` on its
 *  {@link Completion} exists for a later CSS pass to grey it, via
 *  `autocompletion`'s `optionClass`) plus every channel id and workbook
 *  definition name supplied as props. */
function makeCompletionSource(channelIdsRef: { current: string[] }, definitionNamesRef: { current: string[] }): CompletionSource {
  return (context) => {
    const word = context.matchBefore(/[\w[\]{}]*/);
    if (word === null || (word.from === word.to && !context.explicit)) {
      return null;
    }

    const options: Completion[] = [
      ...MATH_FUNCTIONS.map(
        (entry): Completion => ({
          label: entry.name,
          detail: entry.signature,
          type: entry.status === "notImplemented" ? "notImplemented" : "function",
        }),
      ),
      ...channelIdsRef.current.map((id): Completion => ({ label: id, type: "variable" })),
      ...definitionNamesRef.current.map((name): Completion => ({ label: name, type: "variable" })),
    ];

    return { from: word.from, options };
  };
}

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

    const completionSource = makeCompletionSource(channelIdsRef, definitionNamesRef);
    const read = documentVars();

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        syntaxHighlighting(brandHighlightStyle(read)),
        brandEditorTheme(read),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        autocompletion({ override: [completionSource] }),
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

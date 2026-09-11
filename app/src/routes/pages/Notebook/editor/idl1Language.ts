/**
 * The CodeMirror language and completion pieces both Notebook editors share
 * — `components/CodePane.tsx` (one cell's body) and
 * `components/WorkbookCodePane.tsx` (the whole `.idl1wb` document, ruling
 * R214 item 3). One copy, so the math highlighting a reader sees in the
 * column and in a per-cell editor can never drift apart.
 *
 * Nothing here renders or holds state; it only builds extensions.
 */

import { autocompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { LanguageDescription, LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { tags, type Tag } from "@lezer/highlight";

import { MATH_FUNCTIONS } from "../model/functionCatalog";
import { tokenizeMath, type MathTokenKind } from "../model/mathMode";
import type { CellKindToken } from "../model/cells";

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

/** C2 §3.1's math grammar as a CodeMirror language. */
export const mathLanguage = StreamLanguage.define(mathStreamParser);

/** The four cell kinds an editor can hold (C2 §2.1). `prose`/`table`/`js`
 *  reuse the two M0-pinned language packages; `math` is this lane's own
 *  `StreamLanguage` over {@link tokenizeMath}.
 *
 * @param kind - The cell's fence-language token, or `prose`. */
export function languageFor(kind: CellKindToken | "prose"): Extension {
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

/**
 * The whole-document language: markdown, with each fenced cell's own body
 * highlighted in its fence language (C2 §2.1's three tokens). `lang-markdown`
 * resolves a fence's info string against these descriptions itself — this is
 * the same three languages {@link languageFor} hands a single-cell editor,
 * nested rather than chosen.
 */
export function workbookLanguage(): Extension {
  return markdown({
    codeLanguages: [
      LanguageDescription.of({ name: "math", support: new LanguageSupport(mathLanguage) }),
      LanguageDescription.of({ name: "js", alias: ["javascript"], support: javascript() }),
      LanguageDescription.of({ name: "table", support: javascript() }),
    ],
  });
}

/**
 * Builds an editor's completion source from refs the caller keeps current,
 * so a prop change (a newly landed channel, say) is picked up by the next
 * completion query without recreating the `EditorView`/its extensions.
 * Offers every {@link MATH_FUNCTIONS} name (detail text = its signature; a
 * `notImplemented` entry is still offered, per the plan's "known catalog
 * function names… greyed" — `type: "notImplemented"` on its
 * {@link Completion} exists for a later CSS pass to grey it, via
 * `autocompletion`'s `optionClass`) plus every channel id and workbook
 * definition name supplied as props.
 *
 * @param channelIdsRef - Channel ids to offer.
 * @param definitionNamesRef - Workbook definition names to offer.
 */
export function makeCompletionSource(channelIdsRef: { current: string[] }, definitionNamesRef: { current: string[] }): CompletionSource {
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

/** `autocompletion` configured with {@link makeCompletionSource}'s result —
 *  the one-line form both editors use. */
export function completionExtension(channelIdsRef: { current: string[] }, definitionNamesRef: { current: string[] }): Extension {
  return autocompletion({ override: [makeCompletionSource(channelIdsRef, definitionNamesRef)] });
}

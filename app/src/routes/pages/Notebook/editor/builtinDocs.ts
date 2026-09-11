import { hoverTooltip, type Tooltip } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

import type { MathBuiltinDto } from "../../../../ipc/workbook";

/**
 * The editor's builtin help (ruling R222 item 2): hovering a builtin's name
 * in a `math` cell shows its catalog entry — signature, unit rule, one-line
 * description — and `F1` opens the same entry in the Docs panel.
 *
 * The entries come from `list_math_builtins`, which `Notebook/index.tsx`
 * already fetches once at notebook open for its own catalog self-check.
 * They are published here rather than threaded through props because the
 * reader is a CodeMirror extension built once per `EditorView`, not a React
 * subtree — the same reason `docsPanelStore.ts` is a module store.
 *
 * Empty until that fetch lands. A hover before then shows nothing, which is
 * the correct degradation: an empty tooltip is better than a wrong one, and
 * the fetch resolves in the first frames after the notebook opens.
 */

/** What one hover renders, narrowed from `MathBuiltinDto`. */
export interface BuiltinDoc {
  name: string;
  signature: string;
  unit_rule: string;
  description: string;
  /** The builtin's anchor in the bundled reference, computed in Rust so the
   *  slug rule lives in exactly one place. */
  doc_anchor: string;
}

let docsByName = new Map<string, BuiltinDoc>();

/** Publishes the engine's catalog for the hover and `F1` to read. Called
 *  once, by the same effect that runs the catalog self-check. */
export function setBuiltinDocs(builtins: MathBuiltinDto[]): void {
  docsByName = new Map(
    builtins.map((b) => [
      b.name,
      { name: b.name, signature: b.signature, unit_rule: b.unit_rule, description: b.description, doc_anchor: b.doc_anchor },
    ])
  );
}

/** Clears the published catalog. Test-only — a module store otherwise leaks
 *  one test's fixture into the next. */
export function resetBuiltinDocs(): void {
  docsByName = new Map();
}

/** The entry for `name`, or `undefined` when the catalog has no such
 *  builtin (or has not been published yet). */
export function builtinDoc(name: string): BuiltinDoc | undefined {
  return docsByName.get(name);
}

/** Characters an identifier in the maths language is made of (C2 §3.1):
 *  ASCII letters, digits and `_`. */
function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

/** The identifier `text` contains at offset `pos`, or `null` when `pos` is
 *  not inside one.
 *
 *  Exported and pure so the word-boundary rule — the part that is easy to
 *  get wrong at the ends of a line — is tested without a CodeMirror view.
 *  A `pos` at either edge of a word counts as inside it: a hover lands on a
 *  character, and the caret sits between two, so `F1` with the caret just
 *  after `welch` must still find `welch`. */
export function wordAt(text: string, pos: number): string | null {
  const range = wordRangeAt(text, pos);
  return range === null ? null : text.slice(range.from, range.to);
}

/** {@link wordAt}'s answer with its offsets, for the hover, which has to
 *  tell CodeMirror which characters the tooltip belongs to. */
export function wordRangeAt(text: string, pos: number): { from: number; to: number } | null {
  if (pos < 0 || pos > text.length) return null;

  let from = pos;
  while (from > 0 && isWordChar(text[from - 1])) from -= 1;
  let to = pos;
  while (to < text.length && isWordChar(text[to])) to += 1;

  if (from === to) return null;
  return { from, to };
}

/** The builtin named at `pos` in `text`, or `undefined`. What both the
 *  hover and `F1` ask. */
export function builtinDocAt(text: string, pos: number): BuiltinDoc | undefined {
  const word = wordAt(text, pos);
  return word === null ? undefined : builtinDoc(word);
}

/** Renders one entry as the tooltip's DOM. Plain DOM rather than a React
 *  portal: CodeMirror owns the tooltip's lifetime, and mounting a React root
 *  per hover to render three lines of text would be the heavier thing. */
function tooltipDom(doc: BuiltinDoc): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-builtin-tooltip";

  const signature = document.createElement("div");
  signature.className = "cm-builtin-tooltip-signature";
  signature.textContent = doc.signature;
  root.appendChild(signature);

  const description = document.createElement("div");
  description.className = "cm-builtin-tooltip-description";
  description.textContent = doc.description;
  root.appendChild(description);

  const unit = document.createElement("div");
  unit.className = "cm-builtin-tooltip-unit";
  unit.textContent = `Unit: ${doc.unit_rule}`;
  root.appendChild(unit);

  const hint = document.createElement("div");
  hint.className = "cm-builtin-tooltip-hint";
  hint.textContent = "F1 for the full entry";
  root.appendChild(hint);

  return root;
}

/** The CodeMirror hover extension. Only meaningful in a `math` cell, which
 *  is where the caller adds it. */
export function builtinHover(): Extension {
  return hoverTooltip((view, pos): Tooltip | null => {
    const text = view.state.doc.toString();
    const range = wordRangeAt(text, pos);
    if (range === null) return null;
    const doc = builtinDoc(text.slice(range.from, range.to));
    if (doc === undefined) return null;

    return {
      pos: range.from,
      end: range.to,
      above: true,
      create: () => ({ dom: tooltipDom(doc) }),
    };
  });
}

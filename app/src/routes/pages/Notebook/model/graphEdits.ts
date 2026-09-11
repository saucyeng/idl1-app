/**
 * Every maths-graph mutation as a pure text-in/text-out function over
 * `cells.ts`'s `replaceCellBody` — a gesture on the canvas (rename a node,
 * rewire an input, edit a call's literal parameter, add a node from a
 * channel, delete a node) becomes one new document string, ready for the
 * same debounced save flow every other cell edit already goes through
 * (`Notebook/index.tsx`'s `replaceCellBody` → `editCell` path,
 * `model/editorEcho.ts`'s guard). No React, no IPC, no `@xyflow/react` — a
 * mutation here computes no number and touches no evaluation; Rust
 * revalidates the result the next time the caller re-evaluates, exactly as
 * it does for a hand-typed edit in the Code pane.
 *
 * **Reuses `tokenizeMath`, never a second parser.** Every function below
 * that has to tell a `def_line`'s own identifier apart from a `[Name]`
 * reference, or a channel reference apart from a comment, does so through
 * `mathMode.ts`'s `tokenizeMath` tokens — the same rule `graphModel.ts` and
 * `mathExpr.ts` already follow (ruling R140).
 *
 * **Rename is the one gesture that writes both a cell body and the `graph`
 * key** (C2 §3.7.3, the deliberate exception to §2.4's "no pane writes
 * both") — {@link renameDefinition} does the `def_line`/`[OldName]`
 * rewrite and the `graph.nodes` key rename in one pass over one input
 * string, so a caller dispatching its result never has to sequence two
 * separate saves.
 */

import { readGraphLayout, writeGraphLayout } from "./graphLayout";
import { scanCells, replaceCellBody } from "./cells";
import { tokenizeMath, type MathToken } from "./mathMode";
import { generate } from "../plotForm/generate";
import { parse } from "../plotForm/parse";
import type { PlotProps } from "../plotForm/types";

/** Decodes cell `cellId`'s current body text out of `markdown`'s live scan
 *  — never a cached range, so a caller chaining several edits in sequence
 *  (as {@link renameDefinition} does, one cell at a time) always reads the
 *  body its own prior edit just produced. `null` when no such cell exists
 *  (a caller passing a stale id — nothing to edit). */
function cellBody(markdown: string, cellId: string): string | null {
  const cell = scanCells(markdown).cells.find((c) => c.id === cellId);
  if (cell === undefined) return null;
  const bytes = new TextEncoder().encode(markdown);
  return new TextDecoder().decode(bytes.subarray(cell.bodyRange[0], cell.bodyRange[1]));
}

/** True when `tokens` (one line's `tokenizeMath` result) is shaped like a
 *  C2 §3.1 `def_line`: starts with a plain identifier and contains a bare
 *  `=` operator token somewhere after it (the same shape `graphModel.ts`'s
 *  `parseDefLines` requires — a `const_line`'s first token is the
 *  `"keyword"` `const`, never `"identifier"`, so it is never mistaken for
 *  one here). */
function isDefLineShape(tokens: MathToken[]): boolean {
  return tokens[0]?.kind === "identifier" && tokens.some((t) => t.kind === "operator" && t.text === "=");
}

/** Rewrites one line: if it is a `def_line` whose own identifier equals
 *  `oldName`, that identifier becomes `newName`; every `[Name]` reference
 *  on the line equal to `oldName` becomes `[newName]` regardless. Every
 *  other character — spacing, comments, other identifiers — is untouched. */
function rewriteLine(line: string, oldName: string, newName: string): string {
  const tokens = tokenizeMath(line);
  if (tokens.length === 0) return line;

  const defLine = isDefLineShape(tokens);
  let result = "";
  let cursor = 0;

  tokens.forEach((token, i) => {
    result += line.slice(cursor, token.start);
    if (i === 0 && defLine && token.kind === "identifier" && token.text === oldName) {
      result += newName;
    } else if (token.kind === "channelRef" && token.text === `[${oldName}]`) {
      result += `[${newName}]`;
    } else {
      result += token.text;
    }
    cursor = token.end;
  });

  result += line.slice(cursor);
  return result;
}

/** Applies {@link rewriteLine} to every line of a math cell's body. */
function rewriteBody(body: string, oldName: string, newName: string): string {
  return body.split("\n").map((line) => rewriteLine(line, oldName, newName)).join("\n");
}

/**
 * Renames a math definition (C2 §3.7.3): the `def_line`'s own identifier
 * and every `[OldName]` reference, across every math cell in the document,
 * plus the `graph.nodes` position entry if one is stored for `oldName` —
 * one atomic edit, so the node's canvas position is never orphaned by a
 * rename the way it would be if only the cell-body half landed
 * (§3.7.1's orphan rule would otherwise re-lay-out a node the user never
 * asked to move).
 *
 * **Four scopes, ruling R145.** (1) `[Name]` bracket references inside
 * `math` cells are always rewritten — that grammar is closed and this
 * module already parses it. (2) A `js` cell whose code is `plotForm`-
 * generated (`plotForm/parse.ts` recognises it) is also rewritten: its
 * `channel` fields are regenerated through `plotForm/generate.ts`, safe
 * precisely because the code is generated, not hand-written. (3) A `js`
 * cell `parse.ts` calls custom code, and any prose `${…}` span, is
 * **never** textually rewritten — a find-and-replace over arbitrary JS can
 * corrupt working code, which is worse than leaving a stale name (decision
 * 45a/76: rename must stay a one-gesture operation, not a block on every
 * reference being hand-fixed first). (4) Every reference this function
 * could not update is collected and returned, never silently dropped — a
 * broken reference already renders correctly as unresolved and greys its
 * chart (`jsCellBinding.ts`'s `unresolvedChannelId`, decision 44); what
 * was missing was surfacing *that a rename caused it*, in the same gesture,
 * not the handling of the broken reference itself.
 */
export interface RenameResult {
  markdown: string;
  /** Every cell this rename could not update automatically — custom `js`
   *  code or a prose span still naming `oldName`. Empty when every
   *  reference was rewritten (or `oldName` had none). */
  unresolved: UnresolvedRenameRef[];
}

/** One cell {@link renameDefinition} could not rewrite. `kind` names why:
 *  `"custom-js"` — the cell's code isn't `plotForm`-parseable, so it was
 *  left untouched even though it still names `oldName`; `"prose"` — the
 *  cell's surrounding prose has a `${…}` span (or plain text) naming
 *  `oldName`. Detection is a best-effort word-boundary text scan (read-
 *  only — never used to drive a rewrite, so an over- or under-count here
 *  is a much smaller harm than corrupting code would be). */
export interface UnresolvedRenameRef {
  cellId: string;
  kind: "custom-js" | "prose";
}

/** A definition name is a C2 §3.1 `identifier` (`[A-Za-z_][A-Za-z0-9_]*`)
 *  — no regex metacharacters — so a plain word-boundary match needs no
 *  escaping. */
function nameOccursIn(text: string, name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(text);
}

/** Rewrites `channel` on every mark of a parsed plot cell that equals
 *  `oldName` to `newName`. Handles the time-cell (`marks[]`) shape and
 *  every single-`mark` chart kind (`plotForm/types.ts`'s `PlotProps`).
 *  Written as an explicit per-kind spread rather than one shared
 *  `{ ...props, mark: { ...props.mark, channel } }`: TypeScript cannot
 *  narrow a spread of a union member back to that member, so the shared
 *  form widens `mark` across the union and stops type-checking. */
function renameChannelInProps(props: PlotProps, oldName: string, newName: string): PlotProps {
  if (props.chart === "time") {
    return { ...props, marks: props.marks.map((m) => (m.channel === oldName ? { ...m, channel: newName } : m)) };
  }
  if (props.mark.channel !== oldName) return props;
  if (props.chart === "fft") {
    return { ...props, mark: { ...props.mark, channel: newName } };
  }
  return { ...props, mark: { ...props.mark, channel: newName } };
}

export function renameDefinition(markdown: string, oldName: string, newName: string): RenameResult {
  const doc = scanCells(markdown);
  const mathCellIds = doc.cells.filter((c) => c.kind === "math" && c.id !== null).map((c) => c.id as string);
  const jsCellIds = doc.cells.filter((c) => c.kind === "js" && c.id !== null).map((c) => c.id as string);

  let next = markdown;
  for (const cellId of mathCellIds) {
    const body = cellBody(next, cellId);
    if (body === null) continue;
    const rewritten = rewriteBody(body, oldName, newName);
    if (rewritten !== body) next = replaceCellBody(next, cellId, rewritten);
  }

  const unresolved: UnresolvedRenameRef[] = [];
  for (const cellId of jsCellIds) {
    const body = cellBody(next, cellId);
    if (body === null) continue;
    const props = parse(body);
    if (props === null) {
      if (nameOccursIn(body, oldName)) unresolved.push({ cellId, kind: "custom-js" });
      continue;
    }
    const renamedProps = renameChannelInProps(props, oldName, newName);
    if (renamedProps !== props) next = replaceCellBody(next, cellId, generate(renamedProps));
  }

  for (const cell of scanCells(next).cells) {
    const proseRanges = [cell.proseBeforeRange, cell.proseAfterRange].filter((r): r is [number, number] => r !== null);
    for (const range of proseRanges) {
      const prose = new TextDecoder().decode(new TextEncoder().encode(next).subarray(range[0], range[1]));
      if (nameOccursIn(prose, oldName) && cell.id !== null) {
        unresolved.push({ cellId: cell.id, kind: "prose" });
        break;
      }
    }
  }

  const layout = readGraphLayout(next);
  if (Object.prototype.hasOwnProperty.call(layout.nodes, oldName)) {
    const { [oldName]: position, ...rest } = layout.nodes;
    next = writeGraphLayout(next, { nodes: { ...rest, [newName]: position }, cells: layout.cells });
  }

  return { markdown: next, unresolved };
}

/**
 * Rewires one definition's input (an edge on the canvas): every `[OldRef]`
 * reference on `defName`'s own `def_line` inside cell `cellId` becomes
 * `[NewRef]`. Scoped to that one `def_line` — unlike {@link
 * renameDefinition}, this never touches any other definition's expression,
 * even one referencing the same old name (rewiring is a per-edge gesture,
 * not a document-wide rename). Returns `markdown` unchanged if `cellId`/
 * `defName` doesn't resolve to a `def_line`, or the reference isn't
 * present on it.
 */
export function rewireInput(markdown: string, cellId: string, defName: string, oldRefName: string, newRefName: string): string {
  const body = cellBody(markdown, cellId);
  if (body === null) return markdown;

  const lines = body.split("\n");
  const target = oldRefName === newRefName ? -1 : lines.findIndex((line) => {
    const tokens = tokenizeMath(line);
    return isDefLineShape(tokens) && tokens[0].text === defName;
  });
  if (target === -1) return markdown;

  const tokens = tokenizeMath(lines[target]);
  let result = "";
  let cursor = 0;
  for (const token of tokens) {
    result += lines[target].slice(cursor, token.start);
    result += token.kind === "channelRef" && token.text === `[${oldRefName}]` ? `[${newRefName}]` : token.text;
    cursor = token.end;
  }
  result += lines[target].slice(cursor);

  if (result === lines[target]) return markdown; // the reference wasn't there — no-op
  lines[target] = result;
  return replaceCellBody(markdown, cellId, lines.join("\n"));
}

/**
 * Replaces one literal argument (by 0-based position) of `defName`'s outer
 * call (`mathExpr.ts`'s `MathExprCall`) with `newArgText`, verbatim.
 * Re-serialises the whole call as `name(arg0, arg1, ...)` — a canonical,
 * `", "`-joined form, the same posture `graphLayout.ts` takes for the
 * `graph` key — rather than a byte-precise splice, so an edit here always
 * normalises the call's own inter-argument spacing (never anything outside
 * the call itself). Returns `markdown` unchanged when `defName` isn't a
 * `def_line` in `cellId`, its expression isn't a single recognised outer
 * call (`mathExpr.ts`'s "opaque expression"), or `argIndex` is out of
 * range for it.
 */
export function editLiteralArg(markdown: string, cellId: string, defName: string, argIndex: number, newArgText: string): string {
  const body = cellBody(markdown, cellId);
  if (body === null) return markdown;

  const lines = body.split("\n");
  const target = lines.findIndex((line) => {
    const tokens = tokenizeMath(line);
    return isDefLineShape(tokens) && tokens[0].text === defName;
  });
  if (target === -1) return markdown;

  const line = lines[target];
  const tokens = tokenizeMath(line);
  const eqToken = tokens.find((t) => t.kind === "operator" && t.text === "=") as MathToken;
  const trailing = tokens.find((t) => t.kind === "comment" || t.kind === "labelComment");
  const exprEnd = trailing !== undefined ? trailing.start : line.length;
  const exprText = line.slice(eqToken.end, exprEnd).trim();

  const openParen = exprText.indexOf("(");
  if (openParen === -1 || !exprText.endsWith(")")) return markdown; // not a single outer call — mathExpr.ts's own scan is the authority for callers that need to check first
  const name = exprText.slice(0, openParen);
  const argsText = exprText.slice(openParen + 1, -1);
  const args = argsText.trim().length === 0 ? [] : splitTopLevelForEdit(argsText);
  if (argIndex < 0 || argIndex >= args.length) return markdown;

  args[argIndex] = newArgText;
  const newExpr = `${name}(${args.join(", ")})`;
  const before = line.slice(0, eqToken.end); // everything through the "=" token, verbatim
  const after = trailing !== undefined ? `  ${trailing.text}` : ""; // C2 §3.1's trailing_comment needs only /[ \t]+/ before it; two spaces is this module's one canonical choice
  lines[target] = `${before} ${newExpr}${after}`;
  return replaceCellBody(markdown, cellId, lines.join("\n"));
}

/** Splits a call's argument-list text at top-level commas, respecting
 *  nested brackets and `"..."` strings — the same rule `mathExpr.ts`'s own
 *  `splitTopLevelArgs` uses, duplicated locally rather than imported since
 *  that function isn't exported (it's `mathExpr.ts`'s private detail, and
 *  this module needs the split, not the whole `scanMathExpr` result). */
function splitTopLevelForEdit(argsText: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (const ch of argsText) {
    if (inString) {
      current += ch;
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  args.push(current.trim());
  return args;
}

/**
 * Appends one new `def_line` — `${newDefName} = ${rhs}` — to the end of
 * cell `cellId`'s body. Shared by {@link addNodeFromChannel} and
 * {@link addNodeFromConstant} (R160's source-palette drag gesture): both
 * mint a node the same way, differing only in `rhs`'s own grammar (a
 * bracket reference vs a bare constant name — C2 §3.1, "channel refs are
 * always bracketed" but "a bare `g` is unambiguously the constant"), so
 * this is the one insertion path R160 asks for, not two. The caller is
 * responsible for `newDefName`'s uniqueness (this module validates
 * nothing; Rust's own `ReservedName`/shadow behaviour is what reports a
 * colliding name the next time the document evaluates — the same "Rust
 * remains the authority" posture every module in this lane takes). Returns
 * `markdown` unchanged when `cellId` doesn't resolve to a cell.
 */
function appendDefLine(markdown: string, cellId: string, newDefName: string, rhs: string): string {
  const body = cellBody(markdown, cellId);
  if (body === null) return markdown;

  const separator = body.length === 0 || body.endsWith("\n") ? "" : "\n";
  const newBody = `${body}${separator}${newDefName} = ${rhs}\n`;
  return replaceCellBody(markdown, cellId, newBody);
}

/**
 * "Add a node from a channel" (decision 45a) — a session channel, or an
 * already-declared definition (both are bracket references, C2 §3.1),
 * dragged onto the canvas becomes `newDefName = [channelName]`. See
 * {@link appendDefLine}.
 */
export function addNodeFromChannel(markdown: string, cellId: string, channelName: string, newDefName: string): string {
  return appendDefLine(markdown, cellId, newDefName, `[${channelName}]`);
}

/**
 * "Add a node from a constant" (R160) — a workbook constant dragged onto
 * the canvas becomes `newDefName = constantName`, bare (never bracketed —
 * C2 §3.1's "a bare `g` is unambiguously the constant"; wrapping it in
 * `[...]` would make it a channel lookup instead). See {@link
 * appendDefLine}.
 */
export function addNodeFromConstant(markdown: string, cellId: string, constantName: string, newDefName: string): string {
  return appendDefLine(markdown, cellId, newDefName, constantName);
}

/**
 * Removes `defName`'s whole `def_line` (including its own newline) from
 * cell `cellId`'s body. Deliberately does **not** touch the `graph.nodes`
 * entry, if one exists — §3.7.1's own rule is that an orphaned entry is
 * "preserved on write, never pruned" (a definition commented out and later
 * restored keeps its old position); deleting it here would contradict that
 * rule for no benefit, since the orphan is already ignored on read.
 * Returns `markdown` unchanged when `cellId`/`defName` doesn't resolve to
 * a `def_line`.
 */
export function deleteNode(markdown: string, cellId: string, defName: string): string {
  const body = cellBody(markdown, cellId);
  if (body === null) return markdown;

  const lines = body.split("\n");
  const target = lines.findIndex((line) => {
    const tokens = tokenizeMath(line);
    return isDefLineShape(tokens) && tokens[0].text === defName;
  });
  if (target === -1) return markdown;

  lines.splice(target, 1);
  return replaceCellBody(markdown, cellId, lines.join("\n"));
}

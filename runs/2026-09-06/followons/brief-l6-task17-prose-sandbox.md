# L6 Task 17 — implementer brief (prose HTML renders inside the sandbox)

You are the implementer for L6 Task 17, a wave-2 follow-on ruled in **R77
item 2** (`runs/2026-09-03/decisions.md`, at the end of that file). Read R77
before anything else, then **R69** and **R70** in the same file — R69 is the
security boundary this task exists to respect, R70 is the wire shape it
consumes.

The job: prose blocks stop rendering in the host DOM and start rendering
inside the sandbox iframe, from the HTML Rust now produces
(`CellOutput.prose_before_html`/`prose_after_html`), with the
`<span data-span-id="…">` placeholders filled by the sandbox from
`prose_spans`. The TypeScript `${…}` regex scanner is deleted. ONE commit,
then report.

**Spec discipline: spec-during.** This task changes shipped behaviour
described in `docs/IDL0_SPEC.md` §26.1 and §26.4 — both subsections are
updated in this same commit (details in Step 6). Do not touch any other
`§26.x` subsection and do not touch C2 or C3 (contracts; a UI lane never
edits one — wave-2 operating brief §3).

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -3
```

Required:
- Branch `main`, working tree clean apart from untracked `runs/`. If any
  tracked file is modified, **STOP and report** — another follow-on task may
  be mid-flight in this same checkout (there is only one worktree).
- `app/src/ipc/workbook.ts` exports an interface `ProseSpan { id, expr }` and
  `CellOutput` carries `prose_before_html`, `prose_after_html`, `prose_spans`.
  Confirm by reading the file. **If any is missing — STOP and report**; this
  task is entirely dependent on R70's fields being on the wire.

---

## Where

- Repo: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  the primary checkout (`git worktree list` shows exactly one).
- Work only under `app/src/routes/pages/Notebook/**`, plus the two SPEC
  subsections and `CHANGELOG.md` named below.
- **Never run any cargo command.** This is a TypeScript-only task.
- **No new npm dependency.**
- Do not push. Do not amend a commit once reported.
- **Ownership STOPs** (wave-2 operating brief §2): if you find you need to
  change `app/src/App.tsx`, `app/src/state/**`, `app/src/routes/types.ts`,
  `app/vite.config.ts`, `app/package.json`, `app/src-tauri/**`, `rust/**`, or
  either contract spec (`...-c2-workbook-v3.md`, `...-c3-ipc-surface.md`) —
  **STOP and report**, do not edit it. `app/src/ipc/*.ts` is additive type
  fixes only and this task needs none.

---

## What is true today — read these before designing anything

Read every one of these files in full. The design below is written against
them; if any of them has moved on, report the difference rather than
guessing.

1. **`Notebook/components/ProseSpan.tsx`** — the component being deleted. It
   exports `extractInlineSpans(text, spanIdPrefix)`, a plain `\$\{([^}]*)\}`
   regex over raw prose text, numbering spans `"{prefix}:{i}"`. Its own doc
   comment already names itself an interim seam to be dropped when
   `prose_spans` lands (R70). That day is today.
2. **`Notebook/index.tsx`**, the effect at roughly lines 415–460. It walks
   `state.cells`, decodes each cell's `proseBeforeRange`/`proseAfterRange`
   out of `state.markdown`, runs `extractInlineSpans` over the decoded text,
   calls `host.setCells(jsCells)` and then `host.evalInline(spanId, expr)`
   for every span found. It keeps two React state maps, `inlineResults` and
   `spanErrors`, filled from the `SandboxHost` callbacks.
3. **`Notebook/components/CellList.tsx`** — decodes the same byte ranges
   again (`proseText`) and renders `<ProseSpan …>` before and after each
   cell's own output, passing `inlineResults`/`spanErrors` down.
4. **`Notebook/host/protocol.ts`** — `HostToSandboxMessage`,
   `SandboxToHostMessage`, `isHostMessage`, `layoutMessage`,
   `evalInlineMessage`. Note `SandboxCell` is `{ id, code }` and `setCells`
   carries **only `js` cells**.
5. **`Notebook/sandbox/main.ts`** — `CellContainers` (one `position: fixed`
   `<div>` per cell id, placed by the host's `layout` message),
   `SandboxRuntime.evalInline` (compiles the expression in the same scope a
   `js` cell gets, posts `inlineResult`/`spanError`), `renderCellValue`.
6. **`Notebook/host/SandboxHost.ts`** — the outbound queue, the callbacks
   interface, and `rebuild()`.
7. **`Notebook/host/rebuildReplay.ts`** — `RebuildReplayState` and the
   `replayInitAndHostVars` / `replaySetCells` split.
8. **`Notebook/model/cells.ts`** — `ScannedCell`'s `proseBeforeRange` /
   `proseAfterRange` (UTF-8 byte offsets) and `decodeByteRange`.
9. **`app/src/ipc/workbook.ts`** — `CellOutput` and `ProseSpan` as landed.

### Where a span's *value* comes from (the brief's question, answered)

It comes from **the sandbox itself**, and it already does today. The host has
never evaluated a `${…}` expression: it posts `evalInline { spanId, expr }`
into the iframe, `SandboxRuntime.evalInline` compiles that expression with
exactly a `js` cell's `inputNames`/argument pairing and posts back
`inlineResult { spanId, text }` or `spanError { spanId, message }`. What this
task changes is only (a) **who supplies the span list** — Rust's
`prose_spans`, not the TS regex — and (b) **who splices the value into the
document** — the sandbox's own DOM, not `ProseSpan.tsx` in the host.

---

## Interfaces

### 1. A new pure module: `Notebook/model/proseBlocks.ts`

This is the tested decision the task turns on: *which prose blocks exist,
what each one shows before its first evaluation, and which spans get
evaluated.* No React, no DOM, no IPC import.

```ts
/** One span the sandbox must evaluate and splice into a placeholder. */
export interface ProseSpanRef { id: string; expr: string }

/** What one prose block shows right now. */
export type ProseBlockContent =
  | { kind: "html"; html: string; spans: ProseSpanRef[] }
  | { kind: "raw"; text: string };

/** One prose block: a cell's `prose_before` or `prose_after` (C2 §2.4). */
export interface ProseBlock {
  /** Stable id, `"{cellId}::before"` / `"{cellId}::after"` — a sandbox
   *  container key and a `layoutProse` address, never a C2 fence id and
   *  never a `data-span-id`. */
  blockId: string;
  cellId: string;
  position: "before" | "after";
  content: ProseBlockContent;
}

export function proseBlocksFor(
  cells: readonly ScannedCell[],
  markdown: string,
  outputs: ReadonlyMap<string, CellOutput>,
): ProseBlock[];

/** Every span across every `html` block, in block order then `prose_spans`
 *  order — the exact list the host issues `evalInline` for. */
export function spansToEvaluate(blocks: readonly ProseBlock[]): ProseSpanRef[];
```

Rules `proseBlocksFor` implements, and which its tests must pin:

- A cell with **no entry** in `outputs` (never evaluated, or evaluation in
  flight) yields a `raw` block for each non-null prose byte range, holding the
  decoded raw prose text verbatim. This is R77.2's stated pre-first-eval
  fallback. Note that no `${…}` scanning happens here — the raw text is
  shown with its `${…}` sources intact, exactly as `ProseSpan` does today
  before a result arrives. R70's "core's scanner is the only scanner" is
  therefore not violated: this task adds no second scanner, it deletes one.
- A cell **with** an entry in `outputs` is authoritative: `prose_before_html
  === null` means there is no before-block, **even if the TS fence scan found
  a byte range**. Rust is the only parser (SPEC §26.1); the scan is editor
  addressing only (R52 Q3).
- `spans` on a block are the subset of `output.prose_spans` whose `id`
  actually appears as a `data-span-id` in that block's own HTML. C3 §3.4
  gives one flat `prose_spans` list covering `prose_before_html` **then**
  `prose_after_html`, so the two blocks must be able to split it. Match on
  the literal substring `data-span-id="{id}"` — do **not** parse the HTML and
  do **not** invent an id-naming convention (C3's example `"{cell_id}-before:0"`
  is illustrative, not a contract you may pattern-match on).
- A cell whose scan found `id === null` yields no blocks (it can never have a
  `CellOutput`, `CellList`'s own doc comment explains why).
- Blocks come back in document order: for each cell, `before` then `after`.

### 2. Protocol additions — `Notebook/host/protocol.ts`

Additive, and deliberately **not** overloaded onto the cell messages: R66
already ruled that a span id and a fence cell id travelling in the same field
made a span failure indistinguishable from a cell failure. A block id is a
third kind of id and gets its own messages for the same reason.

Host → sandbox:
```ts
| { type: "setProse"; blocks: SandboxProseBlock[] }
| { type: "layoutProse"; blockId: string; top: number; left: number; width: number }
```
where `SandboxProseBlock` is `{ blockId: string }` plus either
`{ kind: "html"; html: string }` or `{ kind: "raw"; text: string }` — the
span list does **not** travel in this message; spans reach the sandbox
through the existing `evalInline`, unchanged.

Sandbox → host:
```ts
| { type: "proseRendered"; blockId: string; heightPx: number }
```
validated in `isHostMessage` exactly like `cellRendered`, with a
`protocol.test.ts` case for accept and for each malformed-field reject.

**Retire `inlineResult`.** With the sandbox splicing the value into its own
placeholder, no host consumer of `inlineResult` remains. Delete the message
from `SandboxToHostMessage`, its `isHostMessage` arm and that arm's tests,
`SandboxHostCallbacks.onInlineResult`, and the sandbox's `postToHost` of it.
**Keep `spanError`/`onSpanError`**: a span that throws still needs a host-side
error surface, and the sandbox additionally writes the message into the
placeholder (below) so the reader sees it in place.

### 3. Sandbox — `Notebook/sandbox/main.ts`

- A `ProseContainers` class mirroring `CellContainers` exactly (one
  `position: fixed` `<div>` per `blockId`, appended to `document.body`,
  cleared on `teardown`), placed by `layoutProse`.
- `setProse(blocks)`: for a `raw` block set `container.textContent = text`;
  for an `html` block set `container.innerHTML = html`. `innerHTML` is
  acceptable **only** here and **only** for this string: it is
  `pulldown-cmark` output produced by core with author HTML escaped (C3 §3.4,
  R70), it lands in the sandbox realm which has no `allow-same-origin` and no
  path to Tauri IPC (R69), and it is the entire mechanism R77.2 rules for.
  Every other string in this file stays `textContent`. Say so in a comment.
  After setting either, post `proseRendered { blockId, heightPx }` from the
  container's `getBoundingClientRect().height`.
- `SandboxRuntime.evalInline`: unchanged in how it compiles and what it
  posts on error, plus — before/instead of posting `inlineResult` — it writes
  the result into `document.querySelector('[data-span-id="…"]')` if that
  placeholder exists, as `textContent`. On a throw it writes the error
  message into the same placeholder (a visible, in-place failure) **and**
  still posts `spanError`. Use `CSS.escape` on the id, or a `getElementById`-
  free attribute walk — do not build a selector by naive string concatenation
  of an id you do not control.

### 4. Host — `SandboxHost` and rebuild replay

- `SandboxHost` gains `setProse(blocks)` and `sendLayoutProse(blockId, rect)`,
  queued through the existing `OutboundQueue` exactly like their cell
  equivalents.
- `RebuildReplayState` gains `lastProseBlocks: SandboxProseBlock[] | null`,
  and `replaySetCells` is joined by a `replaySetProse`. **Replay order
  becomes:** `init` → JSON host vars → channels → `setProse` → `setCells`.
  Prose containers depend on nothing but `init`; span evaluation
  (`evalInline`) is re-issued by `index.tsx`'s own effect after `setCells`, so
  placing `setProse` before `setCells` keeps the placeholders present when the
  first `inlineResult` write lands. Add `rebuildReplay.test.ts` cases pinning
  that order.

### 5. Host page — `index.tsx` and `CellList.tsx`

- `index.tsx`: replace the `extractInlineSpans` walk with
  `proseBlocksFor(state.cells, state.markdown, state.outputs)` →
  `host.setProse(...)` → `host.setCells(jsCells)` → one `host.evalInline` per
  entry of `spansToEvaluate(blocks)`. Delete the `inlineResults` state and its
  callback. Keep `spanErrors` state only if you render it somewhere visible;
  if you do not, delete it too and make `onSpanError` a `console.warn` with a
  `// TODO(idl0):` naming the missing host-side span-error surface — do not
  leave a callback that silently discards an error with no note.
  The effect's dependency array stays **data only**
  (`[state.cells, state.markdown, state.outputs]`) and must not cancel
  anything in its cleanup — wave-2 operating brief §4's tightened
  IPC-effects rule; a reviewer grades a violation Critical on sight.
- `CellList.tsx`: drop the `inlineResults`/`spanErrors` props, the
  `ProseSpan` import and the `proseText` helper. In their place render, before
  and after each cell's framed output, a **host-side placeholder `<div>` per
  prose block** that reserves the block's last `proseRendered.heightPx` and
  reports its rectangle through a `sendLayoutProse` callback — the same
  shape `JsCellFrame` already uses for a cell (read `JsCellFrame.tsx`'s layout
  effect and copy its structure: `ResizeObserver` + `resize`/`scroll`
  listeners, `requestAnimationFrame` coalescing, deps `[]`, callbacks in a
  ref). Extract it as `Notebook/components/ProseBlockFrame.tsx` rather than
  inlining it in `CellList`.
- Delete `Notebook/components/ProseSpan.tsx`.

---

## Steps

- [ ] **Step 1.** Write `Notebook/model/proseBlocks.ts` and
      `proseBlocks.test.ts` first (TDD). Test names follow CLAUDE.md §4's
      `thing — condition — result`, Arrange/Act/Assert with blank lines.
      Minimum cases: no output ⇒ raw block with the exact decoded prose text;
      output with `prose_before_html` ⇒ html block; output with
      `prose_before_html: null` and a non-null scan range ⇒ **no** block;
      `prose_spans` split across a before and an after block by which HTML
      actually contains each `data-span-id`; a span id present in
      `prose_spans` but in neither block's HTML ⇒ dropped from both;
      `cell.id === null` ⇒ no blocks; document order preserved;
      `spansToEvaluate` order.
- [ ] **Step 2.** Protocol changes + `protocol.test.ts` cases (accept/reject
      for `proseRendered`; the `inlineResult` arm and its tests removed).
- [ ] **Step 3.** `rebuildReplay.ts` + `rebuildReplay.test.ts` for the new
      five-step order.
- [ ] **Step 4.** `SandboxHost.ts`, `sandbox/main.ts` (not unit-tested —
      CLAUDE.md §4, they own a live iframe/DOM).
- [ ] **Step 5.** `index.tsx`, `CellList.tsx`, new `ProseBlockFrame.tsx`,
      delete `ProseSpan.tsx`. No unit tests for the three components
      (rendering).
- [ ] **Step 6. SPEC (spec-during).** Edit exactly two subsections of
      `docs/IDL0_SPEC.md`:
      - **§26.1**, the "Prose renders as Markdown-to-HTML plus its inline
        `${…}` splices … through `Notebook/components/ProseSpan.tsx`" bullet
        — rewrite it to say prose renders **inside the sandbox** from
        `CellOutput.prose_before_html`/`prose_after_html`, with placeholders
        filled by the sandbox, and raw prose text shown until the cell's first
        `eval_workbook` result.
      - **§26.4**, the paragraph beginning "**Interim prose-HTML seam.**" —
        replace it (the seam is gone) and update the rebuild-order sentence to
        the five-step order in Interface 4.
      Touch nothing else in the SPEC. §26.6's parity table and §26.7 stay as
      they are.
- [ ] **Step 7. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: no file paths printed (`exit=1`). Any path printed is a
      corrupted write — fix it before committing.
- [ ] **Step 8. Gate.** From `app/`:
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Notebook
      npx vitest run
      ```
      The lane filter must report a **non-zero** `passed` count and 0 failed
      (a filter matching nothing is a failed gate, CLAUDE.md §8). Then the
      whole TS suite, once, before reporting. Report both real numbers — do
      not quote a baseline from the ledger.
- [ ] **Step 9. CHANGELOG.** One bullet at the top of `### Added` under
      `## [Unreleased]`:
      ```
      - **Prose renders inside the sandbox iframe (L6 Task 17, R77.2, R69, R70).** Prose blocks are no longer built in the host DOM: `eval_workbook`'s `prose_before_html`/`prose_after_html` cross to the sandbox in a new `setProse` message and the sandbox fills each `<span data-span-id>` placeholder from its own `evalInline` result, in place. Before a cell's first evaluation its prose shows the raw text from the document (stated fallback). `components/ProseSpan.tsx` and its `${…}` regex scanner are deleted — core's `find_inline_exprs` is now the only scanner (R70); the `inlineResult` message and `onInlineResult` callback are retired with it, `spanError` stays. New pure `model/proseBlocks.ts` decides which blocks exist, what each shows before evaluation, and which spans are evaluated. Rebuild replay order is now init → JSON host vars → channels → setProse → setCells.
      ```
- [ ] **Step 10. Commit.** Explicit paths only — never `git add -A` (an
      untracked `runs/` tree is present and is not yours):
      ```bash
      git add app/src/routes/pages/Notebook CHANGELOG.md docs/IDL0_SPEC.md
      ```
      (`CHANGELOG.md` is at the repo root, not under `app/`; confirm with
      `git ls-files | grep -i changelog` before staging). Then, single-line
      message, **no AI attribution trailer of any kind**:
      ```
      app/Notebook: prose HTML renders in the sandbox; drop the TS span scanner (R77.2)
      ```

---

## Do not

- Do not call `dangerouslySetInnerHTML` anywhere in the host. Not for prose,
  not "just for the raw fallback". R69 is categorical.
- Do not keep `extractInlineSpans` "for now" behind a flag. R70 says one
  scanner; this task is the deletion.
- Do not re-scan prose text for `${…}` anywhere, in either realm.
- Do not put a function or callback prop in any effect's dependency array, and
  do not cancel in-flight work from an effect cleanup.
- Do not run cargo. Do not edit C2 or C3. Do not push. Do not amend.
- Do not invent a `data-span-id` naming convention — match the ids C3 gives
  you.

## Style / hygiene

Doc comment on every exported symbol, units on every numeric value,
`// TODO(idl0):` never a bare `// TODO`. idl-rs style is hand-matched; never
run any formatter. Typed errors only.

---

## Open questions for the lead (answer before Step 4 if you disagree with the recommendation; otherwise proceed as written)

1. **Prose is document text, not cell output — does R69's "outputs render in
   the sandbox" really reach it?** Moving prose into the iframe means the
   document's readable text is no longer selectable together with the rest of
   the page, is not in the host's accessibility tree, and is not findable by
   the host's find-in-page. R77.2 is explicit ("the sandbox sets the HTML
   inside its own document"), so **recommendation: build it as ruled** and
   record the cost here; a host-side renderer is only reachable if the lead
   decides core's escaping is a sufficient boundary on its own, which R69
   declined for cell output.
2. **Retiring `inlineResult`.** With the sandbox splicing values itself,
   nothing in the host consumes an inline result. **Recommendation: retire
   `inlineResult`/`onInlineResult`, keep `spanError`/`onSpanError`** — an
   error still needs a host surface, and R66 kept the two message types
   distinct for exactly that reason. Say so if you would rather keep both.
3. **Where a span error is shown host-side.** Nothing in the SPEC or any
   ruling names a host surface for a failed prose span now that the sandbox
   writes the message in place. **Recommendation: in place in the sandbox
   only, with `onSpanError` logging a warning and a `TODO(idl0)`** — inventing
   a banner is product design this task should not do.

---

## Report back (concise)

Commit hash and `git show --stat`. The exact gate commands and their real
result lines (lane filter passed count, whole-suite passed count, both
non-zero, 0 failed). Confirmation that `ProseSpan.tsx` is deleted and no
`${…}` regex remains anywhere under `Notebook/` (paste the output of
`grep -rn '\\$\\{' app/src/routes/pages/Notebook --include=*.ts --include=*.tsx | grep -v test`).
The exact list of `proseBlocks.test.ts` case names. Which of the three open
questions you proceeded on as recommended and which you stopped for.
Per-step done/deviated. Anything ambiguous you resolved, and how — or that
needs a lead ruling, in which case stop and report rather than guessing
(CLAUDE.md §1).

## Questions template (use verbatim if you must stop)

```
QUESTION <n>
Context: <the file/line and what you were doing>
The gap: <what no source states — cite the sources you checked by path/section>
Options: (a) … (b) … (c) …
My recommendation: <one option, one sentence why>
Cost if wrong: <what has to be undone>
Blocking: yes/no — <what you can finish without the answer>
```

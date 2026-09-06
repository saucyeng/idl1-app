# Review — L6 Task 17 (prose renders from core HTML, R78-revised)

Commit reviewed: `e63ee2b` on branch `wave2-l6-followon`, worktree
`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-followon`.

Files touched (from `git show --stat e63ee2b`):
- `CHANGELOG.md`
- `app/src/routes/pages/Notebook/components/CellList.tsx`
- `app/src/routes/pages/Notebook/components/ProseBlock.tsx` (new)
- `app/src/routes/pages/Notebook/components/ProseSpan.tsx` (deleted)
- `app/src/routes/pages/Notebook/host/protocol.ts` (doc comment only)
- `app/src/routes/pages/Notebook/index.tsx`
- `app/src/routes/pages/Notebook/model/proseBlocks.test.ts` (new)
- `app/src/routes/pages/Notebook/model/proseBlocks.ts` (new)
- `docs/IDL0_SPEC.md` (§26.1, §26.4 only)

All within the L6 lane's ownership (`Notebook/**`, SPEC §26, CHANGELOG). No
`rust/`, `app/src-tauri/**`, contracts, or shared files touched.

## Test command and result

```
cd app && npx tsc --noEmit
```
No output — clean.

```
cd app && npx vitest run src/routes/pages/Notebook
```
`Test Files 34 passed (34)`, `Tests 273 passed (273)` — matches the
implementer's reported numbers exactly. Non-zero, 0 failed. (Only the
lane-filtered gate was run per dispatch; the whole-suite command was not
rerun since the implementer already reported it and the dispatch permits
running the gate once.)

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | None found. | — |

No Critical, Major, or Minor findings.

## Verification detail

**R78 compliance (the ruling that supersedes the original brief).** The
lead's R78 (`runs/2026-09-03/decisions.md`, "2026-09-06 — R78") explicitly
reverses the brief's sandbox-rendering design: prose HTML is core output
(Rust-escaped, R70), trusted like any IPC value, so the **host** renders it
via the one permitted `dangerouslySetInnerHTML`; span values still come
from the sandbox via the existing `inlineResult`/`spanError` messages,
spliced by `textContent` only; the brief's `setProse`/`layoutProse`/
`proseRendered` protocol additions and the five-step replay reorder are
dropped. The landed commit matches this exactly:
- `dangerouslySetInnerHTML` occurs exactly once in `app/src/`
  (`Notebook/components/ProseBlock.tsx:68`), on `content.html`, which is
  `ProseBlockContent`'s `html` field populated only from
  `output.prose_before_html`/`prose_after_html` in `model/proseBlocks.ts`
  (`blockFor`). Traced the path from `evalWorkbook`'s IPC result
  (`state.outputs`, set in the reducer, not shown as touched by this
  commit) through `proseBlocksFor` to `ProseBlock`'s prop: no string
  concatenation, template, or sandbox-originated value touches it.
  `sandbox/main.ts`, `SandboxHost.ts`, `rebuildReplay.ts` are untouched by
  this commit (confirmed via `git show --stat`), consistent with R78
  dropping the sandbox-rendering design entirely — nothing needed to
  change there.
- Span fills are `textContent` only: `ProseBlock.tsx`'s effect writes
  `el.textContent = ...` for both the resolved and error cases; no
  `innerHTML`/`insertAdjacentHTML`/`outerHTML` appears anywhere under
  `Notebook/` (grepped; the one comment-only hit in `sandbox/main.ts` is
  documentation, not code, and that file is unmodified by this commit).
- `inlineResult`/`spanError` and their callbacks are unchanged (verified in
  `index.tsx`, lines ~185–212, not part of this diff) — matches R78 Q2
  ("keep `inlineResult` and `spanError`").
- Core's escaping is verified directly: `rust/core/src/workbook/v3/prose.rs`
  reclassifies `Event::Html`/`Event::InlineHtml` as `Event::Text` before
  `push_html`, which unconditionally escapes `Event::Text`, and has an
  inline test (`render_prose_html_raw_html_the_author_typed_is_escaped_not_
  passed_through`) asserting `<b>` becomes `&lt;b&gt;`. This is the
  round-trip guard R78 names as the "cost if wrong" mitigation.

**Span list and matching.** `prose_spans` from `CellOutput` is the only
span source; no `${…}` regex remains under `Notebook/` outside test files
(grepped `\${` — zero hits excluding `.test.ts` and an escaped
`` `\${${span.expr}}` `` string-template in `ProseBlock.tsx`'s own error
message, which is JS template-literal syntax, not a scanner). `spansIn`
matches on the literal substring `` `data-span-id="${span.id}"` ``, not by
parsing HTML or inventing an id scheme, matching C3 §3.4's instruction. A
span id present in `prose_spans` but absent from either block's HTML is
dropped from both — pinned by the test `"a span id present in prose_spans
but in neither block's HTML — is dropped from both"`.

**Pre-first-eval fallback.** `proseBlocksFor` returns a `raw` block with
the exact decoded text when a cell has no `outputs` entry; test 1
("proseBlocksFor — a cell with no output entry — yields a raw block with
the exact decoded prose text") asserts the exact string. Blocks are keyed
by `` `${cellId}::${position}` ``, so a block never carries a previous
cell's stale HTML — a superseded cell id simply produces a different key
and `CellList`'s `proseBlocks.get(...)` returns `undefined` for anything
not currently present.

**Effects.** The span-eval effect in `index.tsx` (lines ~419–457) has
dependency array `[state.cells, state.markdown, state.outputs]` — data
only, no function/callback in the array, callbacks (`onInlineResultRef`
etc.) live in refs as before. No cleanup function is returned, so no
in-flight `evalInline` postMessage work is cancelled. `state.outputs`
correctly joined the deps (documented rationale: a span is only knowable
once its cell has an output). The `useMemo` for `proseBlocksByBlockId`
(lines ~558–562) is keyed on `[state.cells, state.markdown, state.outputs]`
— data only. This task did not introduce any new staleness/generation
concern (the `inlineResult`/`spanError` dispatch path is unchanged from
before this task and was not itself part of this diff), so no new
stale-result test was required.

**`proseBlocks.ts` purity and totality.** No React/DOM/IPC imports;
verified by reading the file. Covers: null cell id → no blocks; null html
with a non-null scan range → no block (Rust authoritative over the TS
scan); both blocks present with spans split correctly; document order
(before then after per cell, across two cells) — all with tests using the
`thing — condition — result` naming and blank-line-separated
Arrange/Act/Assert.

**SPEC.** §26.1's prose bullet and §26.4's former "Interim prose-HTML seam"
paragraph are rewritten to state host-side rendering from core's HTML, the
`textContent`-only span fill, the pre-first-eval raw-text fallback, and
cite ledger R78 by name. No other `§26.x` subsection touched. CHANGELOG
bullet accurately describes the landed behaviour (host rendering, one
`dangerouslySetInnerHTML`, unchanged `inlineResult`/`spanError`, the new
pure module, the extra effect dependency) and does not overstate scope.

**Doc comments / errors / TODOs.** Every exported symbol in `proseBlocks.ts`
and `ProseBlock.tsx` has a doc comment. No `unwrap()`-equivalent unsafe
access on IPC data (`html === null || html === undefined` handled
explicitly; `.get()` on maps returns `undefined` handled with `??`/checks).
No bare `// TODO` introduced. Commit message is single-line, no AI
attribution trailer.

## Verdict rationale

The implementation follows R78's revision precisely: the one permitted
`dangerouslySetInnerHTML` is on core-produced, Rust-escaped HTML only, with
a clear trace from IPC output to prop and no sandbox-originated content on
that path; span values remain sandbox-sourced and are spliced by
`textContent` only; the deleted regex scanner leaves `prose_spans` as the
sole span source with correct substring matching and drop-on-mismatch
behavior; the pre-first-eval raw-text fallback is implemented and tested
exactly as stated; the span-eval effect obeys the tightened IPC-effects
rule (data-only deps, no self-cancelling cleanup); the pure `proseBlocks.ts`
module is total and its tests are well-named and correctly scoped; SPEC and
CHANGELOG are accurate and scoped to what changed; file ownership is
respected. tsc is clean and the lane-filtered gate reports a non-zero
passed count with 0 failures, matching the implementer's report.

VERDICT: CLEAN

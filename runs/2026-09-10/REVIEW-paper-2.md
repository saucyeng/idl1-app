# Review: L9 paper lane, tasks 1–2 (c3902d4, c9eb900)

Commits reviewed: `c3902d4` (paperViewActive), `c9eb900` (paperDocument).
Range: `e8b31dc..HEAD` in worktree `idl1-app-worktrees/paper` (branch `paper`).

Files touched (all new, no existing file modified):
- `app/src/routes/pages/Notebook/model/paperView.ts`
- `app/src/routes/pages/Notebook/model/paperView.test.ts`
- `app/src/routes/pages/Notebook/model/report/paperDocument.ts`
- `app/src/routes/pages/Notebook/model/report/paperDocument.test.ts`

Test command run once from `app/`: `npx tsc --noEmit && npx vitest run`.
Result: tsc clean (no output); vitest — **Test Files 181 passed (181)**,
**Tests 1826 passed (1826)**, matching the dispatch's expected counts.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/routes/pages/Notebook/model/report/paperDocument.test.ts:50-54` | The test `blockShowsOnScreen — every content kind — true` samples only 5 of the 10 non-furniture `ReportBlock` kinds (`session`, `selection`, `windowSection`, `prose`, `absence`); it omits `windowFailure`, `defTable`, `table`, `chartSlot`, `comparison` (all present in `document.ts`'s `ReportBlock` union). The test name claims "every content kind" but the assertion doesn't cover them. Functionally harmless — `PRINT_ONLY_KINDS.has()` generalizes correctly to untested kinds — but the name overclaims what's asserted (CLAUDE.md §4: tests should actually assert what they claim). | Either rename to name the actual sample (e.g. "a sample of content kinds") or extend the array to all 10 kinds. |
| Minor | `app/src/routes/pages/Notebook/model/report/paperDocument.ts` | No test constructs a `windowFailure`, `defTable`, `table`, or `comparison` block anywhere in `paperDocument.test.ts`, so `toPaperDocument`'s "keeps everything except cover/appendix" claim is exercised only against a subset of the real union. Same root cause as the row above. | Same fix as above covers this too. |

No Major or Critical findings.

## Compliance checks

- **(a) paperView.ts delegation** — confirmed. `paperViewActive` delegates to
  `editorPlacement(widthPx) === "sheet"`, which itself delegates to
  `resolveLayout` (`shell/layout.ts`); the number `600` is never restated in
  `paperView.ts`. The test file asserts the 599/600/1200 boundaries and a
  wide width sweep against `resolveLayout(...) === "narrow"` rather than
  restating literal booleans, matching the existing `editorPlacement.test.ts`
  pattern almost exactly.
- **(b) paperDocument.ts scope** — confirmed. `PRINT_ONLY_KINDS` is exactly
  `{"cover", "appendix"}`; `toPaperDocument` filters via `Array.filter`,
  preserving order and returning a new object (`document.ts` is untouched
  per `git diff --stat`, and a dedicated test — `leaves the input
  untouched` — asserts non-mutation of the input's `blocks` array). Every
  `absence` block is kept, tested explicitly with two absence blocks.
- **(c) Test style** — Arrange/Act/Assert with blank lines is followed in
  both new test files (Act on its own line, blank line, then `expect(...)`).
  Names follow `thing — condition — result` (with em-dashes) throughout.
  `vitest.config.ts` confirms `environment: "node"`, `include:
  ["src/**/*.test.ts"]` — no jsdom, `.ts` only; both new files match.
- **(d) Doc comments** — every exported symbol (`paperViewActive`,
  `blockShowsOnScreen`, `toPaperDocument`) has a doc comment with an
  `@param`; module-level doc comments explain the R184 rationale
  (delegation vs. restating 600; why `cover`/`appendix` and no others).
- **(e) R184 / plan agreement** — matches R184 item 2 (cover/appendix
  dropped, sibling filter, `document.ts` untouched) and the task-1
  description (delegates, boundary test against `resolveLayout`). No
  deviations found: no stray files, no edits outside the two named
  modules, commit messages are single-line with no AI attribution.

## Verdict rationale

Both tasks are narrowly scoped, delegate exactly as the plan and R184
require, keep print/paper sharing one builder, and the gate reproduces the
expected 181/1826 passing counts. The only issues are two Minor findings
about test-name overclaiming ("every content kind" tests a 5-of-10 sample) —
harmless to correctness since the implementation is a generic set-membership
check, but worth a rename or extension for honesty of the test's own claim.
Nothing rises to Important or Critical.

VERDICT: CLEAN

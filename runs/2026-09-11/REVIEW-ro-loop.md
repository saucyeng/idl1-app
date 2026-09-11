# Review: ro-loop (ResizeObserver loop fix)

Commits: 9480203 (GlobalErrorBanner swallow benign RO notices), e9e55bb
(NotebookToolbar defer setWidth to rAF; audit note on ChartCell/JsCellFrame/
TimelineStrip). Branch `ro-loop` vs `main`, worktree
`idl1-app-worktrees/ro-loop`.

Files touched (diff main..HEAD --stat):
- app/src/routes/pages/Notebook/components/NotebookToolbar.tsx
- app/src/shell/GlobalErrorBanner.tsx
- app/src/shell/isBenignWindowError.ts (new)
- app/src/shell/isBenignWindowError.test.ts (new)

No files outside these four touched; no unrelated diffs.

## Test command and result

- `npx vitest run src/shell/isBenignWindowError.test.ts` (run from `app/`):
  Test Files 1 passed (1), Tests 5 passed (5).
- `npx tsc --noEmit` (run from `app/`): clean, no output/errors.

(Implementer's reported 204 files/2070 tests for the full suite was not
re-run per the compute rules; the above is the targeted gate for the new
file plus a full type-check.)

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | app/src/routes/pages/Notebook/components/TimelineStrip.tsx:62-67 | Commit e9e55bb's message claims TimelineStrip was "audited ... as clean," but it still calls `setWidthPx` synchronously inside its `ResizeObserver` callback -- the same pattern the toolbar fix just removed. The diff contains no change or comment there, so the "clean" claim rests on unstated reasoning (the width only feeds internal handle-position math, not the observed element's own size, so it plausibly doesn't retrigger the observer) rather than anything verifiable in the commit. Since fix 1 (GlobalErrorBanner swallowing the benign message) already makes this moot for the reported bug, this is not a functional defect, just an unsubstantiated audit claim in the commit message. | Either add a one-line comment in TimelineStrip explaining why its synchronous setState is safe (mirroring the toolbar's new doc comment), or drop the "audited as clean" claim from the commit message and let fix 1 carry the correctness burden. |
| Minor | app/src/routes/pages/Notebook/components/NotebookToolbar.tsx (useRowWidth) | No new/updated test for the rAF-deferral behavior of `useRowWidth`. | Acceptable as-is: the hook's own doc comment (pre-existing) notes jsdom has no `ResizeObserver`, so the behavior isn't testable in the current vitest/jsdom environment without a polyfill; not a real gap given the test infra. |

No Critical or Important findings.

## Verification notes

- `isBenignWindowError` matches the two exact Chromium/Firefox/WebKit
  strings ("ResizeObserver loop completed with undelivered
  notifications." / "ResizeObserver loop limit exceeded") via `===`, not
  substring/regex -- confirmed by the "substring of a longer message" test
  case, which correctly asserts `false`. `GlobalErrorBanner` passes
  `event.message` (the raw `ErrorEvent.message`) into the predicate, which
  matches the predicate's documented contract.
- Doc comment on `isBenignWindowError` explains why these two messages
  are benign (spec-level: observer keeps delivering later notifications)
  and why the banner can't distinguish them another way -- meets CLAUDE.md
  section 5's doc-comment-on-every-public-symbol bar.
- Test names follow `thing -- condition -- result` with AAA blank-line
  separation (verified all 5 cases in isBenignWindowError.test.ts).
- `useRowWidth`'s new doc-comment addendum explains the mechanism (same-
  frame setState inside the RO callback tripping the browser notice) and
  cites the existing pattern in ChartCell.tsx/JsCellFrame.tsx -- checked
  both files; both already defer via `requestAnimationFrame` with a
  `pending` flag, confirming the claimed precedent is real.
- `frame` is coalesced via `cancelAnimationFrame(frame)` before each new
  `requestAnimationFrame` call, and cancelled again on effect cleanup --
  no leaked RAF callback and no risk of a stale width winning a race.
  Initial `frame = 0`; `cancelAnimationFrame(0)` is a documented no-op, not
  a bug.
- Commit messages are single-line, no AI attribution trailers, per
  CLAUDE.md section 7.
- No `unwrap()`/Rust code involved; this is a TS-only lane, no cargo run.

## Verdict rationale

Both fixes are narrowly scoped, correctly address the stated bug (fix 1 at
the point the banner classifies the message; fix 2 at the point the
toolbar was still contributing to the loop), are well-documented, come
with a passing, correctly-named test for the new pure predicate, and
type-check cleanly. The only issue found is a Minor, non-blocking
discrepancy between the commit message's "audited ... as clean" claim for
TimelineStrip and what the diff actually shows/verifies -- worth a one-line
follow-up comment but not a functional defect given fix 1 already
neutralizes the browser-level symptom.

VERDICT: CLEAN

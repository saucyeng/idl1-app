# Review: Task 6 — React routing skeleton and app-level state

Plan: `docs/superpowers/plans/2026-09-03-idl1-wave1-l5-tauri-scaffold.md`, Task 6
(lines 1099–1288). Worktree: `idl1-app-worktrees/wave1-l5-tauri`, branch
`wave1-l5-tauri`, commit `817f774` on top of `c53924b`.

## Test commands and results (reproduced)

- `cd app && npm test` → **PASS**. `Test Files 10 passed (10)`, `Tests 23 passed (23)`.
- `cd app && npx tsc --noEmit` → **PASS**, exit 0, no output.
- `git diff c53924b 817f774 -- app/package.json app/package-lock.json` → **empty** (no new npm dependency, confirming the plan's "no router/state library" claim).
- `git diff --stat c53924b 817f774 -- rust/` → **empty**; `git submodule status` shows the `rust` submodule pointer unchanged across the commit. Confirms the implementer's claim that this task is app-repo-only.
- `git log -1 --format=%B 817f774` → single-line subject, no body, no `Co-Authored-By` or other AI attribution trailer.

## Findings

| Severity | File:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/state/AppState.tsx:4-12` | Doc comment on `AppState` says the store holds "the two values every tab may need (engine version …; resolved `<data>` path, for Settings)" but the `AppState` interface only has `route` and `engineVersion` — there is no `<data>`-path field anywhere in the type or reducer. (This mismatch is inherited verbatim from the plan's own Step 3 listing, not introduced by the implementer, but it ships into the tree as-is and violates CLAUDE.md §5's doc-comment-matches-code expectation.) | Either add the `<data>`-path field to `AppState` (if L5/L7 actually need it soon) or trim the doc comment to describe only the fields that exist, deferring the `<data>`-path mention to whichever task adds it. |
| Minor | `app/src/App.tsx` (whole file) vs. plan Step 4 note (lines 1269-1272) | The plan's own prose says dropping the M0 smoke-tile display from the default screen means "the binary IPC proof moves to a dedicated debug affordance kept only through Task 15" (e.g. a line on `SettingsPage` calling `_m0_smoke`'s `fetchSmokeTile`). The implementer dropped the smoke-tile call entirely — `_m0_smoke.ts` is now dead code (unused by any page) rather than being wired into a debug affordance. Not a spec violation (Task 15 deletes `_m0_smoke.ts` regardless, and the plan's parenthetical reads as illustrative, not mandatory), but it is a silent deviation from what the plan states will happen, worth a one-line note in the PR/commit body so a reviewer isn't left to notice the binary-IPC smoke proof is currently unreachable from the UI. | Either wire the debug affordance as the plan suggests, or note in the commit message that the smoke-tile UI proof was intentionally dropped rather than relocated, pending Task 15. |

No Critical or Important findings. Spec compliance, test quality, and CLAUDE.md
compliance are otherwise clean:

- Four route tabs (`notebook`/`device`/`data`/`settings`) match the design
  doc's L6 (Notebook) / L7 (Device, Data, Settings) tab split (design doc
  lines 191, 195).
- `appStateReducer` is pure and unit-tested without rendering, consistent with
  CLAUDE.md §4 ("UI rendering is not unit-tested"); test names follow the
  `thing — condition — result` convention (`"NAVIGATE action — changes only
  the route field"`, `"SET_ENGINE_VERSION action — sets the field, leaves
  route unchanged"`); Arrange/Act/Assert with blank lines, as required.
  `AppState.test.ts` is beside its module per CLAUDE.md §4's TS test-location
  rule.
- Every exported symbol (`AppState`, `AppAction`, `appStateReducer`,
  `AppStateProvider`, `useAppState`, `RouteId`, `ROUTES`, all four page
  components, `Shell`, `App`) carries a doc comment.
- No numeric-value fields in this task's scope requiring units.
- No `TODO`s added.
- `TASKS.md`'s L5 line is correctly left unticked (only Task 15 ticks it per
  the plan); `CHANGELOG.md` gained exactly the bullet the plan's Step 6
  specifies, in the right place (`[Unreleased] / ### Added`).
- Diff matches the plan's Step 1/3/4 code blocks essentially verbatim (routes/
  types.ts, the four page placeholders, AppState.tsx, AppState.test.ts,
  App.tsx), with doc comments added beyond the plan's minimum in a couple of
  spots (a net positive, not a deviation).
- Confirmed no `rust/` changes and no submodule pointer bump in this commit —
  matches the implementer's claim that Task 6 is app-repo-only.

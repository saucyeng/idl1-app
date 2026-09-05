# L7a Task 8 — maintenance actions, lane wrap-up — review

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`. Commit under review: `5196e34` ("app: Data tab
maintenance actions; L7a lane complete pending write commands"). HEAD at
review time is `5196e34`; working tree clean, nothing out of scope. Also
covers the lane-level merge gate (all 8 commits, `main...HEAD`).

## Test command and result

Ran once, from `app/`, per the dispatch:

```
npx tsc --noEmit && npx vitest run --coverage
```

`tsc --noEmit` printed nothing. `vitest`:

```
 Test Files  25 passed (25)
      Tests  143 passed (143)
```

Matches the implementer's reported 143 passed. Coverage for every pure
`Data/*.ts` module (lines): `facets.ts` 93.54, `filters.ts` 100,
`format.ts` 100, `importQueue.ts` 93.33, `ipcStubs.ts` 87.5,
`maintenance.ts` 96.29, `sessionDetail.ts` 100, `sort.ts` 96.42,
`trackRow.ts` 100 — every one ≥ 87%, matching the implementer's report.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/routes/pages/Data/index.tsx:145,154,161` | `window.confirm()` is used for the three destructive maintenance actions with no `// TODO(idl0):` marking it for replacement once the shell has an in-app modal (no such component exists yet). Lead's own stated inclination on this dispatch grades this Minor if the TODO is missing — it is missing. | Add `// TODO(idl0): replace window.confirm with an in-app modal once the shell provides one` at each call site (or once, above the three handlers). |
| Minor | `app/src/routes/pages/Data/maintenance.test.ts:155` | Test titled `"runListQuarantine with zero entries — singular noun..."` actually calls `runListQuarantine(() => Promise.resolve([{}]))` — one entry, not zero — and asserts `"1 item awaiting review."`. The name promises coverage of the zero/empty case and the code doesn't test it; it duplicates the singular-vs-plural intent of the "two entries" test above it with the wrong count in the title. | Rename to reflect what it tests (`"...with one entry — singular noun..."`), or add a real zero-entries case (`Promise.resolve([])` → `"0 items awaiting review."`) if that's the behaviour meant to be pinned. |
| — | — | No Critical or Important findings. | — |

## Checks performed (all pass)

- **Ownership boundary (this commit).** `git show --stat 5196e34` touches
  only `CHANGELOG.md`, `TASKS.md`, `Data/index.tsx`, `Data/ipcStubs.ts`,
  `Data/ipcStubs.test.ts`, `Data/maintenance.ts`, `Data/maintenance.test.ts`
  — exactly the brief's file list, nothing under `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **Lane-level ownership (`git diff main...HEAD --stat`, 41 files).** Every
  path is under `app/src/routes/pages/Data/**`, the `DataPage.tsx` shim,
  `CHANGELOG.md`, `TASKS.md`, or `docs/IDL0_SPEC.md`. No exception.
- **`DataPage.tsx` shim** (`git diff main...HEAD`) re-exports `./Data`
  and states retiring it is a lead shell task — matches R53 Q1(b); this
  lane does not delete its own shim or touch `App.tsx`.
- **Stubs never invent an `IpcError` kind.** `deleteSession`,
  `listQuarantine`, `resolveQuarantine` (`ipcStubs.ts`) each throw
  `NotImplementedError` only, matching Task 6's convention byte-for-byte;
  `maintenance.ts`'s `describeMaintenanceError` special-cases
  `NotImplementedError` before falling back to `describeIpcError`, so a
  stub rejection never gets misrouted through the real `IpcError` kind
  vocabulary.
- **No new command.** `app/src/ipc/catalog.ts`/`import.ts` untouched by
  this commit; `rebuildCatalog` (imported into `index.tsx`) is an
  already-landed C3 §3.2 wrapper, not a new one.
- **`runForgetSession` reusing `deleteSession(deleteBlob:false)`.** Matches
  idl0's two distinct destructive actions (`runs_provider.dart`) faithfully:
  the summary text differs ("kept" vs. "deleted") and both are proven by
  their own tests.
- **`maintenance.ts` is a pure driver, no IPC-effects issue.**
  `startMaintenanceAction(state, name, run, dispatch)` takes an injected
  async function and only ever dispatches `START` then exactly one of
  `SUCCEEDED`/`FAILED`; it never reads or reacts to React's render cycle
  itself. The four toolbar click handlers in `index.tsx` (`handleRebuildCatalog`,
  `handleDeleteSession`, `handleForgetSession`, `handleReviewQuarantine`)
  are plain event handlers invoked on click, not `useEffect`s — there is no
  dependency array that can cancel an in-flight call, and each closure reads
  `maintenanceState` fresh from the render that produced the handler, so the
  "second START while running" guard is correctly evaluated against current
  state. Traced independently of `maintenance.test.ts`'s own
  dismiss/second-start/rejection/never-crash tests, all of which pass and
  assert the specific behaviour named.
- **Need 5 dropped, not stubbed.** No `rescanTrackVisits`/`rescan_track_visits`
  anywhere in `Data/` (grep, zero hits); `TASKS.md`'s line states this
  explicitly.
- **`TASKS.md`'s L7a tick accuracy.** Cross-checked every row of the plan's
  Parity gaps table (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`,
  lines 519–535) against the new `TASKS.md` text: all 14 dispositions
  (deferred-to-wave-3 track editor + conflict dialog, replaced-by-`rebuild_catalog`,
  dropped-permanently Drive sync, dropped-for-wave-2 has-gates/has-GPS, deferred
  map preview, deferred FIT export, deferred-to-L6 compare/lap-ignore/selection,
  moved-to-L7b device sync screen, dropped venue card, CSS-only mobile) are
  present and correctly characterised, plus IPC needs 1–4 named and need 5
  named as dropped. States "landed on `wave2-l7a-data`", not merged — accurate.
- **R53 Q3 (`selection` slice).** Row click dispatches
  `appDispatch({ type: "SET_SELECTED_SESSION", sessionId })` into
  `AppState.selection` (`index.tsx:223,227`) — this lane writes it, as
  specified; not invented locally (imported from `state/AppState`).
- **R54 (Track/has-gates/has-GPS).** Grepped the whole `Data/` tree —
  every "track" hit is either a doc comment explaining the R54 absence, the
  pre-existing `"tracks"` *view* concept (Task 6, unrelated), or
  `TrackSummary`/`compareTracks` (Task 2, unrelated to filtering). No
  `trackIds`, no `requireGates`/`requireGps` field anywhere.
- **Best-lap sort hidden.** `SESSION_FIELDS` (`sort.ts`) omits `bestLap`;
  only `TRACK_FIELDS` includes it; the comparator's `bestLap` arm is intact
  for when the field lands (matches review-task2/3's already-CLEANed
  ruling, unchanged by this commit).
- **All prior review findings closed.** Task 5's self-cancelling effect and
  stale-index bugs (review-task5, NEEDS_FIXES) were fixed and re-reviewed
  CLEAN in review-task5b (`3a9e844`); Tasks 1, 2, 3, 4, 6, 7 all CLEAN with
  only Minor, non-blocking notes (locale date format, one multi-action test,
  an unused export, one untested branch, a Parity-gaps table gap, a redundant
  non-concurrent fetch) — none of which recur or compound in Task 8's diff.
- **Whole-suite gate.** Reproduced 143 passed / 25 files / `tsc` silent,
  matching the implementer's report; no lane outside `Data/**` fails in this
  worktree.
- **CLAUDE.md §4 tests.** All 5 new `maintenance.test.ts` behaviours (plus
  the extra `summarizeRebuildReport`/`runDeleteSession`/`runForgetSession`/
  `runListQuarantine`/`runResolveQuarantine`/reducer-guard tests) are A/A/A
  with blank-line separation and named `thing — condition — result`
  (em dash), except the one Minor naming mismatch above. No rendering
  tests — `index.tsx`'s new toolbar markup has no RTL/jsdom assertion;
  behaviour is tested entirely through the pure `maintenance.ts` module.
- **CLAUDE.md §5.** Doc comment on every exported symbol in `maintenance.ts`;
  errors routed through `.kind`/`instanceof NotImplementedError`, never
  string-matched on `.message`; no bare numeric value without a unit note
  (`duration_ms` documented via `RebuildReport`'s own doc comment,
  `seconds`/`plural`'s counts are plain counts, not measurements needing a
  unit).
- **Repo hygiene.** Single-line commit message, no AI attribution trailer;
  `git add` used the explicit path list from the brief (confirmed against
  `--stat`); working tree clean; no `cargo`/`npm run tauri`/`npm install`
  anywhere in the diff or the reported commands; no `package.json`/lockfile
  change across the whole lane.
- **CHANGELOG accuracy.** The new bullet's description of the reducer
  behaviour, the two stub-mapping decisions (`runForgetSession` reuse, no
  fourth stub), and the "lane complete pending write commands" framing all
  match the diff exactly; no overclaiming of full parity.
- **Spec discipline.** Task 8 declares "no spec change needed"; `git show
  --stat 5196e34` confirms `docs/IDL0_SPEC.md` is untouched by this commit.

## Lane merge opinion

Across all 8 tasks, the lane does exactly what its brief and the R53–R55
rulings specify: a faithful port of idl0's Data-tab semantics onto C3's
seven landed catalog commands plus the L5-pending import commands, four
write-command IPC needs built against non-inventive `NotImplementedError`
stubs (need 5 correctly dropped outright), every R53/R54 ruling (dropped
Track/has-GPS/has-gates facets, the `selection` slice write, honest
empty/`"—"` lap rendering, sector-count-only lap detail) followed with no
silent drift, and the one real defect found mid-lane (Task 5's self-
cancelling import effect) was fixed at the root cause and re-reviewed
CLEAN before this task started. `git diff main...HEAD --stat` shows zero
ownership violations across all 41 changed files, the whole-suite gate
reproduces the implementer's reported 143 passed with `tsc` silent and
every pure module's coverage matching, and `TASKS.md`'s tick names every
outstanding item — IPC needs and all 14 Parity-gaps-table rows — rather
than claiming parity it doesn't have. The two findings (a missing
`TODO(idl0)` on the `window.confirm()` calls, and one test's title not
matching its body) are cosmetic and do not touch layering, contract, or
correctness; nothing here would change a maintainer's decision to merge
this lane to `main`.

## Verdict rationale

Task 8's own diff is correct, faithfully scoped, and its two tests-file/
UI-text nits are the kind of Minor the standing brief anticipates rather
than defects a maintainer would send back; the lane as a whole closes every
review finding raised against it (Task 5's Critical is fixed and confirmed),
respects every ownership and contract boundary across all 8 commits, and the
reproduced gate matches what was reported at both the task and lane level.

VERDICT: CLEAN

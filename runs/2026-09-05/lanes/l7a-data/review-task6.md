# L7a Task 6 review — tracks view (list_tracks/get_track)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`. Commit under review: `5923019` ("app: Data tab
tracks view over list_tracks/get_track"), on top of merge `e98d622` ("Merge
branch 'main' into wave2-l7a-data") on top of Task 5's commit `05f2686`.
Scope, per `git show --stat 5923019`: `CHANGELOG.md`,
`app/src/routes/pages/Data/{TrackDetailPane.tsx,TrackResults.tsx,
index.tsx,ipcStubs.ts,ipcStubs.test.ts,sessionRow.ts,trackRow.ts,
trackRow.test.ts}` — all within lane ownership, no touch to `rust/`,
`app/src-tauri/`, or any lead-owned file.

**Out of scope, noted per the dispatch's own warning:** at review time the
worktree had *uncommitted* changes on top of `5923019` — a Task 5 import-
driver follow-up (`ImportPanel.tsx`, `importQueue.ts`, new
`importDriver.ts`/`importDriver.test.ts`, `FilePicker.test.ts`,
`CHANGELOG.md`), landing mid-review as the dispatch anticipated. These are
not part of commit `5923019` and are not reviewed here. One artifact of
this: a `vitest` run taken while that follow-up was only partially applied
showed 6 failures confined entirely to `importQueue.test.ts`; a run taken
moments later (follow-up fully applied) showed all green but `tsc --noEmit`
then failed with 3 `TS2349` errors inside the *new*, uncommitted
`importDriver.test.ts`. Both are artifacts of the in-flight Task 5 follow-up
and not attributable to `5923019`. To get a result attributable to the
commit under review alone, a disposable `git worktree add --detach
<throwaway> 5923019` was tried, but the throwaway checkout has no
`node_modules` and this lane may not `npm install`, so it could not run the
gate; it was removed with `git worktree remove --force` immediately after
(no other action taken there).

## Test command and result

Run from the shared worktree at a moment when the Task 5 follow-up was not
active for `importQueue.test.ts` (before it landed cleanly):

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Data
```

```
 Test Files  1 failed | 10 passed (11)
      Tests  6 failed | 67 passed (73)
```
All 6 failures are in `importQueue.test.ts` (Task 5's domain); every
Task 6 test (`trackRow.test.ts`'s 5, `ipcStubs.test.ts`'s 2) passed.
`tsc --noEmit` printed nothing at that point. Coverage for this task's new
module:
```
  trackRow.ts      |     100 |    83.33 |     100 |     100 | 50
```
This matches the implementer's reported 73 total / trackRow.ts 100% lines.
(A branch on `trackRow.ts:50`, the loop's `continue` when `track ===
undefined`, is what the 83.33% branch column reflects; it is exercised by
the "stale track_id skipped" test — see Checks below.)

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `trackRow.ts:24-44` | `resolveDisplayVenue` has no call site in this commit or anywhere on the branch — grepped the whole `Data/` tree. The task's own Interfaces section asked for exactly this function and `sessionRow.ts:12-20`'s comment and the CHANGELOG both disclose the gap honestly ("not yet wired to a call site... no wave-2 caller has both a `SessionSummary` and its `TrackVisitSummary[]` at once"), so this is not a silent deviation. | Acceptable as shipped — the brief asked for the function ahead of its caller and the gap is disclosed twice (code comment + CHANGELOG). If a future task also has no call site by wave-2's Data-tab merge gate, add a `// TODO(idl0):` pointing at the deferred session-detail venue line so it doesn't read as orphaned by then. |

No Critical or Important findings.

## Checks performed (all pass)

- **Ownership boundary**: `git show --stat 5923019` touches only
  `CHANGELOG.md` and `app/src/routes/pages/Data/**`; no new file under
  `app/src/ipc/*.ts`, `rust/`, `app/src-tauri/`, or any lead-owned file
  (`App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`).
- **No new IPC command**: `TrackResults.tsx`/`TrackDetailPane.tsx` import
  `listTracks`/`getTrack`/`TrackSummary`/`TrackDetail` from the existing,
  unmodified `app/src/ipc/catalog.ts` — no new `invoke` call, no edit to
  that file.
- **Stub convention (`ipcStubs.ts`)**: byte-for-byte compared against the
  landed `wave2-l7b-device` worktree's `Device/ipcStubs.ts` — same
  `NotImplementedError extends Error { command: string }` shape, same
  constructor signature and message template
  `` `${command} is not implemented yet` ``, same doc-comment framing
  ("Placeholder for a ... command C3 does not have yet ... never with an
  `IpcError`-shaped value"). `saveTrack`/`deleteTrack` each reject with
  `NotImplementedError` naming `"save_track"`/`"delete_track"` exactly
  (IPC-NEEDS need 2); confirmed against `ipcStubs.test.ts`'s two tests,
  which assert both `.rejects.toThrow(NotImplementedError)` and
  `.rejects.toMatchObject({ command: ... })`. No `IpcError` kind fabricated
  anywhere in this file.
- **`TrackDetailPane` unfixed-field discipline (C3 §6 item 10)**: reads
  `state.detail.lap_timing` only through `lapTimingPresenceCount` (`0`/`1`
  on null-check, never destructured or unioned on), and
  `neutral_zones`/`sector_gates`/`reference_polyline` only via `.length`.
  No property access reaches inside any of the four `unknown`/`unknown[]`
  fields. Matches the brief's "renders only counts (or presence)" line
  exactly.
- **`get_track` fetch timing — traced the effect per the standing brief's
  IPC-effects rule**: `TrackDetailPane`'s `useEffect` depends only on
  `[trackId]`; it fires once per mount/trackId-change, sets `loading`, calls
  `getTrack(trackId)`, and gates both the success and failure branches on a
  `cancelled` flag closed over by the cleanup — the cleanup only runs when
  `trackId` itself changes or the pane unmounts, never because of unrelated
  state (e.g. list re-sort or re-fetch), so it cannot self-cancel an
  in-flight fetch the way the L7a import-queue/L6 sandbox Criticals did.
  `trackId` only changes via `TrackResults`' `onClick`/`onKeyDown`
  (Enter/Space with `preventDefault`) handler calling `setSelectedTrackId`
  — never a hover handler, never fired from inside the effect itself. This
  is the same shape as Task 4's already-CLEAN-reviewed `get_session` effect
  in `index.tsx` (inline `cancelled`-flag guard, no separate driver module)
  — consistent treatment across both settle-bound single-fetch effects in
  this lane; the "pure injected-driver module" rule in the standing brief
  targets effects with actual decision logic (which item to start, what to
  dispatch per outcome, re-priming), which neither of these single-fetch
  effects has.
- **`saveTrack`/`deleteTrack` have no UI call site** in this commit — no
  button, form or affordance implies saving/deleting works; the track
  editor is explicitly out of scope per the Parity gaps table and the
  brief's "Do not build any part of the track editor" line.
- **`resolveDisplayVenue` correctness against idl0's §12.3 skip-on-resolve
  rule**: read all four tests plus the implementation — session's own
  non-empty `venue_name` short-circuits and ignores visits entirely; empty
  session venue walks `visits` in order, skipping (via `continue`, not
  `break` or `return`) any visit whose `track_id` misses in `tracksById`,
  and returns the first resolvable non-empty track venue; returns `""` when
  nothing resolves. The "stale visit before a valid one" test
  (`trackRow.test.ts:100-106`) specifically exercises the skip-not-stop
  behaviour idl0 requires. Redid the loop logic by hand against the test
  data — correct.
- **No fabricated session↔track join (R54)**: `TrackResults`/
  `TrackDetailPane` never read a `SessionSummary` or join against sessions
  data; `index.tsx`'s Tracks view is fed only by `list_tracks`, independent
  of the Sessions view's data and facets. `FilterRail`/`ActiveChips` are
  gated to `filters.view === "sessions"` only — no Tracks-view facet
  exists, matching R53 Data Q2/R54.
- **Sessions/Tracks toggle reuses shared logic without duplication**:
  `index.tsx`'s toggle buttons dispatch the pre-existing `SET_VIEW` action
  (unchanged in this commit — action/reducer already existed from a prior
  task); `sortFieldsForView(filters.view)` (already present in `sort.ts`,
  untouched this commit) drives the sort-field `<select>` for both views;
  `TrackResults` calls the pre-existing `compareTracks` from `sort.ts`
  rather than writing a new comparator. No sort or view logic is
  reimplemented locally.
- **Doc comments and units**: every exported symbol in `trackRow.ts`,
  `ipcStubs.ts`, `TrackResults.tsx`, `TrackDetailPane.tsx` has a doc
  comment; `created_at_ms`/`updated_at_ms` carry the `_ms` unit convention
  already established by `catalog.ts`; no new bare numeric field introduced
  without a unit note.
- **Tests are A/A/A and named `thing — condition — result`**: all 7 new
  tests (`trackRow.test.ts` × 5, `ipcStubs.test.ts` × 2) match the literal
  naming convention with em dashes; each has a clear
  arrange/act/assert shape with blank-line separation; none renders a
  React component (no RTL, no jsdom assertions) — `TrackResults.tsx`/
  `TrackDetailPane.tsx` themselves are untested directly, consistent with
  the standing brief's "no rendering tests" rule and with how Task 4's
  `DetailPane.tsx`/`LapTable.tsx` were reviewed CLEAN without direct tests.
- **Repo hygiene**: single-line commit message, no AI attribution trailer;
  `git show` confirms only the 8 named files plus `CHANGELOG.md` were
  staged (no `git add -A` residue); nothing under `rust/`/`app/src-tauri/`
  touched; NUL-byte check step is trivially satisfiable (plain TS/TSX text)
  and not independently re-verified here (no reason to suspect binary
  content given the diff review above).
- **Spec discipline**: task declares "no spec change needed"; `git show
  --stat` confirms `docs/IDL0_SPEC.md` is untouched by this commit — matches.

## Verdict rationale

The commit does exactly what the brief asked and nothing more: a flat
sortable tracks table over `list_tracks`, a settle-bound detail pane over
`get_track` that renders the four contract-unfixed fields as counts/presence
only, and two `NotImplementedError` stubs matching the Device lane's
established convention byte-for-byte. The venue-fallback logic correctly
implements idl0's skip-on-resolve rule and is tested for the case that
matters (a stale visit before a valid one); its lack of a call site is
disclosed in both the code and the CHANGELOG rather than hidden, and the
brief asked for the function ahead of any caller existing. The IPC-driving
effect in `TrackDetailPane` was traced dependency-by-dispatch and cannot
self-cancel, matching the pattern the standing brief's own new rule was
written to catch, and is consistent with the already-approved Task 4
pattern. No ownership violation, no fabricated `IpcError`, no invented
session↔track join, no rendering test. The only note is a Minor,
non-blocking one about the unused export.

VERDICT: CLEAN

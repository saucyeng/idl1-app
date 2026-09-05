# L7a Task 6 — implementer brief (tracks view, and this lane's ipcStubs.ts)

You are the implementer for L7a Task 6 — the tracks view over `list_tracks`/
`get_track`, and the file that creates this lane's `NotImplementedError`
convention (`Data/ipcStubs.ts`), used from here through Task 8. No spec
change needed. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. **HEAD must be Task 5's commit** ("app: Data tab
  import queue over import_file/list_importers"). Verify with `git log -1`
  and `git status`; if not there, STOP and report.
- Work ONLY there. Never touch `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md` (the
  IPC-needs list and the stub convention); `runs/2026-09-05/lanes/l7/IPC-NEEDS.md`
  need 2 (`save_track`/`delete_track`, why it's stub-only, and the C3 §6
  item 10 blocker on `TrackDetail`'s nested `unknown[]`/`unknown` fields);
  the plan's Task 6 (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`,
  lines 388–427); `app/src/ipc/catalog.ts`'s `TrackSummary`, `TrackDetail`
  (read the file — `lap_timing`, `neutral_zones`, `sector_gates`,
  `reference_polyline` are typed `unknown`/`unknown[]`, not yet fixed by any
  contract); the read-only reference
  `...\idl0-app\app\lib\ui\tabs\data\track_results.dart` and the venue-
  fallback rule in `session_provider.dart`'s `displayVenueName` /
  `SPEC §12.3`'s skip-on-resolve behaviour for a visit whose track no longer
  resolves.

## The task (plan Task 6, Steps 1–4, unchanged)

**Files:**
- Create: `Data/trackRow.ts`, `Data/trackRow.test.ts`, `Data/TrackResults.tsx`,
  `Data/TrackDetailPane.tsx`, `Data/ipcStubs.ts` (new file, this task)
- Modify: `Data/index.tsx` (view toggle), `Data/sessionRow.ts` (track-derived
  venue fallback)

**Interfaces:**
- `trackRow.ts`: `toTrackRow(summary: TrackSummary): TrackRow` (formats
  `created_at_ms`/`updated_at_ms`, carries `venue_name`) and
  `resolveDisplayVenue(session: SessionSummary, visits: TrackVisitSummary[],
  tracksById: Map<string, TrackSummary>): string` — idl0's
  `SessionRow.displayVenueName` rule: the session's own `venue_name` if
  non-empty; else the first non-empty `venue_name` among the session's
  visited tracks, in visit order, **skipping a visit whose `track_id` does
  not resolve in `tracksById`** rather than stopping there (idl0 §12.3);
  else `""`.
- `ipcStubs.ts`: `NotImplementedError extends Error { command: string }` —
  copy the shape and doc comment style from `wave2-l7b-device`'s
  `Device/ipcStubs.ts` (already landed, read it for the exact convention:
  constructor takes the command name, message is `"${command} is not
  implemented yet"`) — plus this task's first two stubs, `saveTrack(track:
  Record<string, unknown>): Promise<never>` and `deleteTrack(trackId:
  string): Promise<never>`, each rejecting with `NotImplementedError`
  naming `"save_track"` / `"delete_track"` (IPC-NEEDS need 2). **A stub is
  never an `IpcError`** — C3 §2's kind vocabulary is additive-only.

- [ ] **Step 1: Write the failing tests**

  - `toTrackRow — a TrackSummary — formats created/updated timestamps and carries venue`
  - `resolveDisplayVenue — session has its own venue_name — uses it, ignoring tracks`
  - `resolveDisplayVenue — session venue empty, first visited track has a venue — uses the track's`
  - `resolveDisplayVenue — a visit whose track_id no longer resolves — skipped, next visit considered (idl0's §12.3 skip-on-resolve rule)`
  - `resolveDisplayVenue — nothing resolves — returns "", which renders as "(none)"`
  - `ipcStubs — saveTrack — rejects with NotImplementedError naming "save_track"`
  - `ipcStubs — deleteTrack — rejects with NotImplementedError naming "delete_track"`

- [ ] **Step 2: Implement**

  `TrackResults.tsx` is a flat sortable table over `listTracks()` (reuse
  Task 2's `sort.ts` `compareTracks`). `TrackDetailPane.tsx` opens one track
  via `getTrack(id)` on explicit open (settle-bound, C3 §4) and renders its
  scalar fields plus **a count** of neutral zones / sector gates — it does
  **not** parse `lap_timing`, `neutral_zones`, `sector_gates` or
  `reference_polyline` beyond `.length`: their shapes are unfixed
  (`unknown`/`unknown[]`), and rendering more would be a guess. The track
  **editor** is not built here (Parity gaps table, "Deferred to wave 3").

- [ ] **Step 3: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 7 new tests passed, 0 failed.

- [ ] **Step 4: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Data/trackRow.ts app/src/routes/pages/Data/trackRow.test.ts app/src/routes/pages/Data/TrackResults.tsx app/src/routes/pages/Data/TrackDetailPane.tsx app/src/routes/pages/Data/ipcStubs.ts app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/sessionRow.ts
  ```
  Every count must print `0`.

- [ ] **Step 5: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Data/trackRow.ts app/src/routes/pages/Data/trackRow.test.ts app/src/routes/pages/Data/TrackResults.tsx app/src/routes/pages/Data/TrackDetailPane.tsx app/src/routes/pages/Data/ipcStubs.ts app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/sessionRow.ts CHANGELOG.md
  git commit -m "app: Data tab tracks view over list_tracks/get_track"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not parse `TrackDetail`'s `lap_timing`/`neutral_zones`/`sector_gates`/
  `reference_polyline` beyond a count.
- Do not build any part of the track editor (create/edit/delete UI) — stubs
  only, per the Parity gaps table.
- Do not fabricate an `IpcError` kind for the stubs.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

No spec change needed (plan's own declaration for Task 6).

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; confirmation `TrackDetailPane` renders only counts
for the four unfixed-shape fields; confirmation `ipcStubs.ts` matches the
`Device/ipcStubs.ts` convention (class shape, message format); confirmation
the NUL-byte check printed `0` for every file; anything ambiguous you
resolved (say how) or that needs a lead ruling.

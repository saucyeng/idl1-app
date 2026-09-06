# Review: shell-data-writes (post-L8x Data-tab write commands)

Commits reviewed: `d4dddf6` (ipc types + `saveTrack`/`deleteTrack`, new
`ipc/maintenance.ts`), `0c4d95d` (stub deletion; `TrackDetailPane` real
gates/sectors/NZ + Name/Venue edit + Delete + "Rescan N sessions"),
`b56bde0` (`MaintenancePanel`: quarantine Restore/Discard, Verify/Repair),
`493c4e1` (docs).

Files touched: `app/src/ipc/{catalog,maintenance}.ts` (+tests),
`app/src/routes/pages/Data/{TrackDetailPane,MaintenancePanel,TrackResults,index}.tsx`,
`app/src/routes/pages/Data/{maintenance,trackDetailFormat,trackDraft,quarantinePanel}.ts`
(+tests), `Data/ipcStubs.{ts,test.ts}` deleted, `CHANGELOG.md`, `TASKS.md`.
Confirmed no files outside `Data/`, `ipc/`, and docs changed (`App.tsx`,
`state/`, `package.json`, `rust/`, `app/src-tauri/**` all untouched).

## Gate

```
cd app && npx tsc --noEmit && npx vitest run
```
Result: tsc clean; **98 files / 915 tests passed**, 0 failed. Matches the
implementer's reported count.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `Data/maintenance.ts:198` (`runRescanSessions`) | `Promise.all(sessionIds.map(rescanTracks))` rejects on the first failing session, discarding any already-succeeded `RescanReport`s and reporting the whole "Rescan N sessions" batch as `FAILED` with only the one error's text — a rider who rescans 5 stale sessions and has 1 fail (e.g. a session directory deleted meanwhile) sees "failed" even though 4 rescans actually wrote their `session.json`. No test in `maintenance.test.ts` exercises this interleaving (only the all-succeed case is tested). | Use `Promise.allSettled` and aggregate: report count succeeded/failed, keep `summarizeRescanSessionsReport` over the fulfilled subset, and surface failed ids/errors in the summary or a new state field. |
| Minor | `Data/errors.ts` (pre-existing, unmodified by this task) | `KNOWN_KINDS.invalid_argument` returns the generic "That request was invalid." and never reads `IpcError.detail` — so `save_track`'s validation failures (which the Rust side attaches as `{ field: ... }`, `rust/tauri/src/commands/catalog.rs:709`) reach `TrackDetailPane`'s error banner as an undifferentiated "Couldn't save: That request was invalid." with no field named. This file is outside this task's diff, so it's a pre-existing repo-wide gap, not a regression, but the brief specifically asked whether `invalid_argument` detail is surfaced — it is not, anywhere in the Data lane. | Out of this task's scope to fix (shared `errors.ts`); flag for a follow-up task or lead decision on whether `detail.field` should be woven into `DescribedError.text`. |

No Critical findings. Every IPC name checked byte-for-byte against
`rust/tauri/src/commands/{catalog,maintenance}.rs` — `saveTrack`/`track`,
`deleteTrack`/`trackId`, `resolveQuarantine`/`entryId`+`action`,
`verifyDataDir`/`repair`, `TrackDraft.track_id` — all match, confirmed by
`ipc/catalog.test.ts` and `ipc/maintenance.test.ts` asserting the exact
`invoke()` call shape.

## Other checks (all clean)

- No stub or `NotImplementedError` remains under `Data/**` (grepped); the
  four `ipcStubs.ts` placeholders and the "Review quarantine" button are
  gone.
- `toTrackSaveDraft` (`Data/trackDraft.ts`) sends the full `TrackDraft`
  including `track_id` and every untouched geometry field verbatim — never
  a partial patch — confirmed by `trackDraft.test.ts`.
- `formatLapTiming`/`formatSectorGates`/`formatNeutralZones`/
  `formatReferencePolylineSummary` (`Data/trackDetailFormat.ts`) are pure
  (no IPC, no engine math), render decimal degrees with an explicit `°`
  unit, and are unit-tested for the empty-list/null cases.
- Delete confirms via `window.confirm` then calls `deleteTrack` and moves
  `TrackDetailPane` to a `"deleted"` state (closes the editable view,
  offers "Rescan N sessions" if any); `MaintenancePanel`'s Discard also
  confirms first, Restore does not (matches the doc comment's stated
  rationale).
- `startMaintenanceAction`'s one-in-flight rule is intact and tested
  (`maintenance.test.ts`: a second `START` while `"running"` dispatches
  nothing, reducer-level guard also tested independently) — this covers
  "second click mid-run" for every maintenance action including
  `rescan_sessions`.
- `verify_data_dir` is wired as two explicit actions: `Verify` always
  available (`repair: false`), a separate `Repair` button appears only
  after a Verify report exists and calls `repair: true`; repair refreshes
  the quarantine list afterward.
- Every IPC-driving effect (`TrackDetailPane`, `TrackResults`,
  `MaintenancePanel`, `Data/index.tsx`'s session-detail effect) keys its
  dependency array on data only (`trackId`, a `useCallback`-stabilised
  loader with empty deps), never cancels an in-flight promise (only a
  local `cancelled` flag guards a stale `setState`), and calls no `invoke`
  during render.
- No new dependency added; `package.json`/lockfile untouched.
- `CHANGELOG.md`/`TASKS.md` bullets accurately describe the landed scope,
  including the wave-3 track-geometry-editor parity gap (ruling R54).

## Verdict rationale

The implementation is spec-compliant, the wire-shape/naming is exact, the
effects rule is respected everywhere, and the gate passes with the reported
count. The one Important finding (silent loss of per-session outcome on a
partial `rescan_sessions` failure) is a real but narrow gap — it only
misreports an already-successful side effect's outcome to the user, it
does not corrupt data or silently swap in wrong behaviour — so it does not
rise to Critical, but it should be fixed before this ships as "done."

VERDICT: NEEDS_FIXES

# Review — Task 5, L5 Tauri scaffold plan (`app/src/ipc/` remaining C3 §1 modules)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`
Branch: `wave1-l5-tauri`, commit under review: `c53924b` ("app: complete
`app/src/ipc/` module scaffolding per C3 §1"), on top of `c125576`.

## Commands run and results

```
cd .../idl1-app-worktrees/wave1-l5-tauri/app && npm test
→ Test Files  9 passed (9)  |  Tests  21 passed (21)   (matches claim)

cd .../idl1-app-worktrees/wave1-l5-tauri/app && npx tsc --noEmit
→ exit 0, no output   (matches claim)
```

## Priority finding assessed: `Progress`/`IpcError` duplication vs. C3 §1 "defined once, referenced everywhere below"

Read C3 §1 (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md:46`) in
context: the `Progress` interface is written out once, in §1, and every
consuming subsection in §3 (§3.3 `import_file`, §3.8 `download_file`, §3.9
`sync_now`) just says "Streams `Progress`" without re-listing its fields
(confirmed at lines 412–420, 629–630, 668–670 — none of them repeat the
`interface Progress { … }` block). That is what "defined once, referenced
everywhere below" is describing: the *contract document's* presentation, so a
reader of §3 isn't shown the same three-field interface four times. It is not
phrased as an implementation directive ("one TypeScript module," "a single
source of truth," etc.), and C3 §1's own "Frontend wrapper modules" paragraph
only mandates that `@tauri-apps/api/core` imports stay confined to
`app/src/ipc/*.ts` — it says nothing about how types are shared across those
files.

As executed: `IpcError` is defined exactly once (`workbook.ts:9`, with an
explicit comment explaining why it lives there and isn't shared — it is the
only place a command's success payload nests an `IpcError`). `Progress` is
defined three times, verbatim in shape (`import.ts:5`, `device.ts:4`,
`sync.ts:8`), each with a doc comment and a phase-specific note. This is a
maintainability/drift-risk tradeoff, not a spec violation — the implementer's
reading of C3 §1 is defensible and I did not find contract language it
contradicts.

**Verdict on this specific finding: not a spec violation.** Noted below as a
Minor, optional-fix item for the record, not counted against approval.

## Findings

| Severity | Location | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/ipc/import.ts:5`, `device.ts:4`, `sync.ts:8` | `Progress` interface is hand-copied verbatim into 3 modules; a future field change (e.g. adding a unit to `done`) requires updating all 3 in lockstep with no compiler help if one is missed. Defensible under C3 §1 as read (see above) — not a contract violation. | Optional: extract to `app/src/ipc/types.ts` (or similar) exporting `Progress`, re-exported/imported by the 3 modules; not required by this task or C3. |

No other findings — spec compliance, tests, and CLAUDE.md standing orders all
checked out (details below).

## Verification detail

**Spec compliance (C3 §3 command groups vs. code):**
- §3.1 Engine — already existed (M0 Task 5); `engine.ts` now houses
  `fetchEngineVersion`, matching the plan's Step 1 code verbatim.
- §3.2 Catalog — `catalog.ts` transcribes all 10 interfaces
  (`SessionSummary`, `LapDetail`, `TrackVisitSummary`, `ChannelSummary`,
  `SessionDetail`, `LapChannelStat`, `LapSummary`, `RebuildReport`,
  `WorkbookSummary`, `TrackSummary`, `TrackDetail`) field-for-field against
  §3.2, and all 7 commands (`listSessions`, `getSession`, `listLaps`,
  `rebuildCatalog`, `listWorkbooks`, `listTracks`, `getTrack`).
- §3.3 Import — `import.ts`: `ImporterInfo`, `importFile` (with `Channel<Progress>`), `listImporters` — matches.
- §3.4 Workbook — `workbook.ts`: `WorkbookHandle`, `CellOutput`, `SaveResult`, `WorkbookEvent`, `openWorkbook`, `evalWorkbook`, `saveWorkbook`, `watchWorkbook` — matches.
- §3.5/§3.6 Tiles/Rasters — already landed in Task 4 (`tiles.ts`/`rasters.ts`), untouched here except removing the temporary `fetchEngineVersion` re-export (see below).
- §3.7 Cursor — `cursor.ts`: `CursorReadout`, `cursorReadout(sessionId, channels, tUs)` — matches.
- §3.8 Device — `device.ts`: `DeviceDiscovered`, `ConnectionInfo`, `DeviceFile`, `DownloadResult`, `bleScan`, `bleConnect`, `listDeviceFiles`, `downloadFile`, `pushConfig` — matches.
- §3.9 Sync — `sync.ts`: `SyncStatus`, `PeerStatus`, `SyncResult`, `syncStatus`, `syncNow`, `pairPeer` — matches, correctly scaffolded ahead of L11 (wave 2).

**`App.tsx` / Task 4 cleanup:** `App.tsx` now imports `fetchEngineVersion`
from `./ipc/engine` (was `./ipc/tiles`, with a `TODO(idl0): move to
./ipc/engine.ts in Task 5` marker left by Task 4 at `tiles.ts` — that marker
and the temporary re-export are both removed in this commit, exactly
discharging the debt Task 4 declared). `fetchSmokeTile` import from
`./ipc/_m0_smoke` is untouched, correctly out of this task's scope.

**`sync.ts` no-test note:** confirmed present, plan and code agree — Task 5
Step 4 states "No test required for `sync.ts` this wave (nothing calls it; a
test would only assert the same trivial `invoke()` pass-through already
covered by the pattern proven in Steps 1–3) — noted, not silently skipped,"
and L11 (LAN sync) is wave 2 per the module's own header comment
(`sync.ts:3-5`). `ls app/src/ipc/` confirms `sync.ts` has no matching
`sync.test.ts`, consistent with that note.

**Tests:** all new/changed test files (`engine.test.ts`, `catalog.test.ts`,
`import.test.ts`, `workbook.test.ts`, `device.test.ts`, `cursor.test.ts`)
follow Arrange/Act/Assert with blank lines, mock `@tauri-apps/api/core`
consistently, and use the `thing — condition — result` naming pattern the
plan itself specifies verbatim (e.g. `"list_sessions resolves — calls invoke
with no arguments and returns the value unchanged"`). `catalog.test.ts`
covers all 7 commands (plan required only one minimum) — good, not
excessive.

**CLAUDE.md standing orders:**
- Layer line: all new files under `app/src/ipc/`, TS only, no Rust changes — correct for this task (Group A, no cross-lane dependency).
- Units on numbers: every numeric field has a unit/type comment (`u32`, `i64`, `f64`, "bytes", etc.), matching C3 §3's own comments.
- Doc comments: every exported interface/function has one.
- Typed exceptions: N/A for this task (no throwing logic beyond `tiles.ts`/`rasters.ts`, already reviewed in Task 4); `IpcError` (nested in `CellOutput.error`) is typed per C3 §2.
- No AI attribution trailer: confirmed (`git show c53924b --format=%B -s` — single-line subject, no trailer).
- Lanes touch only their own crate/directory: confirmed — only `app/src/ipc/*`, `app/src/App.tsx`, `CHANGELOG.md` touched; no `rust/` changes in this commit.
- `CHANGELOG.md` bullet present under `[Unreleased]`, matches the plan's Step 6 text verbatim.
- `TASKS.md`'s `L5 Tauri scaffold hardening` line correctly left unchecked (only Task 15 ticks it).

## Verdict

CLEAN — Task 5 was executed as specified: all seven remaining C3 §1 modules
are typed field-for-field against C3 §3, tests and `tsc` are green as
claimed, the Task 4 `fetchEngineVersion` TODO is discharged cleanly, and the
`Progress`/`IpcError` duplication the implementer flagged is a defensible
reading of C3 §1's "defined once" language, not a contract violation — logged
above as a Minor, non-blocking note only.

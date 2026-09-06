# Review — post-L2b shell task (branch `shell-laps`)

Commits: `13851bd` (ipc/catalog typed LapDetail.sectors/neutral_zone_visits, rescanTracks),
`3c60214` (Data tab lap tables + Rescan tracks button), `20be440` (Notebook FFT cell
passes selected main lap to fetch_fft), `ff5bd9e` (CHANGELOG/TASKS).

Files touched: `app/src/ipc/catalog.ts` (+test), `app/src/ipc/rasters.ts`,
`app/src/ipc/workbook.ts`, `app/src/routes/pages/Data/{LapTable.tsx,index.tsx,
lapDetailFormat.ts(+test),maintenance.ts(+test),sessionDetail.ts(+test)}`,
`app/src/routes/pages/Notebook/{index.tsx,model/fftDriver.ts,model/fftRequest.ts(+test),
model/jsCellBinding.ts(+test),model/openEvalDriver.ts}`, `CHANGELOG.md`, `TASKS.md`.

Test command: `cd app && npx tsc --noEmit && npx vitest run`
Result: `tsc --noEmit` clean; vitest — Test Files 95 passed (95), Tests 885 passed (885).
Matches the implementer's reported counts.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No findings. | — |

## Verdict rationale

Every TS field/argument name checked against the Rust serde source is byte-exact:
`LapSector`/`LapNeutralZoneVisit` (`rust/tauri/src/commands/catalog.rs:101-134`) mirror
`app/src/ipc/catalog.ts`'s interfaces field for field; `RescanReport`'s `flags_cleared`
string set matches core's `reindex_laps` (`rust/core/src/store/lap_index.rs:204-299`,
values `"main_lap_number"`/`"reference_lap_number"`/`"starred_lap_number"`/
`"ignored_lap_numbers"`) exactly, including the doc comment's claim that
`overlay_lap_key` is never in the list. `fetchFft`'s argument order/names
(`sessionId, channel, lap, params, averaging`) match `fetch_fft`'s Rust signature
(`rust/tauri/src/commands/rasters.rs:527-540`) exactly.

`lapDetailFormat.ts`'s `formatSectors`/`formatNeutralZoneVisits` correctly return
`"—"` only for `null` (session-side lap absent) and `""` for a real empty array,
per R53 Data Q4/the ruling closing C3 §6 item 11 — verified against
`sessionDetail.ts`'s `toDetailView`, which sets `sectors`/`neutralZoneVisits` to
`null` only when `sessionLap === null`, otherwise passes the array through
unchanged (including empty). Duration arithmetic checked by hand: `12.345s` /
`20.000s, 10.010s` / `5.0s` all match `(end_ms - start_ms)/1000` on the test
fixtures. Tests are Arrange/Act/Assert and named `thing — condition — result`.

The "Rescan tracks" button runs through `startMaintenanceAction`/`runRescanTracks`,
the same pure-driver pattern as the existing Rebuild-catalog action — not a new
effect, so the IPC-effects tightening rule doesn't apply to it; on success it calls
the existing `loadDetail` (refactored out of the selection-settle effect into a
`useCallback`) to refresh the pane from canonical truth, and surfaces
`warnings`/`flags_cleared` in the summary line. The refactor of the selection-settle
effect (inline `useEffect` body → `loadDetail` callback + effect) keeps the same
`cancelled`-flag staleness guard it had before this task and depends only on
`[selectedSessionId, loadDetail]`, where `loadDetail` is a `useCallback` with an
empty dependency array (i.e. referentially stable) — not an injected/prop callback,
so it does not trip the "function prop in a dependency array beside a cancelling
cleanup" Critical-on-sight rule; no new self-cancellation risk was introduced.

The Notebook's `mainLap` derivation (`lapContext?.mainLap ?? null`) is a plain
primitive folded into the IPC effect's dependency array alongside `sessionId` etc.,
satisfying the "data only" tightening rule; `bindingIdentity` and `fftRequestEquals`
were both extended to fold in `request.lap` so a main-lap change alone triggers
exactly one refetch, and both have direct tests for the new dimension (different
lap ⇒ different identity/not-equal; same lap including both-null ⇒ same
identity/equal) as required by the tightening rule's testing bullet. No shared/
lead-owned files (`App.tsx`, `App.css`, `main.tsx`, `state/AppState.tsx`,
`routes/types.ts`, `package.json`, `vite.config.ts`, `app/src-tauri/**`, `rust/`)
were touched by this task's diff. CHANGELOG and TASKS entries accurately describe
what landed, with no overstatement (e.g. correctly note `fetchRaster`/
`fetchRasterMeta` are unaffected and out of scope). No new dependency was added.
Comment corrections in `openEvalDriver.ts`/`ipc/workbook.ts`/`ipc/rasters.ts`
replacing stale "always null"/"every non-null lapContext rejects" wording are
accurate given L2b's landed lap-window resolution.

VERDICT: CLEAN

# L7a Task 2 review — formatting and sort model

**Worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`.
**Commit under review:** `da1e8eb` ("app: Data tab formatting and sort model"),
child of `55629e6` (a pre-task `main`-into-lane merge, R19 pattern — out of
scope, no lane files touched). HEAD at review time is `6fbc653`, a later
merge-from-`main` commit made after `da1e8eb` — also out of scope for this
review.
**In scope:** the 7-file diff in `da1e8eb` only — `CHANGELOG.md`,
`Data/format.ts`, `Data/format.test.ts`, `Data/index.tsx`,
`Data/sessionRow.ts`, `Data/sort.ts`, `Data/sort.test.ts`.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Data
```
`tsc --noEmit` printed nothing (silent, as required). `vitest`:
```
 Test Files  4 passed (4)
      Tests  30 passed (30)
```
Coverage report: `format.ts` 100% lines (94.11% stmts, 83.33% branch),
`sort.ts` 96.42% lines (88.09% stmts, 88.23% branch). This matches the
implementer's reported 30 passed / format.ts 100% lines / sort.ts 96% lines
exactly.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/routes/pages/Data/index.tsx:29` (label), `sort.ts:16` (`SESSION_FIELDS`), `sort.ts:104-105` | The Sessions-view sort `<select>` offers "Best lap" today, but `SessionSummary` (C3 §3.2) has no best-lap field at all — not even nullable. `compareSessions`'s `bestLap` arm always ties (`noBestLap` returns `null` unconditionally) and, unlike the nullable `duration`/`lapCount` fields, the tie-break ignores `ascending` entirely (`compareNullableNumber(null, null, ascending)` is always `0`, and the tie-break itself always sorts ascending by `session_id`) — so selecting "Best lap" and toggling the direction arrow together produce zero visible change, with nothing in the UI telling the user why. `lapCount` is a different, accepted case (R53 Q4: a real nullable catalog column, just unpopulated pending lap indexing) but `bestLap` for sessions is structurally absent from the contract, not merely unpopulated. Recommend hiding "Best lap" from the Sessions-view select until a source field exists, or labelling it (e.g. "Best lap (not yet available)"). |

No Critical or Important findings.

## Checks performed (all pass)

- **Ownership boundary:** all 7 changed paths are under `Data/**` or
  `CHANGELOG.md`; nothing under `rust/`, `app/src-tauri/`, `App.tsx`,
  `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`. `app/src/ipc/*.ts` was not touched at
  all (not even an additive type fix) — consistent with the task needing
  none.
- **No new IPC command / no fabricated `IpcError` kind.** `sort.ts` only
  imports the `SessionSummary`/`TrackSummary` *types* from `../../../ipc/catalog`;
  no `invoke` call added anywhere in the diff.
- **No new npm dependency** — `package.json`/lockfile untouched;
  `Intl.DateTimeFormat` is the only formatting API used, as directed.
- **`format.ts` semantics, checked against the brief's test list and by
  redoing the arithmetic by hand:**
  - `formatLapTimeMs(83_456)` → `83456 / 60000 = 1` min, remainder `23456`,
    `23456 / 1000 = 23` s, `23456 % 1000 = 456` ms → `"1:23.456"`. Matches.
  - `formatLapTimeMs(5_012)` → `0` min, `5` s, `12` ms → `"0:05.012"` (leading
    `0:` present). Matches the test and the brief.
  - Negative/`NaN` → `"—"`, never a nonsense clock. Matches.
  - `formatDurationMs(3_723_000)` → `3723` s → `1` h, `2` min, `3` s →
    `"1:02:03"`. Matches.
  - `formatDurationMs(62_000)` → `0` h → `"1:02"`, hour field omitted, not
    zero-padded. Matches.
  - `formatBytes(1_048_576)` → `1_048_576 / 1024 = 1024`, `/1024` again `= 1`
    → `"1.0 MB"` with the correct binary (1024-based) unit ladder.
  - `formatDateMs`/`formatTimeMs` correctly leave the C1 §3.1 "0 = unknown"
    decision to the caller (documented in both doc comments) —
    `sessionRow.ts` still gates on `hasTimestamp` before calling either, so
    the convention is not silently dropped when the formatter moved.
  - `localIsoDate`'s TZ test pins a fixed-offset zone (`Etc/GMT+12`, no DST)
    via `vi.stubEnv`/`vi.unstubAllEnvs`, so it does not depend on the
    machine's local timezone; reran locally and it is deterministic (the
    30-passed count includes it).
- **`sort.ts` ported field-for-field from idl0.** Compared directly against
  `idl0-app/app/lib/providers/data_filters_provider.dart`'s `DataSortField`
  enum, `label`, `defaultAscending`, and `sortFieldsForView`: field order for
  both views, the labels used in `FIELD_LABELS`, and the
  ascending-by-default set (`bestLap`, `name`; everything else descending)
  match exactly.
- **Comparators are pure, total, and never throw on the other view's field.**
  `compareSessions` handles `lastRidden`/`name` (Tracks-only) via a plain
  `session_id` string compare; `compareTracks` handles `date`/`duration`
  (Sessions-only) via a plain `track_id` string compare — both exhaustive
  `switch`es over the full `SortField` union, verified by reading the code
  and by the two "falls back to tie-break" tests in `sort.test.ts`.
- **Stability on ties** — `compareByNumber`/`compareByString` both fall back
  to a `localeCompare` on the row's own id when the primary key ties; the
  dedicated stability test (`compareSessions — two sessions with equal keys`)
  confirms both directions agree on tie order.
- **Nulls sort last in both directions** — `compareNullableNumber` returns
  `1`/`-1` for a lone `null` regardless of `ascending`; the
  `duration_ms`-with-one-null test confirms both ascending and descending
  runs put the `null` row last.
- **R53 Q4 documented inline, not just accepted on faith.** Both
  `noBestLap`/`noTrackValue` and the `compareSessions`/`compareTracks` doc
  comments explicitly state "no wave-1 import path populates the catalog's
  lap tables (R53 Data Q4)" at the point where the null fallback happens —
  this is the ruling being carried into the code, not silently assumed.
- **`sessionRow.ts` lost its inline formatters as required.** The local
  `dateFormatter`/`timeFormatter`/`localIsoDate`/`formatDuration` are gone;
  `toSessionRow` now calls `formatDateMs`/`formatTimeMs`/`formatDurationMs`/
  `localIsoDate` from `format.ts`. Confirmed the output is unchanged
  (`duration_ms === null ? "—" : formatDurationMs(...)` — same guard, same
  fallback string, same arithmetic as the removed `formatDuration`).
  Task 1's own `sessionRow.test.ts` (unchanged by this commit) is part of the
  30-passed total, so this is a proven non-regression, not just an eyeballed
  one.
- **Test count and scope.** 19 new tests (7 in `format.test.ts`, 12 in
  `sort.test.ts`) against the brief's 13 — the 6 extra
  (`compareSessions — sorting by lapCount`, `compareSessions — sorting by
  bestLap`, `compareSessions — a Tracks-only field (name)`,
  `compareTracks — sorting by name`, `compareTracks — lastRidden, bestLap,
  lapCount`, `compareTracks — a Sessions-only field`) are all exercising
  `compareTracks`/other-view fallback behaviour the brief's interface list
  named but its test list under-specified — in-scope coverage of code the
  task itself required, not scope creep into a later task's territory.
- **A/A/A with blank lines, `thing — condition — result` naming (em dash).**
  Every test in both files follows the pattern; single-behavior tests that
  need no setup (e.g. the negative/NaN case) still separate act from assert
  with a blank line.
- **No rendering tests.** `index.tsx`'s new toolbar markup (`role="toolbar"`,
  the `<select>`, the direction button) has no accompanying React Testing
  Library / jsdom test — sort behaviour is tested entirely through the pure
  `sort.ts` module, as directed.
- **Doc comments and units.** Every exported symbol in `format.ts`/`sort.ts`
  has a doc comment; `format.ts`'s comments state the unit (`ms`, bytes) on
  every numeric parameter.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer;
  `git add` used explicit paths (matches the brief's listed `git add`
  invocation, confirmed via `git show --stat`); CHANGELOG bullet text is
  byte-for-byte the brief's specified bullet; no `cargo` anywhere in the
  diff or in the reproduced commands.
- **Spec discipline.** Task declares "no spec change needed"; `docs/IDL0_SPEC.md`
  is untouched in this commit, consistent with that declaration.

## Verdict rationale

The port is faithful to idl0's `data_filters_provider.dart` field-for-field
(order, labels, default directions), the comparators are pure/total/stable
and correctly implement "nulls sort last in both directions," R53 Q4's
null-because-unindexed state is documented at the exact point it's asserted
rather than glossed over, `sessionRow.ts`'s behaviour is proven unchanged by
Task 1's own still-passing tests, and the reported gate reproduces exactly
(30 passed, `tsc` silent, matching coverage numbers). The one finding —
`bestLap` in the Sessions view being a structurally-unbacked, direction-blind
no-op with no UI affordance saying so — is real but cosmetic: it doesn't
break any test, doesn't touch a layer boundary, and is the exact "Minor"
scenario the dispatch anticipated rather than a defect the implementer
introduced through carelessness. That's a small, mechanical follow-up (hide
or label the option), not grounds to send the task back.

VERDICT: CLEAN

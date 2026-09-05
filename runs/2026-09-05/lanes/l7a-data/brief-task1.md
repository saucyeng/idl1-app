# L7a Task 1 — implementer brief (`DataPage.tsx` → `Data/`, session list)

You are the implementer for L7a Task 1 of the idl1 rewrite — the first task
of the Data-tab lane. TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. **You create it** — it does not exist yet:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l7a-data "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data"
  git submodule update --init -- rust
  cd app && npm ci
  ```
  HEAD on `main`, status clean. Verify first; if `main` is not clean or the
  worktree already exists in an unexpected state, stop and report.
- Work ONLY there. Do NOT touch the shared checkout
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the files
  named below, and do NOT touch any other worktree. Do NOT edit `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`. Do NOT push.
- **No cargo, ever** — not `cargo check`, not `npm run tauri`. A hook denies
  any cargo invocation whose cwd is under `idl1-app-worktrees/wave2-*`; you
  never need it — this task calls only already-landed C3 §3.2 commands.
- Read first: `CLAUDE.md`; `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §2, §3,
  §4; `runs/2026-09-05/lanes/l7a-data/BRIEF.md` (this lane's brief — R53
  rulings, ownership, IPC needs); the plan's Global Constraints and Task 1
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`, lines
  1–177) — your starting point, with no corrections for this task; C3 §2
  (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`) for the
  `IpcError` shape and kind vocabulary; C3 §3.2 and C1 §3.1 (`0` means
  "unknown" for a UTC-ms timestamp) — both cited inline below; the current
  `app/src/ipc/catalog.ts` (`SessionSummary`, `listSessions`) and
  `app/src/routes/pages/DataPage.tsx` (today a one-line placeholder
  component, not yet a re-export) — read both before writing anything, the
  interfaces below assume their current landed shape.

## The task (plan Task 1, Steps 1–6, unchanged)

**Files:**
- Create: `app/src/routes/pages/Data/index.tsx`,
  `app/src/routes/pages/Data/sessionRow.ts`,
  `app/src/routes/pages/Data/sessionRow.test.ts`,
  `app/src/routes/pages/Data/errors.ts`,
  `app/src/routes/pages/Data/errors.test.ts`
- Modify: `app/src/routes/pages/DataPage.tsx` (becomes
  `export { default } from "./Data";`)

**Interfaces** (plan lines 91–139, transcribed here so this brief is
self-contained):

```ts
import type { SessionSummary } from "../../../ipc/catalog";

/** One row in the sessions result list — a pure display derivation of one
 *  `SessionSummary` (C3 §3.2). Holds no engine truth: every number here came
 *  from the catalog, formatted for the screen only. */
export interface SessionRow {
  sessionId: string;
  /** `timestamp_utc_ms` rendered in the viewer's locale; "unknown" when the
   *  summary's `timestamp_utc_ms` is 0 (C1 §3.1: 0 means unknown). */
  dateText: string;
  timeText: string;
  /** `venue_name`, or "(none)" when empty — the same synthetic label the
   *  venue facet uses so a filtered row and its chip agree. */
  venueText: string;
  riderText: string;
  bikeText: string;
  /** `duration_ms` as `h:mm:ss`, or "—" when null. */
  durationText: string;
  /** `lap_count` as digits, or "—" when null (laps not indexed yet). */
  lapCountText: string;
  sourceFormat: SessionSummary["source_format"];
  /** Sort/group key: local ISO date (`YYYY-MM-DD`) plus display venue. */
  groupKey: string;
}
```

This task's `sessionRow.ts` needs at minimum `toSessionRow(s: SessionSummary):
SessionRow` and `groupKeyOf(row: SessionRow): string` (or equivalent — the
test names below are authoritative, not a literal function signature list).
Date/time formatting can be a direct `Intl.DateTimeFormat` call in this task;
Task 2 extracts it into `format.ts` and this file is updated to use it then —
do not build `format.ts` now, it doesn't exist until Task 2.

`errors.ts` needs `describeIpcError(e: unknown): { kind: string; text:
string; retryable: boolean }` — the one place a rejected `invoke` becomes
user-facing text. Map the C3 §2 kind vocabulary the Data tab can see —
`not_found`, `invalid_argument`, `io`, `internal`, `conflict`, the seven
`import_*` kinds, the three `parse_*` kinds — with a default arm for
anything else (C3 §5: kinds are additive; an unrecognised kind must never
throw).

- [ ] **Step 1: Write the failing tests**

`sessionRow.test.ts`:
- `toSessionRow — summary with duration_ms and lap_count set — formats both`
- `toSessionRow — duration_ms null — duration reads "—", never "0:00"`
- `toSessionRow — lap_count null — lap count reads "—" (laps not indexed yet, C3 §3.2)`
- `toSessionRow — timestamp_utc_ms is 0 — date reads "unknown" (C1 §3.1: 0 = unknown, not 1970)`
- `toSessionRow — venue_name empty — display venue is "(none)", matching the facet's synthetic entry`
- `groupKeyOf — two sessions on the same local date and venue — same key`
- `groupKeyOf — same date, different venue — different keys`

`errors.test.ts`:
- `describeIpcError — IpcError with kind "not_found" — text names the missing entity, retryable false`
- `describeIpcError — IpcError with kind "io" — text suggests rebuilding the catalog, retryable true`
- `describeIpcError — kind the frontend has never seen — falls through to a generic message, never throws (C3 §5: kinds are additive)`
- `describeIpcError — a plain Error, not an IpcError — still produces text, never throws`

Arrange/Act/Assert with blank lines between; every test name literally
`thing — condition — result` (an em dash, not a hyphen).

- [ ] **Step 2: Implement `sessionRow.ts` and `errors.ts`** to pass Step 1.

- [ ] **Step 3: Move the page into a directory.**

  `app/src/routes/pages/Data/index.tsx` — the page component. It calls
  `listSessions()` (from `../../../ipc/catalog`) once on mount, holds
  `{ status: "loading" | "ready" | "error" }` in a `useReducer`, and renders
  a plain table of `SessionRow`s with a loading state, an error state
  (through `describeIpcError`), and an empty state ("No sessions yet —
  import a file"). No filter rail, no sorting, no detail pane yet — Tasks
  2–4 add those.

  `app/src/routes/pages/DataPage.tsx` becomes exactly:
  ```tsx
  /** Kept so the app shell's import path is unchanged while L7a owns
   *  `routes/pages/Data/`. Retiring this shim is a lead shell task. */
  export { default } from "./Data";
  ```
  Do not touch `App.tsx` — its import of `DataPage` is unaffected because the
  shim re-exports the same default.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 11 new tests passed, 0 failed; `tsc` silent.

- [ ] **Step 5: CHANGELOG**

  Append to `CHANGELOG.md`:
  `- **Data tab: session list over C3 §3.2 list_sessions.** DataPage becomes routes/pages/Data/; pure SessionRow view-model and typed IpcError mapper, both tested.`

  Spec discipline: **no spec change needed** — this task implements C3 §3.2
  and the design doc; nothing user-visible is documented differently in
  `docs/IDL0_SPEC.md`. Say this out loud in your report.

- [ ] **Step 6: Commit** — explicit paths (NOT `git add -A`):
  ```bash
  git add app/src/routes/pages/Data/index.tsx app/src/routes/pages/Data/sessionRow.ts app/src/routes/pages/Data/sessionRow.test.ts app/src/routes/pages/Data/errors.ts app/src/routes/pages/Data/errors.test.ts app/src/routes/pages/DataPage.tsx CHANGELOG.md
  git commit -m "app: Data tab directory + session list over list_sessions"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not touch `App.tsx` — the shim keeps its import path valid.
- Do not build `Data/format.ts` or a sort control — that's Task 2.
- Do not add a filter rail, facets, or a detail pane — Tasks 3–4.
- Do not add rendering tests (React Testing Library, snapshots, jsdom DOM
  assertions) — CLAUDE.md §4 / the plan: a component is correct when its
  pure module is tested and the lead eyeballs the tab.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value (`_ms`);
`// TODO(idl0):` never a bare `// TODO`; errors typed, routed on `kind` never
`message`. No AI attribution trailer. Never `git push`.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line
(`passed` count); confirmation `tsc --noEmit` printed nothing; per-step
done/deviated; confirmation `DataPage.tsx` is exactly the one-line
re-export; anything ambiguous you resolved (say how) or that needs a lead
ruling (stop and report instead of guessing — CLAUDE.md §1).

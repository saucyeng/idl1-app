# L7a — Data tab — lane brief

**Plan:** `docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md` (8 tasks).
**Adjudicated:** `runs/2026-09-03/decisions.md` R53, "Data (L7a)" section (5 questions).
**Operating brief:** `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` — §2 ownership, §3 contract
freeze, §4 gates bind this lane exactly as written there.

## Scope

Port idl0's Data tab — faceted catalog browser, session/lap results tree,
tracks table, session-detail and metadata surfaces, file import — onto C3
§3.2's seven landed catalog commands and §3.3's import commands (landing with
L5 Task 9 on the Rust track, concurrently). One lane, one directory:
`app/src/routes/pages/Data/`.

## Branch and worktree

Created by **Task 1's implementer**, before Task 1's first step:

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git worktree add -b wave2-l7a-data "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data" main
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l7a-data"
git submodule update --init -- rust
cd app && npm ci
```

Branch and worktree directory are both `wave2-l7a-data`, exactly as the
plan's own Global Constraints give it
(`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md:61`).
`npm ci` runs once, here, before Task 1 — never inside a task. Working
directory for every task in this lane: the worktree above.

## Ownership (operating brief §2, binding)

This lane touches only:
- `app/src/routes/pages/Data/**` (new directory; `DataPage.tsx` becomes a
  one-line re-export shim, per Task 1).
- Additive type fixes only, where the file disagrees with C3 as written, in
  `app/src/ipc/catalog.ts` and `app/src/ipc/import.ts`. **Never a new
  command** in either file.
- Its own `*.test.ts` files beside its modules.

**Never:** `rust/`, `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`,
`routes/types.ts`, `state/AppState.tsx`, `package.json`/lockfile,
`vite.config.ts`. A change to any of those is a question to the lead, filed
in the task's report, not made in this worktree.

**Reading `state/AppState.tsx`'s `selection` slice (R53 Data Q3):** a
concurrent lead shell task adds `selection: { sessionId: string | null,
lapContext: { mainLap: number, overlayLaps: number[] } | null }` to
`AppState` before this lane's Task 4 needs it. Task 4's brief tells the
implementer to check for it and what to do if it is not yet on `main` —
this lane never invents the slice itself.

## IPC needs this lane stubs

Per `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` needs 1–5 (all filed as "L7a"):
`save_session_metadata` (Task 7), `save_track`/`delete_track` (Task 6, stub
only), `delete_session` (Task 8), `list_quarantine`/`resolve_quarantine`
(Task 8). Need 5 (`rescan_track_visits`) is **not** stubbed — it is dropped
for wave 2 outright (IPC-NEEDS.md's own text: "nothing — L7a drops this...
because unlike the others it needs real engine work").

Every stub lives in `Data/ipcStubs.ts` (created by Task 6), throws a local
`NotImplementedError extends Error { command: string }`, and is **never** an
`IpcError` — C3 §2's kind vocabulary is additive-only; a `not_implemented`
kind would put a placeholder in a signed contract.

`import_file` and `list_importers` (C3 §3.3, landing with L5 Task 9) are
**real contract commands**, not IPC needs — Task 5 calls the typed wrappers
in `app/src/ipc/import.ts` directly and lets them reject with a real
`IpcError` until L5 Task 9 lands. Do not add a stub for either.

## Gates (operating brief §4, never skipped)

Per task, from the worktree:
```
cd app && npx tsc --noEmit && npx vitest run <the filter the task names>
```
`vitest` must report a non-zero `passed` count. `tsc` must print nothing.

Lane merge gate (after Task 8): `npx tsc --noEmit && npx vitest run` over the
whole TS suite, then the lead merges to `main` and eyeballs the tab in the
running dev app.

## R53 rulings that apply to this lane

- **Q1 → (b).** The `DataPage.tsx` shim (and Device's, Settings') stays until
  all three L7 lanes merge; a lead shell task then deletes all three and
  edits `App.tsx`. This lane does not touch `App.tsx` and does not delete
  its own shim early.
- **Q2 → (a) for wave 2.** Has-gates / has-GPS facets are dropped (plan's
  Task 3 already assumes this); filed as a wave-3 C4 §5 + C3 §3.2 amendment,
  not this lane's problem.
- **Q3 → (a), now, shape fixed.** The lead shell task adds `AppState`'s
  `selection` slice, shape given above (mirrors R52 Q5's `lap_context` so L6
  passes it through to `eval_workbook` unchanged). **This lane writes it,
  L6 reads it.** Task 4's brief says exactly what to check and what to do if
  the slice is absent when Task 4 starts.
- **Q4 → (a), escalated to Isaac, ruled anyway: ship it.** Lap counts and lap
  tables render "—"/empty honestly. No wave-1 import path populates the
  catalog's lap tables — `SessionSummary.lap_count` and every `list_laps`
  call may legitimately return null/empty at wave 2. This is not a bug in
  this lane; Task 4's and Task 8's CHANGELOG bullets say so explicitly so it
  is never mistaken for one. Lap indexing at import is a Rust-track backlog
  item after the write-amendment lane — not this lane's job.
- **Q5 → sector count only, wave 2.** `LapDetail.sectors` /
  `.neutral_zone_visits` stay `unknown[]`; Task 4's lap table shows a count,
  never sector times. The element shape is pinned in C1 §6 when lap indexing
  lands, not before — do not guess a shape to render more than a count.

## Parity gaps carried from the plan

Every idl0 Data-tab feature this lane drops or defers, and why, is the
plan's own "Parity gaps" table (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`,
the section after Task 8). Each per-task brief restates the gaps relevant to
that task; Task 8's brief restates the whole table for `TASKS.md`'s tick.
Nothing here overrides that table — it is unchanged from the plan.

## Done when

All 8 tasks landed on `wave2-l7a-data-tab`, each gated and reviewed; the lane
merge gate passes; `TASKS.md`'s L7a line is ticked by Task 8 and names what's
outstanding (the write-command IPC needs, the parity gaps) rather than
claiming full parity. The lead then merges to `main`, eyeballs the tab, and
runs the shell task that retires the three `<Tab>Page.tsx` shims (R53 Q1).

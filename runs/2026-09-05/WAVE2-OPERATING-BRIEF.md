# Wave 2 — operating brief (lead, 2026-09-05)

Wave 1 landed the number pipeline: parse → store → tiles/rasters/cursor →
IPC → a polyline on screen (confirmed in the dev app 2026-09-05). Wave 2 puts
the app's four tabs over it. This file is the lead's decisions for how wave 2
runs; lane plans cite it. Rulings continue in `runs/2026-09-03/decisions.md`
(R-numbering is continuous across passes).

Design authority: `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`
§6 (notebook), §10 (lanes L6, L7), §12 (operating model). Isaac's calls
2026-09-05: Properties + Code editor as designed (D13); the React Flow graph
view is wave 3 and **hosts the same Properties form component inside a node**
— React Flow ships no property inspector (verified against its docs), so the
form is built once and re-homed later. Two editing surfaces, not three.

## 1. Two tracks

**Rust track — strictly serial, one cargo process on the machine.**
1. L2 importers, Tasks 1–8 (running; Task 1 dispatched 2026-09-05).
2. L5 Task 9 — `import_file`/`list_importers` Tauri commands over L2's
   `store::import::import_file` and `core::import::importers()` (R51 Q1/Q2),
   with `rebuild_catalog` + `get_session` read-back (R51 Q4).
3. **C3 wave-2 write amendments** (see §4) — implemented as one small Rust
   lane after Task 9, from the IPC-needs lists the UI planners produce.
4. Anything else the UI lanes surface, as contract amendments through the lead.

**UI track — concurrent, TypeScript only, no cargo.**
- **L7a Data tab**, **L7b Device tab**, **L7c Settings tab** — three lanes,
  one agent each, run at the same time.
- **L6 Notebook** — one lane, sequenced tasks, starts with the pure
  `plotForm` module. Runs alongside L7.
- **L10 docs vendoring** — `docs/vendor/` offline snapshots (Tauri v2, Plot,
  Runtime/Inspector/Inputs, CodeMirror 6, React Flow, React 19) — done
  before any UI lane is dispatched; briefs cite these files by path.

Memory budget (R13, 16 GB): one cargo process + up to four node/vitest
processes is fine (vitest + tsc ≈ seconds and a few hundred MB each). A Tauri
build happens only at a Rust merge gate or for a preview, never inside a UI
task. UI merges to `main` are visible in the running dev app via Vite HMR
with no cargo involved.

## 2. Ownership — what a UI lane may touch

Each UI lane owns exactly:
- `app/src/routes/pages/<Tab>/**` — the page file becomes a directory
  (`DataPage.tsx` → `Data/index.tsx` + components); the lane's first task
  does that move.
- `app/src/ipc/<group>.ts` — **additive type fixes only**, and only where the
  file disagrees with C3 as written. Never a new command.
- Its own `*.test.ts` files beside its modules.

**Lead-owned shared files** (a lane needing a change files a question; the
lead applies it on `main` as a serialized "shell task" and lanes rebase):
`app/src/App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
`state/AppState.tsx`, `package.json`/lockfile, `vite.config.ts`,
`app/src-tauri/**`, anything under `rust/`.

**Dependencies:** only packages in the M0 ecosystem report
(`docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`) at its pins.
Anything else is a question with the bundle-size cost stated. No CDN, ever
(CLAUDE.md §3) — everything is bundled.

**Reference source (read-only):** idl0's Flutter UI at
`C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\<tab>\`
(~33 k lines total; data ≈ 6 k, device ≈ 2.7 k incl. `data/channel_sources/`,
settings ≈ 1.6 k, analyze+maths ≈ 16 k). Port **semantics and features**, not
widgets: what the user can see and do, the validation rules, the units, the
edge cases. Every idl0 feature the lane drops or defers is listed in the
plan's "Parity gaps" section with a reason — silence is not deferral.

## 3. Contract freeze

C3 is frozen for UI lanes. A tab that needs a command C3 does not have
writes it into its plan's **"IPC needs"** section (name, args, return shape,
error kinds, which C3 §3 group) and builds against a typed stub in its own
directory that throws `not_implemented` until the Rust track lands it. The
lead batches these into one C3 amendment (§4) and one Rust lane. No UI lane
edits a contract, `rust/`, or `app/src-tauri/`.

Known gaps going in (C3 has **no write commands** outside workbook save):
- session metadata edits (rider, bike, venue, notes → `session.json`) — Data
- track create/edit/delete (C3 has `list_tracks`/`get_track` only) — Data
- app settings/profile read+write (L1 shipped persistence in core; no
  command exposes it) — Settings
- firmware update (`push_ota` exists on the transport trait; no C3 command)
  — Settings; **deferred to wave 3** unless Isaac says otherwise
- delete/forget session, quarantine review — Data

## 4. Gates

Per UI task (cheap, never skipped):
```
cd app && npx tsc --noEmit && npx vitest run <lane filter>
```
`vitest` must report a non-zero `passed` count (a filter matching nothing is a
failed gate). Reviewer runs the same once. No cargo in a UI worktree — the §8
hook is extended to deny any cargo invocation whose cwd is under
`idl1-app-worktrees/wave2-*`.

Per UI lane merge: `npx tsc --noEmit && npx vitest run` (whole TS suite),
then the lead merges to `main` and eyeballs the tab in the running dev app.

Rust track: unchanged from wave 1 — targeted filter per task, full
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4` every four tasks and
at the lane gate, `cargo check -p idl-rs-cli --tests` on any `pub` change,
`cargo check -p idl-rs-tauri` when a command signature moves.

Testing frequency is **not** reduced (Isaac asked; lead declined with
reasons in the ledger): the wave-1 five-task blind spot was a test failing
unnoticed. Cost per run is what we cut — UI gates are seconds, Tauri builds
are rare, reviewers never build.

**Merging `main` into a lane (R19 pattern, before each task):** a
`CHANGELOG.md` conflict made of independent bullets under the same heading is
resolved by keeping both (main's first, then the lane's) and noting
"CHANGELOG: kept both bullets" in the merge commit. Any conflict in any other
file is STOP and report — the lead resolves it. (Every concurrent lane adds a
CHANGELOG bullet per task, so this conflict is expected, not a signal.)

## 5. Sequencing

```
now      L2 T1 (prose)            L10 docs vendoring        L6/L7 plans written (Opus)
next     L2 T2..T8 (Rust, serial) L7a  L7b  L7c  L6 (TS, concurrent)
then     L5 T9                    ...UI lanes continue, merge tab by tab
then     C3 write amendments lane (Rust)  → UI stubs replaced
gate     wave 2 done when all four tabs merged and the write lane landed
```

L6/L7 start as soon as their plan is adjudicated and `docs/vendor/` exists.
They do not wait for L2.

## 6. Reporting

Every task: brief-as-file, Opus pre-read where the plan touches a landed
shape, review after every task, questions in the fixed template, `Cost if
wrong` on every ruling. When a claim is corrected in one file, grep for it
everywhere before calling it fixed (L5 lesson).

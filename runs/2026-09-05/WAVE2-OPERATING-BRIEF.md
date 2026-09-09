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
- track create/edit/delete (C3 has `list_tracks`/`get_track` only) — Data.
  **Landed 2026-09-06** (L8x, ruling R86): `save_track`/`delete_track`.
- app settings/profile read+write (L1 shipped persistence in core; no
  command exposes it) — Settings
- firmware update (`push_ota` exists on the transport trait; no C3 command)
  — Settings; **deferred to wave 3** unless Isaac says otherwise
- delete/forget session, quarantine review — Data. **Quarantine review
  landed 2026-09-06** (L8x, ruling R86 Q1): `list_quarantine`/
  `resolve_quarantine`/`verify_data_dir`.

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

**Never amend a reported commit.** Once a task's commit hash has been
reported to the lead, fixes land as a new commit on top — reviewers and the
next task in the lane are already working against that hash, and the lane's
worktree is shared sequentially. (Two amend incidents 2026-09-05, both after
the lead's own "fold it into your commit" wording; the lead now says
"as a follow-up commit".)

**Effects that drive IPC delegate to a pure driver (added 2026-09-05 after
two Criticals).** Rendering is not unit-tested, so a React `useEffect` that
starts IPC work and dispatches results is the one place a wiring bug cannot
be caught by the gate. Two such bugs reached review the same afternoon (L7a
import queue: the effect's own cleanup cancelled every in-flight import; L6
sandbox: host variables registered in a form the runtime never unwraps).
Rule: the decision logic (which item to start, what to dispatch on each
outcome, how a rebuilt iframe is re-primed) lives in a pure module with an
injected async function and is unit-tested for the interleavings that
matter (dismiss-while-running, rebuild, stale response); the effect only
calls it and never cancels an in-flight promise because unrelated state
changed. Reviewers trace every effect's dependency array against what it
dispatches and grade a self-cancelling effect Critical.

**Tightening (2026-09-05, after a third self-cancel Critical in L6 Task 9):**
the "no independent decision logic" escape hatch is withdrawn. Every effect
that starts IPC or `postMessage` work (a) keys its dependency array on data
only — never on an injected callback or prop function; callbacks live in
refs; (b) never uses its cleanup to cancel in-flight work; staleness is
decided by a monotonic sequence (`latestSeq`/`isStaleSettleResult` or an
equivalent pure guard) when the result arrives; (c) has its "should this
change trigger work, and is this result still current" decision in a pure
module with tests for: unrelated prop change ⇒ no cancel/no refetch; data
change ⇒ exactly one request; stale result ⇒ dropped. Reviewers grade any
effect that lists a function prop in its dependencies alongside a cancelling
cleanup as Critical on sight.

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

## 7. Token economy (added 2026-09-06 after four session-limit cutoffs)

Compute is no longer the binding constraint; tokens are. Rules:

1. **Rulings digest, not the ledger.** Agents read
   `runs/<date>/RULINGS-DIGEST.md` (one page: every ruling still in force,
   grouped by lane, one line each with its R-number) instead of the
   ledger. The ledger stays the record; the digest is regenerated by the
   lead whenever a ruling lands. A brief cites the digest and at most the
   two or three ledger entries the task actually turns on.
2. **Reports are the template, not a narrative.** Implementer and reviewer
   reports fill the brief's template fields and stop — target 15 lines,
   hard cap 30. Verification detail goes in the findings/commit, not the
   message. Duplicate idle notices are ignored by the lead.
3. **No new dispatch in the last 30 minutes before a known session reset.**
   Running agents finish; new ones start after the reset. A cutoff
   re-dispatch costs a full cold read.
4. **Docs-only commits get a lead spot-check, not a reviewer.** Reviews
   stay mandatory for every code commit (they caught nine shipped-quality
   defects in wave 2).
5. **Briefs point, they do not restate.** A brief names files and sections
   to read; it does not copy contract text or code into itself.

## 8. Filesystem search (added 2026-09-07 after two runaway processes)

Never run a filesystem-wide `find` (`find / …`, `find C:/ …`) or an
unbounded recursive scan. Two such commands from finished subagents ran
for hours (8.5 and 6.5 CPU hours) walking every mount, and could not be
killed from the lead's session. Use the repo's own tools: Glob for paths,
Grep for content, both scoped to a directory. If a shell search is truly
needed, bound it: a concrete root, `-maxdepth`, and a timeout.

## §9. Cargo, restated (2026-09-09, after three stalls in one night)

The old instruction — "never background cargo" — is **not actionable**, and
telling agents it is has now cost time three times in one night plus two
incidents earlier. An implementer's tool **auto-backgrounds any command that
exceeds its timeout**. The agent does not choose it, so it cannot obey.

**What to do instead:**

1. Run cargo in the **foreground**, timeout at your maximum, with no pipe
   that can swallow the exit code (`| tail`, a separate stderr redirect read
   later).
2. **When the harness moves it to the background anyway — poll the
   process**, never wait on the completion notification:
   `Get-Process cargo,rustc -ErrorAction SilentlyContinue`. While a `rustc`
   is alive and accumulating CPU, it is working. When they are gone, read
   the output file and continue.
3. **Never start a second cargo command while one is running** — this part
   *is* a choice, and it is the one that actually breaks things. Concurrent
   invocations block on the target-directory lock: four of them ran at
   ~0% CPU on 2026-09-08 and had to be killed. Near-zero CPU across several
   cargo processes is a **deadlock**, and it looks exactly like a slow
   build.
4. A run burning CPU is healthy however long it takes. A run with **no CPU
   being burned** past ~20 minutes is a deadlock — report it, do not wait.

**Why builds are slow right now:** the shared target cache was cleared on
2026-09-08 to recover 12 GB. Cold Tauri builds cost ten minutes or more;
incremental ones are fast. Prefer `-p idl-rs` filters over `-p idl-rs-tauri`
when a change does not reach the Tauri crate, and say in your report when a
task genuinely needs it.

**And `cargo check` is not `cargo test`** — it compiles without running
anything. A `pub` type change that compiles can still break a fixture
assertion, which is exactly what happened on 2026-09-08.

**Lane gate, corrected (2026-09-09, R159).** The full gate is now:

    cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4
    cargo test -p idl-rs-tauri
    cargo test -p idl-transport

`-p idl-transport` was missing, and a merge defect that lost a workbook cell
reached main through that gap: the lane's own `workbook::merge` filter was
green because the bug lived one layer up in `render_workbook`, and only
transport's loopback integration test exercised the path.

### 9.1 Retiring an app worktree (R171)

An app lane's `app/node_modules` is a Windows **junction** to the main
checkout's. `git worktree remove --force` follows it and deletes the
*target's* contents, emptying the main checkout's `node_modules`. The damage
shows up later, in an unrelated lane's gate, as:

    This is not the tsc command you are looking for

Unlink first, remove second — always, in this order:

    cmd /c "rmdir node_modules"      # removes the LINK, never the target
    git worktree remove <path> --force

`rmdir` on a junction is the safe form; `rm -rf` through the link is not.
Recovery is `npm ci` in `app/`. Before blaming a worktree for a toolchain
error, check the target survived: `ls app/node_modules | wc -l`.

### 9.2 `CHANGELOG.md` lives in the superproject only (2026-09-09)

There is no `CHANGELOG.md` tracked in the `idl-rs` submodule. A brief that
tells a Rust lane to add a changelog line is asking for a file that does not
exist there — the `unwatch` lane correctly flagged this and left it out
rather than inventing a path, which is the behaviour we want.

**When writing a Rust-lane brief:** ask for the CHANGELOG *wording* in the
report, and write the line yourself in the superproject. Same pattern as C3
amendments, and for the same reason: a worktree-confined lane cannot reach
the superproject, so anything living there is the lead's half.

# Lead handoff — 2026-09-06 evening (Fable → Opus)

Read in this order: `CLAUDE.md`, `runs/2026-09-05/WAVE2-OPERATING-BRIEF.md`
(§4 gates + effects rule, §7 token economy), `runs/2026-09-06/RULINGS-DIGEST.md`
(regenerate a line when a ruling lands), then the tail of
`runs/2026-09-03/decisions.md` from R88 onward. Never read the whole ledger.

## Standing rules the lead enforces (short form)
- Never push; Isaac pushes. No AI attribution trailers. Never amend a reported
  commit; fixes are follow-up commits. One writer per worktree; **a message to
  a reported agent is a new dispatch** (incident 2026-09-06 4:20pm).
- One cargo process on the machine; implementers run cargo foreground; Rust
  reviewers never run cargo (global `~/.claude/agents/reviewer.md` says so).
  TS reviewers run the gate once. Docs-only commits: lead spot-check, no
  reviewer. Every code commit gets a reviewer.
- Reports ≤15 lines; briefs point at files; ≤3 ledger citations per brief.
  No new dispatch in the last 30 min before a known session reset.
- Every ruling → ledger entry with **Cost if wrong**, R-numbered (next: R94),
  then a one-line digest update.
- Merge pattern: merge `main` into the lane first (CHANGELOG conflicts of
  independent bullets: keep both, main's first, say "kept both"), then
  `--no-ff` into main; Rust lanes merge into the submodule repo
  (`idl1-app/rust`, `main`) first, then the app side, then
  `git add rust` + "chore: point rust submodule at <hash>". Run the whole TS
  suite on main after every merge; retire worktrees with `rm -rf` +
  `git worktree prune` (both repos).
- Agent dispatch model: Sonnet for implementer/reviewer, Opus for planners/
  adjudicators; the hook denies untyped dispatches. Worktrees: idl1-app under
  `../idl1-app-worktrees/<name>`, idl-rs under `../idl-rs-worktrees/<name>`
  (create with an absolute path from `idl1-app/rust`); copy `app/node_modules`
  into TS worktrees.

## State at handoff
- main `3bfb39d` (idl1-app); rust submodule at idl-rs `52efba8` (L8x) — L11 not
  merged yet. TS suite on main: 98 files / 924 passed.
- Dev app: `npm run tauri dev` from `app/` launches the preview (window "idl1");
  data dir `C:\tmp\idl1-data-l5` (settings.json in `%APPDATA%\com.saucyeng.idl1`).
  PrintWindow capture via PowerShell works even when the screen is locked;
  full-screen capture does not. Disk: keep ≥10 GB free before Tauri builds.

## Running agents (check with ListAgents)
- `l11-task8` — L11 Task 8 axum server, idl-rs worktree `l11-sync`
  (HEAD `02117eb`). On DONE: dispatch `l11-review8` (read-only) + Task 9
  (mDNS, `brief-task9.md`). Then 10 (client), 11 (loopback proof), 12 (tauri
  commands + lifecycle + sweep: R89 sentence in C4 §6, R91 tie rule, the
  `KeptLocal` minor from review-task6fix, `.sync-base` note). Gate cadence:
  full `cargo test -p idl-rs-tauri` + `-p idl-rs -p idl-rs-cli --
  --test-threads=4` after Task 12; then merge both repos + submodule bump;
  then the TS shell task (Settings sync section over the five commands +
  `sync_status`/`peer_appeared`).
- `ui-1` — UI-1 tokens/fonts/Tailwind+shadcn, worktree `ui-1`. On DONE:
  `review-ui-1` (TS reviewer, gate once + `vite build` output has no network
  loads), merge, then UI-2 (`brief-ui-2.md`) in a fresh `ui-2` worktree from
  main. Serial UI-1→4; UI-5/6/7 concurrent after UI-4 (each its own worktree,
  UI-5 gates on `composeVisibility`); UI-8→11 serial in one Notebook worktree.
- After each UI merge, the running dev app picks it up via Vite HMR; capture
  and send Isaac a screenshot (SendUserFile) — he wants to see the look.

## Open for Isaac (do not resolve alone)
- `runs/2026-09-05/QUESTIONS-FOR-ISAAC.md` items 1–10 (11 closed).
- Device-tab refinement list to collect after UI-5 (direction decision 35).

## Backlog after L11 + UI
- Cross-session overlay amendment; L9 mobile plugins; React Flow maths graph
  (wave 3, column reserved by UI-4); figure export; cloud relay.

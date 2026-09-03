# L5 — Tauri scaffold hardening — BRIEF

**Plan:** `docs/superpowers/plans/2026-09-03-idl1-wave1-l5-tauri-scaffold.md`
**Branch:** `wave1-l5-tauri` (created in both repos: the `rust` submodule and
the app repo — this lane spans two working directories exactly like M0
Task 5). Two commits per task where both repos change.

**Scope (design §10 L5 row):** `app/`, `idl-rs-tauri` commands (C3), binary
IPC proven on desktop, React/Vite skeleton, routing, state, file watcher
plumbing. 14 tasks total: 7 Group A (no dependency), 7 Group B (gated).

## Dependency gates

**Group A (Tasks 1–7): none.** IpcError shape, `<data>`/`settings.json`
resolution, workbook watcher plumbing (tested against a hand-created dummy
`.idl1wb`), the real C3 §3.5/§3.6 binary tile/raster decoders, the full
`app/src/ipc/` module layer (C3 §1), a hand-rolled routing skeleton +
Context/useReducer app state (no new npm dependency — routing/state
libraries are unpinned in the ecosystem report, flagged as open question 1
rather than guessed), and SPEC §11's spec-during rewrite.

**Group B (Tasks 8–14), per command group:**
- Task 8 catalog — gate: L1's plan lands catalog read functions in `rust/core` (module path TBD, check `runs/2026-09-03/lanes/l1-store/BRIEF.md`)
- Task 9 import — gate: L2's plan lands its `Importer` dispatch (check `l2-importers/BRIEF.md`)
- Task 10 device — gate: L4's plan lands real BLE/WiFi/config-push (check `l4-transport/BRIEF.md`)
- Task 11 workbook (+ full `watch_workbook` wiring) — gate: L3 lands parser/evaluator/cell-diff (check `l3-workbook/BRIEF.md`)
- Task 12 cursor — gate: L3 lands value-at-time lookup
- Task 13 raster — gate: L3 lands raster computation **and** resolves C3 open question 6.4 (params shape)
- Task 14 tile + minimal end-to-end render — gate: L3 lands `decimate_channel`-backed tile production — **LAST task**, retires the M0 `smoke_tile` path

No `runs/2026-09-03/lanes/l{1,2,3,4}-*/BRIEF.md` exists yet as of this
plan's drafting (siblings `wave1-l1-plan`..`l4-plan` are concurrent this
session) — every Group B gate is unresolved at drafting time and is
re-checked at execution. **Sync commands (C3 §3.9) are out of scope**: L11
is wave 2, no wave-1 lane backs them; `app/src/ipc/sync.ts` is scaffolded
(Task 5) but unwired.

## Done criteria

A tile fetched and rendered end-to-end (Task 14, `<canvas>` min/max
polyline proof, not L6's real chart); watcher fires on external edit
(mechanism + dedicated test in Task 3; full `watch_workbook` command wiring
in Task 11).

## SPEC sections touched

`docs/IDL0_SPEC.md` §11 (App Architecture) — rewritten, spec-during (Task 7).
**First draft only**: cross-references CLAUDE.md §2 rather than duplicating
it; explicitly notes in its own text that L10's plan does a cross-lane
consistency pass once L1–L4/L6/L7 land and can name real module paths.

## Open questions logged (5)

Routing/state library pins (owner L6, at its own planning time); three
dev-only Rust crate versions not in the ecosystem report (`tempfile`,
`sha2`, `hex` — owner: implementer, via `cargo add`, recorded in commit);
`.setup()` failure handling / no native error dialog (owner: lead);
Group B exact function names (owner: each task's own Step 1, re-checked at
execution — not a blocker for Group A); `watch_workbook` watcher-lifetime
management (owner: Task 11's implementer, informed by L6 once it exists).
None block Group A.

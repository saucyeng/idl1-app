# Brief: live evaluation state, per cell and on the maths map (R250)

Lean owner (Opus). Spec-first. TypeScript first, then one Rust step when the lead frees the
Rust slot (another Rust lane is running: R235). Worktrees: app
`../idl1-app-worktrees/eval-progress` (branch `eval-progress`, `app/node_modules` junctioned:
never `npm install` there), Rust `idl-rs-worktrees/eval-progress` (create nothing there until
the lead says the slot is free). Isaac's words (2026-09-20): "right now it's kind of just blank
charts and i dont know what's going on ... i'm only seeing it green after it's calculated, not
the progress before. maybe we can integrate this better into the flow map, so i can see at a
glance where it's working, and if one of the steps has an error, which branches won't
calculate". Standing wish: nothing ever blanks or freezes; state is always visible.

Read CLAUDE.md (section 3 R201: commands that compute over a session are async and report
progress over a `Channel`), digest entries R201, R210, R216, R221 (decode ring), R232, the
errors-staleness entry (decisions 58-63, `stale` status), R212/graph-semantics, then:
`model/cellStatus.ts`, `model/decodeProgress.ts`, the glyph status component, how and when the
Notebook page calls the engine to evaluate (`app/src/ipc/workbook.ts`, the evaluate command in
`rust/tauri/src/commands/workbook.rs` and what core's evaluator exposes), the sandbox message
protocol for `js` cells, `graph/*` (node kinds, `graphHost.ts`, edges from the dependency
graph), C3 section 3.4.

## Task 0: diagnose, and write the spec delta before any code
Find exactly why a cell shows nothing until it is done: which status each cell kind holds
between "selection changed / workbook opened" and "value arrived", whether the status glyph is
rendered at all in an empty chart slot, and whether evaluation is one IPC call returning every
cell at once (so no per-cell progress can exist). Write `docs/superpowers/specs/
2026-09-20-idl1-evaluation-progress-DRAFT.md`: the cell state machine, the map's visual
grammar, and the C3 delta. Send the lead a 10-line summary with the diagnosis and any decision
you need; then continue with task 1 without waiting unless the diagnosis contradicts this brief.

## The state model (one source of truth, pure module + tests)
Per cell: `idle` (no selection), `queued`, `fetching` (channel decode, with the R221 fraction),
`evaluating` (engine maths), `rendering` (sandbox/Plot), `done`, `error` (own failure),
`blocked` (an upstream cell failed or is missing: names the upstream cell and its error),
`stale` (decision 59: last output kept, greyed). `blocked` is derived from the dependency graph
the map already has: every descendant of an `error` node is `blocked`, transitively.

## Task 1 (TS): the cell frame always says what it is doing
From the first frame after a trigger, every cell shows its state in place: the chart-sized slot
(decision 58) holds a quiet skeleton with the glyph and one line ("queued", "fetching
IMU0_AccelZ 40 %", "evaluating", "blocked by Cell 3: unknown channel"), determinate where a
fraction exists, never a blank. No spinner without a label. A `blocked` cell offers "Go to
Cell 3". Elapsed time appears after 2 s. No layout jump between states.

## Task 2 (TS): the maths map is the evaluation view
Nodes carry the same state: subtle fill/outline from tokens (no new colour literals), a small
progress arc for `fetching`, a pulse only for the node(s) actually working (respect
`prefers-reduced-motion`), `error` nodes marked, and the **blocked subgraph dimmed with its
edges dashed from the failing node down**, so one look shows which branches will not
calculate. Hover/focus a node: state, duration, error text, "blocked by". Click: scroll to the
cell (existing behaviour kept). A legend chip and a status-bar summary ("12 done, 2 working,
1 error, 4 blocked") that opens the map. Map updates never trigger evaluation and never touch
IPC (interaction path rule).

## Task 3 (Rust, when the lead says go): per-cell progress over a Channel
If evaluation is a single call: add a progress `Channel` to the evaluate command (C3 3.4
amended, `app/src/ipc` mirror, wire golden if a byte DTO is involved): events `cell_started`,
`cell_finished { ok | error }`, in dependency order, cheap (ids and enums, no payloads), plus
cancellation on a newer request. Core exposes a callback/observer on the evaluator, no async,
no Tauri (layer rule). Until this lands the TS side drives `queued`/`evaluating` from the call
boundary and `fetching` from the existing decode progress.

## Gates
App: tsc, vitest, madge cycle scan, vite build. Rust (task 3): targeted filters, then
`cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, `cargo check -p idl-rs-cli --tests`,
`cargo test -p idl-rs-tauri --lib -- --test-threads=4`, `cargo check -p app`; cargo in the
FOREGROUND only, >= 3 GB commit free, exit codes. UI-DIRECTION amended, CHANGELOG `[docs]`.
One Sonnet reviewer per half. Do NOT merge; never push; never edit the main checkout.
The dev app is closed (a library rebuild holds the catalog): do not start it. Visual
verification comes after the lead merges. Escalate with "ESCALATION:" + a proposal and do not
proceed past it on that point. Commit after every task. Reports 10 lines or fewer.

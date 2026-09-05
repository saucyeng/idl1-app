# L8w Task 9 — implementer brief (`eval_workbook`'s `lap_context` argument, C3 §3.4, R52 Q5)

You are the implementer for L8w Task 9: add an additive
`lap_context: Option<LapContext>` trailing argument to `eval_workbook`.
`None` must reproduce today's output bit for bit. `Some(lc)` builds a real
`MathLapContext` from `session_id`'s `session.json` `laps[]` — which is
always empty today (lap indexing hasn't landed), so every non-empty
`lap_context` naturally rejects `invalid_argument`. TDD, ONE commit, then
report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`,
  branch `wave2-l8w-write-amendment`.
- Do NOT touch `docs/`. Do NOT push.
- **Files:** modify `tauri/src/commands/workbook.rs`,
  `tauri/src/session_source.rs`. No new command — this amends
  `eval_workbook`'s existing signature (`lib.rs`'s `handler()` registration
  line is unchanged, it already names `eval_workbook`).

- Read first: `CLAUDE.md`; plan Task 9 in full
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  C3 §3.4's `eval_workbook`/`LapContext` entry (quoted below) and its "Note"
  paragraph; the landed `tauri/src/commands/workbook.rs`'s
  `eval_workbook_via`/`eval_workbook` (lines ~223–260, ~429–437) — you are
  adding one parameter and threading it through; the landed
  `tauri/src/session_source.rs`'s `load_lap_context` **in full, including
  its tests** — read this closely, it is the function this task must
  change, and it currently does something narrower than C3's `LapContext`
  needs (see "A real gap" below); `idl_rs::math::eval::MathLapContext`/
  `MathOverlay` (`rust/core/src/math/eval.rs`, search `pub struct
  MathLapContext` and `pub struct MathOverlay`) in full, including the
  doc comments on `overlay_lap_bounds`/epoch-ms fields — this is the type
  `Some(lc)` must build correctly.

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs-tauri
commands::workbook::eval_workbook`, foreground, non-zero `passed`. No
`cargo fmt`, no `cargo tarpaulin`, no `cargo doc`. One cargo process at a
time.

**`pub`-change check:** `cargo check -p idl-rs-tauri`. `eval_workbook`'s
signature change is additive per C3 §5/R41/R43 precedent (a new trailing
`Option`-typed argument Tauri deserialises to `None` when absent) — not a
breaking change, no `_v2`.

## C3 §3.4 (quoted — this task's entry)

> **`lap_context` added post-sign (2026-09-05, lead ruling R59, wave-2
> write lane, ruling R52 Q5).**
> ```ts
> interface LapContext { main_lap: number | null; overlay_laps: number[]; }
> ```
> `null` keeps today's behaviour exactly (`MathLapContext::empty()`), so the
> argument is additive and no existing caller changes. Six `Implemented`
> functions in C2 §3.3 read `MathLapContext` and are unreachable without it:
> `current_lap()`, `sector_number()`, `lap_start_time(n)`,
> `lap_start_distance(n)`, `variance_time(ch)` and `variance_dist(ch)`. The
> Main/Overlay designation is a UI selection, not a property of the file
> (R41) and is written by `state/AppState.tsx`'s `selection.lapContext =
> { mainLap, overlayLaps }` (R53 Data Q3), passed through unchanged.
>
> **Note.** Until lap indexing at import lands (Rust backlog, R53 Data Q4),
> no session has laps, so every non-null `lap_context` rejects with
> `invalid_argument`. The argument is still correct to add now — there is
> nowhere else to put the designation — but the feature it unlocks arrives
> with that backlog item.
>
> Errors (command-level, added): `invalid_argument` when a named lap in
> `lap_context` does not exist on `session_id`, with `detail { lap }`.

## A real gap — read before implementing, do not guess past it

The landed `load_lap_context(data_dir, session_id) -> MathLapContext`
(`session_source.rs`) builds `main_lap_bounds`/`main_lap_number` **from
`session.json`'s own `main_lap_number` field** — it takes no lap-selection
argument at all, and never touches `overlay`. C3's `LapContext.main_lap`/
`.overlay_laps` are a **per-call UI selection** (R41's "not a property of
the file") that this task must thread through instead of (or in addition
to — see below) `session.json`'s stored designation.

Separately, and more load-bearing: `MathLapContext.overlay: Option<MathOverlay>`
requires a **second session's `ChannelLookup`** plus epoch-ms lap-window
bounds (`lap_start_ms`/`lap_end_ms`/`lap_start_uniform_sec`) — it models
"compare this session's main lap against a lap from a *different* recorded
session" (see `rust/core/src/math/variance_geom.rs`'s doc comments). C3's
`LapContext.overlay_laps: number[]` is a list of lap **numbers**, with no
second session id anywhere in `eval_workbook`'s signature or C3's
`LapContext` shape. **These do not obviously compose**: there is no way to
build a real `MathOverlay` from `overlay_laps` alone — you'd need to know
which session each overlaid lap number belongs to, which nothing in this
command's arguments states.

**Resolve this as follows, and no further:** because `session.json`'s
`laps[]` is always empty today (no lane has landed lap indexing at import),
**any** `lap_context` naming a non-null `main_lap` or a non-empty
`overlay_laps` will find no matching lap and must reject
`invalid_argument` with `detail: { lap }` *before* ever reaching the point
where a `MathOverlay` would need to be constructed. Implement the
`main_lap`/`overlay_laps` → "does this lap number exist in `session.json`'s
current `laps[]`" check as the real, natural gate this produces — do not
special-case "reject if `session.json` has zero laps" as a shortcut; check
each named lap number against the actual (currently always empty) `laps[]`
population, the same way `main_lap_bounds` is already built from it. Do
**not** attempt to wire an `overlay: Some(MathOverlay {...})` in this task —
there is no session-id-per-overlay-lap information available to build one,
and inventing an assumption here (e.g. "overlay laps are always on the
*same* session") is exactly the kind of guess CLAUDE.md §1 says to stop and
ask about rather than make. **Flag this in your report as a question for
the lead**: `MathOverlay`'s C2 §3.3 `variance_time`/`variance_dist`
functions cannot be reached through `eval_workbook`'s `lap_context` as C3
currently shapes it, even after lap indexing lands, unless a future
amendment adds an overlay *session id* to the wire shape. This is
independent of, and does not block, this task's actual scope (the
`invalid_argument` gate, which is correct and complete on its own today).

## Interface

```rust
// tauri/src/commands/workbook.rs — new
/// C3 §3.4 `LapContext` (ruling R52 Q5). 1-based lap numbers, matching
/// `LapSummary.lap_number`.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct LapContext {
    pub main_lap: Option<u32>,
    pub overlay_laps: Vec<u32>,
}

#[tauri::command]
pub fn eval_workbook(
    id: String,
    session_id: Option<String>,
    lap_context: Option<LapContext>,
    data_dir: tauri::State<'_, DataDir>,
) -> Result<Vec<CellOutput>, IpcError>;
```

## Key logic

1. **Regression first**: before changing anything, run the existing
   `eval_workbook`/`eval_workbook_via` tests to confirm green, then add the
   new parameter to `eval_workbook_via`'s signature as
   `lap_context: Option<&LapContext>` (or by value — implementer's call),
   defaulting every existing call site (including every existing test) to
   `None`, and re-run — this proves `None`'s output is unchanged *before*
   you add any new logic, not just "compiles the same" (the standing
   reviewer brief calls this out explicitly as something it verifies).
2. In `session_source.rs`, extend `load_lap_context` (or add a sibling
   function — check whether widening the existing one breaks its own
   current callers; `eval_workbook_via` looks like the only caller today,
   confirm with a repo-wide grep before choosing) to accept the caller's
   `LapContext` selection and validate it against `session.json`'s actual
   `laps[]`:
   - Resolve `session.json`'s `laps[]` for `session_id` (the same
     `read_session_json` call `load_lap_context` already makes).
   - If `lap_context.main_lap` is `Some(n)` and no lap in `laps[]` has
     `lap_number == n`, return an error the command boundary turns into
     `IpcError::with_detail(IpcErrorKind::InvalidArgument, ..., json!({"lap": n}))`.
   - If any of `lap_context.overlay_laps` names a lap number absent from
     `laps[]`, same rejection, `detail.lap` naming the first offending
     value.
   - Otherwise (only reachable once lap indexing lands and `laps[]` is
     non-empty) build `main_lap_bounds`/`main_lap_number` from the resolved
     lap numbers' bounds — `overlay` stays `None` per the gap noted above
     (document this explicitly: overlay bounds construction is not
     implemented by this task, flagged for the lead).
3. `lap_context: None` at the command boundary → `MathLapContext::empty()`,
   unchanged from today.

## Tests

- `eval_workbook_via(..., None)` produces byte-identical `CellOutput`s to a
  fixture captured **before** this task's change (a literal
  before/after comparison against the same seeded session+workbook, not
  "it compiles the same") — this is the Critical check the standing
  reviewer brief names by name.
- `eval_workbook_via(..., Some(LapContext { main_lap: Some(1), overlay_laps: vec![] }))`
  on a session whose `session.json` has an empty `laps[]` (today's only
  reachable state) → command-level `invalid_argument` with
  `detail.lap == 1`.
- Same, with `overlay_laps: vec![2, 3]`, `main_lap: None` → `invalid_argument`
  with `detail.lap` naming one of the offending values (document which one
  you chose to report first).
- `lap_context: None` and `lap_context: Some(LapContext { main_lap: None, overlay_laps: vec![] })`
  (an explicit "no selection" object, distinct from the argument's own
  absence) — confirm both produce `MathLapContext::empty()`-equivalent
  output; note in your report whether C3's `null` (absent lap_context)
  and an explicit empty `LapContext` are required to behave identically —
  they should, but this is worth stating rather than assuming silently.
- (Nice to have, not blocking per the plan — note in your report if
  skipped) a fixture with real `session.json` laps actually reaching
  `current_lap()`/`sector_number()` through the new argument, if buildable
  without excessive new fixture machinery.

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse the worktree.
- [ ] **Step 2: Capture the `None`-path regression** fixture/expected output
      before touching any code.
- [ ] **Step 3: Add `LapContext`**, thread `Option<LapContext>` through
      `eval_workbook`/`eval_workbook_via`.
- [ ] **Step 4: Implement the lap-number validation** in/around
      `session_source.rs`, gated against `session.json`'s actual `laps[]`.
- [ ] **Step 5: Write the failing tests** above, then make them pass.
- [ ] **Step 6: Test** — `cargo test -p idl-rs-tauri
      commands::workbook::eval_workbook`, confirm non-zero `passed`.
- [ ] **Step 7: `cargo check -p idl-rs-tauri`** clean.
- [ ] **Step 8: Commit** — `git add tauri/src/commands/workbook.rs
      tauri/src/session_source.rs` — message
      `tauri: eval_workbook lap_context argument, additive (C3 3.4, R52 Q5)`.

## Do not

- Do not reorder or remove `eval_workbook`'s existing `session_id`
  argument — `lap_context` is strictly a new trailing argument.
- Do not attempt to construct a `MathOverlay` in this task — flag the gap,
  do not guess a session-identity assumption for `overlay_laps`.
- Do not special-case "reject if the session has zero laps" as a shortcut
  distinct from checking each named lap number against the real (currently
  empty) `laps[]` — build the real check.
- Do not touch `rust/core/src` — `MathLapContext`/`MathOverlay` are already
  landed and unchanged by this task.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol; A/A/A tests named `thing — condition —
result`; match `workbook.rs`'s existing idiom. No `cargo fmt`.

## Spec discipline (say it out loud in your report)

"No spec change needed" — C3 §3.4 already specifies `lap_context` and its
"every non-null selection rejects until lap indexing lands" behaviour; this
task implements exactly that. The `MathOverlay`/session-identity gap noted
above is a question for the lead, not a SPEC change this task makes.

## Report back (concise)

Commit hash + `git show --stat`; the `cargo test -p idl-rs-tauri
commands::workbook::eval_workbook` result line with its `passed` count;
`cargo check -p idl-rs-tauri` result; confirmation of the `None`-path
byte-identical regression (show the before/after comparison method used);
the `MathOverlay`/`overlay_laps` session-identity gap, flagged explicitly
as a question for the lead (not buried); whether `load_lap_context` was
widened in place or a sibling function was added, and why; anything else
ambiguous you resolved (say how) or that needs a lead ruling (stop and
report instead of guessing — CLAUDE.md §1).

## Lead ruling 2026-09-05 (R64.1)

`overlay_laps` are laps of the *same* session in wave 2: build `MathLapContext.overlay` from the selected session's own lookup; cross-session overlay is a wave-3 amendment (`overlay: { session_id, lap }[]`). Add one sentence to C3 section 3.4's `lap_context` entry stating this (spec-during, idl1-app worktree). Unknown lap numbers ⇒ `invalid_argument` with `detail { lap }` as C3 says.

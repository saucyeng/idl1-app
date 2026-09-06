# L2b Task 7 — implementer brief (R73 multi-overlay amendment + the R73 `Arc` note)

R73 deferred the multi-lap overlay shape to "the same amendment that ships lap
indexing at import", because until then `laps[]` was always empty and the path
was unreachable. It is reachable now. You make `overlay_laps` mean all of its
entries, and fix the dead-code `Arc` clone R73's review note flagged.
TDD, ONE commit, then report.

**Depends on Task 6.**

## GATE

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave3-l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "resolve_lap_window" tauri/src/session_source.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` Q6; ruling **R73 and its note** in
`runs/2026-09-03/decisions.md` (2026-09-05, "`eval_workbook lap_context.overlay_laps`
— first entry drives `MathOverlay` until lap indexing lands", plus the Minor
note: the overlay path clones the whole `SessionHandle` into a fresh `Arc`
instead of sharing one, "dead code today, to be fixed by the lap-indexing task
that makes it reachable" — that is this task); ruling R64.1 (`overlay_laps`
names laps in the same session); `core/src/math/eval.rs` — `MathOverlay`,
`MathLapContext`, and **every** lap-aware / variance function that reads
`overlay`; `tauri/src/session_source.rs`'s `load_lap_context` in full;
`tauri/src/commands/workbook.rs`'s `LapContext`; C3 §3.4's `lap_context` block;
C2 §3.5's lap-context section.

## Where

- Same worktree/branch. Do NOT push.
- **Files:** `core/src/math/eval.rs` (and whichever `core/src/math/*.rs`
  consume `MathLapContext::overlay`), `tauri/src/session_source.rs`,
  `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`.

## The shape (PLAN Q6 recommendation — confirm against the lead's ruling first)

`MathLapContext.overlay: Option<MathOverlay>` becomes
`MathLapContext.overlay: Vec<MathOverlay>` — empty means no overlay. This maps
one-to-one onto C3's `overlay_laps: number[]` and leaves `MathOverlay` itself
(one lap window + one lookup) untouched.

**If the lead's adjudication of PLAN §6 Q6 chose a different shape, that ruling
wins over this brief.** Read the ledger entry the dispatch names before writing.

## Key logic

- Every evaluator function that reads `overlay` must decide what several
  overlays mean for it. Enumerate them first (grep `\.overlay`), and for each
  one either fold across the vector or document why it takes only the first.
  **This is the substance of the task** — a mechanical `Option`→`Vec` swap that
  still uses `overlay[0]` everywhere reproduces R73's bug with more types.
  Where a function genuinely cannot combine several windows (a scalar
  comparison against "the" overlay lap), keep first-entry behaviour, say so in
  the doc comment, and list it in your report for C2's amendment text.
- `load_lap_context` builds one `MathOverlay` per entry of `lc.overlay_laps`,
  in order, validating each against `laps[]` with `unknown_lap` on the first
  failure — preserving today's "`main_lap` first, then `overlay_laps` in order"
  validation order exactly.
- **The `Arc` fix (R73 note):** the overlay path currently clones the whole
  `SessionHandle` into a fresh `Arc`. Build the `Arc<dyn ChannelLookup + Send +
  Sync>` once and clone the `Arc` (cheap refcount bump) for each overlay, rather
  than the handle. With N overlay laps the current code would clone N handles;
  that is the concrete cost R73's note anticipated.
- `load_lap_context`'s doc comment currently says "`laps[]` is always empty
  today (lap indexing has not landed), so every non-empty `selection` rejects".
  That is now false — rewrite it. Grep the whole repo for that claim and any
  paraphrase before calling it fixed (the L5 lesson, operating brief §6).

## Tests

- `load_lap_context` with `overlay_laps: [2, 3]` against a session with four
  laps → two overlays, windows matching laps 2 and 3 in that order.
- `load_lap_context` with `overlay_laps: [2, 99]` → `unknown_lap(99)`, and
  `main_lap`'s validation still runs first.
- `load_lap_context` with `overlay_laps: []` → empty overlay vector, no error.
- `load_lap_context` builds one lookup and shares it: assert
  `Arc::ptr_eq` across two overlays' `lookup` fields.
- One evaluator test per folding function: a math expression over two overlay
  laps produces a result that depends on both (choose an assertion that a
  first-entry-only implementation fails).
- Regression: a single-entry `overlay_laps` evaluates identically to the
  pre-change behaviour.

## COMPUTE RULES

`cargo test -p idl-rs math::` then `cargo test -p idl-rs-tauri session_source::`
— foreground, non-zero `passed` each.
`cargo check -p idl-rs-cli --tests` (`MathLapContext` is `pub` in core) and
`cargo check -p idl-rs-tauri`. No `cargo fmt`, no `--workspace`.

## Steps

- [ ] 1. Gate. 2. Enumerate `overlay` consumers; decide fold-or-first for each.
      3. Failing tests. 4. Change the shape in `core::math`. 5. Rewire
      `load_lap_context` + the `Arc` fix + the stale doc comment.
      6. Repo-wide grep for the "laps[] is always empty" claim; fix every hit.
      7. Both filters green. 8. Both `cargo check`s clean. 9. C2 §3.5 + C3 §3.4
      amendments. 10. CHANGELOG bullet; commit
      `core+tauri: overlay_laps drives every overlay lap (R73 closed)`.

## Do not

- Do not change `MathOverlay`'s own fields.
- Do not change the validation order (`main_lap`, then `overlay_laps` in order).
- Do not silently keep first-entry behaviour anywhere without a doc comment
  saying why — that is the finding R73 exists to prevent.
- Do not touch `app/src/` (lead-owned).

## Spec discipline

**spec-during.** Amend C2 §3.5 with the multi-overlay semantics, naming any
function that deliberately still uses the first entry and why. Amend C3 §3.4 to
drop the "first entry drives the overlay" wording and the "no session has laps,
so every non-null `lap_context` rejects" sentence. Record R73 as closed with
this commit's hash in the ledger entry the lead maintains — report the text, do
not edit `runs/2026-09-03/decisions.md` yourself.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both test result lines with `passed` counts;
both `cargo check` results; the list of `overlay` consumers and fold-or-first
for each; confirmation of the `Arc::ptr_eq` sharing; every file where the stale
"laps[] is always empty" claim was corrected; the R73-closed ledger text;
anything needing a ruling.

# L3 Task 12 — implementer brief (cursor readout; C3 §3.7)

You are the implementer for L3 Task 12 of the idl1 rewrite — the twelfth
task of the core workbook-v3 lane. TDD, one commit, then report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit of Task 11 (given in the
  dispatch message), status clean. Verify first; if not, stop and report. The
  worktree inherits `.cargo/config.toml` (shared target-dir) — leave it alone.
- Work ONLY there. Do NOT touch `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`
  (shared checkout), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` beyond READING the
  files named below, or any other worktree. Do NOT edit anything under `docs/`. Do NOT push.
- Read first: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\CLAUDE.md`; the L3 plan
  Global Constraints (41–135), `### Task 12` (841–882); contract C3
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\docs\superpowers\specs\2026-09-03-idl1-c3-ipc-surface.md`
  §3.7 (718–746 — **amended, landed** text: clamped nearest-sample, tie resolves early, `null`
  only for a channel with no samples/no time axis, closing open question Q4); the pre-read
  `runs\2026-09-03\lanes\l3-workbook\pre-read-tasks10-16.md`, Task 12 section (G12.1–G12.6,
  L3-R35); ledger `R25` in `runs\2026-09-03\decisions.md` ("Q4 (defaulted): cursor readouts
  clamp"); landed `session/handle.rs` (`nearest_by_t_us`, 955–970 — nearest-sample over `t_us` by
  `partition_point`, clamped at both ends, tie rule `<=` picks `lo` at line 964 — this **is** the
  algorithm, do not re-derive it in `cursor.rs`).

## COMPUTE RULES — non-negotiable
Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not override). Two filters while
working, each non-zero `passed`: `cargo test -p idl-rs cursor` and `cargo test -p idl-rs
session::handle` (L3-R35 refactors a function three landed call sites use — confirm nothing
there broke). No `pub` signature changes reach `idl-rs-cli`, so no `cargo check -p idl-rs-cli
--tests`. No tarpaulin, no `-j`, no `.cargo/` edits, never `cargo fmt`. One cargo process at a
time, foreground.

## The task (plan Task 12, Step 1) with this ruling

The plan's own interface (`cursor_readout(channels: &[(&str, &[i64], &[f64])], t_us: i64) ->
Vec<(String, Option<f64>)>`) and its Open Question 6 ("nearest-sample, coded and tested now")
stand — C3 §3.7 has since been amended to say exactly this (clamped nearest-sample, tie to the
earlier sample), so Open Question 6 is closed by the contract itself, not just a stated default.
What changes is **how** the algorithm gets built: G12.1 flags that `nearest_by_t_us`
(`handle.rs:955`) already *is* this algorithm, tie rule included — re-implementing it in
`cursor.rs` from scratch would put two nearest-sample rules in one crate that can silently
diverge on the tie.

**Ruling — L3-R35.** `session/handle.rs` gains
`pub(crate) fn nearest_at_t_us(samples: &[f64], t_us: &[i64], target_us: i64) -> Option<f64>` —
the existing body of `nearest_by_t_us`, unchanged except it takes `target_us: i64` directly
(no seconds conversion) and returns `None` iff `samples.len().min(t_us.len()) == 0` instead of
`f64::NAN` (G12.2: `NaN` is a legitimate *sample* value everywhere else in this crate —
`decimate_tile_pure`'s whole NaN contract — so emptiness must be decided from length, never from
`is_nan()`). The existing seconds-taking `nearest_by_t_us` becomes a thin wrapper:
`nearest_at_t_us(samples, t_us, (t_secs * 1e6).round() as i64).unwrap_or(f64::NAN)` — **no v2
behaviour moves or changes**; its three landed call sites keep compiling unchanged.
`cursor::cursor_readout` calls `nearest_at_t_us` directly — one nearest-sample rule in the crate.
`handle.rs` is landed L1 code; **this edit is authorised for L3 under ledger R25**, same form as
R23 gave L2 for `parquet.rs`/`synthesis.rs` — edit only `nearest_by_t_us` (to extract
`nearest_at_t_us` and delegate) and add nothing else to that file.

`cursor_readout`'s own doc comment states, per G12.4/G12.6: results are in **request order**; a
duplicate channel id in the input yields two entries and is the caller's problem, not this
function's; L5 folds the returned `Vec` to C3 §3.7's `Record<string, number | null>` and supplies
the `t_us` echo — neither is this function's job; existence-checking an unknown channel is L5's
(C3's `invalid_argument` + `detail.channel`), this function never sees one; design §4's line
listing cursor readouts among heavy-array binary traffic is **superseded by the signed C3 §3.7**
(JSON) — one line stating this so it is not re-opened at review (G12.6).

- [ ] **Step 1: Extract `nearest_at_t_us`, then `cursor_readout`, failing tests first.**
  Tests for `nearest_at_t_us` (in `handle.rs`, alongside the existing `nearest_by_t_us` tests —
  do not duplicate its whole table, just enough to prove the extraction is behaviour-preserving):
  a couple of the existing cases re-expressed in `target_us` terms, plus `empty t_us or empty
  samples — None, not NaN` (G12.2). Tests for `cursor_readout` (`cursor.rs`), the plan's six
  plus two: `t_us exactly matches a recorded sample — that sample's value`; `t_us between two
  samples — the closer one, tie goes to the earlier sample`; `t_us before the first sample —
  clamped to the first sample, not None`; `t_us after the last sample — clamped to the last`;
  `empty channel — None`; `multiple channels, one empty — that one None, others populated in the
  same call`; **required (G12.3, L3-R12's case, missing from the plan's table):** `axis-less
  channel — empty t_us, three non-empty values — None` (`min(t_us.len(), v.len()) == 0`, never
  `is_nan()`); **required:** `NaN sample at the nearest index — Some(NaN), not None` (a NaN
  sample is a real value, not absence — G12.2).

- [ ] **Step 2: Test and commit.** Run both filters (COMPUTE RULES), each non-zero `passed`, `0
  failed`. Commit with explicit paths (NOT `git add -A`): `git add core/src/cursor.rs
  core/src/session/handle.rs core/src/lib.rs` — message `cursor: nearest-sample readout, clamped,
  one algorithm shared with SessionHandle (C3 §3.7)`. Single line, no AI attribution trailer.

## Do not
- Do not re-implement nearest-sample-with-tie-rule logic from scratch in `cursor.rs` — extract
  `nearest_at_t_us` from `handle.rs`'s existing `nearest_by_t_us` and call it; two independent
  implementations of the same rule is exactly the risk G12.1 flags.
- Do not use `is_nan()` to decide "no value" anywhere in `cursor_readout` — emptiness is
  `samples.len().min(t_us.len()) == 0`; a `NaN` sample is `Some(NaN)` (G12.2).
- Do not omit the axis-less-channel test (G12.3) — an empty `t_us` with non-empty values (a
  scalar definition, `{col[]}`, any rate-0 source, per L3-R12) must return `None`, and nothing in
  the plan's original test table exercises it.
- Do not add an unspecified proximity/gap tolerance to the clamp — C3 §3.7 (amended) is explicit:
  unconditional clamping at both ends, `null` only for a channel with zero samples or an empty
  time axis.
- Do not touch anything in `session/handle.rs` beyond extracting `nearest_at_t_us` and having
  `nearest_by_t_us` delegate to it — R25's authorisation is scoped to exactly that edit; the
  three existing call sites must keep compiling with no signature change on their end.

## Style / hygiene
Doc comment on every public/`pub(crate)` symbol, including one on `cursor_readout` stating
request-order/duplicate-id/existence-checking are the caller's (L5's) concern, and one on
`nearest_at_t_us` stating the `None`-vs-`NaN` distinction; units on every numeric value (`t_us`
in µs — state it); typed errors only (none new here — the function is infallible by
construction, `Option` carries absence); A/A/A tests named `thing — condition — result`; match
surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"spec-first" — C3 §3.7's amended text (clamped, tie to earlier, `null` only for no samples/no
axis) is already landed (contract batch 3, ledger R25, closes Q4) before this task starts; you
are coding against signed text.

## Report back (concise)
Commit hash + `git show --stat`; both test commands and result lines (`passed`/`failed` counts);
per-step done/deviated; confirmation `nearest_by_t_us`'s three existing call sites are unchanged
and its own tests still pass; confirmation `nearest_at_t_us` returns `None` (never `NaN`) for an
empty channel and `Some(NaN)` for a NaN sample; confirmation the axis-less-channel test (G12.3)
and the required NaN-sample test are present and named; anything ambiguous you resolved (say how)
or that needs a lead ruling (stop and report instead of guessing — CLAUDE.md §1).

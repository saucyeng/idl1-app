# L3 Task 5 — implementer brief (time model; C1 §8 item 5)

You are the implementer for L3 Task 5 of the idl1 rewrite — the fifth task of
the core workbook-v3 lane, larger than Tasks 1–4 (`math/eval.rs`'s ~2200
lines plus several call sites outside it). TDD, ONE commit at the end, then
report.

## Where
- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
  branch `wave1-l3-workbook`, HEAD must be the commit named in the dispatch
  message (Task 4), status clean. Verify first; if not, stop and report.
  Leave `.cargo/config.toml` alone.
- Work ONLY there. Do NOT touch the shared checkout
  (`C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust`), `idl1-app` beyond
  READING files named below, or any other worktree. Do NOT edit `docs/`. Do
  NOT push.
- **Strike the plan's L1↔L3 agent-team / grep-gate framing entirely (G5.1).**
  L1 already landed on `main` (`Channel.t_us: Vec<i64>`,
  `Channel::from_f64_with_times` both exist). There is no team, nothing to
  grep-gate on. **L3 owns the `SessionHandle` side outright (L3-R11)** — plan
  lines 333–338's "L1's file … if pairing as a team" is stale; ignore it.
- Read first: `CLAUDE.md`; the L3 plan Global Constraints (41–135) and
  `### Task 5` (323–429); pre-read `pre-read-tasks2-5.md`'s Task 5 section
  (G5.1–G5.10, L3-R11–R15, "Task 5 verdict"); ledger `R20` (L3-R11…R15
  approved; **L3-R13 provisional pending Isaac's Q1** — implement it as
  written regardless, a later task corrects DSP step size if he rules so);
  the landed `math/eval.rs` (`LookupChannel` 18–21, `ChannelLookup` trait
  26–73, `MemoLookup` 81–109, `EvalOutput` 196–199, `evaluate` 206–229,
  `require_ref_channel` 542–559, `resolve_time_base` 573–591, lap/sector call
  sites at 908/999), `math/value.rs` (`ChannelValue` 8–21), `table/eval.rs`
  (`CellLookup::lookup` 141–166, rate-0 at 165), `math/resolve.rs` (`store_math`
  call at line 75), `session/handle.rs` (`store_math` 558–568, `lookup`
  908–915), `session/mod.rs` (`Channel::from_f64` 205–223,
  `Channel::from_f64_with_times` 233–250), `store/parquet.rs`
  (`source_kind == "synthesized"` filter, lines 253/271), `math/variance_geom.rs`
  (`ChannelValue{}` rebuilt at 211/278) — this task extends all of these, not
  replaces.

## COMPUTE RULES — non-negotiable
Machine is memory-bound (cargo capped at 2 jobs machine-wide; do not
override). Per L3-R14: per-group runs while working, in order —
`cargo test -p idl-rs math::`, then `table::`, then `estimate::`, then
`session::handle` — each non-zero `passed` (standing rule; a targeted filter
matching nothing is a failed gate). Then, once, at the end: `cargo test -p
idl-rs -p idl-rs-cli -- --test-threads=4`. **Never `cargo test --workspace`**
— plan line 425 says this, it violates R13/R19 (G5.8); ignore it. `cargo
check -p idl-rs-cli --tests` is **mandatory** (three `pub` structs change
shape: `LookupChannel`, `EvalOutput`, `ChannelValue`). No tarpaulin, no `-j`,
no `.cargo/` edits, never `cargo fmt`. One cargo process at a time,
foreground.

## Rulings (lead, R20) — verbatim

**L3-R11.** L3 owns the `SessionHandle` side. Strike plan 333–338's "L1's
file" clause and plan 73–88's agent-team/gate framing from the brief. In this
task: `SessionHandle::lookup` (`handle.rs:908-915`) populates `t_us:
Arc::from(c.t_us.as_slice())`; a new `store_math_with_times(channel_id,
sample_rate_hz, samples, t_us)` wraps `Channel::from_f64_with_times`
(`session/mod.rs:233`) and `math/resolve.rs:75` switches to it, so a derived
math channel keeps its source's real axis. `store_math` stays for the
estimator's eight outputs and tests. Same crate, L1's lane closed — no
cross-lane hop. *Cost if wrong: two call sites.*

**L3-R12.** Empty `t_us` is the "no time axis" marker. Two `Value::Channel`
operands must carry identical `t_us` **only when both are non-empty**; if
either is empty the op proceeds and the result inherits the non-empty axis
(or empty if both are). Rate-0 sources — `CellLookup::lookup`
(`table/eval.rs:165`), `{col[]}` (`eval.rs:284`), scalar results — return
`Arc::from(&[] as &[i64])`, **never** a synthetic axis. This preserves
table-column arithmetic exactly as it behaves today and avoids the
`INFINITY as i64` saturation. No new `slice_by_time_t_us` accessor this task.
Tests: `{col_a[]} - {col_b[]} — both empty t_us — still evaluates`; `channel
with t_us + channel with empty t_us — result carries the non-empty axis`.
*Cost if wrong: one `match` arm.*

**L3-R13.** Nominal-rate arithmetic is out of scope but must stop lying. Do
not rewrite `integrate`/`differentiate`/`butter`/`fft`/`declip`/
`resolve_time_base` this task (a behaviour change to every shipped math
result — see Q1, unresolved). Instead: delete the false sentence in
`eval.rs:577-578` ("Time is the synthesized uniform ramp … the closed form is
exact"), replace with a `// TODO(idl0):` naming `synthesis.rs:64` and the
measured drift, and word `LookupChannel::t_us`'s doc comment so it claims
only what is true: `t_us` traces to recorded time; the DSP functions in this
file still assume uniform `1/nominal_rate_hz` spacing and are a tracked
follow-up. *Cost if wrong: a comment; the numbers already are what they are.*

**L3-R14.** Test scope per R13/R19: per-group runs while working, then one
end-of-task `-p idl-rs -p idl-rs-cli -- --test-threads=4` run. Never
`--workspace`. `cargo check -p idl-rs-cli --tests` mandatory. *Cost if wrong:
none; strictly less load than the plan.*

**L3-R15.** `ChannelLookup::sample_times` stays unchanged this task (already
`t_us`-backed at `handle.rs:335-344`, one consumer at `estimate/run.rs:110`);
its doc comment gains one line saying it is a seconds view of `t_us`, kept
for the estimator, and that new code reads `LookupChannel.t_us` instead.
`MathLapContext`'s seconds units get the same one-line restatement. *Cost if
wrong: two comments.*

## The task (plan Task 5, Steps 1–4, corrected)

**Step 0 (not in the plan — required by L3-R11/G5.2).** Wire the store side
first: `store_math_with_times` beside `store_math` (`handle.rs:558-568`),
calling `Channel::from_f64_with_times(channel_id, sample_rate_hz, samples,
t_us, "synthesized")`. **`"synthesized"` is not optional** —
`store/parquet.rs:253,271` excludes channels by `source_kind == "synthesized"`
from `data.parquet` (C1 §4.1); `store_math` gets this for free via
`Channel::from_f64`'s hardcoded value, but `from_f64_with_times` takes
`source_kind` explicitly — anything else leaks derived channels into
`data.parquet`. Switch `math/resolve.rs:75` to call the new function with
`out.t_us`. Add `t_us: Arc::from(c.t_us.as_slice())` to `handle.rs:908-915`'s
`LookupChannel { }` literal. Test: a channel stored via
`store_math_with_times` then looked up again returns the **same** `t_us` it
was given, not a synthesized `i/rate` ramp (this is G5.2's round-trip fix —
today's `store_math` + `Channel::from_f64` path discards the real axis).

- [ ] **Step 1: extend the three structs, failing compile first.** Per
  G5.9: `LookupChannel.t_us` and `ChannelValue.t_us` are `Arc<[i64]>`
  (matches their `samples: Arc<[f64]>` sharing discipline — `MemoLookup`'s
  cache clone must clone the `Arc`, never re-copy the data); `EvalOutput.t_us`
  is `Vec<i64>` (owned top-level return, not a shared intermediate). Sizing:
  19 `channel(...)` helper calls + 7 direct `ChannelValue {}` in `eval.rs`, 2
  in `variance_geom.rs`, 2 in `vector.rs`, 3 `require_ref_channel` call
  sites, 5 `LookupChannel {}` constructors outside `eval.rs`
  (`session/handle.rs`, `table/eval.rs`, `estimate/run.rs`,
  `math/tests_ahrs.rs`, `math/tests_parity.rs`), ~19 in `eval.rs`'s own test
  doubles. A test double with no natural axis gets an explicit synthetic
  rate consistent with its declared `sample_rate_hz`
  (`(0..len).map(|i| (i as f64 * 1_000_000.0 / synthetic_rate_hz) as i64)`)
  — a raw index relabeled as µs is wrong. `require_ref_channel`
  (`eval.rs:542-559`) becomes a 4-tuple carrying `t_us` through (G5.7); its 3
  call sites in `variance_geom.rs:211,278` rebuild `ChannelValue{}` and must
  include the propagated `t_us` (the *main* channel's axis — the result
  aligns to `main_samples`), not a fabricated one.

- [ ] **Step 2: elementwise/binary op propagation rule.** Apply L3-R12 to
  the binary-op dispatch; `Value::Channel op Value::Scalar` keeps the channel
  operand's `t_us` unchanged. Every unary/aggregate function that returns a
  channel (`butter`, `declip`, `integrate`, `differentiate`, `detrend`,
  rolling `rms`/`mean`/`std`, elementwise `abs`/`sqrt`/…, `clamp`, trig)
  passes its input's `t_us` through unchanged — only `resample` (still
  `NotImplemented`) would need a new axis. Rate-0 sources get
  `Arc::from(&[] as &[i64])` per L3-R12. Apply L3-R13's two doc fixes in this
  step, since it's where the propagation rule's real behaviour and the doc
  comment's claims must agree. Work function-group by function-group
  (elementwise, then filters/reconstruction, then aggregates/scalars) for
  your own compile/test discipline — not a commit boundary, see Step 4.
  Tests (add alongside existing ones): `add — two channels with identical
  t_us — result carries the same t_us`; `add — two channels with different
  t_us — Runtime error naming both`; `differentiate — output t_us equals
  input t_us`; `scalar aggregate (rms with no window) — t_us is empty`; plus
  L3-R12's two tests above.

- [ ] **Step 3: `evaluate()` return wiring.** `evaluate()` (`eval.rs:206-229`,
  the `Value::Channel(c) => …` arm at line 217) returns `EvalOutput.t_us` as
  `c.t_us.to_vec()`, or `Vec::new()` for `Value::Scalar`. Test:
  `evaluate("[X] * 2", …) — t_us matches [X]'s t_us exactly`.

- [ ] **Step 4: test and commit (ignore plan line 425's `--workspace`).**
  Run the per-group filters, then the one end-of-task `-p idl-rs -p
  idl-rs-cli -- --test-threads=4` run, then `cargo check -p idl-rs-cli
  --tests` — all per COMPUTE RULES. Commit with explicit paths (NOT `git add
  -A`) — list every file actually touched (expect at least
  `core/src/math/eval.rs core/src/math/value.rs core/src/math/resolve.rs
  core/src/session/handle.rs core/src/math/variance_geom.rs
  core/src/math/vector.rs core/src/table/eval.rs`, plus any Step 1
  test-double file) — message `math: per-sample t_us on
  LookupChannel/ChannelValue/EvalOutput (C1 §8 item 5); derived channels keep
  their source axis`. Single line, no AI attribution trailer.

## Do not
- Do not synthesize a `t_us` axis for rate-0/table/`{col[]}` sources (the
  plan's `INFINITY as i64` formula, lines 380-384) — empty is the marker.
- Do not run `cargo test --workspace` — `--test-threads=4` over `-p idl-rs -p
  idl-rs-cli` only.
- Do not clone the `Vec` inside an `Arc<[i64]>` per lookup anywhere (memo
  cache, overlay reference, the round trip) — clone the `Arc`.
- Do not commit after each function-group as plan lines 409-412 suggest —
  work group-by-group, but produce **one** commit at the end.
- Do not wait for or reference an "L1 implementer" or agent team (G5.1) —
  there is none; you own this end to end.

## Style / hygiene
Doc comment on every public symbol; units on every numeric value (`t_us` in
µs, `sample_rate_hz` in Hz — state it, exactly the class of bug C1 §8 item 5
exists to prevent); typed errors only; A/A/A tests named `thing — condition —
result`; match surrounding hand-formatted style.

## Spec discipline (say it out loud in your report)
"spec-during" — this task's doc comments on `LookupChannel::t_us` /
`ChannelValue::t_us` / `EvalOutput::t_us` **are** the C1 §8 item 5 resolution.
State that it's exactly what the pre-read's "Task 5 verdict" confirmed: no
bare `t` primary in the grammar; `Time` is a real seconds channel; the only
unit collision is at the JS host-variable boundary, converted once in Task
8's `to_host_channel` — not this task's concern, do not touch it.

## Report back (concise)
Commit hash + `git show --stat`; every test command and result line
(per-group filters + the final run, each with `passed` count) and the `cargo
check -p idl-rs-cli --tests` result; per-step done/deviated, including Step
0; confirmation `store_math_with_times` passes `"synthesized"` and the
round-trip test proves the real axis survives; confirmation of the
`require_ref_channel` 4-tuple and that `variance_geom.rs`'s existing tests
still pass unchanged; confirmation `LookupChannel::t_us`'s doc comment states
the C1 §8 item 5 resolution; note L3-R13/Q1 is still provisional pending
Isaac — this task lands the axis either way; anything ambiguous you resolved
(say how) or that needs a lead ruling (stop and report instead of guessing —
CLAUDE.md §1).

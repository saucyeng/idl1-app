# L3 Task 15 review — done-criteria proofs: evaluator parity and tile-vs-decimation

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l3-workbook`,
branch `wave1-l3-workbook`. Commit under review: `60a6c98` (diff against parent
`039df03`, one commit). In scope: `core/src/workbook/v3/tests_pipeline.rs` (new,
161 lines) and `core/src/workbook/v3/mod.rs` (+3 lines, module registration).
Worktree was clean at `60a6c98` at review time; nothing out of scope present.

This is the lane's Done-when (1) evidence per ruling R36 — reviewed accordingly,
not as an ordinary test-addition task.

## Test command and result

```
cargo test -p idl-rs workbook::v3::tests_pipeline
```

```
running 2 tests
test workbook::v3::tests_pipeline::tile_built_from_an_evaluated_math_cell_matches_decimate_channel_directly ... ok
test workbook::v3::tests_pipeline::workbook_v3_pipeline_values_match_a_direct_evaluate_bit_for_bit ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 845 filtered out; finished in 0.00s
```

Run exactly once, foreground, no other cargo process concurrent. 2 passed, 0
failed — reproduces the implementer's reported result and satisfies the
non-zero-`passed` gate (L3-R8/ledger R20).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| — | — | No Critical or Important findings. | — |

No Minor findings either — the file is small, single-purpose, and matches its
brief closely enough that there is nothing left to flag as style/documentation
drift.

## Checks performed (all pass)

**(a) Does the parity test discriminate?**
- Traced Path A's real call chain: `parse_workbook` → `eval_cells`
  (`core/src/workbook/v3/eval.rs:95`) → `resolve_workbook_defs`
  (`core/src/workbook/v3/resolve.rs:104`), which does a genuine deps-first
  fixed-point resolution through an `OverlayLookup` (definitions win over
  session channels, L3-R18a) — not a passthrough to the bare evaluator.
- Path B calls `evaluate_with_constants` directly against the bare
  `SessionHandle`, with `[a]` **textually inlined** into `b`'s expression
  (`"([ChanA] * 2) + 1"`), so it never touches `resolve_workbook_defs` — a
  genuinely independent computation, not "compared to itself."
- Constructed and checked each named failure mode:
  - *dropped a definition* — caught by `assert_eq!(defs.len(), 4)` before any
    per-definition comparison runs.
  - *evaluated in the wrong order* — `b` depends on `a`; if the pipeline's
    fixed-point pass evaluated `b` before `a` was ready (or against a stale
    value), `b`'s samples would diverge from the independently-inlined
    `direct_b`, caught bit-for-bit.
  - *silently substituted a default* — for `c` (the constants case), a bug
    reading `rider_mass_kg` as 0 or omitted would produce a value mismatch
    against `direct_c`, which hardcodes the same constant from the fixture's
    front matter independently.
  - *compared a value to itself* — ruled out; Path A and Path B are different
    functions (`resolve_workbook_defs`'s memoized fixed-point pass vs. a
    single `evaluate_with_constants` call), confirmed by reading both.
  - A resolver bug that let `b`'s lookup silently fall through to a base
    session channel (rather than erroring) would surface as `UnknownChannel`
    (no channel named `a` exists on the synthetic session), which the test's
    `unwrap_or_else(|| panic!(...))` on `value` would catch as a panic, not a
    silent pass.
- Given R36(ii)'s scope (routing, not re-proving the evaluator — that's
  `math/tests_parity.rs`, R36(i)) and L3-R41's four-case list, two tests
  covering plain arithmetic / cross-reference / constant / scalar is adequate
  coverage for the claim being made, not an under-tested gate.

**(b) The `t_us` round-trip (Step 2).**
- `to_host_channel` (`core/src/workbook/v3/host.rs:52-54`) computes
  `t = t_us as f64 / 1e6` — the one conversion site, confirmed by reading it.
- Step 1's `t[i] == direct.t_us[i] as f64 / 1e6` assertion applies the same
  deterministic `i64 → f64` division formula to two independently-produced
  `t_us` arrays that should be numerically identical; not a round-trip
  in that test, so no lossiness question there.
- Step 2's reconstruction (`a.t.iter().map(|&s| (s * 1e6).round() as i64)`)
  **is** a genuine round-trip. Verified numerically for every `t_us` value in
  the fixture (0, 9000, 18000, 21000, 34000, 41000, 50000 µs): each survives
  `/1e6` then `*1e6` then `.round()` exactly, confirming losslessness over
  this fixture's range (µs magnitudes here are small enough that f64's
  relative error is far under the 0.5 rounding threshold).
- More importantly: it doesn't matter either way for this test's outcome.
  `decimate_channel` (`chart_decimation.rs:66`) and `column_stats` take only
  `samples`, never `t_us`; `build_tile_bytes`'s sample region is built from
  `decimate_channel(samples, ...)` alone. Step 2 asserts **only** the sample
  region against `decimate_channel` called directly — it never decodes or
  checks the column-time region that `a_t_us` actually feeds. A future
  precision loss in the reconstruction (larger session timestamps, e.g.) would
  not surface as a flake in this test; it also can't be hidden by this test,
  since nothing here depends on it. Column-time-region correctness is Task
  10's own cross-check (`tile.rs`'s own tests), not re-owned here, as the
  brief said it shouldn't be.

**(c) `column_count = 4` — "arbitrary but valid."**
- Read `build_tile_bytes` (`core/src/tile.rs:26-71`): the sample region
  always starts at the fixed 32-byte header offset and its size depends only
  on `sample_count` (from `decimate_channel`, tier/tile_index-only). The
  column region and column-time region come *after* the sample region and
  are sized by `column_count`, but the test never reads past the sample
  region. `column_count` genuinely has zero effect on what's asserted; `4`
  isn't a value the assertion happens to tolerate, it's actually irrelevant.

**(d) `t.len() ∈ {0, length}`, scalar `avg` the only 0 case.**
- Confirmed `mean(...)` (`math/eval.rs:885-888`) returns `Value::Scalar`, and
  scalar → `EvalOutput { samples: vec![v], sample_rate_hz: 0.0, t_us: Vec::new() }`
  (`math/eval.rs:265`) — empty `t_us`, hence `to_host_channel` produces
  `t: []`. Defs `a`/`b`/`c` are elementwise arithmetic over `ChanA`,
  preserving its full non-uniform `t_us` (length 5) through the pipeline —
  confirmed by the fixture's explicit non-uniform `t_us` arrays (`[0, 9000,
  21000, 34000, 50000]` / `[0, 18000, 41000]`) and by the test's own passing
  per-index `t[i]` comparison, which would fail immediately on a synthesized
  uniform axis.

**(e) No migration symbols; no `g` constant in the fixture.**
- `grep`'d the whole file for `migrate_workbook_text`, `MigrationReport`,
  `identifier_by_v2_id`, `_migrate_math` — none present (R30 honored).
- `WORKBOOK_MD`'s front-matter `constants:` block declares only
  `rider_mass_kg: 82` — no `g`, consistent with R37 (which reserves `g` as a
  universal constant, not a user-definable one).

**Signatures / landed code cross-checked against usage:**
- `CellDefResult { name, label, value: Option<HostChannel>, error }` and
  `CellEvalResult { cell_id, kind, defs, errors }` (`workbook/v3/eval.rs:31-85`)
  match the brief's G15.2 correction (`defs[i].value`, not `host_value`) —
  confirmed by reading `eval.rs`, not the implementer's report.
- `eval_cells(doc, structural, lookup, lap_ctx) -> Vec<CellEvalResult>`
  (`eval.rs:95`) matches the call site exactly.
- `build_tile_bytes(samples, t_us, tier, tile_index, column_count)` and the
  32-byte header / interleaved-f32-pairs sample region match `tile.rs` as
  landed; the test's hardcoded `sample_off = 32` and header field offsets
  mirror `tile.rs`'s own in-module decode helper (`tile.rs:83-84`) — `tile.rs`
  exports no offset constants to import, so hand-matching its own decoder is
  the available option, not a shortcut around the brief's "don't hardcode"
  instruction.
- `SessionHandle::from_channels`/`ChannelInput`/`SessionMetaInput` used per
  their documented shapes (`handle.rs:65-91,243`).

**Hygiene / CLAUDE.md checks:**
- Single-line commit message, byte-identical to the brief's mandated message,
  no AI attribution trailer.
- `git show --stat` shows exactly the two files the brief named — no stray
  `git add -A` pickup.
- Arrange/Act/Assert with blank lines between, in both tests.
- Test fn names match the brief's mandated names exactly; doc comments carry
  the `thing — condition — result` A/A/A phrasing.
- No `cargo fmt` churn — diff is additive only (mod.rs: +3 lines at one
  insertion point; new file otherwise).
- No `docs/` touched; shared checkout and other worktrees untouched (not
  examined by this task, no evidence of touching them in the diff).
- No `pub` signature changed or added by this task (test-only file, private
  `mod`), so no `cargo check -p idl-rs-cli --tests` obligation applies.

## Verdict rationale

The test file does the job R36 assigns it: Path A exercises the real
`parse_workbook → eval_cells → resolve_workbook_defs` pipeline (a genuine
deps-first, constants-aware, overlay-lookup resolution — not a thin
passthrough), Path B is an independently-computed value via direct
`evaluate_with_constants` calls with cross-references hand-inlined, and I was
able to construct every failure mode the dispatch asked about (dropped
definition, wrong evaluation order, silently substituted default, comparing a
value to itself) and confirm the test would catch each one by reading the
actual resolution code, not by trusting the implementer's report. The `t_us`
round-trip in Step 2 is lossless over this fixture and, more to the point,
provably irrelevant to what Step 2 actually asserts (sample region only,
never the column-time region the reconstructed array feeds) — so there's no
hidden flake risk and nothing here to fix. `column_count = 4` is confirmed to
have zero bearing on the sample-region assertion by reading `build_tile_bytes`'s
own offset arithmetic. Hygiene, naming, and signatures all check out against
the landed code. This is a clean, faithful implementation of a provisional
brief that R36 has since made final.

VERDICT: CLEAN

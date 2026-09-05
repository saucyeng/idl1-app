# L8w Task 12 — implementer brief (`fetch_fft`, `IDLF` encoder, C3 §3.6, R63 — spec-during)

You are the implementer for L8w Task 12: extend `idl_rs::fft::Averaging`
with `None`/`Max` (ruling R63 (3)), a thin wrapper over `idl_rs::fft::welch`
producing `(bin_count, sample_rate_hz, magnitudes)`, the `IDLF` byte
encoder, and the `fetch_fft` command. **This task is spec-during**: amend
C3 §3.6's `averaging` union note to match the extended enum in the same
change. TDD, ONE commit, then report.

## GATE — same as every L8w task; verify before opening the worktree

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
grep -c "pub fn import_file" rust/tauri/src/commands/import.rs
grep -c "ImportCollision\|import_collision" rust/tauri/src/error.rs
```
Both must return `>= 1`. If either fails, STOP and report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave2-l8w-write-amendment`
  (rust) for everything except the C3 doc edit.
- **C3 edit** goes in the **idl1-app worktree**:
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l8w-write-amendment`
  — the only file this task touches under `docs/`:
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`. This is the one
  exception to this lane's usual "no spec change needed" rule, per ruling
  R63 (3) ("amend C3's `fetch_fft` averaging union... Task 12,
  spec-during").
- Do NOT push either worktree.
- **Files:** modify `rust/core/src/fft.rs`; create a small core wrapper
  (e.g. `rust/core/src/fft_wire.rs`, or extend `rust/core/src/raster.rs`
  alongside its existing `IDLT`/`IDLR`-style encoders — implementer's call,
  match whichever module already owns the analogous binary-encoder
  pattern); modify `rust/tauri/src/commands/rasters.rs`, `rust/tauri/src/lib.rs`;
  modify `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` (app
  worktree, C3 §3.6's `fetch_fft` entry only).

- Read first: `CLAUDE.md`; plan Task 12 in full and its "Lead rulings
  2026-09-05 (R63)" section
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l8w-write-amendment.md`);
  ruling R63 in `runs/2026-09-03/decisions.md` ("(3) extend
  `idl_rs::fft::Averaging` with `None` and `Max`... Task 12, spec-during");
  C3 §3.6's `fetch_fft` entry (quoted below); the landed `rust/core/src/fft.rs`
  **in full** — `Averaging::{Mean, Median}`, `welch`'s reduction `match
  averaging { ... }` (lines ~297–312), `resolve_seg` (governs what "no
  averaging" means: `nperseg: 0` or `>= data.len()` already yields one
  full-record segment, i.e. `n_segs == 1`, so a `None` "averaging" mode's
  reduction arm is trivial — a single segment's own power, no fold needed —
  confirm this by reading `resolve_seg`/`stft` yourself, don't assume);
  `rust/tauri/src/commands/rasters.rs`'s `fetch_raster`/`fetch_raster_meta`,
  `WindowToken`/`DetrendToken`/`ScalingToken` (the exact
  snake-case-wire-token `From` impl pattern this task's own `averaging`
  string argument follows) — this file is where `fetch_fft` lives (C3
  places it in "Rasters and DSP", alongside `fetch_raster`); Task 9's
  `session_source::load_lap_context` (if a lap-bounds lookup from that task
  is available on the branch, reuse it to window samples to one lap before
  FFT-ing; if Task 9 hasn't landed on the worktree yet, implement the same
  "non-null `lap` always rejects `invalid_argument` today" honest-natural
  gate directly here, matching Task 9's own pattern, and note the
  duplication in your report for the lead to reconcile once Task 9 lands).

## COMPUTE RULES — non-negotiable

Machine is memory-bound (cargo capped at 2 jobs machine-wide; never override
with `-j`). While working: `cargo test -p idl-rs encode_fft_idlf` (core) and
`cargo test -p idl-rs-tauri fetch_fft_via` (tauri),
foreground, each non-zero `passed`. No `cargo fmt`, no `cargo tarpaulin`, no
`cargo doc`. One cargo process at a time.

**`pub`-change check:** `cargo check -p idl-rs-cli --tests` (new `Averaging`
variants, new `pub` wrapper/encoder) **and** `cargo check -p idl-rs-tauri`.

## R63 (3) — extend the enum, then amend C3, in that order

1. Add `Averaging::None` (single-segment, no cross-segment fold — see the
   `resolve_seg`/`stft` reading above: with `nperseg: 0`, `stft` already
   produces exactly one segment, so `Averaging::None`'s reduction arm is
   simply "take that one segment's own power," not a special code path
   through `stft` itself) and `Averaging::Max` (`*slot = seg_powers.iter()
   .map(|p| p[k]).fold(f64::NEG_INFINITY, f64::max)`, parallel to the
   existing `Mean`/`Median` arms) to `fft.rs`'s `welch` reduction `match`.
   Add doc comments to both new variants matching the existing two's style.
2. Add a unit test for each new variant, composed the same way `fft.rs`'s
   own tests already exercise `Mean`/`Median` (a synthetic signal with a
   known per-segment power pattern where `Max` and `Mean` diverge
   measurably — e.g. one segment with an injected spike).
3. **Then**, in the app worktree, amend C3 §3.6's `fetch_fft` text: replace
   the paragraph starting "*note the mismatch already present in C3's own
   text*..." (the one calling out the enum/union gap) with a short note
   that the gap is closed — `Averaging` now has all four variants,
   `"none"`/`"max"` map directly, no `invalid_argument` rejection needed for
   them. Add a dated revision note under this section per C3 §5's
   versioning convention (`- 2026-09-05: fetch_fft's averaging union closed
   against idl_rs::fft::Averaging (ruling R63 (3), L8w Task 12) — "none" and
   "max" now implemented, not rejected.`). Do not touch any other part of
   C3.

## C3 §3.6 (quoted — before this task's amendment)

> **`fetch_fft(session_id: string, channel: string, lap: number | null,
> params: SpectrogramParams, averaging: "none" | "mean" | "max" | "median")`**
> `params` reuses `SpectrogramParams` verbatim. Returns raw bytes via
> `tauri::ipc::Response`.
>
> **Binary layout `IDLF`, version 1.** Little-endian throughout.
>
> | Field | Type | Byte offset | Notes |
> |---|---|---|---|
> | `magic` | `[u8; 4]` | 0 | ASCII `"IDLF"` |
> | `version` | `u16` | 4 | `1` |
> | `reserved` | `[u8; 2]` | 6 | zero-filled |
> | `bin_count` | `u32` | 8 | number of `f32` magnitudes that follow |
> | `sample_rate_hz` | `f32` | 12 | the channel's real rate, derived from its recorded `t_us` axis |
>
> Header ends at byte offset **16**, padded so the magnitude array starts
> on a 4-byte boundary; magnitudes are `bin_count` × `f32` from offset 16.
> Total `16 + bin_count*4`. Bin `k`'s frequency is `k * sample_rate_hz / (2 *
> bin_count)`, derived frontend-side — no second array crosses.
>
> Errors: `not_found`, `invalid_argument` (bad `params`, or a `lap` not
> present on the session), `io`, `internal`. `lap` must be `null` in
> practice until lap indexing lands.

## Interfaces

```rust
// core/src/fft.rs — extended
pub enum Averaging { Mean, Median, None, Max }

// new small wrapper module
/// `IDLF` v1 byte encoder (C3 §3.6). `values` are cast `f64 -> f32` — a
/// deliberate wire-precision drop per C3, `welch`'s own output stays `f64`.
pub fn encode_fft_idlf(values: &[f64], sample_rate_hz: f64) -> Vec<u8>;
// (freqs_hz is not encoded — the frontend derives frequency from
// sample_rate_hz + bin_count per C3's own text; do not add a freqs field.)

// tauri/src/commands/rasters.rs
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AveragingToken { None, Mean, Median, Max }
impl From<AveragingToken> for idl_rs::fft::Averaging { /* direct map, all four */ }

#[tauri::command]
pub fn fetch_fft(
    data_dir: tauri::State<'_, DataDir>,
    session_id: String,
    channel: String,
    lap: Option<u32>,
    params: SpectrogramParams,
    averaging: AveragingToken,
) -> Result<tauri::ipc::Response, IpcError>;
```
`SpectrogramParams` is `rasters.rs`'s existing struct — reuse it, do not
redefine.

## Key logic

- `lap: Some(n)` always rejects `invalid_argument` today (lap indexing
  hasn't landed) — same honest-natural gate as Task 9, reused or
  duplicated per the "Read first" note above.
- Load the channel's samples via `session_source::load_session`, resolve
  `sample_rate_hz` from the channel's **recorded `t_us` axis** (C3's own
  wording), not its `nominal_rate_hz` metadata field (C1 §3.5: "metadata
  only — never used to synthesize time"). **No existing "effective rate
  from t_us" helper was found in `core/src/session/`** as of this brief's
  writing (`grep -rn "effective_rate\|derive.*rate" core/src/session` —
  no hits) — check again yourself before writing a new one (a
  cursor/estimator module might have one this search missed); if none
  exists, compute it directly in this wrapper as `1e6 / median(diff(t_us))`
  (median of consecutive-sample gaps, microseconds, inverted to Hz) and
  document that as this task's own derivation, not a call into a
  pre-existing helper.
- Call `idl_rs::fft::welch(samples, sample_rate_hz, window, window_size,
  window_size - hop_size /* noverlap, per rasters.rs's existing
  noverlap-from-hop_size conversion at core/src/raster.rs:64-66 */, detrend,
  averaging, scaling)`.
- `encode_fft_idlf(&result.values, sample_rate_hz)` — `bin_count =
  result.values.len() as u32`.
- `not_found`: unknown `session_id` or `channel`. `invalid_argument`: bad
  `params` (reuse whatever validation `fetch_raster`'s `SpectrogramParams`
  handling already does, if any) or a non-null `lap`.

## Tests

**Core** (`fft.rs`):
- `Averaging::None` on a multi-segment signal produces the same result as
  a single-segment (`nperseg: 0`) `Averaging::Mean` call (both reduce to
  "one segment, no fold") — a parity assertion between the two, proving
  `None`'s reduction path is correct without needing a second
  independently-derived expected value.
- `Averaging::Max` on a signal with one spiked segment picks that segment's
  per-bin power over the others — assert at least one bin where `Max !=
  Mean` and `Max` equals the spiked segment's own value at that bin.

**Core** (encoder module):
- `encode_fft_idlf` round-trips: known `values`/`sample_rate_hz` → encode →
  manual byte-offset decode → match (header exactly 16 bytes, `bin_count`
  correct, each magnitude an `f32` of the `f64` input, `sample_rate_hz` an
  `f32` of the input).
- A known sinusoid's peak bin matches, composed through the new wrapper —
  reuse `fft.rs`'s own
  `fft_sinusoid_at_known_frequency_peaks_at_correct_bin`-style pattern.

**Tauri**:
- `lap: Some(n)` → `invalid_argument` regardless of `n`.
- Unknown `session_id`/`channel` → `not_found`.
- `averaging: "none"`/`"max"` succeed (no longer rejected) — the whole
  point of R63 (3).
- Malformed `params` → `invalid_argument` (whatever check `fetch_raster`
  already applies, exercised here too).

## The task, in order

- [ ] **Step 1: Confirm the gate**, open/reuse both worktrees.
- [ ] **Step 2: Extend `Averaging`** in `fft.rs`, write its two new tests
      first (TDD), implement the reduction arms.
- [ ] **Step 3: Write failing encoder tests**, implement `encode_fft_idlf`.
- [ ] **Step 4: Write failing tauri tests**, implement `fetch_fft`/`_via`.
- [ ] **Step 5: Register** in `lib.rs`'s `handler()`.
- [ ] **Step 6: Test** — both filters, confirm non-zero `passed` each.
- [ ] **Step 7: `cargo check -p idl-rs-cli --tests` and `cargo check -p
      idl-rs-tauri`**, both clean.
- [ ] **Step 8: Commit, rust worktree** — explicit paths — message
      `core+tauri: fetch_fft, IDLF v1 encoder, Averaging::{None,Max} (C3 3.6, R63)`.
- [ ] **Step 9: Amend C3 §3.6** in the app worktree (the one file named
      above), with the dated revision note.
- [ ] **Step 10: Commit, app worktree** — `git add
      docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` — message
      `docs: C3 3.6 fetch_fft averaging union closed against Averaging::{None,Max} (R63 3)`.

## Do not

- Do not reject `"none"`/`"max"` — that was the plan's *fallback* pending a
  ruling; R63 already rules to extend the enum instead.
- Do not encode a `freqs_hz` array — the frontend derives frequency from
  `sample_rate_hz`/`bin_count` per C3's own text.
- Do not touch any other section of C3 besides `fetch_fft`'s own entry and
  its dated revision note.
- Do not run `cargo test -p idl-rs -p idl-rs-cli`, `--workspace`, or a bare
  `cargo test`.

## Style / hygiene

Doc comment on every public symbol, units on numeric values (`sample_rate_hz`:
Hz); A/A/A tests named `thing — condition — result`; no `cargo fmt` in
either worktree.

## Spec discipline (say it out loud in your report)

"Spec-during" — this task amends C3 §3.6 in the same change that implements
it, per ruling R63 (3)'s explicit instruction. This is the one C3-touching
task in the lane.

## Report back (concise)

Both commit hashes + `git show --stat` for each; both test-filter results
with `passed` counts; both `cargo check` results; the `sample_rate_hz`
derivation you used (confirm no existing helper was found, or name it if
you did find one after all); whether Task 9's `session_source` lap-gate
helper was available/reused or duplicated; the exact C3 diff you made
(paste it); anything else ambiguous you resolved (say how) or that needs a
lead ruling (stop and report instead of guessing — CLAUDE.md §1).

## Lead correction 2026-09-05 -- test filter

`cargo test` filters are substrings of the full test path and this crate nests tests under `commands::<module>::tests::`, so `commands::<module>::<fn>` matches nothing. The filter above was corrected to the test-fn prefix (`<fn>_via`); name your tests `<fn>_via_...` so it matches, and report the count (a filter matching nothing is a failed gate).

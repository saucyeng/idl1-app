# L2b Task 6 — implementer brief (`fetch_fft` gets a real `lap`)

`fetch_fft` currently rejects every non-null `lap` unconditionally, because
`session.json.laps[]` was always empty. It no longer is. You add the shared lap
window resolver and delete the rejection. TDD, ONE commit, then report.

**Depends on Task 5.**

## GATE

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l2b-laps"
git merge-base --is-ancestor c893ba7 HEAD && echo GATE-OK
grep -c "reject_non_null_lap" tauri/src/commands/rasters.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` Q7; `tauri/src/commands/rasters.rs` —
`reject_non_null_lap`'s **doc comment in full**: it already diagnoses the
problem and proposes this exact fix ("likely by widening `load_lap_context`
(or a new sibling) to also serve a single-lap sample-window lookup"), and it
records that C3 §3.6's own wording is "always" reject. Also
`tauri/src/session_source.rs` in full — `load_lap_context`, `unknown_lap`, and
how it reads `session.json`; `core/core/src/session/handle.rs`'s `slice_by_time`
and `channel_sample_times`; C3 §3.6's `fetch_fft` entry; ruling R76
(`averaging: "none"` means exactly one segment; rate derivation lives in core);
`core/src/fft.rs`'s `check_none_averaging_segments`.

## Where

- Same worktree/branch. Do NOT push.
- **Files:** `tauri/src/session_source.rs`, `tauri/src/commands/rasters.rs`,
  `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`.

## Interfaces

```rust
/// Resolves one lap number to its recording-time window, seconds, from
/// `session.json`'s `laps[]`. Shares `unknown_lap`'s error shape with
/// [`load_lap_context`] so a bad lap number reports identically wherever it
/// is named (C3 §3.4's `invalid_argument` + `detail: { "lap": n }`).
pub fn resolve_lap_window(
    data_root: &Path,
    session_id: &str,
    lap: u32,
) -> Result<(f64, f64), IpcError>;
```

## Key logic

- `resolve_lap_window` reads `session.json` the same way `load_lap_context`
  does, finds the lap by `lap_number`, and returns
  `(start_time_secs, end_time_secs)`. Unknown number → `unknown_lap(lap)`.
  A missing `session.json` → the same `not_found` mapping `load_lap_context`
  already uses; do not invent a second mapping.
- In `fetch_fft`, replace `reject_non_null_lap(lap)?` with: when `lap` is
  `Some(n)`, resolve the window and take the samples for that window instead of
  the whole channel. Use `SessionHandle::slice_by_time(channel_id, t0, t1)` —
  it is the landed slicing primitive and works in the same recording-time
  seconds `LapJson::start_time_secs` carries (IDL0_SPEC §17.7: the engine
  computes those seconds precisely so consumers read them rather than convert).
- **Ordering matters:** slice first, then run
  `check_none_averaging_segments(&averaging, window_size, noverlap, samples.len())`
  against the *sliced* length. A lap shorter than one FFT window must fail R76's
  check with its existing error, not silently pad or fall back to the whole
  channel. Do not add a new error kind for it.
- Delete `reject_non_null_lap` and its doc comment entirely; nothing else calls
  it (verify with grep before deleting, and say so in your report).
- Check whether `fetch_raster`/spectrogram take a `lap` in C3 §3.6. If they do
  and it is likewise stubbed, **do not** widen scope — report it for a follow-on
  task.

## Tests

Extend `commands/rasters.rs`'s existing test module and its fixture idiom.

- `fetch_fft` with `lap: Some(2)` against a `session.json` with three laps →
  succeeds, and the spectrum differs from the whole-channel result (assert on a
  length or bin count that the shorter window changes, not on float equality).
- `fetch_fft` with `lap: Some(99)` → `invalid_argument`, `detail: {"lap": 99}`.
- `fetch_fft` with `lap: None` → byte-identical to the pre-change result.
- `fetch_fft` with a lap window shorter than one FFT window under
  `averaging: "none"` → R76's existing error, unchanged.
- `resolve_lap_window` unit tests: known lap → its two seconds values; unknown
  lap → `unknown_lap`; missing `session.json` → the `load_lap_context` mapping.

## COMPUTE RULES

`cargo test -p idl-rs-tauri commands::rasters::` and
`cargo test -p idl-rs-tauri session_source::` — foreground, non-zero `passed`.
`cargo check -p idl-rs-tauri`. No core `pub` changes expected; if you need one,
STOP and report. No `cargo fmt`, no `--workspace`.

## Steps

- [ ] 1. Gate. 2. Failing tests. 3. `resolve_lap_window`. 4. `fetch_fft` rewire
      + delete `reject_non_null_lap`. 5. Both filters green.
      6. `cargo check -p idl-rs-tauri` clean. 7. C3 §3.6 amendment.
      8. CHANGELOG bullet; commit
      `tauri: fetch_fft accepts a real lap window (C3 3.6, R76 preserved)`.

## Do not

- Do not duplicate `load_lap_context`'s session.json reading — share the helper
  or extract a common one; two divergent readers is the bug this task exists to
  avoid.
- Do not add a new `IpcErrorKind`.
- Do not change `check_none_averaging_segments` or anything in `core::fft`.
- Do not widen scope to `fetch_raster`.

## Spec discipline

**spec-during.** In C3 §3.6, delete the "`lap` must be `null` in practice until
lap indexing lands" sentence and replace it with the real semantics: `lap`
selects that lap's recording-time window from `session.json`'s `laps[]`;
an unknown lap number is `invalid_argument` with `detail: { "lap": n }`; a
window too short for the requested FFT parameters fails R76's segment check.

## Report back (≤15 lines)

Commit hash + `git show --stat`; both test result lines with `passed` counts;
`cargo check -p idl-rs-tauri` result; confirmation `reject_non_null_lap` had no
other callers (paste the grep); whether `fetch_raster` also carries a stubbed
`lap` and needs a follow-on; the C3 §3.6 text you wrote; anything needing a ruling.

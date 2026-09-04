# L5 Task 12 — implementer brief (cursor command, C3 §3.7)

You are the implementer for L5 Task 12 — one command, `cursor_readout`, over
L3's landed `core::cursor`. The smallest Group B task; its whole weight is in
one error-handling distinction and one span rule. TDD, two commits, then report.

**Task 9 (import commands, L2) is deferred with L2 and does not exist.** This task needs a
session on disk only in its own tests, which build one with `store::parquet::write_session_parquet`
or the CLI (`idl-rs import --data-dir <data> <file>.idl0`, `cli/src/main.rs:268-276`). No IPC
import command is available or required.

## Where
- **Rust worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l5-tauri`,
  branch `wave1-l5-tauri`, HEAD = the commit of Task 11 (given in the dispatch message), status
  clean. Verify first; if not, stop and report. The branch is already caught up to idl-rs `main`
  (`e0440bb`). Leave `.cargo/config.toml` alone.
- **App worktree:** `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l5-tauri`.
  After the rust commit, sync the submodule: `git -C rust fetch local-wave1 wave1-l5-tauri &&
  git -C rust checkout <new sha>`, then `git add rust`.
- Work ONLY in those two worktrees. Do NOT touch the shared checkouts beyond READING, do NOT
  edit anything under `docs/`, do NOT push.
- **Read first:** `CLAUDE.md`; the L5 plan `### Task 12` (1629–1651) and Global Constraints
  (49–81); C3 §3.7 (spec 718–750, **including both post-sign amendments**) and §4 (interaction
  budget); ledger `runs\2026-09-03\decisions.md` — **R31** (the clamp is removed; `null` outside
  a channel's recorded span) and **R39** (the same rule extended to `gps_channel_values`), plus
  R25's Q4 paragraph which R31 reverses; Task 11's `tauri/src/session_source.rs`.

## COMPUTE RULES — non-negotiable
One cargo process at a time, foreground, never `-j` (CLAUDE.md §8, R13). Run **only**:
- `cargo test -p idl-rs-tauri cursor` — must report a non-zero `passed` count
- app worktree: `npm test` and `npx tsc --noEmit` (Step 3)

No `cargo check -p idl-rs-cli --tests` this task — it adds no `pub` signature to `core` (Task 11
already landed `session_source`/`from_session`). No full suite, no `--workspace`, no `cargo fmt`,
no tarpaulin, no flakiness reruns.

## Verified facts about the landed code (read, not assumed)
Read at idl-rs `main` = `e0440bb`.

1. **`idl_rs::cursor::cursor_readout(channels: &[(&str, &[i64], &[f64])], t_us: i64) ->
   Vec<(String, Option<f64>)>`** — `core/src/cursor.rs:26-44`. Its doc comment (`:8-25`) states
   plainly what is **not** its job and therefore is yours: folding to C3's
   `Record<string, number | null>`, echoing `t_us`, and **existence-checking an unknown channel
   id** (`invalid_argument` + `detail.channel`). "This function never sees an unknown channel and
   returns no error of its own."
2. **R31's span rule is already implemented in core** — `cursor.rs:34-40`: `None` when the
   channel has no samples/no time axis, and `None` when `t_us < first || t_us > last`. Do not
   re-implement or second-guess it; do assert it end-to-end (a channel that stops early reads
   `null`, not a frozen value).
3. **Results come back in request order, and duplicates are preserved** (`cursor.rs:8-11`) — a
   duplicate channel id yields two entries. Folding into C3's `values` map collapses them; that
   is fine and worth one line of doc comment, since the map is the contract.
4. **Session loading** is Task 11's `tauri/src/session_source.rs`:
   `load_session(data_dir, session_id) -> Result<Session, IpcError>` (already maps a missing
   session to `not_found`). `Session.channels: Vec<Channel>` (`core/src/session/mod.rs:341-362`);
   `Channel` has `channel_id`, `t_us: Vec<i64>` (`:137`) and `materialize() -> Vec<f64>`
   (`:302`). **Verify `session_source.rs`'s exact function names against what Task 11 actually
   committed before building on them.**
5. **`app/src/ipc/cursor.ts` is stale against the signed C3.** Its doc comments say
   "interpolated/nearest value, null if the channel has no sample near t_us" (lines 7-9, 12-13).
   C3 §3.7 as amended says: nearest **recorded sample**, no interpolation, no proximity bound,
   ties to the earlier sample, and `null` in exactly three cases (outside the recorded span, no
   samples, no recorded time axis). The function signature itself is correct.
6. `IpcError::with_detail(kind, message, serde_json::Value)` exists — `tauri/src/error.rs:52-54`.

## The task

### Step 1: `rust/tauri/src/commands/cursor.rs` (TDD)
Follow the lane's idiom (`commands/device.rs:141-279`, `commands/workbook.rs` from Task 11): the
logic lives in `cursor_readout_via(data_dir: &Path, session_id: &str, channels: &[String], t_us:
i64) -> Result<CursorReadout, IpcError>`, and the `#[tauri::command] pub fn cursor_readout(
session_id: String, channels: Vec<String>, t_us: i64, data_dir: tauri::State<'_, DataDir>)` is a
one-line wrapper. Tests exercise the `_via` function.

```rust
/// `cursor_readout`'s return (C3 §3.7).
#[derive(Debug, Clone, serde::Serialize)]
pub struct CursorReadout {
    /// Echoes the request, µs on the session's `t` axis (C1 §3.1).
    pub t_us: i64,
    /// channel_id → nearest recorded sample, `null` outside that channel's
    /// own recorded span (ledger R31).
    pub values: std::collections::HashMap<String, Option<f64>>,
}
```

Order of operations, and the whole point of this task:
1. `load_session` → unknown `session_id` is `not_found`.
2. **Existence-check every requested channel first.** The first id not present in
   `session.channels` rejects the **whole** call with `invalid_argument` and
   `detail { "channel": "<the id>" }`. No partial readout is returned. C3 §3.7 (spec 746-750)
   says this explicitly and says why: CLAUDE.md's "don't block other channels" rule is about
   math cells; a cursor readout is one atomic answer for one instant. This is the one place this
   command's error handling deliberately differs from `eval_workbook`'s per-cell tolerance —
   test it so the distinction cannot silently drift.
3. Materialize the requested channels only (`channel.materialize()`, `channel.t_us`), build the
   `&[(&str, &[i64], &[f64])]` slice **in request order**, call `idl_rs::cursor::cursor_readout`,
   fold into the map, echo `t_us`.

Register in `handler()` (`tauri/src/lib.rs`). No new `IpcErrorKind` variants — C3 §3.7 raises
only `not_found`, `invalid_argument`, `io`, `internal`, all seeded in `error.rs:15-32`.

Add a `// TODO(idl0):` noting that every call re-reads `data.parquet` (Task 11's same deferral;
design §4's session/tier cache is not built in wave 1).

### Step 2: tests
A/A/A, `thing — condition — result`. Build the session with two channels whose spans differ —
one that ends early is the case R31 exists for.
- `cursor_readout — t_us on a recorded sample — returns that sample for every channel`
- `cursor_readout — t_us between two samples — resolves to the earlier sample` (C3 §3.7's tie rule)
- `cursor_readout — t_us past a channel's last sample — that channel is null, others still read`
  (R31; this is the HR-strap-drops-at-minute-40 case)
- `cursor_readout — t_us before a channel's first sample — that channel is null`
- `cursor_readout — unknown channel in the list — invalid_argument naming it in detail.channel,
  no partial readout`
- `cursor_readout — unknown session — not_found`

### Step 3: `app/src/ipc/cursor.ts` — doc comments only
Correct the two stale doc comments (fact 5) to the signed C3 §3.7 wording: nearest **recorded**
sample, ties to the earlier one, `null` outside the channel's recorded span / no samples / no
recorded time axis, and a cross-reference to ledger R31. Do **not** change the signature.
Add `app/src/ipc/cursor.test.ts` if absent — one test proving `cursorReadout` calls
`invoke("cursor_readout", { sessionId, channels, tUs })` with that exact argument shape and
returns the resolved value unchanged (mirror `engine.test.ts`'s `vi.mock` pattern). Then
`npm test && npx tsc --noEmit`.

### Step 4: CHANGELOG and commits
`CHANGELOG.md` (app worktree), `[Unreleased] / ### Added`:
`- **Cursor command (C3 §3.7) over L3's core::cursor.** cursor_readout — nearest recorded sample, null outside a channel's recorded span (ruling R31); an unknown channel rejects the whole call with invalid_argument. Settle-bound only, never a hot path (C3 §4).`

Commits, explicit paths, no AI attribution trailer:
```bash
# rust worktree
git add tauri/src/commands/cursor.rs tauri/src/commands/mod.rs tauri/src/lib.rs
git commit -m "tauri: cursor_readout (C3 3.7) over core::cursor"
# app worktree, after syncing the submodule pointer
git add rust app/src/ipc/cursor.ts app/src/ipc/cursor.test.ts CHANGELOG.md
git commit -m "app: cursor IPC docs corrected to signed C3 3.7 (R31 span rule)"
```

## Do not
- Do not interpolate. C3 §3.7 says nearest recorded sample; `core::cursor` already implements it.
- Do not clamp outside a channel's span, and do not "fix" core's `None` into a last value —
  ruling R31 reversed exactly that, and R39 extended the reversal one layer down.
- Do not return a partial readout when one channel is unknown (C3 §3.7, spec 746-750).
- Do not add `IpcErrorKind` variants.
- Do not call `cursor_readout` from any hover path in TS — C3 §4: hover reads the tile's column
  region; this command fires on cursor **settle**, debounced. (Nothing calls it in wave 1; keep
  the doc comment saying so.)
- Do not run the full suite, `--workspace`, or `cargo fmt`.

## Style / hygiene
Doc comment on every public symbol; units on every numeric (`t_us` = microseconds, and say so at
every conversion site); `// TODO(idl0):` never bare `// TODO`; typed errors only, never
`Err(String)`; A/A/A tests with blank lines between; match idl-rs's hand-formatted style.

## Spec discipline (say it out loud in your report)
"no spec change needed" — C3 §3.7 is already amended (R25 Q4, then R31) and is the authority;
this task implements it and corrects a stale TS doc comment to match. Do not edit anything
under `docs/`.

## Report back (concise)
Both commit hashes + `git show --stat`; the `cargo test -p idl-rs-tauri cursor` result line with
its `passed` count; `npm test`/`tsc` results; per-step done/deviated; confirmation the
unknown-channel case rejects the whole call (name the test); confirmation the early-ending-channel
case returns `null` (name the test); confirmation `session_source.rs`'s function names matched
what Task 11 committed (or how they differed); anything ambiguous you resolved (say how) or that
needs a lead ruling — stop and report rather than guess (CLAUDE.md §1).

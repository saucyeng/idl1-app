# L5 Task 12 review — `cursor_readout` (C3 §3.7)

**Commits reviewed:**
- idl-rs worktree (`wave1-l5-tauri`): `b48ab3c..d3a6788` — `d3a6788` "tauri: cursor_readout (C3 3.7) over core::cursor"
  - `tauri/src/commands/cursor.rs` (new, 249 lines), `tauri/src/commands/mod.rs`, `tauri/src/lib.rs`
- idl1-app worktree (`wave1-l5-tauri`): `7af4b98..683896b` — `683896b` "app: cursor IPC docs corrected to signed C3 3.7 (R31 span rule)"
  - `CHANGELOG.md`, `app/src/ipc/cursor.ts`, `rust` (submodule pointer bump)

## Test command and result

- `cargo test -p idl-rs-tauri cursor` (idl-rs worktree): **6 passed; 0 failed; 0 ignored** (61 filtered out).
- `npm test -- --run` (run from `app/`, since the app worktree root has no `package.json`): **10 files, 27 tests passed.**

Both non-zero `passed` counts, run once each, one cargo process at a time, no `-j`, no full suite. `npx tsc --noEmit` was not re-run by the reviewer (not part of the reviewer's mandated command); the implementer's report claims it was run — not independently re-verified, low risk since `cursor.ts`'s change is doc-comments only and the signature is unchanged.

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `rust/tauri/src/commands/cursor.rs:61,69` | Two `.unwrap()` calls on `session.channels.iter().find(...)` inside `cursor_readout_via`. Currently unreachable (the existence-check loop above guarantees every id is present) but it is `unwrap()` on a value derived from caller-supplied data (`channels: &[String]`), which CLAUDE.md §5 forbids ("never `Err(String)`, never a crash on bad data" / never `unwrap()` on data per the review checklist). A future edit that reorders or removes the existence-check loop turns this into a panic (Tauri command handler crash) instead of a typed error. | Build a `HashMap<&str, &Channel>` (or similar) once from `session.channels`, look up each id through it in both loops, and return `IpcErrorKind::Internal` (or restructure into one loop that does the existence check and the collect together) instead of relying on `.unwrap()`. Also removes the O(n·m) double linear scan. |
| Minor | `app/src-tauri/Cargo.lock` | Working tree has a large uncommitted diff (~70 new packages: arrow, parquet, rusqlite, notify, etc.) predating this task. File mtime (`21:51`) is earlier than both this task's commits (`22:06`–`22:14`) and even Task 11's own commit (`22:06:56`), and neither of this task's two commits touches `Cargo.toml` or runs any cargo command in the app worktree (only `npm test`/`tsc`). The dirt is not attributable to Task 12; it most likely comes from an earlier `cargo build`/`check` run against the app crate during Task 11's or Task 8's work, never committed. Flagging for the lead/Task 11's line to commit or explain — not a Task 12 defect, and outside this task's scope to fix (Task 12 correctly left it untouched rather than guessing at whose change it belongs to). | Lead should trace which task's session actually ran the cargo command that resolved these new transitive deps (catalog's `rusqlite`, `notify`, core's `parquet`/`arrow`) and have that lane commit the resulting `Cargo.lock`. |

No Critical findings.

## Verification detail (hardest-first, per dispatch)

**(a) R31 survives the command boundary — verified.** `core::cursor::cursor_readout` returns `Vec<(String, Option<f64>)>` (`core/src/cursor.rs:26-44`); `cursor_readout_via` collects this directly into `HashMap<String, Option<f64>>` (`cursor.rs:73`) with no intervening `.unwrap_or(0.0)`, clamp, or default — `None` values pass through untouched. `CursorReadout.values: HashMap<String, Option<f64>>` has no `#[serde(skip_serializing_if)]` on the map or its value type, so serde_json serializes `None` as JSON `null` inside the object (not omitted, not `0`). `app/src/ipc/cursor.ts`'s `CursorReadout.values: Record<string, number | null>` matches, and `cursorReadout()` (`cursor.ts:16-23`) returns the `invoke()` result unchanged — no coercion on the TS side (confirmed by reading the full function body and the `cursor.test.ts` mock round-trip). All three C3 §3.7 `null` cases (outside span, no samples, no time axis) are core's responsibility per its own doc comment (`cursor.rs:17-25`) and are exercised by core's existing tests (not re-tested at the tauri layer, correctly per the brief — "do not re-implement or second-guess it"); the tauri-layer tests exercise the two span-boundary cases (`short`/`late`) end-to-end through parquet round-trip, which is the right level for this layer. A legitimate `Some(0.0)` is distinguishable from `None`/`null` by construction (`Option<f64>` variant, not a magic number).

**(b) Atomicity — verified genuinely discriminating.** `cursor_readout_via` (`cursor.rs:44-53`) runs the existence-check loop over *all* requested channels to completion before any materialization happens (materialization is a separate loop starting at `cursor.rs:56`). Because the two loops are sequential and the function returns `Err(...)` from inside the first loop on the first miss, there is no code path that can produce a partially-populated `values` map — the `Ok(CursorReadout { .. })` construction is only reached after every id has been confirmed to exist. The test `cursor_readout_unknown_channel_in_the_list_invalid_argument_naming_it_no_partial_readout` calls `["long", "nope"]` (known-then-unknown) and asserts `err.kind == InvalidArgument` and `err.detail == {"channel": "nope"}` — since the return type on this path is `Result::Err`, not a partial `Ok`, there is no way for `long`'s value to leak; a hypothetical partial-return implementation (e.g. collecting successes into a map before checking) would require restructuring the code to even compile against this test's assertions, which is as strong a discrimination as a unit test gets here. No other error path (`not_found` on missing session) constructs a partial `values` map either — `load_session` fails before the id loop even starts.

**(c) Session loading — correct, no duplicate loader.** `tauri/src/session_source.rs` (landed by Task 11, R40) exposes both `load_session(data_dir, session_id) -> Result<Session, IpcError>` (raw session, `not_found` on missing dir/file) and `load_session_handle` (wraps it in `SessionHandle`). Task 12 imports and calls `load_session` only (`cursor.rs:9,44`), consistent with its need for raw `Channel.materialize()`/`Channel.t_us` rather than the `SessionHandle` abstraction. No second session-loading function was added anywhere in the diff.

**(d) Early-ending-channel test reasoned through, not just named.** `seed_two_channel_session` builds `short` with `t_us: [0, 1_000_000]` and `long` with `t_us: [0, 1_000_000, 2_000_000]`. The test queries both at `t_us = 2_000_000`: for `short`, `n = 2`, `ch_t_us[n-1] = 1_000_000`, and `2_000_000 > 1_000_000` → `None` per `core/src/cursor.rs:34-36`; for `long`, `ch_t_us[n-1] = 2_000_000`, `2_000_000 > 2_000_000` is false → resolves via `nearest_at_t_us` to `3.0` (the sample at exactly `2_000_000`). The test asserts `short → Some(None)` and `long → Some(Some(3.0))` in the same call — this genuinely exercises the boundary condition (`>` not `>=`) and the "other channels still read" half of R31, not just a same-named coincidence.

**(e) `Cargo.lock` housekeeping — traced, not Task 12's fault.** See the Minor finding above. `git diff 7af4b98..683896b --stat` shows the app-worktree commit touches only `CHANGELOG.md`, `app/src/ipc/cursor.ts`, and the `rust` submodule pointer — `Cargo.lock`/`Cargo.toml` are untouched by the commit itself. The working-tree modification's file mtime (`21:51`) predates even Task 11's own commit (`22:06:56`), and Task 12's dispatch only authorizes `npm test`/`tsc` in the app worktree (no cargo invocation there at all), so Task 12 cannot have produced this diff. It is pre-existing dirt, correctly left uncommitted rather than swept into this task's commit, but it should not stay unowned — flagged for the lead.

## Other checks

- `IpcError::with_detail` usage matches its real signature (`error.rs:96`); `err.kind`/`err.detail` field names match `IpcError`'s actual fields (`error.rs:81-86`).
- Command registration (`commands/mod.rs`, `lib.rs`) is a clean two-line addition, no unrelated edits.
- No new `IpcErrorKind` variants added (task's own constraint honored).
- `TODO(idl0):` comment present and correctly formed on the `#[tauri::command]` wrapper, matching the required form.
- `cursor.test.ts` was not "added" by this task's diff because it already existed (landed in the earlier `app: complete app/src/ipc/ module scaffolding` commit) and already matched the required mock-and-argument-shape assertion — "add if absent" correctly resulted in no action.
- Doc comments present on all public symbols in `cursor.rs` (`CursorReadout`, `cursor_readout_via`, `cursor_readout`); units stated for `t_us` (µs) at each site.
- No formatting drift outside the new file; `commands/mod.rs`/`lib.rs` diffs are single-line additions matching existing style.
- CHANGELOG entry matches the brief's exact required text verbatim.

## Verdict rationale

Every hard case in the dispatch — the null-vs-zero distinction across the IPC boundary, the atomicity guarantee under an unknown channel, the correct choice of `load_session` over a second loader, and the specific arithmetic of the early-ending-channel boundary — checks out under direct code reading and arithmetic, not just by trusting the implementer's naming or report. Tests are real A/A/A, correctly named, and both mandated test commands pass with non-zero counts. The one substantive code issue is two `.unwrap()` calls on caller-derived data that are logically unreachable today but violate a stated CLAUDE.md order and would turn into a backend panic under a future refactor — real but narrow and mechanical to fix. The `Cargo.lock` dirt is pre-existing and not this task's to own. Neither finding touches spec compliance, the R31 rule itself, or test integrity, so this does not rise to NEEDS-REWORK; the unwrap issue is a small, well-scoped fix that should go back before merge.

VERDICT: NEEDS_FIXES

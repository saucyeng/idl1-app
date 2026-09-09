# Lane brief — `unwatch_workbook` (R98)

**Worktree:** `../idl-rs-worktrees/unwatch`, branch `unwatch`, off idl-rs
`main`. **Rust only** — the `idl-rs` submodule. Do not edit anything in the
superproject (`app/`, `docs/`, `runs/`): the C3 amendment and the TypeScript
call site are the lead's, and the worktree cannot reach them anyway. Report
what you leave owed.

**Spec discipline:** spec-during is the lead's half. You write the code and
the CHANGELOG line; say in your report exactly what C3 §3.4 must state.

## The gap (ruling R98, 2026-09-07)

`watch_workbook` parks its watcher in `state.rs`'s `Watchers` map keyed by
workbook id, for the app's lifetime. Closing a workbook in the UI drops the
frontend callback but **not** the OS file watch — R98 accepted the inert
callback for that pass and named the real fix a contract change. Today one
`notify` handle per workbook opened this session persists until the app
exits. It is a disclosed leak, tracked in `TASKS.md`, not a silent one.

The registry already does the hard part: dropping the entry stops the
watcher (`WorkbookWatcher`'s `Drop` tears down the `notify` handle), and
re-subscribing to the same id already replaces — and so stops — the previous
one. This lane makes that reachable by name.

## Tasks

### Task 1 — the command

Add `unwatch_workbook(id: String)` beside `watch_workbook` in
`rust/tauri/src/commands/workbook.rs`, registered in `lib.rs`'s handler list
in the same group as `watch_workbook`.

Behaviour: remove `id` from the `Watchers` map. Dropping the removed value
stops the watch.

**Unwatching an id that is not watched is `Ok(())`, not an error.** Decide
nothing here — this is the lead's ruling and the reason is: the frontend
calls this on close/unmount, a path that must be idempotent and must not
depend on whether a watch was ever established (a workbook closed before
`watch_workbook` resolved, a double unmount in React strict mode, an
unwatch after a re-subscribe already replaced the entry). An error return
would make correct frontend code log spurious failures. Say this in the doc
comment, in those terms — an absence that is deliberate must read as
deliberate.

Do **not** hold the mutex across the drop if that is avoidable: take the
value out under the lock, release the lock, then let it drop. Say in a
comment whether `WorkbookWatcher::drop` can block (it tears down a `notify`
handle); if it can, dropping under a lock every other watcher command
contends on is a stall waiting to happen.

### Task 2 — the `Watchers` doc comment is now wrong

`rust/tauri/src/state.rs`'s `Watchers` says, in as many words, "there is no
unsubscribe command in wave 1 (see the CHANGELOG entry)". Rewrite it to
describe what is now true, and keep the *reason* the replace-on-resubscribe
behaviour exists — that is still the backstop for a frontend that never
calls unwatch. A stale doc comment that confidently states the opposite of
the code is worse than no comment.

### Task 3 — tests

Inline `#[cfg(test)]`, Arrange/Act/Assert with blank lines, names
`thing — condition — result`. At minimum:

- unwatch — a watched workbook — the entry is gone from the registry
- unwatch — an id that was never watched — `Ok(())`, registry unchanged
- unwatch — called twice — the second is `Ok(())` (the idempotence the
  frontend relies on)
- watch, unwatch, then an external edit to that file — **no event is
  delivered**. This is the one that proves the watch actually stopped rather
  than the map merely forgetting it. The existing test at
  `workbook.rs:2228` (`watch_workbook_external_edit_...`) shows the
  established pattern for driving a real file edit; follow it, including
  however it waits for the debounce — do not invent a new timing approach,
  and do not add a bare `sleep` if that test does something better.

If the no-event assertion turns out to be untestable without a new seam,
**stop and report it** rather than shipping a test that passes for the wrong
reason. Saying so honestly is the accepted outcome here — the `raster-units`
lane did exactly that on a watcher race this week and it was the right call.

## Gate

One cargo process at a time; jobs are capped machine-wide — never pass `-j`.
Run the targeted filter while working:
`cargo test -p idl-rs-tauri workbook -- --test-threads=4`
(a filter matching nothing is a failed gate, not a pass — report a non-zero
`passed` count).

At the end, the lane gate (R159), all three:
- `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`
- `cargo test -p idl-rs-tauri -- --test-threads=4`
- `cargo test -p idl-transport -- --test-threads=4`

Never `--workspace`, never `cargo fmt`, never `cargo tarpaulin`, never
`cargo doc`. idl-rs is not rustfmt-formatted — match the surrounding style
by hand.

## Rules

`CLAUDE.md` standing orders are binding, including §1: if a signature,
field, or behaviour is not stated here or in the contracts — **stop and
ask**. Doc comment on every public symbol; typed errors only, never
`Err(String)`. `CHANGELOG.md` gets a line. No AI attribution trailers.
Commit per task. Never push.

## Report back (≤ 15 lines)

Tasks done; the three gate commands' pass counts; the exact wording C3 §3.4
must gain for `unwatch_workbook` (signature, error cases, and the
unwatch-an-unwatched-id rule) so the lead can write it; whether the
no-event test was achievable and, if not, what seam it needs.

# L11 Task 11 — transport: the loopback two-peer proof

The lane's honesty test: two data directories, one process, a real server and
a real client, proving design §7's "done when" without a second machine.
Tests only — no production code unless a test finds a bug. ONE commit.

**Depends on Task 10.**

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l11-sync"
git merge-base --is-ancestor 52efba8 HEAD && echo GATE-OK
grep -c "pub async fn sync_with_peer" transport/src/sync/client.rs
```
Both must succeed / return `>= 1`. If either fails, STOP and report.

## Files to read first

`CLAUDE.md` §4 (test naming and Arrange/Act/Assert); this lane's `PLAN.md`
§7 (this task's specification) and the design doc's L11 row — "Phone →
desktop blob sync and desktop → phone workbook sync on a home LAN; two-sided
edits to different cells merge with no conflict" is what this task proves;
Tasks 8 and 10's tests, so the fixtures are shared rather than re-invented.

## Where

- **Files:** `transport/src/sync/loopback_tests.rs` (new, `#[cfg(test)]`),
  `transport/src/sync/mod.rs`, `CHANGELOG.md`.

## What to build

A test harness in the same file: a helper that stands up **two** complete
instances — each with its own `tempdir` data root, `PairingState`, peer list,
and a `SyncServer` on `127.0.0.1:0` — and pairs them by driving the real
`POST /pair` route with a real minted code. No mDNS: the addresses come from
`local_addr()`, which is PLAN §7's stated bypass.

Seed data is built with core's own writers (`write_blob`, the workbook
writer, `write_session_json`, `write_track`), never by hand-writing bytes
into the tree — a fixture that bypasses the real writers proves nothing.

## Tests

Each drives `sync_with_peer` in both directions where the scenario calls for
it, and asserts on the *files on disk*, not only the returned counts.

- `two peers — a session imported on A only — its blob, data.parquet and
   session.json all appear on B and verify`.
- `two peers — a workbook edited on A only — B has A's version`.
- `two peers — the same workbook, different cells edited on each side —
   both edits present on both sides, zero conflicts` (the design doc's
   acceptance sentence).
- `two peers — the same cell edited on both sides — exactly one conflict cell
   on each side, below the local cell, and both files still parse`.
- `two peers — sync run twice — the second run moves nothing`.
- `two peers — A adds a track newer than B's — B takes it; the reverse
   direction leaves A untouched`.
- `two peers — session.json edited on each side in different fields — both
   fields survive on both sides`.
- `two peers — a server killed mid-transfer, then restarted — the resumed run
   completes and the bytes verify`.
- `two peers — an unpaired client — every route 401s and nothing changes`.
- `two peers — after every scenario — neither tmp/ holds leftovers and
   neither catalog.sqlite was read or written`.

The last assertion matters: prove the catalog is untouched by checking it was
never created in either root, since sync must never sync an index.

## COMPUTE RULES

While working: `cargo test -p idl-transport sync::loopback`, foreground,
non-zero `passed`. These tests do real file and socket I/O — keep the fixture
data small (a few KB per file) so the suite stays fast on a 16 GB machine.

## Steps

- [ ] 1. Gate. 2. The two-instance harness. 3. The scenarios, one at a time.
      4. Filter green. 5. NUL check. 6. `CHANGELOG.md`. 7. Commit
      `transport: loopback two-peer sync tests (L11)`.

## Do not

- Do not weaken a scenario to make it pass — a failure here is a real bug in
  Tasks 2–10 and is reported, then fixed in a follow-up commit.
- Do not use mDNS in these tests.
- Do not hand-write fixture bytes into `<data>`.
- Do not bind anything but loopback.

## Spec discipline

**No spec change needed.** If a scenario cannot be expressed because a
contract is silent, STOP and name the contract.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the filter's `passed` count; which scenarios
failed first and what they exposed; the wall-clock time the loopback filter
takes; anything the design doc's acceptance sentence does not actually cover.

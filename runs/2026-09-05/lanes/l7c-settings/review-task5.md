# L7c Task 5 review — Sync section (sync_status / sync_now / pair_peer)

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`
Branch: `wave2-l7c-settings`
Commit under review: `7ff4abd675689a6b27a6be6582ebcaaba0310f7f`
("app: Settings tab LAN sync section over sync_status/sync_now/pair_peer; supersede Drive-sync §27/§28")

In scope: `app/src/routes/pages/Settings/{pairCode.ts,pairCode.test.ts,syncState.ts,
syncState.test.ts,SyncSection.tsx,index.tsx}`, `docs/IDL0_SPEC.md` §27.4/§27.9/§28,
`CHANGELOG.md`. Out of scope: any concurrent Task 6 commit landing later in this
worktree (not present at review time — `git log -1` at review time showed 7ff4abd
as HEAD).

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run --coverage src/routes/pages/Settings
```

`tsc --noEmit` printed nothing. Vitest:

```
 Test Files  8 passed (8)
      Tests  52 passed (52)
```
Coverage table (istanbul `skipFull`-style omission of 100%-covered files, so
`pairCode.ts` does not appear — consistent with 100% claimed):
`syncState.ts` 89.47% stmts / 88.88% lines, `errors.ts` 57.14%, `prefsStore.ts`
94.87%, `ipcStubs.ts` 0% (untouched, expected — not exercised by this task's
tests).

This reproduces the implementer's reported 52 passed, pairCode.ts 100%,
syncState.ts 88.9% lines exactly.

## Findings

No Critical or Important findings.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `app/src/routes/pages/Settings/syncState.test.ts:64` | The test titled `syncStateReducer — a SyncResult with conflicts 0 — the summary says merged cleanly` (and its `conflicts 2` sibling at line 73) calls `describeSyncResult` directly and never touches `syncStateReducer` at all, despite the name and the brief's own listing under `syncState.ts`'s tests. Not wrong (the brief's own bullet list names `describeSyncResult` as a separate export under Step 1), but the test name claims reducer coverage it doesn't exercise. | Rename to `describeSyncResult — conflicts 0 — …` / `describeSyncResult — conflicts 2 — …`, or fold the assertion into an actual `type: "result"` reducer call plus a stored-result field if the reducer is ever asked to own the summary. |
| Minor | `docs/IDL0_SPEC.md:3023` (§27.9 "Result summary") | The worked example text is `"12 blobs, 3 workbooks merged"` for the zero-conflict case; the actual `describeSyncResult` output is `"12 blobs, 3 workbooks merged cleanly."` (note the trailing "cleanly" and period). Cosmetic drift in a doc example, not a behaviour bug. | Update the SPEC example string to match the real output verbatim. |

## Checks performed (all pass)

- **Real commands, never stubbed.** `Settings/ipcStubs.ts` is untouched in
  this diff (confirmed via `git show --stat`); `SyncSection.tsx` imports
  `pairPeer, syncNow, syncStatus` directly from `app/src/ipc/sync.ts`, which
  is also untouched — no new stub wraps any of the three C3 §3.9 commands.
- **Polling discipline.** `sync_status` is polled via `window.setInterval`
  inside a `useEffect` that runs only while `SyncSection` is mounted; the
  cleanup calls `window.clearInterval` and sets a `cancelled` flag so a
  resolved promise after unmount is a no-op — no overlapping in-flight
  polls (each `poll()` call fires one `syncStatus()` and waits for it to
  settle before the next timer tick). `POLL_INTERVAL_MS = 5000` carries a
  doc comment stating units (ms) and that C3 §4 only requires "periodic,
  never per-frame" without fixing a number — this matches C3 §4's actual
  text (`sync_status` "periodic poll on a timer, not per-frame") and design
  §7's automatic/manual trigger model.
- **`sync_now` / `pair_peer` fire on explicit user action only** — a button
  click (`handleSyncNow`, `handlePair`), never on a timer or on render.
- **Pairing code validated locally before `pair_peer`.** `normalizePairCode`
  strips spaces/`-`/`_`; `validatePairCode` requires exactly six digits,
  distinguishing empty / wrong-length / non-digit with distinct messages —
  matches C3 §3.9's own stated rule ("wrong length/non-digit" backed by
  `invalid_argument`) and the brief's four-case Step 1 list. Verified the
  six-digit check against C3 §3.9 line 884 (`code`: the 6-digit pairing
  code) rather than taking the brief's restatement on faith.
  `handlePair`/the UI never submits when `codeIssues.length > 0` (button
  `disabled={codeHasErrors || pairing}`).
- **`syncState` reducer is pure.** No IPC calls, no `Date.now()`/randomness,
  no mutation of the input state (every branch returns a new object via
  spread). Each of the eight action variants (`status`, two `progress`
  shapes, `result`, `paired`, `failure`, plus the status-while-running and
  pair-dedup cases) has its own test; a status poll while a sync is running
  leaves `running` untouched (verified against the reducer's `status` case,
  which spreads `state` and only overwrites `status`/`peers`); a `paired`
  action replaces rather than duplicates an existing peer by `peer_id`.
- **Errors routed through `errors.ts` from C3 §2 kinds.** `describeIpcError`
  in `Settings/errors.ts` covers exactly `sync`, `invalid_argument`,
  `not_found`, `io`, `internal` plus a safe default — all five appear in
  C3's kind table (line 146, 176-179) as kinds a Sync-group command can
  raise. A non-`IpcError`-shaped rejection (the realistic case today, since
  no Rust command is registered) falls back to
  `describeSyncError`'s "isn't running on this build yet" text rather than
  a raw error — matches the brief's Step 2 instruction.
- **"L11 not landed" fallback is honest.** The doc comment on
  `describeSyncError` and the CHANGELOG/SPEC entries correctly state that
  `sync_status`/`sync_now`/`pair_peer` are real commands that reject today
  because no Rust implementation is registered yet, not because of a stub —
  verified this claim is architecturally true: `sync.ts`'s own top comment
  says "no Rust command backs this module yet," and nothing in the diff
  papers over that with a fake success path.
- **Conflict count never presented as an error.** `describeSyncResult`'s
  non-zero branch reads "... N conflict cell(s) to resolve." — tested
  against `/resolve/i` and explicitly asserted to not match `/error|failed/i`.
- **SPEC edits confined to §27.4's row 3, new §27.9, and §28's banner** —
  `git show` diff touches only those three locations in `docs/IDL0_SPEC.md`;
  no other section altered.
- **Ownership boundary.** `git show --stat` confirms every changed path is
  under `app/src/routes/pages/Settings/**`, `CHANGELOG.md`, or
  `docs/IDL0_SPEC.md` (spec-during task per the brief). No touch to `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts`, or
  `app/src/ipc/**` (neither `sync.ts` nor `engine.ts` modified).
- **No new npm dependency** — no `package.json`/lockfile change in the diff.
- **CHANGELOG entry** accurately describes the shipped section, the 5 s
  poll, the local pairing-code validation, and the L11-not-landed fallback;
  matches the code.
- **Commit hygiene.** Single-line message, no AI attribution trailer; `git
  log -1` confirms.
- **NUL-byte check** on all seven changed/created files: every count is `0`.
- **Doc comments and units.** Every exported symbol in `pairCode.ts`,
  `syncState.ts`, and `SyncSection.tsx` carries a doc comment;
  `POLL_INTERVAL_MS` and `Progress.done`/`.total` carry unit notes
  (milliseconds; mixed blobs+cells count disambiguated by `phase`).
- **Test naming (CLAUDE.md §4)**, all 14 new tests use the
  `thing — condition — result` em-dash form with Arrange/Act/Assert and
  blank lines between phases (the one naming nit above is about what the
  test exercises, not the format).
- **`EnginePrefs`/`AppSettings` parity** — not touched by this task; no
  drift introduced.

## Note for the lead (not a task finding)

C3 §3.9 itself is internally inconsistent about `sync_status`'s error kinds:
the per-command line (`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md:868`,
"Errors: `io`, `internal`") omits `sync`, while the master kind table
(same file, line 146, "`sync` | `TransportErrorKind::Sync` | Sync:
`sync_status`, `sync_now`, `pair_peer`") lists `sync_status` as a `sync`-kind
raiser. The implementer's `describeIpcError` covers `sync` for all three
commands, which is the safer, forward-compatible reading and not a defect —
but the contract text disagrees with itself and should be reconciled at the
lead level before L11 lands and actually exercises this path.

## Verdict rationale

The section calls the three real C3 §3.9 commands directly with no stub in
the diff path, matching R53 Q3 and the task brief's explicit "do not stub"
instruction; the pairing code is validated locally against C3's own stated
six-digit/digits-only rule before any round trip; the reducer is pure,
covers every documented transition including the poll-vs-running-progress
non-clobber case, and is fully tested with correctly formed A/A/A cases; the
LAN-sync-not-landed fallback is truthful about why calls fail today; error
kinds routed through `errors.ts` are all real C3 kinds; the SPEC edits are
scoped exactly to §27.4/§27.9/§28 as instructed and read as a genuine
replacement; ownership stayed inside `Settings/**` plus the two allowed
shared files; the gate reproduces the implementer's reported 52 passed with
clean `tsc`. The two Minor findings are a mislabelled (but functionally
harmless) test description and a cosmetic SPEC-example mismatch — neither
changes behaviour or violates a rule strongly enough to block.

VERDICT: CLEAN

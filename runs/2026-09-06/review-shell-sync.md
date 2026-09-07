# Review — sync UI shell task (post-L11)

Commits: `a67e51b` (app: sync IPC and Settings Sync section up to C3 §3.9),
`72ead18` (docs: CHANGELOG + TASKS). Worktree
`idl1-app-worktrees/shell-sync`, branch `shell-sync`.

Files touched: `app/src/ipc/sync.ts`,
`app/src/routes/pages/Settings/SyncSection.tsx`,
`app/src/routes/pages/Settings/pairForm.ts` (+ `.test.ts`),
`app/src/routes/pages/Settings/syncPoll.ts` (+ `.test.ts`),
`app/src/routes/pages/Settings/syncState.ts` (+ `.test.ts`),
`CHANGELOG.md`, `TASKS.md`.

Gate: `cd app && npx tsc --noEmit && npx vitest run`.
Result: `tsc` clean; vitest **128 files / 1175 passed** — matches the
implementer's report.

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Important | `SyncSection.tsx:270-278` | `PairingCode.expires_at_ms` (C3 §3.9, 120 s lifetime per PLAN §8 Q3) is fetched into `myCode` but never surfaced: the code display shows only the six digits, no "expires in …" text or countdown, and there is no re-mint on expiry. A user who is slow to relay the code gets an opaque `not_found` from the *other* device's `pair_peer` call with no on-screen explanation of why. Not disclosed as a gap in `CHANGELOG.md`/`TASKS.md` either. | Show `expires_at_ms` as relative text (e.g. "expires in 2:00", ticking or at least stated once) or, at minimum, disclose the omission in `CHANGELOG.md` as a deliberate gap. |
| Minor | `CHANGELOG.md:37-39` (post-merge, introduced by `72ead18`) | The UI-1 CHANGELOG entry's date/attribution line is duplicated verbatim (`(2026-09-06, no spec change needed — R92/R93 adopt the direction file).**` appears twice in a row), left over from inserting the new Sync entry above it. Cosmetic but sloppy — a bad diff base, not a hand-edit. | One-line fix: delete the duplicate line. |
| Minor | `pairForm.test.ts`, `syncState.test.ts` | Several tests (e.g. `validatePeerId — an empty string`, most of `pairButtonLabel`/`syncNowButtonLabel`/`isSyncNowDisabled`, and most of `syncStateReducer`'s cases) skip the Arrange/Act/Assert comment structure with blank lines CLAUDE.md §4 requires and this same task's `syncPoll.test.ts` and the repo's other `Settings/*.test.ts` files (e.g. `dataDir.test.ts`) consistently use. Names are correctly `thing — condition — result`; only the AAA blocking is missing. | Not blocking; a follow-up formatting pass would bring these two files in line with the rest of `Settings/`. |

## Verification detail

- **Field names byte-exact against Rust DTOs**, checked against
  `rust/tauri/src/commands/sync.rs` (worktree's Rust submodule, current
  HEAD): `PeerStatusDto{peer_id,name,online,protocol_version,paired_at_ms}`,
  `SyncStatusDto{paired_peers,last_sync_utc_ms}`,
  `SyncResultDto` six fields, `PairingOfferDto{code,expires_at_ms}` — all
  match `sync.ts`'s TS interfaces exactly, including the `dtos_serialise_
  with_exactly_c3_3_9s_field_names` Rust test's own key lists. Command args:
  `pair_peer(peer_id, code)` → `invoke("pair_peer", { peerId, code })`,
  `sync_now(peer_id, progress)` → `{ peerId, progress }`,
  `unpair_peer(peer_id)` → `{ peerId }`, `start_pairing()`/`sync_status()`
  take no args — Tauri's default camelCase-of-snake_case arg mapping,
  confirmed against the same convention already in `app/src/ipc/device.ts`
  (`{ deviceId, timeoutMs }` etc). `peer_appeared` event name matches
  `state.rs:167`'s `app.emit("peer_appeared", …)` byte-exact.
- **R104 (peer never guessed)**: `pairForm.ts`'s `validatePeerId` requires a
  non-blank, user-typed peer id; no default, no "pick the only online peer"
  fallback anywhere in `SyncSection.tsx`. The interim (typed field, not a
  picked row) is explained in `pairForm.ts`'s doc comment and disclosed in
  `CHANGELOG.md`/`TASKS.md` as a follow-on candidate — matches R104/R105's
  ruling that this is the correct interim, Task 14's `discovered_peers` list
  being explicitly out of scope.
- **Pairing code never logged or persisted**: grepped `console.` and
  `localStorage` across all five touched TS files — no hits.
- **`syncState.ts`'s `describeSyncResult`** always states blobs and
  workbooks (even at zero) and only adds sessions/tracks/profiles when
  non-zero, so a run that moved only a track reads "0 blobs, 0 workbooks
  merged, 1 track updated cleanly" — never "0 changes". Verified against
  `syncState.test.ts`'s six-field-shape test data.
- **Toast fires once per run**: `announceSyncFinished` is called from
  exactly one call site, `handleSyncNow`'s `.then()`, using the pre-existing
  `toastFor({ kind: "syncFinished", changed })` closed union
  (`components/toasts/events.ts`, untouched by this commit).
- **Effects (wave-2 operating brief §4 + tightening)**: both `useEffect`s in
  `SyncSection.tsx` (lines 133-141 the `sync_status` poll, 145-149 the
  `peer_appeared` watch) have empty `[]` dependency arrays; their deps
  objects (`SYNC_STATUS_POLL_DEPS`, `PEER_APPEARED_WATCH_DEPS`) are built
  once at module scope, so nothing capturable changes across renders. Each
  effect's `return` is the driver's own `stop` function — no ad-hoc
  cancellation. All decision logic (never two requests in flight, resume on
  visibility, monotonic `generation` guard against late-settling promises)
  lives in `syncPoll.ts`'s two pure drivers, unit-tested for: start-while-
  hidden, hidden→visible resume, visible→hidden teardown (R95 item 2's
  "re-primed on show"), stop-while-in-flight (no dispatch after), and
  stop-during-the-async-`listen()`-call race. No IPC call happens in a
  render body; `invoke(` does not appear in `SyncSection.tsx`.
- **No colour literal / `box-shadow`** in `SyncSection.tsx` (grepped).
  `App.tsx`/`state/` untouched (empty diff against `main`). No new
  dependency (`app/package.json`/lockfile diff against `main` is empty).
- **CHANGELOG/TASKS honesty**: `TASKS.md`'s new bullets correctly describe
  the `.setup()` wiring gap, the missing unpaired-peer discovery source, the
  pre-existing `unwatch_workbook` gap (R98), the named flaky watcher test,
  and `verify_data_dir`'s symlink gap (R101) — all filed as follow-ons, none
  silently dropped. Cross-checked against `runs/2026-09-03/decisions.md`'s
  R104/R105 entries (dated the same day, after this shell task): R105
  ruled the `.setup()` wiring is L11 Task 13 and unpaired-peer discovery is
  Task 14 — consistent with, and chronologically after, this task's own
  "raised to the lead" framing.

## Verdict rationale

Both TS lane gates pass cleanly and match the implementer's reported counts.
Every DTO field name and command-argument name is byte-exact against the
Rust source, the R104 no-guessing rule is genuinely enforced (not just
disclaimed), the pairing code is never logged or persisted, the sync result
is reported honestly across all six fields, and every effect that drives
IPC follows the wave-2 tightening rule with real interleaving tests. The
one Important finding is a real, un-disclosed UX gap (pairing-code expiry
never shown) rather than a wiring or contract defect; the two Minors are a
copy-paste duplication in `CHANGELOG.md` and a test-formatting
inconsistency in two of the five new files. None of these block the shape
of the work or contradict a ruling, so this is fix-on-record territory
rather than a rework.

VERDICT: NEEDS_FIXES
OUTPUT: C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\runs\2026-09-06\review-shell-sync.md
COUNTS: critical=0 important=1 minor=2
NOTES: R104 peer-naming rule and R102's six-field SyncResult both verified byte-exact against Rust; the one Important is the undisclosed pairing-code expiry (C3's `expires_at_ms`) never shown to the user.

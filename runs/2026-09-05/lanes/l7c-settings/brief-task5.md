# L7c Task 5 — implementer brief (LAN sync — status, pairing, manual sync)

You are the implementer for L7c Task 5 — the Sync section over the real,
landed `sync_status`/`sync_now`/`pair_peer` (C3 §3.9). This task replaces
`docs/IDL0_SPEC.md` §27's Drive-sync section and adds a superseded banner to
§28 (spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7c-settings`,
  branch `wave2-l7c-settings`. **HEAD must be Task 4's commit** ("app:
  Settings tab data-directory section over get_data_dir/set_data_dir
  stubs"). Verify with `git log -1` and `git status`; if not there, STOP
  and report.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §27/§28 in this worktree is
  this lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7c-settings/BRIEF.md`
  (R53 Q3); `app/src/ipc/sync.ts` **in full** — this is the module you call
  directly, not a stub: `Progress`, `PeerStatus`, `SyncStatus`,
  `SyncResult`, `syncStatus()`, `syncNow(peerId, onProgress)`,
  `pairPeer(code)`; design §7 (LAN sync, pairing) for the 6-digit code and
  the "automatic when a paired peer appears, plus a manual button" trigger
  model; `docs/IDL0_SPEC.md`'s current §27 Drive-sync section and §28 in
  full (what you are replacing/superseding — read before rewriting so the
  diff reads as a real replacement).

## The task (plan Task 5, Steps 1–4, unchanged)

**Files:**
- Create: `Settings/pairCode.ts`, `Settings/pairCode.test.ts`,
  `Settings/syncState.ts`, `Settings/syncState.test.ts`,
  `Settings/SyncSection.tsx`
- Modify: `Settings/index.tsx`, `docs/IDL0_SPEC.md` §27 and §28

(`Settings/ipcStubs.ts` is **not** modified for this task — `sync_status`/
`sync_now`/`pair_peer` are real commands, not IPC needs; do not add stubs
for them.)

**Interfaces:**
- `pairCode.ts`: `normalizePairCode(raw: string): string` (strip spaces and
  separators) and `validatePairCode(code: string): ValidationIssue[]` —
  design §7's six-digit code; C3 §3.9 backs a bad one with
  `invalid_argument` for "wrong length/non-digit," but validate locally
  first so a typo never becomes a round trip.
- `syncState.ts`: a pure reducer over `{ status: SyncStatus | null, peers:
  PeerRow[], running: { peerId: string; done: number; total: number | null;
  phase: string } | null, lastError: string | null }` (`PeerRow` mirrors
  `sync.ts`'s `PeerStatus`) with actions for a `sync_status` poll result, a
  `sync_now` `Progress` message (C3 §3.9's mixed blobs+cells unit,
  disambiguated by `phase`), a `SyncResult`, a `pair_peer` success, and
  failures. Plus `describeSyncResult(result: SyncResult): string` —
  e.g. "12 blobs, 3 workbooks merged, 1 conflict cell" — where a non-zero
  `conflicts` reads as something to go resolve, not as a failure.

- [ ] **Step 1: Write the failing tests**

  `pairCode.test.ts`:
  - `normalizePairCode — "12 34 56" — "123456"`
  - `normalizePairCode — "12-34-56" — "123456"`
  - `validatePairCode — six digits — no issues`
  - `validatePairCode — five digits — one issue naming the required length`
  - `validatePairCode — six characters with a letter — one issue naming digits only`
  - `validatePairCode — an empty string — one issue, and not the same one as a wrong-length code`

  `syncState.test.ts`:
  - `syncStateReducer — a sync_status result — peers listed, online flags kept`
  - `syncStateReducer — a status poll while a sync is running — the running progress is not clobbered`
  - `syncStateReducer — PROGRESS with phase "blobs" — the phase is shown, since done/total mix units (C3 §3.9)`
  - `syncStateReducer — PROGRESS with total null — a count without a percentage`
  - `syncStateReducer — a SyncResult with conflicts 0 — the summary says merged cleanly`
  - `syncStateReducer — a SyncResult with conflicts 2 — the summary names the conflict cells as something to resolve, not as an error`
  - `syncStateReducer — a failure with kind sync — lastError set, peers retained`
  - `syncStateReducer — pair success — the new peer appears once, even if the poll also returns it`

- [ ] **Step 2: Implement**

  The section polls `syncStatus()` on a timer (C3 §4: a periodic poll,
  never per-frame — pick an interval, e.g. 5s, and say what you picked in
  your report since no contract fixes one), lists paired peers with their
  online flags, offers `pairPeer(code)` behind `validatePairCode`, and runs
  `syncNow(peerId, onProgress)` manually. **L11 has not landed**, so all
  three commands reject in practice; render that through
  `Settings/errors.ts`'s `describeIpcError` (extend its kind table for
  `sync` if not already covering it — check the file first) and say LAN
  sync is not running yet, rather than showing a raw error.

- [ ] **Step 3: `docs/IDL0_SPEC.md` §27 and §28**

  Delete §27's Drive-sync section, put LAN sync in its place (status,
  pairing, manual sync, as built). Add a one-line superseded banner at the
  top of §28 (Google Drive Sync) pointing at design §7 — the idl1 line does
  not use Drive.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Settings
  ```
  Expected: 14 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Settings/pairCode.ts app/src/routes/pages/Settings/pairCode.test.ts app/src/routes/pages/Settings/syncState.ts app/src/routes/pages/Settings/syncState.test.ts app/src/routes/pages/Settings/SyncSection.tsx app/src/routes/pages/Settings/index.tsx docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Settings/pairCode.ts app/src/routes/pages/Settings/pairCode.test.ts app/src/routes/pages/Settings/syncState.ts app/src/routes/pages/Settings/syncState.test.ts app/src/routes/pages/Settings/SyncSection.tsx app/src/routes/pages/Settings/index.tsx docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Settings tab LAN sync section over sync_status/sync_now/pair_peer; supersede Drive-sync §27/§28"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not stub `sync_status`/`sync_now`/`pair_peer` — call them directly.
- Do not poll on every render or on a gesture — a timer only, and off while
  the section is not visible if that's easy to add; say if you didn't.
- Do not present a sync conflict count as an error.
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §27's Drive-sync section replaced and
§28 superseded per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; the poll interval chosen and why; confirmation
`sync_status`/`sync_now`/`pair_peer` are called directly, never stubbed;
confirmation §28 carries the superseded banner; confirmation the NUL-byte
check printed `0` for every file; anything ambiguous you resolved (say how)
or that needs a lead ruling.

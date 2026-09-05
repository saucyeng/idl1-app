# L7a Task 7 — implementer brief (metadata editor)

You are the implementer for L7a Task 7 — the nine-field session metadata
editor, built against the `save_session_metadata` stub (IPC need 1). This
task rewrites part of `docs/IDL0_SPEC.md` §24 in the same commit
(spec-during). TDD, ONE commit, then report.

## Where

- Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
  branch `wave2-l7a-data`. **HEAD must be Task 6's commit** ("app: Data tab
  tracks view over list_tracks/get_track"). Verify with `git log -1` and
  `git status`; if not there, STOP and report. Task 6 is expected to have
  created `Data/ipcStubs.ts` with `NotImplementedError` and `saveTrack`/
  `deleteTrack` — this task adds `saveSessionMetadata` to the same file,
  following its existing convention exactly, not inventing a second stub
  style.
- Work ONLY there. Editing `docs/IDL0_SPEC.md` §24 in this worktree is this
  lane's spec-during obligation. Never touch `rust/`, `app/src-tauri/`,
  `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`, `state/AppState.tsx`,
  `package.json`, `vite.config.ts`.
- **No cargo, ever.**
- Read first: `CLAUDE.md`; `runs/2026-09-05/lanes/l7a-data/BRIEF.md`;
  `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 1 (`save_session_metadata`'s
  exact signature and `SessionMetadataPatch`'s nine fields — copy the field
  list from there verbatim, it matches C1 §6); the plan's Task 7
  (`docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md`, lines
  431–474); `app/src/ipc/catalog.ts`'s `SessionDetail` (the nine
  `session.json` fields already live there: `rider`, `bike`,
  `bike_comment`, `venue_name`, `event_name`, `event_session`,
  `short_comment`, `long_comment`, `tag`); Task 6's `trackRow.ts`'s
  `resolveDisplayVenue` (this task's venue pre-fill reuses it, does not
  redefine it); the read-only reference
  `...\idl0-app\app\lib\ui\tabs\data\metadata_editor.dart` §24.10's venue
  pre-fill rule.

## The task (plan Task 7, Steps 1–4, unchanged)

**Files:**
- Create: `Data/metadataForm.ts`, `Data/metadataForm.test.ts`,
  `Data/MetadataForm.tsx`
- Modify: `Data/DetailPane.tsx`, `Data/ipcStubs.ts`, `docs/IDL0_SPEC.md` §24

**Interfaces:**
- `metadataForm.ts`: `initialDraft(detail: SessionDetail, tracks:
  TrackSummary[]): MetadataDraft` — nine fields (rider, bike, bike_comment,
  venue_name, event_name, event_session, tag, short_comment, long_comment),
  with `venue_name` **pre-filled from `resolveDisplayVenue`** (Task 6) so
  saving persists the venue the card already shows, not the session's own
  possibly-empty field (idl0 §24.10); `isDirty(draft, detail)`;
  `venueOptions(tracks: TrackSummary[]): string[]` (deduped, empties
  dropped, sorted); `normalizeDraft(draft)` (trim every field; `""` is the
  only "not set" representation — C1 §6 has no null); `toSavePayload(sessionId,
  draft)` → exactly the nine fields plus `session_id`, matching
  IPC-NEEDS.md need 1's `SessionMetadataPatch` field for field.
- Add to `Data/ipcStubs.ts`: `saveSessionMetadata(sessionId: string, metadata:
  Record<string, string>): Promise<never>`, rejecting with
  `NotImplementedError("save_session_metadata")`.

- [ ] **Step 1: Write the failing tests**

  - `initialDraft — session with an empty venue_name and a visited track that has one — venue pre-filled from the track`
  - `initialDraft — session with its own venue_name — venue is the session's, not the track's`
  - `isDirty — nothing typed — false; one character typed — true`
  - `isDirty — a field changed to a value differing only by surrounding whitespace — false after normalisation`
  - `normalizeDraft — fields with leading/trailing spaces — trimmed; a field cleared — becomes "", never null (C1 §6)`
  - `venueOptions — tracks with duplicate and empty venues — deduped, empties dropped, sorted`
  - `toSavePayload — a draft — carries exactly the nine C1 §6 fields plus session_id, nothing else`

- [ ] **Step 2: Implement**

  The form saves through `ipcStubs.saveSessionMetadata(sessionId, payload)`,
  which rejects with `NotImplementedError`. Surface that honestly ("Saving
  session metadata isn't wired up yet — your changes aren't saved") rather
  than pretending the save succeeded. The read-only tracks-visited summary
  (coalescing repeat visits to one track into one line) is rendered from
  `SessionDetail.track_visits`.

- [ ] **Step 3: Rewrite `docs/IDL0_SPEC.md` §24's metadata-editor section**

  State: the nine editable fields are C1 §6's `session.json` fields; the
  save path is `save_session_metadata` (IPC need 1), not wired to a real
  command in wave 2; the venue pre-fill rule; and that this is a
  whole-block replace (not a sparse patch) once the real command lands.

- [ ] **Step 4: Gate**

  ```
  cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
  ```
  Expected: 7 new tests passed, 0 failed.

- [ ] **Step 5: NUL-byte check**

  ```
  grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' app/src/routes/pages/Data/metadataForm.ts app/src/routes/pages/Data/metadataForm.test.ts app/src/routes/pages/Data/MetadataForm.tsx app/src/routes/pages/Data/DetailPane.tsx app/src/routes/pages/Data/ipcStubs.ts docs/IDL0_SPEC.md
  ```
  Every count must print `0`.

- [ ] **Step 6: CHANGELOG + commit**

  ```bash
  git add app/src/routes/pages/Data/metadataForm.ts app/src/routes/pages/Data/metadataForm.test.ts app/src/routes/pages/Data/MetadataForm.tsx app/src/routes/pages/Data/DetailPane.tsx app/src/routes/pages/Data/ipcStubs.ts docs/IDL0_SPEC.md CHANGELOG.md
  git commit -m "app: Data tab session metadata editor over save_session_metadata stub"
  ```
  Single line, no AI attribution trailer.

## Do not

- Do not pretend the save succeeds — show the "not wired up yet" text.
- Do not invent a tenth field or drop one of the nine.
- Do not use `null` anywhere in the draft or payload — `""` is C1 §6's only
  "not set."
- Do not add rendering tests.
- Do not run `cargo` anything.

## Style / hygiene

Doc comment on every exported symbol; units on every numeric value; A/A/A
tests named `thing — condition — result`. No AI attribution trailer. Never
`git push`.

## Spec discipline (say it out loud in your report)

**Spec-during** — `docs/IDL0_SPEC.md` §24's metadata-editor section
rewritten in this commit, per Step 3.

## Report back (concise)

Commit hash + `git show --stat`; the exact test command and result line;
per-step done/deviated; confirmation the save path is honestly non-
functional in the UI; confirmation the payload carries exactly nine fields
plus `session_id`; confirmation the NUL-byte check printed `0` for every
file; anything ambiguous you resolved (say how) or that needs a lead
ruling.

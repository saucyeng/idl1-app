# L7a Task 7 review — session metadata editor

Worktree: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l7a-data`,
branch `wave2-l7a-data`. Commit under review: `f8a1e54f584423a0120c5bcf9eab792a4bb31edd`
("app: Data tab session metadata editor over save_session_metadata stub"),
on top of merge `43397b9`. In scope: `CHANGELOG.md`,
`app/src/routes/pages/Data/DetailPane.tsx`, `Data/MetadataForm.tsx` (new),
`Data/index.tsx`, `Data/ipcStubs.ts`, `Data/metadataDraft.test.ts` (new),
`Data/metadataDraft.ts` (new), `docs/IDL0_SPEC.md` §24.10. No unrelated
uncommitted changes were present in the worktree at review time. Task 8
work landing concurrently is out of scope and was not present at this
commit.

## Test command and result

```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Data
```

`tsc --noEmit` printed nothing. `vitest` output:

```
 Test Files  13 passed (13)
      Tests  90 passed (90)
```

Reproduces the implementer's reported "90 passed" (7 new tests in
`metadataDraft.test.ts` plus the 83 pre-existing Data-tab tests).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `docs/superpowers/plans/2026-09-05-idl1-wave2-l7a-data-tab.md:520` (Parity gaps table) vs. `docs/IDL0_SPEC.md` §24.10 diff | Dropping idl0's Rider/Bike `Autocomplete` sourcing (the pre-rewrite SPEC text: "Rider — Autocomplete<String> sourced from distinct known rider names. Bike — Autocomplete<String> sourced from distinct known bike names.") is not listed as a row in the plan's Parity gaps table, though it is disclosed honestly in both the CHANGELOG bullet and the rewritten SPEC §24.10 ("Rider and Bike render as plain text fields"). The task's own brief (`brief-task7.md`) never specified rider/bike options either, so this is inherited from the brief, not an implementer slip — but the operating brief §2 rule ("silence is not deferral") was not fully honored at the brief-writing stage. | No code change needed; note in the lane's Parity gaps table for completeness. Not grounds for rework since the drop is disclosed at the point of use. |
| Minor | `Data/DetailPane.tsx:24-58` | `DetailPane` gained its own `list_tracks` fetch-on-mount, duplicating `TrackResults.tsx`'s existing fetch. In practice the two never run concurrently (`index.tsx`'s `filters.view` toggle mounts exactly one of `DetailPane`/`TrackResults` at a time), so this is redundant network traffic on view-toggling, not a correctness bug. | Optional: lift a shared `tracks` fetch to `index.tsx` and pass it down, removing the duplicate `list_tracks` round-trip. Not required for this task. |

No Critical or Important findings.

## Checks performed (all pass)

- **C1 §6 field-for-field match.** `MetadataDraft` (`metadataDraft.ts:8-17`) and
  `toSavePayload` (`metadataDraft.ts:140-149`) carry exactly `rider`, `bike`,
  `bike_comment`, `venue_name`, `event_name`, `event_session`, `tag`,
  `short_comment`, `long_comment` plus `session_id` — verified byte-for-byte
  against `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md:610-677`
  (§6 `session.json`). `toSavePayload`'s own test asserts the exact key set via
  `Object.keys(payload).sort()`.
- **Whole-block replace, never a sparse patch.** `toSavePayload` always emits
  all nine fields (no conditional/optional field); documented as such in both
  the doc comment and the rewritten SPEC §24.10.
- **`""` is the only "not set," never `null`.** `normalizeDraft` trims to `""`;
  no `null` appears anywhere in `metadataDraft.ts`, `MetadataForm.tsx`, or the
  stub's signature (`Record<string, string>`).
- **`isDirty`/`initialDraft` semantics.** `isDirty` normalises both sides
  before comparing (whitespace-only edits don't count as dirty, per its own
  test); `initialDraft` pre-fills `venue_name` via `resolveDisplayVenue` and
  falls back to the session's own non-empty `venue_name` first — matches idl0
  §24.10's rule and the two `initialDraft` tests exercise both branches.
- **`resolveDisplayVenue` call site.** `toVenueLookupSession` adapts
  `SessionDetail` into the `SessionSummary` shape the Task-6 function expects
  without redefining its venue-fallback logic; unrelated fields are filled
  with harmless placeholders documented as "never read." Confirmed
  `resolveDisplayVenue` (not re-read here, trusted from Task 6's landed
  review) is imported, not copied.
- **Save path is honestly non-functional.** `ipcStubs.ts`'s
  `saveSessionMetadata` rejects with `NotImplementedError("save_session_metadata")`
  — no fabricated `IpcError` kind, matching the `saveTrack`/`deleteTrack`
  convention from Task 6 exactly. `MetadataForm.handleSave` always lands on
  `{ status: "not-implemented" }` on rejection and renders "Saving session
  metadata isn't wired up yet — your changes aren't saved" (byte-for-byte
  match to the brief's required text); typed values remain in `draft` state
  after the failed save (no reset, no pretended success).
- **Rename `metadataForm.ts` → `metadataDraft.ts`.** Sound (Windows
  case-insensitive collision with `MetadataForm.tsx`) and applied
  consistently — no residual reference to `metadataForm` anywhere in the
  diff, imports, `CHANGELOG.md`, or the new SPEC text; the CHANGELOG bullet
  states the rename and its reason.
- **No IPC per keystroke.** Every `<input>`/`<textarea>` `onChange` only
  calls `setField`, updating local state; `saveSessionMetadata` is invoked
  only from `handleSave`, itself only reached via the form's `onSubmit`
  (explicit Save click/Enter) — settle-bound per CLAUDE.md §2.
- **IPC-driving effect (operating brief §4 rule).** `DetailPane`'s
  `useEffect` (line ~52) depends only on `loadTracks`, which is
  `useCallback`-memoized with an empty dependency array, so the effect runs
  once on mount and its cleanup only fires on unmount — it is not
  self-cancelling and does not depend on state it dispatches into. This is a
  fetch-on-mount of static reference data (the full track list), not a
  driver making sequencing decisions among multiple in-flight items (the
  import-queue/sandbox pattern the rule targets); no pure driver module is
  warranted here. Judged: rule does not apply; not a finding.
- **Doc comments and units.** Every exported symbol in `metadataDraft.ts` and
  `MetadataForm.tsx` has a doc comment; no bare numeric magic values needing
  units (all fields are strings; `visitCount` is a plain count, documented as
  such).
- **Test names and structure.** All 7 new tests in `metadataDraft.test.ts`
  are named `thing — condition — result` with an em dash, follow
  Arrange/Act/Assert with blank lines between phases, and exercise only the
  pure `metadataDraft.ts` module — no React Testing Library, no rendered-DOM
  assertions.
- **Ownership boundary.** `git show --stat` confirms every touched path is
  under `app/src/routes/pages/Data/**`, `CHANGELOG.md`, or
  `docs/IDL0_SPEC.md` (§24.10 only) — nothing under `rust/`,
  `app/src-tauri/`, `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, or `vite.config.ts`.
- **No new npm dependency.** No `package.json`/lockfile change.
- **Repo hygiene.** Single-line commit message, no AI attribution trailer;
  NUL-byte check (`grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]'`) returned `0`
  for every touched file.
- **CHANGELOG accuracy.** The new bullet accurately describes the rename
  reason, the nine fields, the stub behaviour, and the `DetailPane` prop/fetch
  addition; matches the diff.
- **SPEC §24.10 accuracy.** The rewrite states the nine fields, the venue
  pre-fill rule, the stub save path and message, and the future whole-block
  replace guarantee — a real rewrite, not a one-line stub.

## Verdict rationale

The nine-field metadata draft model matches C1 §6 exactly, field for field,
verified against the schema doc directly rather than taking the CHANGELOG's
word for it; the save path is honestly non-functional with the exact
required message and no fabricated success or error shape; the venue
pre-fill correctly reuses Task 6's `resolveDisplayVenue` through a
documented adapter; the `DetailPane` effect that fetches tracks is a
one-shot mount fetch with a stable, non-self-cancelling dependency, so the
operating brief's IPC-driving-effect Critical does not apply; tests are
pure, correctly named, and reproduce the reported pass count; ownership,
hygiene, and NUL-byte checks are all clean. The two Minor findings (a
Parity-gaps table gap inherited from the brief, and a redundant but
non-concurrent `list_tracks` fetch) do not change a maintainer's decision
to ship this commit as is.

VERDICT: CLEAN

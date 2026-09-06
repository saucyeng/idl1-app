# L8x Task 1 — C3 §3.2/§3.10 + C4 §2/§7 amendment (docs only)

Spec-first. Write the contract before any code exists, so Tasks 2–7 have a
signed shape to build against. **Docs only — no Rust, no cargo.** ONE commit.

## GATE (entry)

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/l8x-data-writes"
git merge-base --is-ancestor 81a7db3 HEAD && echo GATE-OK
```
If it fails, merge `main` into the lane first (R19 pattern). Then STOP if the
merge conflicts anywhere but `CHANGELOG.md`.

## Files to read first

`CLAUDE.md`; this lane's `PLAN.md` §2, §5, §7 (the amendment text is written
there — transcribe it, do not redesign it); C3 §2's error-kind table and its
per-kind command lists, §3.2's `list_tracks`/`get_track`/`rescan_tracks`
entries, §3.10's App group, and §6 items 7 and 10 plus the "Wave-2 amendment
(R59)" block; C4 §2's Staging bullet and §7's repair-actions list;
IDL0_SPEC §16.2, §16.2.a, §16.2.b, §17b.1.

## Where

- Worktree `idl-rs-worktrees/l8x-data-writes`. Do NOT push.
- **Files:** `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`,
  `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md`,
  `docs/IDL0_SPEC.md`, `TASKS.md`, `CHANGELOG.md`.

## What to write

1. **C3 revision log** — the line PLAN §7 gives, at the top of the file.
2. **C3 §3.2** — the `Gate`/`SectorGate`/`NeutralZone`/`GpsFix`/`LapTiming`
   block; the revised `TrackDetail`; `save_track(track: TrackDraft) ->
   SaveTrackResult`; `delete_track(track_id) -> DeleteTrackReport`;
   `list_quarantine()`; `resolve_quarantine(entry_id, action)`. Each entry
   states its args, return, error kinds, and the atomicity/catalog rule from
   PLAN §4 in prose.
3. **C3 §3.10** — `verify_data_dir(repair: boolean) -> VerifyReport`
   (PLAN Q8). Say why it is App and not Catalog.
4. **C3 §2** — add the new command names to the `not_found`, `io`,
   `invalid_argument` and `internal` rows. **Do not add a kind.**
5. **C3 §6** — mark item 10 **CLOSED** (naming this task and the landed
   `track_artifact::model::Track`), and strike the R59 block's
   `list_quarantine`/`resolve_quarantine` and `save_track`/`delete_track`
   deferrals, replacing each with a one-line "landed 2026-09-06 (L8x)" note.
   Leave `fetch_histogram` and `fetch_scatter_points` deferred.
6. **C4 §2** — the `tmp/quarantine/<uuid>.json` sidecar, additive.
   **C4 §7** — the hash-mismatch repair bullet gains the sidecar sentence and
   names `verify_data_dir(repair: true)` as the only caller.
7. **IDL0_SPEC §24.12** — one idl1 paragraph: the wave-2 Track Detail Card
   edits name/venue and deletes over `save_track`/`delete_track`; the
   map-based gate editor stays wave 3 (R54); a track write returns
   `stale_session_ids` and the card offers Rescan rather than rescanning
   itself.

## Do not

- Do not add an `IpcErrorKind` — every kind these commands need exists.
- Do not write Rust, and do not run cargo.
- Do not restate x1e7 anywhere in C3: the IPC surface is decimal degrees and
  the scaling stays a `.idl0t` file detail (SPEC §17b.1).

## Checks

```bash
grep -c -P '[\x00-\x08\x0B\x0C\x0E-\x1F]' <each file touched>   # must print 0
grep -n "unknown" docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md | grep -i track
```
The second must return nothing — no `unknown` survives in a track shape.

## Spec discipline

**spec-first.** This task *is* the spec change. `TASKS.md` gains the L8x
task list; `CHANGELOG.md` gains one bullet.

## Steps

- [ ] 1. Gate. 2. C3 §3.2 + §3.10 + §2 + §6. 3. C4 §2 + §7.
      4. IDL0_SPEC §24.12. 5. `TASKS.md`/`CHANGELOG.md`. 6. NUL check.
      7. Commit `docs: C3/C4 amendment for L8x Data-tab write commands`.

## Report back (≤15 lines)

Commit hash + `git show --stat`; the C3 section numbers you touched; the
`grep` results for both checks; confirmation that no `IpcErrorKind` was
added and that no track field is still typed `unknown`; anything in PLAN §7
you could not transcribe without a ruling.

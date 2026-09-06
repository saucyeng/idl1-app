# L2b — lap indexing at import (plan, 2026-09-06)

Repo `idl1-app`, submodule `rust/` = idl-rs at `c893ba7`. Worktree `saucyeng/idl-rs-worktrees/l2b-laps`, branch `wave3-l2b-laps`. Eight tasks, serial, one cargo process. Gates after T4 and at the lane merge.

## 1. What is already landed (do not rebuild it)

The algorithm exists and is tested; only the wiring is missing. `core::laps::{detect_laps, find_crossings, renumber_session_laps, gate_synthesis, distance}`; `core::tracks::{detect_visits, VisitParams, TrackRef}`; `core::track_artifact::{read_track, write_track, Track}`; `store::session_json`'s `LapJson`/`SectorJson`/`NeutralZoneVisitJson`/`TrackVisitJson`, already matching C1 §6 field for field; `store::catalog::rebuild_catalog` steps 4–5 (`laps`, `lap_summary`, `sessions.lap_count`), which already read `session.json.laps[]` and already work; `catalog_read::list_laps`; CLI `idl-rs laps` / `idl-rs visits`.

The single gap: `store::import::finish_import` writes `empty_session_json` and stops, so `laps[]`/`track_visits[]` are always `[]` — confirmed in the landed file `C:\tmp\idl1-data-l5\data\sessions\d365a19ae7ef2dc2d087a5887371281f\session.json`. Nothing in the catalog needs new logic. It has simply never been fed.

## 2. The pipeline — decision

**Laps are written into `session.json` at import, as a stamped cache, not as a content-addressed derived artifact.** Reasons in order of authority:

1. C1 §6 already contracts it: "*top-level `laps[]` in `session.json` is a cache*", assigned to L1, mirroring `TrackVisit.laps`. The shape is signed.
2. The design's "sync outputs only when content-addressed by their inputs" governs `derived/<hash>.parquet` (C1 §5) — heavy sample arrays. Laps are a few hundred bytes living beside the rider's own lap flags (`main_lap_number`, `ignored_lap_numbers`) in the same file. Splitting them would put a foreign key across a sync boundary.
3. `rebuild_catalog` already reads them there; a derived-file design would mean rewriting landed, reviewed catalog steps.
4. IDL0_SPEC §17.4 is the ported semantics: detection runs on import, results cache with their visits, a rescan re-runs.

**Staleness is a stamp, not a hash-named file.** `session.json` already carries `track_visits_library_hash`; T2 adds `lap_detector_version` beside it (additive C1 §6 amendment). Either differing from current makes the cache stale.

**Flow, in `finish_import` after `data.parquet` lands:**

```
SessionHandle::from_session(session)     // already in memory, no Parquet re-read
  → load <data>/tracks/*.idl0t via track_artifact::read_track
  → track_library_hash(&tracks)          // port of idl0 trackLibraryHash
  → tracks::detect_visits(handle, refs, VisitParams::default())
  → per window: resolve Track; if it has lap_timing,
      laps::detect_laps(handle, timing, sector_gates, neutral_zones,
                        Some((start_ms, end_ms)))
  → TrackVisitJson { visit_id (deterministic), track_id, start, end, laps }
  → laps::renumber_session_laps(&visits, &ignored) → top-level laps[]
  → merge into the existing session.json, write atomically
```

**Honest empty.** No `tracks/` directory, an empty library, no matching window, or a matched track with `lap_timing: None` all give `track_visits: []` / `laps: []` **and still write the stamp**, so "ran and found nothing" is recorded and the Data tab's "—" is a fact rather than a missing feature. Per-visit detection failure is non-fatal (idl0's `_visitsWithLaps` swallows it); the whole step is non-fatal to the import and surfaces as a warning.

**Never clobber.** The merge touches five fields only: `track_visits`, `laps`, `track_visits_library_hash`, `lap_detector_version`, and the lap-flag fields when they no longer resolve (Q3). Rider, bike, venue, comments, gates and `bike_profile_snapshot` are carried through verbatim.

**Rescan.** `reindex_laps(data_root, session_id)` rebuilds the handle from `data.parquet` via `read_session_parquet` + `SessionHandle::from_session` and runs the same inner function, so import and rescan cannot diverge. This is IDL0_SPEC §17.4's "Rescan Tracks" and backs T8's command and the CLI subcommand.

**`rebuild_catalog` needs no change** — it walks `sessions/*/` and reads `session.json`. T4 adds the incremental path so one import does not force a full walk.

## 3. Tasks

Each ≤1 day, TDD, one commit, review after each. Targeted filter must report a non-zero `passed`. `cargo check -p idl-rs-cli --tests` on T1–T4 (`pub` changes in `core`).

| # | Task | Filter | Spec |
|---|---|---|---|
| T1 | `store::lap_index` pure core: `track_library_hash`, `load_track_library`, deterministic `visit_id`, `compute_lap_index` | `store::lap_index::` | spec-first (IDL0_SPEC §17.4 rewrite) |
| T2 | `LAP_DETECTOR_VERSION`, session.json merge, `index_laps`/`reindex_laps`, flag reconciliation | `store::lap_index::` | C1 §6 amendment, spec-during |
| T3 | Wire into `finish_import`; `ImportReport.lap_index`; CLI `idl-rs rescan` | `store::import::`, `rescan` | spec-during (§15a, §29.6) |
| T4 | Incremental catalog: extract `index_session` from `rebuild_catalog`, call after import | `store::catalog::` | C4 §5 note. **GATE** |
| T5 | Type `LapDetail.sectors`/`.neutral_zone_visits` concretely; close C3 §6 item 11 | `commands::catalog::` | C3 §3.2 + §6, C1 §6 |
| T6 | `fetch_fft` real `lap`: drop `reject_non_null_lap`, add `resolve_lap_window` | `commands::rasters::` | C3 §3.6 amendment |
| T7 | R73 multi-overlay: `MathLapContext.overlay` → `Vec<MathOverlay>`; fix the R73 `Arc` note | `math::`, `session_source::` | C2 §3.5 + C3 §3.4 |
| T8 | `rescan_tracks` Tauri command; TASKS/CHANGELOG cleanup | `commands::catalog::` | C3 §3.2. **GATE** |

Gate at T4 and T8, foreground, once, tee'd: `cargo test -p idl-rs -p idl-rs-cli -- --test-threads=4`, then `cargo test -p idl-rs-tauri`.

## 4. What this unblocks in the UI (lead's shell tasks)

1. **Data tab lap tables** — `SessionDetail.laps` and `list_laps` return rows; R53 Q4's "—" placeholder and its CHANGELOG caveat come out. Lap-time facets and per-track aggregates become real.
2. **`sessions.lap_count`** stops being `null`, so the session list's lap column lights up.
3. **Notebook `lap_context`** — `eval_workbook` stops rejecting every non-null context, so `AppState.selection` (R53 Q3's slice, already built) threads through for real.
4. **`fetch_fft lap`** — the FFT cell scopes to one lap (T6).
5. **`MathOverlay`** becomes reachable, and multi-lap overlays work (T7).
6. **Tracks view** — `laps.track_id` populates, so per-track counts render.
7. **A "Rescan tracks" action** on the Data tab's maintenance panel (T8).

Items 1, 2 and 6 need no UI change — those display paths are already written against empty data. Items 3–5 and 7 are small follow-on UI tasks. T5, T6 and T8 each report the exact `app/src/ipc/` declaration the lead must apply.

## 5. Contract and SPEC amendments

- **C1 §6** — add `lap_detector_version: string | omitted`; state that the importer writes `laps[]`/`track_visits[]` and the two stamps are the cache key (T2). Fill in the `sectors[]`/`neutral_zone_visits[]` element fields (T5).
- **C3 §3.2** — retype `LapDetail`'s two `unknown[]` fields; add `rescan_tracks(session_id)` (T5, T8). **§6 item 11** closed by T5, and R53 Q5 with it.
- **C3 §3.6** — drop `fetch_fft`'s "`lap` must be null in practice" (T6). **C3 §3.4 / C2 §3.5** — the R73 multi-overlay shape (T7).
- **C4 §5** — note the per-session `index_session` path; `rebuild_catalog` remains the authority and the recovery path (T4).
- **IDL0_SPEC** — §17.4 rewritten for idl1's import-time indexing (T1); §15a and §29.6 gain the import step and the `rescan` subcommand (T3, T8).

## 6. Open questions for the lead

**Q1 — `session.json` cache or content-addressed derived file?** Recommend **session.json**, per §2's four reasons. *Cost if wrong:* the file carries a derived value that LAN sync ships between peers; mitigated because both stamps travel with it, so a peer can tell whether to trust it or re-run.

**Q2 — add `lap_detector_version` to C1 §6?** Recommend **yes**, additive and optional, seeded `"1"`, no schema-version bump. Without it the only invalidation signal is the library hash, so a detector bug fix would never re-run on already-imported sessions. *Cost if wrong:* one ignorable string.

**Q3 — lap flags when a re-index renumbers laps?** Recommend **clear the unresolvable ones and report the counts**: `main_lap_number`, `reference_lap_number`, `starred_lap_number` to `null`; `ignored_lap_numbers` filtered; `overlay_lap_key` untouched (it names another session). Leaving them dangling is worse, because `load_lap_context`'s `selection = None` branch reads `main_lap_number` verbatim without validating it, so a dangling number silently mislabels a math result. *Cost if wrong:* a rider loses a starred-lap mark after a track edit.

**Q4 — `visit_id` random UUID (idl0) or deterministic?** Recommend **deterministic**: 16 hex chars of `sha1(track_id:start_ms:end_ms)`. idl0 minted a UUID app-side; in idl1 a random id would change on every rescan, so a synced `session.json` would conflict on content that did not change. *Cost if wrong:* an id collision between two visits to one track with identical bounds, which cannot occur.

**Q5 — does import re-index on `ImportPlan::Skip`?** Recommend **yes, but only when the stamp is absent or stale**. Re-importing the same file should not leave a session lapless because `data.parquet` was already there, and it is how already-imported sessions pick laps up. *Cost if wrong:* a few hundred ms of GPS geometry on a duplicate import.

**Q6 — R73's multi-overlay shape.** Recommend `MathLapContext.overlay: Vec<MathOverlay>` (today `Option<MathOverlay>`), the evaluator's lap-aware functions folding over it. Smaller than amending `MathOverlay` to hold several windows, and it matches C3's `overlay_laps: number[]` one to one. *Cost if wrong:* a C2 evaluator signature moves again in wave 3.

**Q7 — where does `fetch_fft`'s lap window come from?** Recommend a sibling in `session_source.rs`, `resolve_lap_window(data_root, session_id, lap) -> (f64, f64)` in recording-time seconds, reusing `unknown_lap` for the error. `reject_non_null_lap`'s own doc comment already proposes exactly this. *Cost if wrong:* a second lap-lookup path to keep in step with `load_lap_context`.

**Q8 — `rescan_tracks` in this lane or wave 3?** Recommend **this lane (T8)**. Track *write* commands are deferred to wave 3 (R53), but rescan only reads the existing library and rewrites one `session.json`; without it a rider who adds a track after importing can never get laps for older sessions. *Cost if wrong:* one command lands early.

**Q9 — not for this lane to resolve.** `runs/2026-09-05/QUESTIONS-FOR-ISAAC.md` item 7 asks Isaac whether lap indexing should move up the Rust track at all. This plan assumes it has; if the answer is wave 3, the lane parks intact. Item 11 (disk headroom) still blocks any Tauri preview build — T5–T8 do not need one, but the lane's visual confirmation does.

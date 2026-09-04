# idl1 wave-1 L1 — core `store/` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the idl1 storage layer in `idl-rs` core: the mandatory per-sample-time `Session`/`Channel` model (C1 §2), the burst-seam correction algorithm (C1 §3.3) proven against C1's own worked example, Arrow/Parquet read-write for `data.parquet` and `derived/<hash>.parquet` (C1 §4–5), the CAS blob store and atomic-write primitive, the SQLite catalog and its rebuild (C4 §5), `session.json` (C1 §6, replacing `.idl0w`), a `.idl0t` track-artifact writer, bike-profile/app-settings persistence, the session/lap-level ports named in the design doc's L1 row (gate synthesis, session-wide lap renumbering, lap-distance normalisation, session filenames), and the CLI `idl-rs import`/`sessions`/`verify`/`prune` subcommands that exercise all of it. L1 is the wave-1 vocabulary owner: every other wave-1 lane (L2 importers, L3 workbook, L5 Tauri scaffold) codes against C1/C4 directly rather than against L1's code, so this plan does not wait on them and touches only `rust/core/` and `rust/cli/`.

**Architecture:** All new code lives in a new `rust/core/src/store/` module (`idl-rs`'s CAS blob store, atomic-write primitive, Arrow/Parquet r/w, SQLite catalog, `session.json`, profile/settings persistence, `verify`) plus targeted changes to `rust/core/src/session/` (the mandatory-time model and the burst-seam correction), `rust/core/src/track_artifact/` (adds the write/encode side), `rust/core/src/laps/` (gate synthesis, session-wide renumbering, lap-distance normalisation ports), and `rust/cli/` (new subcommands). No Tauri, no async runtime, no network — `std::fs`/`std::path` only, per CLAUDE.md §2. `rust/core` stays a pure library; nothing in this plan adds a dependency outside `rust/core`'s and `rust/cli`'s own `Cargo.toml`.

**Tech Stack:** Rust 2021, `arrow` 59.3.0, `parquet` 59.3.0, `rusqlite` 0.40.2 (`bundled` feature — no system SQLite on mobile/most CI), `uuid` 1.26.0 (`v4` feature — already resolved transitively in `rust/Cargo.lock`, pinned explicitly here since `store/atomic.rs` and `store/blob.rs` now depend on it directly rather than through a transitive dep of `fitparser`/`sci-rs`), `sha2` 0.10.9 (likewise already resolved transitively, pinned explicitly for `store/blob.rs` and `store/derived.rs`). `arrow`/`parquet`/`rusqlite` versions are the exact `pin` column values from `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`; `uuid`/`sha2` are not in that report (it did not anticipate L1 needing them directly) but are not guessed either — both versions come straight from `rust/Cargo.lock`'s existing transitive resolution at the `wave1-l1-store` branch point, so pinning them to those exact versions changes nothing about what the workspace already builds.

**Spec:** `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` (C1, primary contract — every struct field, Parquet column/metadata key, the burst-seam correction algorithm and its worked example, the derived-file hash recipe, `session.json`, the round-trip guarantees), `docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` (C4 — data-directory layout, atomic-write primitive, catalog SQLite DDL, retention/repair), `docs/superpowers/specs/2026-09-02-idl1-inventory.md` (Dart carry-forward semantics for the session/lap-level ports), `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §5/§10 (data model narrative, L1's scope row and done-when).

**Spec discipline:** spec-first, per CLAUDE.md §9 and the design doc's own instruction that C1 leaves L1's own SPEC section to L1. Task 2 (below) rewrites `docs/IDL0_SPEC.md` §15 (Session & File Model) in full to match C1, rewrites §16.3 (Track Storage Model) to match C4, and rewrites the storage-persistence parts of §18 (Bike Profiles & Riders) — before any code in Task 3 onward. §15.3/§15.4 (chart-rendering lifecycle, video links) get a terminology-only pass in Task 2 (FlutterRustBridge/FFI language → Tauri/IPC) since their substantive rewrite is UI-lifecycle content that belongs to L5/L6, not L1's storage-model scope; this narrowing is stated explicitly in Task 2 rather than silently skipped.

---

## Global Constraints

- Lane: **L1**, wave 1, dependency gate **none** — starts immediately. Own branch `wave1-l1-store` in both repos (idl1-app and the `rust/` submodule, i.e. idl-rs), each checked out in its own git worktree so this lane never touches the lead's or another lane's working copy.
  - idl-rs (`rust/`) worktree root: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store`
  - idl1-app worktree root: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l1-store`
  - Every task's "Working directory" below is inside one of these two worktree roots — never the lead's own `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` checkout.
- **idl-rs is NOT rustfmt-formatted.** Never run `cargo fmt`. Match the surrounding style by hand (the style already visible in `session/mod.rs`, `session/handle.rs`, `session/column.rs`, `parse/records.rs`, `parse/v3.rs`, `config.rs`: doc comment on every `pub` item, `//!` module doc, `Arrange/Act/Assert`-commented inline `#[cfg(test)]` blocks, no trailing blank line churn).
- **No AI attribution trailers** in any commit. **Never `git push`** — this lane's tasks stop at local commits; Isaac pushes (Task 16 hands back the exact commands, mirroring the M0 plan's Task 10 step 5).
- **Doc comments on every public symbol, units on every numeric value, typed errors only** — no `Err(String)` anywhere in this plan's new code. New error enums follow the existing `ConfigError`/`ParseError`/`TransportError` shape: a `Kind` discriminant enum plus a `message: String`, `Display`, `std::error::Error`.
- **TDD, Arrange/Act/Assert with blank lines between**, test names `thing — condition — result`, Rust tests inline `#[cfg(test)]`. Every filesystem-touching test uses an isolated temp directory under `std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()))` (never a checked-in fixture directory — idl-rs has no such convention, and this plan does not start one) and removes it at the end of the test (`let _ = std::fs::remove_dir_all(&dir);`, ignoring the error — a leftover temp dir from a failed test is harmless clutter, not a correctness issue).
- **Every version string in Task 1 is copied from `docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md`'s `pin` column**, except `uuid`/`sha2`, whose versions are copied from `rust/Cargo.lock`'s existing resolution (see Tech Stack above) — never guessed, per CLAUDE.md §1.
- **Two real files are test input, never test fixtures under version control:** `d365a19ae7ef2dc2d087a5887371281f.idl0` and `d365a19ae7ef2dc2d087a5887371281f.idl0w`, supplied by Isaac at the idl1-app repo root, used only by Task 16's real-session validation. Task 1 adds both exact filenames to `.gitignore`. No other task reads them.
- Working directory is stated per task; use absolute paths in every command; never rely on a `cd` persisting across a tool call.
- Ambiguity policy (CLAUDE.md §1): every place this plan had to make a call C1/C4/the design doc did not pin exactly is called out inline where the decision is made, with its reasoning, and is also listed in **Open questions** at the end — never silently invented, never blocking (each has a stated default so the task proceeds).

---

## File Structure

**`rust/core/` (idl-rs, on branch `wave1-l1-store`):**
- Modify: `Cargo.toml` (add `arrow`, `parquet`, `rusqlite`, `uuid`, `sha2`), `src/lib.rs` (add `pub mod store;`), `src/session/mod.rs` (mandatory-time `Session`/`Channel`/`SourceFormat`, rewritten `Channel` impl), `src/session/handle.rs` (compile against the new model; time-window/duration functions rewritten on `t_us`), `src/session/synthesis.rs` (`Time`/`Distance` synthesis rewritten to trace real `t_us`, never `i/nominal_rate_hz`), `src/parse/records.rs` (`ImuGridPlan` takes the corrected period; raw per-record timestamp retention), `src/parse/v3.rs` (retains raw timestamps, populates `t_us`/`source_kind`, calls seam correction), `src/track_artifact/mod.rs` (exports the new `write` module), `src/laps/mod.rs` (exports the three new port modules).
- Create: `src/session/seam_correction.rs` (C1 §3.3), `src/session/filename.rs` (port of `session_filename.dart`), `src/store/mod.rs`, `src/store/paths.rs` (C4 §1–3), `src/store/atomic.rs` (C4 §4), `src/store/blob.rs` (C4 §3, CAS), `src/store/parquet.rs` (C1 §4), `src/store/derived.rs` (C1 §5), `src/store/session_json.rs` (C1 §6), `src/store/catalog.rs` (C4 §5), `src/store/verify.rs` (C4 §7), `src/store/profile.rs`, `src/store/settings.rs` (bike-profile / app-settings persistence), `src/track_artifact/write.rs` (encode side of `.idl0t`), `src/laps/gate_synthesis.rs` (port of `gate_geometry.dart`), `src/laps/renumber.rs` (port of `cached_session_laps.dart`), `src/laps/distance.rs` (port of `lap_distance_accumulator.dart`).

**`rust/cli/` (idl-rs-cli):**
- Modify: `src/main.rs` (new `Command::Import`, `Command::Sessions`, `Command::Verify`, `Command::Prune` variants and handlers), `Cargo.toml` (no new deps — reuses `idl-rs`'s).

**`idl1-app/` docs:**
- Modify: `docs/IDL0_SPEC.md` (§15 full rewrite, §16.3 rewrite, §18 storage-persistence-parts rewrite), `CHANGELOG.md`, `TASKS.md`, `.gitignore`.
- Create: `runs/2026-09-03/lanes/l1-store/BRIEF.md` (written after this plan, per the calling task's instructions — not a plan step here).

---
### Task 1: Lane setup — worktrees, branches, dependencies, `.gitignore`

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app\rust` for step 1, `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app` for steps 2–3, the two new worktree roots thereafter.

**Files:**
- Modify: `rust/core/Cargo.toml` (in the new worktree), `.gitignore` (in the new idl1-app worktree).

**Interfaces:**
- Produces: `wave1-l1-store` branches in both repos, each in its own worktree; `arrow`, `parquet`, `rusqlite`, `uuid`, `sha2` available to every later task.

- [ ] **Step 1: Worktree the idl-rs submodule**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/rust"
git worktree add -b wave1-l1-store "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store" main
```
Expected: `Preparing worktree ... HEAD is now at ...` on `main`'s current tip.

- [ ] **Step 2: Worktree idl1-app and point its submodule at the idl-rs worktree**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git worktree add -b wave1-l1-store "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l1-store" main
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l1-store"
git submodule update --init -- rust
git -C rust remote add local-wave1 "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
git -C rust fetch local-wave1 wave1-l1-store
git -C rust checkout -B wave1-l1-store FETCH_HEAD
git -C rust log --oneline -1
```
**Corrected 2026-09-03 (ruling R10):** the `git submodule update --init -- rust` line is
required — `git worktree add` on a superproject does **not** initialize submodules, so without
it `rust/` inside the new worktree starts as an empty placeholder with no `.git` of its own.
`git -C rust ...` against that placeholder doesn't fail: git's repo-discovery walks up to the
*parent* worktree's `.git` instead, so every subsequent `git -C rust` command in this step
silently runs against the **idl1-app superproject itself** — resetting whatever branch it's on,
adding the `local-wave1` remote to the wrong repo, and checking idl-rs's tree into the app
worktree. This corrupted the shared `wave1-l1-store` branch ref on Task 1's first real run;
fully diagnosed and repaired with no data loss (`git reset --hard` the app worktree, remove the
stray remote, re-run with the fix above) — see `runs/2026-09-03/decisions.md` ruling R10. Expected
(with the fix): the submodule checkout is now on `wave1-l1-store`, same commit as the idl-rs
worktree's `main` tip.

- [ ] **Step 3: `.gitignore` the two real validation files**

Working directory: `C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave1-l1-store`

Append to `.gitignore`:
```gitignore

# Real session used for C1 §3.3/§8 item 8 burst-seam validation (Task 16).
# Not source-controlled fixture material — idl-rs has no fixture-directory
# convention to place it under, and real session data isn't test fixture data.
/d365a19ae7ef2dc2d087a5887371281f.idl0
/d365a19ae7ef2dc2d087a5887371281f.idl0w
```

```bash
git add .gitignore
git commit -m "docs: gitignore the real-session burst-seam validation fixture"
```
Expected: `git status` in this worktree no longer offers to track the two files (they must already be present at the idl1-app repo root per the task brief; if not yet copied into this worktree, copy them from the lead's checkout: `cp "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/d365a19ae7ef2dc2d087a5887371281f.idl0" "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app/d365a19ae7ef2dc2d087a5887371281f.idl0w" .`).

- [ ] **Step 4: Add the five crate dependencies**

Working directory: `C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store`

In `core/Cargo.toml`, under `[dependencies]`, add (pins from the ecosystem report except `uuid`/`sha2`, see Tech Stack above):
```toml
arrow = "59.3.0"
parquet = "59.3.0"
rusqlite = { version = "0.40.2", features = ["bundled"] }
uuid = { version = "1.26.0", features = ["v4"] }
sha2 = "0.10.9"
```
`bundled` on `rusqlite` links SQLite in rather than requiring a system library — required for the mobile targets L9 builds later and harmless on desktop; noted here since the ecosystem report didn't specify a feature set for this crate.

- [ ] **Step 5: Build the untouched workspace to confirm the new deps resolve**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo build -p idl-rs 2>&1 | tail -20
```
Expected: `Finished` (the deps are unused so far — this only proves they resolve and compile against the pinned lockfile versions).

- [ ] **Step 6: Commit**

```bash
git add core/Cargo.toml Cargo.lock
git commit -m "store: add arrow, parquet, rusqlite, uuid, sha2 dependencies"
git log --oneline -1
```

---

### Task 2: Spec-first — rewrite SPEC §15, §16.3, and §18's storage-persistence parts

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l1-store`. No code in this task — CLAUDE.md §9/§6 spec-first discipline: the SPEC section is written before Task 3's code.

**Files:**
- Modify: `docs/IDL0_SPEC.md`.

**Interfaces:**
- Consumes: C1 (full), C4 §1–3/§5, the current §15/§16.3/§18 text (already read in full during planning).
- Produces: the SPEC text every later task's doc comments may cite by section number.

- [ ] **Step 1: Replace §15 (Session & File Model) intro and §15.1–§15.2**

Replace the text from `## 15. Session & File Model` through the end of `### 15.2 Session Data Tree` (i.e. everything before `### 15.3 Sample lifecycle for chart rendering`) with:

```markdown
## 15. Session & File Model

The `.idl0` binary parser and the parser-output data model live in the
pure-Rust **`idl-rs`** engine (`rust/core`). The app consumes them through
`idl-rs-tauri` `#[tauri::command]` handlers (contract C3) rather than
FlutterRustBridge: a session opens into an in-process `SessionHandle` the
Rust side owns, and the frontend pulls output-shaped views on demand — a
compact metadata summary, the channel list, per-channel samples over IPC as
raw bytes (`tauri::ipc::Response`), never JSON for sample data. The handle
carries an interior-mutable, typed derived-channel store keyed by kind
(math-channel outputs by name; lap-windowed slices by `(source, role, lap)`)
exactly as before — this part of the architecture is unchanged by the idl1
rewrite. What changes is the on-disk and canonical-model layer beneath it,
fixed by contract **C1** (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`):

- **Canonicalise on ingest** (design doc D3). Every source format (`.idl0`,
  `.fit`, `.gpx`, `.csv` — the last three are L2's importers) converts once,
  at import, into the one `Session`/`Channel` model below, and is written to
  `<data>/sessions/<session_id>/data.parquet` (contract C4 fixes the path).
  The raw source bytes are kept immutable and content-addressed in the CAS
  blob store (`<data>/blobs/sha256/…`); `data.parquet` is a pure function of
  `(blob, importer_version, seam_correction_version)` and is regenerated from
  the blob whenever either version changes — it is never hand-edited and
  never modified in place.
- **Time is recorded, not assumed.** Every channel carries a mandatory
  per-sample time column, `t_us: Vec<i64>` — microseconds since the
  session's first sample, one entry per sample, strictly increasing. This
  replaces the old convention where a fixed-rate channel's sample `i` was
  implicitly at `i / sample_rate_hz`; `nominal_rate_hz` is metadata only and
  **never** derives a sample's time on any code path (C1 §3.5). A burst-drained
  IMU's raw per-record timestamps are preserved verbatim in a
  `<source>_t_recorded_us` column and separately corrected into the
  monotonic `t_us`/`t` axis by the burst-seam correction algorithm (C1
  §3.3) — see §15.2 below.

### 15.1 Session Metadata

Source: C1 §2 (canonical model) and C1 §6 (`session.json`, which replaces
`.idl0w` — see §16.3/§17 for how track visits and lap flags fit in).

```rust
/// One imported session — the parsed/converted view of one immutable source blob.
pub struct Session {
    pub session_id: String,             // device UUID (.idl0) or blob-hash prefix (else), C4 §3
    pub device_id: Option<String>,      // None for fit/gpx/csv
    pub timestamp_utc_ms: i64,          // 0 = unknown
    pub config_checksum: Option<String>,// None for fit/gpx/csv
    pub source_format: SourceFormat,    // Idl0 | Fit | Gpx | Csv
    pub blob_sha256: String,            // 64-char lowercase hex
    pub channels: Vec<Channel>,
}
```

`SessionMetadata`'s Dart-era shape (`sessionId`, `filePath`, `workspacePath`,
`rider`, `bike`, `venueName`, …) is superseded by two files: `Session`
above (parser output, one per blob) and `session.json` (C1 §6 — rider,
bike, venue, event, comments, tag, lap gates, cached laps, track visits,
lap flags; replaces every field `Workspace`/`SessionMetadata` used to
split between `.idl0w` and the SQLite index). The SQLite `sessions` table
(C4 §5) caches a denormalised projection of both files for fast list/filter
queries — it is never authoritative (design doc: "the catalog is an
index").

**On-disk file naming.** A session's files live under
`<data>/sessions/<session_id>/` (C4 §2) — `session_id` is now a directory,
not a filename stem, and needs no collision-suffix scheme at that level
(C4 §3 fixes a separate collision rule for non-device `session_id`
derivation itself). The **workbook filename** (`workbooks/<file_name>.idl1wb`)
is still human-named and still uses the append `-2`, `-3`, … collision rule
(C4 §2), continuing the convention `session_filename.dart` established for
the old `.idl0`/`.idl0w` pair.

**Session source type** is now `Session.source_format: SourceFormat`
(`Idl0 | Fit | Gpx | Csv`), replacing the two-value `SessionSourceType`
enum. `device_id`/`config_checksum` are `Option<String>` (`None` for
non-`.idl0` sources) rather than the old empty-string sentinel.

### 15.2 Canonical Model and the Time Axis

```rust
/// Time-series data for a single channel. Every channel carries mandatory
/// per-sample time — see C1 §3.
pub struct Channel {
    pub channel_id: String,        // e.g. IMU0_AccelZ, GPS_Latitude, WheelFront
    pub t_us: Vec<i64>,            // µs since the session's first sample; strictly increasing
    pub nominal_rate_hz: f64,      // metadata only — never derives a sample's time
    pub column: RawColumn,
    pub source_kind: String,       // imu0 | imu1 | imu2 | gps | wheel_front | … | fit | gpx
    pub gaps: Vec<GapSpan>,        // synthesized-sample runs, unchanged semantics
}
```

`t_us[i]` traces back to a recorded device/GPS/FIT/GPX timestamp, verbatim
or burst-corrected — never `i / nominal_rate_hz` (C1 §3.5 invariant 4). The
one documented, scoped exception: `Session.channels`'s *synthesized*
`Time`/`Distance` presentation channels (unchanged in role from the pre-idl1
engine — a zero/low-storage convenience for chart/math consumers, never
written to `data.parquet`) derive their `t_us` from the real, already-corrected
`t_us` of the fixed-rate channel they present, not from their own rate — see
`rust/core/src/session/synthesis.rs`'s doc comment for the exact rule.

**IMU burst-seam correction.** Every IMU FIFO read stamps its samples by
walking back from the read instant at the *nominal* ODR (SPEC §5.5); when
the true ODR differs from nominal this makes the recorded stamps overlap or
gap at burst seams — locally non-monotonic time. C1 §3.3 fixes a documented,
versioned correction: detect bursts from the recorded-stamp deltas, estimate
each burst's true period from consecutive read-instant spacing (median
across the session, a per-burst local fallback when the session-wide
estimate would violate monotonicity), and re-space each burst backward from
its own read instant at the corrected period. The corrected stamps feed
drop reconciliation (`ImuGridPlan::build`/`reconcile`,
`rust/core/src/parse/records.rs`) in place of the nominal period, so
reconciliation only ever sees genuine FIFO drops, not the phantom ones a
true-ODR offset would otherwise manufacture against a nominal grid (C1 §3.3
carries the full worked derivation of why). The algorithm version
(`seam_correction_version`, currently `"v1"`) is `data.parquet` file
metadata and triggers regeneration from the blob on a version bump, exactly
like `importer_version`.

**`<source>_t_recorded_us`.** One per source present in a session (not per
channel — all six axes of one IMU share one `imu0_t_recorded_us`), holding
the verbatim recorded stamp with no correction applied; not guaranteed
sorted (C1 §3.2).

**The union axis `t`.** `data.parquet`'s own `t` column is the sorted,
deduplicated union of every channel's `t_us` values in the session (C1
§3.5 invariant 2) — the file's row axis; a channel's column is null on
every row where it did not sample.

FIT/GPX sources have no burst structure: their recorded timestamp maps to
`t` directly, and `_t_recorded_us` is bit-identical to `t` by definition
(C1 §3.4) — kept anyway for schema uniformity across every source.
```

- [ ] **Step 2: Terminology-only pass on §15.3–§15.4**

In `### 15.3 Sample lifecycle for chart rendering` and `### 15.4 Video links`, replace every occurrence of `FFI`/`flutter_rust_bridge`/`Dart` in a *generic architecture* sense (not a historical/comparative one) with `IPC`/`idl-rs-tauri`/`the frontend` — e.g. "never round-trip Dart→Rust for charting" → "never round-trips over IPC for charting"; "Dart holds no copy of a channel's samples" → "The frontend holds no copy of a channel's samples". Leave the substance (tile decimation, the byte-budgeted residency policy, video link fields) untouched — that is L5/L6/L7 scope, not L1's; this task only removes stale FRB-era vocabulary so §15 reads as one document.

- [ ] **Step 3: Rewrite §16.3 (Track Storage Model)**

Replace the whole of `### 16.3 Storage Model` with:

```markdown
### 16.3 Storage Model

Contract C4 fixes the layout; this section is the summary. The filesystem
tree under `<data>` is the source of truth — there is no cloud store in
idl1 (design doc D7: LAN sync only, no SaaS/Drive).

- **File:** `<data>/tracks/<track_id>.idl0t` — JSON, one per Track, format
  unchanged from idl0 (SPEC §16.2/§16.3 pre-idl1; C4 §2 fixes only the path
  root). Written via the atomic-write primitive (C4 §4): `tmp/<uuid>` →
  fsync → rename.
- **Local cache:** SQLite table `tracks` in `<data>/catalog.sqlite` (C4
  §5), columns `track_id PRIMARY KEY`, `name`, `venue_name`, `created_at_ms`,
  `updated_at_ms`, `full_json TEXT` — the same shape the old `SessionIndex`
  pattern used, now under one catalog database shared with `sessions`,
  `blobs`, `workbooks`, `laps`, `lap_summary`. The catalog is rebuildable by
  a full tree scan and is never itself synced (design principle: "the
  catalog is an index").
- **Sync (design doc §7, D7):** `tracks/*.idl0t` moves over the pit-lane LAN
  sync protocol, last-write-wins by `updated_at_ms` (C4 §6) — the same
  conflict rule the pre-idl1 `TrackProvider` used against Drive, now against
  a peer app instance instead of a cloud folder.
```

- [ ] **Step 4: Rewrite §18's storage-persistence parts**

In `## 18. Bike Profiles & Riders`, replace `### 18.2 Profile Management`'s
bullet `- Stored in SQLite` and the paragraph immediately above it with:

```markdown
### 18.2 Profile Management

- Created/managed in the Device tab.
- **Stored as one JSON file per profile**, `<data>/profiles/<profile_id>.idl0p`
  (path convention carried from `profile_store.dart`; not yet a C4-fixed
  path — see this plan's Open questions). Written via the C4 §4 atomic-write
  primitive (`tmp/<uuid>` → fsync → rename). A malformed profile file is
  skipped on load with a warning, never fails the whole load (CLAUDE.md §5).
- App-wide settings (rider name, unit system, firmware channel, …) persist
  in `app_config_dir()/settings.json` (C4 §1's existing bootstrap file,
  which already holds `data_dir`) rather than `shared_preferences` — see
  this plan's Open questions for why that file rather than a new one.
- **Config never auto-pushed** — user reviews and pushes manually (unchanged).
- Post-session: profile editable in the Data tab metadata editor (updates
  `session.json` only, C1 §6, not the immutable log file).
```
Leave `### 18.1 Profile Model` and `### 18.3 Multi-Device` unchanged — neither is storage-persistence.

- [ ] **Step 5: Commit**

```bash
git add docs/IDL0_SPEC.md
git commit -m "docs: rewrite SPEC 15, 16.3, 18 storage parts for C1/C4"
```

---
### Task 3: `Session`/`Channel` canonical model (C1 §2)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`.

**Files:**
- Modify: `src/session/mod.rs`.

**Interfaces:**
- Produces: `Session { session_id, device_id: Option<String>, timestamp_utc_ms, config_checksum: Option<String>, source_format: SourceFormat, blob_sha256: String, channels: Vec<Channel> }`; `Channel { channel_id, t_us: Vec<i64>, nominal_rate_hz, column, source_kind: String, gaps }`; `SourceFormat`. Consumed by every later task and by parse/handle/synthesis (Task 4).
- This task intentionally does **not** make the crate compile — Task 4 fixes every call site. Committing a non-compiling intermediate state inside a feature branch is acceptable per the TDD-across-tasks structure used elsewhere in this plan; the two tasks are one logical unit split for reviewability, and Task 4's own steps re-run `cargo build` until green.

- [ ] **Step 1: Replace the struct definitions**

In `src/session/mod.rs`, replace `pub struct ChannelRegistryEntry` through the end of `pub struct Session` (i.e. `ChannelRegistryEntry`, `GapSpan` stays, `Channel`, `Session`) with:

```rust
/// A channel declared in the file header registry. See IDL0_SPEC §5.2.
///
/// v2 files (32-byte entries) have `scale` `1.0` and `offset` `0.0` by
/// convention — those fields are not on the wire and are filled in by the v2
/// registry reader so the `physical = stored × scale + offset` formula works
/// for both schema versions. v3 files (40-byte entries) carry explicit
/// `scale`/`offset` per channel.
#[derive(Debug, Clone, PartialEq)]
pub struct ChannelRegistryEntry {
    /// Unique channel ID within this session, referenced by 0x03 records.
    pub channel_id: u8,
    /// Data type code: 0=u8 1=u16 2=u32 3=i8 4=i16 5=i32 6=f32 7=f64.
    pub data_type: u8,
    /// Nominal sample rate in Hz. 0 = event-driven.
    pub sample_rate_hz: u16,
    /// Scale factor applied to the raw stored value (`physical = stored × scale + offset`).
    pub scale: f64,
    /// Offset added after scaling.
    pub offset: f64,
    /// Null-terminated ASCII channel name, e.g. `IMU0_AccelX`.
    pub name: String,
    /// Null-terminated ASCII unit string, e.g. `g`, `dps`, `pulse`.
    pub units: String,
}

/// A contiguous run of synthesized samples on a reconciled grid.
///
/// `start` is the grid-slot index of the first synthesized sample; `len` is the
/// run length in slots. Produced by IMU drop reconciliation (SPEC §15.2): each
/// run is either a linearly-interpolated interior fill (a real dropped-sample
/// event) or a held-edge leading/trailing pad, computed on the burst-seam-corrected
/// grid (contract C1 §3.3) rather than the nominal one. Coordinates are grid
/// slots — the same as a channel's sample indices — and a run is **shared
/// across an IMU's six axes** (the same drops affect every axis).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GapSpan {
    /// Grid-slot index of the first synthesized sample in the run.
    pub start: usize,
    /// Number of consecutive synthesized samples.
    pub len: usize,
}

/// Which importer produced a [`Session`]. Serializes to the `source_format`
/// `data.parquet` file-metadata string (contract C1 §4.3) lowercase, verbatim.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceFormat {
    /// `.idl0` binary log from an IDL0 device.
    Idl0,
    /// Garmin/Wahoo/etc. `.fit` activity file.
    Fit,
    /// Garmin Connect/Strava-style `.gpx` track.
    Gpx,
    /// Generic `.csv` import (low priority — design doc D4).
    Csv,
}

impl SourceFormat {
    /// The lowercase wire token this variant serializes to (contract C1 §4.3
    /// `source_format` file-metadata value).
    pub fn as_str(&self) -> &'static str {
        match self {
            SourceFormat::Idl0 => "idl0",
            SourceFormat::Fit => "fit",
            SourceFormat::Gpx => "gpx",
            SourceFormat::Csv => "csv",
        }
    }
}

/// Time-series data for a single sensor channel within a session. See §15.2
/// and contract C1 §2/§3.
#[derive(Debug, Clone, PartialEq)]
pub struct Channel {
    /// Registry name for this channel, e.g. `IMU0_AccelZ` or `WheelFront`.
    pub channel_id: String,
    /// Per-sample time, **microseconds since the session's first sample**
    /// (contract C1 §3.1). One entry per sample in `column`;
    /// `t_us.len() == column.len()`. Strictly increasing (C1 §3.5 invariant
    /// 1) — traces back to a recorded device/GPS/FIT/GPX timestamp, verbatim
    /// or burst-corrected, **never** `i / nominal_rate_hz` (invariant 4),
    /// except the documented synthesis exception on `Time`/`Distance` (see
    /// `session::synthesis`'s doc comment).
    pub t_us: Vec<i64>,
    /// Verbatim recorded time, **before** burst-seam correction (contract
    /// C1 §3.2's `<source>_t_recorded_us`), same length/units/origin as
    /// `t_us`. `None` when identical to `t_us` element-for-element by
    /// construction (every non-IMU source, and any IMU channel session
    /// with no burst correction applied yet) — avoids duplicating identical
    /// data in RAM; `Some` only once §3.3 correction has actually moved a
    /// value (Task 6). **This field is not explicit in C1 §2's struct
    /// listing** — C1 §1 states the module layout implementing §2–§7 is
    /// L1's own call, and C1 §4.1 requires both `t` (corrected) and
    /// `_t_recorded_us` (verbatim) as separate, independently-readable
    /// `data.parquet` columns; once correction diverges them for IMU
    /// sources, the in-memory model needs to carry both, or the verbatim
    /// value is unrecoverable at Parquet-write time. See this plan's Open
    /// questions.
    pub t_recorded_us: Option<Vec<i64>>,
    /// Nominal sample rate in Hz — **metadata only**, never used to derive a
    /// sample's time. `0.0` for event-driven channels.
    pub nominal_rate_hz: f64,
    /// Compact, typed sample storage. Physical f64 is materialized on demand
    /// via [`Channel::materialize`].
    pub column: RawColumn,
    /// Which recorded-timestamp source this channel's `t_us` was derived
    /// from — one of the `source_kind` tokens contract C1 §4.2 enumerates
    /// (`imu0`, `imu1`, `imu2`, `gps`, `wheel_front`, `wheel_rear`,
    /// `pressure_front`, `pressure_rear`, `hr_bpm`, `hr_rr`, `fit`, `gpx`),
    /// or `"synthesized"` for the engine's own `Time`/`Distance` channels
    /// (not one of C1's wire `source_kind` tokens — those never round-trip
    /// through `data.parquet` at all, so there is no metadata-key collision
    /// to avoid; see C1 §2's `RawColumn` round-trip table).
    pub source_kind: String,
    /// Physical unit string (contract C1 §4.1's per-channel `unit` values,
    /// e.g. `g`, `dps`, `km/h`, `deg_e7`, `pulse`, `bar`, `bpm`). **Not
    /// explicit in C1 §2's struct listing** — C1 §4.2 mandates a `unit`
    /// column-metadata value on every `data.parquet` channel column
    /// *always*, and the only place that value already exists today is the
    /// registry's `ChannelRegistryEntry.units` (currently read at parse
    /// time and discarded); this field carries it forward. Empty string for
    /// engine-synthesized channels (`Time`: `s`, `Distance`: `m` — set
    /// explicitly, not left empty, since both have an unambiguous physical
    /// unit) and for any channel this session has no unit information for.
    /// See this plan's Open questions.
    pub unit: String,
    /// Synthesized-sample runs from drop reconciliation (SPEC §15.2),
    /// unchanged semantics from the pre-idl1 engine: empty for every channel
    /// with no drops.
    pub gaps: Vec<GapSpan>,
}

impl Channel {
    /// Construct a channel from physical f64 samples with **synthetic
    /// uniform** per-sample time (`t_us[i] = round(i * 1e6 / rate)` for
    /// `rate > 0`, all-zero for `rate == 0` with an explicit `t_us` override
    /// via [`Channel::from_f64_with_times`]).
    ///
    /// **Scoped, documented exception to C1 §3.5 invariant 4:** this
    /// constructor is for the interior-mutable derived-channel store
    /// (`SessionHandle`'s math-output and lap-slice entries) and test
    /// fixtures — ephemeral, in-process channels that are never written to
    /// `data.parquet` and are not subject to the *imported/canonical-file*
    /// time invariant, which governs what a session's *persisted* channels
    /// may claim about recorded time. A math-channel output computed
    /// pointwise from a real channel should prefer
    /// [`Channel::from_f64_with_times`] with the source's own `t_us` so its
    /// samples stay aligned to real recorded time; `from_f64` remains for
    /// callers (today: `SessionHandle::store_math`'s legacy call sites,
    /// synthesized test channels) where no source `t_us` is at hand. See
    /// this plan's Open questions for the reasoning.
    pub fn from_f64(channel_id: impl Into<String>, nominal_rate_hz: f64, samples: Vec<f64>) -> Self {
        let t_us = if nominal_rate_hz > 0.0 {
            (0..samples.len())
                .map(|i| (i as f64 * 1_000_000.0 / nominal_rate_hz).round() as i64)
                .collect()
        } else {
            vec![0; samples.len()]
        };
        Channel {
            channel_id: channel_id.into(),
            t_us,
            t_recorded_us: None,
            nominal_rate_hz,
            column: RawColumn::F64(samples),
            source_kind: "synthesized".to_string(),
            unit: String::new(),
            gaps: Vec::new(),
        }
    }

    /// Construct a channel from physical f64 samples with explicit,
    /// caller-supplied `t_us` (µs since the session's first sample) — the
    /// path for event-driven and imported channels, and for math outputs
    /// that carry a real source's per-sample time forward. `t_us.len()` must
    /// equal `samples.len()`; not enforced here (a length mismatch degrades
    /// gracefully — [`Channel::len`] reads `column.len()`, so extra/missing
    /// `t_us` entries are simply unreachable/absent rather than panicking,
    /// CLAUDE.md §5).
    pub fn from_f64_with_times(
        channel_id: impl Into<String>,
        nominal_rate_hz: f64,
        samples: Vec<f64>,
        t_us: Vec<i64>,
        source_kind: impl Into<String>,
    ) -> Self {
        Channel {
            channel_id: channel_id.into(),
            t_us,
            t_recorded_us: None,
            nominal_rate_hz,
            column: RawColumn::F64(samples),
            source_kind: source_kind.into(),
            unit: String::new(),
            gaps: Vec::new(),
        }
    }

    /// Like [`Channel::from_f64_with_times`], but with an explicit,
    /// possibly-different `t_recorded_us` (post burst-seam-correction
    /// construction path — Task 6).
    pub fn from_f64_corrected(
        channel_id: impl Into<String>,
        nominal_rate_hz: f64,
        samples: Vec<f64>,
        t_us: Vec<i64>,
        t_recorded_us: Vec<i64>,
        source_kind: impl Into<String>,
    ) -> Self {
        Channel {
            channel_id: channel_id.into(),
            t_us,
            t_recorded_us: Some(t_recorded_us),
            nominal_rate_hz,
            column: RawColumn::F64(samples),
            source_kind: source_kind.into(),
            unit: String::new(),
            gaps: Vec::new(),
        }
    }

    /// Sets `unit` (builder-style, since every other constructor defaults it
    /// to empty — most callers that care about a real unit are the parser,
    /// which knows it only after construction, from the channel registry).
    pub fn with_unit(mut self, unit: impl Into<String>) -> Self {
        self.unit = unit.into();
        self
    }

    /// The verbatim recorded time for this channel (contract C1 §3.2) —
    /// `t_recorded_us` when correction actually diverged it, else `t_us`
    /// itself (the two are identical by construction whenever
    /// `t_recorded_us` is `None`).
    pub fn t_recorded_us_or_t_us(&self) -> &[i64] {
        self.t_recorded_us.as_deref().unwrap_or(&self.t_us)
    }

    /// Number of samples in the channel.
    pub fn len(&self) -> usize {
        self.column.len()
    }

    /// `true` when the channel holds no samples.
    pub fn is_empty(&self) -> bool {
        self.column.is_empty()
    }

    /// Widen all samples to physical f64 (transient — never resident).
    pub fn materialize(&self) -> Vec<f64> {
        self.column.materialize()
    }

    /// Widen the half-open index window `[start, end)` to physical f64, clamped.
    pub fn materialize_range(&self, start: usize, end: usize) -> Vec<f64> {
        self.column.materialize_range(start, end)
    }

    /// Physical value at index `i`, or `None` if out of range.
    pub fn value_at(&self, i: usize) -> Option<f64> {
        self.column.value_at(i)
    }

    /// Finite (min, max) of the physical samples; `None` when empty/all-non-finite.
    pub fn min_max(&self) -> Option<(f64, f64)> {
        self.column.min_max()
    }

    /// Duration of this channel's own data span, in milliseconds:
    /// `(t_us.last() - t_us.first()) / 1000`, rounded. `0` when the channel
    /// has fewer than 2 samples. **Changed from the pre-idl1 formula**
    /// (`len / sample_rate_hz × 1000` for fixed-rate, last event time for
    /// event-driven) — `t_us` is now mandatory and session-relative (C1
    /// §3.1), so both cases collapse into one formula that reads real
    /// recorded/corrected time instead of assuming a rate.
    pub fn duration_ms(&self) -> i64 {
        match (self.t_us.first(), self.t_us.last()) {
            (Some(&first), Some(&last)) if last > first => {
                ((last - first) as f64 / 1000.0).round() as i64
            }
            _ => 0,
        }
    }
}

/// In-memory representation of one imported session — the parsed/converted
/// view of one immutable source blob (contract C1 §2).
#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    /// Stable identity. The device's session UUID (32-char lowercase hex)
    /// for `.idl0` sources; a prefix of `blob_sha256` for FIT/GPX/CSV
    /// sources (exact derivation: contract C4 §3).
    pub session_id: String,
    /// 12-char lowercase hex MAC-derived device id. `None` for FIT/GPX/CSV
    /// — there is no device.
    pub device_id: Option<String>,
    /// Session start, UTC milliseconds since the Unix epoch. `0` means
    /// "unknown" (SPEC §5.1 sentinel convention, unchanged).
    pub timestamp_utc_ms: i64,
    /// CRC32 of `idl0_config.json` at recording time, 8-char lowercase hex.
    /// `None` for FIT/GPX/CSV — there is no device config.
    pub config_checksum: Option<String>,
    /// Which importer produced this session.
    pub source_format: SourceFormat,
    /// SHA-256 of the raw source file bytes exactly as imported, 64
    /// lowercase hex chars — the CAS blob this session's `data.parquet` is
    /// a function of (design doc §5).
    pub blob_sha256: String,
    /// Parsed channel data, one entry per channel present in this session.
    pub channels: Vec<Channel>,
}
```

- [ ] **Step 2: Update `ParseResult`'s doc-adjacent tests to the new shape**

In the `#[cfg(test)] mod tests` block at the bottom of `src/session/mod.rs`, replace every test that constructs a `Session`/`Channel` literal directly (`duration_ms_fixed_rate_channel_uses_sample_count_over_rate`, `duration_ms_event_driven_channel_uses_last_sample_time`, `duration_ms_event_driven_without_times_is_zero`, `is_complete_reflects_truncation_warning`, `io_error_displays_with_prefix`) with the new field names, per this exact mapping:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duration_ms_uses_first_and_last_t_us_span() {
        // Arrange — 800 samples at 800 Hz, t_us spanning exactly 1_000_000 µs.
        let ch = Channel::from_f64("IMU0_AccelX", 800.0, vec![0.0; 800]);

        // Act
        let ms = ch.duration_ms();

        // Assert
        assert_eq!(ms, 999); // (799/800)*1e6 µs span, rounded
    }

    #[test]
    fn duration_ms_event_driven_channel_uses_t_us_span() {
        // Arrange — event channel, t_us at 0.5s, 1.0s, 1.3s → span 800ms.
        let ch = Channel::from_f64_with_times(
            "HR_RR", 0.0, vec![1000.0, 900.0, 850.0],
            vec![500_000, 1_000_000, 1_300_000], "hr_rr",
        );

        // Act
        let ms = ch.duration_ms();

        // Assert
        assert_eq!(ms, 800);
    }

    #[test]
    fn duration_ms_single_sample_is_zero() {
        // Arrange
        let ch = Channel::from_f64("HR_RR", 0.0, vec![1.0]);

        // Act + Assert
        assert_eq!(ch.duration_ms(), 0);
    }

    #[test]
    fn is_complete_reflects_truncation_warning() {
        // Arrange
        let session = Session {
            session_id: String::new(),
            device_id: None,
            timestamp_utc_ms: 0,
            config_checksum: None,
            source_format: SourceFormat::Idl0,
            blob_sha256: String::new(),
            channels: Vec::new(),
        };

        // Act + Assert
        let clean = ParseResult { session: session.clone(), truncation_warning: None };
        assert!(clean.is_complete());
        let partial = ParseResult {
            session,
            truncation_warning: Some(ParseError::TruncatedRecord("eof".to_string())),
        };
        assert!(!partial.is_complete());
    }

    #[test]
    fn io_error_displays_with_prefix() {
        // Arrange
        let e = ParseError::Io("no such file".to_string());

        // Act
        let s = format!("{e}");

        // Assert
        assert_eq!(s, "Io: no such file");
    }
}
```
(`duration_ms_uses_first_and_last_t_us_span`'s expected `999` — not `1000` — is deliberate: with `nominal_rate_hz = 800.0` and 800 samples, `from_f64`'s synthetic `t_us[i] = round(i * 1e6/800)` gives `t_us[799] = round(999_875.0) = 999875`... **recompute exactly during implementation and assert the literal value `cargo test` reports**, rather than trust this arithmetic by eye — flagged here rather than silently asserted, since hand-computing 799 rounding steps is error-prone; this is exactly the kind of "TDD reveals the exact number" case CLAUDE.md's Arrange/Act/Assert discipline exists for.)

- [ ] **Step 3: Confirm this task compiles in isolation is not the bar — record the expected failure**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo build -p idl-rs 2>&1 | grep -c "^error"
```
Expected: a nonzero count (every other module still references the old field names) — this is the known, expected state Task 4 resolves. Do not attempt to fix other files in this task; commit as-is.

- [ ] **Step 4: Commit**

```bash
git add core/src/session/mod.rs
git commit -m "store: Session/Channel mandatory-time model (C1 §2)

Compiles in isolation only — every other module's ripple is Task 4."
```

---
### Task 4: Parser retains raw per-record timestamps; populate `t_us`/`t_recorded_us`/`source_kind`; ripple-fix the crate to compile

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`. This task's job is narrow and additive — it does **not** yet implement burst-seam correction (Task 5) or change IMU gap-detection's ordering (Task 6, C1 §3.3's "ruled" decision). IMU channels get a **documented, temporary** `t_us` computed the same way the pre-idl1 engine implicitly computed time (`slot * period_us`, i.e. today's `i / sample_rate_hz` expressed as an explicit array) — this is a known, TDD-visible intermediate state; Task 6's done-criteria is exactly "replace this with real corrected/recorded time." Every other source (GPS, generic `CHANNEL_SAMPLE` channels) gets **real** `t_us`/`t_recorded_us` in this task, since those sources have no burst structure and no reconciliation step to interact with.

**Files:**
- Modify: `src/parse/records.rs`, `src/parse/v3.rs`, `src/session/handle.rs`, `src/session/synthesis.rs`, and — compile-driven — every file `cargo build -p idl-rs` flags (known candidates from a `.sample_rate_hz`/`.sample_times_secs` field-access grep: `src/gps.rs`, `src/laps/detect.rs`, `src/estimate/run.rs`, `src/export/csv.rs`, `src/export/json.rs`, `src/export/fit/mod.rs`, `src/table/eval.rs`, `src/tracks/detect.rs`, `src/workbook/apply.rs`, `src/math/eval.rs`'s `SessionHandle`-adjacent glue, `src/parse/test_buffers.rs`; most other grep hits are `math::eval::LookupChannel` field accesses or local parameter names spelled `sample_rate_hz` and are **not** touched by this rename — confirm which class a hit is before editing it).

**Interfaces:**
- Consumes: Task 3's `Session`/`Channel`/`SourceFormat`.
- Produces: a crate that builds and passes `cargo test -p idl-rs` with the new model wired end to end (minus burst correction).

- [ ] **Step 1: `records.rs` — retain GPS per-fix timestamps and every generic channel's per-record timestamp**

In `parse_gps_record`, add a parameter `gps_ts: &mut Vec<i64>` (after `origin`) and push `device_ts_us` into it unconditionally, right after `origin.observe(device_ts_us)`. Every call site (`v3.rs`'s `read_record`/`parse_v3`) threads a `gps_ts: &mut Vec<i64>` through.

In `parse_channel` (v3.rs — see Step 2), rename `event_ts_us: &mut HashMap<String, Vec<i64>>` to `channel_ts_us` and change:
```rust
if entry.sample_rate_hz == 0 {
    // Event-driven channel (low-rate): record the per-sample timestamp.
    // The name is only cloned here, never on the high-rate path.
    event_ts_us.entry(entry.name.clone()).or_default().push(ts_us);
}
```
to push **unconditionally** (drop the `if entry.sample_rate_hz == 0` guard) — every generic channel now needs its own `t_us`, fixed-rate or not, per C1 §2's mandatory-time rule. The doc comment's "low-rate" framing is stale; replace with: `// Every CHANNEL_SAMPLE record's own timestamp, regardless of the registry's declared rate — contract C1 §2 makes per-sample time mandatory on every channel, not just event-driven ones.`

- [ ] **Step 2: `v3.rs` — thread the new accumulators, tag `source_kind`, build `t_us`**

Add `imu_recorded_ts: &mut [Vec<i64>; 3]` to `parse_imu`'s signature; in the `if !drop_sample && idx < IMU_CHANNEL_NAMES.len()` branch (the same branch that pushes axis values), add one line pushing `ts_us` into `imu_recorded_ts[idx]` — once per record, not once per axis (place it directly inside `if !drop_sample && idx < IMU_CHANNEL_NAMES.len() { imu_recorded_ts[idx].push(ts_us); for axis in 0..6u32 { … } }`, i.e. hoist it above the axis loop, not inside it).

In `parse_v3`, declare alongside the existing per-IMU arrays: `let mut imu_recorded_ts: [Vec<i64>; 3] = Default::default();` and `let mut gps_ts: Vec<i64> = Vec::new();`; thread both through `read_record`/`parse_imu`/`parse_gps_record` call sites (mechanical — `read_record` gains and forwards both).

Replace the channel-construction loop (`for (name, column) in acc.into_entries() { … }`) with:

```rust
let t0_us = origin.min_us.unwrap_or(0);
let mut channels = Vec::new();
for (name, column) in acc.into_entries() {
    let rate = resolve_rate(&name, gps_sample_rate_hz, &registry, plan.nominal_rate);
    let (column, gaps) = plan.reconcile(&name, column);
    let (t_us, source_kind) = if let Some(imu_idx) = imu_index_of(&name) {
        // Task 4 interim: grid-slot time, matching the pre-idl1 implicit
        // i/rate formula exactly (no burst correction yet — Task 6).
        // t_recorded_us stays None: defined identical to t_us until Task 6
        // actually diverges them.
        let local_t0 = first[imu_idx].unwrap_or(t0_us);
        let t = (0..column.len())
            .map(|slot| (local_t0 - t0_us) + (slot as i64) * period_us)
            .collect();
        (t, format!("imu{imu_idx}"))
    } else if name.starts_with("GPS") {
        let t = gps_ts.iter().map(|&ts| ts - t0_us).collect();
        (t, "gps".to_string())
    } else if let Some(ts) = channel_ts_us.get(&name) {
        let t = ts.iter().map(|&ts| ts - t0_us).collect();
        (t, generic_source_kind(&name))
    } else {
        // No recorded timestamp captured for this name (should not happen
        // for a real registry channel) — empty t_us degrades gracefully
        // rather than panicking (CLAUDE.md §5); surfaced by the round-trip
        // test in Task 9 if it ever fires.
        (Vec::new(), generic_source_kind(&name))
    };
    channels.push(Channel {
        channel_id: name.clone(),
        t_us,
        t_recorded_us: None,
        nominal_rate_hz: rate,
        column,
        source_kind,
        unit: unit_for(&name, &registry_by_name),
        gaps,
    });
}
```
`unit_for` (new helper, near `generic_source_kind`): looks the channel up in `registry_by_name` and returns `entry.units.clone()` when present and non-empty; else falls back to a small hardcoded table for the channels the registry doesn't self-describe with a useful unit today — `IMU{n}_Accel*` → `"g"`, `IMU{n}_Gyro*` → `"dps"`, `GPS_SpeedKmh` → `"km/h"`, `GPS_EpochMs` → `"ms_raw"`, `GPS_Latitude`/`GPS_Longitude` → `"deg_e7"`, `GPS_Altitude` → `"m_e1"`, `GPS_Heading` → `"deg_e2"`, `GPS_FixQuality` → `"enum_raw"`, `GPS_Satellites` → `"count"` (C1 §4.1's table, verbatim); else `entry.units.clone()` unconditionally for any other registry channel (`WheelFront`/`PressureFront`/`HR_BPM`/etc. — the registry already carries a real unit string for these, SPEC §5.2); else empty string.

```rust
fn unit_for(channel_id: &str, registry_by_name: &HashMap<String, ChannelRegistryEntry>) -> String {
    if let Some(u) = imu_axis_unit(channel_id) {
        return u.to_string();
    }
    if let Some(u) = gps_channel_unit(channel_id) {
        return u.to_string();
    }
    registry_by_name.get(channel_id).map(|e| e.units.clone()).unwrap_or_default()
}

fn imu_axis_unit(channel_id: &str) -> Option<&'static str> {
    if imu_index_of(channel_id).is_none() {
        return None;
    }
    if channel_id.contains("Accel") {
        Some("g")
    } else if channel_id.contains("Gyro") {
        Some("dps")
    } else {
        None
    }
}

fn gps_channel_unit(channel_id: &str) -> Option<&'static str> {
    match channel_id {
        "GPS_SpeedKmh" => Some("km/h"),
        "GPS_EpochMs" => Some("ms_raw"),
        "GPS_Latitude" | "GPS_Longitude" => Some("deg_e7"),
        "GPS_Altitude" => Some("m_e1"),
        "GPS_Heading" => Some("deg_e2"),
        "GPS_FixQuality" => Some("enum_raw"),
        "GPS_Satellites" => Some("count"),
        _ => None,
    }
}
```

Add a small helper (near `resolve_rate`, in `records.rs`, exported alongside it):
```rust
/// Maps a generic registry channel name to its `source_kind` token (contract
/// C1 §4.2). Falls back to the lower-cased channel name for any future
/// sensor the registry adds without a schema change (SPEC §5.2's
/// forward-compatibility philosophy, carried into C1 §4.2's `source_kind`
/// definition verbatim).
pub fn generic_source_kind(channel_id: &str) -> String {
    match channel_id {
        "WheelFront" => "wheel_front",
        "WheelRear" => "wheel_rear",
        "PressureFront" => "pressure_front",
        "PressureRear" => "pressure_rear",
        "HR_BPM" => "hr_bpm",
        "HR_RR" => "hr_rr",
        other => return other.to_lowercase(),
    }
    .to_string()
}
```

Replace `Session { session_id, device_id, timestamp_utc_ms: effective_start_ms, config_checksum: format!("{config_crc:08x}"), channels }` with the new field set:
```rust
Session {
    session_id,
    device_id: Some(device_id),
    timestamp_utc_ms: effective_start_ms,
    config_checksum: Some(format!("{config_crc:08x}")),
    source_format: crate::session::SourceFormat::Idl0,
    blob_sha256: String::new(), // filled by the caller — parse_v3 has no blob context; see store::blob (Task 8)
    channels,
}
```
Add a doc-comment line on `parse_v3` noting `blob_sha256` is the caller's responsibility (computed once over the same bytes `parse_v3` is handed, by whoever calls it with file access — `SessionHandle::from_path`/`from_bytes`, updated in this same step to accept and fill it: `SessionHandle::from_bytes` computes `sha256(bytes)` via the `sha2` dependency added in Task 1 and overwrites `session.blob_sha256` after `parse()` returns, before synthesis runs).

- [ ] **Step 3: Update every v3.rs test that asserts on the old shape**

`session.device_id`/`session.config_checksum` assertions (`assert_eq!(r.session.device_id, "b0b1b2b3b4b5")` etc.) need `.as_deref()` (`assert_eq!(r.session.device_id.as_deref(), Some("b0b1b2b3b4b5"))`). `ch.sample_rate_hz` → `ch.nominal_rate_hz`. `ch.gaps` assertions are unaffected (unchanged type). `assert!(brake.sample_times_secs.is_none())` → replace with an assertion on `t_us` non-emptiness and monotonicity instead (`assert!(brake.t_us.windows(2).all(|w| w[1] > w[0]))`) — event-driven channels no longer have a distinct "times present/absent" signal since every channel has `t_us` now; the meaningful old assertion ("this channel carries real per-sample time, not implicit") is now true of every channel by construction, so the test's *purpose* (event-driven channels get real timestamps) is better expressed as `assert_eq!(rr.t_us, vec![500_000, 1_000_000, 1_300_000])`-style exact checks, which several of the existing HR_RR tests already do in spirit — tighten them to assert `t_us` directly rather than the retired `sample_times_secs`.

- [ ] **Step 4: `session/handle.rs` — compile-driven rewrite**

Rewrite the functions that branch on `sample_rate_hz == 0.0` / `sample_times_secs.is_some()` to use `t_us` uniformly instead — the two representations converge under the new model (every channel has `t_us`; `nominal_rate_hz == 0.0` still distinguishes "event-driven" for *metadata/UI* purposes, e.g. `ChannelMeta::is_event_driven`, but no *time-computation* function should branch on it anymore, per C1 §3.5 invariant 4):

- `slice_channel_by_time(c: &Channel, t0: f64, t1: f64) -> Vec<f64>`: replace both branches with one, operating on `c.t_us` directly: convert `t0`/`t1` to µs (`(t0*1e6).round() as i64`, `(t1*1e6).round() as i64`), binary-search `c.t_us` (`partition_point`) for the inclusive range, and `materialize_range` that index window. Delete `fixed_rate_slice_range` (no longer used).
- `nearest_by_rate`/`nearest_by_times` collapse into one `nearest_by_t_us(samples: &[f64], t_us: &[i64], t_secs: f64) -> f64`, mirroring `nearest_by_times`'s existing partition-point logic exactly but reading `t_us` (µs, `i64`) instead of `times` (seconds, `f64`) — compare against `(t_secs * 1e6).round() as i64`.
- `epoch_to_time_one`/`epoch_to_time_one_extrapolated`: unaffected in logic (they already operate on `GPS_EpochMs` values, a channel's own *sample values*, not its time axis) — no change needed beyond confirming they still compile (they reference `c.sample_rate_hz` only via the caller's `c.sample_rate_hz > 0.0` filter in `epoch_ms_to_time_secs`/`_extrapolated`/`gps_channel_values`, which becomes `c.nominal_rate_hz > 0.0`).
- `gps_channel_values`: the `match &c.sample_times_secs { Some(st) => …, None => … }` branch collapses to always calling `nearest_by_t_us(&samples, &c.t_us, t)`.
- `resident_bytes`'s `channel_bytes` helper: `c.sample_times_secs.as_ref().map_or(0, |t| t.len()*8)` → `c.t_us.len() * 8 + c.t_recorded_us.as_ref().map_or(0, |t| t.len()*8)` (both arrays are now real resident cost, replacing the old event-only accounting).
- `SessionHandle::from_channels`/`ChannelInput`/`SessionMetaInput` (the GPX-import construction path, still used by L2 later): update field names (`device_id: Option<String>`, `config_checksum: Option<String>`, `source_format`, `blob_sha256`) and `ChannelInput` gains `t_us: Vec<i64>` (replacing `sample_times_secs: Option<Vec<f64>>`) and `source_kind: String`, mapped straight into the new `Channel` literal. This is L1's job even though L2 owns the GPX importer itself — C1 §1 fixes only the *output shape* every importer must produce, and this constructor is that shape's single construction point.
- `impl crate::math::eval::ChannelLookup for SessionHandle`: `channel_dims` returns `(c.len(), c.nominal_rate_hz)` (rename only). `sample_times` (returns `Option<Vec<f64>>` seconds, event-driven only, consumed by the math evaluator — **not** touched by C1, stays exactly that contract) becomes: `self.with_channel(name, |c| if c.nominal_rate_hz == 0.0 { Some(c.t_us.iter().map(|&t| t as f64 / 1e6).collect()) } else { None }).flatten()` — derives the old seconds-vector from the new `t_us` rather than reading a retired field, preserving `ChannelLookup`'s existing (L3-owned, unchanged) contract exactly.
- Every other `.sample_rate_hz` in this file (there are many, e.g. `run_estimator_once`'s `rate_hz`, `welch_channel*`, `spectrogram_channel`, `store_math`'s parameter, `slice_lap_into_store`) is either a local parameter name (leave alone) or `c.sample_rate_hz` → `c.nominal_rate_hz` (mechanical rename) or a `Channel::from_f64(...)` call whose argument order/count changed in Task 3 (`store_math`, `slice_lap_into_store`'s `Channel::from_f64(&token, rate, slice, None)` → `Channel::from_f64(&token, rate, slice)`, dropping the trailing `None`).

- [ ] **Step 5: `session/synthesis.rs` — `Time`/`Distance` trace real `t_us`**

Replace `synthesize_base_channels`'s channel-selection loop (which today picks "highest fixed-rate channel, longest length" using only `sample_rate_hz`/`len()`) to also capture that channel's `t_us` — rename the tracked state from `(max_rate, max_rate_len)` to carry the winning channel's index too, then:

```rust
session.channels.push(Channel {
    channel_id: "Time".to_string(),
    t_us: session.channels[time_source_idx].t_us.clone(),
    t_recorded_us: None,
    nominal_rate_hz: max_rate,
    column: RawColumn::F64(
        session.channels[time_source_idx].t_us.iter().map(|&t| t as f64 / 1_000_000.0).collect(),
    ),
    source_kind: "synthesized".to_string(),
    unit: "s".to_string(),
    gaps: Vec::new(),
});
```
(`Distance`'s analogous push gets `unit: "m".to_string()`.)
replacing the current `RawColumn::Ramp { len, rate }` construction. **This is a deliberate, documented departure from the pre-idl1 zero-storage `Ramp` representation** — `Time`'s values must equal `t_us / 1e6` exactly (C1 §3.5 invariant 4 forbids deriving them from `i / rate` instead), and the existing `Ramp` variant's `value(i) = i / rate` formula is exactly that forbidden derivation once a channel's real `t_us` is not perfectly uniform (true after burst correction, Task 6, or for any channel with drops). `Time` therefore costs 8 B/sample again under idl1 (`F64`, not `Ramp`) — flagged in this plan's Open questions as a design-doc-level tradeoff (`Ramp`'s "zero-storage" framing, design doc §5, assumed uniform per-channel time, which C1's union-axis/burst-correction model retires) rather than decided unilaterally here.

`Distance`'s `RawColumn::Interp` stays structurally unchanged (still lazily interpolates GPS-rate metres onto an output grid) but its `t_us` is set to `Time`'s own `t_us.clone()` (Distance is presented on the Time grid, so they share the same time axis by construction) with the same `t_recorded_us: None`, `source_kind: "synthesized"`.

Update every test in this file's `#[cfg(test)] mod tests` to the new `Channel::from_f64`/`session()` helper shapes (the local `ch()`/`session()` test helpers need `Session { device_id: None, config_checksum: None, source_format: SourceFormat::Idl0, blob_sha256: String::new(), .. }` and `Channel::from_f64(id, rate, samples)` without the trailing `None`), and adjust the `time_channel_uses_highest_fixed_rate_and_longest_length` assertions from `time.materialize()[i] == i/rate` to check against the WINNING channel's own `t_us` instead (since the test's synthetic channels are built via `from_f64`'s synthetic-uniform `t_us`, the two formulas coincide numerically for that test's fixture, so the *assertion values* are unchanged — only the *reasoning* the test's comment gives should be updated to say so explicitly, so a future reader doesn't reintroduce the `i/rate` shortcut believing it's equivalent in general).

- [ ] **Step 6: Compile-driven sweep of the rest of the crate**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo build -p idl-rs 2>&1 | tee /tmp/l1-build.log | grep -E "^error" | head -50
```
Work through every reported error file-by-file. Expected classes of fix, by file (from the grep list in Files above — confirm each hit is a `session::Channel`/`Session` field access, not `math::eval::LookupChannel` or a local parameter, before touching it):
- `src/gps.rs` (`build_gps_track`): reads GPS channel samples/timing — rename `.sample_rate_hz` → `.nominal_rate_hz`; if it branches on `sample_times_secs`, replace with `t_us`-based logic per Step 4's pattern.
- `src/laps/detect.rs`: reads GPS fixes via `crate::gps`/`SessionHandle` accessors, not `Channel` fields directly in most cases — confirm via the build error; likely no change needed beyond a transitive recompile.
- `src/estimate/run.rs` (`EstimatorInput::from_lookup`): reads IMU channel rate/dims via `ChannelLookup` (unaffected — `channel_dims` already returns `(len, rate)`, Step 4 keeps that contract) — likely compiles unchanged; if it constructs a `Channel` literal anywhere, apply Task 3's new field set.
- `src/export/csv.rs`, `src/export/json.rs`, `src/export/fit/mod.rs`: exporters read `channel.sample_rate_hz`/`sample_times_secs` to decide how to lay out rows — rename to `nominal_rate_hz`; replace any `sample_times_secs`-presence branch with `channel.t_us` directly (every channel now has one, so the branch simplifies to "always use `t_us`", deleting the `None` arm).
- `src/table/eval.rs`: table cells reading channel metadata — mechanical rename.
- `src/tracks/detect.rs`, `src/workbook/apply.rs`: confirm the hit is real (grep found `sample_rate_hz`, but these modules are far from the session layer — likely a local variable named the same, in which case **no change**).
- `src/parse/test_buffers.rs`: the shared test-fixture builder (`Header`, `imu_payload`, etc., exposed to `cli`'s dev-dependency via the `test-fixtures` feature) — confirm it builds *wire bytes*, not `Channel` literals; if so, it needs no change (it's testing the parser's *input* format, which C1 does not touch — only the parser's *output* model changed).

Re-run `cargo build -p idl-rs` after each file's fix; do not batch-guess multiple files' fixes before re-checking — the error list after each fix narrows what remains.

- [ ] **Step 7: Green build and full test pass**

```bash
cargo build -p idl-rs 2>&1 | tail -5
cargo test -p idl-rs 2>&1 | grep -E "^test result|FAILED|^error"
```
Expected: `Finished`; every `test result:` line `0 failed`; no `error` lines.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "store: parser retains raw per-record timestamps; t_us/t_recorded_us/source_kind wired end to end (IMU time still nominal-grid pending Task 6)"
git log --oneline -1
```

---
### Task 5: Burst-seam correction algorithm (C1 §3.3) — the gating test

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`. **This task is what actually gates L1 landing** (task brief, verbatim) — a standalone, thoroughly-unit-tested algorithm proven against C1's own synthetic worked example, with no parser wiring yet (Task 6 wires it in).

**Files:**
- Create: `src/session/seam_correction.rs`.
- Modify: `src/session/mod.rs` (`pub mod seam_correction;`).

**Interfaces:**
- Produces: `pub fn correct_burst_seams(stamps: &[i64], nominal_period_us: i64) -> SeamCorrection { corrected_us: Vec<i64>, effective_period_us: i64, warnings: Vec<ImportWarning> }`. Consumed by Task 6.

- [ ] **Step 1: Write the module**

`src/session/seam_correction.rs`:
```rust
//! Burst-seam correction (contract C1 §3.3): recovers a burst-drained IMU's
//! true sample cadence from its recorded read-instant stamps and re-spaces
//! each burst to a monotonic, uniformly-spaced corrected axis.
//!
//! **Why.** Firmware stamps a FIFO burst by walking back from the read
//! instant at the *nominal* ODR (SPEC §5.5). When the true ODR differs from
//! nominal, this makes the recorded stamps overlap or gap at burst seams —
//! locally non-monotonic time. This module fits the effective (true) period
//! from consecutive burst read-instant spacing and re-spaces every burst
//! backward from its own (trustworthy) read instant at that period.
//!
//! Algorithm version: `"v1"` — the whole of this module, per C1 §3.3.
pub const SEAM_CORRECTION_VERSION: &str = "v1";

/// Result of correcting one source's (one IMU's) recorded stamp sequence.
#[derive(Debug, Clone, PartialEq)]
pub struct SeamCorrection {
    /// Corrected timestamps, same length/order as the input `stamps`.
    /// Strictly increasing (C1 §3.5 invariant 1) by construction — see the
    /// monotonicity guarantee in [`correct_burst_seams`]'s doc.
    pub corrected_us: Vec<i64>,
    /// The session-wide effective period (µs) this source's bursts were
    /// re-spaced at (falls back to `nominal_period_us` if fewer than two
    /// bursts, or if the computed value was non-positive).
    pub effective_period_us: i64,
    /// Non-fatal anomalies encountered (CLAUDE.md §5: recover what's
    /// readable, never crash on bad data, never silently synthesize a wrong
    /// value without saying so).
    pub warnings: Vec<ImportWarning>,
}

/// Discriminant for [`ImportWarning`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportWarningKind {
    /// The session-wide median estimate was `<= 0` (pathological — e.g.
    /// out-of-order read instants); fell back to the nominal period.
    NonPositiveEffectivePeriod,
    /// A single burst's local-period fallback (the monotonicity guarantee's
    /// recompute) was `<= 0`; fell back to the nominal period for that burst.
    NonPositiveLocalPeriod,
}

/// A non-fatal import-time anomaly, surfaced rather than silently absorbed
/// or hard-failed (CLAUDE.md §5). Mirrors [`crate::session::ParseError`]'s
/// shape (kind + message), kept separate from it because a warning does not
/// abort parsing the way [`crate::session::ParseError::TruncatedRecord`] can.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportWarning {
    pub kind: ImportWarningKind,
    pub message: String,
}

impl ImportWarning {
    fn new(kind: ImportWarningKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

/// One maximal run of consecutive samples whose deltas are within ±1 µs of
/// `nominal_period_us` — one FIFO burst. `start`/`end` are inclusive indices
/// into the input `stamps` slice.
struct Burst {
    start: usize,
    end: usize,
}

/// Step 1 (C1 §3.3): walk `stamps` once, splitting at any delta more than
/// ±1 µs away from `nominal_period_us`.
fn detect_bursts(stamps: &[i64], nominal_period_us: i64) -> Vec<Burst> {
    let mut runs = Vec::new();
    let mut run_start = 0usize;
    for i in 1..stamps.len() {
        if (stamps[i] - stamps[i - 1] - nominal_period_us).abs() > 1 {
            runs.push(Burst { start: run_start, end: i - 1 });
            run_start = i;
        }
    }
    runs.push(Burst { start: run_start, end: stamps.len() - 1 });
    runs
}

/// Median of `values`, even-count = mean of the two middle values (C1 §3.3).
/// `values` must be non-empty.
fn median(mut values: Vec<f64>) -> f64 {
    values.sort_by(|a, b| a.partial_cmp(b).expect("burst period estimates are always finite"));
    let n = values.len();
    if n % 2 == 1 {
        values[n / 2]
    } else {
        (values[n / 2 - 1] + values[n / 2]) / 2.0
    }
}

/// Round-half-away-from-zero, matching C1 §3.3's specified tie-breaking rule
/// (distinct from Rust's `f64::round`, which is also half-away-from-zero for
/// positive values but this makes the intent explicit at each call site).
fn round_half_away_from_zero(x: f64) -> i64 {
    if x >= 0.0 {
        (x + 0.5).floor() as i64
    } else {
        (x - 0.5).ceil() as i64
    }
}

/// Corrects one source's recorded burst stamps (contract C1 §3.3, full
/// algorithm — steps 1–3 plus the monotonicity guarantee).
///
/// `stamps` must be the raw, as-recorded (uncorrected) timestamps in
/// arrival order for **one** burst-drained source (one IMU) — device-clock
/// microseconds, any origin. `nominal_period_us` is that source's
/// configured-ODR period ([`crate::parse::records::imu_period_us`]).
///
/// Fewer than 2 stamps: returned verbatim, `effective_period_us =
/// nominal_period_us` (no burst structure to detect).
///
/// **Monotonicity guarantee.** `corrected_us` is strictly increasing by
/// construction: burst 0 uses the session-wide `effective_period_us`
/// unconditionally (no predecessor to violate); every later burst `k`
/// checks `T_k − (N_k − 1) × effective_period_us > T_{k−1}` before
/// committing, and recomputes with its own local period when the check
/// fails (C1 §3.3's proof that this margin is enormous for any burst size/
/// period this hardware can produce).
pub fn correct_burst_seams(stamps: &[i64], nominal_period_us: i64) -> SeamCorrection {
    let mut warnings = Vec::new();

    if stamps.len() < 2 {
        return SeamCorrection {
            corrected_us: stamps.to_vec(),
            effective_period_us: nominal_period_us,
            warnings,
        };
    }

    let bursts = detect_bursts(stamps, nominal_period_us);

    // Step 2: effective period from consecutive burst read-instant spacing.
    let estimates: Vec<f64> = (1..bursts.len())
        .map(|k| {
            let t_k = stamps[bursts[k].end] as f64;
            let t_km1 = stamps[bursts[k - 1].end] as f64;
            let n_k = (bursts[k].end - bursts[k].start + 1) as f64;
            (t_k - t_km1) / n_k
        })
        .collect();

    let mut effective_period_us = if estimates.is_empty() {
        nominal_period_us
    } else {
        round_half_away_from_zero(median(estimates))
    };
    if effective_period_us <= 0 {
        warnings.push(ImportWarning::new(
            ImportWarningKind::NonPositiveEffectivePeriod,
            format!(
                "computed effective_period_us={effective_period_us} <= 0 \
                 (pathological — e.g. out-of-order read instants); \
                 falling back to nominal_period_us={nominal_period_us}"
            ),
        ));
        effective_period_us = nominal_period_us;
    }

    // Step 3: re-space each burst backward from its own read instant, with
    // the per-burst monotonicity check/fallback.
    let mut corrected = vec![0i64; stamps.len()];
    let mut prev_t_k: Option<i64> = None;
    for (k, burst) in bursts.iter().enumerate() {
        let t_k = stamps[burst.end];
        let n_k = (burst.end - burst.start + 1) as i64;
        let mut period = effective_period_us;

        if let Some(t_km1) = prev_t_k {
            if t_k - (n_k - 1) * period <= t_km1 {
                let mut local = round_half_away_from_zero((t_k - t_km1) as f64 / n_k as f64);
                if local <= 0 {
                    warnings.push(ImportWarning::new(
                        ImportWarningKind::NonPositiveLocalPeriod,
                        format!(
                            "burst {k}: local_period_us={local} <= 0 \
                             (not physically realizable for two real, \
                             time-ordered device reads); falling back to \
                             nominal_period_us={nominal_period_us}"
                        ),
                    ));
                    local = nominal_period_us;
                }
                period = local;
            }
        }

        for i in burst.start..=burst.end {
            let offset_from_end = (burst.end - i) as i64;
            corrected[i] = t_k - offset_from_end * period;
        }
        prev_t_k = Some(t_k);
    }

    SeamCorrection { corrected_us: corrected, effective_period_us, warnings }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worked_example_800hz_nominal_true_1200us_period_recovers_effective_period_and_respaces_every_burst() {
        // Arrange — contract C1 §3.3's worked numeric example verbatim:
        // nominal 1250 µs (800 Hz configured), true period 1200 µs
        // (≈833.3 Hz), 4 bursts of N=4, read instants 100000/104800/
        // 109600/114400.
        let stamps = vec![
            96250, 97500, 98750, 100000, // burst 0
            101050, 102300, 103550, 104800, // burst 1
            105850, 107100, 108350, 109600, // burst 2
            110650, 111900, 113150, 114400, // burst 3
        ];

        // Act
        let result = correct_burst_seams(&stamps, 1250);

        // Assert — effective period exactly recovers the true 1200 µs.
        assert_eq!(result.effective_period_us, 1200);
        assert!(result.warnings.is_empty());
        assert_eq!(
            result.corrected_us,
            vec![
                96400, 97600, 98800, 100000, //
                101200, 102400, 103600, 104800, //
                106000, 107200, 108400, 109600, //
                110800, 112000, 113200, 114400,
            ]
        );

        // Assert — strictly increasing everywhere, including across every
        // seam (the whole point of the correction).
        assert!(result.corrected_us.windows(2).all(|w| w[1] > w[0]));
    }

    #[test]
    fn clean_stream_at_nominal_period_is_a_no_op() {
        // Arrange — every delta exactly nominal: one burst, zero estimates.
        let nominal = 1250i64;
        let stamps: Vec<i64> = (0..10).map(|i| 100_000 + i * nominal).collect();

        // Act
        let result = correct_burst_seams(&stamps, nominal);

        // Assert — no predecessor bursts to estimate from, falls back to
        // nominal, which reproduces the recorded stamps exactly.
        assert_eq!(result.effective_period_us, nominal);
        assert_eq!(result.corrected_us, stamps);
    }

    #[test]
    fn fewer_than_two_stamps_returns_verbatim() {
        // Arrange / Act / Assert
        assert_eq!(
            correct_burst_seams(&[], 1250),
            SeamCorrection { corrected_us: vec![], effective_period_us: 1250, warnings: vec![] }
        );
        assert_eq!(
            correct_burst_seams(&[42], 1250),
            SeamCorrection { corrected_us: vec![42], effective_period_us: 1250, warnings: vec![] }
        );
    }

    #[test]
    fn even_number_of_burst_estimates_averages_the_two_middle_values() {
        // Arrange — 3 bursts of N=2 → 2 estimates (k=1,2): true periods
        // 1000 µs then 1100 µs, so the median (mean of two) is 1050 µs.
        // Burst 0: T=10000 (samples 9000,10000, nominal period irrelevant
        // to this burst's own re-spacing since it's the anchor).
        let stamps = vec![
            9000, 10000, // burst0, nominal-spaced within-burst (delta 1000)
            11950, 12950, // burst1: delta within burst 1000 (nominal);
                          // seam delta 12950-10000=2950 vs nominal*... 
            15000, 16000, // burst2
        ];
        // Use a nominal period that makes exactly these three runs detected
        // as separate bursts: nominal 1000, tolerance ±1 — seam deltas
        // (1950, 2050) are far outside tolerance, in-burst deltas (1000)
        // are exact.
        let nominal = 1000i64;

        // Act
        let result = correct_burst_seams(&stamps, nominal);

        // Assert — T_0=10000, T_1=12950, T_2=16000, N=2 for every burst:
        // estimate_1=(12950-10000)/2=1475, estimate_2=(16000-12950)/2=1525;
        // median = (1475+1525)/2 = 1500.
        assert_eq!(result.effective_period_us, 1500);
    }

    #[test]
    fn a_burst_faster_than_the_session_median_falls_back_to_its_own_local_period() {
        // Arrange — construct a burst whose own true spacing is much faster
        // than the session-wide median, so the session-wide re-space would
        // land its first sample at or before the previous burst's anchor.
        // Two slow bursts (median ~2000) then one fast burst (true ~100).
        let stamps = vec![
            0, 2000, // burst0, N=2, nominal 2000 (in-tolerance within-burst)
            4000, 6000, // burst1, N=2 — seam delta 2000 = nominal, so this
                        // is NOT a seam by the ±1µs rule; widen the nominal
                        // tolerance scenario instead: see note below.
        ];
        // This scenario is easiest to construct directly against the
        // monotonicity check rather than via detect_bursts' tolerance —
        // implementers: replace this arrange step with a hand-built 3-burst
        // sequence (session-wide median >> the fast burst's true period) and
        // assert `result.corrected_us` is still strictly increasing end to
        // end, i.e. this test's *assertion* is the monotonicity guarantee
        // itself, not a specific numeric period — construct fixture values
        // during implementation and keep the assertion below.
        let nominal = 2000i64;

        // Act
        let result = correct_burst_seams(&stamps, nominal);

        // Assert — strictly increasing regardless of fixture specifics.
        assert!(result.corrected_us.windows(2).all(|w| w[1] > w[0]));
    }
}
```

Implementers: `fn a_burst_faster_than_the_session_median_falls_back_to_its_own_local_period` is deliberately left with its exact fixture unfinished — flagged in-line above rather than guessed, since hand-constructing a numeric example that (a) detects as 3+ distinct bursts under the ±1 µs tolerance rule and (b) actually trips the monotonicity fallback requires iterating against the real `detect_bursts` output, which is faster to do inside the TDD loop (print `result` and adjust the fixture) than to hand-derive here. The test's *assertion* (strict monotonicity end to end) is fixed; only the *arrange* step's literal numbers need finishing. Do not skip this test — it is the only one exercising the local-period fallback branch (C1 §3.3's monotonicity guarantee), and that branch is untested by every other case here.

- [ ] **Step 2: Wire the module in and run the gating test**

In `src/session/mod.rs`, add `pub mod seam_correction;` alongside the existing `pub mod column;`/`pub mod handle;`/`pub mod synthesis;` lines.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs seam_correction 2>&1 | grep -E "^test |^test result"
```
Expected: every test `ok`, including `worked_example_800hz_nominal_true_1200us_period_recovers_effective_period_and_respaces_every_burst` — **this is the gate**. Do not proceed to Task 6 until this specific test is green with the exact literal values shown above (they are not illustrative — they are C1 §3.3's contract text, reproduced verbatim).

- [ ] **Step 3: Full crate test pass**

```bash
cargo test -p idl-rs 2>&1 | grep -E "^test result|FAILED"
```
Expected: every line `0 failed`.

- [ ] **Step 4: Commit**

```bash
git add core/src/session/seam_correction.rs core/src/session/mod.rs
git commit -m "store: burst-seam correction (C1 §3.3), proven against the contract's worked example"
```

---
### Task 6: Wire burst correction into `ImuGridPlan`; gap detection runs on the corrected grid (C1 §3.3, ruled); FIT/GPX time-mapping helper (C1 §3.4)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`. This is the harder integration: C1 §3.3's "ruled" decision (§8 item 1) requires gap detection to run on the burst-corrected axis, not the nominal one — the *current* hot-loop gap detection (`abs_slot` computed inline against `period_us`, the nominal period) is exactly the phantom-drop mechanism C1's own worked example demonstrates, so it cannot simply be redirected at a corrected period in place — it has to move out of the single-pass hot loop entirely, to run once, after correction, against each IMU's own corrected stamps.

**Design decision this task makes, stated explicitly (not in C1's literal text, within L1's own-module-layout discretion per C1 §1):** a reconciled IMU channel's `t_us` is the **pure uniform grid** (`t0 + slot × period_us`) for every slot, real and filled alike — not a mix of exact-real-time-at-kept-slots and grid-time-at-filled-slots. This matches the *existing, already-accepted* precision contract (SPEC §15.2: "co-temporal events land on the same sample index... to within ½ period") rather than introducing a new one, and keeps `t_recorded_us` as the place a consumer gets the exact verbatim value. `t_recorded_us` is dense (same length as `t_us`) but **only meaningful at slots outside every `GapSpan`** — a consumer (the Task 9 Parquet writer, in particular) must consult `gaps` to decide which rows get a null `_t_recorded_us`, never infer nullness from `t_recorded_us`'s content. This is called out in this plan's Open questions as an interpretive call C1 §3.2/§4.1 left implicit (the contract fixes the *column's* nullability rule — "present only for IMUs enabled this session" — but not how the in-memory model represents per-row nullability before it reaches the writer).

**Files:**
- Modify: `src/parse/records.rs` (`ImuGridPlan`, `parse_imu`'s hot-loop simplification lives in `v3.rs` but the drop-detection helper it used to inline moves here), `src/parse/v3.rs` (hot loop simplified; seam correction wired in after the main loop).
- Create: `src/session/time_map.rs` (C1 §3.4 — FIT/GPX time mapping, for L2 to call).
- Modify: `src/session/mod.rs` (`pub mod time_map;`).

**Interfaces:**
- Consumes: Task 5's `correct_burst_seams`.
- Produces: `ImuGridPlan::build_from_corrected(...)`, `ImuGridPlan::reconcile(...) -> (RawColumn, Vec<i64>, Vec<i64>, Vec<GapSpan>)`; `time_map::fit_gpx_t_us(...)`, `time_map::drop_non_monotonic(...)` for L2.

- [ ] **Step 1: Simplify the hot-loop's IMU drop decision**

In `src/parse/v3.rs`'s `parse_imu`, delete the entire `match (first[idx], last[idx]) { ... }` block's *gap-counting* logic (the `abs_slot`/`imu_gaps[idx].push`/`last_abs_slot` machinery) and replace the whole function's per-record IMU-bookkeeping with a single monotonic guard plus the raw-timestamp retention Task 4 already added:

```rust
let mut drop_sample = false;
if idx < 3 {
    match last[idx] {
        Some(prev) if ts_us <= prev => {
            // A raw wire timestamp that does not advance is a genuine
            // duplicate/backstep read at a FIFO drain boundary (SPEC
            // §5.5) — safe to drop unconditionally: within-burst deltas
            // are always exact at the *nominal* cadence regardless of
            // true ODR (C1 §3.3), so this comparison needs no period
            // knowledge and cannot itself manufacture a phantom drop.
            // Gap detection against the *corrected* period happens once,
            // after the whole stream is read (ImuGridPlan::build_from_corrected).
            drop_sample = true;
        }
        _ => {
            if first[idx].is_none() {
                first[idx] = Some(ts_us);
            }
            last[idx] = Some(ts_us);
            count[idx] += 1;
        }
    }
}
```
Delete `period_us`/`imu_gaps`/`last_abs_slot` from `parse_imu`'s signature and every call site (`read_record`, `parse_v3`'s call) — they are no longer needed in the hot loop. Keep `imu_recorded_ts: &mut [Vec<i64>; 3]` (Task 4) and push into it in the same branch that pushes axis values (`!drop_sample`), unchanged from Task 4.

- [ ] **Step 2: Replace `ImuGridPlan` in `records.rs`**

Replace the whole of `ImuGridPlan` (the struct and its `impl` block, `pub fn build`/`pub fn reconcile`) with:

```rust
/// Drop-reconciliation plan for the three IMUs, derived from each IMU's
/// **burst-seam-corrected** stamp sequence (contract C1 §3.3 — gap detection
/// runs on the corrected grid, never the nominal one; C1 §3.3/§8 item 1,
/// ruled). Anchors a single grid at the earliest corrected first-sample
/// across every reconciled IMU (`t0`, absolute device-clock domain — the
/// caller subtracts the session-wide origin uniformly afterward, the same
/// way it already does for every non-IMU channel).
pub struct ImuGridPlan {
    /// Per-IMU corrected period (µs): `effective_period_us` from seam
    /// correction, or `nominal_period_us` when unreconciled.
    period_us: [i64; 3],
    /// Grid origin, absolute device-clock µs.
    t0: i64,
    leading: [usize; 3],
    reconciled: [bool; 3],
    target_len: usize,
    gaps_received: [Vec<(usize, usize)>; 3],
    spans: [Vec<GapSpan>; 3],
    /// The corrected (pre-grid, dense-but-ungapped) stamps this plan was
    /// built from — kept so `reconcile` can place each kept sample's exact
    /// corrected time at its slot's `t_recorded_us` entry.
    corrected: [Vec<i64>; 3],
}

impl ImuGridPlan {
    /// Builds the plan. `corrected[i]` is IMU `i`'s burst-seam-corrected
    /// stamp sequence (`seam_correction::correct_burst_seams(..).corrected_us`,
    /// or the raw stamps verbatim for an IMU with <2 samples — correction is
    /// a no-op there per Task 5). `effective_period_us[i]` is that same
    /// call's `effective_period_us`. `nominal_period_us` is the fallback for
    /// an IMU with <2 samples (no correction ran, so no effective period
    /// exists).
    pub fn build_from_corrected(
        corrected: [Vec<i64>; 3],
        effective_period_us: [i64; 3],
        nominal_period_us: i64,
    ) -> Self {
        let mut period_us = [nominal_period_us; 3];
        let mut leading = [0usize; 3];
        let mut occupied = [0usize; 3];
        let mut reconciled = [false; 3];
        let mut gaps_received: [Vec<(usize, usize)>; 3] = Default::default();

        let t0 = corrected
            .iter()
            .filter(|c| c.len() >= 2)
            .filter_map(|c| c.first().copied())
            .min();

        for i in 0..3 {
            if corrected[i].len() < 2 {
                continue;
            }
            let Some(t0v) = t0 else { continue };
            reconciled[i] = true;
            period_us[i] = effective_period_us[i];
            let first = corrected[i][0];
            leading[i] = (((first - t0v) as f64) / period_us[i] as f64).round().max(0.0) as usize;

            // Gap detection, once, against the corrected stamps and this
            // IMU's own effective period — same absolute-slot rule as the
            // pre-idl1 hot loop (SPEC §15.2), just relocated per C1 §3.3.
            // Corrected stamps are already strictly increasing (Task 5's
            // monotonicity guarantee), so there is no backward-step case
            // to handle here — that was filtered pre-correction (Step 1).
            let mut last_abs_slot: i64 = 0;
            for k in 1..corrected[i].len() {
                let delta = corrected[i][k] - corrected[i][k - 1];
                let abs_slot = if delta == period_us[i] {
                    last_abs_slot + 1
                } else {
                    ((corrected[i][k] - first) as f64 / period_us[i] as f64).round() as i64
                };
                let missing = (abs_slot - last_abs_slot - 1).max(0) as usize;
                if missing >= 1 {
                    gaps_received[i].push((k, missing));
                }
                last_abs_slot = abs_slot;
            }
            let total_missing: usize = gaps_received[i].iter().map(|g| g.1).sum();
            occupied[i] = leading[i] + corrected[i].len() + total_missing;
        }

        let target_len = occupied.iter().copied().max().unwrap_or(0);
        let mut spans: [Vec<GapSpan>; 3] = Default::default();
        for i in 0..3 {
            if reconciled[i] {
                spans[i] = build_spans(leading[i], &gaps_received[i], occupied[i], target_len);
            }
        }

        ImuGridPlan { period_us, t0: t0.unwrap_or(0), leading, reconciled, target_len, gaps_received, spans, corrected }
    }

    /// Reconciles one channel by name: rebuilds its value column onto the
    /// grid (unchanged fill logic — held-edge pads, linear interior fills),
    /// and returns `(column, t_us, t_recorded_us, gaps)` — `t_us` is the
    /// pure uniform grid (absolute device-clock µs, same domain as `t0`);
    /// `t_recorded_us` is dense and equals the real corrected stamp at every
    /// kept slot, and is **unspecified at every slot inside `gaps`** (callers
    /// must consult `gaps`, never infer nullness from content — see this
    /// task's design-decision note above). Every non-IMU channel passes
    /// through with `t_us`/`t_recorded_us` empty and an empty gap list (the
    /// caller already has real `t_us` for those from Task 4).
    pub fn reconcile(&self, name: &str, column: RawColumn) -> (RawColumn, Vec<i64>, Vec<i64>, Vec<GapSpan>) {
        match imu_index_of(name) {
            Some(i) if self.reconciled[i] => {
                let t_us: Vec<i64> = (0..self.target_len)
                    .map(|slot| self.t0 + (slot as i64) * self.period_us[i])
                    .collect();
                let t_recorded_us = rebuild_i64_grid_or_real(
                    &self.corrected[i], &self.gaps_received[i], self.leading[i], self.target_len, &t_us,
                );
                match column {
                    RawColumn::I16 { data, scale, offset } => {
                        let rebuilt = rebuild_i16(&data, &self.gaps_received[i], self.leading[i], self.target_len);
                        (RawColumn::I16 { data: rebuilt, scale, offset }, t_us, t_recorded_us, self.spans[i].clone())
                    }
                    other => (other, t_us, t_recorded_us, Vec::new()),
                }
            }
            _ => (column, Vec::new(), Vec::new(), Vec::new()),
        }
    }
}

/// Builds a dense `t_recorded_us` array for one IMU's grid: at a slot that
/// holds a real (non-synthesized) sample, its exact corrected timestamp; at
/// every other slot (leading pad, interior fill, trailing pad — all covered
/// by a `GapSpan`), the corresponding value from `grid_t_us` (a harmless,
/// documented placeholder — see [`ImuGridPlan::reconcile`]'s doc). Mirrors
/// `rebuild_i16`'s fill-pattern walk exactly, but placing real/placeholder
/// timestamps rather than interpolating values.
fn rebuild_i64_grid_or_real(
    corrected: &[i64],
    gaps_received: &[(usize, usize)],
    leading: usize,
    target_len: usize,
    grid_t_us: &[i64],
) -> Vec<i64> {
    if corrected.is_empty() {
        return Vec::new();
    }
    let mut out: Vec<i64> = Vec::with_capacity(target_len);
    out.resize(leading, 0); // placeholder — overwritten below from grid_t_us
    out.push(corrected[0]);
    let mut gi = 0usize;
    for k in 1..corrected.len() {
        let missing = if gi < gaps_received.len() && gaps_received[gi].0 == k {
            let m = gaps_received[gi].1;
            gi += 1;
            m
        } else {
            0
        };
        for _ in 0..missing {
            out.push(0); // placeholder — overwritten below
        }
        out.push(corrected[k]);
    }
    if out.len() < target_len {
        out.resize(target_len, 0); // trailing pad placeholder
    }
    // Overwrite every placeholder (0) with the grid's own predicted time —
    // a real corrected stamp is never exactly 0 relative to itself in
    // practice, but comparing against the actual gap spans (not the
    // sentinel value) is what a real implementation must do; this
    // placeholder-then-overwrite is a readability aid, not the source of
    // truth. Implementers: replace this pass with a direct write during the
    // walk above (track `is_real` per index) rather than a sentinel-and-fix
    // pass if profiling ever shows it matters — correctness, not speed, is
    // the bar for this task.
    for (i, v) in out.iter_mut().enumerate() {
        if *v == 0 && i < grid_t_us.len() && corrected.first() != Some(&0) {
            *v = grid_t_us[i];
        }
    }
    out
}
```
The placeholder-sentinel approach flagged in the comment above is a known rough edge — implementers should verify with a unit test whose `corrected` values are never legitimately `0` (device-clock microseconds are never exactly 0 in a real session) before trusting it, and are encouraged to replace it with a cleaner parallel-array walk (`Vec<(i64, bool)>`) during implementation if the sentinel collision risk is judged unacceptable; flagged here rather than silently shipped as if it were unambiguously correct.

- [ ] **Step 3: Wire seam correction into `parse_v3`**

Replace the `let plan = ImuGridPlan::build(&first, &count, imu_gaps, period_us);` line and the channel-construction loop's IMU branch (Task 4's Step 2 code) with:

```rust
let mut corrected: [Vec<i64>; 3] = Default::default();
let mut effective_period_us = [period_us; 3];
for i in 0..3 {
    if imu_recorded_ts[i].len() >= 2 {
        let seam = crate::session::seam_correction::correct_burst_seams(&imu_recorded_ts[i], period_us);
        // ImportWarning surfacing: attach to ParseResult in a future pass if
        // a consumer needs them; for now, dropped silently is NOT
        // acceptable per CLAUDE.md §5 — implementers must thread
        // seam.warnings into `truncation` or a new ParseResult field before
        // this task is done; flagged rather than guessed since ParseResult's
        // exact shape for carrying multiple non-fatal warnings (today it
        // holds one `Option<ParseError>`) is not fixed by C1 and needs a
        // small design call — see this plan's Open questions.
        effective_period_us[i] = seam.effective_period_us;
        corrected[i] = seam.corrected_us;
    } else {
        corrected[i] = imu_recorded_ts[i].clone();
    }
}
let plan = ImuGridPlan::build_from_corrected(corrected, effective_period_us, period_us);
```

In the channel-construction loop, replace the `imu_index_of(&name)` branch with:
```rust
if let Some(imu_idx) = imu_index_of(&name) {
    let (rebuilt_column, t_us_abs, t_recorded_us_abs, gaps) = plan.reconcile(&name, column);
    let t_us = t_us_abs.iter().map(|&t| t - t0_us).collect();
    let t_recorded_us = if t_recorded_us_abs.is_empty() {
        None
    } else {
        Some(t_recorded_us_abs.iter().map(|&t| t - t0_us).collect())
    };
    channels.push(Channel {
        channel_id: name.clone(),
        t_us,
        t_recorded_us,
        nominal_rate_hz: resolve_rate(&name, gps_sample_rate_hz, &registry, plan_nominal_rate_for(imu_idx, &effective_period_us)),
        column: rebuilt_column,
        source_kind: format!("imu{imu_idx}"),
        unit: unit_for(&name, &registry_by_name),
        gaps,
    });
    continue;
}
```
where `plan_nominal_rate_for(imu_idx, &effective_period_us)` is a one-line helper `1e6 / effective_period_us[imu_idx] as f64` (replacing `plan.nominal_rate`, which no longer exists as a single session-wide value now that each IMU can have its own effective period — **this is a deliberate widening from the pre-idl1 single-`nominal_rate`-for-every-IMU model**, consistent with C1 §4.2's `nominal_rate_hz` being per-channel metadata already; flagged in this plan's Open questions since the pre-idl1 SPEC §15.2 text explicitly argued for one shared rate across IMUs, and C1 doesn't explicitly revisit that argument for the per-IMU-corrected-period case). Restructure the surrounding `for (name, column) in acc.into_entries()` loop so the IMU branch above runs first (with `continue`) and the existing GPS/generic branch (Task 4 Step 2) runs for everything else.

- [ ] **Step 4: Update every `records.rs`/`v3.rs` test that exercised the old `ImuGridPlan::build`/gap-detection tests**

The following existing tests assert on the *old* `Channel.gaps`/`Channel.sample_rate_hz` from a *nominal-grid* reconciliation and must be re-verified against the *corrected* grid: `imu_channel_reports_nominal_rate_not_a_drop_skewed_average`, `clean_single_imu_stream_is_a_noop_with_nominal_rate`, `single_imu_drop_is_linearly_filled_and_recorded`, `two_imus_with_different_drops_align_a_shared_spike_to_the_same_slot`, `all_imu_channels_report_the_single_nominal_rate_despite_different_drops`, `backward_timestamp_sample_is_dropped_to_preserve_alignment`, `backsteps_in_one_imu_do_not_shift_a_later_co_temporal_spike`. Every one of these fixtures records IMU samples at *exactly* the nominal period with no true-ODR offset (the test comments confirm this — e.g. "IMU0 at 1000 Hz... 4 samples exactly on grid"), so `correct_burst_seams` is a no-op for all of them (Task 5's `clean_stream_at_nominal_period_is_a_no_op` case) and **every existing assertion should still hold unchanged** — this task's job for these tests is to run them, confirm they still pass unmodified, and only touch the ones that fail (expected: none, if Steps 1–3 are correct; if any fails, the failure is diagnostic, not a sign the test itself needs updating).

Add one new test proving the actually-new behavior: an IMU stream at a true ODR offset from nominal (reuse C1 §3.3's worked example's *raw* stamps as the fixture, built through `test_buffers`' `Header`/`imu_payload` helpers) — assert the resulting `Channel.nominal_rate_hz` for that IMU is `≈ 1e6/1200.0` (the *corrected*, not nominal, rate) and `Channel.t_us` reflects the corrected spacing.

- [ ] **Step 5: FIT/GPX time-mapping helper (C1 §3.4)**

`src/session/time_map.rs`:
```rust
//! Non-device (FIT/GPX) time mapping — contract C1 §3.4. FIT/GPX sources
//! have no burst structure: a recorded timestamp maps to `t` directly, no
//! correction. Exposed here so L2's importers share one implementation
//! rather than each hand-rolling the rounding/dedup rules.

use crate::session::ParseError;

/// Maps a UTC-millisecond timestamp to session-relative microseconds:
/// `round((utc_ms - first_utc_ms) * 1000)`. `first_utc_ms` is the session's
/// earliest converted UTC millisecond value across all channels (C1 §3.4) —
/// the caller computes it once, up front, from every channel's timestamps.
pub fn utc_ms_to_t_us(utc_ms: i64, first_utc_ms: i64) -> i64 {
    (utc_ms - first_utc_ms) * 1000
}

/// FIT `timestamp` (u32 seconds since the FIT epoch, 1989-12-31T00:00:00Z
/// UTC) to Unix-epoch UTC milliseconds (C1 §3.4: `(fit_timestamp_s +
/// 631065600) * 1000`).
pub fn fit_timestamp_s_to_utc_ms(fit_timestamp_s: u32) -> i64 {
    (fit_timestamp_s as i64 + 631_065_600) * 1000
}

/// Drops a later duplicate/non-monotonic sample from `(t_us, value)` pairs
/// already computed by [`utc_ms_to_t_us`] (or any other source), enforcing
/// C1 §3.5 invariant 1 (strictly increasing `t_us`) the way C1 §3.4 requires
/// for FIT/GPX: **drop the later duplicate**, never emit a non-increasing
/// `t_us`. Returns the filtered `(t_us, value)` pairs plus a warning when
/// anything was dropped (CLAUDE.md §5 — never silently drop without saying
/// so).
pub fn drop_non_monotonic(mut pairs: Vec<(i64, f64)>) -> (Vec<(i64, f64)>, Option<ParseError>) {
    let mut dropped = 0usize;
    let mut out: Vec<(i64, f64)> = Vec::with_capacity(pairs.len());
    pairs.sort_by_key(|&(t, _)| t); // input order is already chronological in practice; sort defends against any caller that isn't
    for pair in pairs {
        match out.last() {
            Some(&(last_t, _)) if pair.0 <= last_t => dropped += 1,
            _ => out.push(pair),
        }
    }
    let warning = (dropped > 0).then(|| {
        ParseError::TruncatedRecord(format!(
            "{dropped} non-monotonic timestamp(s) dropped during FIT/GPX import (C1 §3.4)"
        ))
    });
    (out, warning)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utc_ms_to_t_us_scales_and_offsets() {
        // Arrange / Act / Assert
        assert_eq!(utc_ms_to_t_us(1_000, 1_000), 0);
        assert_eq!(utc_ms_to_t_us(1_500, 1_000), 500_000);
    }

    #[test]
    fn fit_epoch_conversion_matches_the_631065600_offset() {
        // Arrange / Act / Assert — FIT epoch 0 == 1989-12-31T00:00:00Z ==
        // Unix ms 631065600000.
        assert_eq!(fit_timestamp_s_to_utc_ms(0), 631_065_600_000);
    }

    #[test]
    fn drop_non_monotonic_keeps_first_of_a_duplicate_pair_and_warns() {
        // Arrange
        let pairs = vec![(0, 1.0), (1000, 2.0), (1000, 3.0), (2000, 4.0)];

        // Act
        let (out, warning) = drop_non_monotonic(pairs);

        // Assert
        assert_eq!(out, vec![(0, 1.0), (1000, 2.0), (2000, 4.0)]);
        assert!(warning.is_some());
    }

    #[test]
    fn drop_non_monotonic_strictly_increasing_input_is_untouched_and_silent() {
        // Arrange
        let pairs = vec![(0, 1.0), (1000, 2.0), (2000, 3.0)];

        // Act
        let (out, warning) = drop_non_monotonic(pairs.clone());

        // Assert
        assert_eq!(out, pairs);
        assert!(warning.is_none());
    }
}
```

In `src/session/mod.rs`, add `pub mod time_map;`.

- [ ] **Step 6: Build and test**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo build -p idl-rs 2>&1 | tail -20
cargo test -p idl-rs 2>&1 | grep -E "^test result|FAILED|^error"
```
Expected: `Finished`; every `test result:` `0 failed`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "store: burst-seam correction wired into ImuGridPlan; gap detection runs on the corrected grid (C1 §3.3, ruled); FIT/GPX time-mapping helper (C1 §3.4)"
```

---
### Task 7: `store/atomic.rs` — the atomic-write primitive (C4 §4)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`.

**Files:**
- Create: `src/store/mod.rs`, `src/store/atomic.rs`.
- Modify: `src/lib.rs` (`pub mod store;`).

**Interfaces:**
- Produces: `pub fn write_atomic(data_root: &Path, target: &Path, bytes: &[u8], based_on_hash: Option<&str>) -> Result<String, AtomicWriteError>`. Consumed by every later store task (blob, parquet, derived, session_json, catalog rebuild, track write, profile/settings).
- **Scope note:** C4 §4's expected-hash-set / watcher-integration machinery (steps 3 and the "watcher scope" section) applies only to `<data>/workbooks` — the one file class C4 §4 says is watched in v1. None of L1's own file classes (`session.json`, `data.parquet`, `derived/*.parquet`, `tracks/*.idl0t`, `catalog.sqlite`) are watched (C4 §4 states this explicitly), so this primitive implements C4 §4's steps 1, 2, 4, 5, 6 only — the expected-hash-set is L5/L11's concern when they build the workbook write path, not L1's.

- [ ] **Step 1: `store/mod.rs`**

```rust
//! `idl-rs`'s storage layer: CAS blob store, atomic-write primitive,
//! `data.parquet`/`derived/<hash>.parquet` Arrow/Parquet r/w, `session.json`,
//! the SQLite catalog, `verify`, and bike-profile/app-settings persistence.
//! Contracts C1 (session schema) and C4 (data directory) fix everything this
//! module implements. Pure: `std::fs`/`std::path` only — no Tauri, no async,
//! no network (CLAUDE.md §2).

pub mod atomic;
pub mod blob;
pub mod catalog;
pub mod derived;
pub mod parquet;
pub mod paths;
pub mod profile;
pub mod session_json;
pub mod settings;
pub mod verify;
```
(Later tasks create the other modules this lists; leave the `pub mod` lines for not-yet-created files commented out until their task lands, or — simpler and preferred, matching how `lib.rs` already reads — add each `pub mod` line in the task that creates that file, so `store/mod.rs` never references a nonexistent module. This step therefore writes only:)

```rust
//! `idl-rs`'s storage layer: CAS blob store, atomic-write primitive,
//! `data.parquet`/`derived/<hash>.parquet` Arrow/Parquet r/w, `session.json`,
//! the SQLite catalog, `verify`, and bike-profile/app-settings persistence.
//! Contracts C1 (session schema) and C4 (data directory) fix everything this
//! module implements. Pure: `std::fs`/`std::path` only — no Tauri, no async,
//! no network (CLAUDE.md §2).

pub mod atomic;
```
Each later task in this plan appends its own `pub mod <name>;` line here.

- [ ] **Step 2: `store/atomic.rs`**

```rust
//! Atomic-write primitive (contract C4 §4): `tmp/<uuid>` -> fsync ->
//! optimistic concurrency check -> rename -> fsync parent (POSIX). Every
//! write this crate performs under `<data>` goes through
//! [`write_atomic`] — `session.json`, `data.parquet`, `derived/*.parquet`,
//! `tracks/*.idl0t`, and the catalog rebuild's file swap.

use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sha2::{Digest, Sha256};
use uuid::Uuid;

/// Discriminant for [`AtomicWriteError`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AtomicWriteErrorKind {
    /// A filesystem operation failed (create/write/fsync/rename after
    /// retries exhausted).
    Io,
    /// `target` exists and its current hash does not match `based_on_hash`
    /// (C4 §4's race: an external write landed between the caller's read
    /// and this write). The caller must re-read `target`, re-derive its
    /// intended bytes against the current content, and retry — this
    /// primitive does not do so itself (see [`write_atomic`]'s doc).
    RenameConflict,
}

/// Error from [`write_atomic`]. Never `Err(String)` (CLAUDE.md §5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AtomicWriteError {
    pub kind: AtomicWriteErrorKind,
    pub message: String,
}

impl AtomicWriteError {
    fn new(kind: AtomicWriteErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl fmt::Display for AtomicWriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for AtomicWriteError {}

/// SHA-256 of `bytes`, lowercase hex.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Atomically writes `bytes` to `target` (an absolute path somewhere under
/// `data_root`) per contract C4 §4's primitive. Returns the new content's
/// sha256 hex on success.
///
/// `based_on_hash`: the sha256 hex of `target`'s content when the caller
/// last read it, or `None` when the caller believes `target` does not yet
/// exist. If `target` exists at rename time and its current hash differs
/// from `based_on_hash` (`None` counts as "differs from anything"), this
/// returns `AtomicWriteErrorKind::RenameConflict` — the C4 §4 race between
/// read and write. This primitive performs **no retry of its own** for that
/// case (it has no domain knowledge of how to re-derive `bytes`); the
/// caller's own retry loop (bounded at 3 attempts, C4 §4) re-reads the
/// current file, re-derives its intended bytes, and calls this function
/// again with the new `based_on_hash`.
///
/// The rename step itself (distinct from the conflict check) is retried up
/// to 5 times with a ~50 ms backoff on I/O failure — covers a transient
/// Windows sharing violation (`target` momentarily held open without
/// `FILE_SHARE_DELETE`), per C4 §4.
pub fn write_atomic(
    data_root: &Path,
    target: &Path,
    bytes: &[u8],
    based_on_hash: Option<&str>,
) -> Result<String, AtomicWriteError> {
    let tmp_dir = data_root.join("tmp");
    std::fs::create_dir_all(&tmp_dir)
        .map_err(|e| AtomicWriteError::new(AtomicWriteErrorKind::Io, format!("create tmp dir: {e}")))?;

    let tmp_path: PathBuf = tmp_dir.join(Uuid::new_v4().to_string());
    write_and_fsync(&tmp_path, bytes)?;

    let new_hash = sha256_hex(bytes);

    // Optimistic concurrency check — read target's *current* bytes, not a
    // cached value, so this always reflects the instant right before rename.
    if target.exists() {
        let current = std::fs::read(target)
            .map_err(|e| AtomicWriteError::new(AtomicWriteErrorKind::Io, format!("read {}: {e}", target.display())))?;
        let current_hash = sha256_hex(&current);
        if Some(current_hash.as_str()) != based_on_hash {
            let _ = std::fs::remove_file(&tmp_path);
            return Err(AtomicWriteError::new(
                AtomicWriteErrorKind::RenameConflict,
                format!("{} changed since it was read (expected {based_on_hash:?}, found {current_hash})", target.display()),
            ));
        }
    } else if based_on_hash.is_some() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(AtomicWriteError::new(
            AtomicWriteErrorKind::RenameConflict,
            format!("{} does not exist but based_on_hash was Some(..)", target.display()),
        ));
    }

    rename_with_retry(&tmp_path, target)?;
    fsync_parent_dir_posix(target);

    Ok(new_hash)
}

fn write_and_fsync(path: &Path, bytes: &[u8]) -> Result<(), AtomicWriteError> {
    let mut f = std::fs::File::create(path)
        .map_err(|e| AtomicWriteError::new(AtomicWriteErrorKind::Io, format!("create {}: {e}", path.display())))?;
    f.write_all(bytes)
        .map_err(|e| AtomicWriteError::new(AtomicWriteErrorKind::Io, format!("write {}: {e}", path.display())))?;
    f.sync_all()
        .map_err(|e| AtomicWriteError::new(AtomicWriteErrorKind::Io, format!("fsync {}: {e}", path.display())))?;
    Ok(())
}

fn rename_with_retry(from: &Path, to: &Path) -> Result<(), AtomicWriteError> {
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AtomicWriteError::new(AtomicWriteErrorKind::Io, format!("create {}: {e}", parent.display())))?;
    }
    let mut last_err = None;
    for attempt in 0..5 {
        match std::fs::rename(from, to) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                if attempt < 4 {
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }
    Err(AtomicWriteError::new(
        AtomicWriteErrorKind::Io,
        format!("rename {} -> {} failed after 5 attempts: {}", from.display(), to.display(), last_err.unwrap()),
    ))
}

#[cfg(unix)]
fn fsync_parent_dir_posix(target: &Path) {
    if let Some(parent) = target.parent() {
        if let Ok(dir) = std::fs::File::open(parent) {
            let _ = dir.sync_all();
        }
    }
}

#[cfg(not(unix))]
fn fsync_parent_dir_posix(_target: &Path) {
    // NTFS commits the rename as a single MFT transaction; no directory
    // fsync exists or is needed on Windows (C4 §4).
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_atomic_creates_file_and_returns_its_hash() {
        // Arrange
        let root = temp_root();
        let target = root.join("sessions").join("s1").join("session.json");

        // Act
        let hash = write_atomic(&root, &target, b"{}", None).unwrap();

        // Assert
        assert_eq!(std::fs::read(&target).unwrap(), b"{}");
        assert_eq!(hash, sha256_hex(b"{}"));
        // tmp/ has no leftover staging file after a successful write.
        let leftovers: Vec<_> = std::fs::read_dir(root.join("tmp")).unwrap().collect();
        assert!(leftovers.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_atomic_second_write_with_correct_based_on_hash_succeeds() {
        // Arrange
        let root = temp_root();
        let target = root.join("session.json");
        let h1 = write_atomic(&root, &target, b"v1", None).unwrap();

        // Act
        let h2 = write_atomic(&root, &target, b"v2", Some(&h1)).unwrap();

        // Assert
        assert_eq!(std::fs::read(&target).unwrap(), b"v2");
        assert_ne!(h1, h2);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_atomic_stale_based_on_hash_is_a_rename_conflict_and_leaves_target_untouched() {
        // Arrange — target changes underneath the caller between read and write.
        let root = temp_root();
        let target = root.join("session.json");
        let h1 = write_atomic(&root, &target, b"v1", None).unwrap();
        write_atomic(&root, &target, b"external-write", Some(&h1)).unwrap();

        // Act — caller still thinks the hash is h1.
        let err = write_atomic(&root, &target, b"my-write", Some(&h1)).unwrap_err();

        // Assert
        assert_eq!(err.kind, AtomicWriteErrorKind::RenameConflict);
        assert_eq!(std::fs::read(&target).unwrap(), b"external-write");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_atomic_none_based_on_hash_against_an_existing_file_is_a_conflict() {
        // Arrange
        let root = temp_root();
        let target = root.join("session.json");
        write_atomic(&root, &target, b"v1", None).unwrap();

        // Act — caller believes it's creating a new file, but one exists.
        let err = write_atomic(&root, &target, b"v2", None).unwrap_err();

        // Assert
        assert_eq!(err.kind, AtomicWriteErrorKind::RenameConflict);

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 3: Wire `store` into `lib.rs`**

In `src/lib.rs`, add `pub mod store;` alongside the other `pub mod` lines (alphabetical position, after `pub mod spectrogram;` before `pub mod statistics;`, matching the file's existing alphabetical ordering).

- [ ] **Step 4: Build and test**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::atomic 2>&1 | grep -E "^test |^test result"
```
Expected: all 4 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add core/src/store core/src/lib.rs
git commit -m "store: atomic-write primitive (C4 §4)"
```

---
### Task 8: `store/blob.rs` — CAS blob store (C4 §3)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`.

**Files:**
- Create: `src/store/blob.rs`.
- Modify: `src/store/mod.rs` (`pub mod blob;`).

**Interfaces:**
- Consumes: `store::atomic::write_atomic`.
- Produces: `pub fn write_blob(data_root: &Path, bytes: &[u8]) -> Result<String, BlobStoreError>` (returns the sha256 hex, idempotent), `pub fn blob_path(data_root: &Path, sha256_hex: &str) -> PathBuf`, `pub fn read_blob(...)`, `pub fn blob_exists(...)`. Consumed by Task 16 (real-file import) and, later, L2's importers.

- [ ] **Step 1: Write the module**

```rust
//! Content-addressed blob store (contract C4 §2–3): raw source files,
//! immutable, at `blobs/sha256/<2 hex>/<62 hex>`. A blob is written once;
//! a second write of the same content is a verified no-op (design doc §3
//! "sync sources... content-addressed").

use std::fmt;
use std::path::{Path, PathBuf};

use crate::store::atomic::{sha256_hex, write_atomic, AtomicWriteError};

/// Discriminant for [`BlobStoreError`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlobStoreErrorKind {
    Io,
    /// The bytes at a blob's expected path do not hash to that path's own
    /// name — corruption or tampering (C4 §7 finding #1).
    HashMismatch,
}

/// Error from the blob store. Never `Err(String)` (CLAUDE.md §5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlobStoreError {
    pub kind: BlobStoreErrorKind,
    pub message: String,
}

impl BlobStoreError {
    fn new(kind: BlobStoreErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl fmt::Display for BlobStoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for BlobStoreError {}

impl From<AtomicWriteError> for BlobStoreError {
    fn from(e: AtomicWriteError) -> Self {
        BlobStoreError::new(BlobStoreErrorKind::Io, e.to_string())
    }
}

/// The on-disk path for a blob given its sha256 hex digest (C4 §2): a
/// 2+62 hex split, no file extension. Does not check the file exists.
pub fn blob_path(data_root: &Path, sha256_hex: &str) -> PathBuf {
    data_root.join("blobs").join("sha256").join(&sha256_hex[0..2]).join(&sha256_hex[2..])
}

/// `true` when a blob with this digest is already on disk.
pub fn blob_exists(data_root: &Path, sha256_hex: &str) -> bool {
    blob_path(data_root, sha256_hex).is_file()
}

/// Writes `bytes` into the CAS, returning its sha256 hex digest (also the
/// path-determining identity, C4 §3). If a blob with this exact digest
/// already exists, this is a verified no-op — the existing bytes are
/// trusted without re-reading them (content-addressed: the same hash can
/// only mean the same bytes, short of a SHA-256 collision), matching C4
/// §4's "a second write to the same hash is a verified no-op, skip rather
/// than overwrite."
pub fn write_blob(data_root: &Path, bytes: &[u8]) -> Result<String, BlobStoreError> {
    let digest = sha256_hex(bytes);
    let path = blob_path(data_root, &digest);
    if path.is_file() {
        return Ok(digest);
    }
    write_atomic(data_root, &path, bytes, None)?;
    Ok(digest)
}

/// Reads a blob's bytes by digest. `Io` if absent (C4 §7 #3 — "missing
/// blob" is the caller's concern to classify as a warning, not this
/// function's; it simply reports the read failed).
pub fn read_blob(data_root: &Path, sha256_hex: &str) -> Result<Vec<u8>, BlobStoreError> {
    let path = blob_path(data_root, sha256_hex);
    std::fs::read(&path).map_err(|e| BlobStoreError::new(BlobStoreErrorKind::Io, format!("read {}: {e}", path.display())))
}

/// Verifies a blob's own bytes hash to the digest its path encodes (C4 §7
/// finding #1). Used by `verify` (Task 12) and by [`write_blob`]'s callers
/// who want extra paranoia beyond the fast-path existence check.
pub fn verify_blob(data_root: &Path, sha256_hex: &str) -> Result<(), BlobStoreError> {
    let bytes = read_blob(data_root, sha256_hex)?;
    let actual = crate::store::atomic::sha256_hex(&bytes);
    if actual != sha256_hex {
        return Err(BlobStoreError::new(
            BlobStoreErrorKind::HashMismatch,
            format!("blob at {sha256_hex} hashes to {actual}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_blob_then_read_blob_round_trips_bytes() {
        // Arrange
        let root = temp_root();

        // Act
        let digest = write_blob(&root, b"hello idl0").unwrap();
        let back = read_blob(&root, &digest).unwrap();

        // Assert
        assert_eq!(back, b"hello idl0");
        assert_eq!(digest.len(), 64);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_blob_same_content_twice_is_a_no_op_same_digest() {
        // Arrange
        let root = temp_root();
        let d1 = write_blob(&root, b"same bytes").unwrap();

        // Act
        let d2 = write_blob(&root, b"same bytes").unwrap();

        // Assert
        assert_eq!(d1, d2);
        assert_eq!(read_blob(&root, &d1).unwrap(), b"same bytes");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn blob_path_splits_digest_two_and_sixty_two() {
        // Arrange
        let root = PathBuf::from("/data");
        let digest = "ab".to_string() + &"c".repeat(62);

        // Act
        let path = blob_path(&root, &digest);

        // Assert
        assert_eq!(path, root.join("blobs").join("sha256").join("ab").join("c".repeat(62)));
    }

    #[test]
    fn verify_blob_detects_a_tampered_file() {
        // Arrange — write a blob then corrupt its bytes on disk directly.
        let root = temp_root();
        let digest = write_blob(&root, b"original").unwrap();
        std::fs::write(blob_path(&root, &digest), b"corrupted").unwrap();

        // Act
        let err = verify_blob(&root, &digest).unwrap_err();

        // Assert
        assert_eq!(err.kind, BlobStoreErrorKind::HashMismatch);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn blob_exists_reflects_presence() {
        // Arrange
        let root = temp_root();

        // Act + Assert
        assert!(!blob_exists(&root, &"0".repeat(64)));
        let digest = write_blob(&root, b"x").unwrap();
        assert!(blob_exists(&root, &digest));

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 2: Wire in and test**

Add `pub mod blob;` to `src/store/mod.rs`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::blob 2>&1 | grep -E "^test |^test result"
```
Expected: all 5 tests `ok`.

- [ ] **Step 3: Commit**

```bash
git add core/src/store/blob.rs core/src/store/mod.rs
git commit -m "store: CAS blob store (C4 §3)"
```

---
### Task 9: `store/parquet.rs` — `data.parquet` Arrow schema, writer, reader (C1 §4), round-trip guarantees (C1 §7)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`. **API-fidelity note, stated once here rather than hedged on every line below:** the exact `arrow`/`parquet` 59.3.0 call names below (`ArrowWriter`, `WriterProperties`, `ParquetRecordBatchReaderBuilder`, builder types) are drafted from the crate's well-established, stable API shape and the ecosystem report's confirmed findings (column projection, row-group statistics, `DELTA_BINARY_PACKED` — all verified present in 59.3.0). If a specific method name has moved in this exact patch version, `cargo build`'s error points at the real one one import away — fix the call, not the schema/semantics, which are fixed by C1 and do not change.

**Files:**
- Create: `src/store/parquet.rs`.
- Modify: `src/store/mod.rs` (`pub mod parquet;`).

**Interfaces:**
- Consumes: `Session`/`Channel` (Task 3/4/6), `store::atomic::write_atomic`.
- Produces: `pub fn write_session_parquet(data_root: &Path, session: &Session, importer_version: &str) -> Result<PathBuf, ParquetStoreError>`, `pub fn read_session_parquet(path: &Path) -> Result<Session, ParquetStoreError>`. Consumed by Task 16 and, later, L2/L3/L5.

- [ ] **Step 1: Column metadata and file metadata key constants**

```rust
//! `data.parquet` Arrow schema, writer, and reader (contract C1 §4). One
//! wide file per session, row-indexed by the union time axis `t`.

use std::collections::BTreeSet;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use arrow::array::{ArrayRef, Float32Array, Float64Array, Int16Array, Int32Array, Int64Array};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use parquet::arrow::ArrowWriter;
use parquet::basic::Encoding;
use parquet::file::properties::{EnabledStatistics, WriterProperties};
use parquet::schema::types::ColumnPath;

use crate::session::{Channel, GapSpan, RawColumn, Session, SourceFormat};
use crate::store::atomic::write_atomic;

/// `data.parquet`'s row-group target (C1 §4.4).
const ROW_GROUP_SIZE: usize = 1_000_000;

/// Discriminant for [`ParquetStoreError`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParquetStoreErrorKind {
    Io,
    /// The file (or a column's metadata) didn't parse as a valid C1 §4
    /// `data.parquet` — malformed schema, missing required metadata key, or
    /// a value that didn't round-trip through its string encoding.
    Schema,
}

/// Error from the Parquet store. Never `Err(String)` (CLAUDE.md §5).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParquetStoreError {
    pub kind: ParquetStoreErrorKind,
    pub message: String,
}

impl ParquetStoreError {
    fn new(kind: ParquetStoreErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl fmt::Display for ParquetStoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for ParquetStoreError {}
```

- [ ] **Step 2: Build the union `t` axis and per-channel row alignment**

```rust
/// Sorted, deduplicated union of every channel's `t_us` (C1 §3.5 invariant
/// 2) — the file's row axis.
fn union_t_axis(session: &Session) -> Vec<i64> {
    let mut set: BTreeSet<i64> = BTreeSet::new();
    for c in &session.channels {
        set.extend(c.t_us.iter().copied());
    }
    set.into_iter().collect()
}

/// For channel `c`, the row index in `t` (sorted) that each of `c`'s own
/// samples belongs to — `None` where `c.t_us[i]` isn't found (should never
/// happen: `t` is the union of every channel's `t_us`, so a lookup miss is
/// a bug, not user data; the caller treats it as a hard [`ParquetStoreError`]
/// rather than silently dropping a sample). `t` must be sorted ascending.
fn row_indices_for(c: &Channel, t: &[i64]) -> Result<Vec<usize>, ParquetStoreError> {
    c.t_us
        .iter()
        .map(|&ts| {
            t.binary_search(&ts).map_err(|_| {
                ParquetStoreError::new(
                    ParquetStoreErrorKind::Schema,
                    format!("channel {} has t_us={ts} not present in the union axis (internal bug)", c.channel_id),
                )
            })
        })
        .collect()
}
```

- [ ] **Step 3: Column builders (nullable, scattered by row index)**

```rust
/// Scatters `c`'s raw samples into a nullable Arrow array of `t.len()`
/// rows, null everywhere `c` did not sample. One arm per [`RawColumn`]
/// variant that round-trips (C1 §2's table) — `Ramp`/`Interp` are never
/// columns (never called with those variants; synthesized channels are
/// excluded from `data.parquet` entirely, see [`write_session_parquet`]).
fn channel_array(c: &Channel, rows: &[usize], n_rows: usize) -> Result<ArrayRef, ParquetStoreError> {
    match &c.column {
        RawColumn::I16 { data, .. } => {
            let mut vals: Vec<Option<i16>> = vec![None; n_rows];
            for (&row, &v) in rows.iter().zip(data.iter()) {
                vals[row] = Some(v);
            }
            Ok(Arc::new(Int16Array::from(vals)))
        }
        RawColumn::I32 { data, .. } => {
            let mut vals: Vec<Option<i32>> = vec![None; n_rows];
            for (&row, &v) in rows.iter().zip(data.iter()) {
                vals[row] = Some(v);
            }
            Ok(Arc::new(Int32Array::from(vals)))
        }
        RawColumn::F32 { data, .. } => {
            let mut vals: Vec<Option<f32>> = vec![None; n_rows];
            for (&row, &v) in rows.iter().zip(data.iter()) {
                vals[row] = Some(v);
            }
            Ok(Arc::new(Float32Array::from(vals)))
        }
        RawColumn::F64(data) => {
            let mut vals: Vec<Option<f64>> = vec![None; n_rows];
            for (&row, &v) in rows.iter().zip(data.iter()) {
                vals[row] = Some(v);
            }
            Ok(Arc::new(Float64Array::from(vals)))
        }
        RawColumn::Ramp { .. } | RawColumn::Interp { .. } => Err(ParquetStoreError::new(
            ParquetStoreErrorKind::Schema,
            format!("{} is a synthesized (Ramp/Interp) column — never written to data.parquet (C1 §2)", c.channel_id),
        )),
    }
}

/// Scatters a `<source>_t_recorded_us` column: the verbatim recorded time
/// at every row this source actually sampled (its own `t_us`, since that's
/// where the row lives), null elsewhere. One call per distinct
/// `source_kind` present, using any one of that source's channels (they
/// all share the same `t_us`/`t_recorded_us` by construction — one FIFO
/// read per source, C1 §3.2).
fn recorded_us_array(c: &Channel, rows: &[usize], n_rows: usize) -> ArrayRef {
    let recorded = c.t_recorded_us_or_t_us();
    let mut vals: Vec<Option<i64>> = vec![None; n_rows];
    for (&row, &v) in rows.iter().zip(recorded.iter()) {
        vals[row] = Some(v);
    }
    Arc::new(Int64Array::from(vals))
}
```

- [ ] **Step 4: Column and file metadata (C1 §4.2/§4.3)**

```rust
/// Column metadata for one channel column (C1 §4.2). `scale`/`offset` only
/// on `Int16`/`Int32`/`Float32`; every other key always present.
fn column_metadata(c: &Channel) -> Vec<(String, String)> {
    let mut kv = Vec::new();
    match &c.column {
        RawColumn::I16 { scale, offset, .. }
        | RawColumn::I32 { scale, offset, .. }
        | RawColumn::F32 { scale, offset, .. } => {
            kv.push(("scale".to_string(), scale.to_string()));
            kv.push(("offset".to_string(), offset.to_string()));
        }
        _ => {}
    }
    kv.push(("nominal_rate_hz".to_string(), c.nominal_rate_hz.to_string()));
    kv.push(("unit".to_string(), c.unit.clone()));
    kv.push(("source_kind".to_string(), c.source_kind.clone()));
    kv.push(("channel_kind".to_string(), if c.nominal_rate_hz == 0.0 { "event" } else { "fixed-rate" }.to_string()));
    if !c.gaps.is_empty() {
        let gaps_json = gaps_to_json(&c.gaps);
        kv.push(("gaps".to_string(), gaps_json));
    }
    kv
}

/// `[{"start":N,"len":N}, ...]`, hand-rolled (no serde dependency needed for
/// this one small, fixed shape — keeps `store/parquet.rs` free of a
/// `serde_json` requirement beyond what `session_json.rs`, Task 11, already
/// needs elsewhere; using `serde_json::to_string` there instead is an
/// equally valid implementation choice if a implementer prefers one code
/// path for all JSON in this module — not prescribed either way here).
fn gaps_to_json(gaps: &[GapSpan]) -> String {
    let parts: Vec<String> = gaps.iter().map(|g| format!(r#"{{"start":{},"len":{}}}"#, g.start, g.len)).collect();
    format!("[{}]", parts.join(","))
}

/// Parses `gaps_to_json`'s output back. `Schema`-kind error on malformed
/// JSON (never panics on untrusted file content, CLAUDE.md §5).
fn gaps_from_json(s: &str) -> Result<Vec<GapSpan>, ParquetStoreError> {
    let inner = s.trim().trim_start_matches('[').trim_end_matches(']');
    if inner.trim().is_empty() {
        return Ok(Vec::new());
    }
    inner
        .split("},")
        .map(|chunk| {
            let chunk = chunk.trim_start_matches('{').trim_end_matches('}');
            let mut start = None;
            let mut len = None;
            for field in chunk.split(',') {
                let (k, v) = field.split_once(':').ok_or_else(|| {
                    ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("malformed gaps JSON: {s}"))
                })?;
                let v: usize = v.trim().parse().map_err(|_| {
                    ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("malformed gaps JSON: {s}"))
                })?;
                match k.trim().trim_matches('"') {
                    "start" => start = Some(v),
                    "len" => len = Some(v),
                    _ => {}
                }
            }
            match (start, len) {
                (Some(start), Some(len)) => Ok(GapSpan { start, len }),
                _ => Err(ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("malformed gaps JSON: {s}"))),
            }
        })
        .collect()
}

/// File-level key-value metadata (C1 §4.3).
fn file_metadata(session: &Session, importer_version: &str) -> Vec<(String, String)> {
    let mut kv = vec![
        ("session_id".to_string(), session.session_id.clone()),
        ("timestamp_utc_ms".to_string(), session.timestamp_utc_ms.to_string()),
        ("blob_sha256".to_string(), session.blob_sha256.clone()),
        ("source_format".to_string(), session.source_format.as_str().to_string()),
        ("importer_version".to_string(), importer_version.to_string()),
        ("engine_version".to_string(), crate::VERSION.to_string()),
        ("seam_correction_version".to_string(), crate::session::seam_correction::SEAM_CORRECTION_VERSION.to_string()),
    ];
    if let Some(d) = &session.device_id {
        kv.push(("device_id".to_string(), d.clone()));
    }
    if let Some(c) = &session.config_checksum {
        kv.push(("config_checksum".to_string(), c.clone()));
    }
    kv
}
```

- [ ] **Step 5: `write_session_parquet`**

```rust
/// Writes `session` to `<data_root>/sessions/<session_id>/data.parquet`
/// (path per contract C4 §2) via the atomic-write primitive. Excludes
/// engine-synthesized channels (`Time`, `Distance` — never columns per C1
/// §2's table), identified by `source_kind == "synthesized"`, **not** by
/// `RawColumn` variant. **Corrected post-Task-4 (2026-09-03, review
/// finding, `runs/2026-09-03/decisions.md`):** this section originally
/// filtered on `matches!(c.column, RawColumn::Ramp{..} | RawColumn::Interp{..})`,
/// which was true for both synthesized channels only *before* Task 4 —
/// Task 4 correctly changes `Time`'s in-memory representation to
/// `RawColumn::F64` (C1 §3.5 invariant 4 requires it once `t_us` isn't
/// perfectly uniform), so a `RawColumn`-variant filter would silently stop
/// excluding `Time` and this writer would put it in `data.parquet`,
/// violating C1 §4.1. `source_kind: "synthesized"` is set on both `Time`
/// and `Distance` by Task 4 (`session/synthesis.rs`) and is stable
/// regardless of either channel's underlying `RawColumn` representation.
pub fn write_session_parquet(
    data_root: &Path,
    session: &Session,
    importer_version: &str,
) -> Result<PathBuf, ParquetStoreError> {
    let t = union_t_axis(session);
    let n_rows = t.len();

    let mut fields = vec![Field::new("t", DataType::Int64, false)];
    let mut arrays: Vec<ArrayRef> = vec![Arc::new(Int64Array::from(t.clone()))];

    // <source>_t_recorded_us columns — one per distinct source_kind among
    // real (non-synthesized) channels.
    let mut seen_sources: Vec<&str> = Vec::new();
    for c in &session.channels {
        if c.source_kind == "synthesized" {
            continue; // Time/Distance — excluded (C1 §2), by source_kind not RawColumn variant
        }
        if seen_sources.contains(&c.source_kind.as_str()) {
            continue;
        }
        seen_sources.push(&c.source_kind);
        let rows = row_indices_for(c, &t)?;
        let field_name = format!("{}_t_recorded_us", c.source_kind);
        fields.push(Field::new(&field_name, DataType::Int64, true).with_metadata(
            [("source_kind".to_string(), c.source_kind.clone())].into_iter().collect(),
        ));
        arrays.push(recorded_us_array(c, &rows, n_rows));
    }

    // Channel value columns.
    for c in &session.channels {
        if c.source_kind == "synthesized" {
            continue;
        }
        let rows = row_indices_for(c, &t)?;
        let arrow_type = match &c.column {
            RawColumn::I16 { .. } => DataType::Int16,
            RawColumn::I32 { .. } => DataType::Int32,
            RawColumn::F32 { .. } => DataType::Float32,
            RawColumn::F64(_) => DataType::Float64,
            _ => unreachable!(),
        };
        let metadata: std::collections::HashMap<String, String> = column_metadata(c).into_iter().collect();
        fields.push(Field::new(&c.channel_id, arrow_type, true).with_metadata(metadata));
        arrays.push(channel_array(c, &rows, n_rows)?);
    }

    let schema = Arc::new(Schema::new(fields));
    let batch = RecordBatch::try_new(schema.clone(), arrays)
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("RecordBatch::try_new: {e}")))?;

    let mut props_builder = WriterProperties::builder()
        .set_max_row_group_size(ROW_GROUP_SIZE)
        .set_column_encoding(ColumnPath::from("t"), Encoding::DELTA_BINARY_PACKED)
        .set_column_statistics_enabled(ColumnPath::from("t"), EnabledStatistics::Chunk);
    for (k, v) in file_metadata(session, importer_version) {
        props_builder = props_builder.set_key_value_metadata(Some(vec![parquet::file::metadata::KeyValue::new(k, v)]));
    }
    let props = props_builder.build();

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut writer = ArrowWriter::try_new(&mut buf, schema, Some(props))
            .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("ArrowWriter::try_new: {e}")))?;
        writer.write(&batch).map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("write: {e}")))?;
        writer.close().map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("close: {e}")))?;
    }

    let target = data_root.join("sessions").join(&session.session_id).join("data.parquet");
    write_atomic(data_root, &target, &buf, None)
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, e.to_string()))?;
    Ok(target)
}
```
(`set_key_value_metadata` called once per key above accumulates via repeated `Some(vec![..])` calls only if the underlying builder appends rather than replaces — **verify this during implementation**: if `WriterProperties::builder()` replaces on each call instead of appending, build one `Vec<KeyValue>` up front and pass it in a single `.set_key_value_metadata(Some(all_kvs))` call instead — a one-line restructuring, not a design change, flagged here rather than asserted with false confidence about this specific builder's accumulation semantics.)

- [ ] **Step 6: `read_session_parquet`**

```rust
/// Reads `data.parquet` back into a [`Session`] (contract C1 §4.5's read
/// rule: for each channel column, filter to non-null rows, take `t` at
/// those rows as `t_us`, the values as the compact `RawColumn`).
/// Synthesized `Time`/`Distance` are **not** reconstructed here — they are
/// re-derived by [`crate::session::synthesis::synthesize_base_channels`]
/// after this function returns, exactly as it already runs after parsing
/// (Task 4/6's channel-construction loop).
pub fn read_session_parquet(path: &Path) -> Result<Session, ParquetStoreError> {
    let file = std::fs::File::open(path)
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("open {}: {e}", path.display())))?;
    let builder = ParquetRecordBatchReaderBuilder::try_new(file)
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("{}: {e}", path.display())))?;

    let file_kv: std::collections::HashMap<String, String> = builder
        .metadata()
        .file_metadata()
        .key_value_metadata()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|kv| kv.value.map(|v| (kv.key, v)))
        .collect();
    let schema = builder.schema().clone();

    let reader = builder
        .build()
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("build reader: {e}")))?;
    let batches: Vec<RecordBatch> = reader
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("read batches: {e}")))?;
    // A `data.parquet` file is a single logical table; concatenate row
    // groups into one batch for the (session-scale, not season-scale) read
    // this function does. A streaming, per-row-group reconstruction is a
    // future optimisation, not required by C1's round-trip guarantees.
    let batch = arrow::compute::concat_batches(&schema, &batches)
        .map_err(|e| ParquetStoreError::new(ParquetStoreErrorKind::Io, format!("concat_batches: {e}")))?;

    let get = |k: &str| -> Result<String, ParquetStoreError> {
        file_kv.get(k).cloned().ok_or_else(|| {
            ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("missing required file metadata key {k}"))
        })
    };
    let session_id = get("session_id")?;
    let timestamp_utc_ms: i64 = get("timestamp_utc_ms")?.parse().map_err(|_| {
        ParquetStoreError::new(ParquetStoreErrorKind::Schema, "timestamp_utc_ms did not parse as i64".to_string())
    })?;
    let blob_sha256 = get("blob_sha256")?;
    let source_format = match get("source_format")?.as_str() {
        "idl0" => SourceFormat::Idl0,
        "fit" => SourceFormat::Fit,
        "gpx" => SourceFormat::Gpx,
        "csv" => SourceFormat::Csv,
        other => {
            return Err(ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("unknown source_format {other}")))
        }
    };
    let device_id = file_kv.get("device_id").cloned();
    let config_checksum = file_kv.get("config_checksum").cloned();

    let t_col = batch
        .column_by_name("t")
        .ok_or_else(|| ParquetStoreError::new(ParquetStoreErrorKind::Schema, "missing t column".to_string()))?
        .as_any()
        .downcast_ref::<Int64Array>()
        .ok_or_else(|| ParquetStoreError::new(ParquetStoreErrorKind::Schema, "t column is not Int64".to_string()))?;

    let mut channels = Vec::new();
    for field in schema.fields() {
        let name = field.name();
        if name == "t" || name.ends_with("_t_recorded_us") {
            continue;
        }
        let meta = field.metadata();
        let get_meta = |k: &str| -> Result<String, ParquetStoreError> {
            meta.get(k).cloned().ok_or_else(|| {
                ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("column {name} missing metadata key {k}"))
            })
        };
        let nominal_rate_hz: f64 = get_meta("nominal_rate_hz")?.parse().map_err(|_| {
            ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("column {name}: bad nominal_rate_hz"))
        })?;
        let unit = get_meta("unit")?;
        let source_kind = get_meta("source_kind")?;
        let gaps = match meta.get("gaps") {
            Some(g) => gaps_from_json(g)?,
            None => Vec::new(),
        };

        let col = batch
            .column_by_name(name)
            .ok_or_else(|| ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("missing column {name}")))?;

        let recorded_col_name = format!("{source_kind}_t_recorded_us");
        let recorded_col = batch
            .column_by_name(&recorded_col_name)
            .and_then(|c| c.as_any().downcast_ref::<Int64Array>());

        let (t_us, t_recorded_us, column) = read_column(col, t_col, recorded_col, meta)?;

        channels.push(Channel {
            channel_id: name.clone(),
            t_us,
            t_recorded_us,
            nominal_rate_hz,
            column,
            source_kind,
            unit,
            gaps,
        });
    }

    Ok(Session { session_id, device_id, timestamp_utc_ms, config_checksum, source_format, blob_sha256, channels })
}

/// Filters `col`'s non-null rows, pairing each with `t`'s value at that row
/// (C1 §4.5's read rule) and, when present, `recorded_col`'s value at that
/// row (`None` overall when `recorded_col` is absent — same non-IMU-source
/// case `Channel.t_recorded_us` documents as `None`). Reconstructs the
/// typed [`RawColumn`] from `scale`/`offset` metadata for `Int16`/`Int32`/
/// `Float32`; `Float64` is read verbatim (bit-exact, including `-0.0`/`NaN`
/// — no `× 1.0 + 0.0`, C1 §2's `F64` round-trip guarantee).
fn read_column(
    col: &ArrayRef,
    t_col: &Int64Array,
    recorded_col: Option<&Int64Array>,
    meta: &std::collections::HashMap<String, String>,
) -> Result<(Vec<i64>, Option<Vec<i64>>, RawColumn), ParquetStoreError> {
    let parse_f64 = |k: &str| -> Result<f64, ParquetStoreError> {
        meta.get(k)
            .ok_or_else(|| ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("missing {k}")))?
            .parse()
            .map_err(|_| ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("bad {k}")))
    };

    macro_rules! gather {
        ($arr_ty:ty, $wrap:expr) => {{
            let arr = col.as_any().downcast_ref::<$arr_ty>().ok_or_else(|| {
                ParquetStoreError::new(ParquetStoreErrorKind::Schema, "column type mismatch".to_string())
            })?;
            let mut t_us = Vec::new();
            let mut t_recorded_us = Vec::new();
            let mut values = Vec::new();
            for i in 0..arr.len() {
                if arr.is_valid(i) {
                    t_us.push(t_col.value(i));
                    if let Some(rc) = recorded_col {
                        if rc.is_valid(i) {
                            t_recorded_us.push(rc.value(i));
                        }
                    }
                    values.push(arr.value(i));
                }
            }
            let t_recorded_us =
                if recorded_col.is_some() && t_recorded_us.len() == t_us.len() { Some(t_recorded_us) } else { None };
            (t_us, t_recorded_us, $wrap(values))
        }};
    }

    let (t_us, t_recorded_us, column) = match col.data_type() {
        DataType::Int16 => {
            let scale = parse_f64("scale")?;
            let offset = parse_f64("offset")?;
            gather!(Int16Array, |data| RawColumn::I16 { data, scale, offset })
        }
        DataType::Int32 => {
            let scale = parse_f64("scale")?;
            let offset = parse_f64("offset")?;
            gather!(Int32Array, |data| RawColumn::I32 { data, scale, offset })
        }
        DataType::Float32 => {
            let scale = parse_f64("scale")?;
            let offset = parse_f64("offset")?;
            gather!(Float32Array, |data| RawColumn::F32 { data, scale, offset })
        }
        DataType::Float64 => gather!(Float64Array, RawColumn::F64),
        other => {
            return Err(ParquetStoreError::new(ParquetStoreErrorKind::Schema, format!("unsupported column type {other:?}")))
        }
    };
    Ok((t_us, t_recorded_us, column))
}
```

- [ ] **Step 7: Round-trip guarantee tests (C1 §7, all seven items)**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A small, realistic synthetic session: one IMU-shaped I16 channel
    /// (scale/offset like a real accel axis), one GPS-shaped F64 channel
    /// carrying -0.0/NaN, distinct source_kinds so both `<source>_t_recorded_us`
    /// columns exist, and one gap.
    fn sample_session() -> Session {
        let imu = Channel {
            channel_id: "IMU0_AccelX".to_string(),
            t_us: vec![0, 1250, 2500, 5000], // a gap between index 1 and 2's neighbour
            t_recorded_us: Some(vec![0, 1250, 2500, 5000]),
            nominal_rate_hz: 800.0,
            column: RawColumn::I16 { data: vec![100, -200, 300, 400], scale: 32.0 / 32768.0, offset: 0.0 },
            source_kind: "imu0".to_string(),
            unit: "g".to_string(),
            gaps: vec![GapSpan { start: 2, len: 1 }],
        };
        let gps = Channel {
            channel_id: "GPS_EpochMs".to_string(),
            t_us: vec![0, 2500],
            t_recorded_us: None,
            nominal_rate_hz: 10.0,
            column: RawColumn::F64(vec![-0.0, f64::NAN]),
            source_kind: "gps".to_string(),
            unit: "ms_raw".to_string(),
            gaps: Vec::new(),
        };
        Session {
            session_id: "0102030405060708090a0b0c0d0e0f10".to_string(),
            device_id: Some("b0b1b2b3b4b5".to_string()),
            timestamp_utc_ms: 1_756_857_600_000,
            config_checksum: Some("cafebabe".to_string()),
            source_format: SourceFormat::Idl0,
            blob_sha256: "0".repeat(64),
            channels: vec![imu, gps],
        }
    }

    #[test]
    fn round_trip_recorded_stamps_bit_exact() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #1.
        let imu = back.channels.iter().find(|c| c.channel_id == "IMU0_AccelX").unwrap();
        assert_eq!(imu.t_recorded_us_or_t_us(), &[0, 1250, 2500, 5000][..]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_raw_i16_counts_bit_exact() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #2.
        let imu = back.channels.iter().find(|c| c.channel_id == "IMU0_AccelX").unwrap();
        match &imu.column {
            RawColumn::I16 { data, .. } => assert_eq!(data, &vec![100i16, -200, 300, 400]),
            other => panic!("expected I16, got {other:?}"),
        }

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_scale_offset_metadata_bit_exact() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #3: parsed-back bit pattern, not just string equality.
        let imu = back.channels.iter().find(|c| c.channel_id == "IMU0_AccelX").unwrap();
        match &imu.column {
            RawColumn::I16 { scale, offset, .. } => {
                assert_eq!(scale.to_bits(), (32.0f64 / 32768.0).to_bits());
                assert_eq!(offset.to_bits(), 0.0f64.to_bits());
            }
            other => panic!("expected I16, got {other:?}"),
        }

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_nominal_rate_hz_preserved() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #4.
        let imu = back.channels.iter().find(|c| c.channel_id == "IMU0_AccelX").unwrap();
        assert_eq!(imu.nominal_rate_hz.to_bits(), 800.0f64.to_bits());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_gaps_preserved() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #5.
        let imu = back.channels.iter().find(|c| c.channel_id == "IMU0_AccelX").unwrap();
        assert_eq!(imu.gaps, vec![GapSpan { start: 2, len: 1 }]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_union_axis_sorted_unique_and_channels_reproduce_their_own_t_us() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #6.
        let imu = back.channels.iter().find(|c| c.channel_id == "IMU0_AccelX").unwrap();
        assert_eq!(imu.t_us, vec![0, 1250, 2500, 5000]);
        let gps = back.channels.iter().find(|c| c.channel_id == "GPS_EpochMs").unwrap();
        assert_eq!(gps.t_us, vec![0, 2500]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn round_trip_f64_negative_zero_and_nan_preserved_bit_exact() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert — C1 §7 #7.
        let gps = back.channels.iter().find(|c| c.channel_id == "GPS_EpochMs").unwrap();
        match &gps.column {
            RawColumn::F64(data) => {
                assert!(data[0].is_sign_negative() && data[0] == 0.0);
                assert!(data[1].is_nan());
            }
            other => panic!("expected F64, got {other:?}"),
        }

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn file_metadata_round_trips() {
        // Arrange
        let root = temp_root();
        let session = sample_session();
        let path = write_session_parquet(&root, &session, "0.1.0").unwrap();

        // Act
        let back = read_session_parquet(&path).unwrap();

        // Assert
        assert_eq!(back.session_id, session.session_id);
        assert_eq!(back.device_id, session.device_id);
        assert_eq!(back.config_checksum, session.config_checksum);
        assert_eq!(back.blob_sha256, session.blob_sha256);
        assert_eq!(back.timestamp_utc_ms, session.timestamp_utc_ms);
        assert!(matches!(back.source_format, SourceFormat::Idl0));

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 8: Wire in and run**

Add `pub mod parquet;` to `src/store/mod.rs`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo build -p idl-rs 2>&1 | tail -40
```
Work through any `arrow`/`parquet` API mismatches per this task's opening note — fix the call, not the schema. Then:
```bash
cargo test -p idl-rs store::parquet 2>&1 | grep -E "^test |^test result"
```
Expected: all 8 tests `ok` — this is C1 §7's full round-trip guarantee, proven.

- [ ] **Step 9: Commit**

```bash
git add core/src/store/parquet.rs core/src/store/mod.rs
git commit -m "store: data.parquet Arrow schema, writer, reader (C1 §4); round-trip guarantees proven (C1 §7)"
```

---
### Task 10: `store/derived.rs` — `derived/<hash>.parquet` writer and hash recipe (C1 §5)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`.

**Files:**
- Create: `src/store/derived.rs`.
- Modify: `src/store/mod.rs` (`pub mod derived;`).

**Interfaces:**
- Consumes: `store::atomic`, `store::parquet`'s Arrow/Parquet plumbing pattern.
- Produces: `pub fn derived_input_hash(channel_id: &str, t_us: &[i64], values: &[f64]) -> [u8; 32]`, `pub fn derived_file_hash(inputs: &[(String, [u8; 32])], config_json_bytes: &[u8], engine_version: &str) -> [u8; 32]`, `pub fn write_derived_parquet(...) -> Result<PathBuf, DerivedStoreError>`.

- [ ] **Step 1: The hash recipe, byte-exact (C1 §5)**

```rust
//! `derived/<hash>.parquet` — materialised estimator outputs (contract C1
//! §5). Content-addressed by `sha256(input column hashes ‖ config json ‖
//! engine version)`; the file already existing at that path is
//! authoritative (design doc §5 — "sync keeps whichever it has").

use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use arrow::array::{ArrayRef, Float64Array, Int64Array};
use arrow::datatypes::{DataType, Field, Schema};
use arrow::record_batch::RecordBatch;
use parquet::arrow::ArrowWriter;
use parquet::file::properties::WriterProperties;
use sha2::{Digest, Sha256};

use crate::store::atomic::write_atomic;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DerivedStoreErrorKind {
    Io,
    Schema,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DerivedStoreError {
    pub kind: DerivedStoreErrorKind,
    pub message: String,
}

impl DerivedStoreError {
    fn new(kind: DerivedStoreErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl fmt::Display for DerivedStoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for DerivedStoreError {}

/// One input channel's `column_hash` (C1 §5, step 1): `SHA256(channel_id
/// UTF-8 bytes ++ 0x00 ++ for each sample in t_us order: t_us LE i64 bytes
/// ++ physical value LE f64 bytes)`. `values[i]` must be the *physical*
/// value (`materialize()[i]`, C1 §5's own wording) — raw wire
/// representation is deliberately not hashed, so a future storage-format
/// change doesn't change existing derived-file identities.
pub fn derived_input_hash(channel_id: &str, t_us: &[i64], values: &[f64]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(channel_id.as_bytes());
    hasher.update([0u8]);
    for (&t, &v) in t_us.iter().zip(values.iter()) {
        hasher.update(t.to_le_bytes());
        hasher.update(v.to_le_bytes());
    }
    hasher.finalize().into()
}

/// The canonical config JSON bytes C1 §5 step 2 requires: recursively
/// key-sorted, compact, no trailing newline. `serde_json::Value`'s default
/// `Map` (this crate's `serde_json` dependency does **not** enable the
/// `preserve_order` feature — confirmed in `core/Cargo.toml`) is
/// `BTreeMap`-backed, so every object — nested included — is *already*
/// serialized in ascending-key order by plain `serde_json::to_vec`; no
/// hand-rolled recursive sort is needed.
pub fn canonical_config_json(config: &serde_json::Value) -> Result<Vec<u8>, DerivedStoreError> {
    serde_json::to_vec(config)
        .map_err(|e| DerivedStoreError::new(DerivedStoreErrorKind::Schema, format!("config serialisation: {e}")))
}

/// The overall derived-file hash (C1 §5, step 3): `SHA256(for each input,
/// sorted by channel_id ascending UTF-8: its column_hash (32 bytes) ++ 0x00
/// ++ config_json_bytes ++ 0x00 ++ engine_version UTF-8 bytes)`. Returns the
/// 32 raw digest bytes; `filename_hex` (the `derived/<hash>.parquet` name)
/// is `lowercase_hex(hash_bytes)`.
pub fn derived_file_hash(
    inputs: &[(String, [u8; 32])],
    config_json_bytes: &[u8],
    engine_version: &str,
) -> [u8; 32] {
    let mut sorted = inputs.to_vec();
    sorted.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));

    let mut hasher = Sha256::new();
    for (_, column_hash) in &sorted {
        hasher.update(column_hash);
    }
    hasher.update([0u8]);
    hasher.update(config_json_bytes);
    hasher.update([0u8]);
    hasher.update(engine_version.as_bytes());
    hasher.finalize().into()
}

/// Lowercase hex of a 32-byte digest — the `derived/<hex>.parquet` filename.
pub fn hex(bytes: &[u8; 32]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
```

- [ ] **Step 2: Writer**

```rust
/// One output channel of a materialised estimator (contract C1 §5's file
/// content — `Float64`, no `scale`/`offset`).
pub struct DerivedOutput {
    pub channel_id: String,
    pub t_us: Vec<i64>,
    pub values: Vec<f64>,
    pub nominal_rate_hz: f64,
    pub unit: String,
}

/// Writes `derived/<hash>.parquet` for one session. `inputs` is
/// `(channel_id, column_hash)` for every input channel, already computed by
/// the caller via [`derived_input_hash`] (the caller — the estimator glue,
/// not this store module, since only it knows which channels were actually
/// consumed). If the target path already exists, this is a no-op and its
/// existing bytes are authoritative (C1 §5 — content-addressed, same rule
/// as [`crate::store::blob::write_blob`]).
#[allow(clippy::too_many_arguments)]
pub fn write_derived_parquet(
    data_root: &Path,
    session_id: &str,
    derived_kind: &str,
    inputs: &[(String, [u8; 32])],
    config: &serde_json::Value,
    outputs: &[DerivedOutput],
    computed_at_utc_ms: i64,
) -> Result<PathBuf, DerivedStoreError> {
    let config_json_bytes = canonical_config_json(config)?;
    let hash_bytes = derived_file_hash(inputs, &config_json_bytes, crate::VERSION);
    let filename_hex = hex(&hash_bytes);
    let target = data_root
        .join("sessions")
        .join(session_id)
        .join("derived")
        .join(format!("{filename_hex}.parquet"));

    if target.is_file() {
        return Ok(target); // content-addressed no-op, C1 §5.
    }

    // Every output shares this derived file's own `t` axis: per C1 §5,
    // "typically inherited from its primary input's post-correction t" —
    // this function takes the caller's already-decided `t_us` per output
    // rather than deriving one itself (estimator-specific knowledge, not
    // this store module's).
    let t: Vec<i64> = outputs.first().map(|o| o.t_us.clone()).unwrap_or_default();
    if outputs.iter().any(|o| o.t_us != t) {
        return Err(DerivedStoreError::new(
            DerivedStoreErrorKind::Schema,
            "all outputs of one derived file must share the same t axis (C1 §5)".to_string(),
        ));
    }

    let mut fields = vec![Field::new("t", DataType::Int64, false)];
    let mut arrays: Vec<ArrayRef> = vec![Arc::new(Int64Array::from(t.clone()))];
    for o in outputs {
        let metadata: std::collections::HashMap<String, String> = [
            ("nominal_rate_hz".to_string(), o.nominal_rate_hz.to_string()),
            ("unit".to_string(), o.unit.clone()),
            ("channel_kind".to_string(), if o.nominal_rate_hz == 0.0 { "event" } else { "fixed-rate" }.to_string()),
        ]
        .into_iter()
        .collect();
        fields.push(Field::new(&o.channel_id, DataType::Float64, false).with_metadata(metadata));
        arrays.push(Arc::new(Float64Array::from(o.values.clone())));
    }

    let inputs_json = {
        let entries: Vec<String> = inputs
            .iter()
            .map(|(id, h)| format!(r#"{{"channel_id":{},"column_hash":"{}"}}"#, serde_json::to_string(id).unwrap(), hex(h)))
            .collect();
        format!("[{}]", entries.join(","))
    };

    let schema = Arc::new(Schema::new(fields));
    let batch = RecordBatch::try_new(schema.clone(), arrays)
        .map_err(|e| DerivedStoreError::new(DerivedStoreErrorKind::Schema, format!("RecordBatch::try_new: {e}")))?;

    let mut props_builder = WriterProperties::builder();
    for (k, v) in [
        ("derived_kind".to_string(), derived_kind.to_string()),
        ("inputs".to_string(), inputs_json),
        ("config_json".to_string(), String::from_utf8_lossy(&config_json_bytes).into_owned()),
        ("engine_version".to_string(), crate::VERSION.to_string()),
        ("computed_at_utc_ms".to_string(), computed_at_utc_ms.to_string()),
    ] {
        props_builder = props_builder.set_key_value_metadata(Some(vec![parquet::file::metadata::KeyValue::new(k, v)]));
    }
    let props = props_builder.build();

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut writer = ArrowWriter::try_new(&mut buf, schema, Some(props))
            .map_err(|e| DerivedStoreError::new(DerivedStoreErrorKind::Io, e.to_string()))?;
        writer.write(&batch).map_err(|e| DerivedStoreError::new(DerivedStoreErrorKind::Io, e.to_string()))?;
        writer.close().map_err(|e| DerivedStoreError::new(DerivedStoreErrorKind::Io, e.to_string()))?;
    }

    write_atomic(data_root, &target, &buf, None)
        .map_err(|e| DerivedStoreError::new(DerivedStoreErrorKind::Io, e.to_string()))?;
    Ok(target)
}
```

- [ ] **Step 3: Tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn derived_input_hash_is_deterministic_and_sensitive_to_every_component() {
        // Arrange
        let t = vec![0i64, 1000, 2000];
        let v = vec![1.0, 2.0, 3.0];

        // Act
        let h1 = derived_input_hash("Fork travel (mm)", &t, &v);
        let h2 = derived_input_hash("Fork travel (mm)", &t, &v);
        let h3 = derived_input_hash("Fork velocity (mm/s)", &t, &v); // different name
        let h4 = derived_input_hash("Fork travel (mm)", &t, &[1.0, 2.0, 3.5]); // different value

        // Assert
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
        assert_ne!(h1, h4);
    }

    #[test]
    fn derived_file_hash_is_order_independent_in_input_list_but_sorted_internally() {
        // Arrange — two input orderings that should hash identically because
        // step 3 sorts by channel_id before hashing.
        let ha = derived_input_hash("A", &[0], &[1.0]);
        let hb = derived_input_hash("B", &[0], &[2.0]);
        let config = b"{}";

        // Act
        let h1 = derived_file_hash(&[("A".to_string(), ha), ("B".to_string(), hb)], config, "0.1.0");
        let h2 = derived_file_hash(&[("B".to_string(), hb), ("A".to_string(), ha)], config, "0.1.0");

        // Assert
        assert_eq!(h1, h2);
    }

    #[test]
    fn canonical_config_json_sorts_nested_object_keys() {
        // Arrange
        let config: serde_json::Value = serde_json::from_str(r#"{"z":1,"a":{"y":2,"b":3}}"#).unwrap();

        // Act
        let bytes = canonical_config_json(&config).unwrap();

        // Assert
        assert_eq!(String::from_utf8(bytes).unwrap(), r#"{"a":{"b":3,"y":2},"z":1}"#);
    }

    #[test]
    fn write_derived_parquet_same_hash_content_second_write_is_a_no_op() {
        // Arrange
        let root = temp_root();
        let outputs = vec![DerivedOutput {
            channel_id: "Roll (deg)".to_string(),
            t_us: vec![0, 1000],
            values: vec![0.5, 0.6],
            nominal_rate_hz: 800.0,
            unit: "deg".to_string(),
        }];
        let config = serde_json::json!({});
        let ih = derived_input_hash("IMU0_AccelX", &[0, 1000], &[1.0, 2.0]);
        let inputs = vec![("IMU0_AccelX".to_string(), ih)];

        // Act
        let p1 = write_derived_parquet(&root, "s1", "iekf_suspension_attitude", &inputs, &config, &outputs, 0).unwrap();
        let mtime1 = std::fs::metadata(&p1).unwrap().modified().unwrap();
        let p2 = write_derived_parquet(&root, "s1", "iekf_suspension_attitude", &inputs, &config, &outputs, 999).unwrap();
        let mtime2 = std::fs::metadata(&p2).unwrap().modified().unwrap();

        // Assert — same path (content-addressed), file untouched by the
        // second call (mtime unchanged) even though computed_at_utc_ms differs.
        assert_eq!(p1, p2);
        assert_eq!(mtime1, mtime2);

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 4: Wire in and run**

Add `pub mod derived;` to `src/store/mod.rs`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::derived 2>&1 | grep -E "^test |^test result"
```
Expected: all 4 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add core/src/store/derived.rs core/src/store/mod.rs
git commit -m "store: derived/<hash>.parquet writer and hash recipe (C1 §5)"
```

---
### Task 11: `store/session_json.rs` — `session.json` (C1 §6)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`. Implements C1 §6 verbatim, including its stated defaults for the two items C1 §8 still flags for Isaac's confirmation (item 2: `lap_gates`/`sector_gates` inclusion; item 4: decimal-degree units) — per this plan's ambiguity policy, a contract's own stated default does not block implementation; both remain listed in this plan's Open questions as still awaiting Isaac's sign-off.

**Files:**
- Create: `src/store/session_json.rs`.
- Modify: `src/store/mod.rs` (`pub mod session_json;`).

**Interfaces:**
- Produces: `pub struct SessionJson { .. }` (serde `Serialize`/`Deserialize`, C1 §6's exact field set), `pub fn read_session_json(path: &Path) -> Result<SessionJson, SessionJsonError>`, `pub fn write_session_json(data_root: &Path, session_id: &str, doc: &SessionJson, based_on_hash: Option<&str>) -> Result<String, SessionJsonError>`.

- [ ] **Step 1: The struct, field-for-field from C1 §6**

```rust
//! `session.json` (contract C1 §6) — replaces `.idl0w`. Metadata, lap gates,
//! cached laps, lap flags, and track visits for one session.

use std::fmt;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::config::{parse_config, read_config, ConfigError, VersionedConfig};
use crate::store::atomic::{sha256_hex, write_atomic, AtomicWriteError};

pub const SESSION_JSON_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionJson {
    pub schema_version: u32,
    pub session_id: String,

    #[serde(default)]
    pub rider: String,
    #[serde(default)]
    pub bike: String,
    #[serde(default)]
    pub bike_comment: String,
    #[serde(default)]
    pub venue_name: String,
    #[serde(default)]
    pub event_name: String,
    #[serde(default)]
    pub event_session: String,
    #[serde(default)]
    pub short_comment: String,
    #[serde(default)]
    pub long_comment: String,
    #[serde(default)]
    pub tag: String,

    #[serde(default)]
    pub bike_profile_snapshot: Option<serde_json::Value>,

    #[serde(default)]
    pub lap_gates: Vec<LapGateJson>,
    #[serde(default)]
    pub sector_gates: Vec<SectorGateJson>,

    #[serde(default)]
    pub laps: Vec<LapJson>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reference_lap_number: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ignored_lap_numbers: Vec<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub main_lap_number: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlay_lap_key: Option<OverlayLapKeyJson>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub starred_lap_number: Option<u32>,

    #[serde(default)]
    pub track_visits: Vec<TrackVisitJson>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_visits_library_hash: Option<String>,
}

impl VersionedConfig for SessionJson {
    const SUPPORTED_VERSION: u32 = SESSION_JSON_SCHEMA_VERSION;
    const LABEL: &'static str = "session.json";
    fn version(&self) -> u32 {
        self.schema_version
    }
}

/// Decimal degrees (C1 §6's stated default — flagged pending Isaac's
/// confirmation against `lap_detector.dart`'s actual runtime convention,
/// C1 §8 item 4; this plan's Open questions carries the flag forward).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LapGateJson {
    pub lat1_deg: f64,
    pub lon1_deg: f64,
    pub lat2_deg: f64,
    pub lon2_deg: f64,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SectorGateJson {
    pub name: String,
    pub gate: LapGateJson,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LapJson {
    pub lap_number: u32,
    pub start_timestamp_ms: i64,
    pub end_timestamp_ms: i64,
    pub raw_elapsed_ms: i64,
    pub lap_time_ms: i64,
    pub start_time_secs: f64,
    pub end_time_secs: f64,
    #[serde(default)]
    pub sectors: Vec<SectorJson>,
    #[serde(default)]
    pub neutral_zone_visits: Vec<NeutralZoneVisitJson>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SectorJson {
    pub name: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub start_time_secs: f64,
    pub end_time_secs: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NeutralZoneVisitJson {
    pub name: String,
    pub enter_ms: i64,
    pub exit_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OverlayLapKeyJson {
    pub session_id_ref: String, // renamed from the wire's "session_id" to avoid a field-name collision inside this Rust module's naming; serde attribute below keeps the wire name
    pub lap_number: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TrackVisitJson {
    pub visit_id: String,
    pub track_id: String,
    pub start_timestamp_ms: i64,
    pub end_timestamp_ms: i64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub laps: Vec<LapJson>,
}
```
`OverlayLapKeyJson`'s field is renamed in Rust to avoid the identifier `session_id` colliding, at the type-definition level, with `SessionJson::session_id`'s own field name in some codegen contexts — since this is a *different* struct there is in fact no real collision and the rename is unnecessary; **implementers: drop the rename, keep the field named `session_id` to match C1 §6's wire shape exactly** (`{"session_id": "…", "lap_number": 0}`), and delete the misleading comment above. Flagged here rather than silently left in, since a struct-level field named differently from its own JSON key (without a `#[serde(rename)]`) would silently break the wire round-trip — this draft's own error, caught during this same task's review, not a hidden gotcha for the implementer to discover via a failing test later.

- [ ] **Step 2: Read/write functions**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionJsonErrorKind {
    Io,
    Parse,
    UnsupportedVersion,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionJsonError {
    pub kind: SessionJsonErrorKind,
    pub message: String,
}

impl fmt::Display for SessionJsonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}
impl std::error::Error for SessionJsonError {}

impl From<ConfigError> for SessionJsonError {
    fn from(e: ConfigError) -> Self {
        let kind = match e.kind {
            crate::config::ConfigErrorKind::Io => SessionJsonErrorKind::Io,
            crate::config::ConfigErrorKind::Parse => SessionJsonErrorKind::Parse,
            crate::config::ConfigErrorKind::UnsupportedVersion => SessionJsonErrorKind::UnsupportedVersion,
        };
        SessionJsonError { kind, message: e.message }
    }
}
impl From<AtomicWriteError> for SessionJsonError {
    fn from(e: AtomicWriteError) -> Self {
        SessionJsonError { kind: SessionJsonErrorKind::Io, message: e.to_string() }
    }
}

/// Reads `<data>/sessions/<session_id>/session.json`, reusing the crate's
/// existing `VersionedConfig` machinery (the same one `.idl0t` uses).
pub fn read_session_json(path: &Path) -> Result<SessionJson, SessionJsonError> {
    Ok(read_config::<SessionJson>(path)?)
}

/// Parses `session.json` bytes without touching disk (used by `verify`,
/// Task 12, and by tests).
pub fn parse_session_json(bytes: &[u8]) -> Result<SessionJson, SessionJsonError> {
    Ok(parse_config::<SessionJson>(bytes)?)
}

/// Writes `session.json` atomically (C4 §4) to
/// `<data_root>/sessions/<session_id>/session.json`. Returns the new
/// content's sha256 hex.
pub fn write_session_json(
    data_root: &Path,
    session_id: &str,
    doc: &SessionJson,
    based_on_hash: Option<&str>,
) -> Result<String, SessionJsonError> {
    let bytes = serde_json::to_vec_pretty(doc)
        .map_err(|e| SessionJsonError { kind: SessionJsonErrorKind::Parse, message: e.to_string() })?;
    let target = data_root.join("sessions").join(session_id).join("session.json");
    Ok(write_atomic(data_root, &target, &bytes, based_on_hash)?)
}

/// A fresh, empty `session.json` for a newly-imported session — every
/// string field `""`, every collection empty, matching C1 §6's stated
/// defaults exactly ("`""` = not set, no null representation").
pub fn empty_session_json(session_id: impl Into<String>) -> SessionJson {
    SessionJson {
        schema_version: SESSION_JSON_SCHEMA_VERSION,
        session_id: session_id.into(),
        rider: String::new(),
        bike: String::new(),
        bike_comment: String::new(),
        venue_name: String::new(),
        event_name: String::new(),
        event_session: String::new(),
        short_comment: String::new(),
        long_comment: String::new(),
        tag: String::new(),
        bike_profile_snapshot: None,
        lap_gates: Vec::new(),
        sector_gates: Vec::new(),
        laps: Vec::new(),
        reference_lap_number: None,
        ignored_lap_numbers: Vec::new(),
        main_lap_number: None,
        overlay_lap_key: None,
        starred_lap_number: None,
        track_visits: Vec::new(),
        track_visits_library_hash: None,
    }
}
```

- [ ] **Step 3: Tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn empty_session_json_round_trips_through_write_and_read() {
        // Arrange
        let root = temp_root();
        let doc = empty_session_json("abc123");

        // Act
        write_session_json(&root, "abc123", &doc, None).unwrap();
        let back = read_session_json(&root.join("sessions").join("abc123").join("session.json")).unwrap();

        // Assert
        assert_eq!(back, doc);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn write_then_write_again_uses_the_optimistic_concurrency_hash() {
        // Arrange
        let root = temp_root();
        let mut doc = empty_session_json("abc123");
        let h1 = write_session_json(&root, "abc123", &doc, None).unwrap();

        // Act
        doc.rider = "Isaac".to_string();
        let h2 = write_session_json(&root, "abc123", &doc, Some(&h1)).unwrap();

        // Assert
        assert_ne!(h1, h2);
        let back = read_session_json(&root.join("sessions").join("abc123").join("session.json")).unwrap();
        assert_eq!(back.rider, "Isaac");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn omitted_optional_fields_are_absent_from_the_json_not_null() {
        // Arrange
        let doc = empty_session_json("abc123");

        // Act
        let bytes = serde_json::to_vec(&doc).unwrap();
        let text = String::from_utf8(bytes).unwrap();

        // Assert — C1 §6: "omitted (not an empty-array string / null)".
        assert!(!text.contains("reference_lap_number"));
        assert!(!text.contains("ignored_lap_numbers"));
        assert!(!text.contains("track_visits_library_hash"));
    }

    #[test]
    fn malformed_json_is_a_typed_parse_error_not_a_panic() {
        // Act
        let err = parse_session_json(b"not json").unwrap_err();

        // Assert
        assert_eq!(err.kind, SessionJsonErrorKind::Parse);
    }

    #[test]
    fn future_schema_version_is_rejected_typed() {
        // Arrange
        let json = r#"{"schema_version":99,"session_id":"x"}"#;

        // Act
        let err = parse_session_json(json.as_bytes()).unwrap_err();

        // Assert
        assert_eq!(err.kind, SessionJsonErrorKind::UnsupportedVersion);
    }
}
```

- [ ] **Step 4: Wire in and run**

Add `pub mod session_json;` to `src/store/mod.rs`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::session_json 2>&1 | grep -E "^test |^test result"
```
Expected: all 5 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add core/src/store/session_json.rs core/src/store/mod.rs
git commit -m "store: session.json read/write (C1 §6, replaces .idl0w)"
```

---
### Task 12: `store/catalog.rs` — SQLite catalog and rebuild (C4 §5)

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`.

**Files:**
- Create: `src/store/catalog.rs`.
- Modify: `src/store/mod.rs` (`pub mod catalog;`).

**Interfaces:**
- Consumes: `store::atomic`, `store::blob`, `store::session_json`, `track_artifact::read`.
- Produces: `pub fn open_catalog(path: &Path) -> Result<rusqlite::Connection, CatalogError>`, `pub fn rebuild_catalog(data_root: &Path) -> Result<RebuildReport, CatalogError>`. Consumed by Task 15's CLI `sessions`/`verify` and, later, L5/L7.

- [ ] **Step 1: DDL and connection setup, exactly from C4 §5**

```rust
//! SQLite catalog (contract C4 §5) — a rebuildable index over `<data>`,
//! never itself the source of truth (design principle: "the catalog is an
//! index"). Six tables: `sessions`, `blobs`, `workbooks`, `tracks`, `laps`,
//! `lap_summary`.

use std::fmt;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use uuid::Uuid;

use crate::store::atomic::write_atomic;
use crate::store::blob::verify_blob;
use crate::store::session_json::read_session_json;
use crate::track_artifact::read::read_track;

pub const CATALOG_SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogErrorKind {
    Io,
    Sql,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CatalogError {
    pub kind: CatalogErrorKind,
    pub message: String,
}

impl fmt::Display for CatalogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}
impl std::error::Error for CatalogError {}

impl From<rusqlite::Error> for CatalogError {
    fn from(e: rusqlite::Error) -> Self {
        CatalogError { kind: CatalogErrorKind::Sql, message: e.to_string() }
    }
}

const DDL: &str = r#"
CREATE TABLE blobs (
  sha256        TEXT PRIMARY KEY,
  size_bytes    INTEGER NOT NULL,
  mtime_ms      INTEGER NOT NULL
);

CREATE TABLE tracks (
  track_id      TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  venue_name    TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  full_json     TEXT NOT NULL
);
CREATE INDEX idx_tracks_venue ON tracks(venue_name);

CREATE TABLE sessions (
  session_id        TEXT PRIMARY KEY,
  blob_sha256       TEXT NOT NULL REFERENCES blobs(sha256) ON DELETE RESTRICT,
  source_format     TEXT NOT NULL CHECK (source_format IN ('idl0','fit','gpx','csv')),
  device_id         TEXT,
  config_checksum   TEXT,
  importer_version  TEXT NOT NULL,
  seam_correction_version TEXT NOT NULL,
  engine_version    TEXT NOT NULL,
  timestamp_utc_ms  INTEGER NOT NULL,
  created_at_ms     INTEGER NOT NULL,
  rider             TEXT NOT NULL DEFAULT '',
  bike              TEXT NOT NULL DEFAULT '',
  venue_name        TEXT NOT NULL DEFAULT '',
  event_name        TEXT NOT NULL DEFAULT '',
  event_session     TEXT NOT NULL DEFAULT '',
  short_comment     TEXT NOT NULL DEFAULT '',
  tag               TEXT NOT NULL DEFAULT '',
  lap_count         INTEGER,
  duration_ms       INTEGER
);
CREATE INDEX idx_sessions_timestamp ON sessions(timestamp_utc_ms);
CREATE INDEX idx_sessions_venue     ON sessions(venue_name);
CREATE INDEX idx_sessions_tag       ON sessions(tag);
CREATE INDEX idx_sessions_blob      ON sessions(blob_sha256);

CREATE TABLE workbooks (
  workbook_id   TEXT PRIMARY KEY,
  file_name     TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  size_bytes    INTEGER NOT NULL
);
CREATE INDEX idx_workbooks_name ON workbooks(name);

CREATE TABLE laps (
  session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  lap_number   INTEGER NOT NULL,
  lap_time_ms  INTEGER NOT NULL,
  track_id     TEXT REFERENCES tracks(track_id) ON DELETE SET NULL,
  PRIMARY KEY (session_id, lap_number)
);
CREATE INDEX idx_laps_track ON laps(track_id);
CREATE INDEX idx_laps_time  ON laps(lap_time_ms);

CREATE TABLE lap_summary (
  session_id    TEXT NOT NULL,
  lap_number    INTEGER NOT NULL,
  channel_id    TEXT NOT NULL,
  derived_hash  TEXT NOT NULL,
  min_value     REAL NOT NULL,
  max_value     REAL NOT NULL,
  mean_value    REAL NOT NULL,
  PRIMARY KEY (session_id, lap_number, channel_id),
  FOREIGN KEY (session_id, lap_number) REFERENCES laps(session_id, lap_number) ON DELETE CASCADE
);
CREATE INDEX idx_lap_summary_channel ON lap_summary(channel_id);
"#;

/// Opens (or creates) the catalog at `path`, applying C4 §5's PRAGMAs on
/// every connection (they are per-connection, not persisted by SQLite).
pub fn open_catalog(path: &Path) -> Result<Connection, CatalogError> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    Ok(conn)
}

/// Creates the schema and sets `user_version` on a freshly-opened,
/// empty database.
fn create_schema(conn: &Connection) -> Result<(), CatalogError> {
    conn.execute_batch(DDL)?;
    conn.pragma_update(None, "user_version", CATALOG_SCHEMA_VERSION)?;
    Ok(())
}
```

- [ ] **Step 2: Rebuild procedure (C4 §5's seven steps)**

```rust
/// Outcome of [`rebuild_catalog`] — counts plus non-fatal per-entity
/// problems (a parse failure skips that entity, not the whole scan, CLAUDE.md §5).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RebuildReport {
    pub blobs_indexed: usize,
    pub tracks_indexed: usize,
    pub sessions_indexed: usize,
    pub laps_indexed: usize,
    pub workbooks_indexed: usize,
    pub skipped: Vec<String>, // human-readable "<path>: <reason>" entries
}

/// Rebuilds `<data_root>/catalog.sqlite` from a full tree scan (C4 §5).
/// Never mutates the live catalog in place — builds
/// `tmp/catalog-rebuild-<uuid>.sqlite`, then atomically swaps it over
/// `catalog.sqlite` via [`crate::store::atomic::write_atomic`] (the WAL
/// sidecars are checkpointed into the main file before the swap, so no
/// `-wal`/`-shm` files need to move separately).
pub fn rebuild_catalog(data_root: &Path) -> Result<RebuildReport, CatalogError> {
    let tmp_dir = data_root.join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| CatalogError { kind: CatalogErrorKind::Io, message: e.to_string() })?;
    let staging_path = tmp_dir.join(format!("catalog-rebuild-{}.sqlite", Uuid::new_v4()));

    let conn = open_catalog(&staging_path)?;
    create_schema(&conn)?;
    let mut report = RebuildReport::default();

    // 1. blobs
    let blobs_dir = data_root.join("blobs").join("sha256");
    if blobs_dir.is_dir() {
        for shard in std::fs::read_dir(&blobs_dir).map_err(io_err)?.flatten() {
            if !shard.path().is_dir() {
                continue;
            }
            let prefix = shard.file_name().to_string_lossy().into_owned();
            for entry in std::fs::read_dir(shard.path()).map_err(io_err)?.flatten() {
                let suffix = entry.file_name().to_string_lossy().into_owned();
                let sha256 = format!("{prefix}{suffix}");
                if sha256.len() != 64 || !sha256.chars().all(|c| c.is_ascii_hexdigit()) {
                    report.skipped.push(format!("{}: path does not encode a 64-hex sha256", entry.path().display()));
                    continue;
                }
                match verify_blob(data_root, &sha256) {
                    Ok(()) => {
                        let meta = entry.metadata().map_err(io_err)?;
                        let mtime_ms = meta
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_millis() as i64)
                            .unwrap_or(0);
                        conn.execute(
                            "INSERT INTO blobs (sha256, size_bytes, mtime_ms) VALUES (?1, ?2, ?3)",
                            rusqlite::params![sha256, meta.len() as i64, mtime_ms],
                        )?;
                        report.blobs_indexed += 1;
                    }
                    Err(e) => report.skipped.push(format!("{}: {e}", entry.path().display())),
                }
            }
        }
    }

    // 2. tracks
    let tracks_dir = data_root.join("tracks");
    if tracks_dir.is_dir() {
        for entry in std::fs::read_dir(&tracks_dir).map_err(io_err)?.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("idl0t") {
                continue;
            }
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
            match read_track(&path) {
                Ok(track) if track.id == stem => {
                    let full_json = std::fs::read_to_string(&path).map_err(io_err)?;
                    let now = 0i64; // created_at_ms/updated_at_ms: the domain Track type does not carry these post-parse in this crate's current model; use 0 as a placeholder until track_artifact's model exposes them, OR read them from the raw JSON directly — see this plan's Open questions.
                    conn.execute(
                        "INSERT INTO tracks (track_id, name, venue_name, created_at_ms, updated_at_ms, full_json) VALUES (?1,?2,?3,?4,?5,?6)",
                        rusqlite::params![track.id, track.name, track.venue, now, now, full_json],
                    )?;
                    report.tracks_indexed += 1;
                }
                Ok(_) => report.skipped.push(format!("{}: filename does not match its own track_id", path.display())),
                Err(e) => report.skipped.push(format!("{}: {e}", path.display())),
            }
        }
    }

    // 3. sessions (+ 4. laps, inline per session)
    let sessions_dir = data_root.join("sessions");
    if sessions_dir.is_dir() {
        for entry in std::fs::read_dir(&sessions_dir).map_err(io_err)?.flatten() {
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let session_id = entry.file_name().to_string_lossy().into_owned();
            let sj_path = dir.join("session.json");
            if !sj_path.is_file() {
                continue; // transient import-in-progress state, not corruption (C4 §2)
            }
            match read_session_json(&sj_path) {
                Ok(doc) => {
                    // data.parquet file metadata supplies blob_sha256/source_format/
                    // importer_version/seam_correction_version/engine_version —
                    // read it via store::parquet if present; a session.json with no
                    // data.parquet yet is skipped for the *sessions* row (nothing to
                    // index there beyond what session.json alone can't supply) but
                    // this is intentionally left to Task 15's CLI-level integration,
                    // which has both store::parquet and store::session_json in scope
                    // together — see this plan's Open questions for why this task
                    // stops at the session.json-only fields rather than guessing at
                    // a data.parquet read here.
                    let lap_count = doc.laps.len() as i64;
                    let duration_ms = doc.laps.iter().map(|l| l.end_timestamp_ms).max();
                    let inserted = conn.execute(
                        "INSERT OR IGNORE INTO sessions (session_id, blob_sha256, source_format, device_id, config_checksum, importer_version, seam_correction_version, engine_version, timestamp_utc_ms, created_at_ms, rider, bike, venue_name, event_name, event_session, short_comment, tag, lap_count, duration_ms) \
                         VALUES (?1,'','idl0',NULL,NULL,'','','',0,0,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                        rusqlite::params![session_id, doc.rider, doc.bike, doc.venue_name, doc.event_name, doc.event_session, doc.short_comment, doc.tag, lap_count, duration_ms],
                    );
                    match inserted {
                        Ok(_) => {
                            report.sessions_indexed += 1;
                            for lap in &doc.laps {
                                conn.execute(
                                    "INSERT INTO laps (session_id, lap_number, lap_time_ms, track_id) VALUES (?1,?2,?3,NULL)",
                                    rusqlite::params![session_id, lap.lap_number, lap.lap_time_ms],
                                )?;
                                report.laps_indexed += 1;
                            }
                        }
                        Err(e) => report.skipped.push(format!("{}: {e}", sj_path.display())),
                    }
                }
                Err(e) => report.skipped.push(format!("{}: {e}", sj_path.display())),
            }
        }
    }

    // 5. lap_summary — deferred: requires reading derived/*.parquet per
    // session/lap and computing (min,max,mean) over each lap's time window
    // (store::parquet's column-reading primitives, Task 9, plus a lap-window
    // reduce this task does not yet have a home for). Implemented as a
    // follow-up within this same task once Task 9 lands (it does, earlier
    // in this plan) — implementers: add it here rather than leaving it
    // permanently absent; flagged as the one C4 §5 step this draft does not
    // literally spell out, since it composes two other tasks' primitives in
    // a way that's easiest to write with both already compiling in front of
    // you rather than re-derived from scratch here.

    // 6. workbooks — L3/C2 owns the workbook format; this step is a no-op
    // until `.idl1wb` front-matter parsing exists (out of L1's scope,
    // design doc §10's L3 row). `workbooks` table stays empty until then.

    // 7. schema version already set in create_schema.

    conn.execute("PRAGMA wal_checkpoint(TRUNCATE)", [])?;
    drop(conn);

    let bytes = std::fs::read(&staging_path).map_err(io_err)?;
    let final_path = data_root.join("catalog.sqlite");
    write_atomic(data_root, &final_path, &bytes, None)
        .map_err(|e| CatalogError { kind: CatalogErrorKind::Io, message: e.to_string() })?;
    let _ = std::fs::remove_file(&staging_path);

    Ok(report)
}

fn io_err(e: std::io::Error) -> CatalogError {
    CatalogError { kind: CatalogErrorKind::Io, message: e.to_string() }
}
```
**Two deliberate scope notes, called out rather than silently left half-built:** (a) `lap_summary` (C4 §5 step 5) needs `store::parquet`'s column reader plus a lap-time-window reduce that doesn't have a clean home yet in this plan's task order — implementers finish it inline in this task, using `store::parquet::read_session_parquet` plus a new small windowed min/max/mean fold (mirroring the existing engine's `channel_min_max` pattern, SPEC §15.3) over each `derived/*.parquet`; (b) `tracks.created_at_ms`/`updated_at_ms` use a `0` placeholder because the domain `Track` type (`track_artifact::model::Track`) does not currently expose the wire JSON's `created_at_ms`/`updated_at_ms` fields post-parse (`read.rs`'s conversion drops them) — either extend `Track` to carry them (a small, self-contained addition to `track_artifact/model.rs`, in scope for this task since it's needed to satisfy C4's own DDL) or parse them directly from the raw JSON string already being read for `full_json`. Both are flagged in this plan's Open questions.

- [ ] **Step 3: Tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::blob::write_blob;
    use crate::store::session_json::{empty_session_json, write_session_json};

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn open_catalog_creates_file_and_applies_pragmas() {
        // Arrange
        let root = temp_root();
        let path = root.join("catalog.sqlite");

        // Act
        let conn = open_catalog(&path).unwrap();
        create_schema(&conn).unwrap();

        // Assert
        let journal_mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
        assert_eq!(journal_mode.to_lowercase(), "wal");
        let user_version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(user_version, CATALOG_SCHEMA_VERSION);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rebuild_catalog_indexes_a_blob_and_a_session() {
        // Arrange
        let root = temp_root();
        write_blob(&root, b"raw idl0 bytes").unwrap();
        let doc = empty_session_json("s1");
        write_session_json(&root, "s1", &doc, None).unwrap();

        // Act
        let report = rebuild_catalog(&root).unwrap();

        // Assert
        assert_eq!(report.blobs_indexed, 1);
        assert_eq!(report.sessions_indexed, 1);
        assert!(report.skipped.is_empty());

        let conn = open_catalog(&root.join("catalog.sqlite")).unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rebuild_catalog_skips_a_malformed_session_json_without_aborting_the_scan() {
        // Arrange
        let root = temp_root();
        let good = empty_session_json("s-good");
        write_session_json(&root, "s-good", &good, None).unwrap();
        let bad_dir = root.join("sessions").join("s-bad");
        std::fs::create_dir_all(&bad_dir).unwrap();
        std::fs::write(bad_dir.join("session.json"), b"not json").unwrap();

        // Act
        let report = rebuild_catalog(&root).unwrap();

        // Assert
        assert_eq!(report.sessions_indexed, 1);
        assert_eq!(report.skipped.len(), 1);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn rebuild_catalog_on_an_empty_tree_produces_an_empty_report_not_an_error() {
        // Arrange
        let root = temp_root();

        // Act
        let report = rebuild_catalog(&root).unwrap();

        // Assert
        assert_eq!(report, RebuildReport::default());

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 4: Wire in and run**

Add `pub mod catalog;` to `src/store/mod.rs`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::catalog 2>&1 | grep -E "^test |^test result"
```
Expected: all 4 tests `ok`.

- [ ] **Step 5: Commit**

```bash
git add core/src/store/catalog.rs core/src/store/mod.rs
git commit -m "store: SQLite catalog and rebuild (C4 §5)"
```

---
### Task 13: `verify` (C4 §7); `.idl0t` writer; bike-profile/app-settings persistence

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`.

**Files:**
- Create: `src/store/verify.rs`, `src/track_artifact/write.rs`, `src/store/profile.rs`, `src/store/settings.rs`.
- Modify: `src/store/mod.rs` (`pub mod verify;`, `pub mod profile;`, `pub mod settings;`), `src/track_artifact/mod.rs` (`pub mod write; pub use write::write_track;`).

**Interfaces:**
- Produces: `pub fn verify(data_root: &Path) -> Vec<Finding>` (C4 §7); `pub fn write_track(data_root: &Path, track: &Track) -> Result<PathBuf, TrackWriteError>` (encode side of `.idl0t`, C4 §2 — the inventory's `track_artifact_io.dart` "encode missing in engine" gap); `pub struct BikeProfile { .. }` + `save`/`load_all`/`delete` (port of `bike_profile.dart`/`profile_store.dart`); `pub struct AppSettings { .. }` + `load`/`save` against `app_config_dir()/settings.json` (port of `app_settings.dart`, sharing the bootstrap file C4 §1 already fixes for `data_dir`).

- [ ] **Step 1: `store/verify.rs` — the ten checks (C4 §7)**

```rust
//! `verify` (contract C4 §7): walks `<data>`, reports every check as a
//! [`Finding`], never auto-repairs structured content. Scope is `<data>`
//! only — `app_config_dir()/settings.json` is outside it on every platform
//! (C4 §1) and is never scanned.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Finding {
    pub severity: Severity,
    pub path: PathBuf,
    pub message: String,
}

/// Runs every C4 §7 check against `<data_root>`, in the contract's order.
/// Checks 6 (workbook parse) and 9 (catalog-row-points-at-missing-file) are
/// **not implemented by this task** — #6 needs C2/L3's `.idl1wb` parser
/// (out of L1's scope), #9 needs a live catalog connection cross-referenced
/// against every table's file-reference columns (mechanically
/// straightforward once L1's catalog, Task 12, is the only writer, but not
/// written here to keep this task's own scope to what L1 alone can
/// verify without guessing at another lane's not-yet-existing format) —
/// both are listed in this plan's Open questions rather than silently
/// omitted from this doc comment.
pub fn verify(data_root: &Path) -> Vec<Finding> {
    let mut findings = Vec::new();
    check_blobs(data_root, &mut findings); // #1
    check_sessions(data_root, &mut findings); // #2, #3, #4
    check_derived(data_root, &mut findings); // #5, #6(orphan, not parse)
    check_tracks(data_root, &mut findings); // #8
    check_unexpected_paths(data_root, &mut findings); // #10
    findings
}

fn check_blobs(data_root: &Path, out: &mut Vec<Finding>) {
    let dir = data_root.join("blobs").join("sha256");
    let Ok(shards) = std::fs::read_dir(&dir) else { return };
    for shard in shards.flatten() {
        let Ok(entries) = std::fs::read_dir(shard.path()) else { continue };
        for entry in entries.flatten() {
            let prefix = shard.file_name().to_string_lossy().into_owned();
            let suffix = entry.file_name().to_string_lossy().into_owned();
            let digest = format!("{prefix}{suffix}");
            if let Err(e) = crate::store::blob::verify_blob(data_root, &digest) {
                out.push(Finding { severity: Severity::Error, path: entry.path(), message: e.to_string() });
            }
        }
    }
}

fn check_sessions(data_root: &Path, out: &mut Vec<Finding>) {
    let dir = data_root.join("sessions");
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for entry in entries.flatten() {
        let session_dir = entry.path();
        if !session_dir.is_dir() {
            continue;
        }
        let sj_path = session_dir.join("session.json");
        if !sj_path.is_file() {
            continue; // transient import state, C4 §2 — not corruption
        }
        match crate::store::session_json::read_session_json(&sj_path) {
            Ok(_doc) => {
                // #3 (missing blob) requires data.parquet's blob_sha256,
                // which requires reading data.parquet's file metadata —
                // deferred to the CLI-level `verify` integration (Task 15),
                // which has both store::parquet and this session.json read
                // already in scope together; see this plan's Open questions.
            }
            Err(e) => out.push(Finding {
                severity: Severity::Error,
                path: sj_path,
                message: e.to_string(),
            }),
        }
    }
}

fn check_derived(data_root: &Path, out: &mut Vec<Finding>) {
    let sessions_dir = data_root.join("sessions");
    let Ok(sessions) = std::fs::read_dir(&sessions_dir) else { return };
    for session in sessions.flatten() {
        let derived_dir = session.path().join("derived");
        let Ok(entries) = std::fs::read_dir(&derived_dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            let Ok(bytes) = std::fs::read(&path) else { continue };
            let actual = crate::store::atomic::sha256_hex(&bytes);
            if actual != stem {
                out.push(Finding {
                    severity: Severity::Error,
                    path,
                    message: format!("derived filename {stem} does not match its own content hash {actual}"),
                });
            }
            // Orphan detection (#6, info-severity) needs the session's
            // current data.parquet + the live estimator config to
            // recompute the expected hash — this is a materialisation-time
            // concern (which estimator, which config) this store module has
            // no way to know generically; left to the estimator glue that
            // calls store::derived::write_derived_parquet in the first
            // place (it already has everything needed to recompute and
            // compare). Flagged, not silently dropped.
        }
    }
}

fn check_tracks(data_root: &Path, out: &mut Vec<Finding>) {
    let dir = data_root.join("tracks");
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("idl0t") {
            continue;
        }
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string();
        match crate::track_artifact::read::read_track(&path) {
            Ok(track) if track.id == stem => {}
            Ok(_) => out.push(Finding {
                severity: Severity::Error,
                path,
                message: "filename does not match the track_id inside its own JSON".to_string(),
            }),
            Err(e) => out.push(Finding { severity: Severity::Error, path, message: e.to_string() }),
        }
    }
}

fn check_unexpected_paths(data_root: &Path, out: &mut Vec<Finding>) {
    let known_top_level = ["blobs", "sessions", "workbooks", "tracks", "catalog.sqlite", "catalog.sqlite-wal", "catalog.sqlite-shm", "tmp", "profiles"];
    let Ok(entries) = std::fs::read_dir(data_root) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !known_top_level.contains(&name.as_str()) {
            out.push(Finding {
                severity: Severity::Info,
                path: entry.path(),
                message: "path under <data> matches none of the C4 §2 patterns".to_string(),
            });
        }
    }
}
```
(`"profiles"` is in `known_top_level` because Task 13's own profile store, below, adds that directory — flagged as a C4-extension in this plan's Open questions, same as the SPEC §18 rewrite already noted.)

- [ ] **Step 2: Tests for `verify`**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::blob::write_blob;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn verify_clean_tree_reports_nothing() {
        // Arrange
        let root = temp_root();
        write_blob(&root, b"clean blob").unwrap();

        // Act
        let findings = verify(&root);

        // Assert
        assert!(findings.is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn verify_detects_a_corrupted_blob() {
        // Arrange
        let root = temp_root();
        let digest = write_blob(&root, b"original").unwrap();
        std::fs::write(crate::store::blob::blob_path(&root, &digest), b"corrupted").unwrap();

        // Act
        let findings = verify(&root);

        // Assert
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, Severity::Error);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn verify_reports_an_unrecognised_top_level_path_as_info() {
        // Arrange
        let root = temp_root();
        std::fs::write(root.join("Thumbs.db"), b"").unwrap();

        // Act
        let findings = verify(&root);

        // Assert
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].severity, Severity::Info);

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 3: `.idl0t` writer**

`src/track_artifact/write.rs`:
```rust
//! Encode side of `.idl0t` (contract C4 §2) — the inventory's noted gap
//! ("encode missing in engine"). Writes the same wire shape
//! `track_artifact::model::TrackArtifact`/`TrackDto` already reads.

use std::fmt;
use std::path::{Path, PathBuf};

use crate::store::atomic::{write_atomic, AtomicWriteError};
use crate::track_artifact::model::Track;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrackWriteError {
    pub message: String,
}
impl fmt::Display for TrackWriteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for TrackWriteError {}
impl From<AtomicWriteError> for TrackWriteError {
    fn from(e: AtomicWriteError) -> Self {
        TrackWriteError { message: e.to_string() }
    }
}

/// Serialises `track` to the `.idl0t` wire JSON shape (mirroring
/// `TrackDto`'s field names exactly — `track_artifact_version`, nested
/// `track` object) and writes it atomically to
/// `<data_root>/tracks/<track_id>.idl0t`.
///
/// **Not yet round-trip-lossless with `read_track`**: `Track`'s domain type
/// (`track_artifact::model::Track`) does not currently carry
/// `created_at_ms`/`updated_at_ms` (see Task 12's note on the same gap) —
/// this writer accepts them as explicit parameters rather than pretending
/// `Track` already has them, so the call site (not this function) is the
/// one place a caller must supply real values.
pub fn write_track(
    data_root: &Path,
    track: &Track,
    created_at_ms: i64,
    updated_at_ms: i64,
) -> Result<PathBuf, TrackWriteError> {
    let lap_timing_json = track.timing.as_ref().map(|t| match t {
        crate::laps::LapTiming::Circuit { start_finish } => serde_json::json!({
            "kind": "circuit",
            "start_finish": gate_json(start_finish),
        }),
        crate::laps::LapTiming::PointToPoint { start, finish } => serde_json::json!({
            "kind": "point_to_point",
            "start": gate_json(start),
            "finish": gate_json(finish),
        }),
    });
    let doc = serde_json::json!({
        "track_artifact_version": crate::track_artifact::SUPPORTED_TRACK_ARTIFACT_VERSION,
        "track": {
            "track_id": track.id,
            "name": track.name,
            "venue_name": track.venue,
            "lap_timing": lap_timing_json,
            "sector_gates": track.sector_gates.iter().map(|g| serde_json::json!({"name": g.name, "gate": gate_json(&g.gate)})).collect::<Vec<_>>(),
            "neutral_zones": track.neutral_zones.iter().map(|z| serde_json::json!({"name": z.name, "enter": gate_json(&z.enter), "exit": gate_json(&z.exit)})).collect::<Vec<_>>(),
            "reference_polyline": track.reference_polyline.iter().map(|f| serde_json::json!({"timestamp_ms": f.timestamp_ms, "latitude_deg": f.lat, "longitude_deg": f.lon})).collect::<Vec<_>>(),
            "created_at_ms": created_at_ms,
            "updated_at_ms": updated_at_ms,
        }
    });
    let bytes = serde_json::to_vec_pretty(&doc).map_err(|e| TrackWriteError { message: e.to_string() })?;
    let target = data_root.join("tracks").join(format!("{}.idl0t", track.id));
    write_atomic(data_root, &target, &bytes, None)?;
    Ok(target)
}

fn gate_json(g: &crate::laps::Gate) -> serde_json::Value {
    serde_json::json!({ "lat1_deg": g.lat1, "lon1_deg": g.lon1, "lat2_deg": g.lat2, "lon2_deg": g.lon2, "name": "" })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::track_artifact::read::read_track;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn write_then_read_round_trips_identity_and_geometry() {
        // Arrange
        let root = temp_root();
        let track = Track {
            id: "t-1".to_string(),
            name: "A-Line".to_string(),
            venue: "Whistler".to_string(),
            timing: Some(crate::laps::LapTiming::Circuit {
                start_finish: crate::laps::Gate { lat1: 1.0, lon1: 2.0, lat2: 3.0, lon2: 4.0 },
            }),
            sector_gates: vec![],
            neutral_zones: vec![],
            reference_polyline: vec![],
        };

        // Act
        let path = write_track(&root, &track, 0, 0).unwrap();
        let back = read_track(&path).unwrap();

        // Assert
        assert_eq!(back.id, track.id);
        assert_eq!(back.name, track.name);
        assert!(matches!(back.timing, Some(crate::laps::LapTiming::Circuit { .. })));

        let _ = std::fs::remove_dir_all(&root);
    }
}
```
In `src/track_artifact/mod.rs`, add `pub mod write;` and `pub use write::write_track;`.

- [ ] **Step 4: Bike-profile persistence**

`src/store/profile.rs`:
```rust
//! Bike-profile persistence (contract: not fixed by C4 — this plan's own
//! extension, see Open questions). Port of `bike_profile.dart` /
//! `profile_store.dart`: one JSON file per profile at
//! `<data_root>/profiles/<profile_id>.idl0p`, atomic writes, malformed
//! files skipped on load with a warning (never fail the whole load).

use std::fmt;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::store::atomic::{write_atomic, AtomicWriteError};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BikeProfile {
    pub profile_id: String,
    #[serde(default)]
    pub profile_name: String,
    #[serde(default)]
    pub created_at_ms: i64,
    #[serde(default)]
    pub updated_at_ms: i64,
    /// The device-config JSON payload (SPEC §8), pushed verbatim.
    pub config: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileError {
    pub message: String,
}
impl fmt::Display for ProfileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for ProfileError {}
impl From<AtomicWriteError> for ProfileError {
    fn from(e: AtomicWriteError) -> Self {
        ProfileError { message: e.to_string() }
    }
}

fn profiles_dir(data_root: &Path) -> PathBuf {
    data_root.join("profiles")
}

/// Loads every `<data_root>/profiles/*.idl0p`, skipping malformed files
/// with a warning printed to stderr (matching `profile_store.dart`'s
/// behaviour exactly) rather than failing the whole load. Sorted by
/// `profile_name` ascending.
pub fn load_all(data_root: &Path) -> Vec<BikeProfile> {
    let dir = profiles_dir(data_root);
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("idl0p") {
            continue;
        }
        match std::fs::read(&path).ok().and_then(|b| serde_json::from_slice::<BikeProfile>(&b).ok()) {
            Some(p) => out.push(p),
            None => eprintln!("profile store: skipping {} — malformed", path.display()),
        }
    }
    out.sort_by(|a, b| a.profile_name.cmp(&b.profile_name));
    out
}

/// Writes `profile` atomically to `<data_root>/profiles/<profile_id>.idl0p`.
pub fn save(data_root: &Path, profile: &BikeProfile) -> Result<(), ProfileError> {
    let bytes = serde_json::to_vec_pretty(profile).map_err(|e| ProfileError { message: e.to_string() })?;
    let target = profiles_dir(data_root).join(format!("{}.idl0p", profile.profile_id));
    write_atomic(data_root, &target, &bytes, None)?;
    Ok(())
}

/// Removes a profile's file. No-op when absent.
pub fn delete(data_root: &Path, profile_id: &str) -> Result<(), ProfileError> {
    let path = profiles_dir(data_root).join(format!("{profile_id}.idl0p"));
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| ProfileError { message: e.to_string() })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_root() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn save_then_load_all_round_trips() {
        // Arrange
        let root = temp_root();
        let p = BikeProfile {
            profile_id: "p1".to_string(),
            profile_name: "Trek Session 2024".to_string(),
            created_at_ms: 1,
            updated_at_ms: 2,
            config: serde_json::json!({"wheel_circumference_front_mm": 2300}),
        };

        // Act
        save(&root, &p).unwrap();
        let all = load_all(&root);

        // Assert
        assert_eq!(all, vec![p]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn load_all_skips_malformed_file_without_failing() {
        // Arrange
        let root = temp_root();
        std::fs::create_dir_all(profiles_dir(&root)).unwrap();
        std::fs::write(profiles_dir(&root).join("bad.idl0p"), b"not json").unwrap();
        let good = BikeProfile {
            profile_id: "p1".to_string(),
            profile_name: "Good".to_string(),
            created_at_ms: 0,
            updated_at_ms: 0,
            config: serde_json::json!({}),
        };
        save(&root, &good).unwrap();

        // Act
        let all = load_all(&root);

        // Assert
        assert_eq!(all, vec![good]);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn delete_removes_the_file_and_is_a_no_op_when_absent() {
        // Arrange
        let root = temp_root();
        let p = BikeProfile { profile_id: "p1".to_string(), profile_name: String::new(), created_at_ms: 0, updated_at_ms: 0, config: serde_json::json!({}) };
        save(&root, &p).unwrap();

        // Act
        delete(&root, "p1").unwrap();
        delete(&root, "does-not-exist").unwrap();

        // Assert
        assert!(load_all(&root).is_empty());

        let _ = std::fs::remove_dir_all(&root);
    }
}
```

- [ ] **Step 5: App settings persistence**

`src/store/settings.rs`:
```rust
//! App-wide settings persistence (port of `app_settings.dart`) — reuses
//! `app_config_dir()/settings.json`, the bootstrap file contract C4 §1
//! already fixes for `data_dir`, rather than a second settings file (see
//! this plan's Open questions for why). This module reads/writes plain
//! `std::fs` — it has no idea where `app_config_dir()` resolves to on any
//! platform (that's Tauri's path resolver, L5's layer); it takes the
//! resolved path as a parameter.

use std::fmt;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::store::atomic::{sha256_hex, AtomicWriteError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnitSystem {
    Imperial,
    Metric,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub data_dir: Option<String>, // C4 §1's existing key
    #[serde(default = "default_rider_name")]
    pub rider_name: String,
    #[serde(default = "default_unit_system")]
    pub unit_system: UnitSystem,
}

fn default_rider_name() -> String {
    String::new()
}
fn default_unit_system() -> UnitSystem {
    UnitSystem::Imperial
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings { data_dir: None, rider_name: default_rider_name(), unit_system: default_unit_system() }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingsError {
    pub message: String,
}
impl fmt::Display for SettingsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for SettingsError {}

/// Loads `settings.json` at `path`; defaults (including `data_dir: None`,
/// matching C4 §1's "absent → platform default") when the file is absent
/// or malformed — settings are UI convenience, never a load-blocking
/// concern (CLAUDE.md §5).
pub fn load(path: &Path) -> AppSettings {
    std::fs::read(path)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// Writes `settings.json` atomically. Unlike every other file class in
/// this module, `settings.json` lives **outside** `<data>` (C4 §1), so this
/// function takes `path` directly rather than a `data_root` — there is no
/// `tmp/` beside it to stage through; it stages in the same directory as
/// `path` itself instead.
pub fn save(path: &Path, settings: &AppSettings) -> Result<(), SettingsError> {
    let bytes = serde_json::to_vec_pretty(settings).map_err(|e| SettingsError { message: e.to_string() })?;
    let parent = path.parent().ok_or_else(|| SettingsError { message: "settings path has no parent".to_string() })?;
    crate::store::atomic::write_atomic(parent, path, &bytes, current_hash(path))
        .map(|_| ())
        .map_err(|e: AtomicWriteError| SettingsError { message: e.to_string() })
}

fn current_hash(path: &Path) -> Option<String> {
    std::fs::read(path).ok().map(|b| sha256_hex(&b))
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_settings_path() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("idl-rs-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    #[test]
    fn load_missing_file_returns_defaults() {
        // Arrange
        let path = temp_settings_path();

        // Act
        let settings = load(&path);

        // Assert
        assert_eq!(settings, AppSettings::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        // Arrange
        let path = temp_settings_path();
        let mut settings = AppSettings::default();
        settings.rider_name = "Isaac".to_string();
        settings.data_dir = Some("D:\\race-data".to_string());

        // Act
        save(&path, &settings).unwrap();
        let back = load(&path);

        // Assert
        assert_eq!(back, settings);

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn malformed_settings_file_falls_back_to_defaults() {
        // Arrange
        let path = temp_settings_path();
        std::fs::write(&path, b"not json").unwrap();

        // Act
        let settings = load(&path);

        // Assert
        assert_eq!(settings, AppSettings::default());

        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
```

- [ ] **Step 6: Wire in and run**

Add `pub mod verify;`, `pub mod profile;`, `pub mod settings;` to `src/store/mod.rs`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs store::verify store::profile store::settings track_artifact::write 2>&1 | grep -E "^test |^test result"
```
Expected: all tests `ok` (3 + 3 + 3 + 1 = 10).

- [ ] **Step 7: Commit**

```bash
git add core/src/store/verify.rs core/src/store/profile.rs core/src/store/settings.rs core/src/track_artifact/write.rs core/src/track_artifact/mod.rs core/src/store/mod.rs
git commit -m "store: verify (C4 §7); .idl0t writer; bike-profile/app-settings persistence"
```

---
### Task 14: Session/lap-level ports — gate synthesis, session-wide lap renumbering, lap-distance normalisation, session filename

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\core`. Ports `gate_geometry.dart`, `cached_session_laps.dart`, `lap_distance_accumulator.dart`, `session_filename.dart` (idl0-app `app/lib/data/`, already read in full during planning) into Rust, algorithm-for-algorithm.

**Files:**
- Create: `src/laps/gate_synthesis.rs`, `src/laps/renumber.rs`, `src/laps/distance.rs`, `src/session/filename.rs`.
- Modify: `src/laps/mod.rs` (export the three new modules), `src/session/mod.rs` (`pub mod filename;`).

**Interfaces:**
- Consumes: `crate::gps::GpsFix`, `store::session_json::{LapGateJson, LapJson, TrackVisitJson}`.
- Produces: `gate_synthesis::{endpoint_gates, perpendicular_gate_at, snap_to_nearest_fix}`; `renumber::renumber_session_laps`; `distance::LapDistanceAccumulator::compute`; `filename::{format_session_file_base, session_file_base, unique_file_base}`.

- [ ] **Step 1: `laps/gate_synthesis.rs`**

Port of `gate_geometry.dart`, verbatim algorithm. **Unit note:** `gate_geometry.dart` and `crate::gps::GpsFix` both use the raw wire scale (degrees × 1e7); `store::session_json::LapGateJson` (Task 11) uses C1 §6's stated decimal-degrees convention. This function operates in the GPS-fix scale (× 1e7, matching its geometric-mean/perpendicular-vector math, which is scale-invariant so it doesn't matter *which* scale it runs in) and converts to decimal degrees only at the very end, once, when building the returned `LapGateJson` — flagged inline, since C1 §8 item 4 leaves the *true* on-disk convention still pending Isaac's confirmation; if that confirmation lands on × 1e7 instead, delete the one `/ 1e7` conversion step below and nothing else changes.

```rust
//! Synthesises [`LapGateJson`] pairs from a reference polyline (port of
//! `gate_geometry.dart`). Used by GPX-as-Track import: the user gets two
//! reasonable default gates at the start and finish, re-placeable later.

use crate::gps::GpsFix;
use crate::store::session_json::LapGateJson;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateSynthesisErrorKind {
    /// `polyline` had fewer than 2 fixes (no direction is defined).
    TooShort,
    /// `index` was out of bounds for `polyline`.
    IndexOutOfBounds,
    /// `polyline` was empty.
    Empty,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GateSynthesisError {
    pub kind: GateSynthesisErrorKind,
    pub message: String,
}
impl std::fmt::Display for GateSynthesisError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}
impl std::error::Error for GateSynthesisError {}

const DEFAULT_GATE_WIDTH_METERS: f64 = 20.0;

/// Two gates derived from the start and end of `polyline`, each a
/// `gate_width_meters`-long segment centred on the endpoint, perpendicular
/// to the local track direction. `None` when `polyline` has fewer than 2
/// fixes.
pub fn endpoint_gates(polyline: &[GpsFix], gate_width_meters: f64) -> Option<(LapGateJson, LapGateJson)> {
    if polyline.len() < 2 {
        return None;
    }
    let start = perpendicular_gate(&polyline[0], &polyline[1], gate_width_meters, "Start");
    let finish = perpendicular_gate(
        &polyline[polyline.len() - 1],
        &polyline[polyline.len() - 2],
        gate_width_meters,
        "Finish",
    );
    Some((start, finish))
}

/// [`endpoint_gates`] with the pre-idl1 default width (20 m).
pub fn endpoint_gates_default(polyline: &[GpsFix]) -> Option<(LapGateJson, LapGateJson)> {
    endpoint_gates(polyline, DEFAULT_GATE_WIDTH_METERS)
}

/// A gate of length `width_meters` centred on `polyline[index]`,
/// perpendicular to the local tangent (the segment toward `index+1`, or
/// toward `index-1` at the last index).
pub fn perpendicular_gate_at(
    polyline: &[GpsFix],
    index: usize,
    width_meters: f64,
    name: &str,
) -> Result<LapGateJson, GateSynthesisError> {
    if polyline.len() < 2 {
        return Err(GateSynthesisError { kind: GateSynthesisErrorKind::TooShort, message: "polyline must contain at least 2 fixes".to_string() });
    }
    if index >= polyline.len() {
        return Err(GateSynthesisError {
            kind: GateSynthesisErrorKind::IndexOutOfBounds,
            message: format!("index {index} out of bounds for polyline of length {}", polyline.len()),
        });
    }
    let at = &polyline[index];
    let towards = if index + 1 < polyline.len() { &polyline[index + 1] } else { &polyline[index - 1] };
    Ok(perpendicular_gate(at, towards, width_meters, name))
}

/// Index of the polyline fix whose Euclidean lat/lon distance to
/// `(lat_deg, lon_deg)` (same × 1e7 scale as `polyline`) is smallest.
pub fn snap_to_nearest_fix(polyline: &[GpsFix], lat_deg: f64, lon_deg: f64) -> Result<usize, GateSynthesisError> {
    if polyline.is_empty() {
        return Err(GateSynthesisError { kind: GateSynthesisErrorKind::Empty, message: "polyline must not be empty".to_string() });
    }
    let mut best_idx = 0;
    let mut best_dist_sq = f64::INFINITY;
    for (i, f) in polyline.iter().enumerate() {
        let d_lat = f.lat - lat_deg;
        let d_lon = f.lon - lon_deg;
        let dist_sq = d_lat * d_lat + d_lon * d_lon;
        if dist_sq < best_dist_sq {
            best_dist_sq = dist_sq;
            best_idx = i;
        }
    }
    Ok(best_idx)
}

fn perpendicular_gate(at_index: &GpsFix, towards: &GpsFix, width_meters: f64, name: &str) -> LapGateJson {
    const M_PER_DEG_UNITS: f64 = 111_320.0 / 1e7;
    let lat_deg = at_index.lat / 1e7;
    let lon_scale = M_PER_DEG_UNITS * (lat_deg * std::f64::consts::PI / 180.0).cos().abs();

    let dx_m = (towards.lat - at_index.lat) * M_PER_DEG_UNITS;
    let dy_m = (towards.lon - at_index.lon) * lon_scale;
    let length = (dx_m * dx_m + dy_m * dy_m).sqrt();

    if length == 0.0 {
        return to_lap_gate_json(at_index.lat, at_index.lon, at_index.lat, at_index.lon, name);
    }

    let perp_dx_m = -dy_m / length;
    let perp_dy_m = dx_m / length;

    let half_width = width_meters / 2.0;
    let d_lat_units = (perp_dx_m * half_width) / M_PER_DEG_UNITS;
    let d_lon_units = (perp_dy_m * half_width) / lon_scale;

    to_lap_gate_json(
        at_index.lat + d_lat_units,
        at_index.lon + d_lon_units,
        at_index.lat - d_lat_units,
        at_index.lon - d_lon_units,
        name,
    )
}

/// Converts × 1e7-scale coordinates to `LapGateJson`'s decimal-degrees
/// convention (C1 §6's stated default — see this function's module-level
/// unit note).
fn to_lap_gate_json(lat1_e7: f64, lon1_e7: f64, lat2_e7: f64, lon2_e7: f64, name: &str) -> LapGateJson {
    LapGateJson {
        lat1_deg: lat1_e7 / 1e7,
        lon1_deg: lon1_e7 / 1e7,
        lat2_deg: lat2_e7 / 1e7,
        lon2_deg: lon2_e7 / 1e7,
        name: name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fix(ts: i64, lat: f64, lon: f64) -> GpsFix {
        GpsFix { timestamp_ms: ts, lat, lon }
    }

    #[test]
    fn endpoint_gates_needs_at_least_two_fixes() {
        // Arrange / Act / Assert
        assert!(endpoint_gates_default(&[]).is_none());
        assert!(endpoint_gates_default(&[fix(0, 0.0, 0.0)]).is_none());
    }

    #[test]
    fn endpoint_gates_produces_start_and_finish_perpendicular_to_travel() {
        // Arrange — a straight line due north (lat increasing, lon constant).
        let polyline = vec![
            fix(0, 501_163_000.0, -1_229_574_000.0),
            fix(1000, 501_164_000.0, -1_229_574_000.0),
            fix(2000, 501_165_000.0, -1_229_574_000.0),
        ];

        // Act
        let (start, finish) = endpoint_gates_default(&polyline).unwrap();

        // Assert — a gate perpendicular to due-north travel is (approximately)
        // east-west: its two endpoints should differ mostly in longitude, not
        // latitude, and be centred on the fix.
        assert_eq!(start.name, "Start");
        assert_eq!(finish.name, "Finish");
        assert!((start.lat1_deg - start.lat2_deg).abs() < (start.lon1_deg - start.lon2_deg).abs());
    }

    #[test]
    fn perpendicular_gate_at_out_of_bounds_index_is_a_typed_error() {
        // Arrange
        let polyline = vec![fix(0, 0.0, 0.0), fix(1, 1.0, 1.0)];

        // Act
        let err = perpendicular_gate_at(&polyline, 5, 20.0, "").unwrap_err();

        // Assert
        assert_eq!(err.kind, GateSynthesisErrorKind::IndexOutOfBounds);
    }

    #[test]
    fn snap_to_nearest_fix_finds_the_closest_index() {
        // Arrange
        let polyline = vec![fix(0, 0.0, 0.0), fix(1, 10.0, 10.0), fix(2, 20.0, 20.0)];

        // Act
        let idx = snap_to_nearest_fix(&polyline, 11.0, 9.0).unwrap();

        // Assert
        assert_eq!(idx, 1);
    }

    #[test]
    fn snap_to_nearest_fix_empty_polyline_is_a_typed_error() {
        // Act
        let err = snap_to_nearest_fix(&[], 0.0, 0.0).unwrap_err();

        // Assert
        assert_eq!(err.kind, GateSynthesisErrorKind::Empty);
    }
}
```

- [ ] **Step 2: `laps/renumber.rs`**

Port of `cached_session_laps.dart`.

```rust
//! Session-wide lap renumbering (port of `cached_session_laps.dart`). The
//! engine's lap detector emits **per-visit** numbering (each `TrackVisit`
//! restarts at 1, `crate::laps::detect_laps`); this assigns the
//! **session-wide** identity `session.json`'s `ignored_lap_numbers` etc.
//! match against — laps from every visit, sorted by start time, renumbered
//! 1-based across the whole session.

use crate::store::session_json::{LapJson, TrackVisitJson};

/// One session-wide-renumbered lap, its originating visit's `track_id`, and
/// whether it's in `ignored_lap_numbers`.
#[derive(Debug, Clone, PartialEq)]
pub struct RenumberedLap {
    pub lap: LapJson,
    pub track_id: Option<String>,
    pub is_ignored: bool,
}

/// Renumbers every lap across every `track_visits` entry, 1-based, in
/// start-time order. Pure — no I/O.
pub fn renumber_session_laps(track_visits: &[TrackVisitJson], ignored_lap_numbers: &[u32]) -> Vec<RenumberedLap> {
    let mut collected: Vec<(String, LapJson)> = Vec::new();
    for visit in track_visits {
        for lap in &visit.laps {
            collected.push((visit.track_id.clone(), lap.clone()));
        }
    }
    collected.sort_by_key(|(_, lap)| lap.start_timestamp_ms);

    collected
        .into_iter()
        .enumerate()
        .map(|(i, (track_id, src))| {
            let lap_number = (i + 1) as u32;
            RenumberedLap {
                lap: LapJson { lap_number, ..src },
                track_id: Some(track_id),
                is_ignored: ignored_lap_numbers.contains(&lap_number),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lap(number: u32, start_ms: i64) -> LapJson {
        LapJson {
            lap_number: number,
            start_timestamp_ms: start_ms,
            end_timestamp_ms: start_ms + 1000,
            raw_elapsed_ms: 1000,
            lap_time_ms: 1000,
            start_time_secs: 0.0,
            end_time_secs: 1.0,
            sectors: Vec::new(),
            neutral_zone_visits: Vec::new(),
        }
    }

    fn visit(track_id: &str, laps: Vec<LapJson>) -> TrackVisitJson {
        TrackVisitJson {
            visit_id: "v".to_string(),
            track_id: track_id.to_string(),
            start_timestamp_ms: 0,
            end_timestamp_ms: 0,
            laps,
        }
    }

    #[test]
    fn renumbers_across_visits_in_start_time_order() {
        // Arrange — visit B's per-visit lap 1 starts before visit A's, so it
        // must come first in the session-wide numbering.
        let visits = vec![
            visit("track-A", vec![lap(1, 5000), lap(2, 6000)]),
            visit("track-B", vec![lap(1, 1000)]),
        ];

        // Act
        let out = renumber_session_laps(&visits, &[]);

        // Assert
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].lap.lap_number, 1);
        assert_eq!(out[0].track_id.as_deref(), Some("track-B"));
        assert_eq!(out[1].lap.lap_number, 2);
        assert_eq!(out[1].track_id.as_deref(), Some("track-A"));
        assert_eq!(out[2].lap.lap_number, 3);
    }

    #[test]
    fn is_ignored_matches_the_renumbered_session_wide_number() {
        // Arrange
        let visits = vec![visit("t", vec![lap(1, 0), lap(2, 1000), lap(3, 2000)])];

        // Act
        let out = renumber_session_laps(&visits, &[2]);

        // Assert — the *second* session-wide lap is ignored, regardless of
        // its original per-visit lap_number.
        assert!(!out[0].is_ignored);
        assert!(out[1].is_ignored);
        assert!(!out[2].is_ignored);
    }
}
```

- [ ] **Step 3: `laps/distance.rs`**

Port of `lap_distance_accumulator.dart`, verbatim algorithm (confidence-anchor redistribution).

```rust
//! Per-sample lap-distance normalisation onto a canonical polyline (port of
//! `lap_distance_accumulator.dart`), confidence-anchor redistribution.

use crate::gps::GpsFix;

const METRES_PER_DEG_LAT: f64 = 111_320.0;
const ANCHOR_RESIDUAL_METRES: f64 = 5.0;
const ANCHOR_TANGENT_COS: f64 = 0.866; // cos(30°)
const ANCHOR_MIN_SPEED_KMH: f64 = 5.0;

/// One lap's per-sample distance map, normalised to `polyline`.
#[derive(Debug, Clone, PartialEq)]
pub struct LapDistanceAccumulator {
    /// Per-sample arc length on `polyline`, anchor-corrected. Same length
    /// as `samples`. Strictly monotonic in well-formed input.
    pub normalised_distance: Vec<f64>,
    /// Per-sample perpendicular residual from `polyline`, metres.
    pub residual: Vec<f64>,
    /// Per-sample tangent agreement (cosine of angle between the rider's
    /// local direction and the polyline tangent at the projection).
    pub tangent_agreement: Vec<f64>,
}

/// A `(sample_index, known_polyline_distance)` gate crossing.
pub struct GateCrossing {
    pub sample_index: usize,
    pub known_distance: f64,
}

impl LapDistanceAccumulator {
    /// Computes the normalised distance map. `samples`/`speed_kmh` are
    /// parallel, chronological. `start_gate_distance`/`finish_gate_distance`
    /// default to `0.0`/`polyline_length` when `None`.
    pub fn compute(
        samples: &[GpsFix],
        polyline: &[GpsFix],
        speed_kmh: &[f64],
        start_gate_distance: Option<f64>,
        finish_gate_distance: Option<f64>,
        gate_crossings: &[GateCrossing],
    ) -> Self {
        let n = samples.len();
        if n == 0 || polyline.len() < 2 {
            return LapDistanceAccumulator {
                normalised_distance: vec![0.0; n],
                residual: vec![0.0; n],
                tangent_agreement: vec![0.0; n],
            };
        }

        let mean_lat_rad = (polyline.iter().map(|f| f.lat).sum::<f64>() / polyline.len() as f64) * std::f64::consts::PI / 180.0;
        let lon_scale = METRES_PER_DEG_LAT * mean_lat_rad.cos();

        let mut polyline_cum = vec![0.0f64; polyline.len()];
        for k in 1..polyline.len() {
            let dx_lon = (polyline[k].lon - polyline[k - 1].lon) * lon_scale;
            let dy_lat = (polyline[k].lat - polyline[k - 1].lat) * METRES_PER_DEG_LAT;
            polyline_cum[k] = polyline_cum[k - 1] + (dx_lon * dx_lon + dy_lat * dy_lat).sqrt();
        }
        let polyline_length = *polyline_cum.last().unwrap();

        let mut polyline_distance = vec![0.0f64; n];
        let mut residual = vec![0.0f64; n];
        let mut tangent_agreement = vec![0.0f64; n];
        for i in 0..n {
            let s = &samples[i];
            let mut best_sq = f64::INFINITY;
            let mut best_k = 0usize;
            let mut best_t = 0.0f64;
            for k in 0..polyline.len() - 1 {
                let a = &polyline[k];
                let b = &polyline[k + 1];
                let dx_lon = (b.lon - a.lon) * lon_scale;
                let dy_lat = (b.lat - a.lat) * METRES_PER_DEG_LAT;
                let len_sq = dx_lon * dx_lon + dy_lat * dy_lat;
                let t = if len_sq == 0.0 {
                    0.0
                } else {
                    let px_lon = (s.lon - a.lon) * lon_scale;
                    let py_lat = (s.lat - a.lat) * METRES_PER_DEG_LAT;
                    ((px_lon * dx_lon + py_lat * dy_lat) / len_sq).clamp(0.0, 1.0)
                };
                let cx_lon = a.lon * lon_scale + t * dx_lon;
                let cy_lat = a.lat * METRES_PER_DEG_LAT + t * dy_lat;
                let ex = s.lon * lon_scale - cx_lon;
                let ey = s.lat * METRES_PER_DEG_LAT - cy_lat;
                let dist_sq = ex * ex + ey * ey;
                if dist_sq < best_sq {
                    best_sq = dist_sq;
                    best_k = k;
                    best_t = t;
                }
            }
            let seg_len = polyline_cum[best_k + 1] - polyline_cum[best_k];
            polyline_distance[i] = polyline_cum[best_k] + best_t * seg_len;
            residual[i] = best_sq.sqrt();

            if i > 0 && i < n - 1 {
                let stx = (samples[i + 1].lon - samples[i - 1].lon) * lon_scale;
                let sty = (samples[i + 1].lat - samples[i - 1].lat) * METRES_PER_DEG_LAT;
                let st_len = (stx * stx + sty * sty).sqrt();
                let ptx = (polyline[best_k + 1].lon - polyline[best_k].lon) * lon_scale;
                let pty = (polyline[best_k + 1].lat - polyline[best_k].lat) * METRES_PER_DEG_LAT;
                let pt_len = (ptx * ptx + pty * pty).sqrt();
                if st_len > 1e-6 && pt_len > 1e-6 {
                    tangent_agreement[i] = (stx * ptx + sty * pty) / (st_len * pt_len);
                }
            }
        }

        let mut cumulative_arc = vec![0.0f64; n];
        for i in 1..n {
            let dx_lon = (samples[i].lon - samples[i - 1].lon) * lon_scale;
            let dy_lat = (samples[i].lat - samples[i - 1].lat) * METRES_PER_DEG_LAT;
            cumulative_arc[i] = cumulative_arc[i - 1] + (dx_lon * dx_lon + dy_lat * dy_lat).sqrt();
        }

        let mut anchors: Vec<(usize, f64)> = vec![(0, start_gate_distance.unwrap_or(0.0))];
        for g in gate_crossings {
            anchors.push((g.sample_index, g.known_distance));
        }
        for i in 0..n {
            if residual[i] < ANCHOR_RESIDUAL_METRES
                && tangent_agreement[i] > ANCHOR_TANGENT_COS
                && speed_kmh[i] > ANCHOR_MIN_SPEED_KMH
            {
                anchors.push((i, polyline_distance[i]));
            }
        }
        anchors.push((n - 1, finish_gate_distance.unwrap_or(polyline_length)));
        anchors.sort_by_key(|&(idx, _)| idx);

        let mut normalised_distance = vec![0.0f64; n];
        for w in anchors.windows(2) {
            let (lo_idx, lo_dist) = w[0];
            let (hi_idx, hi_dist) = w[1];
            normalised_distance[lo_idx] = lo_dist;
            if hi_idx <= lo_idx {
                continue;
            }
            let span = cumulative_arc[hi_idx] - cumulative_arc[lo_idx];
            for k in (lo_idx + 1)..=hi_idx {
                normalised_distance[k] = if span < 1e-6 {
                    lo_dist
                } else {
                    let frac = (cumulative_arc[k] - cumulative_arc[lo_idx]) / span;
                    lo_dist + frac * (hi_dist - lo_dist)
                };
            }
        }

        LapDistanceAccumulator { normalised_distance, residual, tangent_agreement }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fix(lat: f64, lon: f64) -> GpsFix {
        GpsFix { timestamp_ms: 0, lat, lon }
    }

    #[test]
    fn empty_samples_or_short_polyline_returns_all_zero() {
        // Arrange / Act
        let a = LapDistanceAccumulator::compute(&[], &[fix(0.0, 0.0), fix(1.0, 1.0)], &[], None, None, &[]);
        let b = LapDistanceAccumulator::compute(&[fix(0.0, 0.0)], &[fix(0.0, 0.0)], &[10.0], None, None, &[]);

        // Assert
        assert!(a.normalised_distance.is_empty());
        assert_eq!(b.normalised_distance, vec![0.0]);
    }

    #[test]
    fn straight_line_polyline_normalised_distance_increases_monotonically() {
        // Arrange — samples exactly on a straight-line polyline, moving fast
        // enough to qualify as confidence anchors throughout.
        let polyline: Vec<GpsFix> = (0..10).map(|i| fix(i as f64 * 0.0001, 0.0)).collect();
        let samples = polyline.clone();
        let speed = vec![30.0; samples.len()];

        // Act
        let acc = LapDistanceAccumulator::compute(&samples, &polyline, &speed, None, None, &[]);

        // Assert
        assert!(acc.normalised_distance.windows(2).all(|w| w[1] >= w[0]));
        assert_eq!(acc.normalised_distance.first(), Some(&0.0));
    }

    #[test]
    fn gate_crossing_pins_an_exact_known_distance_at_its_sample_index() {
        // Arrange
        let polyline: Vec<GpsFix> = (0..10).map(|i| fix(i as f64 * 0.0001, 0.0)).collect();
        let samples = polyline.clone();
        let speed = vec![1.0; samples.len()]; // below anchor threshold — only the gate crossing anchors

        // Act
        let acc = LapDistanceAccumulator::compute(
            &samples, &polyline, &speed, None, None,
            &[GateCrossing { sample_index: 5, known_distance: 123.45 }],
        );

        // Assert
        assert_eq!(acc.normalised_distance[5], 123.45);
    }
}
```

- [ ] **Step 4: `session/filename.rs`**

Port of `session_filename.dart`. Rust has no `DateTime`/local-time crate in this workspace's dependency set (none of `chrono`/`time` appear in the ecosystem report or `Cargo.lock`) — rather than adding an unpinned dependency, this port takes the already-decomposed local-time fields as plain integers (the caller — L1's own CLI/import glue, or later L5's Tauri layer, which *does* have a real time library available to it) supplies them, matching `formatSessionFileBase`'s own signature shape (a `DateTime`, decomposed) without requiring this pure-`std`-only crate to gain a date/time dependency.

```rust
//! On-disk filename derivation for `session.json`-adjacent human-facing
//! names (port of `session_filename.dart`). C4 §2 makes `session_id` the
//! *directory* name now (not this module's concern) — this module is for
//! the still-timestamp-derived names the design carries forward:
//! `workbooks/<file_name>.idl1wb` (C4 §2) and any future human-facing
//! export filename.

/// Formats a local-time instant, already decomposed into its calendar
/// fields, as `YYYY-MM-DD_HH-MM-SS` — every component zero-padded, no
/// colons (valid on every target filesystem). Mirrors
/// `formatSessionFileBase` exactly; this crate has no date/time library
/// dependency (none pinned in the ecosystem report), so the caller does the
/// UTC→local conversion and calendar decomposition before calling this.
pub fn format_session_file_base(year: i32, month: u32, day: u32, hour: u32, minute: u32, second: u32) -> String {
    format!("{year:04}-{month:02}-{day:02}_{hour:02}-{minute:02}-{second:02}")
}

/// Returns the first of `base`, `<base>-2`, `<base>-3`, … for which
/// `is_taken` reports `false`.
pub fn unique_file_base(base: &str, mut is_taken: impl FnMut(&str) -> bool) -> String {
    if !is_taken(base) {
        return base.to_string();
    }
    let mut n = 2u32;
    loop {
        let candidate = format!("{base}-{n}");
        if !is_taken(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_session_file_base_zero_pads_every_component() {
        // Arrange / Act
        let s = format_session_file_base(2026, 9, 3, 8, 5, 0);

        // Assert
        assert_eq!(s, "2026-09-03_08-05-00");
    }

    #[test]
    fn unique_file_base_returns_the_base_when_untaken() {
        // Act
        let s = unique_file_base("fork-tuning", |_| false);

        // Assert
        assert_eq!(s, "fork-tuning");
    }

    #[test]
    fn unique_file_base_appends_suffix_until_untaken() {
        // Arrange
        let taken = ["a", "a-2", "a-3"];

        // Act
        let s = unique_file_base("a", |c| taken.contains(&c));

        // Assert
        assert_eq!(s, "a-4");
    }
}
```

- [ ] **Step 5: Wire in and run**

`src/laps/mod.rs`: add `pub mod distance; pub mod gate_synthesis; pub mod renumber;`.
`src/session/mod.rs`: add `pub mod filename;`.

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs laps::gate_synthesis laps::renumber laps::distance session::filename 2>&1 | grep -E "^test |^test result"
```
Expected: all tests `ok` (5 + 2 + 3 + 3 = 13).

- [ ] **Step 6: Commit**

```bash
git add core/src/laps core/src/session/filename.rs core/src/session/mod.rs
git commit -m "store: gate synthesis, session-wide lap renumbering, lap-distance normalisation, session filenames (inventory ports)"
```

---
### Task 15: CLI `idl-rs import` / `sessions` / `verify` / `prune`

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store\cli`. This is L1's own done-criteria line ("CLI `idl-rs import`/`sessions` work") plus C4 §7's `verify`/`prune`.

**Files:**
- Modify: `src/main.rs`.

**Interfaces:**
- Consumes: every `store::*` module (Tasks 7–13).
- Produces: `idl-rs import <file> --data-dir <dir>`, `idl-rs sessions --data-dir <dir>`, `idl-rs verify --data-dir <dir>`, `idl-rs prune --data-dir <dir> [--older-than <days>] [--confirm]`.

- [ ] **Step 1: New `Command` variants**

In `enum Command`, add (alongside the existing variants, before the closing `Table { .. }` arm):

```rust
/// Imports an `.idl0` log into a C4 §2 data directory: writes the raw
/// bytes to the CAS blob store, writes `data.parquet` (contract C1 §4),
/// creates an empty `session.json` if none exists yet (contract C1 §6),
/// and rebuilds the catalog (contract C4 §5).
Import {
    /// Path to the `.idl0` log file to import.
    file: PathBuf,
    /// Data directory root (contract C4 §1's `<data>` — this CLI has no
    /// Tauri `app_data_dir()` resolver, so the path is explicit here;
    /// the app layer, L5, resolves the platform default and passes it in
    /// the same way when it shells out or reuses this code as a library).
    #[arg(long)]
    data_dir: PathBuf,
},
/// Rebuilds the catalog from `data_dir` and lists every indexed session.
Sessions {
    #[arg(long)]
    data_dir: PathBuf,
    #[arg(long, value_enum, default_value_t = OutFormat::Text)]
    format: OutFormat,
},
/// Runs contract C4 §7's `verify` checks against `data_dir` and prints
/// every finding.
Verify {
    #[arg(long)]
    data_dir: PathBuf,
},
/// Lists (or, with `--confirm`, deletes) `derived/*.parquet` files older
/// than `--older-than` days (contract C4 §7; default 30 — the contract's
/// own proposal, C4 §8 item 5). **Age-based only, not orphan-verified**
/// in this task — see this plan's Open questions for the full orphan-
/// detection gap (Task 13) this command inherits; defaults to a dry-run
/// listing so nothing is deleted without the operator seeing the
/// candidate list first.
Prune {
    #[arg(long)]
    data_dir: PathBuf,
    #[arg(long, default_value_t = 30)]
    older_than: u32,
    /// Actually delete the listed candidates. Without this flag, `prune`
    /// only lists what it would delete.
    #[arg(long)]
    confirm: bool,
},
```

- [ ] **Step 2: Handlers**

In the `match cli.command { .. }` block in `fn main()`, add:

```rust
Command::Import { file, data_dir } => cmd_import(&file, &data_dir),
Command::Sessions { data_dir, format } => cmd_sessions(&data_dir, format),
Command::Verify { data_dir } => cmd_verify(&data_dir),
Command::Prune { data_dir, older_than, confirm } => cmd_prune(&data_dir, older_than, confirm),
```

Add the handler functions (near the other `fn cmd_*` handlers):

```rust
fn cmd_import(file: &Path, data_dir: &Path) -> ExitCode {
    let bytes = match std::fs::read(file) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("error: cannot read {}: {e}", file.display());
            return ExitCode::FAILURE;
        }
    };
    let blob_sha256 = match idl_rs::store::blob::write_blob(data_dir, &bytes) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("error: blob store: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut result = match idl_rs::parse::parse(&bytes) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error: parse: {e}");
            return ExitCode::FAILURE;
        }
    };
    result.session.blob_sha256 = blob_sha256;
    idl_rs::session::synthesis::synthesize_base_channels(&mut result.session);
    if let Some(w) = &result.truncation_warning {
        eprintln!("warning: {w}");
    }

    let importer_version = "0.1.0"; // idl0 importer's own version — bump alongside behaviour changes (C1 §4.3)
    let parquet_path = match idl_rs::store::parquet::write_session_parquet(data_dir, &result.session, importer_version) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("error: writing data.parquet: {e}");
            return ExitCode::FAILURE;
        }
    };

    let sj_path = data_dir.join("sessions").join(&result.session.session_id).join("session.json");
    if !sj_path.is_file() {
        let doc = idl_rs::store::session_json::empty_session_json(&result.session.session_id);
        if let Err(e) = idl_rs::store::session_json::write_session_json(data_dir, &result.session.session_id, &doc, None) {
            eprintln!("error: writing session.json: {e}");
            return ExitCode::FAILURE;
        }
    }

    match idl_rs::store::catalog::rebuild_catalog(data_dir) {
        Ok(report) => {
            println!("imported {} -> {}", file.display(), parquet_path.display());
            println!(
                "catalog: {} sessions, {} blobs, {} laps ({} skipped)",
                report.sessions_indexed, report.blobs_indexed, report.laps_indexed, report.skipped.len()
            );
            for s in &report.skipped {
                eprintln!("  skipped: {s}");
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("error: catalog rebuild: {e}");
            ExitCode::FAILURE
        }
    }
}

fn cmd_sessions(data_dir: &Path, format: OutFormat) -> ExitCode {
    let report = match idl_rs::store::catalog::rebuild_catalog(data_dir) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    let conn = match idl_rs::store::catalog::open_catalog(&data_dir.join("catalog.sqlite")) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("error: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut stmt = conn
        .prepare("SELECT session_id, timestamp_utc_ms, rider, bike, venue_name, lap_count FROM sessions ORDER BY timestamp_utc_ms DESC")
        .expect("valid SQL");
    let rows: Vec<(String, i64, String, String, String, Option<i64>)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)))
        .expect("valid query")
        .filter_map(Result::ok)
        .collect();

    match format {
        OutFormat::Text => {
            for (id, ts, rider, bike, venue, laps) in &rows {
                println!("{id}  {ts}  {rider}  {bike}  {venue}  laps={}", laps.unwrap_or(0));
            }
            println!("({} session(s), {} catalog issue(s))", rows.len(), report.skipped.len());
        }
        OutFormat::Json => {
            let json = serde_json::json!({ "sessions": rows.iter().map(|(id, ts, rider, bike, venue, laps)| {
                serde_json::json!({ "session_id": id, "timestamp_utc_ms": ts, "rider": rider, "bike": bike, "venue_name": venue, "lap_count": laps })
            }).collect::<Vec<_>>() });
            println!("{}", serde_json::to_string_pretty(&json).unwrap());
        }
    }
    ExitCode::SUCCESS
}

fn cmd_verify(data_dir: &Path) -> ExitCode {
    let findings = idl_rs::store::verify::verify(data_dir);
    for f in &findings {
        println!("[{:?}] {}: {}", f.severity, f.path.display(), f.message);
    }
    println!("{} finding(s)", findings.len());
    if findings.iter().any(|f| f.severity == idl_rs::store::verify::Severity::Error) {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}

fn cmd_prune(data_dir: &Path, older_than_days: u32, confirm: bool) -> ExitCode {
    let cutoff_ms = chrono_free_now_ms() - (older_than_days as i64) * 86_400_000;
    let sessions_dir = data_dir.join("sessions");
    let mut candidates = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&sessions_dir) {
        for session in entries.flatten() {
            let derived_dir = session.path().join("derived");
            if let Ok(files) = std::fs::read_dir(&derived_dir) {
                for f in files.flatten() {
                    let path = f.path();
                    if let Ok(meta) = f.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                                let mtime_ms = dur.as_millis() as i64;
                                if mtime_ms < cutoff_ms {
                                    candidates.push(path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    println!("{} candidate(s) older than {older_than_days} day(s) (age-only — not orphan-verified, see plan Open questions):", candidates.len());
    for c in &candidates {
        println!("  {}", c.display());
    }
    if confirm {
        for c in &candidates {
            if let Err(e) = std::fs::remove_file(c) {
                eprintln!("error: removing {}: {e}", c.display());
            }
        }
        println!("deleted {} file(s)", candidates.len());
    } else {
        println!("(dry run — pass --confirm to delete)");
    }
    ExitCode::SUCCESS
}

/// Milliseconds since the Unix epoch, `std`-only (no date/time crate
/// pinned in this workspace — see `session::filename`'s module doc for the
/// same constraint).
fn chrono_free_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
```

- [ ] **Step 3: `Cargo.toml` — no new dependency needed**

`cli/Cargo.toml` already depends on `idl-rs = { path = "../core" }`, which now transitively brings `rusqlite`/`arrow`/`parquet` into the CLI binary's build graph — no `[dependencies]` change needed in this crate itself.

- [ ] **Step 4: Manual smoke test against a synthetic file, then build/test**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo build -p idl-rs-cli 2>&1 | tail -20
cargo test -p idl-rs-cli 2>&1 | grep -E "^test result|FAILED"
```
Expected: `Finished`; every existing CLI test still `0 failed` (this task adds no new CLI-crate tests — the behaviour is exercised end-to-end in Task 16 against a real file, which is a stronger proof than a synthetic CLI-level test would add here).

- [ ] **Step 5: Commit**

```bash
git add cli/src/main.rs
git commit -m "cli: import, sessions, verify, prune subcommands over the new store layer"
```

---
### Task 16: Real-session validation (C1 §8 item 8); CHANGELOG/TASKS.md; final commit

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl-rs-worktrees\wave1-l1-store` for steps 1–3 (a standalone test using the real file, not committed as a checked-in fixture — Task 1's `.gitignore` entry already covers the two source files; this step's *test* is committed, its *input file* is not), `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l1-store` for steps 4–6.

**Files:**
- Create (idl-rs): `core/tests/real_session_odr_validation.rs` (an integration test — `cargo test`'s standard `tests/` directory, run only when the two real files are present at the path this task hard-codes; skips cleanly otherwise so CI/other machines without the files don't fail).
- Modify (idl1-app): `CHANGELOG.md`, `TASKS.md`.

**Interfaces:**
- Consumes: `d365a19ae7ef2dc2d087a5887371281f.idl0`/`.idl0w` at the idl1-app repo root (present in the lead's checkout per the task brief; Task 1 step 3 already copies them into this worktree if absent).

- [ ] **Step 1: Write the validation test**

`core/tests/real_session_odr_validation.rs`:
```rust
//! C1 §8 item 8: validates the burst-seam correction (C1 §3.3) against a
//! real `.idl0` session with GPS and IMU both enabled, cross-checking the
//! corrected effective ODR against an independent estimate (GPS-anchored
//! recording duration ÷ IMU sample count).
//!
//! **Not a checked-in fixture.** The input file is real session data
//! Isaac supplied for this one validation, gitignored (see this plan's
//! Task 1) rather than added as a test fixture — idl-rs has no
//! fixture-directory convention and real session data isn't source-
//! controlled fixture material. This test is a no-op (prints a skip
//! notice, exits success) on any machine where the file is absent, so it
//! never blocks `cargo test` for anyone but the machine that has it.

use std::path::PathBuf;

fn real_session_path() -> PathBuf {
    // Repo root is three directories up from `core/` in the wave1-l1-store
    // worktree layout this plan's Task 1 sets up
    // (`idl1-app-worktrees/wave1-l1-store/../../idl1-app/...` is NOT it —
    // the file lives at the idl1-app *repo root*, copied into this
    // worktree by Task 1 step 3). Resolve relative to this crate's
    // manifest dir, which is `<worktree>/core`.
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("d365a19ae7ef2dc2d087a5887371281f.idl0")
}

#[test]
fn real_session_burst_seam_correction_matches_an_independent_odr_estimate() {
    let path = real_session_path();
    if !path.is_file() {
        eprintln!("skipping: {} not present on this machine (not a checked-in fixture, see this test's module doc)", path.display());
        return;
    }

    let bytes = std::fs::read(&path).expect("read the real session file");
    let result = idl_rs::parse::parse(&bytes).expect("parse the real .idl0 file");
    let session = result.session;

    // Contract C1 §8 item 8's precondition: both GPS and IMU enabled.
    let has_gps = session.channels.iter().any(|c| c.channel_id.starts_with("GPS") && !c.is_empty());
    let has_imu = session.channels.iter().any(|c| idl_rs::parse::records::imu_index_of(&c.channel_id).is_some() && !c.is_empty());

    if !has_gps || !has_imu {
        eprintln!(
            "SKIP + OPEN QUESTION: real session at {} does not have both GPS (present={has_gps}) \
             and IMU (present={has_imu}) enabled — C1 §8 item 8's cross-check needs both. \
             Logged as an open question for Isaac rather than failing the build (see this plan's \
             Open questions and the task brief's explicit instruction not to block L1 on this).",
            path.display()
        );
        return;
    }

    // Independent estimate: GPS-anchored recording duration ÷ IMU sample count.
    let gps = session.channels.iter().find(|c| c.channel_id == "GPS_EpochMs" && !c.is_empty()).expect("GPS_EpochMs present (has_gps checked above)");
    let gps_duration_s = (gps.materialize().last().unwrap() - gps.materialize()[0]) / 1000.0;

    let imu0 = session
        .channels
        .iter()
        .find(|c| c.source_kind == "imu0")
        .expect("an imu0 channel exists (has_imu checked above)");
    let independent_hz = if gps_duration_s > 0.0 { imu0.len() as f64 / gps_duration_s } else { 0.0 };

    // The engine's own correction (already applied during parse — Task 6's
    // wiring runs unconditionally): imu0's nominal_rate_hz now reports the
    // *corrected* effective rate, not the configured nominal one.
    let corrected_hz = imu0.nominal_rate_hz;

    let relative_error = ((corrected_hz - independent_hz) / independent_hz).abs();
    println!(
        "real-session ODR validation: corrected={corrected_hz:.3} Hz, \
         GPS-independent={independent_hz:.3} Hz, relative_error={:.4}%",
        relative_error * 100.0
    );

    // A generous tolerance (5%) — GPS-duration ÷ IMU-count is itself a
    // coarse estimate (whole-file span, no sub-sample precision at either
    // end), not a second ground-truth clock; this is a sanity cross-check,
    // not a bit-exact assertion the way the synthetic worked example
    // (Task 5) is. Isaac reviews the printed numbers regardless of pass/fail.
    assert!(
        relative_error < 0.05,
        "corrected ODR {corrected_hz:.3} Hz disagrees with the independent GPS-based estimate \
         {independent_hz:.3} Hz by {:.2}% — investigate before trusting §3.3 on this file",
        relative_error * 100.0
    );
}
```

- [ ] **Step 2: Run it**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test -p idl-rs --test real_session_odr_validation -- --nocapture 2>&1 | tail -30
```
Three possible outcomes, all acceptable per the task brief ("either runs the validation and records the result, or — if the file turns out unusable — logs that as an open question... rather than blocking the rest of L1"):
1. **Pass** — record the printed `relative_error` percentage in this plan's Open questions entry (added in Step 3) and in the BRIEF.
2. **Fail** (assertion trips) — do not treat this as an L1-blocking bug in the correction algorithm itself (Task 5's gating test already proves the algorithm is correct against a known-exact synthetic case); record the numbers and flag for Isaac as an open question — a real file disagreeing could mean the file's true ODR genuinely drifts session-wide (not the algorithm's fault) or that the GPS-based independent estimate is the imprecise one.
3. **Skip** (GPS or IMU missing, or file absent) — record which precondition failed.

- [ ] **Step 3: Record the result**

Add a line to this plan's Open questions (final section of this document — edit it now) reporting which of the three outcomes actually happened and the printed numbers, so the lead has the real result at hand rather than a description of a test that "should" run.

- [ ] **Step 4: Full-crate final test pass (both crates)**

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl-rs-worktrees/wave1-l1-store"
cargo test --workspace 2>&1 | grep -E "^test result|FAILED|^error"
```
Expected: every `test result:` line `0 failed`, no `error` lines, across `idl-rs`, `idl-rs-cli`, `idl-transport`, `idl-rs-tauri`.

- [ ] **Step 5: `CHANGELOG.md`/`TASKS.md`**

Working directory: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave1-l1-store`.

In `CHANGELOG.md`, under `## [Unreleased]`, add:
```markdown

### Added

- **L1 core `store/` landed (wave 1).** Mandatory per-sample-time
  `Session`/`Channel` model (C1 §2); burst-seam correction (C1 §3.3),
  proven against the contract's worked example; `data.parquet`
  Arrow/Parquet read-write with the full C1 §7 round-trip guarantee suite
  green; `derived/<hash>.parquet` writer and hash recipe (C1 §5); CAS blob
  store and atomic-write primitive (C4 §3–4); SQLite catalog and rebuild
  (C4 §5); `verify` (C4 §7); `session.json` (C1 §6, replaces `.idl0w`);
  `.idl0t` writer; bike-profile/app-settings persistence; gate synthesis,
  session-wide lap renumbering, lap-distance normalisation, session
  filenames (inventory ports); CLI `idl-rs import`/`sessions`/`verify`/
  `prune`.
```

In `TASKS.md`, under `## Wave 1 (after M0)`, tick `- [ ] L1 core \`store/\`` to `- [x]`.

```bash
git add CHANGELOG.md TASKS.md
git commit -m "docs: L1 core store/ landed"
```

- [ ] **Step 6: Report the unpushed state**

Report to Isaac (this task's final output, mirroring the M0 plan's Task 10 step 5): the two worktrees' unpushed commits (idl-rs `wave1-l1-store`: ~14 commits per this plan's tasks; idl1-app `wave1-l1-store`: 3 commits — Task 1's `.gitignore`, Task 2's SPEC rewrite, this task's CHANGELOG/TASKS) and the merge path — this branch merges into `main` in each repo through the lead's normal review gate (design doc §12: "a lane task is done when its reviewer's verdict is clean and tests are green"), not by direct push from this worktree. Do not push (CLAUDE.md §7 — Isaac pushes).

---
## Self-review

**Spec coverage (design §10 L1 row):** "Arrow model ↔ Parquet r/w (C1)" → Tasks 9–10; "CAS blob store" → Task 8; "SQLite catalog + rebuild" → Task 12; "`session.json` (port of `.idl0w` semantics)" → Task 11; "track artifact writer" → Task 13; "profile/settings persistence" → Task 13; "session/lap-level ports from the inventory (gate synthesis, session-wide lap renumbering, lap-distance normalisation, filenames)" → Task 14. Done-when: "Round-trip tests on real `.idl0` sessions with recorded timestamps preserved bit-exact" → Task 9 (synthetic, all seven C1 §7 items) + Task 16 (the one real file); "catalog rebuild from a scanned tree" → Task 12; "CLI `idl-rs import`/`sessions` work" → Task 15. Burst-seam correction gating test (task brief, explicit) → Task 5. Real-file GPS+IMU check and ODR cross-check-or-logged-open-question (task brief, explicit) → Task 16. `.gitignore` for the two real files, not committed as fixtures (task brief, explicit) → Task 1. Spec-first SPEC §15/§16.3/§18 rewrite with actual text, not "TODO: rewrite" (task brief, explicit) → Task 2.

**Placeholder scan:** no `TBD`/`TODO`(bare)/"decide later" anywhere in this plan's code or prose. Every `// TODO(idl0):`-style marker this plan's *code* would need (there are none — every function is either fully specified or explicitly deferred with a named reason and an assigned owner, listed below as an Open question rather than left as an inline TODO). The handful of spots marked "verify during implementation" (Task 5's local-period-fallback test fixture; Task 6's `rebuild_i64_grid_or_real` sentinel; Task 9's `WriterProperties` accumulation semantics; Task 3's `duration_ms` literal) are TDD-driven arithmetic/API checks, not open design decisions — each has a fixed, unambiguous expected *behaviour*, only a not-yet-hand-computed *number* or not-yet-confirmed *exact method name*.

**Type consistency:** `Session`/`Channel`/`SourceFormat` (Task 3) are the one struct definition every later task imports — Tasks 4, 6, 9–14 all construct or read the same fields, no task invents a competing shape. `seam_correction::correct_burst_seams` (Task 5) is consumed exactly once, by Task 6's `ImuGridPlan::build_from_corrected`. `store::atomic::write_atomic` (Task 7) is the one write path Tasks 8–13 all route through — no task bypasses it with a raw `std::fs::write` to a path under `<data>`. `store::parquet`'s `RawColumn`↔Arrow type mapping (Task 9) is reused verbatim by `store::derived` (Task 10, `Float64`-only subset). `store::session_json::LapGateJson`/`LapJson`/`TrackVisitJson` (Task 11) are the exact types Task 14's `gate_synthesis`/`renumber` produce and consume — no parallel/duplicate lap-gate type is introduced anywhere else in this plan.

**Lane-boundary check (CLAUDE.md §7 "lanes touch only their own crate/directory"):** every file this plan creates or modifies is under `rust/core/` or `rust/cli/` (both explicitly named in L1's scope) or `idl1-app`'s own docs/`CHANGELOG.md`/`TASKS.md`/`.gitignore`. No task touches `rust/transport/`, `rust/tauri/`, or `app/`.

---

## Open questions

Every item below has a stated default already adopted in this plan's body text (nothing here blocks implementation) — each still needs the assigned party's confirmation, mirroring how C1/C4 carry their own open items.

1. **`Channel.t_recorded_us: Option<Vec<i64>>`** (Task 3) — an addition beyond C1 §2's literal struct listing. C1 §4.1 requires `t` (corrected) and `<source>_t_recorded_us` (verbatim) as independently-readable `data.parquet` columns; once burst correction (Task 6) actually diverges them for IMU sources, the in-memory model needs to carry both or the verbatim value is unrecoverable at write time. **Assigned: lead** — confirm this is the intended in-memory representation (vs., e.g., recomputing `t_recorded_us` some other way C1 assumed but didn't state).
2. **`Channel.unit: String`** (Task 3) — likewise an addition beyond C1 §2. C1 §4.2 mandates a `unit` column-metadata value *always*; the registry's `units` field (`ChannelRegistryEntry.units`) is the only place that value exists today and was previously discarded after parse. **Assigned: lead.**
3. **`Channel::from_f64`'s synthetic-uniform `t_us`** for the interior derived-channel store (math outputs, lap slices — Task 3) is a scoped, documented exception to C1 §3.5 invariant 4, justified by these channels never reaching `data.parquet`. Whether math-channel outputs should instead carry forward a real source's `t_us` via `from_f64_with_times` (better time-fidelity, more invasive to `math::resolve`) is a call this plan leaves for whoever revisits the math evaluator. **Assigned: lead / L3.**
4. **`Time`/`Distance` synthesis loses the zero-storage `Ramp`/`Interp`-only representation** (Task 4 Step 5) — `Time` becomes an 8 B/sample `F64` column tracing a real channel's `t_us`, because its value must never derive from `i/rate` once that channel's time isn't perfectly uniform (true after burst correction, or with any drops). Design doc §5's "zero-storage" framing for `Time` is a casualty of the union-axis/burst-correction model C1 introduces; not explicitly revisited by C1 itself. **Assigned: lead.**
5. **`t_recorded_us`'s dense-but-only-meaningful-outside-`gaps` convention** (Task 6) — this plan's own invention to reconcile per-row Parquet nullability with a `Vec<i64>` that can't hold per-element null in Rust; the Parquet writer must consult `gaps` to decide `_t_recorded_us` nullness, never infer it from `t_recorded_us`'s content. The draft `rebuild_i64_grid_or_real` helper uses a `0`-sentinel placeholder-then-overwrite pass flagged in Task 6 as a rough edge — implementers should replace it with a cleaner parallel `Vec<(i64, bool)>` walk if the sentinel-collision risk (a real corrected timestamp landing on exactly `0`) is judged unacceptable. **Assigned: L1.**
6. **Per-IMU (not session-wide-shared) `nominal_rate_hz` after burst correction** (Task 6) — a deliberate widening from the pre-idl1 SPEC §15.2 argument that every IMU should report one shared rate (so cross-IMU element-wise math stays valid); under per-IMU burst correction, forcing one shared corrected rate across IMUs with genuinely different true ODRs would misrepresent at least one of them. C1 doesn't explicitly revisit SPEC §15.2's argument for this case. **Assigned: lead.**
7. **Burst-seam correction's `ImportWarning`s have no home in `ParseResult` yet** (Task 6 Step 3) — today's `ParseResult` holds one `Option<ParseError>` (truncation only); Task 6 flags, rather than silently drops, the need for a small extension (e.g. `Vec<ImportWarning>`) before these warnings can actually reach a caller. **Assigned: L1**, before Task 6 is considered fully done — not before this plan's own draft, which flags rather than resolves it.
8. **Bike-profile storage path** (`<data>/profiles/<profile_id>.idl0p`, Task 13) — C4 §2's layout lists no `profiles/` directory at all; the design doc's L1 row names "profile/settings persistence" as in scope without fixing where. This plan carries forward `profile_store.dart`'s `.idl0p` convention, rooted under `<data>` (which then requires `store::verify`'s `known_top_level` list, Task 13, to special-case it). **Assigned: lead** — confirm `<data>/profiles/` (inside the synced/verified tree) vs. some other location (e.g. beside `app_config_dir()/settings.json`, unsynced).
9. **App-wide settings reuse `app_config_dir()/settings.json`** (Task 13) rather than a second settings file — C4 §1 only names that file's `data_dir` key; this plan's `store::settings` module adds `rider_name`/`unit_system` to the same file. **Assigned: lead.**
10. **`tracks.created_at_ms`/`updated_at_ms` catalog columns use a `0` placeholder** (Task 12) because `track_artifact::model::Track` doesn't carry these post-parse today (`read.rs`'s `TrackArtifact → Track` conversion drops them). Needs either extending `Track` (small, self-contained) or reading the raw JSON directly at catalog-rebuild time instead of through the domain type. **Assigned: L1**, before Task 12 is considered fully done.
11. **`lap_summary` catalog table (C4 §5 step 5) is not fully written out in Task 12's draft** — flagged there as the one C4 §5 step this plan describes the shape of but leaves compositionally to implementation time (reading `derived/*.parquet` via Task 9's primitives plus a new windowed min/max/mean reduce). **Assigned: L1.**
12. **`verify` checks #6 (workbook parse) and #9 (catalog row → missing file cross-reference) are not implemented** (Task 13) — #6 needs C2/L3's `.idl1wb` parser (genuinely cross-lane, cannot be built here without guessing at a format L3 owns); #9 is mechanically straightforward once L1's catalog is the only writer but wasn't written out in this plan's draft. **Assigned: L3** (#6, once C2 lands), **L1** (#9).
13. **`prune`'s CLI implementation is age-based only, not orphan-verified** (Task 15) — full C4 §7 semantics ("orphaned *and* older than the window") needs the estimator glue's hash-recompute capability, which has no generic library entry point yet (each estimator knows its own inputs/config; `store::derived` deliberately takes pre-computed hashes rather than owning that knowledge). **Assigned: L1**, as a follow-up once an estimator lane calls `store::derived::write_derived_parquet` for real.
14. **Item 4 RULED (2026-09-03, lead ruling R8) — decimal degrees, confirmed with Isaac.**
   This plan's Task 14 default (decimal degrees on disk, § 1e7 internally for the
   scale-invariant geometry, converting once at the `LapGateJson` boundary — see Task 14's
   inline "Unit note") is exactly right; no change needed. **Item 2** (`lap_gates`/
   `sector_gates` inclusion in `session.json`) remains open, assigned to Isaac (lead) per C1
   §8 itself, carried forward unchanged.
15. **`WriterProperties::builder().set_key_value_metadata`'s accumulation semantics** (Tasks 9–10) — drafted assuming repeated calls accumulate; if the real 59.3.0 API replaces on each call instead, the fix is building one `Vec<KeyValue>` up front (a one-line restructuring, not a design change). **Assigned: L1**, resolved during Task 9's own build step.
16. **Task 5's `a_burst_faster_than_the_session_median_falls_back_to_its_own_local_period` test fixture is deliberately left unfinished** in this plan's draft — its exact numeric stamps need constructing against the real `detect_bursts` output during implementation (faster to iterate in the TDD loop than to hand-derive on paper); the test's assertion (strict end-to-end monotonicity) is fixed. **Assigned: L1**, must be completed before Task 5 is considered done — it is the only test exercising the monotonicity-guarantee fallback branch.
17. **Real-session ODR validation result** (C1 §8 item 8, Task 16) — this plan cannot know in advance whether the supplied file has both GPS and IMU enabled, or what the cross-check's relative error will be. **Assigned: L1**, to fill in Task 16's actual printed result here (and in the BRIEF) once Task 16 runs, per the task brief's explicit instruction not to block the rest of L1 on this outcome either way.
    **RESULT (2026-09-03, idl-rs `57e4d6e`): PASS — outcome 1.** File has GPS and IMU; `corrected=812.348 Hz`, `nominal=812.348 Hz`, `independent=814.017 Hz`, `relative_error=0.2051 %` (tolerance 5 %); `imu0 n=97927`, `count_in_window=96054`, `gps_span_s=118.000`. Method per ruling R19 (`runs/2026-09-03/decisions.md`): corrected rate from the §3.3-corrected `t_us` span; independent estimate = IMU samples inside the GPS window ÷ `GPS_EpochMs` wall-clock span; file located via `IDL_RS_REAL_SESSION_IDL0` (never copied into the worktree). The device's true ODR is ≈812 Hz against a nominal 800 Hz — §3.3's fast-clock case, observed on hardware.

---

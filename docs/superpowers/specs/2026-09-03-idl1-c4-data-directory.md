# C4 — Data directory

**Status:** signed (lead) 2026-09-02 · **Date:** 2026-09-03 · **Owner:** lead

Sources: `2026-09-02-idl1-rewrite-design.md` §3, §5, §7, D6, D7, D10, §9 row C4, §16;
`2026-09-02-idl1-inventory.md` (`session_index.dart`, `track_index.dart`,
`workbook_index.dart`, `workspace.dart`, `profile_store.dart`,
`sessions_paths.dart`, `session_filename.dart`); `IDL0_SPEC.md` §15, §16;
`2026-09-02-idl1-m0-ecosystem.md` (`rusqlite` 0.40.2, `notify` 8.2.0, `tauri` 2.11.5).

---

## 1. Root

**`<data>` is a subdirectory, not the platform identifier directory itself:**

```
<data> = app_data_dir()/data
```

resolved once at startup via Tauri v2's `app_data_dir` path resolver (the
built-in path API — no extra crate) and cached for the process lifetime.
One root per OS user account; the app does not support multiple concurrent
data roots.

The settings bootstrap file (below) lives at `app_config_dir()/settings.json`
— Tauri's separate per-user *config* path resolver. On **Windows and
macOS, Tauri v2 resolves `app_config_dir()` and `app_data_dir()` to the
same parent directory** (Roaming AppData; `~/Library/Application
Support/<bundle-id>` — not `Preferences`, corrected from an earlier draft
of this contract); only **Linux** genuinely separates them
(`$XDG_CONFIG_HOME` vs `$XDG_DATA_HOME`). This coincidence is harmless
precisely because `<data>` is defined as the `data/` subdirectory beside
`settings.json`, never the identifier directory itself: `settings.json`
sits one level up from everything in §2's tree, on every platform,
regardless of whether its parent directory happens to equal
`app_data_dir()`'s. Consequently `settings.json` is outside `<data>` on
every platform — sync (§6) and `verify`/rebuild (§5, §7) only ever walk
`<data>` (`app_data_dir()/data`), so `settings.json` is structurally
excluded from both, not excluded by convention alone.

Per-platform concrete paths (bundle id is an L5 scaffold decision, not
fixed by this contract — shown as `<bundle-id>`):

| Platform | `app_data_dir()` | `<data>` (`app_data_dir()/data`) | `app_config_dir()` → `settings.json`'s parent |
|---|---|---|---|
| Windows | `%APPDATA%\<bundle-id>` (`FOLDERID_RoamingAppData`, e.g. `C:\Users\<user>\AppData\Roaming\<bundle-id>`) | `%APPDATA%\<bundle-id>\data` | **same directory as `app_data_dir()`** — `%APPDATA%\<bundle-id>` |
| macOS | `~/Library/Application Support/<bundle-id>` | `~/Library/Application Support/<bundle-id>/data` | **same directory as `app_data_dir()`** — `~/Library/Application Support/<bundle-id>` |
| Linux | `$XDG_DATA_HOME/<bundle-id>`, falling back to `~/.local/share/<bundle-id>` | `.../<bundle-id>/data` | **genuinely separate** — `$XDG_CONFIG_HOME/<bundle-id>`, falling back to `~/.config/<bundle-id>` |
| Android | app-private internal storage (`Context.getFilesDir()` equivalent), exposed to Rust as a real path by the Tauri mobile runtime — not user-browsable outside the app | `.../data` | Android has no OS-level data/config split; expected to land in the same app-private storage area as `app_data_dir()` — not independently verified, no coincidence claim relied on here since `<data>` is a subdirectory either way |
| iOS | `Library/Application Support` inside the app's sandboxed container — already app-scoped, no extra bundle-id subdirectory | `.../Application Support/data` | expected `Library/Preferences` (or the same container area) inside the same sandboxed container — exact Tauri v2 mapping unconfirmed, same open item as the bundle id (§8) |

**Override in Settings.** The Settings tab may point `<data>` at any writable
directory. Because `catalog.sqlite` (and everything else) lives *inside*
`<data>`, the override itself cannot live inside `<data>` — it has to be
readable before `<data>` is known. It is stored in the bootstrap file
described above, at:

```
app_config_dir()/settings.json
```

Read with plain `std::fs`, no crate beyond Tauri's bundled path resolver.
Shape:

```json
{ "data_dir": "D:\\race-data" }
```

`data_dir` absent or the key missing → use the platform default from the
table above. Changing it in Settings does **not** move existing files; the
app opens (or creates) the tree at the new path and the old tree is left
untouched (surfaced to the user as "old data left at `<old path>`").

**Added post-sign (2026-09-03, lead ruling R15, wave-1 L1):** the same file
also carries the app-wide UI settings that core's `store::settings`
persists (port of `app_settings.dart`) — `rider_name` (string, `""` = not
set) and `unit_system` (`"imperial"` | `"metric"`, default `"imperial"`) —
as optional sibling keys of `data_dir`:

```json
{ "data_dir": "D:\\race-data", "rider_name": "", "unit_system": "imperial" }
```

Every reader of this file must ignore unknown keys and treat any missing key
as its default (L5's `paths.rs` already does: it reads `data_dir` only and
never writes the file). Only `store::settings::save` writes it, as a
whole-document replace through the §4 primitive, staged in the file's own
directory rather than `<data>/tmp` — there is no `tmp/` beside it, and on
Linux `app_config_dir()` may be a different filesystem from `<data>`, where
a cross-device rename would fail.

## 2. Layout

Everything below is rooted at `<data>` as defined in §1
(`app_data_dir()/data`) — a subdirectory, not `app_data_dir()` itself. The
settings bootstrap file (`app_config_dir()/settings.json`, §1) is never part
of this tree, on any platform.

```
<data>/
  blobs/sha256/<2 hex>/<62 hex>                    raw source bytes, immutable, no extension
  sessions/<session_id>/
    session.json                                   metadata, laps, track visits, flags (C1)
    data.parquet                                    canonical channels, f(blob, importer version)
    derived/<64 hex>.parquet                        materialised channels, f(inputs, config, engine version)
  workbooks/<file_name>.idl1wb
  tracks/<track_id>.idl0t
  profiles/<profile_id>.idl0p                       rider/bike profile snapshots (port of profile_store.dart)
  catalog.sqlite                                    + catalog.sqlite-wal, catalog.sqlite-shm (WAL sidecars)
  tmp/                                               atomic-write staging (§4); tmp/quarantine/ for repair (§7)
```

**Added post-sign (2026-09-03, lead ruling R6, wave-1 L1):** `profiles/` was
missing from this layout even though design §10's L1 row names "profile/
settings persistence" in scope with no other location given. Rooted inside
`<data>` (not beside the `app_config_dir()/settings.json` bootstrap file)
deliberately — a rider's bike-profile data is exactly the kind of
cross-device state LAN sync (§6) exists for, unlike the bootstrap file's
single `data_dir` override, which is inherently per-machine. `profile_id` is
an opaque string (UUID or the profile's stable slug — L1's own call, not
fixed here); the file is written via the §4 atomic-write primitive like every
other `<data>`-rooted file.

Path patterns, fixed:

- **Blob:** `blobs/sha256/<first 2 hex of the digest>/<remaining 62 hex>` — the
  full 64-hex-char SHA-256 digest of the raw source file's bytes, split 2+62.
  No file extension; the source format is recorded in the session that
  references the blob (`source_format`, C1), never inferred from the blob path.
- **Session directory:** `sessions/<session_id>/`, `session_id` per §3.
  - `session.json` — always present once a session exists.
  - `data.parquet` — present once import has run; a session directory with
    `session.json` but no `data.parquet` is a valid transient state (import
    in progress or interrupted — §7 does not treat this as corruption, only
    flags it).
  - `derived/<hash>.parquet` — `hash` is the full 64-hex-char SHA-256 of
    `(input column hashes ‖ config ‖ engine version)` (design §5). Zero or
    more per session; the directory does not exist for a session with no
    materialised channels yet.
- **Workbook:** `workbooks/<file_name>.idl1wb`. `file_name` is the
  user-facing name, filesystem-sanitised; it is a display convenience, not
  identity (§6) — the workbook's stable id lives in its front matter (C2).
  A `file_name` collision on create follows the existing `session_filename.dart`
  convention (SPEC §15.1): append `-2`, `-3`, … .
- **Track:** `tracks/<track_id>.idl0t`, `track_id` a UUID (SPEC §16.2,
  §16.3 — unchanged from idl0, canonical 36-char lowercase-with-dashes form).
- **Catalog:** `catalog.sqlite` at the root, plus its WAL sidecars
  (`catalog.sqlite-wal`, `catalog.sqlite-shm`) when WAL mode is active (§5).
  Sidecars are part of "the catalog" for every rule in this contract
  (verify, sync-exclusion) even though not individually named elsewhere.
- **Staging:** `tmp/` at the root. `tmp/<uuid>` for in-flight atomic writes
  (§4); `tmp/catalog-rebuild-<uuid>.sqlite(-wal|-shm)` for catalog rebuild
  staging (§5); `tmp/quarantine/<uuid>-<original-name>` for files pulled out
  by `verify`/repair (§7). Nothing under `tmp/` is ever referenced by the
  catalog or read as a source of truth.

## 3. Identity

**Blob hash.** SHA-256 over the raw source file's bytes exactly as received
(before any parsing) — 64 lowercase hex characters, `[0-9a-f]{64}`. This is
also the blob's storage path (§2) and content-integrity check (§7 #1).

**`session_id`** — allowed character set is lowercase hex, `[0-9a-f]+`,
16–64 characters (see collision rule below for why length varies):

- **`.idl0` sources:** the device's 16-byte Session UUID from the binary
  header (SPEC §5 "Session UUID | u8[16]"), converted to 32 lowercase hex
  characters, no dashes — identical to today's `Session.sessionId`
  (SPEC §15.1, §5 line 212, §6 `/files` `session_id` field).
- **FIT / GPX / CSV sources:** the first 16 hex characters of the blob's
  SHA-256 (per the decision already made). Because this is a deterministic
  function of the blob, re-importing the same file is idempotent — the
  same `session_id` results and `sessions/<id>/` already exists, so import
  is a no-op (consistent with "sync sources; outputs only when
  content-addressed," design §3).
- **Collision rule (non-device sources only):** if a newly-computed 16-hex
  prefix collides with an existing `session_id` in the catalog or on the
  tree, and the full 64-hex blob hashes differ (a real collision, not a
  re-import of the same file), extend the prefix by 2 more hex characters
  (18, then 20, …) until it no longer collides, up to the full 64 characters.
  This is git's abbreviated-hash disambiguation applied to `session_id`;
  it is why `session_id` is not fixed-length. A collision at 16 hex
  characters is a ~2⁻⁶⁴ event and is not expected to occur in practice, but
  the rule is defined rather than left as an unhandled panic.
- **`.idl0` sources never extend** — the device UUID is always the full
  32 hex characters; the extension rule applies only to the blob-hash-prefix
  case.

**Track id:** unchanged from idl0 (SPEC §16.2) — a UUID assigned at
`Track.create()`, canonical 36-char form. Not derived from content; a Track
is user-authored, not content-addressed.

**Workbook id:** fixed by C2 (front matter, stable across renames). C4 only
uses it as the sync identity key (§6); it is opaque here.

## 4. Atomic writes

Applies to every write under `<data>` performed by the app itself
(`session.json`, `data.parquet`, `derived/*.parquet`, `workbooks/*.idl1wb`,
`tracks/*.idl0t`, and the catalog rebuild's file swap, §5). Blobs are
written once and never rewritten (content-addressed; a second write to the
same hash is a verified no-op, skip rather than overwrite).

**Sequence, per write of bytes `B` to target path `P`:**

1. Generate `uuid` (v4). Write `B` to `tmp/<uuid>` via `std::fs::write` (or
   streamed writes for large files, e.g. `data.parquet`).
2. `fsync` the `tmp/<uuid>` file descriptor before proceeding — bytes are
   durable on disk before anything references them by their final name.
3. Compute `sha256(B)`. Insert `(P, sha256(B))` into the in-memory
   **expected-hash set** *before* the rename (step 4) — this ordering is
   load-bearing: if the rename happened first, the `notify` event could
   fire and be checked against the set before the entry exists, and the
   app would misclassify its own write as external.
4. **Optimistic concurrency check.** If `P` already exists, re-read its
   current bytes' hash and compare to the hash `B` was derived from (the
   "based-on" hash the caller recorded when it started building `B`,
   e.g. the workbook content last read before editing). If they differ,
   the file changed under us since we started — this is exactly the race
   named below. Abort the rename, discard `tmp/<uuid>`, and re-run the
   write from the current on-disk state (see "the race" below for what
   "re-run" means per file class). Bound retries at 3 attempts before
   surfacing an error rather than looping forever.
5. Rename `tmp/<uuid>` → `P` (`std::fs::rename`; atomic within one
   filesystem — `tmp/` and every target directory are subdirectories of the
   same `<data>` root, guaranteeing one filesystem). On Windows, if `P` is
   held open by another process without `FILE_SHARE_DELETE` (e.g. an editor
   without shared-delete semantics), rename can fail transiently with a
   sharing violation; retry the rename itself (not the whole write) up to
   5 times with a short backoff (~50 ms) before surfacing an error — this
   is distinct from, and happens before, the concurrency check in step 4.
6. On POSIX, `fsync` the parent directory after the rename (durability of
   the directory-entry update). Windows NTFS commits the rename as a single
   MFT transaction and does not need — or expose — an equivalent directory
   fsync; this step is POSIX-only.

Writes to a given path `P` are serialized by the app itself (one write task
per path; the app never issues two concurrent writes to the same `P`), so
the expected-hash set holds at most one pending entry per path at a time.
Entries expire from the set after a 5-second TTL (well beyond the ~100 ms
notify debounce) so a stale entry can never misclassify a later, genuinely
external write to the same path.

**The race this must survive: an external edit arriving between write and
rename.** Concretely — the app reads `P` (hash `H0`), builds new bytes `B`
based on `H0`, writes `B` to `tmp/<uuid>`; meanwhile an external editor
(`vim`, an agent) writes directly to `P`, replacing `H0` with `H_ext`;
the app's rename would then silently clobber `H_ext` with `B`, losing the
external edit with no trace. Step 4's optimistic check catches this: the
app compares `P`'s hash at rename time to `H0`; a mismatch means `H_ext` is
now there instead of `H0`, so the app aborts the rename and re-runs. Per
file class, "re-run" means:
- **Workbooks:** re-run through the same per-cell merge (design §7) used by
  LAN sync, treating `H_ext` as a peer edit against the last-known-local
  base — a local self-write race and a sync conflict are the same code
  path (one merge function, two callers).
- **Everything else** (`session.json`, `data.parquet`, `derived/*.parquet`,
  `tracks/*.idl0t`, catalog rebuild): no cell-granular merge exists (D6
  scopes that to workbooks only). Re-read the current file, re-derive `B`
  against it (i.e. re-apply the intended change on top of `H_ext` rather
  than on top of the stale `H0`), and retry the write. These paths are
  effectively single-writer in v1 (no external editor is expected to touch
  `data.parquet` or `derived/*.parquet` — they are engine output, not
  hand-edited), so a real collision here is expected to be rare; the rule
  exists so the primitive never silently drops bytes regardless.

**Watcher scope.** Only `<data>/workbooks` is watched by `notify` (design
§7 — this is the only tree where an external edit needs to trigger
reactive re-evaluation). On a create/rename event under `workbooks/`, the
watcher hashes the resulting file and checks the expected-hash set for that
path:
- Hash present and matches → this was the app's own write; consume
  (remove) the entry and do **not** re-parse (the app already has the
  in-memory state that produced these exact bytes).
- Hash absent, or present but different → external edit; proceed with the
  documented debounce (~100 ms) → re-parse → diff cells → re-evaluate only
  changed math cells → push into the Runtime (design §7).

`session.json`, `tracks/*.idl0t`, and `catalog.sqlite` are not watched in
v1 — an external edit to `session.json` requires an explicit reload, matching
design §7's explicit scope (workbooks only). The watched tree is
`<data>/workbooks` where `<data>` is §1's `app_data_dir()/data` — the
settings bootstrap file at `app_config_dir()/settings.json` is outside
`<data>` on every platform (§1) and is therefore never reachable by this
watcher, regardless of whether `app_config_dir()` and `app_data_dir()`
happen to share a parent on the current platform.

## 5. Catalog

SQLite via `rusqlite` 0.40.2. Six tables, matching design §5's list exactly
(`sessions`, `blobs`, `workbooks`, `tracks`, `laps`, `lap_summary`) — no
additional tables (e.g. no separate `sectors` table; sector detail lives in
`session.json` and is read directly when needed, not cached for search).

**Connection PRAGMAs** (set on every `rusqlite::Connection::open`, since
`foreign_keys` is a per-connection setting SQLite does not persist):

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;   -- WAL + NORMAL is durable-enough for a rebuildable index; full fsync-per-commit isn't needed
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;    -- ms
```

**Schema version.** `PRAGMA user_version = 1;` set at creation. On open, if
`user_version` does not match the version the running binary expects, the
catalog is **not** migrated in place — the file is deleted and rebuilt
(§5's rebuild procedure below) — because the catalog holds no data that
does not also live, canonically, in a file under `<data>` (design principle
"the catalog is an index"). This makes catalog schema changes free: no
`ALTER TABLE` migrations, ever.

**DDL:**

```sql
CREATE TABLE blobs (
  sha256        TEXT PRIMARY KEY,          -- 64 lowercase hex, the SHA-256 digest
  size_bytes    INTEGER NOT NULL,
  mtime_ms      INTEGER NOT NULL           -- filesystem mtime at last scan, UTC ms
);

CREATE TABLE tracks (
  track_id      TEXT PRIMARY KEY,          -- UUID, canonical 36-char form (SPEC §16.2)
  name          TEXT NOT NULL,
  venue_name    TEXT NOT NULL DEFAULT '',
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  full_json     TEXT NOT NULL              -- complete Track JSON (SPEC §16.3 — unchanged)
);
CREATE INDEX idx_tracks_venue ON tracks(venue_name);

CREATE TABLE sessions (
  session_id        TEXT PRIMARY KEY,       -- lowercase hex, 16-64 chars; see §3
  blob_sha256       TEXT NOT NULL REFERENCES blobs(sha256) ON DELETE RESTRICT,
  source_format     TEXT NOT NULL CHECK (source_format IN ('idl0','fit','gpx','csv')),
  device_id         TEXT,                   -- NULL for fit/gpx/csv (C1)
  config_checksum   TEXT,                   -- NULL for fit/gpx/csv (C1)
  importer_version  TEXT NOT NULL,
  seam_correction_version TEXT NOT NULL,  -- C1 §4.3
  engine_version    TEXT NOT NULL,
  timestamp_utc_ms  INTEGER NOT NULL,        -- recording start
  created_at_ms     INTEGER NOT NULL,        -- catalog row insert time (import time)
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
  workbook_id   TEXT PRIMARY KEY,          -- stable id from front matter (C2)
  file_name     TEXT NOT NULL UNIQUE,      -- workbooks/<file_name>.idl1wb
  name          TEXT NOT NULL,             -- display name from front matter
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
  channel_id    TEXT NOT NULL,             -- materialised channel name
  derived_hash  TEXT NOT NULL,             -- which derived/<hash>.parquet this was computed from
  min_value     REAL NOT NULL,
  max_value     REAL NOT NULL,
  mean_value    REAL NOT NULL,
  PRIMARY KEY (session_id, lap_number, channel_id),
  FOREIGN KEY (session_id, lap_number) REFERENCES laps(session_id, lap_number) ON DELETE CASCADE
);
CREATE INDEX idx_lap_summary_channel ON lap_summary(channel_id);
```

**Rebuild procedure.** Never mutates `catalog.sqlite` in place — builds a
fresh file at `tmp/catalog-rebuild-<uuid>.sqlite`, applies the DDL above,
scans, checkpoints WAL into the main file, closes the connection, then
atomically renames it over `catalog.sqlite` (§4's primitive; this swap is
not notify-watched, since only `workbooks/` is watched). Scan order matters
for foreign-key insert order:

1. **`blobs`** — walk `blobs/sha256/*/*`; for each file, verify its path
   encodes its own SHA-256 (§7 #1) and insert `(sha256, size_bytes, mtime_ms)`
   from a `stat`. A path that doesn't match the pattern or fails the hash
   check is skipped and reported, not inserted.
2. **`tracks`** — walk `tracks/*.idl0t`; parse each JSON, verify the
   filename's `track_id` matches the JSON's own `track_id` field (§7 #8),
   insert.
3. **`sessions`** — walk `sessions/*/`; read `session.json` (C1 schema).
   A parse failure is reported and the directory is skipped (does not
   abort the scan). Insert the row; `blob_sha256` must already exist in
   `blobs` (from step 1) — a session whose blob is missing is reported as
   a §7 finding, not inserted with a dangling reference (the `REFERENCES`
   constraint would reject it anyway under `PRAGMA foreign_keys = ON`).
4. **`laps`** — from the same `session.json`, insert each lap
   (`lap_number`, `lap_time_ms`, and `track_id` from the session's track
   visits, C1).
5. **`lap_summary`** — for each `derived/<hash>.parquet` under a scanned
   session, for each channel column in the file and each lap already
   inserted in step 4, compute `(min, max, mean)` over that lap's time
   window (a single streaming reduce over the column — the same class of
   operation as the existing engine `channel_min_max`, SPEC §15.3 — no
   full materialization) and insert one row per `(lap, channel)`.
6. **`workbooks`** — walk `workbooks/*.idl1wb`; parse front matter (C2). A
   parse failure is reported and the file is skipped, not inserted.
7. Set `PRAGMA user_version` to the current schema version and commit.

**Nothing reads the catalog for truth.** Every column above is either a
verbatim copy of a value that lives canonically in a file under `<data>`
(`session.json`, workbook front matter, a track's `.idl0t`, a blob's own
bytes) or a pure computation over such files (`lap_summary`). No code path
may treat a catalog row as authoritative over its source file. If a
consumer detects a mismatch (e.g. a session's cached `venue_name` disagrees
with `session.json`), the file wins; the catalog row is corrected by a
targeted re-index of that entity or by the next full rebuild. Any code path
that needs data to be *correct*, not merely *fast to filter/sort*, opens
the file.

**Incremental per-session indexing (task L2b T4).** Steps 3–5 above are also
reachable for exactly one session via `store::catalog::index_session(conn,
data_root, session_id)`, without a full tree walk: it removes any existing
`sessions`/`laps`/`lap_summary` rows for that `session_id` (idempotent —
`laps`' and `lap_summary`'s own cascading foreign keys mean deleting the
`sessions` row is enough) and re-inserts them, plus (ruling R84) a `blobs`
row for the session's own blob if step 1's scan never ran across it yet.
`store::import`'s `finish_import` calls it after every successful import,
when a `catalog.sqlite` already exists, so a session's laps are queryable
immediately rather than waiting for the next rebuild — a failure there is
non-fatal to the import (`ImportReport::catalog_index_warning`). It never
touches `tracks` (step 2, the library's own concern) and never creates a
catalog that doesn't already exist. `rebuild_catalog` remains the sole
authority for `tracks`, `workbooks`, and the schema itself, and is the
recovery path if `index_session` and the tree ever disagree.

## 6. Sync scope

**Moves** (LAN sync, design §7): blobs, `sessions/<id>/data.parquet`,
`sessions/<id>/derived/*.parquet`, `sessions/<id>/session.json`,
`workbooks/*.idl1wb`, `tracks/*.idl0t`, `profiles/<id>.idl0p` (added
post-sign, ruling R6 — same class as `session.json`/`tracks`: last-write-wins
by `updated_at_ms`, L11 wires the endpoint alongside the others). **Never
moves:** `catalog.sqlite`
(+ its `-wal`/`-shm` sidecars — it is an index, D10, rebuilt locally per §5)
and `tmp/` (write-staging, never a stable artifact). The sync server walks
`<data>` (`app_data_dir()/data`, §1) to build the manifest below; it has no
reason to and never does read `app_config_dir()/settings.json` — that file
is outside `<data>` on every platform, so it is not a "never moves"
exception to state, it is simply never in scope to begin with.

`GET /manifest` returns one JSON document listing every syncable file,
nested by session where the file lives under a session directory:

```json
{
  "schema_version": 1,
  "generated_at_ms": 1756857600000,
  "blobs":   [ { "sha256": "…", "size_bytes": 12345678 } ],
  "sessions": [
    {
      "session_id": "…",
      "data_parquet":  { "sha256": "…", "size_bytes": 98765, "importer_version": "0.3.0", "seam_correction_version": "v1", "engine_version": "0.7.2" },
      "derived":       [ { "sha256": "…", "size_bytes": 4321 } ],
      "session_json":  { "sha256": "…", "size_bytes": 512, "updated_at_ms": 1756857600000 }
    }
  ],
  "workbooks": [ { "workbook_id": "…", "file_name": "fork-tuning", "sha256": "…", "size_bytes": 2048, "updated_at_ms": 1756857600000 } ],
  "tracks":    [ { "track_id": "…", "sha256": "…", "size_bytes": 900, "updated_at_ms": 1756857600000 } ]
}
```

**Manifest entry per file class** (path pattern | identity key | fields |
conflict rule):

| Class | Path | Identity key | Manifest fields | Conflict rule |
|---|---|---|---|---|
| Blob | `blobs/sha256/<2>/<62>` | `sha256` (= the path itself) | `sha256`, `size_bytes` | None possible — content-addressed and immutable; set difference by hash, missing ones are pulled. |
| `data.parquet` | `sessions/<id>/data.parquet` | `session_id` (path is not content-addressed, unlike derived) | `sha256`, `size_bytes`, `importer_version`, `seam_correction_version`, `engine_version` | If `(importer_version, seam_correction_version)` match on both sides but `sha256` differs, both are correct (last-ulp cross-CPU difference, design §5) — no transfer, keep local. If that version pair differs, the side with the newer pair is authoritative; the other side pulls it (transferred as bytes, not regenerated locally). `engine_version` is informational only (provenance, C1 §4.3) — not part of the conflict key. |
| Derived channel | `sessions/<id>/derived/<64hex>.parquet` | `sha256` (= filename) | `sha256`, `size_bytes` | None possible — content-addressed; set difference by hash per session. Never overwritten (name is content). |
| `session.json` | `sessions/<id>/session.json` | `session_id` | `sha256`, `size_bytes`, `updated_at_ms` | **Last-write-wins by `updated_at_ms`**, extending the existing Track precedent (SPEC §16.5). Flagged in §8 — D6 only mandates cell-granular merge for workbooks; this extension needs lead confirmation. |
| Workbook | `workbooks/<name>.idl1wb` | `workbook_id` (front matter, C2 — **not** `file_name`; a rename is not a new workbook) | `workbook_id`, `file_name`, `sha256`, `size_bytes`, `updated_at_ms` | Per-cell merge against the last-synced base (design §7, D6) — computed after both full files are fetched, not from the manifest alone. A `file_name` mismatch for a known `workbook_id` is a rename to reconcile locally, id wins. |
| Track | `tracks/<id>.idl0t` | `track_id` | `track_id`, `sha256`, `size_bytes`, `updated_at_ms` | **Last-write-wins by `updated_at_ms`** (SPEC §16.5, unchanged). |

`data.parquet` is path-identified by `session_id` (not content-addressed) and
regenerated as a pure function of `(blob, importer_version,
seam_correction_version)` (C1 §4.3, design D6) — the concrete form of D6 for
this file class, so sync compares that version pair rather than a content
hash.

**Transfer.** `GET /blob/<hash>` with range requests (resumable), per
design §7. The same pattern generalises to the other classes —
`GET /session/<id>/data.parquet`, `GET /session/<id>/derived/<hash>.parquet`,
`GET /session/<id>/session.json`, `GET /workbook/<id>`, `GET /track/<id>` —
all range-request-capable for resumability; push is the symmetric `PUT`.
These five endpoint names are this contract's proposal, generalised from
the one endpoint design §7 specifies explicitly; L11 confirms naming at
implementation (§8).

A blob enters the local catalog only after its hash verifies against the
downloaded bytes (design §7) — the same rule extends to every
content-addressed class above (blob, derived channel): the file is written
via the §4 atomic-write primitive to a path *derived from the verified
hash*, so a hash mismatch simply produces the wrong path, never corrupts
an existing entry.

## 7. Retention and repair

**Orphaned derived files.** A `derived/<hash>.parquet` is orphaned when
recomputing `sha256(input column hashes ‖ config ‖ engine version)` from
the session's *current* `data.parquet` and the *currently installed*
engine version would not produce `hash` — i.e. no live computation would
regenerate this exact file. This is expected and benign (design principle
"stale files are orphans, not bugs"): an engine upgrade or an iEKF config
change orphans the previous file without deleting it, and a peer still on
the older engine version may still need it via sync. `verify` reports
orphans; it does not delete them. A separate, explicit `idl-rs prune
--older-than <days>` CLI subcommand (default 30 days) deletes derived
files that have been orphaned for longer than the window, bounding growth
from repeated config iteration while preserving recent history for
compare-across-config workflows. (30-day default and the `prune` command
shape are this contract's proposal — not sourced elsewhere; flagged in §8.)

**Missing blobs.** A session whose `session.json` names a `blob_sha256`
with no corresponding file under `blobs/` (partial sync, or manual
deletion). The session's `data.parquet`/`derived/*` remain fully usable —
only the raw source is gone. `verify` reports this as a **warning**
("blob unavailable — re-import or re-sync from a peer that still has it"),
never a fatal error (CLAUDE.md §5: "recover what's readable, surface a
warning").

**`verify` procedure** — every check, in order, each producing a
`Finding { severity, path, message }` (severity: `error` | `warning` |
`info`). Scope is `<data>` (`app_data_dir()/data`, §1) only —
`app_config_dir()/settings.json` is outside `<data>` on every platform and
is never scanned, checked, or reported on by `verify`:

1. **error** — every `blobs/sha256/<a>/<b>` file's own SHA-256 does not
   match its `<a><b>` path (corruption or tampering).
2. **error** — a `sessions/<id>/session.json` fails to parse under the
   current schema version (C1). Does not block scanning other sessions.
3. **warning** — a session's `blob_sha256` has no file under `blobs/`
   (missing blob, above).
4. **error** — a `sessions/<id>/data.parquet`'s file-level metadata
   (`session_id`, `blob_sha256`, `importer_version`, `seam_correction_version`,
   `engine_version` — C1 keys) disagrees with the directory/`session.json`
   identity (mis-copied or corrupted file, e.g. an interrupted sync).
5. **error** — a `derived/<hash>.parquet` filename does not equal the
   SHA-256 of its own bytes (content-addressing violated — partial write
   or bit rot; distinct from #1 only in which directory).
6. **info** — a `derived/<hash>.parquet` is orphaned (recomputed expected
   hash does not match), per the retention rule above.
7. **warning** — a `workbooks/*.idl1wb` fails to parse (front matter or
   fenced blocks). Per-file, not fatal to the scan.
8. **error** — a `tracks/<id>.idl0t` filename does not match the
   `track_id` inside its own JSON.
9. **warning** — a catalog row's foreign key (e.g. `sessions.blob_sha256`)
   points at a file that no longer exists on disk — the catalog is stale
   relative to the tree; triggers the §5 rebuild.
10. **info** — any path under `<data>` that matches none of the §2
    patterns (OS metadata like `.DS_Store`/`Thumbs.db`, or genuinely
    unexpected content). Never auto-deleted, only surfaced.

**Repair actions.**
- Hash mismatch (#1, #5): quarantine — rename into
  `tmp/quarantine/<uuid>-<original-name>` (outside every watched/synced
  path) and report. Never silently deleted.
- Missing blob (#3): no local repair; surfaced for re-sync/re-download.
- Stale catalog (#9): auto-triggers the §5 rebuild.
- Unparseable `session.json` / workbook / track (#2, #7, #8): surfaced,
  not auto-repaired — structured content where an automatic fix risks data
  loss; a human or a future migration tool handles it.

## 8. Open questions

Each below is a decision this draft made without a fully explicit source;
flagged for lead confirmation before signing, per the doc's own review gate.

1. **Bootstrap-settings file** (§1): `app_config_dir()/settings.json` holding
   `{ "data_dir": "..." }`, read via plain `std::fs` before `<data>` is
   known. Design does not specify this mechanism; needs confirmation.
   *Resolved this round (review round 1):* `<data>` is now defined as
   `app_data_dir()/data`, a subdirectory — this keeps `settings.json`
   outside `<data>` on every platform even where `app_config_dir()` and
   `app_data_dir()` share a parent (Windows, macOS). What remains open is
   only whether a bootstrap file is the *right* mechanism at all (vs., say,
   a platform keychain/registry entry) — not its location. —
   *Owner: lead.*
2. **`session_id` collision-extension rule** (§3): git-style adaptive-length
   hex prefix for the blob-hash-derived case. Design says "you define the
   collision rule"; this is that definition, needs confirmation it's the
   intended shape (vs., e.g., refusing import on collision). — *Owner: lead.*
3. **`session.json` sync conflict policy** (§6): last-write-wins by
   `updated_at_ms`, extended from the existing Track precedent (SPEC
   §16.5). D6 only mandates cell-granular merge for workbooks; whether
   `session.json` (which holds lap flags and track visits a rider might
   edit concurrently on two devices) deserves the same treatment or a
   coarser one is genuinely open. — *Owner: lead, L11.*
4. **Generalised sync endpoint names** (§6): `GET /session/<id>/data.parquet`
   etc., extrapolated from design §7's one explicit example
   (`GET /blob/<hash>`). — *Owner: L11, at implementation.*
5. **Orphan retention window and `prune` CLI shape** (§7): 30-day default,
   `idl-rs prune --older-than <days>`. Not sourced; a proposal. —
   *Owner: lead, L1.*
6. **Tauri bundle identifier** (§1): the literal string in
   `app_data_dir()`'s path is an L5 scaffold decision; this contract only
   fixes the resolution mechanism, not the id. — *Owner: L5.*
7. **Expected-hash entry lifetime on match** (§4): the text above says a
   matched entry is "consume(d) (remove)" on the first matching event. L5's
   implementation (`ExpectedHashSet::check_and_consume`, `tauri/src/watcher.rs`)
   deliberately does not remove the entry on match — it keeps it live until
   the 5-second TTL expires, and only removes it via lazy TTL-expiry cleanup.
   Default adopted: keep the entry live until TTL rather than consuming on
   first match, because `std::fs::write` on Windows fires `Create` then
   `Modify` for one logical write, both carrying identical final-content
   bytes — consuming on first match left the second duplicate event
   unmatched and misclassified as external. Safety argument: the match still
   requires exact hash equality, so a later write with genuinely different
   content (a real external edit) always produces a different hash and is
   still correctly classified as external regardless of how long the
   matched entry lingers; the only entries that widen exposure are
   byte-identical rewrites of the app's own last write, which carry no
   information to lose. Needs confirmation this is the intended reading of
   "consume (remove)" for this contract, or whether a tighter fix (e.g.
   debouncing the duplicate Windows events before the hash check) is
   preferred instead. — *Owner: lead.*

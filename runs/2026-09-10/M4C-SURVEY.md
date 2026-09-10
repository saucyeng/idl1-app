# M4c survey — what already exists (read-only, 2026-09-10)

## 1. Inbox folder (auto-import dropped `.idl0`)
Does not exist. C4 layout (`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §2,
tree listing) has no `inbox/` entry — only `blobs/`, `sessions/`, `workbooks/`, `tracks/`,
`profiles/`, `catalog.sqlite`, `tmp/`. The only filesystem watcher is `WorkbookWatcher`
(`rust/tauri/src/watcher.rs:68-118`), which watches `<data>/workbooks` non-recursively for the
app's own writes vs external edits — it is workbook-specific (hash-suppression, debounce) and
not structured to watch a second directory or drive an import. Import is entirely pull:
`import_file`/`import_idl0` (`rust/tauri/src/commands/import.rs:121-160`) take one path from a
file-picker or pasted-path seam (`app/src/routes/pages/Data/FilePicker.ts:1-50`, single-file
only, no `multiple: true`). **Gap: core (watcher generalisation or new inbox scanner) + transport
(none) + tauri (a command to drive it) + spec (C4 needs an `inbox/` entry).**

## 2. Session start back-filled from GPS; unknown-start ask
Exists in full for the back-fill. `rust/core/src/parse/v3.rs:240-255` (§5.6 back-fill): if the
header's `session_start_ms` is 0, it's recovered from the first non-zero GPS fix
(`gps_epoch - (gps_device_ts - first_sample_ts)/1000`), tested at
`rust/core/src/parse/v3.rs:1143-1162`. **Gap:** when there is no GPS fix at all,
`effective_start_ms` stays `0` (`v3.rs:248-255`, no `else` branch) — no test exercises the
zero-fix case, and nothing prompts the user. The frontend already treats `timestamp_utc_ms === 0`
as "unknown" for sorting (`app/src/routes/pages/Data/sort.ts:86`) but there is no "ask once"
UI/command anywhere in `app/src/routes/pages/Data` or `rust/tauri/src/commands` to accept a
user-supplied start time and write it back. **Gap: core (nothing to add — 0 already signals
unknown) + tauri (no `set_session_start` command) + app (no prompt) + spec (C1 §6 has no field
documented as "user-supplied when back-fill fails"; session.json's `timestamp_utc_ms` lives on
`Session`, C1 §2, not §6, so where a manual override is stored/synced is undecided).**

## 3. Metadata editor
Fully built already. C1 §6 (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md:106-125`)
fixes the nine `session.json` fields: `rider`, `bike`, `bike_comment`, `venue_name`, `event_name`,
`event_session`, `short_comment`, `long_comment`, `tag` (singular free-text, not an array).
Catalog columns mirror them (`rust/core/src/store/catalog.rs:100,106` — `tag` is one `TEXT`
column, indexed). The command is `save_session_metadata`
(`app/src/ipc/catalog.ts:32,147,369` for the wire shape). The UI is
`app/src/routes/pages/Data/MetadataForm.tsx:1-179` (all nine fields, settle-bound save button,
venue autocomplete, tracks-visited summary) driven by
`app/src/routes/pages/Data/metadataDraft.ts:1-140` (draft/dirty/normalize/payload). No "track"
field beyond `venue_name`/tracks-visited, and no bike/setup-sheet id beyond the free-text `bike`
string — setup sheets are M6, not yet linked. **Gap: none functionally; roadmap's "tags" (plural)
vs spec's single `tag` string is a wording mismatch to resolve with the lead, not a build gap.**

## 4. Batch re-import on importer-version change
No mechanism exists. Each importer stamps its own version constant:
`IDL0_IMPORTER_VERSION` (`rust/core/src/parse/mod.rs:30`), `FIT_IMPORTER_VERSION`
(`rust/core/src/import/fit.rs:18`), `GPX_IMPORTER_VERSION` (`rust/core/src/import/gpx.rs:13`),
`CSV_IMPORTER_VERSION` (`rust/core/src/import/csv.rs:11`), and every session's catalog row
stores its own `importer_version` (`rust/core/src/store/catalog.rs:89,399,680,717`;
`rust/core/src/store/catalog_read.rs:44,259,271`). `data.parquet` is a function of
`(blob, importer_version)` per C1/C4 as expected, but nothing compares a session's stored
`importer_version` against the running build's constant the way `rescan_tracks`
(`rust/tauri/src/commands/catalog.rs:835-871`) does for `track_library_hash`/
`lap_detector_version`. `verify_data_dir` (`rust/tauri/src/commands/maintenance.rs:99-152`)
checks blob integrity, not importer staleness. No `list_stale_sessions` or `reimport_session`
command exists anywhere in `rust/tauri/src/commands/`. **Gap: core (staleness comparison,
re-run-import-from-existing-blob path) + tauri (new command(s)) + app (a "rebuild" affordance,
likely alongside `MaintenancePanel.tsx`) + spec (C3 needs the command, C1/C4 already support it
conceptually).**

## 5. Duplicates / CAS
Already correct by construction, no gap. Blob storage is content-addressed
(`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §2-3, `blobs/sha256/<2>/<62>`);
`.idl0` `session_id` is the device UUID and non-device `session_id` is a blob-hash prefix (C4 §3),
so re-importing the identical file is idempotent by design (`import_file_via`,
`rust/tauri/src/commands/import.rs:121-160`, calls straight into `core_import::import_idl0`/
`import_file`, which already no-ops on an existing blob per C4 §4's write primitive).

## 6. Bulk fold-in tool (point at a folder, preview, import all)
Does not exist. The import queue (`app/src/routes/pages/Data/importQueue.ts:1-45`,
`ImportPanel.tsx:1-60`) processes one path at a time, added via single-file picker or one pasted
path (`FilePicker.ts:1-50`, `multiple?: false` at line 11) — no folder picker, no directory scan,
no preview-before-import step (detected venue, filename), no multi-enqueue-from-directory path.
`importDriver.ts` runs the queue serially but has nothing to populate it from a directory listing.
**Gap: tauri (a `list_directory`/`scan_folder` command, or reuse `std::fs::read_dir` client-side
via a new command since app has no direct fs access) + app (a folder picker, preview list, bulk
enqueue) + spec (no contract section covers a folder scan or a "preview" shape yet).**

## Summary of gaps by layer
- **spec:** C4 needs an `inbox/` entry (#1); C1/C3 need a "manual session-start" field/command
  (#2); C3 needs a staleness/re-import contract (#4); C3 needs a folder-scan/preview contract (#6).
- **core:** inbox scanning or watcher generalisation (#1); nothing new for #2's back-fill itself,
  but a manual-override write path; importer-version staleness detection + rebuild-from-blob (#4).
- **transport:** no gaps identified — nothing here touches BLE/WiFi/LAN sync.
- **tauri:** inbox-drive command (#1); `set_session_start` (#2); `reimport_stale_sessions` or
  similar (#4); `scan_folder`/bulk-import commands (#6).
- **app:** inbox settings/status UI (#1); "start time unknown, please set" prompt (#2); a
  "rebuild stale sessions" affordance (#4); folder picker + preview + bulk-enqueue UI (#6).
- Metadata editor (#3) and duplicate handling (#5) are **done**, no further work needed for M4c.

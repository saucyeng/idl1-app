# idl1 library tiers: selective sync, roles and the where-is log (DRAFT)

**Status:** DRAFT for Isaac's review, 2026-10-27. Spec-first: nothing here is
built. It changes the sync contract (C4 §6, IDL0_SPEC §28a) and adds one
synced source (the where-is log), so it needs a yes before code
(architecture changes need Isaac).

**Why now.** One full season of rides (a 14 GB library on one laptop, a
second machine with 1 GB, a phone on the way) showed that all-or-nothing
two-way sync doesn't scale: a sync started by pairing tried to copy 14 GB to
a laptop that only wanted one day, and the laptop that owned everything had
0.5 GB free. A pull of just the missing day, done by hand over the same API,
moved 0.96 GB at ~10 MB/s; the app's own sync ran at ~1 MB/s.

## 1. Model

Borrowed from git-annex (location tracking, preferred content by group,
never drop the last copy), presented the way Apple Photos and Lightroom
present it: the library always looks complete, and data is where you need it.

- **Library, not app.** Each library folder has its own ID
  (`<data>/library.json`: `library_id`, `name`, `role`, `created_at_ms`).
  An external drive is a library like any other. Today's sync identity
  (`identity.json`, per app install, IDL0_SPEC §28a) names the *device* that
  serves; the library ID names the *collection*. A device serves the library
  it has open.
- **Metadata everywhere, content where wanted.** Small sources travel to
  every library: `session.json`, workbooks, tracks, profiles, bike log, the
  where-is log. Large content (raw-log blobs, `data.parquet`, derived
  parquet, video) moves only where the library's role or an explicit action
  wants it.
- **Where-is log** (`<data>/whereis/`): which library holds which content,
  and when that copy was verified by hash. Append-only records
  `{library_id, item, sha256, present: bool, verified_at_ms}`; merge is a
  union keyed on `(library_id, item)`, newest `verified_at_ms` wins. It is a
  synced source, not an index: the catalog reads it, never replaces it.
- **Roles** (one per library):

  | Role | Wants content for | Drops |
  |---|---|---|
  | **Main** | Everything | Never |
  | **Working** | Sessions inside its window (default 60 days) + pinned + anything fetched by hand | Content outside the window, unpinned, only when a Main holds a verified copy |
  | **Field** | Sessions inside its window (default 7 days) + pinned | Same rule as Working; also sends every new session to a Main automatically |

- **Pin** ("keep on this device") overrides the window. **Push to → device**
  is a pin set on that device.
- **Safety rule:** content is dropped only if the where-is log shows at
  least `min_main_copies` (default 1, team setting) Main libraries holding a
  copy verified by hash. With no Main reachable or recorded, nothing is ever
  dropped.

## 2. What the user sees

- **One device on its own:** its library is Main automatically. No roles,
  no settings, behaviour identical to today.
- **Pairing a second device** asks one question: *"What's this device for?
  Main library / Working / Field device."* A phone defaults to Field.
- **Add a backup drive** (Settings): pick a folder on a drive; it becomes a
  Main library. While connected, the computer syncs to it like a paired
  device (no app runs on the drive).
- **Data tab:** sessions whose content isn't here show greyed, with "on
  <library name>" and **Get**. A push icon on each row and on a selection:
  **Push to → [device]**.
- **Sync tab:** per paired device, its library as a list with the Data
  tab's filters, each row marked here / not here / differs, and **Pull** for
  the ticked rows. Workbooks are a separate category. Pulling a session
  offers "+ workbooks that use it"; pulling a workbook offers "+ its
  sessions"; both ticked by default.
- **Automatic rule per paired device:** Off (default) / Send new / Mirror
  (today's full two-way sync, kept, off by default).

The laptop with and without its drive:

| | Drive connected | Drive away |
|---|---|---|
| New sessions | Copied to the drive, hash-checked | Wait on the laptop |
| Old sessions | Laptop (Working) may drop out-of-window content | Nothing dropped; shown "on Backup drive" |
| Analysis | Everything reachable | Recent + pinned |

Changing a library's role from Main to Working never drops anything by
itself: drops happen only once another Main holds verified copies.

## 3. Phasing

**Phase 1 (build next).** Library IDs; the where-is log (written on every
import, pull and push); browse a paired device's library and pull a
selection; push from the Data tab; the per-device automatic rule (Off / Send
new / Mirror, Off by default); workbooks as a separate category with
session ↔ workbook pairing; the sync speed fix (§5). Single-library
behaviour unchanged. Roles exist in `library.json` but every library is
Main.

**Phase 2.** Working and Field roles, windows and pins, greyed placeholders
with Get, safe dropping, backup drives, `min_main_copies`.

**Later, fits without redesign:** per-rider preferred content (a rider's
phone keeps only their rides), cloud storage as another Main library.

## 4. Contract changes (C4 §6, IDL0_SPEC §28a)

- **Selective pull and push need no wire change.** The client filters the
  existing `plan_sync` actions to the selected items' closure (session →
  its blob, `data.parquet`, derived, `session.json`, its tracks; optionally
  its workbooks).
- **New read-only endpoint `GET /idl1/v1/library`:** session summaries for
  the browse list (`session_id`, start time, venue, rider, bike, duration,
  content size, held-here flags), workbook summaries (id, name, session ids
  used), and the library's `library.json`. Paged; bearer token as today.
- **New synced class `whereis`.** Manifest entry plus `GET`/`PUT`, union merge.
- **`library.json`** syncs as metadata but `role` is local-only (each
  library decides its own role).
- **The sync identity question:** today pairing binds two app installs. A
  backup drive has no app, so the computer it's plugged into syncs to it as
  a local folder peer (same plan/apply code, no HTTP). Paired devices keep
  pairing as today.

## 5. Sync speed (~1 MB/s in-app vs ~10 MB/s plain download)

To investigate before Phase 1 lands. Observed 2026-10-27: Ubuntu pulling
from Windows' sync server at ~1 MB/s while a plain streamed GET of the same
kind of items from Ubuntu's server ran at ~10 MB/s. Candidates: the client
buffers each item whole in memory (`download_item` returns `Vec<u8>`), the
server's `serve_file` chunk size, per-item serial requests with no
pipelining, or the Windows server side. Measure each direction first.

## 6. Open questions for Isaac

1. Window defaults: Working 60 days, Field 7 days. Right numbers? Count by
   days or by number of sessions?
2. Should a pulled session bring its raw log by default (yes, as drafted),
   or processed data only, with the raw log on request?
3. Workbook → session link: workbooks name sessions inside cells, not in
   front matter. Phase 1 can derive "sessions this workbook uses" by
   evaluating it, or the workbook could record it in its front matter. Which?
4. Team setting `min_main_copies`: default 1, or 2 for teams?
5. Field devices: send new sessions to *every* reachable Main, or to one
   chosen Main?

## 7. Points to settle in the spec before code

- Session → raw-log link: `session.json` does not name its blob; confirm
  the source of truth (C4 §3 identity / catalog) for building a session's
  closure.
- Where-is log layout under `<data>` and its retention (compaction of
  superseded records).
- How the catalog marks content-absent sessions (C4 §5).
- Android storage: Field-role drops must also clear the app's media cache.

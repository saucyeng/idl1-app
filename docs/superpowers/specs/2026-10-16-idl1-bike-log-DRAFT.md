# DRAFT — Bike log and setup sheet

Status: proposal for Isaac, 2026-10-16. Spec-first, and an architecture
change: it adds file types to the data directory (C4 §2) and to sync
(C4 §6), and a field to `session.json` (C1 §6). Nothing is built until
Isaac says yes to §4 and answers §8.

Builds on R190 (the setup sheet is a per-session snapshot of the start
state), the ride-analysis draft (2026-10-14, §3.2–3.3), Isaac's sample
sheet (`docs/setup-sheet/sample-setup-sheet.csv`) and his McLaren sheet.

## 1. What Isaac asked for

- A **Notes** button next to the rider and bike chips. It opens a notepad
  for the bike any time: during a recording, right after, while files are
  still transferring, or with no logger at all (Isaac, 2026-10-15).
- Notes attach to the next ride automatically, "since the last ride on this
  bike". The ride form still opens after the ride, so more notes can be
  added (Isaac, 2026-10-15).
- Setup changes are tracked from the notes. The setup sheet is something
  to look things up in or correct, not the main place to type (Isaac,
  2026-10-14).

## 2. Shape in one paragraph

Each bike has a **log**: a list of timestamped entries. Most entries are
plain notes ("fork service", "rear 26 psi"). A few are **confirmed sheets**:
a full setup sheet the rider has checked. The **running setup sheet** is
the latest confirmed sheet with the changes since then applied on top. It is
worked out when needed, never stored. At import, a session takes every
entry since that bike's previous session, and keeps a copy of the running
sheet as it stood at the session's start. That copy is R190's per-session
snapshot.

## 3. Entries

```jsonc
{
  "entry_id": "01J…",              // ULID: unique, sorts by creation time
  "bike_id": "gt-force",
  "at_ms": 1760000000000,          // when it happened, UTC ms (editable)
  "created_at_ms": …, "updated_at_ms": …,
  "device": "phone",               // where it was written
  "kind": "note",                  // "note" | "sheet"
  "text": "bled fork bleeders after 2 laps",
  "changes": [                     // optional structured edits, see §5
    { "field": "fork.lsc", "value": 12 }
  ],
  "sheet": null,                   // kind "sheet" only: the full sheet
  "deleted": false
}
```

- **The text is the main record.** `changes` are optional. They come from
  editing the running sheet directly, or from the analysis turning a note
  into a field change and the rider accepting it (ride-analysis draft
  §3.3). A note with no `changes` still shows on the sheet as "changed
  since: bled fork bleeders".
- A note written during a recording falls inside the session's time span,
  so the session places it at a lap (as the McLaren sheet's change column
  does).

## 4. Storage and sync (the part that needs a yes)

Proposed C4 additions:

    bikes/<bike_id>.json                  name, sheet template (§5)
    bikelog/<bike_id>/<entry_id>.json     one file per log entry

**Why one file per entry.** The phone and the desktop both add notes, often
while apart. With one file per entry, two devices never write the same
file, so sync is a union with no merge rule. The only conflicts are edits
to the same entry, and those use last-write-wins by `updated_at_ms`, as
Track and Profile already do. A delete is a `deleted: true` edit (a
tombstone), so it syncs like any other edit and a deleted note can't come
back from the other device.

Sync manifest classes:

| Class | Path | Identity | Conflict rule |
|---|---|---|---|
| Bike | `bikes/<id>.json` | `bike_id` | last-write-wins by `updated_at_ms` |
| Bike log entry | `bikelog/<bike>/<entry>.json` | `entry_id` | union; edits last-write-wins by `updated_at_ms` |

**`session.json` (C1 §6), additive:**

- `bike_id`: which bike. Today's `bike` string stays as the display name.
- `bike_log`: the `entry_id`s attached to this session.
- `setup_sheet`: the running sheet at session start, copied in. This fills
  R190's snapshot. The existing `bike_profile_snapshot` is the logger
  config and stays as it is.

The catalog indexes entries for search (C4 §5). It is still only an index
and can be rebuilt.

## 5. The sheet

Typed known fields grouped into sections, with a notes box in each section.
A blank field means "doesn't apply to this bike" (e.g. no HSC on the X2
Performance, no spring rate on an air shock). The field list comes from
Isaac's sample sheet:

- **Front tyre:** model, psi, notes. **Rear tyre:** model, psi, notes.
  **Wheels:** notes.
- **Fork:** model, travel mm, psi, volume reducers, LSC, HSC, LSR, HSR
  (clicks).
- **Shock:** model, shock travel mm, wheel travel mm, psi, spring rate,
  volume spacers, LSC, HSC, LSR, HSR (clicks).
- **Frame:** flip chip. **Cockpit:** bar height mm.

A bike's template (`bikes/<id>.json`) says which fields it has, so the GT
Force's sheet hides HSC on the shock. Adding a field later is a template
edit and needs no schema change.

## 6. Attaching to a session

At import (and again on re-import, with the same result):

1. The session's bike is the bike chosen on the logger at recording time
   (§8 Q3).
2. Attach every entry for that bike whose `at_ms` falls after the previous
   session's end and up to this session's end, excluding deleted entries.
   An entry edited later stays attached.
3. Copy in the running sheet as it stood at session start.

Entries written after the last session simply wait for the next one. The
ride form shows the attached entries and adds more. A note added in the
form is an ordinary log entry with `at_ms` at the session's end.

## 7. Where the code lives

- `core`: entry and sheet types, running-sheet computation, attach rule,
  store read/write, sync manifest classes.
- `idl-rs-tauri`: commands to add/edit entries, read the running sheet
  (C3).
- `app/src`: the Notes button and notepad, the sheet view, the ride form's
  log section.

## 8. Decisions needed

1. **Storage (§4):** one file per entry plus a `bikes/` file per bike, with
   the two sync classes. Yes, or change it?
2. **One log per bike** (recommended: setup belongs to a bike) **or one log
   for everything**, with each note tagged by bike?
3. **Which bike a session belongs to:** the logger's chosen bike at
   recording time (recommended, since one logger usually means one bike),
   or picked in the ride form?
4. **Clicks:** counted from fully closed (recommended, the usual
   convention), or from fully open? Asked under R190 and still open.
5. **Deleting a note:** allowed (it disappears, a tombstone syncs), or only
   struck through so the history stays visible?

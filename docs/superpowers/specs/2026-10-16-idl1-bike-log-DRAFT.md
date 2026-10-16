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

## 3. One file per bike

Decided 2026-10-16 (Isaac): each bike is one file, `bikes/<bike_id>.json`,
holding the bike and its whole log, oldest entry first: one readable
history. A confirmed sheet stores the full setup; a note stores the
rider's words plus only the values it changed.

```jsonc
{
  "bike_id": "gt-force", "name": "GT Force",
  "name_updated_at_ms": …, "fields": [], "fields_updated_at_ms": …,
  "entries": [
    { "entry_id": "0mgq…", "kind": "sheet", "version_id": "…",
      "at_ms": 1760173200000, "updated_at_ms": …, "device": "phone",
      "text": "after fork service",
      "sheet": { "fork.psi": 70, "fork.lsc": 10, "rear_tyre.psi": 28 } },
    { "entry_id": "0mgr…", "kind": "note", "version_id": "…",
      "at_ms": 1760577600000, "updated_at_ms": …, "device": "phone",
      "text": "Rear 26 psi", "changes": { "rear_tyre.psi": 26 },
      "history": [ { "version_id": "…", "text": "rear 26", … } ] },
    { "entry_id": "0mgs…", "kind": "note", …, "text": "bled the fork bleeders" }
  ]
}
```

- **The text is the main record.** `changes` are optional. They come from
  editing the sheet directly, or from the analysis turning a note into a
  field change the rider accepts (ride-analysis draft §3.3). A note without
  `changes` still shows on the sheet as "changed since baseline".
- **The full setup at any moment** is the newest confirmed sheet before
  it, with the later notes' changes applied in order (`running_sheet`). It
  is worked out, never stored.
- A note written during a recording falls inside the session's time span,
  so the session places it at a lap (as the McLaren sheet's change column
  does).

## 4. Edits, deletes and sync

- **Versions.** An entry keeps every version of itself. The current one's
  fields sit at the top of the entry; older versions are in its `history`,
  each naming the version(s) it was edited from (`parents`). A delete is a
  version with `deleted: true`.
- **Edited on two devices.** Two versions with the same parent mean the
  note was changed on the phone and the desktop before they synced. It
  shows both texts, "changed on phone and desktop", until the rider picks
  one (a new version naming both as parents).
- **Sync.** One manifest class, Bike (`bikes/<id>.json`, key `bike_id`).
  Copies that differ are merged by the receiver: the bike's name and
  fields part by part (newer `*_updated_at_ms` wins), the log as a union
  of entries and, within each, of versions. The merge is symmetric, so the
  two sides converge once each has synced, and nothing is ever lost.
- **Size.** A busy year is a few hundred entries, about 100–300 KB with
  history: trivial to rewrite and sync whole.

**`session.json` (C1 §6), additive:**

- `bike_id`: which bike. Today's `bike` string stays as the display name.
- `bike_log`: `{entry_ids, after_ms, until_ms, setup_sheet}`: the entries
  attached, the time window they came from (so the next session knows
  where to start), and the running sheet at session start, copied in. This
  fills R190's snapshot (C1 §6 as amended 2026-10-16). The existing `bike_profile_snapshot` is the logger
  config and stays as it is.


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

## 8. Decisions

Decided 2026-10-16 (Isaac):

1. **Storage:** one file per bike holding its whole log (revised
   2026-10-16 from one file per entry, Isaac: one readable history), with
   the versioned edit merge (§4).
2. **One log per bike** (see the diagram in §4: the log is the folder of
   notes for one bike; the setup sheet is worked out from it).
3. **Which bike:** the logger's chosen bike at recording time, changeable
   in the ride form. Changing it there offers to make that bike the
   logger's new default.
4. **Clicks are counted from fully closed.** Adjustments are written the
   way Isaac writes them, as signed changes from the baseline (item 6).
5. **Delete:** the note disappears (a `deleted` version, synced). Simplest.

6. **Sign of an adjustment:** `+` is more damping, `-` is less (Isaac,
   2026-10-16: "+1 is closing by a click"). Since clicks are counted from
   fully closed, "+1 LSC" from 10 clicks out makes it 9 out. The sheet
   stores the absolute count; the sign only decides how a note is read.

Later (not this spec): parts of the Logger screen should work with no
logger connected, such as preparing a config to send later (Isaac,
2026-10-16).

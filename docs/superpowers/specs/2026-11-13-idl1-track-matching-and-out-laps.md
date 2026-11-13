# Track matching by gates, and out-lap / in-lap gates

Status: approved by Isaac in chat, 2026-11-13 ("seems like we're good to continue").
Touches two on-disk formats (the track file `.idl1t` and `session.json` laps, C1), so it is an
architecture change.

## Problem

Three 11/7 Walden motos (3dc6ae65, 4f3f3032, 7b3cf253) went from 6 laps to 0 on the first rescan
after "Walden Out Lap '26" was added, and 043c7d22 went to 1 lap.

`tracks/detect.rs` gives each GPS fix to the single nearest track within 30 m, then joins runs of
fixes into visits. Walden '26 (1,563 m) and Walden Out Lap '26 (1,496 m) share 96 % of their
ground, so on most of the lap the choice is a coin flip decided by GPS noise. The out-lap track
mostly wins, and its point-to-point timing finds no laps. The ~65 m of pit exit that only the
out-lap track covers is the real difference, and judging fix by fix can't use it.

Separately, two paths disagree about where lap 1 starts. `workbook data --track` skips visit
detection, so `detect_laps` gets no window and lap 1 runs from the first GPS fix of the recording
(time in the pits included). Indexed laps are windowed by visit and start when the rider joins
the track.

## Design

### 1. Gates decide; the polyline confirms (Isaac, 2026-11-13)

"The gates are generally the real check for tracks. The polyline either goes through the gates
or it doesn't." Visit detection stops assigning GPS fixes to the nearest track. Instead:

1. **Candidate runs come from gate crossings only.** On a circuit, from one start/finish crossing
   to the next (plus the out-lap and in-lap runs of section 2). On a point-to-point track, from a
   start-gate crossing to the next finish-gate crossing.
2. **The polyline confirms the run.** A run counts for that track only if at least 80 % of its
   fixes (time-weighted) lie within the on-track threshold (30 m) of the track's polyline. That
   rejects a run that happens to cross both gates on a different route.
3. **Overlaps go to the closer track.** When confirmed runs of two tracks overlap in time, the one
   with the smaller mean squared distance to its polyline over the overlap keeps it; the other
   run is dropped. Squaring weights real divergence (the pit exit, a new jump line) over GPS
   noise. A moment that no confirmed run covers belongs to no track.
4. **Visits are consecutive confirmed runs on one track**, from the first run's start to the last
   run's end.

The 80 % and the threshold live in `VisitParams`, the one source of truth as today, and are
checked against Isaac's library (Acceptance). The bounding-box pre-filter stays.

Behaviour change: on a circuit with no out-lap gate, the stretch before the first start/finish
crossing is no longer a lap (today it is lap 1). It has no start crossing, so it can't be timed;
this is what made a "fastest" lap table pick a 15 s out-lap at Broome-Tioga. Adding an out-lap
gate makes it a timed, marked lap.

### 2. Out-lap and in-lap gates on a circuit track

A circuit track gains two optional gates, drawn in the gate editor like sector gates:

- `out_lap_gate` (pit exit). When it's crossed, the lap that starts there and ends at the next
  start/finish crossing is timed and marked `kind: "out"`.
- `in_lap_gate` (pit entry). A lap that starts at a start/finish crossing and ends at a crossing
  of this gate (before the next S/F crossing) is timed and marked `kind: "in"`. Where pit entry
  is at the finish line (Walden), the track has no in-lap gate and the last lap is an ordinary
  lap.

Rules:

- Every out-lap gate crossing starts an out-lap, so a session with several stints has several
  out-laps. Lap numbers count through the whole session and don't restart per stint (today's
  session-wide renumbering, `laps/renumber.rs`, unchanged).
- An out-lap run is confirmed like any run (section 1, 80 % within 30 m). The pit lane being off
  the polyline doesn't sink it: at Walden it is ~65 m of a ~1.5 km lap.
- A track with no out-lap gate has no out-lap: laps start at the first S/F crossing (section 1).
- Out- and in-laps are excluded from `"fastest"` and from averages, and still listed (lap tables
  show the mark). Out is lap 1 when the session starts with one, as today.

**Walden migration:** Walden Out Lap '26's start gate (at pit exit) becomes Walden '26's
`out_lap_gate`; then Walden Out Lap '26 is deleted. Walden '26 gets no in-lap gate. Isaac
approved editing those two track files (2026-11-13).

### 3. One answer for where lap 1 starts

`workbook data/eval --track <t>` runs visit detection for that one track and windows laps by its
visits, the same as indexing. Lap 1 then starts in the same place on both paths.

### 4. `session set-meta --ignore-lap <n>`

Adds `n` to `ignored_lap_numbers` (repeatable; `--unignore-lap <n>` removes). Ignored laps are
excluded the same way out/in laps are.

### 5. Later (not in this change): track date ranges

Optional `valid_from` / `valid_until` (dates) on a track, so a retired layout stops matching new
rides. Isaac: tracks change several times a year at some venues; not urgent.

## Format changes

- `.idl1t`: circuit `lap_timing` gains optional `out_lap_gate` and `in_lap_gate` (same shape as
  `start_finish`). Absent means today's behaviour, so existing files stay valid.
- `session.json` laps: gain `kind`: `"normal" | "out" | "in"`, absent read as `"normal"`.
- `LAP_DETECTOR_VERSION` bumps, so every session's laps are re-detected on the next launch.
  Before that ships, the new matcher runs read-only over a copy of the library and Isaac gets a
  before/after lap count per session (Isaac, 2026-11-13).

## Acceptance

Unit tests (inline, `tracks/detect.rs` and `laps/detect.rs`):

- two tracks sharing 95 % of their ground, each with its own gates: every run goes to the track
  whose gates it crossed; where both tracks' runs overlap, the closer fit keeps it
- a run that crosses both gates on a different route (under 80 % near the polyline) is rejected
- a multipath spike of 80 m for 1 s changes nothing
- the same ride at 1 Hz and at 10 Hz GPS gives the same visits
- two point-to-point trails ridden once each, sharing a stretch: one visit each
- out-lap gate: out-lap timed from the gate to S/F and marked; two stints give two out-laps; no
  gate gives no out-lap and laps from the first S/F crossing
- in-lap gate: last lap ending at the pit entry is marked `in`; with no gate, it isn't
- `"fastest"` and averages skip out/in/ignored laps

End to end, on a read-only copy of Isaac's library:

- 3dc6ae65, 4f3f3032, 7b3cf253 back to 6 laps, the first marked Out once the Walden migration is
  done; 043c7d22 back to its full count
- every other session's lap count unchanged (Broome-Tioga, MX 2026-09-19, Beacon trails), or
  each difference explained in the before/after table
- `workbook data --track` and the index agree on lap 1's start for Broome-Tioga S4

## Decided (Isaac, 2026-11-13)

- Overlapping tracks: each moment goes to at most one track, the one that fits closer over the
  stretch. A moment can belong to no track. Strava-style double counting is not wanted.

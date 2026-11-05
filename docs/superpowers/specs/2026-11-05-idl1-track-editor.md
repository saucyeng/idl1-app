# Track editor: gates on a satellite map, `.idl1t` files

Spec-first, 2026-11-05. Isaac's calls in this conversation: the gate editor
comes before GPX import; the map is the satellite view idl0 had, in latitude
and longitude; tracks are `.idl1t` files in the `.idl0t` format; a track made
from a ride takes its reference line from the start gate to the finish gate
only.

It ports idl0's Track Editor (IDL0_SPEC §21.3, §24.12): idl0's proven
behaviour is the default, and the changes below are the ones idl1's layers
force.

## 1. What the rider does

1. **Data tab, a session with GPS → Create track.** Or **Data → Tracks → a
   track → Edit gates on map** for an existing track. The editor opens over
   the Data tab's content area.
2. **Map:** satellite imagery, with the session's GPS line drawn on top,
   coloured by GPS speed so descents stand out. For an existing track opened
   with no session, the line is the track's reference line. Pan with drag,
   zoom with the wheel.
3. **A time range** (two handles under the map, in session minutes) highlights
   one stretch of the line and dims the rest, to pick one descent out of a
   tangle of climbs and descents. It only changes what's drawn.
4. **Placing a gate:** pick **Start**, **Finish** or **Add sector**, then click
   the gate's two ends on the map, across the trail. A placed gate shows as a
   line with its name. Start + finish = point-to-point; a start alone =
   circuit (the start is the start/finish line). Each gate can be re-placed or
   deleted. Esc cancels a placement.
5. **Check:** whenever the gates change, the sidebar lists the runs the session
   makes through them (start time, duration). A track that catches no run says
   so, before it is saved.
6. **Name** (required) and **Venue** in the sidebar. **Save** writes the track
   and offers **Rescan N sessions**, as the name/venue edit already does.
   **Cancel** discards.

Neutral zones keep their existing (read-only) display; their editor is not in
this slice. GPX import stays logged, after this.

## 2. Coordinates

The editor works in latitude/longitude, decimal degrees: a basemap is in Web
Mercator, and gates are stored in degrees. This supersedes, for the editor
only, C2 §5.3's "no latitude crosses this boundary", which exists because the
notebook's map had no basemap; the notebook's map cell is unchanged.

Projection to pixels is drawing and stays in JavaScript (Leaflet). A clicked
gate end is input, the same as typed coordinates. Every number the track's
*behaviour* depends on (crossings, runs, the reference line) is computed in
Rust.

## 3. Commands (C3 additions)

All `#[tauri::command(async)]`.

**`fetch_session_fixes(window, colour_by, budget)`** → raw bytes, `IDLL` v1:
the `IDLG` v1 layout (C3 §3.5) with magic `IDLL`, `x` = longitude, `y` =
latitude (degrees), `t` = session seconds, `c` optional. Decimated with the
same `decimate_path` as `fetch_gps_trace_v2`, run on a local metre projection
so the decimation is identical; the kept points are sent in degrees. Same
errors as `fetch_gps_trace_v2`.

**`preview_track_runs(session_id, lap_timing, sector_gates)`** →
`{ runs: { start_secs, end_secs, duration_secs }[], reference_polyline:
GpsFix[] }`. Runs are `laps::detect_laps` over the whole session with the
given gates. `reference_polyline` is the session's GPS fixes from the first
run's start to its end (every fix, not decimated), empty when there is no run.
`lap_timing: null` returns no runs. `not_found`: unknown session.

Saving is the existing `save_track`; the editor passes the preview's
`reference_polyline` for a track created from a session. Editing an existing
track keeps its reference line unless the editor was opened on a session and
the start or finish gate moved, in which case the new line replaces it.

**`fetch_map_tile(source, z, x, y)`** → raw image bytes, or `not_found` when
the tile is neither cached nor fetchable (offline, or the server has none);
the map shows that tile blank. `source`: `"esri_world_imagery"` only, for now.
`invalid_argument` for an unknown source or `z` outside 0..=19, `x`/`y`
outside `0..2^z`.

## 4. Map tiles

- Fetched by Rust (`idl-transport`, reqwest/rustls), never by the webview.
  User-Agent `idl1/<version>`. Source URL:
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.
- Cached under the OS cache directory (`<app cache>/map-tiles/<source>/<z>/<x>/<y>`),
  **not** in the library: tiles are not the rider's data, are never synced and
  can be deleted at any time. A cached tile is served without the network;
  a trail viewed once at home is visible at the trailhead.
- No cap on the cache in this slice. `// TODO(idl0):` a size cap.
- Attribution "Esri, Maxar, Earthstar Geographics" shown in the map's corner,
  as Esri's terms require.
- **Ruling (Isaac, 2026-11-05).** The design's "offline-first means bundled,
  no CDN, ever" governs code: every library still ships in the app. Basemap
  imagery is data that cannot ship, so the map may fetch it, cached, and works
  without it (the line on a blank background). Closes R52 Q8. Esri's free
  tier is for non-commercial use; a sold idl1 needs a licence or another
  source.

## 5. `.idl1t`

The file format is unchanged (`track_artifact_version` 1, IDL0_SPEC §17b.1).

- **Written** as `tracks/<track_id>.idl1t`, always (save, sync install).
  Writing removes a `tracks/<track_id>.idl0t` of the same id.
- **Read** from `.idl1t`, falling back to `.idl0t`. Every walk of `tracks/`
  (catalog rebuild, lap index, sync manifest, verify) takes both; when both
  exist for one id, `.idl1t` wins and the `.idl0t` is ignored.
- **Renamed once:** opening the library renames each `tracks/<id>.idl0t` with
  no `.idl1t` beside it to `.idl1t` (the app at startup; the CLI on any verb
  that opens a data directory). A failed rename is a warning, not an error;
  the dual read covers it.
- Sync is keyed by `track_id` (C4 §6), so peers on either extension agree.
  The lap-index library hash is over the parsed tracks, not file names, so
  the rename triggers no rescan.
- An `.idl0t` picked in the file dialog (idl0 export) imports as before.

## 6. Layers

| Piece | Where |
| --- | --- |
| `.idl1t` paths, dual read, rename | `core::track_artifact` (one `path` module every caller uses) |
| fixes in degrees, run preview, reference line | `core` (`laps`, `gps`), commands in `idl-rs-tauri` |
| tile cache (paths, read, write) | `core::map_tiles` (std::fs) |
| tile HTTP fetch | `idl-transport` |
| `fetch_map_tile` glue | `idl-rs-tauri` |
| editor UI, Leaflet, drawing | `app/src/routes/pages/Data/TrackEditor*` |

Leaflet 1.9.4 is added as a bundled npm dependency.

## 7. Amendments applied with the code

- C3: the three commands above (§3).
- C4: `tracks/<id>.idl1t` replaces `.idl0t` in the layout, manifest and verify
  sections, with the dual-read rule; the tile cache is outside the data
  directory.
- C2 §5.3: the editor exception (§2 here).
- IDL0_SPEC §24.12 (idl1 part): the editor is real; R54's deferral is closed.
- Design doc §3: the basemap ruling (§4 here).

## 8. Tests

- Core: dual read prefers `.idl1t`; write removes the `.idl0t`; rename skips
  an id that already has `.idl1t`; walks list one entry per id. Reference line
  is exactly the first run's fixes; no run → empty. Tile cache round trip,
  bad coordinates refused.
- App (vitest): editor state (placing, re-placing, deleting gates; circuit vs
  point-to-point from what's placed; the draft sent to `save_track`), and the
  `IDLL` decoder.
- Not unit-tested: Leaflet rendering.

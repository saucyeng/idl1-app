# DRAFT — Video step 2: the overlay workbook

Status: draft, 2026-11-14. Spec-first. The direction is decided (video spec
`2026-10-16-idl1-video-DRAFT.md` §6 and §10, Isaac 2026-11-14: an overlay
is a workbook with a canvas; cells get a `cursor` value at video frame
rate; the look is a theme). This document fixes the shapes. The three
shapes marked **needs a yes** change contract C2 and are not built until
Isaac agrees to them.

## 1. What it is

A workbook gains a second way of being shown. The document view is
unchanged: cells in reading order. The **canvas view** shows a fixed-shape
frame (16:9 or 9:16) with the workbook's `video` cell and some of its other
cells placed on it by hand, in layers. The same file, the same cells, the
same data. Playing it and recording the screen gives the first shareable
clip (Isaac, 2026-11-14: screen-record first, export after). Step 3
(export) renders the same canvas frame by frame.

Nothing here is overlay-only. A speedometer is a cell any notebook can
hold, and it reads the cursor in the document view too.

## 2. `canvas` in the front matter (C2 §1, §7.1) — needs a yes

```yaml
canvas:
  size: "16:9"            # "16:9" | "9:16"
  theme: overlay          # "overlay" | "notebook"; default "overlay"
  cells:
    7e570001: { x: 0, y: 0, w: 1, h: 1, z: 0 }           # the video cell, full frame
    7e570002: { x: 0.03, y: 0.68, w: 0.20, h: 0.28, z: 1 }
```

- `size` is the frame's shape. The view scales it to fit; export (step 3)
  picks the pixel size.
- `cells` maps a cell id to its box: `x`, `y`, `w`, `h` are fractions of the
  frame's width and height (0 to 1, `x`/`y` the top-left corner), `z` an
  integer layer, higher on top. A cell not listed is not on the canvas.
  The video is placed like any other cell, so it can be full frame (a
  classic overlay) or a band (a 9:16 reel with the data around it).
- Advisory, like `graph` (C2 §3.7): never read by the parser or the
  evaluator, and nothing in it changes a value. An entry naming a cell id
  that no longer exists is kept, not pruned.
- Merge (C2 §7.1): per entry in `cells`, local wins when both sides moved
  the same cell, no conflict note (a position is cosmetic, as for `graph`).
  `size` and `theme` are scalars under the same local-wins rule.
- A build without this key's support keeps it untouched (ruling R135).

## 3. `cursor` host variable (C2 §5.1) — needs a yes

| Variable | Shape | Source |
|---|---|---|
| `cursor` | `{ t: number \| null, playing: boolean }` | The shared cursor. `t` is seconds on the primary window's session clock (the same `t` a `channel(...)` row carries), `null` with no cursor. While playing it changes on every presented video frame (or animation frame with no video); paused, it changes on a pin and on each step of a scrub. Hover does not change it. |

Only a cell whose code names `cursor` re-runs when it changes. Today every
cell is given every host variable as an input, so the sandbox must first
learn which cells name it; without that, every chart would redraw 60 times
a second.

The data a readout reads is the ordinary `channel(...)` binding for the
shared view. During playback the view follows the cursor (cursor-fixed,
video spec §10, 2026-11-14) and is refreshed every 200 ms, so the samples
around the cursor are always bound. No per-frame IPC.

## 4. Readout helpers (C2 §5.1, §5.3) — needs a yes

One bundled module, `Readout`, in scope like `Plot`. Each function returns
an SVG element, sized to its cell, drawn from the bound data at `cursor.t`:

| Call | Draws |
|---|---|
| `Readout.gauge(data, cursor, { min, max, label?, unit?, icon?, style? })` | A dial: arc, needle or filled sweep, the value as a number. `style` is `"speedo"` (default) or `"tach"`; `icon` is `"heart"` or absent. Speed and heart rate both use it. |
| `Readout.number(data, cursor, { label?, unit?, digits? })` | The value as a large number with a label. |
| `Readout.gg(x, y, cursor, { limit?, rings?, tail_s?, label? })` | A g-g plot: rings at each `rings` step out to `limit`, a dot at the cursor, and the last `tail_s` seconds as a fading tail. |

The value at the cursor is the bound row nearest `cursor.t`; with no row
within the view it draws a dash. `unit` defaults to the data's `.unit`.

`plotForm` (C2 §5.3) gains three chart types, `gauge`, `number` and `gg`,
so the Properties form can make and edit these cells; each generates one
of the calls above. A scrolling trace needs nothing new: it is a `time`
chart, which already pans under a fixed cursor.

## 5. The overlay theme

`theme: overlay` sets CSS tokens on the canvas only: transparent cell
backgrounds, no cell chrome, larger high-contrast text with a dark outline
so it reads over footage. Tokens, not chart parameters ("no renderer-only
parameters"). The document view never uses it.

## 6. The canvas view (app, no contract)

- A third view beside Paper and Studio, offered when the workbook has a
  `video` cell. Opening it on a workbook with no `canvas` key adds one:
  16:9, the video full frame, nothing else placed.
- Cells are added from a list of the workbook's cells, then dragged and
  resized on the frame; each change writes `canvas.cells` through the
  normal save path. Send backward / bring forward change `z`.
- Play, pause, the cursor and scrubbing are the notebook's own. A "clean"
  toggle hides the app's chrome around the frame for screen recording.

## 7. Build order

1. `cursor` host variable, with the sandbox giving it only to cells that
   name it.
2. `Readout` (gauge, number, g-g with tail) and the three `plotForm` types.
3. `canvas` front matter, the canvas view, the overlay theme.
4. First overlay on ride `edb96102` (2026-07-15): speed, heart rate, g-g,
   one IMU trace. Screen-record it.

## 7a. Decided 2026-11-15 (Isaac)

- §2 `canvas`: yes. Isaac commonly records 4:3 and wants 9:16 reels with
  readouts filling the space the 4:3 picture leaves. The video **fits** its
  box (whole picture, its own shape); adjustable crop later. `size` gains
  the common shapes (proposed: 16:9, 9:16, 4:3, 1:1, 4:5).
- §3 `cursor`: yes, under that name.
- §4 `Readout`: yes, as a starting point. A checkbox chooses between the
  typed min/max and an automatic range over the **whole ride** (not the
  playing window or lap, so the dial's scale never moves between laps).
  Unticked, the typed min/max starts at a default (Isaac: "like 0-40 mph").
  Proposed defaults: speed 0–40 mph (0–65 km/h), heart rate 60–200 bpm.
- Units (yes, 2026-11-15): the engine stays metric. Display conversion,
  done lazily: only the values being drawn are converted, at draw time
  (a readout's one number, a chart's plotted points), never a whole
  channel and never stored. The unit table is per measurement, not one
  imperial/metric switch: **distance and speed** (km, km/h ↔ mi, mph) and
  **temperature** (°C ↔ °F); everything else stays metric. The choice is
  the person's, not the workbook's: C3 §3.10's `unit_system` preference
  becomes two (`distance_unit: "km" | "mi"`, `temperature_unit: "C" | "F"`),
  migrated imperial → mi + F, metric → km + C. The workbook's `units` key
  (C2 §1) is unchanged and still unread.

## 7b. Readout data (2026-11-15, agreed with Isaac)

§3's "the ordinary `channel(...)` binding for the shared view" is wrong for
a readout: an unscoped binding is envelope-decimated to the cell's width,
so "the row nearest `cursor.t`" can be a bucket's min or max, not the
sample.

Isaac (2026-11-15): extend the one-sample lookup (C3 §3.7
`cursor_readout`, nearest recorded sample, no interpolation) to math
definitions, which hover wants too, and have readouts use it directly;
no client-side buffer of data that is already in memory in the engine.

Proposed:

- C3 §3.7 gains a definition-aware form: a workbook and window instead of
  a bare session, so any name a cell can bind (session channel or `math`
  definition) reads its nearest recorded sample at `t_us`. It reads the
  window's cached evaluation (`get_or_evaluate`, the one charts use);
  nothing is evaluated again. The hover readout card moves to it.
- An optional tail for g-g (Isaac, 2026-11-15): `tail_us` and `step_us`
  return the nearest recorded sample at `t_us - k * step_us` for
  `k = 1..=tail_us / step_us`; `step_us` is one video frame (one
  animation frame with no video), so 2 s at 59.94 frames/s is 120 points.
  Asked for every frame, never collected from past frames, so the tail is
  right after a pin, a jump, a scrub backwards, while paused, and in
  export (step 3).
- Timed 2026-11-15 on ride `edb96102`, nightly build 155, app idle, 300
  sequential round trips each: `cursor_readout` over four session channels
  (GPS speed, HR, two IMU0 axes) p50 2.1 ms, p99 4.7 ms, max 7.6 ms; a
  `math` definition (`accel_mag`, Shakedown workbook) read through
  `fetch_host_channel_v2` with a 20 ms view, the path a definition-aware
  lookup takes (workbook read, evaluation key, cached evaluation, slice),
  p50 4.7 ms, p99 7.5 ms, max 8.5 ms, after a 38.7 ms first evaluation.
  Both fit in a 16.7 ms frame, so per frame it is; no buffer. Not yet
  measured under playback load.
- **Prepare once, read per frame** (Isaac, 2026-11-15: "it should just
  know what charts we're looking at and pull the next one from memory").
  Rather than one stateless command that re-reads, re-parses and re-keys
  on every call, two steps:
  - `open_readout(workbook, window, names, tail?) -> handle`, called when
    the notebook's set of readout names, the selected window or the
    workbook's evaluation changes. It resolves each name once, to the
    session column or the cached evaluation's array, and holds a
    reference to it, so the data cannot be dropped under it.
  - `read_readout(handle, t_us) -> values (+ tail)`, per frame: a search
    on arrays already resident, no file read, no parse, no key.
  - The handle is replaced on the next `open_readout` and released on
    close. The hover readout card uses the same pair.
  The IPC crossing itself (about 1 to 2 ms, the floor of the
  `cursor_readout` timing) stays; going under it would mean holding data
  on the JS side, which is the buffer this replaces.
- **One request per frame for the whole notebook**, naming every readout's
  channels, not one per readout (the command already takes a list).
- A readout asks once per presented frame while playing, and on each pin
  or scrub step while paused. **At most one request in flight; the
  newest wins** (the video seek rule, §5.3 of the video
  spec), so requests never back up. Until an answer arrives the readout
  keeps its last value. This is a stated exception to "no IPC on the
  interaction path"; superseded the same day by rewording the rule itself
  (Isaac chose this): "nothing on the interaction path waits on IPC", in
  CLAUDE.md §2, design §3 and IDL0_SPEC §26.3. Hover is unchanged for
  now, though the reworded rule would allow a live hover readout.
- "Whole ride": the gauge's extent is read once per (channel, window),
  not per frame, from the engine (exact min and max over the window).

Grammar (C2 §5.3, one chart kind per cell):

```ebnf
readout_marks ::= readout_call                     (* the cell's whole return value, no Plot.plot *)
readout_call  ::= "Readout." ("gauge" | "number") "(" channel_call "," "cursor" "," readout_opts ")"
                | "Readout.gg(" channel_call "," channel_call "," "cursor" "," gg_opts ")"
```

Options are fixed-order object literals, like `fft_params`; their keys are
§4's (`range: "ride"` in place of `min`/`max` for the whole-ride gauge;
`mph`-style conversion comes from the units preference, not an option).

## 7c. Readout call shape (2026-11-15, follows from §7b)

With values read per frame by the host (§7b), a readout no longer takes a
`channel(...)` binding and `cursor`: the host must know the names to open
before any cell runs, and the values arrive already at the cursor. So §4's
calls become:

```js
Readout.gauge("GPS_SpeedKmh", { min: 0, max: 65, label: "Speed", style: "speedo" })
Readout.gauge("GPS_SpeedKmh", { range: "ride", label: "Speed" })
Readout.number("HR_BPM", { label: "Heart rate", digits: 0 })
Readout.gg("lat_g", "lon_g", { limit: 1.5, rings: 0.5, tail_s: 2 })
```

- Names are string literals, read from the source by the host (as
  `channel(...)` scopes are), so `open_readout` can name them.
- `Readout` itself is the frame-rate host variable: the host rebinds it
  each frame with the latest `read_readout` answer, and only cells naming
  `Readout` re-run (`sandbox/cellInputs.ts`). `cursor` stays for
  hand-written cells.
- `range: "ride"` uses `open_readout`'s exact `extent`.
- `tail_s` is a numeric literal; the host turns it into `count` at the
  video's frame spacing.
- Units: values arrive in the engine's units; the readout converts for
  display only, per the person's unit preference (§7a).

What Isaac sees (the Properties form) is unchanged.

## 8. Open

- Speed in mph: the readout shows the channel's own unit, so mph is a math
  definition today. A unit option on the readout could come later.
- A spectrogram on the overlay (Isaac, 2026-11-14: "eventually"): the
  existing chart type, placed on the canvas; whether it scrolls well enough
  is to be seen.
- The camera's IMU as channels: its own spec.

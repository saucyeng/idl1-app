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
  typed min/max and an automatic range from the ride's data.
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

## 8. Open

- Speed in mph: the readout shows the channel's own unit, so mph is a math
  definition today. A unit option on the readout could come later.
- A spectrogram on the overlay (Isaac, 2026-11-14: "eventually"): the
  existing chart type, placed on the canvas; whether it scrolls well enough
  is to be seen.
- The camera's IMU as channels: its own spec.

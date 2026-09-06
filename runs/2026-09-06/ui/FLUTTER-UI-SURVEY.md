# idl0 Flutter UI survey — the design system as it exists in code

Source root: `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\`.
Read-only survey, 2026-09-06. Everything below is quoted from code, not inferred.

## 1. Palette

All tokens: `app/lib/ui/brand/brand_tokens.dart`. The system is named "quiet field manual"
in its own doc comments. Dark-only — there is no light theme anywhere in the tree.

| Token | Hex | Role |
|---|---|---|
| `brandBg` | `#121412` | Page background, near-black with a warm green cast |
| `brandSurface` | `#1A1E18` | Panels, cards, tables, dialogs, sheets, menus |
| `brandSurface2` | `#161915` | Recessed/nested regions, snackbars, tooltips, nav indicator |
| `brandControlFill` | `#20251D` | Resting fill for chips, segments, text fields, tool groups |
| `brandControlActive` | `#2D3327` | Selected segment / active chip / picked row |
| `brandFg` | `#EFEAE0` | Primary text, warm off-white |
| `brandFgDim` | `#9A968A` | Labels, captions, leader dots, unselected nav |
| `brandFgFaint` | `#6C6A60` | Placeholders, tertiary captions, unavailable rows |
| `brandRule` | `#353A32` | Hairlines: borders, dividers, chart gridlines and axis borders |
| `brandAccent` | `#E63946` | Alert / error / required action / destructive. Never a large fill on a healthy surface |
| `brandGood` | `#35C46E` | Connected, enabled, OK, "go" CTA, selected-row inset bar |
| `brandHivis` | `#F5D547` | Live action only: recording in progress, armed states, nav active indicator |
| `brandInfo` | `#3B92E8` | Connectivity category: BLE, WiFi transfer, pairing, "connect" CTA |

Chart trace palette, `brandChartPalette`, eight hues assigned by series order and wrapped
with `% length`, user-overridable per channel: azure `#5BA6F0`, green `#35C46E`, amber
`#F5D547`, orange `#E8964B`, violet `#B98AE6`, teal `#3FC9C0`, rose `#E86FA6`, coral
`#E05A63`. The coral is deliberately distinct from the alert red so a data line never
reads as an alarm. Continuous data uses Turbo (blue → cyan → green → yellow → red) via a
degree-5 polynomial in `tabs/analyze/turbo_colormap.dart`.

## 2. Typography

Two families, both from `google_fonts` (`pubspec.yaml`), both with platform fallbacks.

- **IBM Plex Mono** (`plexMono()`) is the face for everything structural: display,
  titles, data, numbers, labels, kickers, status text, button labels. Tabular figures are
  on for every style so digits align in tables and charts.
- **IBM Plex Sans** (`plexSans()`) is for prose and instructional copy only, default line
  height 1.5, no tabular figures.

Scale from `app/lib/ui/app.dart`: display 48 / 36 / 28, headline 24 / 20 / 18, all at
weight 600 and line height 1.0; title 16/600, 14/500, 12/500-dim-tracked; body 14; body
small 12 dim; labels 12/500 and 11/500 dim. Weights used are only 400, 500, 600.

Tracking is a signature: uppercase labels get `brandLabelTracking = 1.6`, section kickers
get `brandKickerTracking = 2.0`. Nav labels are 10 px, uppercase, tracked.

## 3. Geometry, spacing, elevation

`brandPad = 4.0` — nearly all padding is a multiple of 4 (6, 8, 12, 14, 16, 24 recur).
Two radii, deliberately: `brandControlRadius = 2.0` for structural surfaces and the crisp
legacy look, `brandControlRadiusSoft = 7.0` for interactive controls (filled buttons,
segments, text fields, chips). Cards, dialogs, sheets, menus and snackbars are radius
**zero** with a hairline border. `brandHairlineWidth = 1.0`.

Elevation is zero everywhere. Every theme entry that accepts `elevation` sets `0`, and
depth is carried entirely by the surface-step ladder and hairline rules. There are no
shadows in the system.

## 4. Dark/light and iconography

Dark only. `ThemeData(brightness: Brightness.dark)`, one `ColorScheme.dark`, no
`darkTheme`, no theme-mode switch in Settings. Icons are stock Material
(`uses-material-design: true`), 20 px, `brandFg` or `brandFgDim`. The vocabulary is small
and repetitive: `close`, `add`, `chevron_right`, `expand_more`, `flag`, `search`,
`delete_outline`, `drag_indicator`, `more_vert`, `bluetooth`, `wifi`, `refresh`. There is
no custom icon set and no logo asset. The only images in the repo outside launcher icons
are two Rust golden-test PNGs (`rust/core/tests/golden/overlay_full.png`,
`overlay_nodata.png`) — not brand assets.

## 5. App shell

`app/lib/ui/shell/adaptive_shell.dart` + `app.dart`. `MaterialApp` → `SafeArea` →
`AdaptiveShell`, which wraps `AdaptiveScaffold` from `flutter_adaptive_scaffold`.

Five destinations in fixed order: DEVICE, DATA, MATHS, ANALYZE, SETTINGS, each an
uppercase tracked label with a Material icon. Below 600 dp the package renders a bottom
`NavigationBar`; at medium and up, a `NavigationRail` narrowed from the stock 192 dp to
160 dp to reclaim chart width. The active indicator is a 2 px-radius rectangle filled
`brandSurface2` with a `brandHivis` hairline outline — an amber box, not a pill.

Tab state survives switching because the body is an `IndexedStack`. A Riverpod
`shellIndexProvider` lets any widget navigate to another tab programmatically. Tabs choose
their own internal breakpoints independently: Data and Settings switch at 720 dp, Maths at
700 dp, session results at 620 dp.

## 6. The five tabs

**Device** (`tabs/device/device_tab.dart`) is a single scrolling column of two cards. The
`DeviceHeroCard` is a three-state machine over live device state — no device gives a blue
Connect CTA, connected-idle gives a green Start recording CTA, recording gives an amber
Stop CTA with a live timer — with a colour-coded SD/GPS/IMU/HR status strip and a blinking
RX/TX pair folded in. Below it sit a mode status line, Push Config, a device-files entry,
the `ConfigCard` (profile bar plus an expandable channels table, one parent row per source
with a per-source dialog), and a collapsed calibration section. Deliberately dense, no
instructional copy.

**Data** (`tabs/data/data_tab.dart`) is McMaster-Carr-style faceted search. At ≥720 dp:
a 280 dp `FilterRail` of facet groups (date, track, venue, bike, rider, lap time) with
per-option `(N)` counts, a vertical hairline, the results panel, and a conditional 320 dp
detail pane. Below 720 dp the rail becomes a bottom sheet driven by a mobile filter bar.
Results render as a pinned `TableHeader` above collapsible date-and-venue groups of
`DenseRow`s; expanding a session reveals its laps as recessed sub-rows on the same column
grid. Selection is an XOR model between session-mode and lap-mode checkboxes. A track
editor modal (1200 lines) handles gates, sectors and neutral zones over a map.

**Maths** (`tabs/maths/maths_tab.dart`) splits at 700 dp into a channel list plus an
editor pane: metadata bar, expression editor, live preview, and insert panels grouped by
category (Filters, Reconstruction, Time-domain, Frequency, Correlation, Resampling, Math,
Trig). Two editors share one controller so switching is lossless — a raw-text editor and a
prototype chip editor that builds the expression as a tree of colour-coded draggable
chips with labelled empty argument slots, live output-unit inference, and hover definition
popovers.

**Analyze** (`tabs/analyze/analyze_tab.dart`) is a workbook bar over a chart workspace.
The 48 dp bar carries a workbook dropdown, a scrollable worksheet `TabBar` (double-tap a
label to rename), and a `+`. The workspace is a scrolling list of chart slots at a 300 dp
base height times a per-slot factor: time series, FFT, spectrogram, histogram, scatter,
GPS map, lap progression, table. Charts share one X range and one cursor pair per
worksheet. A lap × sector table renders below when any selected session has laps.

**Settings** (`tabs/settings/settings_tab.dart`) has seven sections — profile, units,
drive sync, firmware, controls, how-tos, about. Below 720 dp they stack in one scroll view
with firmware collapsed; at or above, a two-pane list-plus-detail layout. How-tos render
bundled Markdown from `app/assets/howtos/`.

## 7. Reusable widgets

`brand/` is the design system, re-exported through one `brand.dart` barrel:

- `MinimalSectionHead` — uppercase tracked label plus a hairline rule running to the right
  edge, optional flush-right trailing slot. The default header on every tab.
- `SpecRow` — NATOPS-style `KEY .... VALUE` with leader dots painted by `CustomPaint` so
  they align regardless of font rendering.
- `DenseRow` / `TableHeader` — 6 px vertical rhythm, caller-sized cells, selection shown
  as a `brandSurface2` fill plus a 3 px `brandGood` inset bar whose width is always
  reserved so selection never shifts layout.
- `QuietButton` — one widget, two families (outline and filled) at the 7 px radius, driven
  by a `ButtonEmphasis` enum: normal, accent (destructive), good (go), hivis (live), info
  (connect). Filled-normal is the one primary action per screen.
- `BrandSegmented` — hairline-bordered mutually-exclusive row with a `tight` toolbar
  density.
- `ToolGroup` / `IconBtn` — segmented icon cluster for New / Duplicate / Import / Export.
- `BrandChip` — mono pill, optional trailing × for removable filter and compare chips.
- `StatusDot` (`● LABEL`, colour owned by the call site), `StatusIcon` (icon + label +
  optional short value), `PulsingDot` (~0.9 s opacity pulse, the recording dash light),
  `StatusDropdownTrigger` (`● Connected · name ▾`, inline or full-width prominent).
- `CollapsibleSection` (160 ms ease, chevron in the section head's trailing slot),
  `NoteBlock` (1 px left rule callout, colour carries semantics), `BrandSheet` (title row
  + × + rule + scrollable body + optional pinned footer CTA, opened via `showBrandSheet`).

`widgets/` holds cross-tab non-brand components: `ChartContextMenu` (cascading right-click
and long-press menu with keyboard shortcuts), `ChartAction` (the ~20-value action enum for
cursors, zoom, pan, reset), `ColorGridPicker` (hue-rows × shade-columns swatch grid),
`GroupedChannelList` (collapsible groups, flat filtered list when searching),
`ModeAwareCheckbox`, and `time_format` / `value_format` axis and readout formatters.

## 8. Interaction conventions

Selection is a checkbox in a gutter with an XOR session-versus-lap mode; the muted
checkbox still responds and flips mode. Row body tap opens a detail pane, the chevron
expands in place. Dialogs outnumber sheets roughly five to one (29 files call `showDialog`,
6 call a bottom sheet) — sheets are the narrow-layout affordance for filters, device
picker, session detail and sync. Transient feedback is `SnackBar`, used heavily (97 call
sites). Hover is desktop-only polish: tooltips and `MouseRegion` appear in 12 files, and
the chip editor shows definition cards on hover. Drag exists in five places: chart slot
reordering, chip editor drag-into-slot, track sector editing, FIT export, map drag markers.
Empty states are a single dim mono sentence that names the next action, for example
"No sessions selected — pick runs or laps in the Data tab to load data." and "No sessions
yet. Import your first .idl0 or .gpx file." Errors are `brandAccent` mono text in place,
with a `NoteBlock` when the failure needs explanation.

## 9. What idl1 has today

`app/src/App.tsx` renders a `<main class="idl1-root">` with a `<nav>` of four plain
`<button>`s, an "Engine …" line, and the active page. Routes are notebook, device, data,
settings — Maths and Analyze have collapsed into Notebook. `App.css` is nine lines:
`system-ui` at 1.5 rem padding and a `#b00020` error colour. The only other stylesheet is
`routes/pages/Settings/settings.css`, 121 lines of layout-only BEM with one hardcoded
`rgba(0,0,0,0.08)` selection tint and a media-query two-pane split. Across 53 `.tsx` files
there are roughly thirty distinct class names, mostly semantic and unstyled. Markup is
native HTML — `fieldset`/`legend` for facet groups, `input type=checkbox`, `<ul>`. No
design tokens, no theme, no dark mode, no fonts bundled, no icon set, no component
library. Component boundaries already mirror idl0 (`FilterRail`, `DetailPane`,
`LapTable`, `HeroCard`, `ChannelsTable`, `ProfileBar`), and pure logic is split into
tested `.ts` modules beside each `.tsx`.

## 10. Gap table

| Flutter thing | idl1 equivalent today | Notes |
|---|---|---|
| `brand_tokens.dart` (13 colours, 2 radii, 1 pad step) | none | Needs a CSS custom-property file; values port one-to-one |
| IBM Plex Mono + Sans via `google_fonts` | `system-ui` | Must be bundled as woff2, no CDN (design doc §3) |
| Tabular figures on every style | none | `font-variant-numeric: tabular-nums` on the root |
| Dark-only `ThemeData` | none | Decide whether light is in scope at all |
| `AdaptiveScaffold` rail ↔ bottom bar at 600 dp | four `<button>`s in a `<nav>` | Hand-roll; no React equivalent package is pinned |
| `IndexedStack` tab-state retention | pages unmount on navigate | React needs explicit state hoisting or hidden mounts |
| Material icon set | none | Pick a bundled SVG set; ~25 glyphs are actually used |
| `MinimalSectionHead`, `SpecRow`, `DenseRow`, `QuietButton`, `BrandChip`, `StatusDot`, `PulsingDot`, `BrandSegmented`, `ToolGroup`, `NoteBlock`, `CollapsibleSection`, `BrandSheet` | none | Twelve components to rebuild; all are thin and CSS-expressible |
| `fl_chart` styled with brand tokens | Observable Plot, unstyled | Plot needs a theme layer: gridlines `#353A32`, mono tick labels, the 8-hue series cycle |
| Turbo colormap in Dart | none | Port the polynomial to TS, or emit rasters from Rust |
| `ChartContextMenu` + keyboard bindings | none | L6 scope; the action enum is a good port target |
| `showDialog` / `showBrandSheet` | none | `<dialog>` covers both; sheet is a mobile-positioned dialog |
| `SnackBar` (97 sites) | none | Needs a toast primitive early |
| `ColorGridPicker` | none | Per-channel colour override is a real feature, not decoration |
| Riverpod providers | `useReducer` + context (`state/AppState`) | Not a design gap, but affects where theme state lives |

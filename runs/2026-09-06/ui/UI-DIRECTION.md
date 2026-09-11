# idl1 UI direction

Design direction for the first styling pass, from an interview with Isaac on 2026-09-06.
Companions: `FLUTTER-UI-SURVEY.md` (what idl0 does today), `INTERVIEW-QUESTIONS.md`.
Screenshots reviewed: `idl0-app/docs/screenshots/` (8 phone captures, all five tabs).
Status: **final** — interview closed 2026-09-06.

## Decisions

1. idl1 is a **refinement** of the idl0 look, not a port or a restart — because: "the styling was pretty spot on, no need for a major shift"; the rewrite exists for the notebook and charting, not the skin.
2. Palette, mono-with-tabular-figures, hairlines and zero elevation carry over as-is — because: the core workflows (connect, configure, record, transfer) and their look "worked pretty well".
3. The Notebook replaces fl_chart + the hand-built chart language with the Observable stack — because: fl_chart was "tedious, never quite worked right"; the goal is agent-native analysis: finish a lap, agent picks charts and writes a session report trackside, automatically.
4. No logo, no imagery; at most a typeset wordmark — because: "function is the only form".
5. Dark is the design; a light variant is allowed as a user/OS option but is not first-class — because: Isaac always uses dark, "not opposed to the user/os option".
6. Density is high and fixed on every display, no density setting — because: "definitely want it pretty dense on all displays".
7. Device controls and data import are **mobile-first**; workbook authoring is **desktop-first**; viewing is optimised on both, even if the layouts differ — because: that is where each activity actually happens.
8. **Device** is the daily driver and the launch tab; the **Notebook** is where the layout budget and design time go — because: "Device is the big one now, and Analyze is where I want to improve it and spend more time".
9. Mono-for-chrome vs sans-for-chrome: delegated at first, confirmed in decision 34.
10. Tab order is **Device, Data, Notebook, Settings** on narrow screens — because: Device is the field tool, Data the library, Notebook the workspace; Maths has no tab of its own.
11. On a wide desktop the app is a **multi-column studio**, i2Pro/RaceStudio style: library filter | visual maths (React Flow node graph) | chart setup | notebook output — because: "kind of want to do it all at once on the ultrawide monitor"; the split is by screen space, not by task.
12. Desktop navigation is a **top bar, CAD-style**, not a left rail; bottom bar on narrow — because: a rail spends the width the columns need; Isaac: "a top bar might be more suitable".
13. Tab/column state **persists** across switching, all tabs — because: "yes".
14. **Command palette scaffolding lands now**; commands fill in per lane — because: "probably now, at least the scaffolding".
15. Device tab and notebook *output* are **touch-first** (big CTAs, tall rows); editors are pointer-first — because: "you'll notice the record button is huge on idl0"; the document is read trackside.
16. The component set must be able to **grow to a full race-team studio** — because: "it's just a few dropdowns you can think of now, but we're going to need a lot of the things".
17. Accessibility: keyboard should work because the library gives it for free; no screen-reader audit — because: "probably out of scope" (single-user tool).
18. No decorative animation beyond idl0's two; **playback is a feature, not an animation**: a play button runs the cursor at live speed, every plot pans, FFT/spectrogram windows re-compute — because: Isaac asked for it explicitly.
19. Components are **shadcn/ui on Tailwind v4** (Radix underneath, components copied into the repo, look carried by CSS variables) — because: "shadcn looks perfect"; it covers the studio-scale growth in decision 16.
20. On desktop the **workbook file is the document**; Data is the library feeding it; Maths and chart setup are editors *for* the document, docked as columns, not destinations — because: "mm yeah I think so".
21. Toasts: the primitive ships with shadcn (`sonner`); use it **only for important events on core workflows** (transfer done, config pushed, sync finished, import failed) — because: "just the important ones; very easy to add later".
22. The 13 idl0 colour tokens **port unchanged** — because: "port them for now" (re-tuning the surface ladder is deferred, see Open questions).
23. Two radii kept: 2 px structural, 7 px interactive; **zero elevation, no shadows** — floating menus get a hairline + one surface step instead — because: "yes", "sure".
24. IBM Plex Mono + Plex Sans, **bundled woff2**, no CDN — because: "yes"; CLAUDE.md §3.
25. Charts read as **app chrome**: near-black plot area, `#353A32` grid, mono tabular ticks; no paper theme — because: "yes" (Q25).
26. The 8-hue series cycle and per-channel colour override port exactly; **Turbo** stays for continuous data — because: "yes" (Q26–27).
27. **Day-one chart interactions:** shared cursors across all charts in a worksheet, right-click action menu, keyboard zoom/pan, drag-rectangle zoom, and live-speed playback — because: "I would call all of those day 1".
28. Figure export (SVG/PNG) is **later** — because: "can be later".
29. Cell editing is **IDE-with-panes on wide screens** (output column + editor column with Properties/Code), **inline document editing on medium**, and **read-only paper on narrow** — because: "was kind of envisioning the IDE with panes, but maybe the option for both; the IDE approach doesn't work on mobile".
30. Code is **collapsed at rest**, output only; a per-cell toggle reveals it — because: "sure".
31. Notebook output has **two registers, user-switchable**: *paper* (prose in Plex Sans, ~72 ch measure, 24 px cell gaps) and *studio* (raw black, dense, no measure, chart slots edge to edge) — because: "option for the distinct register, but also the raw black pure dense race studio".
32. CodeMirror gets a **brand-palette theme** built from the tokens, syntax colours from the 8-hue series cycle — because: "sure".
33. Data selection keeps idl0's **XOR session/lap model with muted-but-live checkboxes exactly** — because: "keep as is".
34. **Plex Mono for chrome and data, Plex Sans for prose** — confirmed — because: "yes".
35. Device tab refinements are **deferred to after the first build** — because: "better to just get building and worry about the specifics later".
36. Maps keep idl0's behaviour exactly: **live tiles from OSM standard / Esri satellite / Esri hybrid**, GPS trace drawn over whatever loads, no tile cache — because: "the current behaviour is good" (tiles are network data, not bundled code, so the no-CDN rule is not touched).
37. Lane order stands as listed in Suggested lane split; the other three recommendations in Open questions are accepted — because: "sounds good on the rest".

## Design tokens to adopt

All idl0 tokens (`brand_tokens.dart`) unless marked **new**. Expressed as CSS custom properties in `app/src/styles/tokens.css`, mapped onto shadcn's variable names (`--background`, `--card`, `--primary`, …) in the same file.

**Palette (dark, the design):**
`--bg #121412` page (brandBg) · `--surface #1A1E18` panels/cards/dialogs (brandSurface) · `--surface-2 #161915` recessed regions, tooltips, nav indicator fill (brandSurface2) · `--control #20251D` resting chip/segment/input fill (brandControlFill) · `--control-active #2D3327` selected segment/row (brandControlActive) · `--fg #EFEAE0` primary text (brandFg) · `--fg-dim #9A968A` labels, captions (brandFgDim) · `--fg-faint #6C6A60` placeholders, disabled (brandFgFaint) · `--rule #353A32` every hairline, chart grid and axis (brandRule) · `--accent #E63946` alert/error/destructive, never a large healthy fill (brandAccent) · `--good #35C46E` connected/OK/go CTA/selection bar (brandGood) · `--hivis #F5D547` live only: recording, armed, active nav box (brandHivis) · `--info #3B92E8` connectivity: BLE/WiFi/pair/connect CTA (brandInfo).
**new:** `--focus` = `--hivis` at 1 px outline + 2 px offset (idl0 had no keyboard focus ring; the web needs one).

**Type:** IBM Plex Mono for chrome, data, labels, numbers; IBM Plex Sans for prose (line-height 1.5). `font-variant-numeric: tabular-nums` on `:root`. Scale (px/weight): display 48/36/28 @600 lh 1.0; headline 24/20/18 @600 lh 1.0; title 16/600, 14/500, 12/500 dim tracked; body 14; body-small 12 dim; label 12/500, 11/500 dim; nav 10 uppercase. Weights 400/500/600 only. Tracking: uppercase labels 0.1em (brandLabelTracking 1.6 px @ 12 px → em), kickers 0.14em (brandKickerTracking 2.0). **Rule (new):** uppercase mono labels never wrap: shorten the word (`IMPERIAL` → `IMP`), never let the browser break it.

**Spacing:** 4 px base (brandPad); the scale is 4 · 6 · 8 · 12 · 14 · 16 · 24 · 32 (**32 new**, for column gutters). Dense rows: 6 px vertical rhythm (DenseRow). Touch-first surfaces (Device, notebook output): min hit target 44 px (**new**).

**Radii:** 2 px structural (brandControlRadius), 7 px interactive controls (brandControlRadiusSoft); cards, dialogs, sheets, menus, toasts 0 px with a 1 px `--rule` border. shadcn `--radius` = 7 px; card/dialog radius overridden to 0.

**Elevation:** none. Depth = surface step + hairline. Floating layers (menu, popover, tooltip, toast): `--surface-2` fill, 1 px `--rule`, no `box-shadow` (strip shadcn's).

**Dark/light rule:** dark is authored; tokens are defined on `:root` and can be re-declared under `[data-theme=light]` later. No light values are written in the first pass; nothing may hardcode a hex outside `tokens.css`.

## App shell and navigation

- **Narrow (< 600 px):** bottom bar, four destinations in order Device · Data · Notebook · Settings, amber hairline box as the active indicator (idl0). One column visible.
- **Medium (600–1200 px):** top bar; the active destination fills the width; secondary panes (filter rail, properties) open as docked side panels or sheets.
- **Wide (≥ 1200 px, ultrawide target):** top bar; a dockable column layout. Reference layout: Data/library filter (280) | Maths graph (flex) | Chart/cell properties (320) | Notebook output (flex). Columns collapse to icons individually; the Notebook output column is never collapsed. Model (decision 20): Notebook = maths graph + properties + output columns; Data docks left of it; on narrow each column is its own screen. **Amended 2026-09-07 (R107):** the Notebook studio drops the library column (it duplicated the Data tab); the frame keeps the ability to host it for a future filtering widget.
- **Top bar contents (desktop):** app wordmark, destination tabs, active session/lap chips, playback transport (play/pause, live-speed cursor), command-palette trigger (⌘/Ctrl-K), device status dot.
- **Amended 2026-09-11 (R220): the shell is VS Code’s anatomy at R212’s density.** Top to bottom, the window is: a **title bar** (32 px, R216’s custom bar) carrying the app glyph, a real **menu bar** (File · Edit · View · Go · Help) whose every entry resolves to a command that exists today, the drag region and the window controls; an **activity bar** (48 px, left) of four icons — Device, Data, Notebook, Settings — the active one marked by an amber left accent bar, with live badges and `Ctrl+1..4`; a **sidebar** (resizable 200–480 px, `Ctrl+B`, remembered per aspect class like R213’s presets) holding the active activity’s own list and navigation; the **editor area**, which is the Notebook toolbar row over `RouteHost`; and a **status bar** (22 px) carrying the session chip, the device link, the background-job chip, the chart memory meter and the layout preset’s name. This supersedes “Top bar contents” above: the destination tabs became the activity bar, the chips and the device dot moved to the status bar, and the palette trigger became `View ▸ Command palette` with the same `Ctrl/⌘-K`.
  - **Sidebar content, by activity:** Device → the device list (connected, in range, scan); Data → the library’s filter rail; Notebook → the workbook list and the cells outline; Settings → its section list. Each page portals its own content into a shell-owned slot (`shell/sidebarSlot.ts`), so the state behind a list stays in the page that owns it.
  - **Not built, and why:** no sync item in the status bar and no sync badge — the app has no sync state to read yet; no worksheet tabs — the document model has no worksheet; the Data activity’s sidebar holds the filter rail rather than the session list, because that list is a seven-column table that a 200–480 px strip cannot hold without being redesigned into a different control.
  - **Narrow (< 600 px)** keeps R184’s paper/sheet behaviour: no activity bar and no sidebar, the four activities as a 48 px bottom tab bar with the status folded into it as badges, and the menus behind one “⋯” button in the title strip.
  - **Dock zones (R218, queued)** dock panels into the editor area only, never into the activity bar, the sidebar or the status bar.
- **Persistence:** every destination and column keeps its state while hidden (mount-and-hide, not unmount). Column widths and collapsed state persist per machine.

## Per-tab layout direction

**Notebook.** The workbook file rendered as a document, in one of two registers (decision 31). Wide: `Resizable` columns — maths graph (reserved, empty shell in pass one) | cell editor (`Tabs`: Properties · Code, CodeMirror with the brand theme) | output. Selecting a cell in the output focuses it in the editor; code is hidden in the output unless toggled (decision 30). Medium: output with an inline editor under the selected cell. Narrow: paper view, editors collapsed, Properties form as a `Sheet`. Worksheet bar (workbook `Select`, worksheet `Tabs`, `+`) sits under the top bar. Key components: `NotebookColumn`, `CellFrame` (kicker, status dot, code toggle, error `NoteBlock`), `CellEditor`, `PropertiesForm`, `WorksheetBar`, `PlaybackTransport`, `CursorReadout`, `ChartContextMenu`.

**Device.** Ported layout, touch-first (decision 15): `HeroCard` three-state machine (Connect `--info` / Start recording `--good` / Stop `--hivis` with timer, full-width, ≥ 56 px tall), status strip of `StatusIcon`s, mode line, Push/Pull `Button` pair, Files row with `Badge` count, `ConfigCard` (profile `Select`, expandable channels `Table` with per-source `Dialog`), collapsed calibration `Collapsible`. Single column at every width; on wide it docks at 480 px and the rest of the width is unused or holds the Notebook. Refinements deferred (decision 35).

**Data.** McMaster-style faceted browser. Wide: 280 px `FilterRail` (facet `Collapsible` groups with `(N)` counts, `Badge` chips for active filters) | results (pinned `TableHeader`, date·venue groups of `DenseRow`s, lap sub-rows) | 320 px `DetailPane` (map, `SpecRow` metadata, `Input` fields). Narrow: filter rail becomes a bottom `Sheet` from a filter bar; detail is a full-height `Sheet`. Selection model exactly idl0 (decision 33), 3 px `--good` inset bar reserved. Import is a top-right `Button` + drag-and-drop target on the results panel.

**Settings.** Sections as `SectionHead` + content: profile, units (`ToggleGroup` + `SpecRow` readouts), sync (LAN pairing status `StatusDot` + `Button`), firmware (`Collapsible`), controls (`SpecRow` key bindings), theme (dark / follow-OS `Select`, output register), how-tos (bundled Markdown), about. Narrow: one scroll. Wide: list + detail at 720 px.

## Component approach

**shadcn/ui on Tailwind v4 + Radix Primitives** (decision 19). Components are generated into `app/src/components/ui/` and edited freely; the theme is `tokens.css` only. Tailwind is a build-time dependency; nothing is fetched at runtime.

Must cover, first pass: `dialog` and `sheet` (sheet = bottom on narrow, right on wide), `dropdown-menu` + `context-menu` (the chart action menu), `select`, `tooltip`, `popover`, `tabs`, `toggle-group` (BrandSegmented), `checkbox`, `switch`, `input`, `button` (variants map to ButtonEmphasis: default/outline · accent · good · hivis · info), `badge` (BrandChip), `resizable` (desktop columns), `command` (palette scaffold), `sonner` (toasts), `table` (dense, with the reserved 3 px selection bar), `collapsible`, `scroll-area`.
Hand-rolled on top of tokens, no library: `SectionHead` (uppercase kicker + hairline), `SpecRow` (leader dots via a repeating radial gradient), `StatusDot`, `PulsingDot`, `NoteBlock`, `DenseRow`.
**Focus and keyboard:** Radix supplies focus trapping, roving tabindex, typeahead and Escape; we add the `--focus` ring and `Ctrl/⌘-K` for the palette. No screen-reader work (decision 17).

## Chart style rules for Plot

One theme function `plotTheme()` in `app/src/notebook/plotTheme.ts` applied to every `Plot.plot` (host-side and inside the sandbox bundle): `style: {background: var(--bg), color: var(--fg-dim), fontFamily: mono, fontVariantNumeric: tabular}`, grid and axis lines `--rule`, tick labels 11 px `--fg-dim`, axis titles 11 px uppercase tracked, no frame, `marginLeft` sized for 6 tabular digits. Plot area is the page background — charts are chrome, not paper.
**Series:** `brandChartPalette` in order azure `#5BA6F0` · green `#35C46E` · amber `#F5D547` · orange `#E8964B` · violet `#B98AE6` · teal `#3FC9C0` · rose `#E86FA6` · coral `#E05A63`, wrapped by index; per-channel override persists in the workbook. Continuous rasters: Turbo. Selected/best lap uses `--good`; deltas vs best use `--accent` for slower, `--good` for faster (as the idl0 lap table).
**Cursor/hover:** cursor lines 1 px `--fg-dim`; readout chips mono tabular on `--surface-2` with hairline; cursors are per-worksheet and shared by every chart in it; playback moves the same cursor.
**Empty state:** one dim mono sentence naming the next action, centred in the slot. **Error state:** `--accent` mono text in place, `NoteBlock` when explanation is needed; never a blank slot.

## Non-goals for the first styling pass

- Light theme as a designed artefact (tokens must allow it; nobody styles it yet) — from decision 5.
- Brand mark / imagery — from decision 4.
- The React Flow maths graph itself (shell reserves the column only) — from decision 11.
- Screen-reader audit — from decision 17.
- Figure export — from decision 28.
- Light palette values — from decision 5.

## Open questions

- **Surface ladder re-tune.** Ported unchanged (decision 22). Recommendation if panels blur into the background on a large monitor: lift `--surface` to `#1C201A` and `--control` to `#232920`, one edit in `tokens.css`.
- **Which tab opens on a wide desktop** (accepted, decision 37). Decision 8 says Device; on an ultrawide the natural default is the studio (Data | Notebook) with Device docked. Recommendation: launch on Device below 1200 px, on the studio layout above it, and remember the last layout.
- **Notebook register default** (accepted, decision 37). Recommendation: paper on narrow, studio on wide, both switchable in Settings and the worksheet bar.
- **Device tab refinements** (decision 35): Isaac has ideas; collect them as a list in `TASKS.md` after UI-5 lands.

## Suggested lane split

Each ≤ 1 day for a Sonnet implementer, in order; each is its own PR from a worktree; L7/L6 ownership as in the design doc §10.

1. **UI-1 tokens + fonts.** Add Tailwind v4 + shadcn init; write `app/src/styles/tokens.css` (palette, type scale, spacing, radii, shadcn variable mapping), bundle Plex Mono/Sans woff2 under `app/src/assets/fonts/`, `@font-face`, tabular-nums on root; replace `App.css`. Touches: `app/package.json`, `app/vite.config.ts`, `app/src/styles/`, `app/src/App.css`, `app/src/main.tsx`.
2. **UI-2 primitives.** Generate and restyle `button` (five emphases), `badge`, `input`, `select`, `checkbox`, `switch`, `toggle-group`, `tabs`, `collapsible`, `tooltip`, `scroll-area`; hand-roll `SectionHead`, `SpecRow`, `StatusDot`, `PulsingDot`, `NoteBlock`, `DenseRow`/`TableHeader`. Touches: `app/src/components/ui/`, `app/src/components/brand/`.
3. **UI-3 overlays.** `dialog`, `sheet` (bottom on narrow, right on wide), `dropdown-menu`, `context-menu`, `popover`, `sonner` toast with the four core-workflow events wired. Touches: `app/src/components/ui/`, `app/src/components/Toaster.tsx`.
4. **UI-4 shell.** Top bar + bottom bar at 600 px, four destinations in the new order, mount-and-hide persistence, `Resizable` column frame for wide with persisted widths, `command` palette scaffold on Ctrl/⌘-K with tab-switch commands. Touches: `app/src/App.tsx`, `app/src/shell/`, `app/src/state/`.
5. **UI-5 Device restyle.** Apply primitives to `HeroCard`, status strip, `ConfigCard`, `ChannelsTable`, `ProfileBar`; 44 px targets; touch-first. Touches: `app/src/routes/pages/Device/`.
6. **UI-6 Data restyle.** `FilterRail`, results table, `DetailPane`, filter sheet on narrow, selection bar. Touches: `app/src/routes/pages/Data/`.
7. **UI-7 Settings restyle** + theme/register controls. Touches: `app/src/routes/pages/Settings/`, delete `settings.css`.
8. **UI-8 Plot theme.** `plotTheme()`, series palette, Turbo port to TS, empty/error slot states; applied host-side and in the sandbox bundle. Touches: `app/src/notebook/plotTheme.ts`, `app/src/notebook/sandbox/`.
9. **UI-9 CodeMirror theme.** Brand theme + highlight style for md/js/math modes. Touches: `app/src/notebook/editor/cmTheme.ts`.
10. **UI-10 Notebook frame.** `CellFrame`, code toggle, two output registers, worksheet bar, wide/medium/narrow editor placement (Properties/Code `Tabs`, `Sheet` on narrow). Touches: `app/src/routes/pages/Notebook/`.
11. **UI-11 cursor + transport.** `CursorReadout`, `ChartContextMenu` over the L6 action set, keyboard zoom/pan bindings, `PlaybackTransport` in the top bar driving the shared cursor. Touches: `app/src/notebook/interaction/`, `app/src/shell/TopBar.tsx`.

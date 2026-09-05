# idl1 Wave 2 — L6: Notebook tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `NotebookPage`'s wave-1 canvas polyline into the notebook design
§6 describes: a `.idl1wb` workbook rendered as a scientific paper — prose,
`math`, `table` and `js` cells — with the JS cells executing inside a
sandboxed, origin-isolated iframe over `@observablehq/runtime` + Plot + D3 +
Inputs; pan, zoom and hover that never touch IPC; Rust rasters layered under
Plot axes; a CodeMirror 6 Code pane; and a Properties pane over the pure
`plotForm` module that generates and parses the C2 §5.3 Plot subset. Done when
design §10's L6 row holds: *pan/zoom/hover on a real session at 60 fps
desktop; `plotForm` round-trips its subset.*

**Architecture:** All of it is `app/src/routes/pages/Notebook/**` plus this
lane's own `*.test.ts` files. Nothing in `rust/`, `app/src-tauri/`, or any
lead-owned shared file is touched (wave-2 operating brief §2). The tab
decomposes into four layers, inner to outer:

```
Notebook/
  plotForm/            PURE. C2 §5.3 grammar: generate(props)→code, parse(code)→props|null.
                       Zero React, zero IPC, zero DOM. > 80 % covered (design §10).
  model/               PURE. Cell segmentation over C2 §2, tier selection, tile cache,
                       point budget, gesture→settle state machine, cursor debounce.
                       Zero React, zero IPC. > 80 % covered.
  host/                The iframe host: postMessage protocol, watchdog, host-variable
                       injection, transferable ArrayBuffers. Protocol module is pure;
                       the host object is thin over it.
  sandbox/             The iframe's own bundle: Runtime + Inspector + Plot + d3 + Inputs.
                       Never imports @tauri-apps/api. Not unit-tested (it is rendering).
  components/          React. Panes, chart frame, editors, readout. Not unit-tested.
  index.tsx            The page. Replaces routes/pages/NotebookPage.tsx.
```

The **only** modules allowed to call `invoke()` are the existing
`app/src/ipc/*.ts` wrappers; every Notebook module takes an injected
fetcher function instead, which is what makes `model/` testable without
mocking Tauri. The sandbox iframe cannot reach IPC at all — it has no
`allow-same-origin`, so `window.__TAURI_INTERNALS__` is not in its realm; the
host mediates every value it sees (design §6).

**Tech Stack:** React 19 + TypeScript + Vite + vitest at their landed pins.
New npm dependencies, all at the M0 ecosystem report's pins:
`@observablehq/runtime` `^6.0.0`, `@observablehq/plot` `^0.6.17`,
`@observablehq/inputs` `^0.12.0`, `d3` `^7.9.0`, `codemirror` `^6.0.2`,
`@codemirror/lang-javascript` `^6.2.5`, `@codemirror/lang-markdown` `^6.5.2`,
plus `htl` (unpinned — C2 §8 open question 1, see Open Questions Q1).
**This lane may not add them**: `package.json` is lead-owned (operating brief
§2), so Q1 must be ruled and applied as a lead shell task before Task 5 is
dispatched. Tasks 1–4 need no new dependency and can start immediately.

**Spec:** `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §6 (the
notebook, read in full — sandbox, cell API, editor, interaction rules, point
budget), §3 (principles), §10 (the L6 row is the done-criteria);
`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` (the file format
this tab renders and edits — §2 cells, §3 math, §4 table, §5 JS and the
`plotForm` grammar, §8 open questions);
`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md` §3.4 (workbook),
§3.5 (tiles, v2 layout), §3.6 (rasters), §3.7 (cursor), §4 (interaction
budget — the checkable half of design §6);
`docs/superpowers/specs/2026-09-03-idl1-c4-data-directory.md` §4 (atomic
writes, self-write suppression);
`docs/superpowers/specs/2026-09-02-idl1-m0-ecosystem.md` (version pins);
`runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` (ownership, contract freeze,
gates); `runs/2026-09-03/decisions.md` (R31, R37–R39, R41–R49);
`CLAUDE.md` (standing orders).

**Spec discipline:** **spec-during** (CLAUDE.md §6). Task 16 writes
`docs/IDL0_SPEC.md`'s notebook section in the same PR as the last of the code
it documents. Concretely: §25 (*Tab — Maths*) and §26 (*Tab — Analyze*) both
describe idl0's Flutter tabs and are superseded by **one new §26 "Tab —
Notebook"** covering cells, the two editing panes, the interaction rules and
the point budget; §25 is replaced by a pointer to it, since idl1 has no
separate maths tab — math cells live in the notebook. Every other task is
**"no spec change needed"** — it implements C2/C3/design §6, which already
are this lane's spec. Task 16 also files the C2/C3 amendment text for any
question ruled during the lane, for the lead to apply (this lane never edits
a contract, operating brief §3).

## Global constraints

- **Worktree and branch.** Setup, before Task 1's first step:
  ```bash
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
  git worktree add -b wave2-l6-notebook "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook" main
  cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app-worktrees/wave2-l6-notebook"
  git submodule update --init -- rust
  cd app && npm ci
  ```
  Working directory for every task: `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app-worktrees\wave2-l6-notebook\app`.
- **No cargo, ever, in this worktree.** The §8 hook denies it (operating brief
  §4). The `rust/` submodule is initialised only so `tsc` and imports resolve;
  it is never built.
- **Ownership.** This lane writes only under `app/src/routes/pages/Notebook/**`
  and its own `*.test.ts`. `app/src/ipc/*.ts` takes **additive type fixes
  only**, and only where the file disagrees with C3 as written — never a new
  command. A need for `App.tsx`, `App.css`, `main.tsx`, `routes/types.ts`,
  `state/AppState.tsx`, `package.json`, `vite.config.ts` is a **question to
  the lead**, applied as a serialized shell task on `main`, then rebased.
- **Per-task gate**, never skipped (operating brief §4), run from `app/`:
  ```
  npx tsc --noEmit && npx vitest run <filter named in the task>
  ```
  `vitest` must report a **non-zero `passed` count**; a filter matching
  nothing is a failed gate, not a pass.
- **Lane merge gate:** `npx tsc --noEmit && npx vitest run` (whole TS suite),
  then the lead merges and eyeballs the tab in the running dev app.
- TDD, Arrange/Act/Assert with blank lines between; tests beside the module as
  `*.test.ts`; test names `thing — condition — result` (CLAUDE.md §4).
- Doc comment on every exported symbol; **units on every numeric value**
  (`tUs`, `columnCount`, `pxPerColumn`); `// TODO(idl0):`, never bare `// TODO`.
- Coverage: every module under `plotForm/` and `model/` is a pure TS module
  and must exceed **80 %** (design §10). React components are **not**
  unit-tested (CLAUDE.md §4) — assertions on them live in the reviewer's
  eyeball pass, not in vitest.
- Every task ends with a **CHANGELOG.md** bullet under `[Unreleased]`.
  `TASKS.md`'s `L6 notebook UI` item is ticked only by Task 16.
- **No AI attribution trailers.** **Never `git push`** — Isaac pushes.
- **No CDN, ever** (design §3): every library is bundled by Vite into the app
  and into the sandbox iframe's own bundle. No `<script src="https://…">`,
  no webfont URL, no map tile server.

---

## Performance budget

Design §6's interaction rules, restated as statements a reviewer can check by
grepping the diff. Every task's review runs this list; a violation is a
blocking finding, not a note.

- **P1 — No `invoke` inside a pointer, wheel, touch or animation-frame
  handler.** Grep the diff for `onPointerMove|onWheel|onTouchMove|requestAnimationFrame`
  and confirm no call path from any of them reaches `app/src/ipc/`. IPC is
  reached only from a settle callback, an explicit user action, or a mount
  effect (C3 §4).
- **P2 — Hover reads the tile's column region, never `cursor_readout`.**
  The hover path reads `DecodedTile.columnMin/columnMax/columnMean/columnTUs`
  out of the tile cache. `cursorReadout()` appears only inside the settle
  debounce (C3 §4, design §6).
- **P3 — Zoom during the gesture is a transform, not a fetch.** A pinch/wheel
  frame updates a CSS/canvas transform only; `fetchTile` at the new tier is
  called once, from the settle callback.
- **P4 — Pan during the gesture is a translation.** Only newly exposed edge
  tile indices are requested, and only on settle. Prefetch runs on a
  timer/lookahead, never from a gesture frame.
- **P5 — Point budget.** A line mark receives at most `2 × pixelWidth` points
  per series; the budget function is pure and tested (Task 7). Density
  (spectrogram, 2-D histogram) is a Rust raster, never a JS point cloud.
- **P6 — `eval_workbook` is debounced.** It runs on workbook open, on a
  `watch_workbook` event, and on a debounced editor change — never per
  keystroke, never per frame (C3 §4).
- **P7 — Heavy arrays cross as bytes.** Every array reaching the sandbox is a
  transferable `ArrayBuffer` in `postMessage`'s transfer list, never a JSON
  array of numbers (CLAUDE.md §2, design §4).
- **P8 — Rust = numbers, JS = pictures.** No decimation, filtering, FFT,
  binning, statistics or unit conversion is implemented in TypeScript. The
  only arithmetic this lane owns is layout: pixel↔time mapping, tier choice,
  and cache keys. A number the sync model depends on is never computed here.

---

## Parity gaps

Every idl0 Analyze/Maths feature this plan does not deliver, with the reason.
Silence is not deferral (operating brief §2). Source:
`idl0-app/app/lib/ui/tabs/analyze/` and `.../maths/`, and `ChartSlot` in
`app/lib/data/worksheet.dart`.

**Delivered in this plan** — time-series line charts (multi-channel, colours,
manual/auto y domain, log/sqrt y scale, lap scope), spectrogram, 2-D
density heatmap (the scatter chart's density mode), hover readout, cursor
readout, pan/zoom, table cells, math cells with the full 69-function catalog,
per-cell errors, live file reload, save with conflict detection.

| idl0 feature | Status | Reason |
|---|---|---|
| **FFT chart** (`fft_chart.dart`, `Averaging`, `SpectralParams`) | **Deferred — blocked on IPC** | C3 has no 1-D FFT endpoint. A magnitude spectrum is *numbers*, so CLAUDE.md §2 forbids computing it in JS; the math catalog's `fft(ch, window)` returns a bin-indexed channel with no frequency axis attached. IPC need **N5**; the chart is one `js` cell once it lands. |
| **1-D histogram chart** (`histogram_chart.dart`: bin count, symmetric range, smooth polyline, log count) | **Deferred — blocked on IPC** | Same rule: binning is numbers. C3 §3.6 has only the **2-D** `histogram2d` raster. IPC need **N6**. |
| **Scatter — point-cloud mode** (`ScatterMode.points`, colour-by third channel, equal aspect, reference g-circles) | **Deferred to wave 3** | Density mode is covered by `fetch_raster` `histogram2d`. A decimated point cloud needs a paired-sample endpoint C3 does not have (IPC need **N7**, marked wave 3). Equal-aspect and g-circles are then pure Plot options. |
| **GPS map chart** (`gps_map_chart.dart`, `map_tile_source.dart`, Turbo colour-by-channel) | **Deferred to wave 3 — needs a ruling** | Basemap tiles come from a tile server. "Offline-first means bundled. No CDN, ever" (design §3) forbids that outright. Open Question **Q8**. The trace itself (a GPS polyline, no basemap) is expressible today as a custom `js` cell. |
| **Lap table** (`lap_table.dart`, 1147 lines: lap × sector grid, Main/Overlay designation, sector splits) | **Partly deferred** | The *data* is a `table` cell over C2 §4 and renders in Task 15. The **Main/Overlay lap designation** that drives it is not representable: `eval_workbook` has no lap-context argument (Open Question **Q5**, IPC need **N4**). |
| **Lap progression chart** (`lap_progression_chart.dart`) | **Not carried** | C2 §6 already drops it: `lapProgression` is outside the `plotForm` grammar and is not migrated. Authorable as a custom `js` cell from `list_laps` data. |
| **Variance trace chart** (`varianceTrace`, `variance_time`/`variance_dist`) | **Deferred — blocked on IPC** | Both functions are `Implemented` in the math catalog but read `MathLapContext`'s main/overlay pair, which `eval_workbook` cannot be given. Same blocker as the lap table: **Q5** / **N4**. |
| **X-axis modes** (`XAxisMode.wheelDistance`, `.gpsDistance`) | **Not carried** | C2 §6 drops `xAxisMode` explicitly; `plotForm`'s `x` is always `"t"` and `x.type` accepts only `"linear"` (C2 §5.3, §8-2). Widening the grammar is a contract change, not an L6 decision. |
| **Worksheets** (`workbook_bar.dart` tabs, per-sheet x-axis mode, sheet rename/add) | **Not carried** | C2 §6: v3 has no worksheet concept — a `.idl1wb` is one flat cell sequence. Reading order is document order. |
| **`heightFactor`, `showZeroLine`, chart `title`, `scope: session`** | **Not carried** | C2 §6 drops all four: no `plotForm` grammar slot exists for any of them. A zero line and a title are one line of custom `js` each. |
| **`yScale: sqrtSigned` / `squareSigned`** | **Not carried** | C2 §6 maps both to plain `linear` with a warning; the grammar's `y.type` enum is `linear\|log\|sqrt`. |
| **Maths tab chip editor** (`chip/chip_expression_editor.dart`, the drag-a-chip builder) | **Not carried** | Superseded by D13: the two editing surfaces are Properties and Code. The chip builder's job — "compose an expression without typing" — is the Properties form's job for charts and (later) the Agent tab's for math. |
| **Function insert panel + context help** (`insert_panels.dart`, `function_help_panel.dart`) | **Reduced to autocomplete** | Task 12 ships CodeMirror completion over C2 §3.3's 69-function catalog with signature text. The separate browsable panel and the definition popover are not ported. |
| **Math channel metadata bar** (`channel_metadata_bar.dart`: quantity, units, rate, decimal places, colour) | **Not carried** | C2 §6 drops `quantity`/`units`/`decimal_places`/`sample_rate_hz` — v3 has no per-definition display metadata. The surviving affordance is C2 §3.1's `# label:` display name. Colour moves to the mark's `stroke`. |
| **Unit inference / `MathQuantity.defaultUnit`** | **Reduced to a label suggestion** | C2 §1 narrows `units: si\|imperial` to an editor *preference* consulted only when the Properties form suggests an axis label (C2 §3.4's table). No v3 construct converts units. |
| **Expression live preview** (`expression_preview.dart`) | **Reduced** | Task 15 renders each math definition's result and per-definition error inline under the cell — the same information, on the cell rather than in a dedicated pane. |
| **Workbook Drive sync settings** (`workbook_sync_settings_dialog.dart`) | **Not carried** | Superseded by D7/L11 LAN sync; Google Drive is not on the idl1 line. |
| **Chart context menu / vertical zoom per slot** | **Deferred to wave 3** | Zoom is uniform in this plan (Task 9). Per-axis vertical zoom is an interaction refinement, not a data capability. |
| **Workbook migration Stage 2** (`_migrate_charts` → `plotForm.generate`, C2 §6) | **Deferred** | Ruling R30 dropped workbook migration from wave 1 and no migrated file exists yet. `plotForm.generate` (Task 2) is the whole engine Stage 2 needs; wiring it to `_migrate_charts` is a small wave-3 task. |
| **Mobile paper view** (design §6) | **Not carried** | Design assigns it to L9 (wave 2–3 mobile), not L6. The components this plan builds are the ones it will render. |

---

## Task 1: `routes/pages/Notebook/` — the directory move, no shell change

**Files:**
- Create: `app/src/routes/pages/Notebook/index.tsx` (the wave-1 page, moved verbatim), `app/src/routes/pages/Notebook/README.md` (one paragraph: what lives in which subdirectory, quoting this plan's architecture block)
- Delete: `app/src/routes/pages/NotebookPage.tsx`
- Modify: nothing else. `App.tsx` imports `./routes/pages/NotebookPage`; a directory named `Notebook` with an `index.tsx` does **not** resolve that specifier.

**Interfaces:** unchanged — `export default function NotebookPage()`.

**The `App.tsx` import is the one shared-file touch this lane needs**, and
`App.tsx` is lead-owned (operating brief §2). Two ways out, and this task
takes the second so the lane never blocks on a shell task: keep a
one-line **re-export shim** at the old path.

- [ ] **Step 1: Move the page**

  `git mv src/routes/pages/NotebookPage.tsx src/routes/pages/Notebook/index.tsx`.
  Content unchanged except the two relative imports, which gain one `../`
  (`../../ipc/catalog` → `../../../ipc/catalog`, same for `../../ipc/tiles`).

- [ ] **Step 2: Leave a re-export shim at the old path**

  `app/src/routes/pages/NotebookPage.tsx`:
  ```ts
  /** Re-export shim so `App.tsx` (lead-owned, operating brief §2) keeps its
   *  existing import specifier while L6 builds the tab out under
   *  `Notebook/`. Deleted by Task 16 together with the one-line `App.tsx`
   *  change, applied by the lead as a shell task at the lane merge. */
  export { default } from "./Notebook";
  ```

- [ ] **Step 3: Write `Notebook/README.md`**

  One paragraph naming `plotForm/`, `model/`, `host/`, `sandbox/`,
  `components/` and the rule that only `app/src/ipc/` calls `invoke`.

- [ ] **Step 4: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook`
  Expected: `tsc` silent. **Vitest matches nothing at this point** — so for
  **this task only**, the vitest half of the gate is
  `npx vitest run src/ipc` (the landed suite, ≥ 1 passed), proving the move
  broke nothing. Every later task uses its own real filter.

- [ ] **Step 5: CHANGELOG**

  `- **Notebook tab: page becomes a directory (L6 Task 1).** routes/pages/NotebookPage.tsx → routes/pages/Notebook/index.tsx with a re-export shim; no behaviour change.`

- [ ] **Step 6: Commit**

  `git add -A && git commit -m "app: Notebook page becomes a directory (L6 Task 1)"`

---

## Task 2: `plotForm.generate(props) → code`

**Files:**
- Create: `Notebook/plotForm/types.ts`, `Notebook/plotForm/generate.ts`, `Notebook/plotForm/generate.test.ts`

**Interfaces:**
- Produces `PlotProps`, `MarkProps`, `AxisProps` — the Properties pane's
  internal state, exactly C2 §5.3's four worked examples' `props` shape — and
  `generate(props: PlotProps): string`.
- Consumes: nothing. Pure. No React, no DOM, no IPC.

**Spec discipline:** no spec change needed — C2 §5.3 is the spec.

- [ ] **Step 1: Write the failing tests from C2 §5.3's four worked examples**

  `generate.test.ts` — four tests, one per worked example, each asserting the
  **byte-identical** string C2 §5.3 prints (including the two-space indent,
  the trailing `\n` policy the implementer fixes and documents, and key order:
  `x`, `y`, `color`, `marks`). Names:
  - `generate — C2 §5.3 example 1, single channel with axis labels — emits the contract's exact code`
  - `generate — C2 §5.3 example 2, two marks with strokes, log y domain and legend — emits the contract's exact code`
  - `generate — C2 §5.3 example 3, lap-scoped dot mark with strokeWidth — emits the contract's exact code`
  - `generate — C2 §5.3 example 4, areaY with an explicit x window — emits the contract's exact code`
  Plus three shape tests:
  - `generate — a props with no x, y or color — emits marks only`
  - `generate — a mark with lap null — omits the lap options object entirely`
  - `generate — five mark names in turn — each emits Plot.<name>(channel(...), ...)`

- [ ] **Step 2: Write `types.ts`**

  ```ts
  /** One mark in the Properties form's state (C2 §5.3's `mark` production).
   *  `lap` is a 1-based lap number (C3 §3.2's `LapSummary.number`) or null
   *  for session scope; `strokeWidth` is in CSS pixels. */
  export interface MarkProps {
    channel: string;
    mark: "lineY" | "dot" | "areaY" | "rectY" | "ruleY";
    lap?: number | null;
    stroke?: string;      // any valid CSS colour literal
    strokeWidth?: number; // px
  }
  export interface XAxisProps { label?: string; domain?: [number, number]; }
  export interface YAxisProps { label?: string; domain?: [number, number]; type?: "linear" | "log" | "sqrt"; }
  export interface PlotProps {
    marks: MarkProps[];        // required; the form always seeds one (C2 §5.3)
    x?: XAxisProps;
    y?: YAxisProps;
    color?: { legend: true };
  }
  ```
  Every field carries a doc comment naming its C2 §5.3 production and its
  unit where numeric. `x.type` is **absent from the type**: C2 §5.3 says the
  generator never emits it, and admitting a field the generator cannot write
  would make round-trip provably false. Note that in the doc comment, citing
  C2 §8-2.

- [ ] **Step 3: Implement `generate.ts`**

  A string builder, not a JS-AST printer: the grammar is closed and tiny, and
  a printer would be a dependency this lane may not add. Emission order is
  fixed (`x`, `y`, `color`, `marks`) because C2 §5.3 makes that order the
  condition for byte-identical round-trip. Strings are emitted with
  `JSON.stringify` so a label containing a quote cannot produce invalid code.

- [ ] **Step 4: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm`
  Expected: 7 passed, 0 failed.

- [ ] **Step 5: CHANGELOG**

  `- **plotForm.generate (L6 Task 2).** Emits the C2 §5.3 Plot subset byte-identically for all four of the contract's worked examples.`

- [ ] **Step 6: Commit** — `app: plotForm.generate over the C2 §5.3 subset`

---

## Task 3: `plotForm.parse(code) → props | null`, and the round trip

**Files:**
- Create: `Notebook/plotForm/parse.ts`, `Notebook/plotForm/parse.test.ts`, `Notebook/plotForm/roundTrip.test.ts`, `Notebook/plotForm/index.ts` (re-exports `generate`, `parse`, the types)

**Interfaces:**
- Produces `parse(code: string): PlotProps | null`. `null` means **custom**
  — the Properties pane greys out (design §6, C2 §5.3's exact rule).
- Consumes `types.ts`, `generate.ts` (round-trip test only).

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `parse.test.ts` — the four worked examples parse back to props deep-equal to
  the originals (four tests), plus **one test per bullet of C2 §5.3's
  "Custom — the exact rule"**, each asserting `null`:
  - `parse — code with a statement before the Plot.plot call — returns null (custom)`
  - `parse — an unrecognised plot option key such as facet — returns null (custom)`
  - `parse — y.type outside the linear|log|sqrt enum — returns null (custom)`
  - `parse — a mark name outside the five in the grammar — returns null (custom)`
  - `parse — mark options carrying a key beyond x/y/stroke/strokeWidth — returns null (custom)`
  - `parse — mark x or y not the literal strings t and v — returns null (custom)`
  - `parse — a channel call with a session key — returns null (custom)`
  - `parse — a computed stroke read from a variable — returns null (custom)`
  - `parse — two top-level Plot.plot calls — returns null (custom)`
  Plus the order-insensitivity rule C2 §5.3 states explicitly:
  - `parse — recognised keys in a hand-reordered order — parses successfully`

  `roundTrip.test.ts`:
  - `generate then parse — every combination of the props grammar — returns props deep-equal to the input`
    (a hand-rolled exhaustive generator over the closed grammar: 5 mark names
    × {lap null, lap 3} × {no stroke, stroke} × {no strokeWidth, strokeWidth}
    × {no x, x label, x label+domain} × {no y, y label, y domain, y type ×3}
    × {no color, legend} — enumerate, do not randomise; the space is a few
    thousand cases and runs in well under a second.)
  - `parse then generate — code the form itself produced — returns byte-identical code`

- [ ] **Step 2: Implement `parse.ts`**

  A hand-written recursive-descent reader over the closed grammar, in one
  file, structured as `readPlotCall → readOptions → readMarks → readMark →
  readChannelCall → readMarkOptions`, each returning `null` on the first
  thing it does not recognise. **Never `eval`, never `new Function`, never a
  regex over the whole source** — the first two execute untrusted cell text
  in the host realm, which is exactly what the sandbox exists to prevent, and
  the third cannot honour the "any object key not in the grammar" rule. A
  small tokenizer (identifiers, string literals, numbers, punctuation,
  comment detection) is ~80 lines and is the honest way to satisfy "no
  partial match: a cell either parses fully into props or is entirely
  custom."

- [ ] **Step 3: Write `index.ts`**

- [ ] **Step 4: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm`
  Expected: 7 (Task 2) + 15 (this task) passed, 0 failed. Report the
  exhaustive round-trip's case count in the commit message.

- [ ] **Step 5: CHANGELOG**

  `- **plotForm.parse and the round trip (L6 Task 3).** Bidirectional over the C2 §5.3 subset; every custom-code rule in the contract has its own test. Design §10's "plotForm round-trips its subset" holds.`

- [ ] **Step 6: Commit** — `app: plotForm.parse, custom-code detection, exhaustive round-trip`

---

## Task 4: the cell model — `.idl1wb` text ↔ cells, in TypeScript

**Files:**
- Create: `Notebook/model/cells.ts`, `Notebook/model/cells.test.ts`

**Interfaces:**
- Produces `scanCells(markdown: string): ScannedDoc` — front-matter span, and
  one `ScannedCell { id, kind, infoLine, bodyRange, proseBeforeRange }` per
  fenced cell in document order — and `replaceCellBody(markdown, cellId,
  newBody): string`, the single mutation the editors use.
- Consumes: nothing. Pure.

**Read Open Question Q3 before starting.** This module is deliberately a
**narrow, non-authoritative scan**: it finds fence lines and byte ranges so
the editors can address one cell without a round trip per keystroke. It does
**not** parse math expressions, YAML, or table JSON — Rust owns that
(`eval_workbook` is the authority on cell ids, kinds and errors). If the lead
rules Q3 the other way, this task is replaced by IPC need **N2** and the
editors address cells by the ids `eval_workbook` returns.

**Spec discipline:** no spec change needed — C2 §2.2/§2.4 is the spec.

- [ ] **Step 1: Write the failing tests**

  - `scanCells — the C2 §2.5 worked example — finds one math cell and one js cell with their ids`
  - `scanCells — a fence with no id attribute — reports the cell with id null`
  - `scanCells — an inert fence (json, bash, no info string) — is not reported as a cell`
  - `scanCells — a fence-like line inside an inert code block — is not reported as a cell`
  - `scanCells — prose between two cells — attaches to the following cell as proseBefore (C2 §2.4)`
  - `scanCells — trailing prose after the last cell — attaches to that cell as proseAfter`
  - `scanCells — a document with zero fenced cells — returns no cells and the whole body as prose`
  - `scanCells — an unrecognised key=value fence attribute — is preserved verbatim in infoLine`
  - `replaceCellBody — a js cell's body replaced — every other byte of the document is unchanged`
  - `replaceCellBody — an unknown cell id — returns the document unchanged`

- [ ] **Step 2: Implement `cells.ts`**

  Line-oriented scan: front matter is the `---`-delimited leading block;
  after it, a line matching ` ```(math|table|js)( +key=value)*$ ` opens a
  cell and the next line that is exactly ` ``` ` closes it. Track whether the
  scanner is inside an inert fence so a ` ```js ` **inside** a ` ````markdown `
  block is not mistaken for a cell (this is the one subtlety; mirror
  `rust/core/src/workbook/v3/cell.rs`'s `scan_cells` behaviour and say so in
  the doc comment). `id` is captured only when it matches `/^[0-9a-f]{8}$/`
  (C2 §2.2); anything else is reported as `idRaw` with `id: null` so the UI
  can show C2's `InvalidCellId` rather than silently minting a new one
  (ruling R21).

  Ranges are **byte offsets over the UTF-8 encoding**, matching Rust's
  `InlineExpr`/`scan_cells` convention, not JS string indices. Encode once
  with `TextEncoder` and index the bytes; document the choice.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/cells`
  Expected: 10 passed, 0 failed.

- [ ] **Step 4: CHANGELOG**

  `- **Notebook cell scan (L6 Task 4).** Pure TS fence scan over C2 §2.2/§2.4 giving the editors byte ranges per cell; Rust's parser stays authoritative for evaluation.`

- [ ] **Step 5: Commit** — `app: pure cell scan over the C2 §2 fence grammar`

---

## Task 5: the sandbox — iframe host and the `postMessage` cell API

**Blocked on Open Question Q1** (dependencies) only for Step 4 onward; Steps
1–3 (the protocol module) need no dependency and can land first if Q1 is
still open.

**Files:**
- Create: `Notebook/host/protocol.ts`, `Notebook/host/protocol.test.ts`, `Notebook/host/SandboxHost.ts`, `Notebook/host/watchdog.ts`, `Notebook/host/watchdog.test.ts`, `Notebook/sandbox/main.ts`, `Notebook/sandbox/index.html`
- Modify: nothing shared. The sandbox bundle is a second Vite entry declared
  **inside this lane's directory** if Vite's default multi-entry discovery
  reaches it; if it needs a `vite.config.ts` change, that is a **question**
  (lead-owned file) — see Q9.

**Interfaces:**
- Produces the discriminated message union crossing the boundary, both
  directions, and `SandboxHost` (create iframe, post, await ready, tear down).
- The union, from design §6's "narrow and host-mediated" cell API:
  ```ts
  // host → sandbox
  | { type: "init"; runtimeVersion: string }
  | { type: "setCells"; cells: { id: string; code: string }[] }
  | { type: "setHostVar"; name: string; value: HostVarPayload }
  | { type: "ping"; nonce: number }
  | { type: "teardown" }
  // sandbox → host
  | { type: "ready" }
  | { type: "pong"; nonce: number }
  | { type: "cellResult"; cellId: string; html: string }        // serialized node
  | { type: "cellError"; cellId: string; message: string }
  | { type: "inlineResult"; spanId: string; text: string }
  ```
  `HostVarPayload` is either a JSON scalar/object (`laps`, `session`,
  `constants`) or `{ kind: "channel"; length: number; t: ArrayBuffer; v: ArrayBuffer }`
  whose two buffers go in `postMessage`'s **transfer list** (P7).

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `protocol.test.ts` (pure — the module is type guards + builders, no DOM):
  - `isHostMessage — every message the sandbox may send — is accepted`
  - `isHostMessage — an object with an unknown type — is rejected`
  - `isHostMessage — a message whose payload fields are the wrong type — is rejected`
  - `channelPayload — a decoded channel — puts both buffers in the transfer list exactly once`

  `watchdog.test.ts` (pure — the watchdog takes injected `now()` and
  `send()`):
  - `watchdog — a pong arrives inside the deadline — does not trip`
  - `watchdog — no pong within the deadline — trips once and calls onStalled`
  - `watchdog — a stall then a rebuild then a pong — resumes pinging without a second trip`

- [ ] **Step 2: Implement `protocol.ts`**

  Every message validated on receipt with a hand-written type guard. The host
  **must not trust** anything the iframe sends: it is a different origin
  running cell code an agent may have written. Reject unrecognised shapes
  silently rather than throwing (a malformed message is a bug in a cell, not
  a reason to kill the tab).

- [ ] **Step 3: Implement `watchdog.ts`**

  Ping every 1000 ms; a missing pong for 3000 ms trips `onStalled`. Design
  §6: a stalled cell gets the iframe torn down and rebuilt, state loss is the
  cost, and it is per-notebook, not per-app. Both intervals are named
  constants with a `// ms` unit comment.

- [ ] **Step 4: Implement `SandboxHost.ts` and the sandbox entry**

  `<iframe sandbox="allow-scripts">` — **`allow-same-origin` must never be
  added**; that is what keeps the cell realm away from
  `window.__TAURI_INTERNALS__`. The iframe's `srcdoc`/`src` loads a bundle
  built from `sandbox/main.ts`, which imports `@observablehq/runtime`,
  `@observablehq/inspector`, `@observablehq/plot`, `d3`, `@observablehq/inputs`
  and `htl`, and defines the module's host variables from `setHostVar`
  messages. Cell code is executed only through the Runtime's own
  `module.variable().define(...)` — never `eval` in the host realm.

  Verify against `docs/vendor/observable-runtime/runtime-README.md` when
  dispatched; the Runtime's `Library`/`Inspector` wiring is the one API
  surface this plan is least certain of.

- [ ] **Step 5: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/host`
  Expected: 7 passed, 0 failed. The iframe itself is rendering — not unit
  tested (CLAUDE.md §4).

- [ ] **Step 6: CHANGELOG + Commit** — `app: sandboxed iframe host, postMessage cell API, watchdog`

---

## Task 6: tile layer — tier selection, cache, point budget, prefetch

**Files:**
- Create: `Notebook/model/tiers.ts`, `Notebook/model/tiers.test.ts`, `Notebook/model/tileCache.ts`, `Notebook/model/tileCache.test.ts`

**Interfaces:**
- Produces:
  - `chooseTier(visibleSpanUs: number, pixelWidth: number, sampleRateHz: number): number` — clamped to `0..=10` (`MAX_TIER`, C3 §3.5), `TIER_BASE = 8`.
  - `tileRange(visibleStartUs, visibleEndUs, tier, sampleRateHz): { first: number; last: number }`.
  - `pointBudget(pixelWidth: number, isMobile: boolean): number` — `2 * pixelWidth` desktop, lower on mobile (design §6; the mobile factor is a named constant, not a magic number).
  - `TileCache` — LRU keyed `(sessionId, channelId, tier, tileIndex, columnCount)`, byte-tracked eviction with a default cap, `get`/`put`/`has`/`bytesUsed`. **`columnCount` is part of the key** because C3 §3.5's column region is sized by the caller's chart width (R43): the same tile at two widths is two different payloads. idl0's `chart_tile_cache.dart` is the shape to mirror, minus that fifth key component, which idl0 did not have.
- Consumes `DecodedTile` from `app/src/ipc/tiles.ts`. **Never calls `fetchTile` itself** — the fetcher is injected, so tests need no Tauri mock.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `tiers.test.ts`:
  - `chooseTier — a whole 30-minute session at 800 Hz across 1200 px — picks the tier whose bucket count is nearest the pixel width`
  - `chooseTier — a window narrower than the pixel width in samples — returns tier 0 (raw)`
  - `chooseTier — a span so wide the ideal tier exceeds MAX_TIER — clamps to 10 (C3 §3.5)`
  - `tileRange — a window entirely inside one tile — returns that single index for first and last`
  - `tileRange — a window straddling a tile boundary — returns both indices`
  - `pointBudget — a 1200 px chart on desktop — allows 2400 points`
  - `pointBudget — the same chart on mobile — allows strictly fewer points`

  `tileCache.test.ts`:
  - `TileCache — a tile put then read — is returned and promoted to most-recently-used`
  - `TileCache — two tiles differing only in columnCount — are cached separately (R43)`
  - `TileCache — the same tile key across two sessions — does not collide`
  - `TileCache — puts exceeding the byte cap — evicts the least recently used until under it`
  - `TileCache — a miss — returns undefined without calling the fetcher`
  - `ensureTiles — a range partly cached — requests only the missing indices`
  - `ensureTiles — the same missing index requested twice concurrently — issues one fetch`

- [ ] **Step 2: Implement both modules**

  Bucket size at tier `k` is `TIER_BASE ** k` with `TIER_BASE = 8`
  (C3 §3.5). Tile size is `TILE_SIZE_BUCKETS = 1024` (C3 §3.5's note on
  `sample_count`); it is a named constant with a comment pointing at
  `rust/core/src/chart_decimation.rs` and a `// TODO(idl0):` if it ever needs
  to come from the engine instead of being mirrored.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model`
  Expected: 10 (Task 4) + 14 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: tier selection, point budget, and the (session,channel,tier,index,columnCount) tile cache`

---

## Task 7: the chart frame — Plot line marks inside the sandbox, hover with no IPC

**Files:**
- Create: `Notebook/model/hover.ts`, `Notebook/model/hover.test.ts`, `Notebook/model/channelData.ts`, `Notebook/model/channelData.test.ts`, `Notebook/components/ChartCell.tsx`
- Modify: `Notebook/host/protocol.ts` (add the `channel` host-var payload path if Task 5 stubbed it)

**Interfaces:**
- Produces:
  - `tileToChannelData(tiles: DecodedTile[], startUs, endUs, budget): ChannelData` — the pure conversion from decoded tiles to the shape the sandbox binds as a `channel()` result. **This is where Open Question Q2 lands.** Under this plan's recommendation the shape is an array of `{ t, v }` records materialised inside the sandbox from two transferred `ArrayBuffer`s; the buffers are what cross the boundary (P7), the records are what Plot iterates. `t` is **seconds** from session start (matching `to_host_channel`'s µs→s conversion), computed from `columnTUs` with the `COLUMN_T_US_EMPTY` sentinel dropped, not plotted as zero.
  - `hoverAt(tiles, pixelX, geometry): { tUs: bigint; min: number; max: number; mean: number } | null` — reads the tile's **column region** only (P2).
- Consumes `model/tiers.ts`, `model/tileCache.ts`, `ipc/tiles.ts` types.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `channelData.test.ts`:
  - `tileToChannelData — one tile covering the window — emits one record per column with t in seconds`
  - `tileToChannelData — a column carrying the COLUMN_T_US_EMPTY sentinel — is dropped, not plotted at zero`
  - `tileToChannelData — a column whose stats are all NaN but whose time is real — keeps the time and emits no value`
  - `tileToChannelData — more columns than the point budget — emits at most budget records`
  - `tileToChannelData — two adjacent tiles — emits records in ascending time with no duplicate at the seam`

  `hover.test.ts`:
  - `hoverAt — a pixel inside the plotted area — returns that column's min, max, mean and recorded t_us`
  - `hoverAt — a pixel outside the plotted area — returns null`
  - `hoverAt — a column with the empty-time sentinel — returns null rather than a bogus instant`

- [ ] **Step 2: Implement both pure modules, then `ChartCell.tsx`**

  `ChartCell` owns the DOM: a `<div>` holding the sandbox's rendered Plot
  output plus a `<canvas>` for the raster underlay (Task 9) and an absolutely
  positioned hover tooltip. Its pointer handler calls `hoverAt` and sets
  React state — **it never calls `invoke`** (P1). The reviewer greps for that.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model`
  Expected: 24 (prior) + 8 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: tiles → Plot line data, hover from the tile column region (no IPC per move)`

---

## Task 8: pan and zoom — transform during the gesture, IPC on settle

**Files:**
- Create: `Notebook/model/viewport.ts`, `Notebook/model/viewport.test.ts`, `Notebook/model/settle.ts`, `Notebook/model/settle.test.ts`
- Modify: `Notebook/components/ChartCell.tsx` (wire the gesture handlers)

**Interfaces:**
- Produces:
  - `Viewport { startUs, endUs, pixelWidth }` with pure transitions
    `panBy(viewport, pixelDx)`, `zoomAt(viewport, pixelX, factor)`,
    `clampTo(viewport, sessionSpan)`, and
    `transformFor(rendered: Viewport, current: Viewport): { scaleX: number; translateXPx: number }`
    — the CSS/canvas transform that makes the already-drawn picture follow the
    gesture with no fetch (P3, P4).
  - `makeSettle(delayMs, onSettle)` — a debouncer taking an injected timer, so
    tests are deterministic and need no fake clocks beyond vitest's.
- Consumes `model/tiers.ts`.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  `viewport.test.ts`:
  - `panBy — a drag of 100 px on a 1000 px wide 10 s window — moves the window by exactly 1 s`
  - `panBy — a drag past the session start — clamps at zero with the span preserved`
  - `zoomAt — a pinch centred on the left edge — keeps that instant under the pointer`
  - `zoomAt — repeated zoom-out past the session span — clamps to the whole session`
  - `transformFor — a viewport equal to the rendered one — is the identity transform`
  - `transformFor — a viewport panned half a width — translates by half the pixel width and does not scale`
  - `transformFor — a viewport zoomed 2x — scales by 2 about the correct origin`

  `settle.test.ts`:
  - `makeSettle — three calls inside the delay — fires onSettle once with the last value`
  - `makeSettle — two calls separated by more than the delay — fires twice`
  - `makeSettle — cancelled before the delay elapses — never fires`

- [ ] **Step 2: Implement and wire**

  `ChartCell`'s `onWheel`/`onPointerMove` update viewport state and the CSS
  transform only; the settle callback is the sole caller of
  `ensureTiles`/`fetchTile`. Settle delay is a named constant in ms.
  Playback prefetch (design §6) is a separate lookahead on a timer, and the
  doc comment says so explicitly so a reviewer does not read it as a gesture
  path (P4).

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model`
  Expected: 32 (prior) + 10 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: viewport transforms for pan/zoom, settle-bound tile fetch`

---

## Task 9: raster layering — spectrogram and 2-D histogram under Plot axes

**Files:**
- Create: `Notebook/model/rasterLayer.ts`, `Notebook/model/rasterLayer.test.ts`, `Notebook/components/RasterUnderlay.tsx`
- Modify: `Notebook/components/ChartCell.tsx`

**Interfaces:**
- Produces `rasterRequestFor(viewport, kind, params, devicePixelRatio): { width: number; height: number; params }` — the pure request builder, honouring C3 §3.6's `u16` width/height bounds and **R42's rule that `x_bins`/`y_bins` must equal `width`/`height`** for `histogram2d` — and `drawRaster(ctx, decoded, meta, viewport)`, which blits the RGBA8 pixels through `putImageData`/`createImageBitmap` under the Plot SVG.
- Consumes `ipc/rasters.ts` (`fetchRaster`, `fetchRasterMeta`, `DecodedRaster`, `RasterMeta`).

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  - `rasterRequestFor — a histogram2d request — sets x_bins and y_bins equal to width and height (R42)`
  - `rasterRequestFor — a chart wider than u16 max — clamps width and reports the clamp`
  - `rasterRequestFor — a spectrogram request — passes window, detrend and scaling through unchanged`
  - `rasterRequestFor — a devicePixelRatio of 2 — requests twice the CSS pixel dimensions`
  - `alignRasterToAxes — a raster meta whose x_domain differs from the viewport — returns the source rectangle to draw`
  - `alignRasterToAxes — a raster meta whose domain does not overlap the viewport at all — returns null`

- [ ] **Step 2: Implement**

  The raster is drawn on a `<canvas>` positioned **under** the Plot SVG,
  aligned by `fetch_raster_meta`'s `x_domain`/`y_domain` (C3 §3.6); Plot draws
  only axes, a legend and any line marks over it. `scale.vmin`/`vmax` are
  resolution-independent (R38), so the legend does not change when the chart
  is resized — assert that in the doc comment, and never recompute a colour
  scale in JS (P8). Raster fetches are settle-bound exactly like tiles
  (C3 §4).

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/rasterLayer`
  Expected: 6 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: Rust raster underlay (spectrogram, 2-D histogram) beneath Plot axes`

---

## Task 10: cursor readout on settle

**Files:**
- Create: `Notebook/model/cursor.ts`, `Notebook/model/cursor.test.ts`, `Notebook/components/CursorReadout.tsx`
- Modify: `Notebook/components/ChartCell.tsx`

**Interfaces:**
- Produces `cursorRequestFor(viewport, pixelX, channels): { tUs: number; channels: string[] } | null` and `formatReadout(readout: CursorReadout, labels): ReadoutRow[]` — rows carrying `null` as a visible "no data here", never a blank or a zero.
- Consumes `ipc/cursor.ts`.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  - `cursorRequestFor — a pointer inside the plot — converts pixel x to a t_us on the session axis`
  - `cursorRequestFor — a pointer outside the plot — returns null and issues no request`
  - `formatReadout — a channel whose value is null — renders as "no data", not as 0 (R31)`
  - `formatReadout — a channel with a value — renders the number with its channel label`
  - `formatReadout — a channel absent from the readout entirely — is omitted rather than rendered blank`

- [ ] **Step 2: Implement and wire**

  `cursorReadout()` is called **only** from the settle callback shared with
  Task 8's tile fetch (P2, C3 §4). The doc comment states R31's rule verbatim:
  a channel that stops reads `null` for the rest of the session, never a
  frozen last value — an HR strap that drops out at minute 40 must look like
  it dropped out.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/cursor`
  Expected: 5 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: cross-channel cursor readout on settle, null outside a channel's span`

---

## Task 11: the Code pane — CodeMirror 6 with markdown, JS and math modes

**Blocked on Open Question Q1** (dependencies).

**Files:**
- Create: `Notebook/model/mathMode.ts`, `Notebook/model/mathMode.test.ts`, `Notebook/components/CodePane.tsx`, `Notebook/model/functionCatalog.ts`

**Interfaces:**
- Produces:
  - `tokenizeMath(line: string): MathToken[]` — the pure tokenizer C2 §8-4 assigns to L6: identifiers, `const`, `[Channel]` references, `{cell}`/`{col[]}` references, numbers, operators (`+ - * / < > <= >= == != and or not`), function names from the catalog, `#` comments and the `# label:` display-name form.
  - `MATH_FUNCTIONS` — C2 §3.3's 69 entries as `{ name, signature, category, status }`, transcribed from the contract table (the source of truth is `rust/core/src/math/eval.rs`'s dispatch; the contract table mirrors it and is what this transcribes).
  - `CodePane` — a CodeMirror 6 editor switching language by cell kind: `@codemirror/lang-markdown` for prose, `@codemirror/lang-javascript` for `js`, and a `StreamLanguage` over `tokenizeMath` for `math`. `table` cells use the JSON path of `lang-javascript` (C2 §4's body is a JSON object).
- Consumes: CodeMirror 6 at the M0 pins.

**Spec discipline:** no spec change needed — C2 §8-4 explicitly assigns the mode's implementation to L6 within the grammar C2 already fixes.

- [ ] **Step 1: Write the failing tests** (`mathMode.test.ts`, pure)

  - `tokenizeMath — a definition line — yields identifier, equals and expression tokens`
  - `tokenizeMath — a const line — tags const as a keyword, not an identifier`
  - `tokenizeMath — a bracketed channel reference containing spaces — is one channel token (C2 §3.1)`
  - `tokenizeMath — a table cell reference {name} and {col[]} — are cell-reference tokens`
  - `tokenizeMath — the keyword operators and, or, not — are operator tokens, not identifiers`
  - `tokenizeMath — a trailing # label: comment — is tagged as a display-name comment, distinct from a plain comment`
  - `tokenizeMath — a known catalog function name before an open paren — is a function token`
  - `tokenizeMath — an unknown name before an open paren — is an identifier, not a function`
  - `MATH_FUNCTIONS — the catalog — contains all 69 of C2 §3.3's names`
  - `MATH_FUNCTIONS — every NotImplemented entry — is marked so it can be shown greyed`

- [ ] **Step 2: Implement**

  `CodePane` mounts one CodeMirror `EditorView` per open cell and reports
  changes through a **debounced** callback (P6) — the parent decides when to
  re-evaluate; the editor never calls IPC. Completion is `MATH_FUNCTIONS`
  plus the session's channel ids plus the workbook's math definition names,
  all supplied as props.

  Verify the `StreamLanguage`/`LanguageSupport` API against
  `docs/vendor/codemirror-6/system-guide.md` when dispatched.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/mathMode`
  Expected: 10 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: CodeMirror Code pane with markdown/js/math modes; C2 §8-4 math tokenizer`

---

## Task 12: the Properties pane — a self-contained form over `plotForm`

**Files:**
- Create: `Notebook/components/PropertiesForm.tsx`, `Notebook/components/PropertiesForm.types.ts`

**Interfaces:**
- Produces one component with a **fully self-contained** prop surface:
  ```ts
  interface PropertiesFormProps {
    code: string;                                 // the cell's current code
    channels: { id: string; label: string }[];    // available channel/definition names
    laps: { number: number }[];
    unitsPreference: "si" | "imperial";           // C2 §1, label suggestion only
    onChange(nextCode: string): void;             // generate() output
  }
  ```
  No context, no store, no IPC, no router — **this is the operating brief's
  binding constraint**: wave 3's React Flow graph view hosts this exact
  component inside a node, so every input it needs arrives as a prop.
- Consumes `plotForm/` only.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Implement the form**

  `parse(code)` on every render. Non-null → controls populated and enabled.
  Null → **the pane greys out** and shows *custom code* with a *Reset to
  form* button that regenerates from the last known props and warns the
  custom code will be discarded (design §6, verbatim). "Last known props" is
  component state seeded the last time `parse` succeeded; if it never has,
  Reset seeds the default single-mark props the form always carries
  (C2 §5.3: "the form always seeds one").

  Controls, one per grammar production: mark list (add/remove/reorder,
  channel picker, mark type, lap scope, stroke colour, stroke width),
  x label + domain, y label + domain + type, colour legend toggle. Axis-label
  suggestions come from C2 §3.4's unit table under `unitsPreference` and are
  **suggestions written into the label field**, never a conversion (C2 §1).

- [ ] **Step 2: No unit tests for the component** (CLAUDE.md §4 — UI rendering)

  The form's whole logic surface is `plotForm`, already at > 80 % from Tasks
  2–3. State this explicitly in the commit message so the reviewer does not
  read the absence as an omission.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/plotForm`
  Expected: 22 passed (unchanged), 0 failed — the gate here proves the form
  did not break the module it stands on.

- [ ] **Step 4: CHANGELOG + Commit** — `app: Properties pane over plotForm, self-contained for wave 3's node host`

---

## Task 13: open, evaluate, and render the workbook

**Files:**
- Create: `Notebook/model/workbookState.ts`, `Notebook/model/workbookState.test.ts`, `Notebook/components/CellList.tsx`, `Notebook/components/MathCell.tsx`, `Notebook/components/TableCell.tsx`, `Notebook/components/ProseSpan.tsx`
- Modify: `Notebook/index.tsx` (replace the wave-1 canvas with the real page)

**Interfaces:**
- Produces a pure reducer `workbookReducer(state, action)` over
  `{ handle, markdown, hash, cells, outputs, dirtyCellIds, status }`, and the
  components rendering one `CellOutput` each:
  - math → each `CellDefResult` as `name` (or `label`) with its
    `HostChannelRef` summary and, on failure, its typed `IpcError`;
  - table → `value.model` + `value.results[r][c]` as a grid, per-cell error
    text in place of a value (C3 §3.4);
  - js → the sandbox's rendered output for that cell id;
  - prose → Markdown with `${…}` splices filled from `inlineResult` messages.
- Consumes `ipc/workbook.ts`, `ipc/catalog.ts`, `host/`, `model/cells.ts`.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests** (the reducer only — the components are rendering)

  - `workbookReducer — an eval result for a cell — replaces that cell's output and leaves others untouched`
  - `workbookReducer — a cell carrying errors — keeps the cell and stores its errors (never drops it)`
  - `workbookReducer — a definition-level error — attaches to that definition, not to the cell`
  - `workbookReducer — an edit to one cell body — marks only that cell dirty`
  - `workbookReducer — a save result — clears dirty and stores the new hash`
  - `workbookReducer — a watch event naming two cells — marks exactly those two stale`

- [ ] **Step 2: Implement**

  On mount: `openWorkbook` → read markdown (**IPC need N1** — see below; until
  it lands, the page reads through the typed stub and shows the
  `not_implemented` state rather than pretending) → `scanCells` →
  `evalWorkbook(id, sessionId)` → bind host variables → render.
  `evalWorkbook` is called on open, on a watch event, and on a debounced
  editor change (P6).

  A per-cell failure never blanks the notebook: a cell with `errors` renders
  its error inline and every other cell still renders (CLAUDE.md §5, C2 §3.5.B).

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/workbookState`
  Expected: 6 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: workbook open/eval/render — math, table, js and prose cells`

---

## Task 14: save with `based_on_hash`, conflict handling, and live reload

**Files:**
- Create: `Notebook/model/saveFlow.ts`, `Notebook/model/saveFlow.test.ts`, `Notebook/components/ConflictBanner.tsx`
- Modify: `Notebook/model/workbookState.ts`, `Notebook/index.tsx`

**Interfaces:**
- Produces `saveFlow(deps)` — a pure-ish state machine over injected
  `save`/`read` functions: builds the new markdown from the cell edits,
  passes the hash last read as `based_on_hash`, and on a `conflict` kind
  (C3 §2, R44) transitions to a **reload-or-overwrite** prompt rather than an
  error toast. Also `isSelfWrite(event, lastSavedHash)` — the frontend half of
  C4 §4's self-write suppression.
- Consumes `ipc/workbook.ts`.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Write the failing tests**

  - `saveFlow — a save with the hash last read — passes it as based_on_hash and stores the returned hash`
  - `saveFlow — a rejection with kind conflict — enters the conflict state, does not surface a generic error`
  - `saveFlow — a rejection with kind io — surfaces an error and leaves the document dirty`
  - `saveFlow — creating a new workbook — passes based_on_hash null (C3 §3.4)`
  - `isSelfWrite — a watch event arriving right after our own save — is suppressed`
  - `isSelfWrite — a watch event after an external edit — is not suppressed and triggers a reload`
  - `isSelfWrite — a watch event more than the TTL after our save — is not suppressed (C4 §4)`

- [ ] **Step 2: Implement**

  `watchWorkbook` is subscribed once per open workbook. The Rust watcher
  already suppresses the app's own writes by expected hash (C4 §4, L5's
  `ExpectedHashSet`); the frontend check is a **second, independent belt**
  against the case where a save's own rename races the subscription — it
  compares the event against the hash the last `SaveResult` returned, with the
  same 5 s TTL. Say in the doc comment that this is defence in depth, not the
  primary mechanism, so nobody removes the Rust one thinking this replaces it.

  Conflict UI: a banner offering *Reload from disk* (discard local edits) or
  *Overwrite* (re-read, re-apply, save again). C4 §4 names a per-cell merge as
  the eventual answer for workbooks; that merge is L11's pure function and
  this lane does not reimplement it — the banner is the wave-2 surface and the
  doc comment carries a `// TODO(idl0):` pointing at L11.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/model/saveFlow`
  Expected: 7 passed, 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: workbook save with optimistic concurrency, conflict banner, live reload`

---

## Task 15: the two panes together — the editor shell

**Files:**
- Create: `Notebook/components/EditorPanes.tsx`, `Notebook/components/CellFrame.tsx`
- Modify: `Notebook/index.tsx`

**Interfaces:** none new — this task assembles Tasks 11–14 into design §6's
editing surface: selecting a cell opens Properties (for a `js` cell whose
code parses) and Code side by side, with Properties greyed for custom code.

**Spec discipline:** no spec change needed.

- [ ] **Step 1: Implement**

  Properties and Code write to the same cell body through
  `replaceCellBody` (Task 4), so an edit in either pane is visible in the
  other. Properties → `generate` → body; Code → debounced → `parse` →
  Properties repopulates or greys. Non-`js` cells show Code only.

- [ ] **Step 2: No unit tests** (rendering). The logic is Tasks 3, 4, 11, 12.

- [ ] **Step 3: Gate**

  `npx tsc --noEmit && npx vitest run src/routes/pages/Notebook`
  Expected: the lane's full count so far (≈ 100 passed), 0 failed.

- [ ] **Step 4: CHANGELOG + Commit** — `app: Properties + Code editor shell (D13)`

---

## Task 16: SPEC section, CHANGELOG, TASKS, and the contract-amendment filing

**Files:**
- Modify: `docs/IDL0_SPEC.md` (§25, §26), `CHANGELOG.md`, `TASKS.md`
- Create: `runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md` (proposed C2/C3 text for every question ruled during the lane — **proposed**, for the lead to apply; this lane never edits a contract)
- Delete: `app/src/routes/pages/NotebookPage.tsx` (the Task 1 shim), **paired with the lead's one-line `App.tsx` import change** applied as a shell task at the merge gate

**Spec discipline:** **spec-during — this is the task that discharges it.**

- [ ] **Step 1: Rewrite `docs/IDL0_SPEC.md` §26 as "Tab — Notebook"**

  Covering: the cell kinds and how each renders; the two editing panes and
  the custom-code rule; the interaction rules and the point budget (this
  plan's Performance budget section, restated as spec); the sandbox boundary
  and what the cell API exposes; what a conflict looks like to the user.
  Replace §25 (*Tab — Maths*) with a two-line pointer to §26 — idl1 has no
  separate maths tab.

  As with L5's §11 rewrite, this is a **first draft**: L10's cross-lane
  consistency pass over the app-side SPEC parts runs after L7 also lands.

- [ ] **Step 2: Write the parity-gap list into the SPEC section**

  The "Parity gaps" table above belongs in the SPEC, not only in this plan —
  a reader asking "where did the FFT chart go" must find the answer in the
  spec.

- [ ] **Step 3: `TASKS.md`** — tick `L6 notebook UI`, only if design §10's L6
  done-criteria both hold: pan/zoom/hover on a **real** session at 60 fps
  desktop (observed in the running dev app, not inferred — the L5 lesson),
  and `plotForm` round-trips its subset (Task 3's exhaustive test). If either
  does not hold, say which and leave the line unticked (R50's precedent).

- [ ] **Step 4: Gate**

  `npx tsc --noEmit && npx vitest run` (whole TS suite — this is also the lane
  merge gate). Report the exact passed/failed counts.

- [ ] **Step 5: Commit** — `docs: SPEC §26 Tab — Notebook; L6 lane wrap-up`

---

## IPC needs

Written per operating brief §3: C3 is frozen for UI lanes, so each need below
names the command, its arguments, its return shape, its error kinds and its
C3 §3 group. This lane builds against a **typed stub in
`Notebook/ipcStubs/`** that throws `{ kind: "not_implemented" }` until the
Rust track lands the real command. The full list with rationale is
`runs/2026-09-05/lanes/l6/IPC-NEEDS.md`; the summary is here so a reader of
this plan sees what it is standing on.

| # | Command | Group | Blocks |
|---|---|---|---|
| N1 | `read_workbook(id) → { markdown, hash, path }` | C3 §3.4 Workbook | Task 13, Task 14 — **hard blocker**. No command returns a workbook's text or its current hash, and `save_workbook`'s `based_on_hash` is defined as "the hash the editor last read". There is no way to obtain it today. |
| N2 | `parse_workbook_cells(id) → ScannedCell[]` | C3 §3.4 Workbook | Task 4 — **only if Open Question Q3 is ruled against the TS scan.** |
| N3 | `fetch_host_channel(workbook_id, session_id, def_name, budget) → bytes` | C3 §3.4 Workbook | Task 13's math→JS host variables. This is C3 §3.4's own open item, deferred to wave 2 "with L6" by ruling R45 — but the lane may not touch `rust/`, so an owner is needed (Q6). |
| N4 | `eval_workbook(id, session_id, lap_context)` — one added argument | C3 §3.4 Workbook | The lap table, variance traces, `current_lap()`, `sector_number()`, `lap_start_*()`. `MathLapContext` has no way in. |
| N5 | `fetch_fft(session_id, channel, params, averaging) → bytes` | new, C3 §3.6 Rasters group | The FFT chart. Numbers, therefore Rust (CLAUDE.md §2). |
| N6 | `fetch_histogram(session_id, channel, bin_count, symmetric, lap) → HistogramBins` | new, C3 §3.6 | The 1-D histogram chart. |
| N7 | `fetch_scatter_points(session_id, x_channel, y_channel, color_channel, max_points) → bytes` | new, C3 §3.6 | Scatter point-cloud mode. **Marked wave 3** — density mode covers the wave-2 need. |
| N8 | `create_workbook(name) → WorkbookHandle` | C3 §3.4 Workbook | Creating a notebook from the UI. `save_workbook(id, md, null)` exists but the id has to come from somewhere, and R48 fixes the filename from the front-matter `name`. |

---

## Open questions

CLAUDE.md §1: where the design doc, C2/C3 and idl0 disagree, the question is
written with options and a recommendation, and the lead rules. Questions
**Q1–Q6 block dispatch**; Q7–Q9 block the tasks named.

**Q1 — the npm dependencies, and `htl`'s pin. (Blocks Tasks 5, 11.)**
This lane needs eight packages added to `package.json`, which is lead-owned.
Seven are pinned in the M0 ecosystem report; the eighth, `htl` (C2 §5.1's
`html` host variable), is **not pinned anywhere** — C2 §8 open question 1
assigns it to "whoever finalises L5's `package.json`", and L5 did not add it.
Options: (a) lead applies a shell task adding all eight, pinning `htl` at its
current release; (b) drop `html` from the cell API for wave 2 and note the
gap in C2. **Recommendation: (a)** — `html` is one of six host variables C2
§5.1 fixes, and dropping it silently narrows a signed contract.

**Q2 — `channel()`'s return shape versus Plot 0.6.17. (Blocks Task 7.)**
C2 §5.1 proposes `{ length, t, v }` (SoA) so `{x: "t", y: "v"}` are literal
field names, and C2 §8-3 flags it as unverified and assigns the check to L6's
first task. It is very likely wrong: Plot resolves a string channel by
`d["t"]` **per element**, and iterating an array-like `{length, t, v}` yields
`undefined` at every index. Options: (a) `channel()` returns `{ t, v }[]`
(array of records) materialised inside the sandbox from the two transferred
buffers — C2 §5.3's grammar is untouched (it already says `x: "t", y: "v"`),
only C2 §5.1's stated object changes, and the record count is budget-capped
at ~2 per pixel column so the materialisation is a few thousand objects, not
a few hundred thousand; (b) keep `{length, t, v}` and change §5.3's
`mark_options` to pass typed arrays directly (`{x: c.t, y: c.v}`) — this
**does** widen the grammar and breaks the four worked examples; (c) return a
Proxy that fakes indexed access. **Recommendation: (a)**, with the C2 §5.1
amendment text filed in Task 16. The transfer stays zero-copy (P7); only what
Plot iterates changes. Cost if wrong: Task 7 is rewritten, one task.

**Q3 — who segments cells, TypeScript or Rust? (Blocks Task 4.)**
The Code and Properties panes address one cell at a time, so something must
map cell id → byte range in the editor's live text. CLAUDE.md §2 says "bytes
on disk → core", which argues for Rust; "no IPC on the interaction path"
argues against a round trip per keystroke. Options: (a) a narrow,
non-authoritative TS fence scan (this plan's Task 4) with Rust staying
authoritative for evaluation; (b) IPC need N2, called on the debounced
change rather than per keystroke. **Recommendation: (a)** — the scan reads
only fence lines, whose grammar C2 §2.2 fixes in four lines of EBNF, and it
duplicates no semantics: it never parses an expression, YAML, or table JSON.
Cost if wrong: Task 4 is deleted and replaced by a stub over N2; nothing
downstream changes shape.

**Q4 — `read_workbook` (IPC need N1). (Blocks Tasks 13, 14.)**
`save_workbook`'s `based_on_hash` is specified as "the hash the editor last
read", and no command lets the editor read anything. Options: (a) add
`read_workbook(id) → { markdown, hash, path }` to C3 §3.4; (b) have the
frontend read the file through a Tauri fs plugin — rejected on sight, it
bypasses the engine and the `<data>` resolution C4 §1 owns. **Recommendation:
(a)**, in the wave-2 C3 write-amendment lane. This is the single most
blocking gap in the list.

**Q5 — `eval_workbook` has no lap context (IPC need N4). (Blocks the lap
table, variance traces, and four catalog functions.)**
R41 added `session_id` and deliberately stopped there. But `current_lap()`,
`sector_number()`, `lap_start_time()`, `lap_start_distance()`,
`variance_time()` and `variance_dist()` all read `MathLapContext`, and the
variance pair additionally needs idl0's Main/Overlay lap designation, which
has no v3 home at all. Options: (a) add a `lap_context: { main_lap, overlay_laps[] } | null`
argument to `eval_workbook`, mirroring R41's reasoning (the designation is a
UI selection, not a property of the file); (b) put the designation in C2
front matter — rejected, it contradicts R41 and "the workbook is a file, the
app is a live viewer of it"; (c) leave both features out of wave 2.
**Recommendation: (a)**. Cost if wrong: the lap table and variance charts
stay parity gaps for another wave.

**Q6 — who implements the host-channel byte path (IPC need N3)?**
C3 §3.4 assigns the layout to L5; R45 deferred it "to wave 2 with L6" because
its only consumer is the sandbox. But operating brief §3 forbids a UI lane
from touching `rust/`. Options: (a) L6 **designs** the layout (it is the
consumer and can validate it) and files it as a C3 amendment; the wave-2 Rust
write lane implements it; (b) the Rust lane designs it alone; (c) defer
math-derived host variables to wave 3 and bind only raw channels via tiles in
wave 2. **Recommendation: (a)** — R45's whole argument was "do not fix a wire
format with nothing to validate it against", and L6 is that validator. Cost
if wrong: math cells render their scalars and errors but cannot feed a JS
chart until wave 3, which is (c) as a fallback and is survivable.

**Q7 — FFT and 1-D histogram (IPC needs N5, N6). (Blocks two parity gaps.)**
Both are numbers, so CLAUDE.md §2 forbids the JS shortcut, and neither has a
C3 endpoint. Options: (a) add both to the wave-2 C3 write-amendment lane;
(b) defer both to wave 3. **Recommendation: (a) for N5, (b) for N6** — the FFT
chart is a core suspension-tuning view and the engine's `fft` already exists
(`idl_rs::fft`, the spectrogram raster uses it), so N5 is a thin wrapper; the
1-D histogram is genuinely new binning code.

**Q8 — the GPS map basemap. (Blocks the GPS map chart, deferred either way.)**
idl0 drew a basemap from a tile server. Design §3: "Offline-first means
bundled. No CDN, ever." Options: (a) no basemap — draw the GPS polyline on
plain axes, which is fully expressible today and loses only geographic
context; (b) bundle a vector basemap for the venues that matter — a large
bundle and a data-licensing question; (c) allow a user-configured tile URL as
an explicit, off-by-default exception to the CDN rule. **Recommendation: (a)
for wave 2**, with (c) as an explicit design-doc amendment if Isaac wants
real maps trackside; this one is a product call, not an engineering one.

**Q9 — shared-file touches this lane will need. (Blocks Tasks 1, 5, 13, 16.)**
Four, all lead-owned: (i) `App.tsx`'s Notebook import (Task 1 works around it
with a shim; Task 16 needs the real change); (ii) `vite.config.ts`, **if** the
sandbox iframe needs a second build entry — the implementer confirms at Task
5 whether a Vite worker/entry declaration is required or whether a
`?url`-imported bundle suffices; (iii) `state/AppState.tsx`, which needs an
`activeSessionId` slice — `eval_workbook`, `fetch_tile` and `cursor_readout`
all take a session id, and per R41 that is a UI selection shared with the Data
tab (L7a needs the same field); (iv) `package.json` per Q1.
**Recommendation:** batch (i), (iii) and (iv) into one shell task on `main`
before dispatch, and hold (ii) until Task 5 reports.

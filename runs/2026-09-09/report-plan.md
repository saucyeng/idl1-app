# Lane R — the report (decisions 85, 89): plan

Read for this: `CLAUDE.md` §2/§3; `runs/2026-09-07/ui/UI-DIRECTION-2.md`
decisions 85, 89, 50, 28, 75 and section D (58–63); `runs/2026-09-07/WAVE3-PLAN.md`
lane R; rulings R69, R115, R121, R131/R132, R147, R148, R150, R152, R153,
R154, R163, R164, R165; C2 §5 (`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md:1451`).
No build was run (two lanes hold the cargo slot); everything below is read
from source, and the two claims that need a running app are marked
**must be verified** rather than assumed.

Isaac's words are the target: *"a readable report that can be sent via pdf
to the rider/mechanic"* — read on a phone, on a chairlift. That is a
document, not a screenshot of the app.

---

## 1. What already exists to build on

### 1.1 The paper register, as rendered today

`CellList` (`app/src/routes/pages/Notebook/components/CellList.tsx:82`)
walks the scanned cells in document order and, per cell, renders
`prose_before` -> the cell's own output -> `prose_after`, dispatching by
kind. That loop *is* the register, and it is the right shape to reuse.

| Register element | Where | Print-capturable? |
|---|---|---|
| Prose (`prose_before_html`/`prose_after_html`) | `components/ProseBlock.tsx:47` | **Yes, directly.** Core-rendered `pulldown-cmark` HTML, author HTML escaped in Rust (R70); this is the app's one sanctioned `dangerouslySetInnerHTML` and it never passes through the sandbox. It is host-realm DOM already. |
| Inline `${…}` prose spans | `ProseBlock.tsx:53-65`; protocol `inlineResult`/`spanError` (`host/protocol.ts:155-156`) | **Yes.** The span's text arrives from the sandbox as *plain text* and is written with `textContent`. Already in host DOM by the time anything prints. Errors render in place as text (R66.2). |
| Math cell definitions | `components/MathCell.tsx:9` (`DefRow`) | **Yes**, but today it prints `"1234 samples"` and the definition name — **no unit and no rate**, even though `CellDefResult.unit` and `.sample_rate_hz` exist (`app/src/ipc/workbook.ts:66-88`). Printing that as-is would be R152's exact failure. Fixing it is task R3. |
| Table cells | `components/TableCell.tsx:43` | **Yes, directly.** A plain `<table>` of numbers with per-grid-cell error text. The most print-ready thing in the app. |
| Cell errors, per-window notes | `MathCell.tsx:48`, `TableCell.tsx:50`, `model/jsCellNote.ts`, `theme/slotStates.ts:34` (`emptySlotMessage`) | **Yes**, and they must be kept — `slotStates.ts` is already the house pattern for naming an absence (R148/R150). |
| **Charts (`js` cells)** | rendered inside the sandbox iframe: `sandbox/main.ts:101` (`renderCellValue`), `:186` (`CellContainers`) | **No. Not by any means available today.** See section 1.2. |
| Cursor, cursor card, timeline strip, playback, raster underlay zoom | `interaction/*`, `components/TimelineStrip.tsx`, `RasterUnderlay.tsx` | **No, and correctly so** — these are interactions. Section 3.4 says what replaces them. |

Three more facts the report consumes rather than rebuilds:

- `evalWorkbookV2(id, windows)` already returns **one `WindowEval` per
  selected window** (`ipc/workbook.ts:256`, R121) and the reducer already
  keeps them all (`model/workbookState.ts:58,122`). The data for a
  two-lap report is on the wire today.
- The screen only ever *shows* window 0: `index.tsx:364` (`primaryWindow`),
  `:478`, `:2039` (`primaryWindowNote`) — R131 Q1/R132. The report must not
  inherit that limit; see section 4.
- Session identity for the header is already in `SessionSummary`
  (`app/src/ipc/catalog.ts:4-29`): `rider`, `bike`, `venue_name`,
  `event_name`, `timestamp_utc_ms`, `importer_version`, `engine_version`,
  `source_format`. `""` means "not set" (C1 §2). Window labels come from
  `state/selection.ts:217` (`describeWindow`) — "Session · Lap 3",
  "Session · 1:04–1:52".

### 1.2 The sandbox — the lane's central problem

Charts live in an `<iframe sandbox="allow-scripts">` with an opaque origin
that must never gain `allow-same-origin` (R69,
`sandbox/index.html:5-14`). Under R69 the *sandbox renders its own pixels*:
each cell gets a `position: fixed` `<div>` in the iframe document
(`sandbox/main.ts:186-224`), positioned in **viewport pixels** by the
host's `layout` message and transformed per gesture frame by `transform`;
the host's `ChartCell` is a same-rect, pointer-events overlay
(`components/ChartCell.tsx:366,404`). Nothing but a height crosses back:
`SandboxToHostMessage` is `ready | pong | cellRendered{cellId,heightPx} |
cellError | inlineResult | spanError` (`host/protocol.ts:150-156`). There
is **no channel out of the sandbox for markup or pixels at all** — that
was the point of R69.

Two consequences, both hard:

1. **You cannot print the app's own notebook column.** Even ignoring
   trust, every chart container is `position: fixed` in viewport
   coordinates in a *different document*. Under pagination a fixed element
   lands at its screen position on page 1 and nowhere else. "Print the
   notebook" is not a shortcut that exists; the report must be a separate,
   flowed document.
2. **A chart's pixels must be re-obtained**, and how is the lane's design
   decision.

**Option A — sandbox serialises SVG and posts the string out.**
`new XMLSerializer().serializeToString(...)` inside the sandbox, new
message `cellSvg { cellId, svg }`. Cheap to write. **Rejected**: the host
would then have to inject sandbox-authored markup into the host DOM (or
into a PDF writer that parses it), which is precisely the
`dangerouslySetInnerHTML`-on-sandbox-output that R69 removed and
`ProseBlock.tsx:33-45` documents as the one thing that never happens.
Recovering safety needs a sanitiser we do not have and would have to
vendor and trust.

**Option B — sandbox rasterises to PNG itself and posts a data URL.**
Serialise the SVG, `new Image()` from an `image/svg+xml` data URL, draw
into a canvas, `toDataURL("image/png")`, post
`cellCaptured { cellId, png, widthPx, heightPx }`. A PNG data URL is inert
bytes — it crosses the boundary with no sanitiser and is safe in an
`<img>`. **Costs:** raster only (fine on a phone, mediocre at A4, poor
when zoomed); the vendored Plex `woff2` faces
(`app/src/assets/fonts/`, `app/src/styles/fonts.css:6`) are host-document
`@font-face` rules and will **not** apply to the serialised SVG unless
inlined, so axis labels can silently fall back to a default face; and it
**must be verified** that `canvas.toDataURL()` does not throw in an
*opaque-origin* document after drawing a `data:` URL image (a `data:`
image does not taint a canvas in the normal case; the opaque origin is
the untested part). It is nevertheless the only option that can capture a
**custom-code** cell — one whose body is arbitrary JS the host cannot
re-execute.

**Option C — host-side re-render from `plotForm` props (recommended).**
For any `js` cell that `plotForm.parse` recognises
(`plotForm/parse.ts:52`), the host already holds everything the chart is
made of: the parsed `PlotProps` (`plotForm/types.ts:145`), the decoded
channel/spectrum data it fetched itself (`model/channelBindDriver.ts:196`,
`CombinedChannelPayload`), the theme (`theme/plotTheme.ts:93`) and the
window palette (`theme/series.ts:58`). The report builder can
`await import("@observablehq/plot")` and call `Plot.plot(props)` **in the
host realm on host-owned data** — no user code is executed, so no sandbox
is needed and no trust boundary moves. Output is a real `SVGSVGElement`:
vector, selectable text, host `@font-face` applies.
**Costs:** (a) Plot + d3 enter the host bundle — mitigated by a dynamic
`import()`, so they land in a lazily-fetched chunk and startup is
unchanged (both are already npm deps, already bundled once for the sandbox
entry, `app/vite.config.ts`'s `notebookSandbox` input); (b) it is a
*second* render path, so the report's chart and the screen's chart can
drift — mitigated by driving it from the same `PlotProps` +
`plotTheme`/`seriesPalette` the sandbox uses, and by a round-trip test;
(c) it cannot render a **custom-code** cell at all.

**Recommendation: C as the primary path, B as a later extension for
custom-code cells, A never.** And, per R148/R150/R153, a cell C cannot
render appears in the document as a named absence — *"Chart `cell-7` is
custom code and could not be included in this report"* — never as a gap.
`theme/slotStates.ts:34` already models this for the screen; the report
gets the same treatment.

---

## 2. What generates the PDF, and where it runs

### 2.1 Not `core`

Rendering a document is not "physics of the bike or bytes on disk", and
CLAUDE.md §2 says **no chart is drawn in Rust**. Doing it in `core` would
mean a PDF writer (`printpdf`/`typst`) *and* an SVG rasteriser
(`resvg`/`usvg`) *and* font embedding, to reproduce a picture the app has
already drawn — a large dependency tree in the crate that is meant to stay
pure, to duplicate work. `core` has `pulldown-cmark` already
(`rust/core/Cargo.toml:22`) and could render the prose, but the prose is
the easy half. **Reject.**

### 2.2 Not the WebView's own print-to-PDF

Checked in the dependency tree rather than assumed: on Windows wry's
`print()` is literally `self.eval("window.print()")`
(`~/.cargo/registry/.../wry-0.55.1/src/webview2/mod.rs:1712`), and Tauri's
own `Webview::print` documents *"Currently only supported on macOS on
`wry`"* (`tauri-2.11.5/src/webview/mod.rs:1482`). `PrintOptions` is
macOS-only and carries margins alone
(`wry-0.55.1/src/wkwebview/mod.rs:127`). WebView2's
`ICoreWebView2_7::PrintToPdf` *is* reachable — the COM binding is already
in the tree via `webview2-com-sys-0.38.2/src/bindings.rs:30069` — but
wiring it means `with_webview()` + raw COM in `app/src-tauri`,
Windows-only, with no equivalent for Android/iOS and a separate WKWebView
`createPDF` for macOS. Good as a later platform optimisation; **wrong as
the lane's foundation.**

`window.print()` from JS *does* work everywhere and needs zero
dependencies. It gives a dialog, and the user picks "Save as PDF". That is
a legitimate **v1** and it is how the lane lands end-to-end in one task
(section 5, task R2) — but it is not "the Analyze button produces the
report" (decision 89).

### 2.3 The app, with a vendored JS PDF writer (recommended)

**Recommendation: compose the report as a purpose-built HTML document in
the host realm, and produce PDF bytes in JS with vendored `jsPDF` +
`svg2pdf.js`, then hand the bytes to a new thin `idl-rs-tauri` command
that writes the file.**

- **Bundling / offline.** Both are MIT, pure JS, no runtime fetches:
  ordinary pinned `package.json` deps bundled by Vite — the same vendoring
  shape as `@xyflow/react` (`app/package.json:20`), not a CDN. Roughly
  350 KB + 50 KB minified, and only in the lazily-imported report chunk,
  so nothing is paid at startup. **No CDN, ever** is honoured.
- **Charts.** `svg2pdf.js` consumes the very `SVGSVGElement` option C
  produces, as **vectors** — a chart stays sharp when the mechanic zooms
  in on a phone. This pairing is what makes option C worth its cost.
- **Fonts.** jsPDF embeds TTF/OTF, not `woff2`. `app/src/assets/fonts/`
  holds only `woff2` (with `FONTS.md` recording provenance) — so either add
  the matching IBM Plex `.ttf` faces beside them (same vendoring pattern,
  ~200 KB each, licence already accepted) or ship v1 on jsPDF's built-in
  Helvetica. Recommend the TTFs: a report in the app's own typeface is the
  difference between "a document" and "a dump".
- **Writing the file.** No `fs` plugin is registered
  (`app/src-tauri/capabilities/default.json` grants `core:default` and
  `dialog:default` only) and R52 Q4 already rejected reaching the
  filesystem through a Tauri fs plugin because it bypasses `<data>`
  resolution. `dialog:default` **does** include `allow-save`
  (`tauri-plugin-dialog-2.7.3/permissions/default.toml:14`), so: JS opens
  the save dialog, and a new `write_report_pdf(path, bytes)` command in
  `rust/tauri` writes it. That is the lane's only Rust.

**The three costs, honestly**: two new npm deps plus ~400 KB of vendored
TTF (needs Isaac's yes — open question 2); a second chart render path that
can drift from the screen's (mitigated, not eliminated); and custom-code
cells that cannot be included until option B lands.

---

## 3. What a report actually contains

Not "the notebook, printed". The reader is a rider or a mechanic on a
chairlift who did not build the workbook.

### 3.1 Structure

1. **Cover.** Report title (workbook name), generated-at timestamp, and
   the provenance line: app version, `engine_version`, `importer_version`
   (`ipc/catalog.ts:16-20`). A number with no version behind it cannot be
   reproduced later.
2. **Session block**, one per distinct session in the selection: rider,
   bike, venue, event, date/time, source format, device id. A field that
   is `""` renders **"not recorded"**, never blank — same rule as a
   missing chart (R148).
3. **Selection block.** The windows, in order, each with its
   `describeWindow` label, its duration, and its `--chart-N` colour swatch,
   so the charts below are readable without a legend hunt.
4. **Results, per window** (section 4) — the register in document order:
   prose, math values, tables, charts.
5. **Comparison table** when more than one window is selected: rows =
   scalar definitions, columns = windows, cells = value + unit.
6. **Omissions & diagnostics appendix.** Every cell not included and why;
   every failed window; every `unit_notes` entry
   (`ipc/workbook.ts:83-86`); the chart point budget actually used.

### 3.2 Units — non-negotiable

`CellDefResult.unit` is the three-state `UnitLabel`
(`ipc/workbook.ts:48-51`, R154). The report renders:

- `known` -> `12.4 mm`
- `dimensionless` -> `12.4`, no unit text, no marker
- `unknown{reason}` -> `12.4` plus a superscript reference into the
  appendix carrying `reason`

One shared helper (`model/unitText.ts`, task R3) serves both `MathCell` and
the report, so the screen and the page can never disagree.
`sample_rate_hz` (`null` = genuinely not applicable, never "unknown" —
R152) prints only where a rate is meaningful. A prose `${…}` **never**
auto-appends a unit (R154 item 5, C2 §5.1) — the report renders those
spans verbatim, exactly as the author wrote them.

### 3.3 Deliberately left out

The maths graph; the code panes and the editor; the Properties column; the
timeline strip and playback transport; staleness spinners; the tile /
decimation machinery; the raster underlay's interactive zoom; workbook
front matter and constants (unless a printed definition depends on one, in
which case that constant prints beside it); anything from a window that is
not selected (decision 61).

### 3.4 What replaces the things that do not print

- **A zoomable chart** -> a static chart at the window's full extent, with
  a caption naming the window, the X mode (time or distance), and the
  **point budget it was decimated to**. Without that last line a reader
  over-reads a smoothed trace as the real signal.
- **A hovering cursor** -> nothing, when no cursor is pinned. When one *is*
  pinned (decisions 51/56), a small "values at 1:12.4" table from the same
  source `CursorCard` uses, printed once under the chart group.
- **A live "stale, recomputing" state** -> the report is only ever built
  from a settled evaluation; if a window is stale at build time the builder
  waits, and if it cannot settle the appendix says so.

---

## 4. Per-window results

Selection is a list of windows (R115), so **two laps is the normal case**.

**Recommendation: one section per window, plus a comparison table — both,
not either.** The per-window sections carry prose, values and tables in
document order; the comparison table carries only *scalar* definitions
(`sample_rate_hz === null`, or `value.has_t === false`) as rows x windows.
A mechanic wants "lap 3 vs lap 5, high-speed compression peak" in one
place; a rider wants the narrative. Comparison-table-only loses the prose;
sections-only makes the reader do arithmetic across pages.

Charts are the exception: a chart cell renders **once, all windows
overlaid**, because that is how the data already arrives — one
`channel(...)` payload carries every window, distinguished by the `w`
column with `NaN` separators and per-window colours from
`windows[j].colour` (`host/protocol.ts:76`, C2 §5.1's R127 amendment).
Splitting an overlay chart per window would throw away the comparison the
data was shaped for. So: per-window *sections* for prose/values/tables,
overlaid charts grouped after them, each with a colour key.

**A failed window (R121).** `WindowEval` is `{ok} | {error}`
(`ipc/workbook.ts:256`) and a window-attributable failure fails only its
own entry. In the report a failed window gets **its own section, in its
selection position**, carrying its label and the `IpcError` as
`kind: message` — the same `ErrorText` shape as `MathCell.tsx:3` — plus an
entry in the omissions appendix. It is never dropped, never merged into a
neighbour, never leaves a hole in the numbering. Silently omitting a lap
that errored is the single worst outcome this lane can produce: the reader
would compare two laps believing they had three.

---

## 5. Task plan

TypeScript unless marked. Each task is independently committable and
leaves the tree green. Test filters are vitest paths
(`npx vitest run <path>`); the one Rust task names its cargo filter per
CLAUDE.md §8.

| # | Task | Lang | Spec | Test filter |
|---|---|---|---|---|
| **R1** | `Notebook/model/report/document.ts` — pure builder: `(cells, proseBlocks, WindowEval[], SelectionWindow[], SessionSummary[]) -> ReportDocument`, a typed block list (`cover`, `session`, `selection`, `windowSection`, `defTable`, `table`, `prose`, `chartSlot`, `absence{cellId, reason}`, `comparison`, `appendix`). Zero React, zero DOM, zero IPC. | TS | spec-during | `src/routes/pages/Notebook/model/report/document.test.ts` |
| **R2** | **End-to-end v1 (R147).** `components/ReportView.tsx` renders a `ReportDocument`; `styles/report-print.css` (`@page`, break-inside rules, host `@font-face` reuse); an "Export report" action in the Notebook bar calling `window.print()`. Every chart cell emits an `absence` block saying charts are not yet included. One session, no charts, **a real PDF out of the app.** | TS | — | `.../report/document.test.ts` (extended: chart-absence block) |
| **R3** | `model/unitText.ts` — three-state `UnitLabel` -> display text (R154); used by `MathCell.tsx` (which shows no unit today, `MathCell.tsx:9`) **and** by R1's `defTable`. `unit_notes` surface on the cell and in the appendix. Fixes a live gap, not just a report need. | TS | no spec change | `src/routes/pages/Notebook/model/unitText.test.ts` |
| **R4** | Per-window sections + comparison table + failed-window sections (section 4). `document.ts` iterates every `WindowEval`, not `primaryWindow`. | TS | spec-during | `.../report/document.test.ts` (add: two windows, one failing) |
| **R5** | `model/report/renderChart.ts` — `(PlotProps, CombinedChannelPayload, PlotThemeOptions, palette) -> SVGSVGElement`, via `await import("@observablehq/plot")`. A cell `plotForm.parse` rejects returns a typed `absence` reason instead. Tested against a jsdom SVG root. | TS | no spec change | `src/routes/pages/Notebook/model/report/renderChart.test.ts` |
| **R6** | Wire R5 into `ReportView`: `chartSlot` blocks become real SVG; print CSS keeps a chart with its caption. Charts now appear in the printed PDF. | TS | — | `.../report/renderChart.test.ts` |
| **R7** | **PDF bytes without a dialog.** Vendor `jspdf` + `svg2pdf.js` (+ IBM Plex TTFs, pending open question 2); `model/report/toPdf.ts` builds the bytes; save dialog (`dialog:save`, already permitted) picks the path; new `write_report_pdf` command in `rust/tauri/src/commands/`, typed `IpcError`, plus its `app/src/ipc/report.ts` wrapper and the C3 §3.4 entry together (CLAUDE.md §7). | TS + **Rust** | spec-during (C3 §3.4) | TS: `src/ipc/report.test.ts`; Rust: `cargo test -p idl-rs-tauri write_report_pdf` |
| **R8** | **Analyze (decisions 50, 89).** The per-session Analyze button — it does not exist anywhere today (`grep` finds only a Settings how-to mentioning idl0's Analyze tab). Selects the session, jumps to the Notebook, evaluates, builds the report, shows visible progress; latency accepted. | TS | spec-during | `src/routes/pages/Notebook/model/report/analyzeFlow.test.ts` |
| **R9** | *(extension)* Custom-code chart capture via sandbox PNG (option B): `captureCell` host->sandbox message, `cellCaptured`/`cellCaptureFailed` back, PNG data URL only. Gated on the opaque-origin `toDataURL` verification. Until it lands, R2's absence block stands. | TS | spec-during (C3 / R69 protocol) | `src/routes/pages/Notebook/host/protocol.test.ts` |

**Count: 9 tasks — 8 TypeScript, 1 mixed TypeScript + Rust (R7).**
End-to-end lands at **R2** (task 2 of 9): a printable, sendable PDF of one
session's prose, math values and tables, with charts honestly declared
absent. Everything after that widens it.

---

## 6. Open questions for the lead

1. **Where does lane R's SPEC section live?** The report is app-side, so no
   existing contract owns it. *Recommend:* a new lane section in the design
   doc (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`, new
   "Report" section) for the document model, plus a C3 §3.4 entry for
   `write_report_pdf` — no new contract letter.
2. **Two new npm deps (`jspdf`, `svg2pdf.js`) and ~400 KB of vendored IBM
   Plex TTF.** *Recommend:* yes to both; the alternative is either a print
   dialog forever (contradicts decision 89's "produces the report") or a
   Windows-only COM path. Isaac's call, being a bundle-size and licence
   decision. If no: ship R2's `window.print()` path as the lane's final
   answer and cut R7.
3. **Custom-code `js` cells.** *Recommend:* named absence (R2) now, sandbox
   PNG capture (R9) later — and R9 only once the opaque-origin
   `canvas.toDataURL()` behaviour is verified in the real WebView. If it
   throws there, custom-code charts stay out of reports permanently and the
   document must say so plainly.
4. **Whole notebook, or a marked subset?** A season workbook may hold ~50
   definitions (decision 42); printing all of them is not a chairlift read.
   *Recommend:* whole notebook for v1, then an opt-out `# report: false`
   trailing annotation, which fits C2 §3.2's existing annotation scan
   beside `shape:`/`label:`/`unit:` (R164). Needs Isaac.
5. **Where does the PDF go?** C4 defines no `reports/` directory, and a
   report is a derived output, not a synced source. *Recommend:* a save
   dialog to a user-chosen path, nothing cached under `<data>`. (If Analyze
   should auto-produce a file with no dialog, it needs a default location —
   that is a C4 change.)
6. **Multi-window layout.** *Recommend:* per-window sections **and** a
   scalar comparison table, with overlay charts grouped after (section 4).
   The alternative — comparison-first — reads better for a mechanic and
   worse for a rider.
7. **The bike setup sheet / "what changed" (decision 79, lane B, not
   landed).** The brief asks the report to say what changed; nothing
   records it yet. *Recommend:* R1 emits a `Setup` block rendering "no
   setup sheet recorded for this session" — an explicit reserved absence
   (R148) that lane B later fills, rather than a section that silently
   appears one day.
8. **Platform scope.** *Recommend:* desktop only for this lane. Both
   `window.print()` and jsPDF work in a mobile WebView, but the save/share
   path on Android/iOS is a different mechanism and would double R7.
   Decision 85's reader is on a phone; the *author* is not.

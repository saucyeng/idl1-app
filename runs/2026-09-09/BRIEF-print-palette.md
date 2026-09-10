# Lane brief — the report's own print palette (R174)

**Worktree:** `../idl1-app-worktrees/palette`, branch `palette`, off `main`.
App-only TypeScript. Do not touch `rust/`, never commit on `main`, never
push.

**Spec discipline:** no contract change. `CHANGELOG.md` gets a line, and it
should *remove* the disclosed-gap sentence this lane closes (the paragraph
in the R6 entry that points at R174).

## Read first

**Ruling R174**, in full, at the end of `runs/2026-09-03/decisions.md`. It
settles the design; this brief is the mechanical half. R169 and R173 are
worth skimming for why the chips matter.

## The defect

`components/ReportView.tsx` passes `plotTheme(documentVars())` and
`seriesPalette(documentVars())` into `renderChart` — the **screen's dark
theme** — onto a page `styles/report-print.css` deliberately forces to
`color: black; background: white`. Amber `--chart-3` on white is a
highlighter stroke; a `#353a32` grid is invisible; `#9a968a` axis text
washes out.

**And it is not only the lines.** `ReportView.tsx` renders window swatches
as `backgroundColor: var(--chart-N)` (around lines 154 and 203) and window
section borders the same way. That selection block is the report's **only
colour key** — R173 made it so, because Plot has no colour scale to legend
against. If the charts get print colours and the swatches keep screen ones,
a reader matches a swatch to the wrong line, inside a document with nothing
to check it against.

## Tasks

### Task 1 — one print palette module

A new module under `routes/pages/Notebook/model/report/` (name it to say
what it is) exporting:

- the eight print series colours, and a resolver from a `--chart-N` token
  to one of them;
- a `PlotThemeOptions` for print — near-black axis text and rules, a grid
  light enough to read through but present.

**Derive the eight from the existing hues in `styles/tokens.css`
(`--chart-1: #5ba6f0` … `--chart-8: #e05a63`), do not replace them.** Keep
the hue and the slot order; adjust lightness/saturation until each meets a
stated contrast ratio against white. Put the target ratio in the code as a
named constant with a one-line rationale, and state in the module doc
comment that these are a first pass chosen for contrast, **not
brand-approved values**, so the next person retunes them without
archaeology. Isaac expects to tweak these.

Chart chrome follows `report-print.css`'s existing black/white/gray
convention — do not invent a third one.

**No `documentVars()` on any report path.** The print values are static:
they do not read the live document's custom properties, which is the whole
point.

### Task 2 — one resolver, both consumers

`ReportView.tsx` resolves colours **once per report render** and uses that
one result for both the `chartSlot` charts and every swatch/border it draws
from a `--chart-N` token (the `var(--chart-N)` inline styles around lines
154, 163, 169, 203 — find them all; grep `--chart` and `colour` in that
file).

R174's expensive half is exactly this: if swatches and lines are ever
resolved separately they can drift, and the report's key silently lies.
Structure it so a future edit cannot resolve one without the other — one
call site, one value passed down, not two lookups that happen to agree
today.

### Task 3 — tests

Pure logic gets tests (`CLAUDE.md` §4 — rendering does not). At minimum:

- every `--chart-1`…`--chart-8` token resolves to a print colour
- each of the eight meets the stated contrast ratio against white (assert
  it, computed — this is the claim the module makes about itself, so it
  should fail if someone retunes a colour past the threshold)
- an unknown or malformed token falls back without throwing
- the print plot theme does not equal the screen theme (a regression guard
  against someone reintroducing `documentVars()` on this path)

## Gate

From `app/`: `npx tsc --noEmit`, then `npx vitest run`. Main's baseline is
**178 files / 1767 tests, all passing** — your run must be all-passing at or
above that.

## Rules

`CLAUDE.md` binds: Arrange/Act/Assert with blank lines, test names
`thing — condition — result`, doc comment on every public symbol. Colour
literals ARE permitted in this one module — it is defining a palette, the
same exemption `tokens.css` and `report-print.css` already have — but
nowhere else. No AI attribution trailers. Commit per task. If a placement or
behaviour is not stated here or in R174 — **stop and ask**, and keep
building whatever does not depend on the answer while you wait.

## Report back (≤ 15 lines)

Tasks done; the gate's exact file/test counts; the eight derived colours and
the contrast ratio you targeted; and every `--chart-N` consumer you found in
`ReportView.tsx` (so I can confirm none was missed).

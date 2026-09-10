# Lane brief — a printed chart states what it is

**Worktree:** `../idl1-app-worktrees/honesty`, branch `honesty`, off `main`.
App-only TypeScript. Do not touch `rust/`, never commit on `main`, never
push.

**Spec discipline:** no contract change — both fields already exist on the
wire. `CHANGELOG.md` gets a line, and it should *remove* the disclosed-gap
sentence task 1 closes (in the R6 entry, the clause about captions not
carrying X mode or decimation budget).

## Why these two together

Both are the same defect: **a chart that does not say what it is.** On
screen you can hover, zoom, or check a control to find out. On paper you
cannot — the reader has only what is printed. Two things the app knows and
does not currently say:

## Task 1 — captions carry the X mode and the point budget

`runs/2026-09-09/report-plan.md` §3.4, verbatim:

> A zoomable chart → a static chart at the window's full extent, with a
> caption naming the window, the X mode (time or distance), and the **point
> budget it was decimated to**. Without that last line a reader over-reads
> a smoothed trace as the real signal.

The caption today names only the windows. Add the X mode and the decimation
budget the data was actually reduced to.

**Use the real number, not the requested one.** If the payload was decimated
to fewer points than asked for, or not decimated at all because the record
was short enough, the caption must say what actually happened. A caption
claiming a budget the data did not go through is worse than no caption —
it is a specific false statement about the signal. If the actual figure is
not reachable from what `ReportView`/`document.ts` already hold, **stop and
ask** rather than printing the requested budget as if it were the outcome.

Word it for a reader who does not know the codebase. "2048 points" means
nothing on its own; say what was reduced to what.

## Task 2 — a spectral chart states its magnitude unit

`RasterMeta.magnitude_unit` (added by R167, `app/src/ipc/rasters.ts`) is
computed by the engine on every raster fetch and **displayed nowhere**. It
is the three-state `UnitLabel` — `known` / `dimensionless` /
`unknown{reason}` — that says what a spectrum's magnitude axis is in:
`m/s` for `raw_magnitude`, `(m/s)²/Hz` for `density`, `(m/s)²` for
`spectrum`.

Surface it wherever a spectral raster is rendered. Use the existing
`model/unitText.ts` (`formatUnit`) — do **not** write a second formatter;
R169 is a whole ruling about what happens when two places format the same
thing. Follow its three-state rule exactly: `known` shows its text,
`dimensionless` shows nothing, `unknown` shows nothing but carries its
reason where a reader can reach it (`unitText.ts` returns `unknownReason`
for exactly this).

`null` is the fourth case and is not "unknown": it means the raster has no
spectral magnitude at all (`kind: "histogram2d"`). Render nothing, and do
not route it through the unknown path.

Find every place a spectral raster's axes are labelled — screen and report
both, if both exist — and report what you found.

## Gate

From `app/`: `npx tsc --noEmit`, then `npx vitest run`. Main's baseline is
**179 files / 1795 tests, all passing** — your run must be all-passing at or
above that. Pure logic gets tests; rendering does not (`CLAUDE.md` §4), so
put the caption-wording logic in a pure function and test that.

## Rules

`CLAUDE.md` binds: Arrange/Act/Assert with blank lines, test names
`thing — condition — result`, doc comment on every public symbol, no colour
literals, no AI attribution trailers. Commit per task. If a placement or
behaviour is not stated here — **stop and ask**, and keep building whatever
does not depend on the answer while you wait.

## Report back (≤ 15 lines)

Tasks done; the gate's exact file/test counts; whether the *actual*
decimation figure was reachable (and from where); and every site you found
that labels a spectral raster.

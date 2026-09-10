# Lane brief — a spectrogram's axes say what they are (R177)

**Worktree:** `../idl1-app-worktrees/rasterlabels`, branch `rasterlabels`,
off `main`. App-only TypeScript. Do not touch `rust/`, never commit on
`main`, never push.

**Spec discipline:** no contract change — all three fields already exist on
the wire and are already fetched. `CHANGELOG.md` gets a line.

## Read first

**Ruling R177**, at the end of `runs/2026-09-03/decisions.md`. It explains
the scope split and, more importantly, the one thing this lane must not do.

## The gap

`RasterMeta` (C3 §3.6, mirrored in `app/src/ipc/rasters.ts`) carries
`x_label`, `y_label` and `scale: { vmin, vmax, kind }`. `RasterUnderlay.tsx`
**already fetches all of them** via `fetchRasterMeta` and draws none. So a
spectrogram has unlabelled axes and no indication of what its colours mean,
while the engine has already computed every piece of it.

`magnitude_unit` on the same DTO was this same gap and was closed a few
hours ago — these are its three siblings.

## Task 1 — axis labels

Render `x_label` and `y_label` on the raster's axes. They arrive as
engine-authored display strings; render them as given — do not reformat,
re-case, or append units to them.

Match how the surrounding chart labels its own axes rather than inventing a
second convention; if the raster underlay has no axis furniture at all
today, say so in your report and put the labels somewhere defensible and
plain.

## Task 2 — the scale bounds, as text

Render `scale.vmin` and `scale.vmax` as a plain numeric range, with the
already-surfaced `magnitude_unit` as its unit — e.g. a compact
`0.00 – 1.42 (m/s)²/Hz`.

- Format the numbers for a human at a glance, not full float precision.
  Put the formatting in a **pure function** and test it: very small and
  very large magnitudes both occur in spectra, so it needs to stay readable
  across several orders of magnitude.
- Reuse `model/unitText.ts` for the unit — `formatUnit`'s three-state rule
  (`known` shows text, `dimensionless` shows nothing, `unknown` shows
  nothing but carries its reason). **Do not write a second unit
  formatter**; R169 is an entire ruling about that.
- `magnitude_unit === null` means the raster has no spectral magnitude
  (`kind: "histogram2d"`) — show the range with no unit, and do not route
  it through the unknown path.
- `scale.kind` is `"linear"` today and is the only value C3 defines. Do not
  add branching for a log scale that does not exist; if the field is worth
  surfacing at all, that is a question for me.

## What this lane must NOT do (R177)

**Do not draw a gradient colour bar, and do not implement the Turbo colour
ramp in TypeScript.** The ramp lives in `idl_rs::colormap::turbo_rgba8` —
Rust. A second copy in TS would let the legend drift from the very pixels
it describes, with no test able to catch it.

**Also not acceptable:** sampling the ramp by reading pixel bytes back out
of a fetched raster. It would work, and it makes the legend depend on
whatever data happened to be on screen.

The colour bar lands in a later lane where the **engine hands over RGBA
stops** and TypeScript builds a CSS gradient from stops it was given. If
you find yourself needing the ramp, you have left this lane's scope —
stop and say so.

## Gate

From `app/`: `npx tsc --noEmit`, then `npx vitest run`. Main's baseline is
**179 files / 1801 tests, all passing** — your run must be all-passing at or
above that. Pure logic gets tests; rendering does not (`CLAUDE.md` §4).

## Rules

`CLAUDE.md` binds: Arrange/Act/Assert with blank lines, test names
`thing — condition — result`, doc comment on every public symbol, no colour
literals, no AI attribution trailers. Commit per task. Anything not stated
here — **stop and ask**, and keep building whatever does not depend on the
answer while you wait.

## Report back (≤ 15 lines)

Tasks done; the gate's exact file/test counts; whether the raster underlay
had any existing axis furniture to match (or whether you had to place the
labels from scratch); and your number-formatting rule for the range.

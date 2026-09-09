# Lane brief — the FFT scaling picker learns the language's three names (R168)

**Worktree:** `../idl1-app-worktrees/fft-scaling`, branch `fft-scaling`, off
superproject `main`. App-only: TypeScript under `app/src`. **Do not touch
`rust/`** and do not commit on `main`.

**Spec discipline:** spec-during. C3 §3.6 and C2 §3.3.1 already carry the
three names (R167); this lane's only spec touch is C2 §5.3's parameter table
if it still lists two scalings — check, and correct it in the same commit if
so. `CHANGELOG.md` gets a line.

## Background — what already landed

Ruling R167 made the raster wire speak the maths language's three scaling
names: **`density`**, **`spectrum`**, **`raw_magnitude`**. The engine keeps
`"magnitude"` as a serde alias for `raw_magnitude` — the identical
computation, un-normalised `sqrt(avg_power)` — so nothing stored changes
meaning. R168 widened the TS union in `app/src/ipc/rasters.ts` to all four
names and said the retired one stays *accepted* but is *never offered*.

The app half was deliberately left undone, and is this lane's whole job: the
FFT properties form can still only spell Magnitude and Density, so the
`spectrum` scaling the engine now supports is unreachable from the chart UI.

## Tasks

### Task 1 — split the vocabulary in two

`app/src/routes/pages/Notebook/plotForm/types.ts` currently has one constant:

```ts
export const FFT_SCALINGS: readonly FftParams["scaling"][] = ["magnitude", "density"];
```

Replace it with two, each with a doc comment saying which job it does:

- `FFT_SCALINGS` — everything **accepted** when parsing stored cell code:
  `["density", "spectrum", "raw_magnitude", "magnitude"]`. `plotForm/parse.ts`
  (line ~665) keeps using this one, unchanged, so a workbook written before
  R167 still round-trips.
- `FFT_SCALING_OPTIONS` — the three **offered** in the picker:
  `["density", "spectrum", "raw_magnitude"]`.

### Task 2 — the picker

`components/PropertiesForm.tsx` (~line 588). Render `FFT_SCALING_OPTIONS`,
with display text: `density` → "Density (PSD)", `spectrum` → "Spectrum",
`raw_magnitude` → "Magnitude".

**One correctness point, which is why this is not a one-line map change.** A
cell stored with `scaling: "magnitude"` has a value that matches no offered
option. An HTML `<select>` with an unmatched `value` silently displays its
first option — the form would show "Density (PSD)" over a cell that is not
density, and the next unrelated edit would write that lie back. So: when
`fft.scaling === "magnitude"`, render a fourth `<option value="magnitude">`
labelled "Magnitude" **for that render only**. Picking anything else drops it;
picking "Magnitude" from the offered list writes `raw_magnitude`. Test this
directly — a stored `"magnitude"` cell renders four options and the selected
one is the retired value.

### Task 3 — seeds and generated code emit the new spelling

- `model/propertiesForm.ts`: `defaultFftPlotProps` seeds
  `scaling: "raw_magnitude"` and its `suggestSpectrumAxisLabel` call passes
  the same.
- `suggestSpectrumAxisLabel` gains its third branch. The three labels must
  match §3.3.1's rule exactly (`core/src/math/units.rs::spectral_rule`):
  - `density` → `` `PSD (${unit}²/Hz)` ``  (unchanged)
  - `spectrum` → `` `Power (${unit}²)` ``  (new)
  - `raw_magnitude` **and** `"magnitude"` → `` `Magnitude (${unit})` ``
  Write it as an exhaustive switch, not a ternary chain, so a future fourth
  name is a compile error rather than a silent fall-through to Magnitude.
- Update the doc comments that name `"magnitude"` as the default.

Generated code (`plotForm/generate.ts`) needs no logic change — it writes
whatever `props` carry — but its tests and every fixture spelling
`scaling: "magnitude"` as a *newly-seeded* value should move to
`raw_magnitude`. **Keep at least one fixture on the retired spelling**, in
`plotForm/parse.ts`'s and `roundTrip.test.ts`'s tests, named so it is
obviously the back-compat case: a stored cell saying `"magnitude"` must parse,
round-trip, and render.

### Task 4 — the host var and the sandbox call

`model/jsCellBinding.ts`'s spectrum host-var key includes the scaling, so
these three names change the key text for newly-seeded cells. That is
harmless (it is a cache key, recomputed) but the tests assert the exact
string — update them. Check `model/jsCellCalls.ts` and the sandbox's
`spectrum(...)` option parsing accept all four spellings; if either has its
own hard-coded two-name list, that is a third copy of the vocabulary and it
should read `FFT_SCALINGS` instead. Report it if you find one.

## Gate

From `app/`: `npx tsc --noEmit`, then `npx vitest run`. Main's baseline is
**175 files / 1732 tests, all passing** — your run must be all-passing with a
count at or above that. No cargo in this lane.

## Rules

Repo standing orders (`CLAUDE.md`) apply: Arrange/Act/Assert with blank lines,
test names `thing — condition — result`, doc comment on every public symbol,
no AI attribution trailers, never push. Commit per task. If a field,
behaviour or placement is not stated here or in the specs — **stop and ask**;
do not infer.

## Report back (≤ 15 lines)

Tasks done, the gate's file/test counts, anything you found that contradicts
this brief, and any third copy of the scaling vocabulary you had to fix.

# L6 Task 20 — implementer brief (FFT in the `plotForm` grammar and the Properties panel)

You are the implementer for **L6 Task 20**, ruled in **R78** (L6 Task 19 Q1:
"widen C2 §5.3 with an FFT chart production … the grammar + Properties form
work is **L6 Task 20**") and **R79** (the seven grammar questions, answered),
`runs/2026-09-03/decisions.md`. The C2 amendment those rulings ordered is
**already applied on `main`** (commit `148774a`). Your job is to implement it.

Task 19 built the request/driver/payload plumbing and stopped at its Step 4,
because the surface was undecided. **Task 20 is that surface**: the grammar
production, the Properties panel, and the wiring that makes an FFT cell draw a
spectrum. ONE commit, then report.

Read, in this order, before writing a line:

1. **R78** (the "L6 Task 19 (FFT)" paragraph) and **R79** in full,
   `runs/2026-09-03/decisions.md`.
2. **C2 §5.3 as amended**,
   `docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`, lines ~636–994.
   Read the whole of it — the EBNF, the "Rules that carry the same weight as
   the EBNF" list, "The spectrum host variable", the parameter table, the
   `PlotProps` shape, the custom-code rule's 2026-09-06 bullet, worked
   Example 5, and the twelve-item "FFT chart Properties panel controls" list.
   **This is your specification.** Where this brief and C2 §5.3 disagree, C2
   wins and you report the disagreement.
3. **`docs/IDL0_SPEC.md` §26.2**'s "Chart type in the form (FFT)" paragraph,
   **§26.3** (the interaction rules you must obey), **§26.6**'s FFT row (which
   you flip), **§26.7**'s N5 clause.
4. **`runs/2026-09-06/C2-FFT-AMENDMENT-DRAFT.md`** — the draft's Q1–Q7
   sections carry the *reasoning* behind R79's answers, including the
   `spectrumKey` rationale (Q2) and the bin-budget rationale (Q4). Background,
   not authority: the applied C2 text is authority.
5. **`runs/2026-09-05/WAVE2-OPERATING-BRIEF.md` §4** — the effects/driver rule
   a reviewer grades Critical on sight.
6. **The Task 19 brief**, `runs/2026-09-06/followons/brief-l6-task19-fft-chart.md`,
   Steps 1–4 and its Interfaces 1–3. That is the shape of the code you build on.

**Spec discipline: spec-during.** `docs/IDL0_SPEC.md` §26.6's FFT row and
§26.7's N5 clause change in this commit, and only in this commit.

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -5
```

Required: branch `main`, tree clean apart from untracked `runs/` files. Any
modified tracked file ⇒ **STOP and report**.

Then confirm **Task 19's prerequisites are on `main`**. Task 20 cannot start
without them. Check each, by reading the file:

- [ ] `app/src/routes/pages/Notebook/model/fftRequest.ts` exists and exports
      `FftRequest`, `fftRequestFor`, `segmentCount`, `binFrequencyHz`,
      `frequencyAxisHz`, `fftRequestEquals`, with tests beside it.
- [ ] `app/src/routes/pages/Notebook/model/fftDriver.ts` exists and exports
      `FftDeps`, `FftAction`, `runFft`, with tests beside it.
- [ ] `app/src/routes/pages/Notebook/host/protocol.ts`'s `HostVarPayload`
      has a `{ kind: "spectrum"; length; f; m }` arm, and
      `sandbox/main.ts`'s `materializeHostVar` has the matching branch
      producing `{ f, m }[]` records.
- [ ] `host/SandboxHost.ts` exports `setSpectrumHostVar` beside
      `setChannelHostVar`.
- [ ] `app/src/ipc/rasters.ts` exports `FftAveraging`, `DecodedFft`,
      `decodeFft`, `fetchFft` (it did when this brief was written).

**If any of the first four is missing, STOP and report** — Task 19 has not
landed, or landed short, and the lead sequences it before you. Do **not**
write Task 19's modules yourself; do not create `app/src/ipc/fft.ts`.

Also confirm, so you know what you are changing:

- `plotForm/types.ts` today has `PlotProps { marks; x?; y?; color? }` with
  **no** `chart` discriminant and `XAxisProps` with **no** `type` field.
- `plotForm/parse.ts`'s `parseXField` rejects any `type` key on `x`
  outright (line ~346's doc comment says why).
- `plotForm/roundTrip.test.ts` enumerates 1440 time-cell cases and asserts
  the count literally. You extend it; you do not weaken it.
- `model/jsCellBinding.ts`'s `bindingFor` reads `props.marks` unguarded — it
  will not typecheck against a discriminated union until you fix it.
- `model/propertiesForm.ts`'s `addMark`/`removeMark`/`updateMark`/`moveMark`
  take and return `PlotProps` — same problem.

---

## Where

- Repo `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  single primary checkout.
- Work only under `app/src/routes/pages/Notebook/**`, plus
  `docs/IDL0_SPEC.md` (§26.6 and §26.7 only) and `CHANGELOG.md` (repo root).
- **Never run any cargo command.** TypeScript only. No new npm dependency.
- Do not push. Do not amend a reported commit.
- **Ownership STOPs** — touching any of these is STOP and report:
  `app/src/App.tsx`, `app/src/state/**`, `app/src/routes/types.ts`,
  `app/src/ipc/**` (including `rasters.ts` — you need no change there),
  `app/vite.config.ts`, `app/package.json`, `app/src-tauri/**`, `rust/**`,
  and **either contract spec**. C2 §5.3 is already amended; you implement it,
  you never edit it. If the applied C2 text is wrong or self-contradictory,
  that is a lead action — report it, implement your best reading under a
  stated assumption, and list it in your report.
- Reference source, **read-only**: idl0's Flutter FFT chart at
  `C:\Users\isaac\Documents\Saucy\saucyeng\idl0-app\app\lib\ui\tabs\analyze\fft_chart.dart`,
  `.../fft_window_resolver.dart`, `.../chart_type_catalog.dart`. Read these
  for the parity-gap list (Step 8). Port semantics, never widgets.

---

## Interfaces

### 1. `plotForm/types.ts` — the discriminated union (Step 1)

C2 §5.3's "`PlotProps` shape" block is illustrative; **this task owns the
code**. Implement it as written there:

```ts
export type PlotProps = TimePlotProps | FftPlotProps;

export interface TimePlotProps {
  chart: "time";
  marks: MarkProps[];
  x?: XAxisProps;          // no `type` field — unchanged from today
  y?: YAxisProps;
  color?: { legend: true };
}

export interface FftPlotProps {
  chart: "fft";
  mark: SpectrumMarkProps;  // exactly one, by type, not by runtime check
  x: FftXAxisProps;         // see Open Question 1 — required, with a required `type`
  y?: YAxisProps;
  color?: { legend: true };
}

export interface SpectrumMarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY";
  fft: FftParams;           // all six fields required
  stroke?: string;          // CSS colour literal
  strokeWidth?: number;     // px
}

/** All six required, in this order — C2 §5.3: "a missing key is custom
 *  code, not a default". `windowSize`/`hopSize` are samples, or the token
 *  `"all"` meaning the whole record (R79 Q1). */
export interface FftParams {
  windowSize: number | "all";   // samples
  hopSize: number | "all";      // samples
  window: "rectangular" | "hann" | "hamming";
  detrend: "none" | "mean" | "linear";
  scaling: "magnitude" | "density";
  averaging: "none" | "mean" | "median" | "max";
}

/** The FFT cell's x scale. `type` is required and always emitted — C2
 *  §5.3: "In an FFT cell the generator does emit `x.type`, always, for the
 *  same reason the `fft_params` keys are required." */
export interface FftXAxisProps {
  label?: string;
  domain?: [number, number];   // Hz
  type: "linear" | "log";
}
```

Add runtime enum arrays beside `MARK_NAMES`/`Y_AXIS_TYPES`, for the same
stated reason those exist (a TS union is not reflectable, and a UI control
must not hardcode a second copy that can drift):
`SPECTRUM_MARK_NAMES`, `FFT_WINDOW_FUNCTIONS`, `FFT_DETRENDS`,
`FFT_SCALINGS`, `FFT_AVERAGINGS`, `FFT_X_AXIS_TYPES`.

Existing time props gain `chart: "time"`. Every existing test that builds a
`PlotProps` literal gains it too — that is expected churn, not a redesign.

### 2. `plotForm/generate.ts` (Step 2)

Branch on `props.chart`. The time branch emits **exactly what it emits
today**, byte for byte — C2 §5.3: "no landed document changes on disk". Prove
that with a test, do not assert it in a comment.

The FFT branch follows Example 5 verbatim: top-level order `x`, `y`, `color`,
`marks`; `x` always carries `type`; the single mark rendered at column 4 as

```
Plot.<mark>(spectrum("<channel>", { windowSize: …, hopSize: …, window: …, detrend: …, scaling: …, averaging: … }), { x: "f", y: "m"[, stroke: …][, strokeWidth: …] })
```

with the `fft_params` object on one line, the six keys in the grammar's fixed
order, `"all"` emitted as a quoted string and a sample count as a bare
integer. Two-space indent, `Plot.plot({` at column 0, no trailing newline —
the existing formatting policy, unchanged.

### 3. `plotForm/parse.ts` (Step 3)

`parse(code)` returns `PlotProps | null` and now supplies the discriminant.
Rules, all of which are C2 §5.3's, restated so you cannot miss one:

- A `marks` array of `channel_call` marks ⇒ `chart: "time"`, as today.
- A `marks` array holding exactly one `spectrum_call` mark ⇒ `chart: "fft"`.
- A `marks` array **mixing** the two ⇒ `null`.
- **Two** spectrum marks ⇒ `null`.
- A `spectrum_call` missing any of the six `fft_params` keys, carrying an
  extra key, or carrying a non-literal in place of a grammar literal ⇒ `null`.
- A `spectrum_mark`'s `x`/`y` that are not the literal strings `"f"`/`"m"`
  ⇒ `null`. A `time_mark`'s remain `"t"`/`"v"`.
- `x.type` on a **time** cell ⇒ `null` (unchanged behaviour, now for a
  stated reason rather than "reserved").
- An FFT cell whose `x` is absent, or present without `type`, ⇒ `null`
  (Open Question 1's recommendation; if the lead answers otherwise, this is
  the one line that changes).
- `spectrum_mark_name` outside `lineY | dot | areaY` ⇒ `null`.
- `lap` is **not expressible** on `spectrum_call`: `spectrum("x", {…}, …)`
  with any third argument, or a `{ lap: n }` anywhere in it, ⇒ `null`.
- An empty `marks: []` keeps parsing as a time cell with no marks, as today.

`parse` still never throws, never `eval`s, and is order-insensitive over
recognised keys. Fail closed: any deviation is `null`, never a partial parse
and never a defaulted field.

### 4. `model/fftRequest.ts` — add `spectrumKey` (Step 4)

C2 §5.3 puts it here ("one shared pure function, `spectrumKey(channelId,
fftParams)`"), beside `fftRequestFor`:

```ts
/** The sandbox host-variable name one FFT cell's spectrum is published
 *  under. The channel id plus the six `fft_params` values joined in C2
 *  §5.3's fixed order — two cells on the same channel with different
 *  windows are different spectra. Computed by this one function on both
 *  the host side and the sandbox side so the two cannot drift. */
export function spectrumKey(channelId: string, params: FftParams): string;
```

Pick a separator that cannot occur in a channel id or an enum token and say
in the doc comment why. The key is opaque: nothing parses it back.

**Constraint:** `sandbox/main.ts` imports this function, so `fftRequest.ts`
must stay free of any **value** import from `app/src/ipc/**` (a value import
would pull `@tauri-apps/api/core` into the sandbox bundle). Type-only imports
are erased and are fine. Verify this and say so in your report; if
`fftRequest.ts` has picked up a value import, see Open Question 4.

Also add here, with a doc comment stating that no source fixes the number
(R79 Q4 ruled the *mechanism*, not the value):

```ts
/** Host-side cap on a spectrum's bin count. Above it an FFT cell shows a
 *  note and does not fetch — a cap is not a parameter of the picture, so
 *  it is a host constant and not a grammar token (R79 Q4). Decimating in
 *  TypeScript is forbidden (CLAUDE.md §3), and `fetch_fft` has no bin
 *  budget argument, so refusing is the only honest option. */
export const MAX_FFT_BINS = 16384;

/** True when this request would exceed {@link MAX_FFT_BINS}. Checked
 *  before the fetch against the resolved window size in samples, which is
 *  a conservative upper bound on the bin count under any real-FFT
 *  convention — this function never assumes a bins-per-window relation
 *  C3 §3.6 does not state. */
export function exceedsBinCap(resolvedWindowSizeSamples: number): boolean;
```

Guard again **after** decode, on `magnitudes.length`, in the binding layer:
over the cap, show the note and push no host variable.

### 5. `model/jsCellBinding.ts` — the `fft` arm (Step 5)

C2 §5.3: "The host recognises an FFT cell through `parse`, not a scan."
There is no regex and no second recogniser, and **custom code gets no
spectrum**.

Make `JsCellBinding` a discriminated union:

```ts
export type JsCellBinding = TimeCellBinding | FftCellBinding;

export interface TimeCellBinding {
  kind: "time";
  props: TimePlotProps;
  channels: JsCellBindingChannel[];
  initialSpan: InitialSpan;
}

export interface FftCellBinding {
  kind: "fft";
  props: FftPlotProps;
  channelId: string;
  /** `ChannelSummary.sample_count`, samples — what `"all"` resolves to. */
  sampleCount: number;
  /** Built by `fftRequestFor`; `lap` is always `null` (C3 §3.6). */
  request: FftRequest;
  /** `spectrumKey(channelId, props.mark.fft)` — the host variable name. */
  hostVarName: string;
  /** Non-null when this cell must not fetch: too few samples (fewer than
   *  two, R76), or over `MAX_FFT_BINS`. The string is the note the cell
   *  shows (R78 Task 19 Q3: the `JsCellFrame` note slot). */
  unrequestable: string | null;
}
```

`bindingFor` resolves `"all"` to the channel's `sample_count` before building
the request, exactly as C2 §5.3 requires ("the host resolves it to the
channel's `ChannelSummary.sample_count` at fetch time"), and never writes a
resolved count back into the document. An FFT cell naming a channel the
session does not have keeps today's behaviour: `bindingFor` returns `null`
and `unresolvedChannelId` names it. Extend `unresolvedChannelId` to read the
FFT arm's single channel too.

`bindingIdentity` must cover the FFT arm: session-independent identity is
`hostVarName` plus the resolved sample count plus the `unrequestable` state.
Two consecutive renders producing the same identity must not start a second
fetch — this is the existing `boundIdentityRef` contract, not a new one.

### 6. The Properties panel (Step 6)

`components/PropertiesForm.tsx` plus its pure logic in
`model/propertiesForm.ts`. **Every control writes through the existing single
path**: build the next props, `generate`, hand the string to `onChange`. No
control holds state the document does not carry. The custom-code branch is
untouched — including its confirm on *Reset to form*.

Pure functions to add in `model/propertiesForm.ts` (all tested):

```ts
export function defaultFftPlotProps(
  channels: readonly { id: string; label: string; unit?: string }[]
): FftPlotProps;

/** Switches chart type, preserving the channel selection and otherwise
 *  seeding that type's defaults. No confirmation and no dialog — R79 Q6:
 *  a one-click undo by switching back, unlike custom code. */
export function setChartType(
  props: PlotProps,
  next: "time" | "fft",
  channels: readonly { id: string; label: string; unit?: string }[]
): PlotProps;

/** Patches the six FFT parameters. Setting `averaging: "none"` forces
 *  `windowSize`/`hopSize` to `"all"` in the same returned value — R76's
 *  single-segment rule made unreachable-by-construction rather than shown
 *  later as a server error (C2 §5.3 control 8). */
export function updateFftParams(props: FftPlotProps, patch: Partial<FftParams>): FftPlotProps;

/** The y-label seed per scaling (R79 Q5): `"Magnitude (<unit>)"` for
 *  `magnitude`, `"PSD (<unit>²/Hz)"` for `density`; `undefined` when the
 *  channel has no recorded unit. An ordinary editable suggestion on R65's
 *  existing path — string concatenation of a unit the engine supplied,
 *  never a conversion (C2 §1). */
export function suggestSpectrumAxisLabel(
  channel: { label: string; unit?: string } | undefined,
  scaling: FftParams["scaling"]
): string | undefined;

/** Segment overlap as a percentage, for display only (R79 Q3): the
 *  document and the grammar keep `hopSize` in samples, C3's own unit.
 *  `null` when either value is `"all"` or the numbers make it meaningless. */
export function overlapPercent(windowSize: number | "all", hopSize: number | "all"): number | null;
```

`addMark`/`removeMark`/`updateMark`/`moveMark` narrow to `TimePlotProps`;
`updateXAxis`/`updateYAxis`/`setColorLegend` stay generic over the union.
`defaultPlotProps` gains `chart: "time"`.

Seeding rules, matching R65's existing one-time-seed behaviour: seed
`y.label` when it is not already set — on the channel pick, and on a scaling
change. Never overwrite a label the author typed. `x.label` seeds
`"Frequency (Hz)"` and `x.type` seeds `"log"` in `defaultFftPlotProps`.

The rendered controls, in C2 §5.3's order (its twelve-item list is the
checklist; read it, do not work from this summary alone):

1. **Chart type** — a segmented control (two `<button>`s or a radio group),
   `Time` / `FFT`, the pane's **first** control, for both chart types.
2. Channel `<select>`, single-select for FFT.
3. Mark `<select>`: `lineY` / `dot` / `areaY`.
4. Window function: `Rect` / `Hann` / `Hamming`.
5. Window size (samples): `<select>` of `1024 / 2048 / 4096 / 8192 / 16384`
   plus `Whole record` (emitting `"all"`), **plus a free numeric entry** so a
   stored non-standard value survives being looked at. Opening the pane must
   never silently change a stored value — test that.
6. Hop size (samples), numeric, with the derived overlap percentage shown
   beside it as read-only text.
7. Detrend: `None` / `Mean` / `Linear`.
8. Averaging: `None` / `Mean` / `Median` / `Max`. `None` forces window and
   hop to `Whole record`, **disables both controls**, and shows the reason in
   words ("a single-segment FFT covers the whole record").
9. Scaling: `Magnitude` / `Density`.
10. Frequency axis (x): `Lin` / `Log`, plus label and domain.
11. Magnitude axis (y): existing label/domain/type controls, unchanged.
12. Legend: the existing checkbox, unchanged.

### 7. Binding and rendering (Step 7)

In `Notebook/index.tsx`, beside the existing channel-bind effect:

- A **new effect** that, for each `js` cell whose binding is the `fft` arm
  and whose `bindingIdentity` changed, starts one `runFft` through the
  **shared** `cellRunSequencerRef` (`CellRunSequencer.start`/`isCurrent`) —
  never a second counter. Its dependency array is **data only**
  (`state.cells`, `state.markdown`, `sessionDetail`, `sessionSpanUs`,
  `sessionId`); its cleanup cancels nothing. This is wave-2 operating brief
  §4's rule and a reviewer grades a violation Critical on sight.
- `runFft`'s `spectrum` action pushes the decoded spectrum into the sandbox
  via `setSpectrumHostVar` under `binding.hostVarName`, with `f` built by
  `frequencyAxisHz` and the magnitudes widened to `Float64Array`. Its
  `fftError` action goes to the cell's note/error state, typed — never a
  bare string.
- A cell whose `unrequestable` is non-null **does not fetch at all** and
  shows that string in the note slot.
- **The cell mounts `JsCellFrame`, not `ChartCell`** — the R78 Task 18 Q2
  precedent (a cell with nothing time-bound gets the plain frame). An FFT
  cell has no time viewport, so it gets **no pan, no zoom, no hover readout,
  no cursor readout, and no `sendTransform`**; it keeps `sendLayout` like
  every other plain-mount cell. Do not wire a gesture handler to a spectrum.
- Keep the last decoded spectrum per cell in a ref map so a sandbox rebuild
  can re-push it (Open Question 5's recommendation) — the buffers are
  detached on transfer, so build fresh `Float64Array`s from the retained
  `DecodedFft` on each push rather than retaining the transferred buffers.

In `sandbox/main.ts`, bind `spectrum` beside `channel` in `SandboxRuntime`'s
constructor, through `bindHostVar` (never `module.builtin`, for the reason
that method's doc comment gives):

```ts
this.bindHostVar("spectrum", (name: string, params: FftParams) =>
  this.spectrumLookup(name, params)
);
```

`spectrumLookup` computes `spectrumKey(name, params)` and returns the
`hostVars` entry when it is an array, `[]` otherwise — the exact shape and
failure mode `channelLookup` already has. It never fetches and never does
DSP. C2 §5.3: `params` is ignored at lookup time except for the key
derivation.

`host/rebuildReplay.ts` already classifies the `spectrum` payload with
channels (Task 19 Step 3). Confirm that and say so; do not reclassify it.

---

## Steps

- [ ] **Step 1.** `plotForm/types.ts` — the discriminated union, `FftParams`,
      `FftXAxisProps`, the runtime enum arrays. Update every existing
      `PlotProps` literal in the lane to carry `chart: "time"`.
- [ ] **Step 2.** `plotForm/generate.ts` — the FFT branch; time branch
      byte-identical. `generate.test.ts` gains: Example 5's two code blocks
      reproduced **exactly**; one case per `spectrum_mark_name`; `"all"`
      emitted quoted and a sample count emitted bare; `stroke`/`strokeWidth`
      present and absent.
- [ ] **Step 3.** `plotForm/parse.ts` — the `spectrum_call` reader and every
      fail-closed rule in Interface 3. `parse.test.ts` gains one case per
      rule, each asserting `null`, plus the positive parses.
- [ ] **Step 4.** `plotForm/roundTrip.test.ts` — extend, do not weaken.
      Keep the 1440-case time enumeration and its literal count assertion
      (now with `chart: "time"`), and add an FFT enumeration covering
      **every value of every FFT parameter**: 3 window functions × 3 detrends
      × 2 scalings × 4 averagings = 72 parameter combinations, crossed with
      the two `windowSize`/`hopSize` forms (a sample count, and `"all"`),
      the 3 spectrum mark names, and both `x.type` values, with
      `stroke`/`strokeWidth` present and absent. Assert the case count
      literally, as the existing test does. Both invariants:
      `parse(generate(p))` deep-equals `p`, and `generate(parse(code))` is
      byte-identical for code the form produced.
      Note: `averaging: "none"` cases must pair with `"all"` window/hop —
      that pairing is `updateFftParams`' job, and the enumeration should
      exercise the pairing the form can actually produce.
- [ ] **Step 5.** `model/fftRequest.ts` — `spectrumKey`, `MAX_FFT_BINS`,
      `exceedsBinCap`, with tests (different params ⇒ different keys; same
      params in a different object-literal order ⇒ same key; the cap
      boundary exactly at, one under, one over).
- [ ] **Step 6.** `model/jsCellBinding.ts` — the union and the `fft` arm,
      with tests: an FFT cell binds; `"all"` resolves to `sample_count`; a
      channel with fewer than two samples comes back `unrequestable` with a
      note and never a request; over the cap likewise; an unknown channel
      still returns `null` and `unresolvedChannelId` names it; a custom-code
      cell calling `spectrum(...)` outside the grammar binds nothing.
- [ ] **Step 7.** `model/propertiesForm.ts` + `components/PropertiesForm.tsx`
      + `components/PropertiesForm.types.ts` if a prop must be added — the
      panel per Interface 6. Pure logic tested; rendering is not
      (CLAUDE.md §4).
- [ ] **Step 8.** `Notebook/index.tsx` + `sandbox/main.ts` per Interface 7.
- [ ] **Step 9. Parity gaps.** Read idl0's `analyze/fft_chart.dart`,
      `fft_window_resolver.dart` and `chart_type_catalog.dart`, and list —
      in your report and in the §26.6 row — every FFT affordance idl0 had
      that this panel does not port, each with a reason. §26.6 already
      records three (the ten-spectrum overlay, lap-scoped spectra, the
      `Overlap %` control); find the rest. Silence is not deferral
      (wave-2 operating brief §2).
- [ ] **Step 10. SPEC (spec-during).** `docs/IDL0_SPEC.md`:
      - **§26.6**'s FFT row: flip `Contracted (C2 §5.3, R79); shipping in
        L6 Tasks 19–20` to **Delivered**, and fold Step 9's parity gaps into
        the row's reason column. Flip it **only in this commit** and **only
        if this commit actually ships the chart** — if you stop short, the
        row says what is true.
      - **§26.7**'s N5 clause: N5 is no longer a gap this tab stands on.
      - Leave the **1-D histogram** row (N6) exactly as it is — R52 Q7
        deferred it to wave 3.
      - Do not edit §26.2's FFT paragraph; the lead wrote it to match this
        task. If your implementation contradicts it, that is a finding to
        report, not a paragraph to rewrite.
- [ ] **Step 11. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: nothing printed, `exit=1`.
- [ ] **Step 12. Gate.**
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Notebook
      npx vitest run
      ```
      The lane filter must report a **non-zero `passed`** count and 0 failed
      (a filter matching nothing is a failed gate), then the whole suite once.
      Report both real result lines, verbatim.
      Coverage: the pure modules you touch (`plotForm/**`,
      `model/propertiesForm.ts`, `model/jsCellBinding.ts`,
      `model/fftRequest.ts`) stay above 80 % — CLAUDE.md §4. Judge this by
      whether every branch you added has a test that reaches it; do not run a
      coverage tool as part of the gate.
- [ ] **Step 13. CHANGELOG** — one bullet at the top of `### Added`, edited
      to match what actually shipped:
      ```
      - **FFT chart in the `plotForm` grammar and the Properties panel (L6 Task 20, R78, R79).** C2 §5.3's FFT production is implemented: `PlotProps` is a discriminated union on `chart: "time" | "fft"`, an FFT cell carries exactly one `spectrum(channel, { windowSize, hopSize, window, detrend, scaling, averaging })` mark, and `generate`/`parse` round-trip every parameter value including the `"all"` whole-record token. `parse` fails closed to custom code on any deviation — a mixed time/spectrum `marks` array, a missing or extra `fft_params` key, a second spectrum mark, `x`/`y` not bound to `"f"`/`"m"`, or `x.type` on a time cell — so a hand-written `spectrum(...)` outside the grammar gets no host variable and renders an empty plot. The Properties pane gains a chart-type control and the FFT parameter panel: hop in samples (C3's own unit) with a derived overlap percentage shown beside it, `Averaging: None` forcing and disabling window/hop at `Whole record` (ruling R76 made unreachable-by-construction), and a y-label seeded per scaling. An FFT cell mounts `JsCellFrame` with no time gestures, fetches through the shared `CellRunSequencer`, and publishes its spectrum under `spectrumKey(channelId, fftParams)` — one shared pure function on the host and sandbox sides. A spectrum over `MAX_FFT_BINS` bins shows a note and does not fetch (R79 Q4: a cap is a host constant, not a parameter of the picture).
      ```
- [ ] **Step 14. Commit.** Explicit paths, never `git add -A`:
      ```bash
      git add app/src/routes/pages/Notebook CHANGELOG.md docs/IDL0_SPEC.md
      ```
      Single-line message, no AI attribution trailer:
      ```
      app/Notebook: FFT chart in the plotForm grammar and Properties panel (R79)
      ```

---

## Do not

- Do not edit either contract spec, `app/src/ipc/**`, or anything outside
  `app/src/routes/pages/Notebook/**` except the two named documents.
- Do not compute an FFT, a window function, a detrend, a magnitude, an
  average, or a decimation in TypeScript. The only arithmetic you own is
  `k * sampleRateHz / (2 * binCount)` (already written, Task 19), the
  overlap percentage shown as **display text only**, and the cap comparison.
- Do not write a resolved sample count into the document. `"all"` stays
  `"all"` on disk — a literal count would be wrong the moment the workbook
  opens against another session.
- Do not pass a non-null `lap` for a spectrum, and do not add a lap picker
  to the FFT panel.
- Do not recognise an FFT cell by scanning or regex. `parse` is the only
  recogniser.
- Do not give an FFT cell pan, zoom, hover, cursor readout, or a transform.
- Do not add a second run-sequence counter; use `CellRunSequencer`.
- Do not list a function in an effect's dependency array; do not cancel
  in-flight work from a cleanup.
- Do not weaken or delete an existing round-trip case.
- Do not add a confirmation dialog to the chart-type switch (R79 Q6).
- Do not run cargo, push, or amend.

## Style / hygiene

Doc comment on every exported symbol. **Units on every numeric value** —
samples, Hz, px, percent, bins. This task is unusually easy to get wrong
here: `windowSize` and `hopSize` are samples, `x.domain` is Hz, `bin_count`
is bins, the overlap is a percentage, and none of those are interchangeable.
`// TODO(idl0):` never a bare `// TODO`. Typed errors only, never
`Err(String)`'s TypeScript equivalent. Tests are Arrange / Act / Assert with
blank lines between; names read `thing — condition — result`.

---

## Open questions for the lead

Answer none of these yourself. Where one blocks nothing, implement the
recommendation, say you did, and flag it.

**QUESTION 1 — Is `x` (carrying a required `type`) mandatory in `FftPlotProps`?**
Context: C2 §5.3's Example 5 shows `props` with `x: { label: "Frequency (Hz)" }`
and **no** `type`, while the code block beside it emits
`x: { label: "Frequency (Hz)", type: "log" }`. The prose says the generator
"does emit `x.type`, always", and the parameter table gives `x.type` a
default of `"log"`.
The gap: if `x.type` is optional in props and the generator fills a default,
then `parse(generate(p))` is not deep-equal to `p` for any `p` omitting it,
which breaks the round-trip invariant `roundTrip.test.ts` exists to hold.
Sources checked: C2 §5.3 (EBNF, rules list, parameter table, Example 5),
SPEC §26.2, R79.
Options: (a) `x` is required in the FFT arm with a required `type`, and
Example 5's props block is an elision; (b) `x.type` is optional and
`generate` fills `"log"`, accepting that the deep-equal invariant is stated
only over props the form produces; (c) `x` optional, `x.type` required when
`x` is present.
My recommendation: **(a)**. It is the only reading under which both
round-trip invariants hold unchanged, and it matches the stated reason
("always, for the same reason the `fft_params` keys are required" — and
those are mandatory).
Cost if wrong: one field's optionality, its parse branch, and the seed in
`defaultFftPlotProps`. Blocking: no — (a) is implementable now and (b) is a
narrowing edit later.

**QUESTION 2 — What is `MAX_FFT_BINS`?**
Context: R79 Q4 ruled a host-side `bin_count` cap with a stated note, and no
number.
The gap: no source states one. SPEC §26.3's point budget is 2 points per
pixel column, which at a 640 px chart is 1280 points — far below any useful
spectrum, so the point budget is not the cap. Sources checked: SPEC §26.3,
§26.6, C2 §5.3's parameter table, R79, the amendment draft's Q4.
Options: (a) 16384 bins, roughly a 32 k-sample window, comfortably above
every entry in the window-size `<select>`; (b) tie it to the chart width in
px (a renderer-dependent cap, which reads like the renderer-only parameter
CLAUDE.md §3 forbids); (c) no cap, and let a huge request render slowly.
My recommendation: **(a) 16384**, named, commented as a judgment call with
no source behind it, checked conservatively **before** the fetch against the
resolved window size in samples and again **after** decode against
`magnitudes.length`. The pre-fetch check never assumes a bins-per-window
relation C3 §3.6 does not state.
Cost if wrong: one constant. Blocking: no.

**QUESTION 3 — What exactly does the note say, and does a server-rejected
`"none"` request reach it?**
Context: R78 Task 19 Q3 ruled the `JsCellFrame` note slot, without copy.
The gap: three distinct causes share one slot — fewer than two samples
(R76), over the bin cap, and an `invalid_argument` carrying
`detail: { segments: n }` if one ever escapes the form's forcing rule.
Sources checked: R76, R78 Q3, C3 §3.6, SPEC §26.
My recommendation: three plain sentences, no new visual language and no
banner: "This channel has too few samples for an FFT."; "This spectrum has
more bins than the chart can draw — reduce the window size." (the amendment
draft's own wording); and, for the third, the typed error's message with the
segment count, since the form forcing `"all"` should make it unreachable and
seeing it means a real bug rather than a user mistake.
Cost if wrong: three strings. Blocking: no.

**QUESTION 4 — May `sandbox/main.ts` import `model/fftRequest.ts`?**
Context: C2 §5.3 requires `spectrumKey` to be "computed identically on both
sides" by "one shared pure function", and puts it beside `fftRequestFor`.
The gap: the sandbox is a separate bundle; no source states which host
modules it may import. It already imports types from `host/protocol.ts`.
`fftRequest.ts` imports `SpectrogramParams`/`FftAveraging` from
`app/src/ipc/rasters.ts`, which itself imports `invoke` from
`@tauri-apps/api/core` as a **value**.
Options: (a) import `model/fftRequest.ts` from the sandbox, relying on those
being `import type` and therefore erased; (b) move `spectrumKey` and
`FftParams` into a dependency-free module both sides import; (c) duplicate
the key derivation in the sandbox — rejected on sight, it is exactly the
drift C2 named the shared function to prevent.
My recommendation: **(a) if and only if `fftRequest.ts`'s ipc import is
type-only** — verify it, and say so in the report. If it is not, **(b)**,
under `plotForm/` (already the shared vocabulary both sides speak), rather
than relaxing the constraint.
Cost if wrong: one file move. Blocking: no — verify and proceed.

**QUESTION 5 — Who re-publishes a spectrum after a sandbox rebuild?**
Context: `NotebookSession.onChannelsInvalidated` re-sends every bound channel
from the `TileCache` after a rebuild. A spectrum has no cache: `fetch_fft`
results are not stored anywhere, and the payload's buffers are detached on
transfer.
The gap: no source says whether a rebuilt sandbox re-fetches spectra,
re-pushes retained ones, or renders empty until the next binding change.
Sources checked: R78 Task 18 Q1 (definition channels re-fetch, tile-backed
channels are re-derived), SPEC §26.4, `host/NotebookSession.ts`,
`host/rebuildReplay.ts`.
Options: (a) retain each cell's decoded `DecodedFft` in a host-side ref map
and re-push it on invalidation, building fresh buffers each time — no IPC,
no refetch; (b) re-run `runFft` on invalidation — correct but a fresh IPC
call per cell per rebuild; (c) leave it empty until the next binding change
— a rebuild silently blanks every FFT cell.
My recommendation: **(a)**. It matches R78 Task 18's spirit (a rebuild
restores what the host already holds) at no IPC cost, and the retained
`Float32Array` is small. (c) is a silent-blank bug; (b) is the fallback if
retention proves awkward.
Cost if wrong: one ref map swapped for one driver call. Blocking: no.

**QUESTION 6 — Which channel survives a `Time → FFT` switch on a
multi-mark cell?**
Context: C2 §5.3's control 1 says switching "regenerates from that type's
defaults, preserving the channel selection". A time cell may have several
marks on several channels; an FFT cell has one.
The gap: which one is preserved is unstated. Sources checked: C2 §5.3's
control list, R79 Q6.
Options: (a) the **first** mark's channel — the same "first mark drives it"
convention `PropertiesForm`'s y-label seeding already documents; (b) prompt;
(c) clear the channel and make the user pick.
My recommendation: **(a)**, and symmetrically `FFT → Time` seeds one mark on
the spectrum's channel. It reuses a convention already stated in this file
rather than inventing a second one, and R79 Q6 ruled out prompting on this
switch.
Cost if wrong: one line in `setChartType`. Blocking: no.

---

## Report back (concise)

- Commit hash and `git show --stat`.
- Your GATE findings: each of the five Task 19 prerequisites, confirmed or
  not, by file.
- The exact gate commands and their **real** result lines — lane filter and
  whole suite, both non-zero `passed`, 0 failed.
- The FFT round-trip enumeration's case count, and the assertion that fixes
  it.
- The exact names of every test case you added, grouped by file.
- Which resolution you used for each open question, and anything you
  resolved that is not in this brief.
- Your parity-gap list from Step 9: every idl0 FFT affordance not ported,
  with its reason, and confirmation that §26.6's row now says all of them.
- One line each confirming: no FFT/window/magnitude/decimation arithmetic
  exists in TypeScript; `lap` is `null` at every spectrum call site; no
  effect dependency array gained a function; no effect cleanup cancels
  in-flight work; `MAX_FFT_BINS` is checked before the fetch **and** after
  decode; `spectrumKey` has exactly one definition in the tree (say how you
  checked); `sandbox/main.ts`'s import of it pulls no `@tauri-apps` value
  into the sandbox bundle.
- Whether §26.6's row was flipped to Delivered, and if not, what it says
  instead and why.
- Per-step done/deviated.
- Anything ambiguous you could not resolve — stop and report rather than
  guessing (CLAUDE.md §1).

## Questions template (use verbatim if you must stop)

```
QUESTION <n>
Context: <the file/line and what you were doing>
The gap: <what no source states — cite the sources you checked by path/section>
Options: (a) … (b) … (c) …
My recommendation: <one option, one sentence why>
Cost if wrong: <what has to be undone>
Blocking: yes/no — <what you can finish without the answer>
```

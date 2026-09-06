# C2 §5.3 amendment — the FFT chart production (DRAFT, for the lead)

**Status: DRAFT / PROVISIONAL.** Not applied to any spec. Written by the
adjudicator on the lead's dispatch, per **R78 (L6 Task 19) Q1(a)** — "widen
C2 §5.3 with an FFT chart production (chart type + window/hop/window fn/
detrend/scaling/averaging in the document — CLAUDE.md §3, no renderer-only
parameters)" — and **R78 Q2**, "its own cell". The grammar + Properties work
is **L6 Task 20**; L6 Task 19 does Steps 1–4 only.

Sections **1**, **2** and **3** are PROVISIONAL on Open Questions **Q1**
(the `"all"` window token), **Q2** (host-var key derivation) and **Q4**
(bin budget) in §7. Everything else stands under any answer.

Sources read: R78, R77, R76, R63(3), R52 Q7, R64; CLAUDE.md §2/§3; C2
§5.1 and §5.3 in full; C3 §3.6 (`fetch_fft`, `SpectrogramParams`, `IDLF`);
`app/src/routes/pages/Notebook/plotForm/{types,generate,parse}.ts`;
`components/PropertiesForm.tsx`; `model/jsCellBinding.ts`;
`host/protocol.ts`; `sandbox/main.ts`; SPEC §26.2/§26.3/§26.6/§26.7;
`runs/2026-09-06/followons/brief-l6-task19-fft-chart.md`; idl0's
`app/lib/ui/tabs/analyze/fft_chart.dart`, `fft_window_resolver.dart`,
`chart_workspace.dart` (`_buildFftSection`), `app/lib/data/spectral_params.dart`,
`app/lib/data/fft_options.dart`, `app/lib/data/worksheet.dart`.

---

## 1. The proposed §5.3 grammar

Replacing §5.3's single `mark` production and widening `x_field`. Only the
lines marked **new** or **changed** differ from the landed grammar; every
other production is quoted unchanged so the section reads as one grammar.

```ebnf
plot_call     ::= "Plot.plot(" plot_options ")"
plot_options  ::= "{" option ("," option)* "}"
option        ::= "x" ":" x_scale
                | "y" ":" y_scale
                | "color" ":" color_opt
                | "marks" ":" marks_array
x_scale       ::= "{" x_field ("," x_field)* "}"
x_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" ("\"linear\"" | "\"log\"")          (* changed *)
y_scale       ::= "{" y_field ("," y_field)* "}"
y_field       ::= "label" ":" js_string
                | "domain" ":" "[" js_number "," js_number "]"
                | "type" ":" ("\"linear\"" | "\"log\"" | "\"sqrt\"")
color_opt     ::= "{" "legend" ":" "true" "}"
marks_array   ::= time_marks | fft_marks                          (* changed *)
time_marks    ::= "[" time_mark ("," time_mark)* "]"              (* new *)
fft_marks     ::= "[" spectrum_mark "]"                           (* new, exactly one *)

time_mark     ::= "Plot." mark_name "(" channel_call "," mark_options ")"
mark_name     ::= "lineY" | "dot" | "areaY" | "rectY" | "ruleY"
channel_call  ::= "channel(" js_string ("," "{" "lap" ":" js_int "}")? ")"
mark_options  ::= "{" "x" ":" "\"t\"" "," "y" ":" "\"v\""
                       ("," "stroke" ":" css_color)?
                       ("," "strokeWidth" ":" js_number)? "}"

spectrum_mark ::= "Plot." spectrum_mark_name "(" spectrum_call "," spectrum_options ")"   (* new *)
spectrum_mark_name ::= "lineY" | "dot" | "areaY"                  (* new *)
spectrum_call ::= "spectrum(" js_string "," fft_params ")"        (* new *)
fft_params    ::= "{" "windowSize" ":" window_size ","            (* new; all six required, fixed order *)
                      "hopSize" ":" hop_size ","
                      "window" ":" window_fn ","
                      "detrend" ":" detrend ","
                      "scaling" ":" scaling ","
                      "averaging" ":" averaging "}"
window_size   ::= js_int | "\"all\""                              (* new — PROVISIONAL, Q1 *)
hop_size      ::= js_int | "\"all\""                              (* new — PROVISIONAL, Q1 *)
window_fn     ::= "\"rectangular\"" | "\"hann\"" | "\"hamming\""  (* new *)
detrend       ::= "\"none\"" | "\"mean\"" | "\"linear\""          (* new *)
scaling       ::= "\"magnitude\"" | "\"density\""                 (* new *)
averaging     ::= "\"none\"" | "\"mean\"" | "\"median\"" | "\"max\""   (* new *)
spectrum_options ::= "{" "x" ":" "\"f\"" "," "y" ":" "\"m\""      (* new *)
                       ("," "stroke" ":" css_color)?
                       ("," "strokeWidth" ":" js_number)? "}"
css_color     ::= js_string
```

**Rules that carry the same weight as the EBNF**, in §5.3's own voice:

- **A cell is a time cell or an FFT cell, never both** (R78 Q2). `marks_array`
  is `time_marks` or `fft_marks`; a `marks` array containing both a
  `channel_call` mark and a `spectrum_call` mark parses to `null` (custom).
  This makes "its own cell" structural rather than an author convention: two
  x axes (seconds and Hz) cannot share one `Plot.plot`.
- **An FFT cell has exactly one mark** in v1. `fetch_fft` returns one
  spectrum and the landed `fftDriver.ts` keys its `spectrum` action by
  `cellId`, so one cell resolves one spectrum. idl0's overlay of up to ten
  spectra (`kMaxFftSpectra`, `fft_window_resolver.dart`) is a stated parity
  gap, not silently dropped — see §5 below.
- **All six `fft_params` keys are required**, in the order given. This is the
  clause that implements CLAUDE.md §3: with every key mandatory there is no
  parameter of the picture that lives in host state or in a default the
  document does not state. A missing key is custom code, not a default.
- **`x.type: "log"` is legal only in an FFT cell.** In a time cell `x.type`
  still admits only `"linear"` and the generator still never emits it (C2
  §8-2 holds unchanged). In an FFT cell the generator **does** emit
  `x.type`, always, for the same reason the `fft_params` keys are required.
- **Mark options bind `"f"`/`"m"`, never `"t"`/`"v"`.** The spectrum host
  variable is a frequency shape; reusing `t` for Hz is the error the Task 19
  brief forbids at the protocol layer, and the grammar refuses it too.
- `lap` is not expressible on `spectrum_call`. C3 §3.6 requires `lap: null`
  until lap indexing at import lands; a grammar slot for it would be a
  promise the engine cannot keep.

### Parameter table — type, default, C3 field

| Grammar slot | Props field | Type | Default | Maps to |
|---|---|---|---|---|
| chart type (which `marks_array` alternative) | `PlotProps.chart: "time" \| "fft"` | closed enum | `"time"` | nothing on the wire; selects `fetch_fft` vs the tile path |
| `spectrum_call`'s `js_string` | `SpectrumMarkProps.channel` | string | first channel in the session picker | `fetch_fft`'s `channel` |
| `spectrum_mark_name` | `SpectrumMarkProps.mark` | `"lineY" \| "dot" \| "areaY"` | `"lineY"` | none (Plot mark) |
| `windowSize` | `fft.windowSize` | positive integer, samples, or `"all"` | `2048` samples | `params.window_size` |
| `hopSize` | `fft.hopSize` | positive integer, samples, or `"all"` | `1024` samples (idl0's 50 % overlap of 2048) | `params.hop_size` |
| `window` | `fft.window` | `"rectangular" \| "hann" \| "hamming"` | `"hann"` | `params.window` |
| `detrend` | `fft.detrend` | `"none" \| "mean" \| "linear"` | `"mean"` | `params.detrend` |
| `scaling` | `fft.scaling` | `"magnitude" \| "density"` | `"magnitude"` | `params.scaling` |
| `averaging` | `fft.averaging` | `"none" \| "mean" \| "median" \| "max"` | `"mean"` | `fetch_fft`'s `averaging` |
| `stroke` | `SpectrumMarkProps.stroke` | CSS colour literal | omitted | none |
| `strokeWidth` | `SpectrumMarkProps.strokeWidth` | number, CSS px | omitted | none |
| `x.type` | `XAxisProps.type` | `"linear" \| "log"` | `"log"` (idl0 `FftXScale.log`) | none |
| `x.label` | `XAxisProps.label` | string | `"Frequency (Hz)"` | none |
| `y.type` | `YAxisProps.type` | `"linear" \| "log" \| "sqrt"` | `"linear"` | none |
| `y.label` | `YAxisProps.label` | string | `"Magnitude (<unit>)"` / `"PSD (<unit>²/Hz)"` — see Q5 | none |
| — no bin/point budget token — | — | — | — | see Q4 |

Every default above is idl0's own (`SpectralParams.fftDefaults()`,
`ChartSlot.fftAveraging = Averaging.mean`, `FftXScale.log`), except
`hopSize`, which is idl0's 50 % overlap expressed in C3's units, and the
axis labels, which idl0 hard-codes in `fft_chart.dart` (`'Frequency (Hz)'`,
`'Magnitude'`, `'PSD (units²/Hz)'`).

`"all"` means "the whole record": the host resolves it to the channel's
`ChannelSummary.sample_count` at fetch time, which is exactly R76's
single-segment sizing (`window_size = hop_size = sample_count`). A literal
sample count in the document would be wrong the moment the workbook is
opened against another session — "the workbook is a file", and the file must
not carry one session's row count. **PROVISIONAL on Q1.**

### `PlotProps` shape (illustrative — L6 Task 20 owns the code)

```ts
export type PlotProps = TimePlotProps | FftPlotProps;
export interface TimePlotProps { chart: "time"; marks: MarkProps[]; x?: XAxisProps; y?: YAxisProps; color?: { legend: true } }
export interface FftPlotProps  { chart: "fft";  mark: SpectrumMarkProps; x?: XAxisProps; y?: YAxisProps; color?: { legend: true } }
export interface SpectrumMarkProps {
  channel: string;
  mark: "lineY" | "dot" | "areaY";
  fft: FftParams;          // all six fields required
  stroke?: string;
  strokeWidth?: number;    // px
}
```

A discriminated union rather than an optional field: `FftPlotProps` has one
`mark`, not a `marks` array, so "exactly one spectrum mark" is a type error
rather than a runtime check. Existing props gain `chart: "time"`; `parse`
supplies it, so no landed cell's code changes and every §5.3 worked example
round-trips byte-identically as before.

---

## 2. The exact JavaScript the generator emits

One FFT cell, defaults, channel `fork_velocity` (unit `m/s`):

```js
Plot.plot({
  x: { label: "Frequency (Hz)", type: "log" },
  y: { label: "Magnitude (m/s)" },
  marks: [
    Plot.lineY(spectrum("fork_velocity", { windowSize: 2048, hopSize: 1024, window: "hann", detrend: "mean", scaling: "magnitude", averaging: "mean" }), { x: "f", y: "m" })
  ]
})
```

Whole-record single-segment form (R76), log-magnitude axis, explicit colour:

```js
Plot.plot({
  x: { label: "Frequency (Hz)", type: "log" },
  y: { label: "Magnitude (m/s)", type: "log" },
  marks: [
    Plot.lineY(spectrum("fork_velocity", { windowSize: "all", hopSize: "all", window: "hann", detrend: "mean", scaling: "magnitude", averaging: "none" }), { x: "f", y: "m", stroke: "#2196F3" })
  ]
})
```

Formatting follows the landed generator's stated policy verbatim (two-space
indent, `Plot.plot({` at column 0, each option at column 2, the mark at
column 4, no trailing newline). The `fft_params` object stays on one line,
like `mark_options` does today; nothing about the round-trip depends on that
beyond byte-identity, which the fixed key order already fixes.

### The one recognisable host form

`spectrum(name, params)` — one call, one shape, mirroring `channel(...)`:

- **In the sandbox** it is an ambient host variable bound in
  `SandboxRuntime`'s constructor beside `channel`, and it resolves the same
  way `channelLookup` does — a lookup in `hostVars` over a value the host has
  already pushed, never a fetch, never DSP. It returns `{ f, m }[]` records
  (`f` Hz, `m` magnitude), the shape `materializeHostVar`'s new `spectrum`
  arm produces, or `[]` before the host has pushed anything.
- **The lookup key** is derived from the request, not from the bare channel
  name: two cells on the same channel with different windows are different
  spectra. Recommended key: the channel id plus the six `fft_params` values
  joined in the grammar's fixed order, computed by one pure exported function
  used on both sides (`spectrumKey`, beside `fftRequestFor`). **PROVISIONAL
  on Q2.**
- **The host recognises an FFT cell through `parse`, not a scan.**
  `jsCellBinding.bindingFor` already parses each `js` cell; it gains an
  `fft` binding arm returning the `FftRequest` that `fftRequestFor` builds.
  There is no regex and no second recogniser. A consequence worth stating in
  the spec: **custom code cannot fetch a spectrum**, exactly as custom code
  cannot bind a tile-backed channel today.
- `spectrum(...)`'s `params` argument is ignored at lookup time by
  everything except the key derivation — the host resolved those parameters
  before the fetch. It is in the call because the document, not the host,
  must state them (CLAUDE.md §3), and because a hand edit to a parameter has
  to change the code the parser reads.

---

## 3. Properties form — the FFT panel's controls

The pane keeps its current structure (`PropertiesForm.tsx`): a chart-type
control at the top, then type-specific sections. Nothing about the
custom-code branch changes.

1. **Chart type** — segmented control, `Time` / `FFT`. Switching regenerates
   from that type's defaults, preserving the channel selection (idl0's
   `_switchType` does exactly this). Switching away from FFT discards the FFT
   parameters; the same visible confirm the *Reset to form* path already uses
   is the honest precedent if the lead wants one (Q6).
2. **Channel** — the existing channel `<select>` over `SessionDetail.channels`,
   single-select for an FFT cell.
3. **Mark** — `lineY` / `dot` / `areaY`.
4. **Window function** — `Rect` / `Hann` / `Hamming` (idl0's three).
5. **Window size (samples)** — a `<select>` of `1024 / 2048 / 4096 / 8192 /
   16384` plus `Whole record`, with a free numeric entry for a value already
   in the document that is not in the list (idl0 keeps a stored non-standard
   value selectable so opening the dialog never silently changes it — port
   that behaviour). `Whole record` emits `"all"`.
6. **Hop size (samples)** — numeric entry, samples, C3's own unit. idl0's
   `Overlap %` control is **not** carried: the percent↔samples conversion is
   arithmetic over a document value and C3 states hop in samples (Q3).
7. **Detrend** — `None` / `Mean` / `Linear`.
8. **Averaging** — `None` / `Mean` / `Median` / `Max`. Selecting `None`
   forces window and hop to `Whole record` and disables both, with the reason
   shown in words ("a single-segment FFT covers the whole record") — R76's
   rule made unreachable-by-construction rather than shown as a server error.
9. **Scaling** — `Magnitude` / `Density`.
10. **Frequency axis (x)** — `Lin` / `Log` (idl0's `FftXScale`), plus the
    existing `label` and `domain` fields.
11. **Magnitude axis (y)** — the existing `label`, `domain`, and
    `linear/log/sqrt` type controls, unchanged.
12. **Legend** — the existing `color.legend` checkbox, unchanged.

Every control writes through the existing single path: build the next props,
`generate`, hand the string to `onChange`. No control holds state the
document does not carry.

---

## 4. A cell that already exists with custom code

**The custom-code rule is unchanged, and this amendment adds no exception to
it.** §5.3's rule stands verbatim: a `js` cell is custom when `parse(code)`
returns `null`, greying is binary per cell, and there is no partial match.
What that means concretely for FFT:

- Any cell that parses today keeps parsing and keeps its byte-identical
  round-trip. `parse` returns `chart: "time"` for it; `generate` ignores the
  discriminant for time cells and emits exactly what it emits now. No landed
  document changes on disk, and no cell silently becomes an FFT cell.
- A hand-written cell that calls `spectrum(...)` outside the grammar — a
  missing `fft_params` key, an extra key, a computed value, a second mark, a
  spectrum mark mixed with a `channel(...)` mark, `x: "t"` on a spectrum
  mark, `x.type: "log"` on a time cell — is **custom**. It greys the pane and
  offers *Reset to form*, and, because the host binds through `parse`, it
  gets **no spectrum host variable**: `spectrum(...)` returns `[]` and the
  cell renders an empty plot. That is the same deal custom code already gets
  for `channel(...)`, and it should be said out loud in the spec rather than
  discovered.
- *Reset to form* regenerates from the last props a successful parse produced
  for that cell, which may be a time cell or an FFT cell; the confirm text is
  unchanged.

---

## 5. The SPEC §26 paragraph to add

**§26.2, appended after "The custom-code rule":**

> **Chart type in the form (FFT).** The Properties pane's first control is
> the chart type, `Time` or `FFT`, because the type is a property of the
> document and not of the pane: an FFT cell's window size, hop size, window
> function, detrend, scaling and averaging are parameters of the picture and
> so live in the cell's code, in the closed grammar C2 §5.3 defines
> (CLAUDE.md §3, "no renderer-only parameters"; ruling R78, L6 Task 19 Q1).
> An FFT cell is its own cell and carries exactly one spectrum mark — a
> spectrum's x axis is frequency and a time series' is seconds, and one
> `Plot.plot` has one x axis (R78 Q2). The host recognises an FFT cell by
> parsing it, never by scanning for a call, so a cell outside the grammar is
> custom code that renders an empty plot rather than a silently half-wired
> chart. The spectrum itself is computed by `fetch_fft` (C3 §3.6) and reaches
> the sandbox as a `{ kind: "spectrum", f, m }` host-variable payload; the
> only arithmetic this tab performs on it is bin `k`'s frequency,
> `k * sample_rate_hz / (2 * bin_count)`, which C3 §3.6 places frontend-side
> explicitly. With `averaging: "none"` the request covers the whole record in
> one segment (ruling R76), which the document writes as
> `windowSize: "all", hopSize: "all"` rather than a session-specific sample
> count.

**§26.6, replacing the FFT chart row:**

> | **FFT chart** | Delivered (wave 2, single spectrum) | `fetch_fft` (C3 §3.6, `IDLF`) computes the spectrum; C2 §5.3's `spectrum(...)` production carries window size, hop, window function, detrend, scaling and averaging in the document. idl0's overlay of up to ten spectra (`kMaxFftSpectra`: one line per channel × selected lap) is **not** carried — one spectrum per cell, and lap-scoped spectra wait on lap indexing at import (`lap` is `null`, C3 §3.6). idl0's `Overlap %` control is replaced by hop size in samples, C3's own unit. |

**§26.7**, the N5 clause: N5 is landed and consumed, not a standing need.

---

## 6. Cost if wrong

One additive grammar production and one Properties panel, both reversible
before any workbook on disk uses them — no landed cell's bytes change, since
every existing cell parses to `chart: "time"` and regenerates identically.
The expensive alternative is the one this amendment refuses: FFT parameters
held in host state, which would make the chart unreproducible from the file,
break "the workbook is a file", and have to be unwound out of saved
documents later. If `"all"` (Q1) is rejected, the cost is a numeric window
size in the document that is wrong for any other session — recoverable by a
later token, but wrong workbooks exist in the meantime.

---

## 7. Open questions for the lead

**Q1 — Is `"all"` an acceptable value for `windowSize`/`hopSize`?**
Nothing in C2, C3 or SPEC §26 says how a document expresses "the whole
record". A literal integer cannot: `sample_count` is a property of the
session, and the same workbook opens against other sessions. **Recommend
yes** — `"all"` in the document, resolved to `ChannelSummary.sample_count`
at fetch time, which is exactly R76's single-segment sizing and keeps the
file session-independent. It also makes `averaging: "none"` expressible at
all. **Cost if wrong:** one token removed from two productions and the
`Whole record` option removed from one `<select>`; `averaging: "none"` then
has no expressible form and should be dropped from the `averaging` enum in
the same edit, which is the part that hurts.

**Q2 — What is the spectrum host variable's key?**
The sandbox's `channel(name)` looks up `hostVars` by bare name. Two FFT
cells on the same channel with different windows are different spectra, so a
bare-name key collides. **Recommend** a `spectrumKey(channelId, fftParams)`
pure function — channel id plus the six parameter values in the grammar's
fixed order — exported once and called on both sides, so the host and the
sandbox cannot drift. **Cost if wrong:** one pure function and its test; the
alternative (key by cell id) needs the sandbox to know which cell is calling,
which the current `compileCell` scope does not provide.

**Q3 — Hop in samples, or idl0's overlap percent?**
idl0's dialog shows `Overlap %` (default 50); C3 takes `hop_size` in
samples. **Recommend samples in both the document and the form.** Converting
percent to samples is arithmetic over a document value in TypeScript, and
the field the contract names is samples; showing the contract's own unit is
also the honest thing when a user compares two workbooks. **Cost if wrong:**
one form control and a derived display; the grammar keeps `hopSize` in
samples either way, so a percent control is additive later.

**Q4 — Is there a bin budget, and where does it live?**
A whole-record `"all"` request on a 200 Hz channel over an hour is ~360 000
bins; SPEC §26.3's point budget is 2 points per pixel column, and CLAUDE.md
§3 forbids decimating in TypeScript. No source states a cap. **Recommend**
no budget token in the grammar (a budget is not a parameter of the picture
the way a window function is, and the tile path's budget is already
host-side), plus a stated host-side limit on `bin_count`: above it the cell
shows the §26 note "this spectrum has more bins than the chart can draw —
reduce the window size" and does not fetch. The honest alternative, a
`fetch_fft` that decimates in core to a requested bin budget, is a C3
amendment and a Rust task, not this one. **Cost if wrong:** a note string
and one constant, or a C3 amendment if decimation must move into core.

**Q5 — What is the y-axis label under each scaling mode?**
idl0 hard-codes `Magnitude` and `PSD (units²/Hz)` and has no per-channel
unit in the label. C1 carries a free-form per-channel `unit` string, and
R65 fixed the time chart's suggestion at `"<label> (<unit>)"` with no TS
unit table. **Recommend** seeding `"Magnitude (<unit>)"` for `magnitude` and
`"PSD (<unit>²/Hz)"` for `density`, as an ordinary editable suggestion on
the same R65 path — string concatenation of a unit the engine supplied, not
a conversion, and C2 §1's "no v3 construct converts units" is untouched.
**Cost if wrong:** one string template; the label is an editable field.

**Q6 — Does switching chart type away from FFT confirm before discarding?**
Switching `FFT → Time` throws away six parameters the user set. idl0 kept
channels across `_switchType` and discarded the rest with no confirm. The
form already has a visible confirm for *Reset to form*, whose warning is
about the same kind of loss. **Recommend** no confirm on the type switch —
it is a one-click undo by switching back, and the defaults are restored,
unlike custom code, which is unrecoverable. **Cost if wrong:** one dialog.

**Q7 — Is the single-spectrum limit acceptable for wave 2?**
idl0 overlays up to ten spectra (channel × selected lap). The landed
`fftDriver`'s `spectrum` action is keyed by `cellId`, and lap scope is
unavailable until lap indexing lands, so an overlay in wave 2 would be
multi-channel only and would need a per-cell list of requests. **Recommend**
one spectrum per cell now, recorded as the §26.6 parity gap drafted above,
with the grammar's `fft_marks ::= "[" spectrum_mark "]"` widened to a list
in the wave that adds lap scope. **Cost if wrong:** the `fft_marks`
production takes a list and `FftPlotProps.mark` becomes `marks` — additive,
but it changes a props shape L6 Task 20 would already have shipped.

---

**Blast radius note.** This document decides nothing. It is a draft of a
structural change to a signed contract (C2 §5.3), so every question above is
left open for the lead and sections 1–3 are marked PROVISIONAL. No repo
source, spec, CHANGELOG or TASKS file was touched.

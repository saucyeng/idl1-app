# Review — L6 Task 20 (FFT chart in the `plotForm` grammar and Properties panel)

**Commits reviewed:** `039af2c` (merge: main into `wave2-l6-followon` before L6 Task 20,
R19 pattern) and `e7643cb` (`app/Notebook: FFT chart in the plotForm grammar and
Properties panel (R79)`), worktree `wave2-l6-followon`.

**Files touched (e7643cb):** `CHANGELOG.md`; `docs/IDL0_SPEC.md` (§26.6, §26.7);
`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md` (one line, Example 5's `x`
elision); `app/src/routes/pages/Notebook/{components/PropertiesForm.tsx, index.tsx,
model/{channelBindDriver.ts,channelBindDriver.test.ts,fftRequest.ts,fftRequest.test.ts,
jsCellBinding.ts,jsCellBinding.test.ts,propertiesForm.ts,propertiesForm.test.ts},
plotForm/{generate.ts,generate.test.ts,index.ts,parse.ts,parse.test.ts,
roundTrip.test.ts,spectrumKey.ts,spectrumKey.test.ts,types.ts}, sandbox/main.ts}`.
Scope matches the brief's stated ownership exactly — nothing outside
`Notebook/**` plus the two named documents.

**Test command run once:**
```
cd app && npx tsc --noEmit && npx vitest run src/routes/pages/Notebook/
```
Result: `tsc --noEmit` clean (no output, exit 0). Vitest: **Test Files 37 passed (37),
Tests 401 passed (401)**. Matches the implementer's reported figures. Per the review
dispatch, only the lane filter was run (not the whole-suite `npx vitest run`, not
`cargo`).

## Findings

| Severity | file:line | Finding | Fix |
|---|---|---|---|
| Minor | `PropertiesForm.tsx:530-548` | The Averaging=`"none"` forcing rule disables the window-size `<select>`/numeric input via the `disabled` attribute (control 8's "disables both controls"), but the hop-size control is disabled by being replaced with a plain `<span>Whole record</span>` rather than a `disabled` input. Functionally equivalent (the value cannot be edited either way) and the reason text is shown, but the two controls take different disabling mechanisms for the same rule, which a later maintainer could read as an inconsistency rather than a deliberate choice. | Either disable a hop-size `<input>` the same way as window-size, or add a one-line comment noting the two are intentionally implemented differently (span vs. disabled input) for the same semantic. |
| Minor | `docs/IDL0_SPEC.md` (§26.6, "Delivered in wave 2" list) | The parenthetical "(single whole-record spectrum)" describing the FFT chart is slightly ambiguous: it refers to the fact that `fetch_fft` always covers the whole channel (no sub-range/zoom, parity gap (3) in the same row), not that the FFT itself is forced to a single segment — that's only true under `averaging: "none"`. A reader skimming the summary line without the detailed row could mistake it for a scope narrower than what actually shipped (windowed/segmented averaging is fully implemented). | Reword to "(whole-channel spectrum, no time-range selection)" or similar, to avoid conflating "whole record" (no zoom) with "single segment" (`averaging: none`). |

No Critical or Major findings. Everything the dispatch asked me to check independently held up:

- **Grammar fidelity.** `types.ts`, `generate.ts`, `parse.ts` implement C2 §5.3 as
  amended, field for field, including the `"all"` token, all four `averaging`
  enum values, all three `window`/`detrend` values, both `scaling` values, and
  the closed `x.type`/`spectrum_mark_name` enums. `parse` fails closed on every
  rule enumerated in the brief's Interface 3 — verified directly in
  `parse.test.ts` (mixed marks array in both orders, two spectrum marks, missing
  and extra `fft_params` keys, computed `windowSize`, wrong `x`/`y` literals on a
  spectrum mark, `x.type: "log"` on a time cell, absent `x` on an FFT cell,
  present-but-typeless `x` on an FFT cell, a third `{lap}` argument on
  `spectrum_call`, `spectrum_mark_name` outside `lineY|dot|areaY`). The 1440-case
  time enumeration in `roundTrip.test.ts` is untouched and its literal count
  assertion stands; the new 3024-case FFT enumeration crosses every parameter
  value against both `windowSize`/`hopSize` forms (pairing `"none"` only with
  `"all"`, matching what `updateFftParams` can actually produce), 3 mark names,
  2 `x.type` values, and stroke/strokeWidth presence — both counts asserted
  literally and both pass. `generate`'s FFT branch reproduces C2 §5.3's Example
  5 byte-for-byte (compared both code blocks against `generate.test.ts` lines
  244 and 275 directly against the spec text — identical). `grep`ped
  `Notebook/host/*.ts` for FFT parameter names (`windowSize`, `hopSize`,
  `fft.`) — none found; no picture parameter lives outside the document.
- **`"all"` resolution and averaging="none" forcing.** `jsCellBinding.ts`'s
  `bindingForFft` resolves `"all"` to `channel.sample_count` at bind time and
  never writes it back (`request` is built from the resolved value, but
  `props.mark.fft` — what generates back to the document — is untouched).
  `updateFftParams` forces `windowSize`/`hopSize` to `"all"` whenever the
  resulting `averaging` is `"none"`, including when a hop-size edit arrives
  while `"none"` is already selected — tested directly
  (`propertiesForm.test.ts`'s four `updateFftParams` cases). `exceedsBinCap`
  agrees with core's stated bins-vs-window-size relationship: it treats the
  resolved window size as a conservative upper bound, never asserting an exact
  bins-per-window formula C3 §3.6 doesn't state.
- **`spectrumKey` placement and sandbox import.** `plotForm/spectrumKey.ts` is
  a dependency-free module (`import type { FftParams } from "./types"` only,
  and `types.ts` has zero imports) — resolves R80 Q4 exactly as ruled, and
  correctly does *not* land in `model/fftRequest.ts` (which does carry a
  type-only import from `ipc/rasters.ts`, verified with a targeted grep).
  `sandbox/main.ts` imports `spectrumKey` and `FftParams` only from
  `../plotForm/*`; grepped its full import list — nothing from `ipc/`.
- **Bin cap.** `MAX_FFT_BINS = 16384`, checked before fetch in
  `bindingForFft` against the resolved `window_size` and again after decode
  in `index.tsx`'s FFT effect against `action.fft.magnitudes.length`. Boundary
  tested at exactly-at/one-under/one-over in `fftRequest.test.ts`. The three
  note strings match R80 Q3's recommendation verbatim ("too few samples",
  "more bins than the chart can draw — reduce the window size", and the
  server's typed error message passed through unmodified for a genuine
  `invalid_argument`); no banner anywhere in the diff.
- **Binding and rendering.** The FFT arm of `JsCellBinding` mounts
  `JsCellFrame` only (`index.tsx` grep confirms no `ChartCell`/gesture wiring
  for `binding.kind === "fft"`); fetch goes through `runFft` via the shared
  `cellRunSequencerRef` (`start`/`isCurrent`), not a second counter. An
  `unrequestable` binding never reaches `runFft` at all. The new FFT bind
  effect's dependency array is `[state.cells, state.markdown, state.outputs,
  sessionDetail, sessionSpanUs, sessionId]` — data only, no function, no
  cleanup that cancels anything (there is no cleanup function at all). A
  rebuild re-pushes each cell's retained `DecodedFft` by rebuilding fresh
  `Float64Array`s (never the detached transferred buffers), per R80 Q5 — read
  the `onChannelsInvalidated` closure directly. `setChartType`'s
  Time→FFT/FFT→Time preserve the first mark's/spectrum's channel, tested
  (`propertiesForm.test.ts:313,321`).
- **`channelBindDriver.ts` change.** Narrows `runChannelBind`'s `binding`
  parameter type from `JsCellBinding` to `TimeCellBinding` — a pure type
  tightening (an FFT binding never reached this driver even before the
  union existed structurally; this makes it a compile-time guarantee). No
  behavior change; existing `channelBindDriver.test.ts` cases pass unmodified
  apart from import/type updates. Correctly in scope — this is the file the
  brief flagged as needing a fix for the discriminated union to typecheck.
- **Properties panel.** All twelve controls from C2 §5.3's list are present
  and in the stated order, verified against `PropertiesForm.tsx` directly:
  chart-type segmented control first for both chart types, channel, mark,
  window function, window size (select + free numeric entry, doesn't clamp a
  stored non-standard value), hop size (samples, with derived overlap % shown
  read-only beside it, never written back), detrend, averaging (with the
  reason sentence when `"none"`), scaling, frequency axis (Lin/Log + label +
  domain), magnitude axis (unchanged), legend (unchanged). No confirmation
  dialog on the chart-type switch. y-label reseeds per scaling on both
  channel pick and scaling change, never overwriting an author-set label.
- **C2 one-line edit.** The only C2 diff is Example 5's `x` block gaining
  `type: "log"` — exactly the elision fix R80 Q1 named, nothing else touched.
- **SPEC.** §26.6's FFT row flips to "Delivered" and lists four parity gaps
  (overlay/lap-scoped spectra, `Overlap %` replaced by hop-in-samples, no
  time-window/zoom tracking, no auto-derived segment length) — more complete
  than the three the brief pre-seeded, satisfying Step 9's "silence is not
  deferral." §26.7's N5 clause is rewritten as delivered. §26.2's FFT
  paragraph and the N6 histogram row are untouched, as ordered.
- **Tests.** All new test names read `thing — condition — result` with
  Arrange/Act/Assert structure (spot-checked several files directly).
  Coverage of `plotForm/**`, `propertiesForm.ts`, `jsCellBinding.ts`,
  `fftRequest.ts` is comfortably above 80% by branch-reachability inspection
  — every fail-closed rule, every enum value, and every binding/identity
  branch has a directly corresponding test.

**Verdict rationale:** the implementation matches C2 §5.3 as amended and rulings
R76/R78/R79/R80 precisely, with no silent deviations, no scope creep beyond the
one flagged and justified `channelBindDriver.ts` type-narrowing, and no
CLAUDE.md violations (units on every numeric doc comment, typed errors
throughout, no DSP/decimation in TypeScript, no renderer-only state). The two
Minor findings are cosmetic/documentation nits that would not change a
maintainer's decision to land this commit.

VERDICT: CLEAN

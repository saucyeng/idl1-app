# L6 Task 19 — implementer brief (the FFT chart)

You are the implementer for L6 Task 19, a wave-2 follow-on ruled in **R77
item 3** ("FFT chart (R52 Q7) → **L6 Task 19** over `fetch_fft`/`IDLF`"),
`runs/2026-09-03/decisions.md`. Read, in this order: **R77**, **R52 Q7**
(FFT is in for wave 2, the 1-D histogram is not), **R63 item 3** (the
`Averaging` union widened to four tokens), **R76** (`"none"` means exactly one
segment; rate derivation lives in core).

The job: the FFT chart idl0 had, which SPEC §26.6 lists as "Deferred, blocked
on IPC". The IPC is no longer missing — `fetch_fft` landed with the L8w write
lane and `app/src/ipc/rasters.ts` already wraps and decodes it. ONE commit,
then report.

**This task has one unresolved design decision (Open Question 1) that the
lead must answer before Step 5.** Steps 1–4 are independent of the answer and
you should do them in full regardless. If the answer has not arrived when you
reach Step 5, finish everything else, commit that, and report — do not guess
the surface.

**Spec discipline: spec-during.** `docs/IDL0_SPEC.md` §26.6's "FFT chart"
parity-gap row and §26.7's N5 line change in this commit.

---

## GATE — verify before writing a line

```bash
cd "C:/Users/isaac/Documents/Saucy/saucyeng/idl1-app"
git status --short
git log --oneline -3
```

Required: branch `main`, tree clean apart from untracked `runs/` (any modified
tracked file ⇒ **STOP and report**).

Then confirm, by reading `app/src/ipc/rasters.ts`:

- `export type FftAveraging = "none" | "mean" | "median" | "max"` exists.
- `export interface DecodedFft { sampleRateHz: number; magnitudes: Float32Array }`
  exists.
- `export function decodeFft(buf: ArrayBuffer): DecodedFft` exists (16-byte
  `IDLF` header, `DataView` copy).
- `export async function fetchFft(sessionId, channel, lap, params, averaging)`
  exists and passes `{ sessionId, channel, lap, params, averaging }`.
- `app/src/ipc/rasters.test.ts` has an `IDLF` decode case and a `fetchFft`
  case.

**If all five hold — and they did when this brief was written — you write no
decoder and no IPC wrapper, and you do NOT create `app/src/ipc/fft.ts`.** The
decoder lives in `rasters.ts` beside the raster decoders, which is where C3
puts `fetch_fft` (§3.6). If any is missing, **STOP and report** rather than
writing your own.

---

## Where

- Repo `C:\Users\isaac\Documents\Saucy\saucyeng\idl1-app`, branch `main`,
  single primary checkout.
- Work only under `app/src/routes/pages/Notebook/**`, plus `docs/IDL0_SPEC.md`
  §26.6/§26.7 and `CHANGELOG.md` (repo root).
- **Never run any cargo command.** TypeScript only. No new npm dependency.
- Do not push. Do not amend a reported commit.
- **Ownership STOPs**: `app/src/App.tsx`, `app/src/state/**`,
  `app/src/routes/types.ts`, `app/vite.config.ts`, `app/package.json`,
  `app/src-tauri/**`, `rust/**`, and either contract spec — **STOP and
  report**. In particular, widening C2 §5.3's `plotForm` grammar is a
  **contract change through the lead**, never something this task performs
  (wave-2 operating brief §3).

---

## What is true today — read all of these first

1. **C3 §3.6's `fetch_fft` entry** in
   `docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`. Read the whole
   entry. Load-bearing facts:
   - `params` is `SpectrogramParams` **verbatim** —
     `{ window_size, hop_size, window, detrend, scaling }`.
   - `averaging` is one of the four tokens; `"none"` requires the request's
     segmentation to produce **exactly one segment**, and more is
     `invalid_argument` with `detail: { segments: n }` (R76).
   - `lap` must be `null` in practice until lap indexing at import lands.
     **Keep it `null`.** Do not add a lap picker.
   - Bin `k`'s frequency is `k * sample_rate_hz / (2 * bin_count)`, "derived
     frontend-side from the two header fields" — C3 authorises this one piece
     of arithmetic explicitly, so it is layout, not DSP, and does not violate
     CLAUDE.md §2. Every other number stays in core (R76 moved the rate
     derivation there).
2. **`app/src/ipc/rasters.ts`** in full, and `rasters.test.ts`.
3. **`app/src/ipc/catalog.ts`**'s `ChannelSummary` — it carries
   `sample_count` (u64) and `nominal_rate_hz`. `sample_count` is how you size
   a single-segment request (below).
4. **`Notebook/model/rasterLayer.ts`** and
   **`Notebook/components/RasterUnderlay.tsx`** — the existing precedent for a
   settle-bound, pure-request-math + injected-fetch shape, including
   `rasterFetchKeyEquals` (the pure "did the fetch-relevant props actually
   change" decision that exists so a closure identity never triggers a
   refetch — review-task9's Critical).
5. **`Notebook/components/ChartCell.tsx`**'s optional `raster` prop. Note,
   and confirm for yourself with a grep, that **nothing supplies it**:
   `index.tsx` never passes `raster`, so the spectrogram/2-D-histogram path
   is built but unreachable. Report what you find. This matters because the
   FFT chart faces the same "how does a cell say it wants this?" question the
   raster path never answered.
6. **`Notebook/model/cellRunSequencer.ts`**, **`channelBindDriver.ts`**,
   **`openEvalDriver.ts`** — the driver shape every settle-bound fetch in this
   lane follows (injected async fn, `isStale()` after every `await`, no
   cancelling cleanup, dependency arrays on data only). Wave-2 operating brief
   §4's tightened rule; a reviewer grades a violation Critical on sight.
7. **`docs/IDL0_SPEC.md` §26.3** — the interaction rules this task must obey,
   and **§26.6**'s FFT row, which you are rewriting.

### Sizing a single-segment request (R76), stated so you do not have to derive it

`fetch_fft` takes no time window, only `lap` (which stays `null`), so a
wave-2 FFT is always over the **whole channel**. Therefore
`averaging: "none"` — one segment — is expressed as
`window_size = hop_size = channel.sample_count` (`ChannelSummary.sample_count`
from `get_session`'s `SessionDetail`). Any smaller `window_size` with
`"none"` is the `invalid_argument` R76 describes. For the three averaging
modes, `window_size`/`hop_size` are the user's segmentation choice and more
than one segment is expected. Put this rule in a pure, tested function; do not
scatter it.

---

## Interfaces

### 1. `Notebook/model/fftRequest.ts` (new, pure — Step 1)

No React, no DOM, no `ipc/*` import beyond types.

```ts
/** The whole FFT request one chart cell makes, as a pure function of the
 *  channel and the user's segmentation choice. */
export interface FftRequest {
  channelId: string;
  /** Always `null` in wave 2 — C3 §3.6: lap indexing at import has not landed. */
  lap: null;
  params: SpectrogramParams;
  averaging: FftAveraging;
}

/** Builds the request. `sampleCount` is `ChannelSummary.sample_count`.
 *  With `averaging === "none"`, `window_size` and `hop_size` are forced to
 *  `sampleCount` so the request produces exactly one segment (R76) —
 *  `segmentation`'s own window/hop are ignored in that mode and the function
 *  says so in its return. */
export function fftRequestFor(
  channelId: string,
  sampleCount: number,
  segmentation: { windowSize: number; hopSize: number; window: SpectrogramParams["window"];
                  detrend: SpectrogramParams["detrend"]; scaling: SpectrogramParams["scaling"] },
  averaging: FftAveraging,
): FftRequest;

/** Number of segments `window_size`/`hop_size` produce over `sampleCount` —
 *  the quantity R76's `invalid_argument` counts. Lets the caller show why a
 *  request would be rejected instead of issuing it and rendering the error. */
export function segmentCount(sampleCount: number, windowSize: number, hopSize: number): number;

/** Bin `k`'s frequency in Hz (C3 §3.6, derived frontend-side). */
export function binFrequencyHz(k: number, sampleRateHz: number, binCount: number): number;

/** The full frequency axis for a decoded spectrum, in Hz, one entry per bin. */
export function frequencyAxisHz(fft: DecodedFft): Float64Array;

/** Pure "did anything fetch-relevant change" — the `rasterFetchKeyEquals`
 *  pattern, so a closure identity can never trigger a refetch. */
export function fftRequestEquals(a: FftRequest | null, b: FftRequest | null): boolean;
```

Edge cases the tests must pin: `sampleCount` of 0 or 1 (a channel with fewer
than two samples is `invalid_argument` server-side per R76 — this function
must report it as unrequestable rather than build a request); `hopSize <= 0`;
`windowSize > sampleCount`; `"none"` forcing window/hop; `segmentCount`
arithmetic at exact multiples and at a partial trailing segment;
`binFrequencyHz(0, …) === 0`; `binCount === 0`.

### 2. `Notebook/model/fftDriver.ts` (new, pure-with-injected-IO — Step 2)

Mirror `channelBindDriver.ts`'s shape exactly:

```ts
export interface FftDeps {
  fetchFft: (sessionId: string, channelId: string, lap: null,
             params: SpectrogramParams, averaging: FftAveraging) => Promise<DecodedFft>;
}
export type FftAction =
  | { type: "spectrum"; cellId: string; fft: DecodedFft }
  | { type: "fftError"; cellId: string; error: IpcError };

export async function runFft(
  deps: FftDeps, sessionId: string, cellId: string, request: FftRequest,
  dispatch: (a: FftAction) => void, isStale: () => boolean,
): Promise<void>;
```

`isStale()` checked after the `await`; a rejection dispatches `fftError` with
the typed error (never a bare string, CLAUDE.md §5) and never throws out. Run
sequencing uses the existing `CellRunSequencer` — do **not** add a second
counter.

Tests (injected fake, never a real `invoke`): resolves ⇒ one `spectrum`
dispatch; rejects ⇒ one `fftError`; stale after the await ⇒ zero dispatches;
`invalid_argument` carrying `detail.segments` is passed through intact.

### 3. Rendering (Step 5 — blocked on Open Question 1)

R77 and the lead's dispatch say the spectrum renders **in the sandbox**, like
every other cell output (R69). Whatever surface Q1 selects, the data path is:
host fetches → host posts the spectrum into the sandbox as a host variable →
the cell's own Plot code draws it. The host never draws the spectrum and never
receives HTML back.

`protocol.ts`'s existing `HostVarPayload` channel arm is `{ kind: "channel";
length; t; v }` and `sandbox/main.ts`'s `materializeHostVar` turns it into
`{ t, v }[]` records — a **time** shape. A spectrum's axis is frequency, not
time. Do not silently reuse `t` for Hz. Add a sibling arm
`{ kind: "spectrum"; length: number; f: ArrayBuffer; m: ArrayBuffer }`
materialising to `{ f, m }[]` records (`f` Hz, `m` magnitude), with
`protocol.test.ts` round-trip coverage proving both buffers land in the
transfer list exactly once and that both are read back as `Float64Array` on
the sandbox side — the same byte-for-byte proof `channelPayload`'s existing
test gives, and for the same reason its doc comment records. Build `f` from
`frequencyAxisHz` and widen `magnitudes` (`Float32Array`) to `Float64Array`
before transferring.

---

## Steps

- [ ] **Step 1.** `model/fftRequest.ts` + `fftRequest.test.ts`, TDD.
      Arrange/Act/Assert with blank lines; names `thing — condition — result`.
- [ ] **Step 2.** `model/fftDriver.ts` + `fftDriver.test.ts`.
- [ ] **Step 3.** `host/protocol.ts`'s `spectrum` payload arm + its
      `protocol.test.ts` cases; `sandbox/main.ts`'s `materializeHostVar`
      branch; `SandboxHost`'s `setSpectrumHostVar` beside
      `setChannelHostVar`. Also add the spectrum arm wherever
      `rebuildReplay.ts` reasons about which host vars can be replayed — a
      spectrum's buffers are detached on transfer exactly like a channel's, so
      it belongs with channels (re-derived/re-fetched by the caller), **not**
      with the cached JSON host vars. State which you did in the report.
- [ ] **Step 4.** Read the answer to Open Question 1. **If it has not arrived,
      stop here:** run Steps 6–9 over what exists, commit, and report that
      Step 5 is outstanding and why. Steps 1–3 stand on their own and are not
      wasted under either answer.
- [ ] **Step 5.** The chart surface, per Q1's answer. Whichever it is:
      `lap` stays `null`; the fetch is settle-bound or mount-bound only, never
      reachable from a pointer/wheel/animation-frame handler (§26.3); the
      effect's dependency array is data only and its cleanup cancels nothing;
      staleness is the shared `CellRunSequencer`.
- [ ] **Step 6. SPEC (spec-during).** `docs/IDL0_SPEC.md`:
      - **§26.6**, the **FFT chart** row — it currently reads "Deferred,
        blocked on IPC / No 1-D FFT endpoint exists". Rewrite it to what this
        commit actually ships (including "not shipped, surface undecided" if
        you stopped at Step 4 — an honest row, not an aspirational one).
      - **§26.7**, the N5 clause of the one-line list.
      Leave the **1-D histogram** row (N6) exactly as it is — R52 Q7 deferred
      it to wave 3.
- [ ] **Step 7. NUL-byte check.** From the repo root:
      ```bash
      grep -rlP '\x00' app/src docs/IDL0_SPEC.md CHANGELOG.md; echo "exit=$?"
      ```
      Expected: nothing printed, `exit=1`.
- [ ] **Step 8. Gate.**
      ```bash
      cd app
      npx tsc --noEmit
      npx vitest run src/routes/pages/Notebook
      npx vitest run
      ```
      Lane filter: non-zero `passed`, 0 failed. Then the whole suite once.
      Report both real numbers.
- [ ] **Step 9. CHANGELOG** — one bullet at the top of `### Added`, written to
      match what actually shipped:
      ```
      - **FFT chart plumbing over `fetch_fft` (L6 Task 19, R52 Q7, R63 (3), R76).** New pure `Notebook/model/fftRequest.ts` builds a `fetch_fft` request from a channel's `sample_count` and a segmentation choice — with `averaging: "none"` it forces `window_size = hop_size = sample_count` so the request produces exactly one segment (R76), and it reports an unrequestable channel (fewer than two samples) instead of issuing a call that would be rejected. `binFrequencyHz`/`frequencyAxisHz` derive the frequency axis from the `IDLF` header's `sample_rate_hz` and `bin_count`, the one derivation C3 §3.6 places frontend-side. New `Notebook/model/fftDriver.ts` runs the settle-bound fetch through the existing `CellRunSequencer` with the lane's standard staleness contract. The spectrum crosses into the sandbox as a new `{ kind: "spectrum", f, m }` host-variable payload rather than being squeezed into the time-channel `{ t, v }` shape. `lap` is `null` throughout (C3 §3.6: lap indexing at import has not landed). No new IPC wrapper and no new decoder — `app/src/ipc/rasters.ts`'s `fetchFft`/`decodeFft` already carry `IDLF`.
      ```
- [ ] **Step 10. Commit.** Explicit paths (never `git add -A`):
      ```bash
      git add app/src/routes/pages/Notebook CHANGELOG.md docs/IDL0_SPEC.md
      ```
      Single-line message, no AI attribution trailer:
      ```
      app/Notebook: FFT request/driver over fetch_fft; spectrum host var (R52 Q7)
      ```

---

## Do not

- Do not create `app/src/ipc/fft.ts`. The wrapper and decoder exist in
  `rasters.ts`.
- Do not compute an FFT, a window function, a detrend, a magnitude, or an
  average in TypeScript. Only `k * sampleRateHz / (2 * binCount)` — the one
  derivation C3 §3.6 authorises.
- Do not pass a non-null `lap`, and do not add a lap picker for this chart.
- Do not widen C2 §5.3's `plotForm` grammar, and do not edit either contract
  spec. If the answer to Q1 requires it, that is a lead action and this task
  stops.
- Do not reuse the `{ kind: "channel", t, v }` payload for a frequency axis.
- Do not touch §26.6's 1-D-histogram row.
- Do not list a function in an effect's dependency array; do not cancel
  in-flight work from a cleanup.
- Do not run cargo, push, or amend.

## Style / hygiene

Doc comment on every exported symbol; **units on every numeric value** (Hz,
samples, segments — this task is unusually easy to get wrong here);
`// TODO(idl0):` never bare. Typed errors only.

---

## Open questions for the lead

1. **Where does the FFT chart live — a new cell kind, a Properties-form
   option, or neither?** *(Blocking for Step 5 only.)* Neither the design doc
   (`docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md` §6, D13) nor
   SPEC §26 states it; §26.6 files the FFT chart only as an IPC gap, and R52
   Q7 ruled the *capability* in without naming a surface. The decisive
   constraint is **CLAUDE.md §3's "No renderer-only parameters"**: the FFT's
   window size, hop, window function, detrend, scaling and averaging mode are
   parameters of the picture and so must live in the document, not in host
   state — which means they must appear in the cell's code, which means C2
   §5.3's closed `plotForm` grammar has to carry them.
   Options:
   (a) **Widen C2 §5.3** with an FFT source/chart-type production, and give
   the Properties form a chart-type control plus an FFT parameter panel that
   `generate`/`parse` round-trip. Costs a C2 amendment (lead applies it) and a
   `plotForm` grammar task before this one can finish.
   (b) **Ship it as custom `js` code only**: the user hand-writes a cell that
   references an `fft(...)`-shaped name the host recognises by a small scan
   (the way `jsCellBinding.ts` recognises `channel(...)` today), Properties
   greys to custom-code as it does for anything outside the grammar. No
   contract change; the parameters still live in the document, in the code.
   (c) **Host-side chart-kind state** (a toggle on the chart frame). Rejected
   on sight — it is exactly the renderer-only parameter CLAUDE.md §3 forbids,
   and it is why the existing `ChartCell.raster` prop has never been wired.
   **My recommendation: (a), and Task 19 stops at Step 4 until the C2
   amendment lands.** The FFT chart is a first-class chart in idl0, it belongs
   in the form, and (b) leaves the Properties pane permanently grey for the
   one chart type most likely to need parameter fiddling. If the lead wants
   something on screen this wave, (b) is the honest interim and is additive to
   (a) later. **Cost if wrong:** under (a), one C2 amendment plus a grammar
   task; under (b), a code scan that a later grammar widening supersedes.
   Steps 1–4 are correct under every option.

2. **Does the FFT chart share a cell with time-domain marks, or is it its own
   cell?** No source says. A cell whose Plot mixes a time series and a
   spectrum has two incompatible x axes. **Recommendation: its own cell** —
   one chart cell, one x axis — and the surface chosen in Q1 should make that
   structurally true rather than rely on the author. Non-blocking for Steps
   1–4. **Cost if wrong:** a constraint relaxed later, not a rewrite.

3. **What does the chart show when a request cannot be made?** A channel with
   fewer than two samples, or a `"none"` request the server rejects with
   `detail.segments`. No source names the copy or the surface.
   **Recommendation:** reuse `JsCellFrame`'s existing `note` slot with the
   reason in plain words (e.g. "This channel has too few samples for an FFT"),
   the same way the unresolved-channel note works today — no new banner, no
   invented visual language. Non-blocking. **Cost if wrong:** one string.

---

## Report back (concise)

Commit hash and `git show --stat`. The exact gate commands and their real
result lines (lane filter and whole suite, both non-zero `passed`, 0 failed).
Your GATE findings on `ipc/rasters.ts` — the five items, confirmed or not.
What your grep for a supplier of `ChartCell`'s `raster` prop found. Whether
you completed Step 5 or stopped at Step 4, and if you stopped, exactly what
remains. The exact test case names added. Which resolution you used for Q2 and
Q3. Confirmation in one line each that: no FFT/window/magnitude arithmetic
exists in TypeScript; `lap` is `null` at every call site; no effect dependency
array gained a function. Per-step done/deviated. Anything ambiguous you
resolved and how, or that needs a ruling — stop and report rather than
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

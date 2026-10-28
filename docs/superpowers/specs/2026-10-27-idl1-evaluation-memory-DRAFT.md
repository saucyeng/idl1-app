# DRAFT — Workbook evaluation memory model

Status: draft for the lead and Isaac. Written 2026-10-27 after the OOM abort on opening
`mx-compare-2026-09-19-vs-2026-10-24.idl1wb` on session `103bc2bfbb5dcf6d76302015a46cd2f5`.
Spec discipline (CLAUDE.md §6): this document is the **spec-first** section for the phases in §6.
The four sections that depend on an open question (§7) are marked **PROVISIONAL**.

Code references are to `idl1-app` `79da7e3` and the `rust` submodule at `c91576c`. "Measured" means
measured; "estimate" means computed from formats and sample counts, with the arithmetic given.

---

## 0. Summary

| | Today | Target (§4) |
|---|---|---|
| Full evaluations when this workbook opens | 7 (1 `eval_workbook_v2` + 6 `fetch_host_channel_v2`), up to 5 at once | 1, shared |
| Bytes one evaluation holds at its peak | 2.4 GB in the app (estimate), **2.53 GB measured** in the CLI | about 0.35 GB (estimate) |
| Session cache for the channels this workbook reads | about 0.63 GB (estimate) | about 0.13 GB (estimate) |
| Memory the app asked for while opening it | more than 12 GB (estimate); it aborted at 4.8 GB | about 1.5 GB with the app's 1.0 GB baseline |
| What happens when memory runs short | allocation-failure abort, no report | the evaluation waits for budget, or fails with a typed `resource_exhausted` error; an abnormal-exit marker is written |

The four costs, largest first:

1. **Each full-rate definition is stored four times while `resolve_workbook_defs` runs.** The
   `EvalOutput` keeps samples and `t_us`, and the cross-reference overlay keeps another copy of
   both. That is 32 B per sample. With 37 full-rate definitions and 62.2 M samples between them,
   one evaluation holds 1.99 GB at the end of resolution. `eval_cells` then copies every
   definition into a `HostChannel`, another 16 B per sample. `eval_workbook_v2` sends none of
   those samples: it ships only `{length, has_t}`.
2. **Every chart repeats the whole evaluation.** Each definition chart calls
   `fetch_host_channel_v2`, which re-parses the workbook and re-runs `eval_cells` over all 232
   definitions to return one. Nothing is shared between calls, and nothing is cancelled when a
   call is superseded.
3. **Each evaluation copies the session out of the cache.** It copies every stored channel it
   reads into its own handle: raw samples plus two i64 time axes, 18 B per sample, or 0.38 GB here.
   It then widens each channel to f64 and copies its `t_us` again, separately for every
   definition that names it.
4. **Nothing budgets evaluation.** The byte budget (`min(2 GiB, 25 % RAM)`) covers decodes in
   flight and cache residency, but not evaluation, which is the largest consumer. The crash hook
   catches panics only, so an allocation-failure abort leaves nothing behind.

---

## 1. Ledger of the current path

One full-rate value at IMU0 rate (N0 = 1,694,793 samples) takes 13.56 MB as f64 or as i64
`t_us`, and 3.39 MB as raw i16. Byte counts below are per sample (B/s) unless marked otherwise.

### 1.1 Decode: Parquet to session cache

| Stage | Allocation | Type, B/s | Lifetime | Copies | Owner | Where |
|---|---|---|---|---|---|---|
| Footer | Parsed `ARROW:schema`, 6.65 MB on this file | — | per open | re-read by `read_channel_index` on every decode, every estimate and every handle open | transient | `store/parquet.rs:917`, `:1240`, `:1501`, `:1766-1767` |
| Projection | `[channel, t?, <source>_t_recorded_us?]` | i16 + i64 + i64 **per file row** (5,017,348 rows, not per channel sample) | one decode | batches, then a second copy from `concat_batches` | transient | `parquet.rs:988-1019` (mask `:1003`, concat `:1017`) |
| Row-group pruning | **none**: every one of the 6 row groups is read whatever the window | — | — | — | — | `parquet.rs:1004-1016` (no row selection) |
| Gather to channel | `t_us`, `t_recorded_us`, raw column | i64 8 + i64 8 + i16 2 = **18 B/s** | while the entry is cached | **one `t_us` per channel**: the six channels of one IMU each hold an identical copy | `SessionCache` (`Arc<ChannelSamples>`) | `parquet.rs:756-781`, `:1312-1324`; `session/samples.rs:47-58` |
| Shared axes | union `t` plus one `<source>_t_recorded_us` per source, as `Int64Array` | 8 B **per file row**, about 40 MB each | while any channel of the source is cached | 1 each | `SessionCache.axes` | `session_cache.rs:30-39`, `:957-975`; `parquet.rs:1151-1174` |
| Reservation | `rows × (2·sample_bytes + 24)` × 5/4 | 140 MB × 1.25 = 176 MB per IMU channel | the decode | — | byte semaphore | `parquet.rs:1500-1516`, `session_cache.rs:395-425` |
| Prefetch | every stored channel the document names, on a pool of `physical cores − 1` threads | — | — | — | — | `commands/workbook.rs:503-525`, `session_cache.rs:541`, `:787-791` |

Transient peak of one decode, estimate. The first channel of a source projects about 10.6 MB
(i16 plus validity) + 40.1 MB (`t`) + 40.7 MB (recorded) = 91 MB, and `concat_batches` doubles that
to about 183 MB. Later channels of the same source borrow the axes and peak at about 21 MB.

### 1.2 Session cache residency for this workbook (estimate)

The workbook reads 12 IMU channels (IMU0 Accel and Gyro XYZ, IMU1 and IMU2 Accel XYZ) plus
`Time`, `GPS_SpeedKmh`, `GPS_Altitude`, `GPS_EpochMs` and `HR_BPM`.

| Item | Arithmetic | Bytes |
|---|---|---|
| 12 IMU channels | 12 × 18 B × ≈1.67 M | 367 MB |
| Union `t` | 5.02 M × 8 | 40 MB |
| Recorded axes for imu0, imu1, imu2, gps and hr_bpm | 5 × 5.02 M × 8 (+ validity) | 204 MB, of which 81 MB covers 2,097 GPS and 2,056 HR samples |
| `Time` and the small GPS/HR channels | `Time` carries an IMU0-length `t_us` | about 14–27 MB |
| **Total** | | **≈ 0.63 GB** |

The budget on this 16 GB machine is `min(2 GiB, 25 % × 16 GB)` = 2 GiB (`tauri/src/memory.rs:17`,
`:23`, `:65-69`), so everything stays resident.

### 1.3 Per evaluation: building the session handle

| Stage | Allocation | B/s | Lifetime | Copies | Where |
|---|---|---|---|---|---|
| `load_lazy_session_handle` | a footer read and a channel index | — | the command | — | `session_source.rs:111-125`, `parquet.rs:1762-1770` |
| First lookup of each channel | `ChannelSamples::to_channel` clones the raw column **and copies both time axes** | 18 | **the whole command** (`lazy.decoded`) | +1 per evaluation, on top of the cache's copy | `session_source.rs:73-80`, `session/samples.rs:64-75`, `session/handle.rs:838-839` |

For this workbook that is 12 × 30.6 MB ≈ **0.38 GB per evaluation**, duplicating what the cache
already holds. Five concurrent evaluations make five copies.

### 1.4 Per definition: channel lookup

| Stage | Allocation | B/s | Lifetime | Where |
|---|---|---|---|---|
| `SessionHandle::lookup` | `try_materialize` to f64, plus `Arc::from(c.t_us.as_slice())` (a copy) | 8 + 8 | one definition's evaluation | `session/handle.rs:1207-1226` |
| `MemoLookup` | shares the widened channel **within one definition only**: it is created per `evaluate_with_constants` call | — | one definition | `math/eval.rs:107-140`, `:338` |

A definition that names three IMU1 channels (`f_lp`, for example) widens all three again: 3 × 27 MB =
81 MB of transient, even though earlier definitions widened the same channels.

### 1.5 Per operation: intermediates

The evaluator is a recursive tree walk (`math/eval.rs:385-468`). A binary node keeps its left
value while it evaluates the right, so live intermediates per expression are bounded by tree depth.
Every node allocates a fresh full-rate buffer. Nothing works in place and nothing is fused.

| Builtin | Allocation | Where |
|---|---|---|
| `+ - * / < > …` channel×channel | `Vec::with_capacity(n)`, then `Arc::from(out)`: **2 × 8N while it converts** | `math/eval.rs:530-536` |
| channel×scalar, `map_value` (`abs`, `sqrt`, unary `-`) | `collect` into `Arc<[f64]>`: 8N | `:543-562`, `:797-807` |
| `channel(...)` helper, used by `where`, `butter`, `clip`, rolling ops | `Arc::from(Vec)`: 2 × 8N while it converts | `:985-993` |
| `where(c, a, b)` | `vec![0.0; n]` + helper | `:1747-1786` |
| `butter` | sci-rs `sosfiltfilt_dyn` scratch (padded forward and backward passes) + output + `Arc` | `filters.rs:101-107`, `math/eval.rs:1381-1397` |
| `mean(x, w)` (rolling) | 8N, **O(N·w) time**: each output sums its whole window | `statistics.rs:73-83` |
| `percentile`, `median` | a finite-sample copy (8N) sorted in place | `math/aggregate.rs:86-91` |
| `current_lap()` | 8N built from `i / rate`, with no `t_us` | `math/eval.rs:1812-1825` |
| `t_us` on results | shared (`Arc` clone) for maps and channel×scalar, compared for channel×channel (`combine_t_us`, O(N) compare, no copy) | `:654-678` |

### 1.6 Per definition: outputs

| Stage | Allocation | B/s | Lifetime | Where |
|---|---|---|---|---|
| `EvalOutput` | `samples.to_vec()` + **`t_us.to_vec()`** | 8 + 8 | until `eval_cells` converts it | `math/eval.rs:341-346` |
| `resolved` overlay | `Arc::from(samples)` + `Arc::from(t_us)` | 8 + 8 | **until `resolve_workbook_defs` returns** | `workbook/v3/resolve.rs:174`, `:202-211` |
| `results` | the `EvalOutput` above | (counted above) | until `eval_cells` drains it | `resolve.rs:175`, `:219` |

Each full-rate definition therefore holds **32 B/s** from when it is evaluated until resolution
ends. The overlay copy is the one cross-references read; `results` is the one the caller gets.
Neither copy is needed: one `Arc` pair would serve both.

### 1.7 `eval_cells` to `CellEvalResult`

`workbook/v3/eval.rs:117` resolves **every** definition. At `:184`, `to_host_channel` builds a
`HostChannel { t: Vec<f64>, v: Vec<f64> }` for every successful definition: `t` is recomputed from
`t_us` as seconds and `v` is `v.to_vec()` (`host.rs:85-100`). That is **16 B/s per definition**. As
each one is built, its `EvalOutput` is dropped, so this stage peaks at about one full set of
outputs: 16 B/s × all definitions.

### 1.8 Commands

| Command | What it does | Where |
|---|---|---|
| `eval_workbook_v2` | per window: handle, prefetch, `eval_cells`, then `CellOutput`. The full `HostChannel`s are reduced to `HostChannelRef {length, has_t}` and the samples are dropped. Windows run serially | `commands/workbook.rs:654-693`, `:533-607`, `:42-61` |
| `fetch_host_channel_v2` | **re-reads and re-parses the workbook, builds a fresh handle, runs the full `eval_cells`, picks one definition**, encodes it, and keeps every other definition's `HostChannel` until it returns | `commands/workbook.rs:809-860`, `:1248-1258` |
| Encode (`IDLH` v1) | stride decimation: keeps every `ceil(n/budget)`-th sample, as f64 `t` and `v`, ≤ 65,536 × 16 B + 24 ≈ 1 MB | `workbook/v3/host_channel_wire.rs:94-105` |
| IPC | `tauri::ipc::Response` raw bytes (meets design §4's raw-bytes intent) | `commands/workbook.rs:1257` |
| Concurrency | `#[tauri::command(async)]`: off the main thread, with no per-command limit and no cancellation | `commands/workbook.rs:1211`, `:1247` |

### 1.9 The app side

`Notebook/index.tsx:2711` runs `void runChannelBind(...)` once per chart cell, so cells run
concurrently. Within one cell, channels are fetched one at a time (`channelBindDriver.ts:361`,
`:378`). The effect depends on `primaryEval` (`index.tsx:2714-2726`), so the fetches start only
after `eval_workbook_v2` has returned. Payloads are copied (`buffer.slice(0)` for transfer, plus a
retained copy), at about 4 arrays × points × 8 B × 2. At the point budget that is negligible.

### 1.10 Tile path for stored channels, for contrast

`fetch_tile_via` widens the **whole channel** to f64 for **every tile** it serves
(`commands/tiles.rs:60-63`, `ch.materialize()`): 13.6 MB transient per IMU tile request.
`SessionHandle::decimate_tile` already folds over the raw column without materialising it. The
command does not use it.

### 1.11 Crash path

`crash.rs:76-83` installs a `std::panic` hook. A failed allocation does not panic. Rust's default
handler prints `memory allocation of N bytes failed` to stderr, which a GUI app does not have, and
aborts. No report and no marker are written. Verified.

### 1.12 The trace's four claims, checked

| Claim | Verdict |
|---|---|
| (a) every chart re-parses and re-evaluates everything | **True**, with a correction. The workbook has 7 `js` cells. Two of them, the map (`gps(...)`) and the histogram, use other commands that do not evaluate the workbook. The other 5 cells fetch **6** definitions: `lt` (lap chart), `lat_g`, `long_g`, `frame_g`, then `r_bump` and `f_bump` one after the other in one cell. Opening the workbook therefore runs 7 full evaluations, at most 5 at once, starting after `eval_workbook_v2`. It is not 8 at once. |
| (b) `results` and `resolved` both live until return | **True**, and it is worse: `EvalOutput` also copies `t_us` (`math/eval.rs:344`), and `eval_cells` makes a third copy as `HostChannel` (`host.rs:92-100`). |
| (c) no concurrency limit or evaluation budget | **True**. The budget bounds decodes in flight plus cache residency (`session_cache.rs:16-23`, `:186-194`) and never sees evaluator allocations. |
| (d) panics only | **True** (§1.11). |

---

## 2. Numbers for the real case

### 2.1 Session `103bc2bfbb5dcf6d76302015a46cd2f5`

Read from the Parquet footer with `pyarrow` (metadata only, no decode).

| | |
|---|---|
| `data.parquet` | 135,522,108 B; 5,017,348 union rows; 6 row groups of 1,000,000 rows; 35 columns |
| IMU0 (6 × int16) | 1,694,793 samples each, 808.3 Hz (measured `rate0`), span ≈ 2,097 s |
| IMU1 (6 × int16) | 1,676,791 each |
| IMU2 (6 × int16) | 1,640,793 each |
| GPS (8 columns) | 2,097 each (≈ 1 Hz) |
| HR_BPM / HR_RR | 2,056 / 5,587 |
| Footer | `ARROW:schema` is 6.65 MB: each IMU column repeats its source's `gaps` JSON (225–372 KB) in its own field metadata, 18 times in all |
| Source blob | `.idl0`, 119,687,748 B (`blobs/sha256/a0/a3922d…`) |

### 2.2 Workbook

The workbook has 232 definitions in 11 `math` cells, 9 literal `table` cells and 7 `js` cells.
**37 definitions are full-rate**, by reading their expressions:

- `c0000003`: 2 (`cl`, `on_t`).
- `c0000004`: 7.
- `c0000005`: 12.
- `c0000006`: 10.
- `c0000007`: 6.

Together they hold 62,203,327 samples (23 at IMU0 rate, 7 at IMU1, 7 at IMU2). The other 195
definitions are scalars, `[lap]` vectors or GPS/HR-rate values, all under 0.1 MB each.

### 2.3 Bytes per stage for one evaluation (estimate)

| Stage | Arithmetic | App | CLI |
|---|---|---|---|
| Session inputs | app: handle copies (§1.3); CLI: eager `.idl0` parse of all 18 IMU channels, 18 × 30 MB | 0.38 GB | 0.55 GB |
| Held at end of resolution | 32 B × 62.2 M | **1.99 GB** | 1.99 GB |
| Per-definition transients | widened inputs (≤ 3 × 27 MB) + 2–4 op buffers (≤ 4 × 13.6 MB) + butter scratch | ≈ 0.1 GB | ≈ 0.1 GB |
| **Peak** | | **≈ 2.4 GB** | **≈ 2.6 GB** |
| After `resolve_workbook_defs` returns | overlay freed: −16 B × 62.2 M = −0.995 GB | ≈ 1.4 GB | ≈ 1.5 GB |

### 2.4 Measurement (CLI, one process, debug build)

**Method.** Free commit was checked first (4.98 GB, no other cargo or idl-rs process running). The
command was:

```
idl-rs workbook data <workbook> c00000a3 --session <blob> --track 228ffacc….idl0t --json
```

It was started with `Start-Process -PassThru`, and `Process.Refresh()` was polled every 200 ms,
recording `PrivateMemorySize64`, `WorkingSet64`, `PeakWorkingSet64` and `PeakPagedMemorySize64`
(peak private commit). `workbook data` evaluates the whole document (`cli/src/verbs/workbook.rs:202`)
and loads the session eagerly from the blob (`cli/src/main.rs:1408-1413` → `SessionHandle::from_path`).

**Result.** The run took 12.0 s; 55 samples were taken. Timeline:

| Time | Private memory | What it is |
|---|---|---|
| 0.9 s | 713 MB | blob read and parsed |
| 1.8–7.0 s | 835 MB → 1.43 GB | resolution, rising one step per full-rate definition |
| 7.9–11.3 s | 1.85 GB → **2.53 GB peak** (`PeakPagedMemorySize64` = 2,528 MB) | `c0000005` through `c0000007` |
| 11.5 s | **1.51 GB** | `resolve_workbook_defs` has returned |

**Reconciliation.** The model predicts a peak of 0.55 GB eager session + 1.99 GB = 2.54 GB, against
**2.53 GB measured**. It predicts a drop of 0.995 GB when the overlay is freed, against **1.02 GB
measured**. Both agree within 1 %, which confirms the 32 B/s retention model.

The "1.2 GB CLI peak" figure in the brief does not reproduce for this session and workbook. It was
probably taken on a shorter day-1 session or an earlier, smaller version of the workbook.

### 2.5 Reconciling the app's climb from 1.0 to 4.8 GB in 17 s (estimate)

1. **Open: `eval_workbook_v2`.** Prefetch decodes 13 channels, 5 at a time (`physical cores − 1`).
   The transient is ≤ 5 × 183 MB, and residency settles at 0.63 GB. The evaluation then peaks at
   +2.4 GB, so the app reaches ≈ 1.0 + 0.63 + 2.4 ≈ **4.0 GB**. It falls back to ≈ 1.6 GB when the
   command returns.
2. **Bind: 5 concurrent `fetch_host_channel_v2`.** Each is heading for +2.4 GB, about 12 GB
   together. The machine's commit headroom was about 5 GB (measured 4.98–5.05 GB free commit today;
   see the memory note on the host commit limit). Total commit therefore ran out at ≈ 4.8 GB, when
   the five fetches were each ≈ 0.64 GB into their handle copies and first definitions.

Timing is consistent with this. The debug CLI spends ≈ 10 s per evaluation, and the four O(N·w)
rolling means alone are 3.4 × 10⁹ additions. A release build doing one evaluation then five
concurrent ones fits in 17 s.

**Consequence:** step 1 alone came within ≈ 0.8 GB of the death point. Removing the duplicate
evaluations is necessary but not sufficient on this machine. The per-evaluation footprint has to
fall too.

---

## 3. Intent versus reality

| Design intent | Reality | Why it matters |
|---|---|---|
| D6: "Cheap math cells are lazy" (design §2) | Every command evaluates every definition eagerly (`v3/eval.rs:117`). A request for one definition evaluates 232. | Cost scales with document size, not with what is on screen. |
| D6 and C1 §5: expensive results are materialised once, keyed by inputs | No evaluation result is kept between calls. C2 §4 records the deferral of R125's `(session, definition, revision)` cache. | Each chart, settle and reopen recomputes everything. |
| Design §4 chart path: column → `decimate_channel(tier, tile)` + per-pixel-column (min, max, mean) | Definitions get a full evaluation and then stride decimation over the whole session (`host_channel_wire.rs:94-99`). There are no tiles and no min/max. Stored channels widen the whole channel per tile (`tiles.rs:62`). | Memory is the first problem. Stride sampling of an 800 Hz bump signal at ~1,600 points keeps one sample in about 1,000, so peaks alias away: the chart is wrong as well as expensive. |
| Design §5: column projection **and** row-group time statistics give "one channel, one time range" reads | Projection is implemented (`parquet.rs:996-1003`). Row-group or time pruning is not. C1 §4.4 requires `t` statistics for exactly this purpose. | A lap window costs the same as the whole session. |
| Design §5: `RawColumn` keeps raw counts, widened lazily | The cache keeps raw counts, but each evaluation copies them out (`session_source.rs:79`) and widens them once per definition (`handle.rs:1218-1222`, memo per definition at `math/eval.rs:338`). | 18 B/s copied per evaluation, plus 16 B/s per definition per reference. |
| `session_cache.rs:6-8`: "decoded at most once … every consumer shares the same Arc" | True for the cache. False for the evaluator. | The cache's discipline stops at the evaluator. |
| "Time is recorded, not assumed": `t_us` rides with every value | It does, but as a fresh copy per definition, ×2 (`math/eval.rs:344`, `resolve.rs:208`), plus a seconds copy in `HostChannel`. In the cache, one per channel rather than one per source. | The time axis costs as much as the values themselves. |
| `session_cache.rs:253-255`: "one budget for the process" | The evaluator, the largest consumer, is outside the budget. The cap is fixed at 2 GiB. | The budget cannot prevent this incident. A larger machine gets no more parallelism. |
| R201: nothing blocks the main thread | Met. There is no cancellation: a superseded fetch runs to completion and holds its memory. | Re-renders stack evaluations. |
| Crash reports (`2026-10-21-idl1-crash-reports.md`) | Panic only. | The worst failure leaves no trace. |

---

## 4. The target model

### 4.1 What "one evaluation's worth" is

For one `(workbook content, session, window)` and a requested set R of definitions:

```
peak(R) ≈ I + F + T + O
  I = compact inputs the closure of R reads, held once, process-wide
      (raw column at stored width + ONE t_us per source axis)
  F = max over the schedule of Σ live full-rate values (8 B/s each; t_us shared, never copied),
      where a value is live from its evaluation to its last consumer in the closure, or to the
      end of the evaluation if it is in the retain set
  T = the largest single step's transients (operands widened for that step + op scratch),
      zero for fused element-wise chains reading raw columns
  O = output tiles or decimated payloads (≤ budget points × 16 B per requested series)
```

The estimate for this workbook comes from a liveness simulation of the 232 definitions in document
order. The simulation script is in the adjudicator's scratchpad; the method is to drop each
full-rate value after its last `[ref]` consumer, unless a chart names it.

| Term | Value | Basis |
|---|---|---|
| I | 41 MB raw (12 × 3.4) + 41 MB `t_us` (3 IMU axes × 13.6) ≈ **82 MB** | recorded axes are not needed by maths and are left out |
| F | **149 MB** at `c_vert` | 10 values live: `cl`, `on_t`, `f25`, `frame_g`, `lat_g`, `on1`, `on2`, `f_vert`, `r_vert`, `c_vert`; includes the 54 MB of chart-retained values (`lat_g`, `frame_g`, `f_bump`, `r_bump`; `long_g` is GPS-rate) |
| F, if widened inputs are also memoised across definitions | 255 MB | so widen per step, or fuse; do not memoise |
| T | ≈ 55–95 MB | ≤ 3 widened operands × 13.6 + ≤ 4 op buffers × 13.6; ≈ 14 MB once fused |
| O | < 1 MB | |
| **Target** | **≈ 0.3–0.35 GB per evaluation**, and **one** evaluation per key | against 2.4 GB × 7 today |

### 4.2 Architecture

**A. Shared, single-flight evaluation per key.**

The key is:

```
EvalKey = sha256(workbook bytes) ‖ window(session_id, span) ‖ data identity
          (blob_sha256, importer_version, seam_correction_version from the footer)
          ‖ sha256(session.json laps and sectors) ‖ engine version
```

A process-wide registry maps `EvalKey → Arc<Evaluation>`.

- The first caller runs the evaluation. Later callers (`eval_workbook_v2` and every
  `fetch_host_channel_v2`) wait on it, as `SessionCache` already does for decodes
  (`session_cache.rs:41-48`, ruling R232.2), then read their answer from it.
- A fetch that arrives first evaluates only the closure of its own definition.
- Entries are byte-accounted and evicted LRU under the same budget as the cache.
- Superseded work is cancelled when its key's subscriber count reaches zero, checked between
  definitions. This is where `2026-09-20-idl1-evaluation-progress-DRAFT.md` §4's `EvalObserver`
  and `run_cancelled` plug in: one evaluation, many observers.
- Layers: the evaluation object and executor are **core**; the registry, single-flight and
  cancellation are **tauri**.
- No C3 change: both commands keep their signatures.

*Later refinement:* key full-rate values by **definition closure** rather than whole workbook, as
`hash(closure text, constants used) ‖ data identity ‖ window`, where the window is included only if
the closure calls a lap-aware builtin or a windowed reduction. That lets an edit to one cell
re-evaluate only its dependents. It also lets two windows over one session (lap-to-lap compare)
share every window-independent chain.

**B. Planner (core, `workbook::v3::plan`).**

- **Inputs.** The planner works from the parsed document plus per-channel sample counts and rates.
  Counts come from the footer: Σ over row groups of `num_values − null_count`. These statistics are
  in the file today; `ChannelColumnInfo` has no count yet (`parquet.rs:860-877`).
- **Graph and shapes.** It builds the definition DAG (as `resolve.rs:151-160` does), infers every
  output's length, rate and axis statically (element-wise keeps the length; `resample` takes `onto`'s;
  reductions give 1), and computes `F` by simulating the schedule.
- **Outputs.**
  - a schedule (topological; document order is the tie-break, which keeps R49's first-wins rule);
  - per-value consumer counts;
  - the estimate `E = I_missing + F + T` × 1.25.
- **Demand set.** The retain set is the names the document's consumers mention, found by a lexical
  scan in core: `channel("x")` and bare identifiers in `js` cells, `${…}` spans in prose, and table
  columns. That is a conservative superset needing no new wire. A future C3 argument could narrow it.
- **What every definition still gets.** Every definition still evaluates once for the math-cell
  display: scalars, `[lap]` vectors and errors are shown. Full-rate definitions outside the retain
  set keep only metadata (`length`, `rate`, `has_t`, `unit`) after their last consumer. That is all
  `HostChannelRef` needs (`commands/workbook.rs:49-61`).

**C. Single ownership, no copies (core).**

- A value is `{ values: Arc<[f64]>, axis: Arc<TimeAxis> }`. `TimeAxis` is interned per evaluation,
  one per distinct axis. Here there are 3 IMU axes, the `Time` axis, GPS and HR.
- `EvalOutput`, the cross-reference overlay and the retained result share that one `Arc` pair.
- `HostChannel` stops being materialised. The encoder takes a borrowed view and computes seconds
  only for the points it emits.
- Element-wise ops build the output directly into an `Arc<[f64]>`, with no `Vec`-then-copy: use
  `Arc::<[f64]>::new_uninit_slice`, or `collect` from a `TrustedLen` iterator as `map_value`
  already does.
- `combine_t_us` compares axes by `Arc::ptr_eq` first, so interned axes compare in O(1).
- The lazy handle holds the cache's `Arc<ChannelSamples>` instead of `to_channel()` copies.
- Widening is per step (or fused away), never memoised across definitions.

**D. Inputs, projection and pruning (core `store`, used by the tauri cache).**

- *Cache shape.* Store one `t_us` `Arc` per source, shared by that source's channels, plus raw
  columns. Gather the recorded axis only when something asks for it; the maths never does. After
  gathering, drop the 5 M-row `Int64Array` axes, or keep only `t`. Parse the footer once per
  session and cache the channel index. Here that takes the cache from 0.63 GB to ≈ 0.13 GB.
- *Decode transient.* Read row group by row group into the gathered vectors, instead of collecting
  batches and running `concat_batches`. That halves the transient, which falls from ≈ 183 MB to
  ≈ 95 MB for a first channel.
- *Row-group pruning for windows* — **PROVISIONAL (Q1).**
  - Each value's closure gets a *halo*:
    - 0 for point-wise ops;
    - 1 sample for `differentiate`;
    - w samples for trailing `mean(x, w)` and `std(x, w)`;
    - one bracketing sample each side for `resample`;
    - **unbounded for `butter`**, because `filtfilt` is zero-phase IIR;
    - unbounded for anything integrating from the session start.
  - When the halo is finite, decode only the row groups whose `t` statistics overlap
    `[window − halo, window + halo]`. Otherwise read the whole session. Results stay identical to
    whole-session evaluation.
  - For a 1-of-12 lap window on a point-wise closure this is ≈ 1/12 of the I/O and memory. Today's
    row groups hold 1 M rows ≈ 7 min, so the granularity is coarse. C1 §4.4's row-group size is a
    knob to revisit, not part of this proposal.

**E. Fusion and streaming (core `math`).** Compile maximal element-wise subtrees (arithmetic,
comparisons, `where`, `abs`, `sqrt`, `clip`, scalar broadcast) into one loop that writes one output
buffer and reads raw columns as `raw × scale + offset`.

- A fused chain that ends in a reduction (`sum`, `mean`, `count`, `min`, `max`, and `std` via
  Welford) **allocates no full-rate buffer at all**. For example, `sum([on1] * [f_bump] * [f_bump])`
  becomes one pass that holds two inputs.
- `percentile` and `median` need the values: copy only the finite ones, as today.
- `butter`, `resample` and the rolling ops stay materialising operators.
- Rolling `mean` and `std` become O(N) with a running sum (Kahan-compensated), which removes the
  3.4 × 10⁹ additions here.
- Fusion is worth doing for **expression-internal** intermediates (`T`) and for reductions. It does
  not change `F`, which liveness controls.

**F. Persisting results (core `store` + tauri).** — **PROVISIONAL (Q2).**

- D6 materialisation stays as designed for expensive full-rate estimators: `derived/<hash>.parquet`,
  synced.
- Workbook results that are **reductions** (rank-0 values and `[lap]` vectors) go into a local,
  content-addressed result cache keyed by the definition-closure key in §4.2.A. It is
  rebuildable and never synced, like the catalog. Reopening a workbook, and every season-scale run
  after the first, then reads kilobytes instead of decoding Parquet.
- Full-rate workbook definitions are not persisted by default. At ≈ 0.3 GB and seconds per session
  they are cheaper to recompute than to store and sync.

**G. Machine-aware budget and admission control** — **PROVISIONAL (Q3).**

- A small `MemoryBudget` trait lives in **core**, alongside `store::index_job::DecodeBudget`
  (`index_job.rs:68-74`): `acquire(bytes, hint) -> Guard`, plus a non-blocking `try_acquire`. The
  CLI implements it with a fixed `ByteBudget`; the app implements it in **tauri** `memory.rs`.
- The app's budget is sampled live and has no absolute cap:

  ```
  B_max  = physical_RAM × f            (f proposed 0.5; no absolute cap)
  B_live = own_commit_now + available_commit_now − headroom
           (Windows: FreeVirtualMemory, the binding limit in this incident; elsewhere: available
            memory; headroom = max(512 MB, 5 % of RAM); refreshed at most every 250 ms)
  B      = min(B_max, B_live)
  ```

- **Admission.** One ledger covers cache residency, decodes in flight and evaluations in flight.
  Each evaluation reserves `E` from the planner before it starts:
  - if `reserved + E ≤ B`, it is admitted;
  - otherwise cold cache entries are evicted first, then it **waits** (condvar);
  - if `E > B_max` it fails at once with C3 §1's `resource_exhausted` `{needed_bytes, budget_bytes,
    hint}`. The hint names the workbook and the largest definition. No new error kind is needed.
- **Accuracy.** A counting global allocator (§4.2.H) measures each evaluation's real peak against
  `E` and logs drift. Estimates are planned, then checked; nothing is guessed.
- **Parallelism follows from the budget.** On this 16 GB machine with about 3 GB available, about 8
  evaluations at 0.35 GB fit at once; the decode pool's width limits it first. A 64 GB machine
  admits about 90. No constant changes.

**H. Abnormal-exit marker and allocation breadcrumb (tauri + app).**

- At startup, write `<app-data>/crashes/running.json` (pid, version, start time). Remove it on clean
  exit. If a marker with a dead pid is found at the next start, report it once through the existing
  crash-report flow as *"idl1 quit unexpectedly"*.
- The admission ledger updates the marker's `in_flight` field at each acquire and release (keys,
  estimates, reserved bytes), so the report can say what was running.
- A `#[global_allocator]` wrapper around `System`:
  - the type lives in idl-rs-tauri; the `static` lives in `app/src-tauri`;
  - it counts live bytes in atomics;
  - when the system allocator returns null, it writes `alloc of N bytes failed, live=M` to a file
    handle opened at startup, using a stack buffer and no allocation, and then returns null so
    Rust aborts as before.
- Together these turn this incident's silent death into a report naming the size and the work in
  flight.

**I. Pixels.**

- The host-channel encoder emits min/max pairs per bucket, interleaved in time order, inside the
  existing `IDLH` v1 `(t, v)` layout. That is a layout-compatible change, and it ends the aliasing
  in §3.
- `fetch_tile` decimates with `SessionHandle::decimate_tile` over the raw column instead of
  materialising the channel.
- Tiling definitions as well (zoom-dependent tiers for a definition) needs a window or tier argument
  on the definition fetch, which is a C3 change — **PROVISIONAL (Q4)**.

### 4.3 Layer placement (CLAUDE.md §2)

| Piece | Layer |
|---|---|
| Planner, schedule, liveness, estimate, demand scan, `Evaluation` executor, value and `TimeAxis` representation, fusion, O(N) rolling ops | `rust/core` (`workbook::v3`, `math`) |
| Projection and row-group pruning, per-channel counts from the footer, per-source axis sharing, footer caching, result-cache file format | `rust/core` (`store`, std::fs only) |
| `MemoryBudget` trait | `rust/core` (trait only, like `DecodeBudget`) |
| Machine probe (`sysinfo`), budget policy, admission ledger, single-flight registry, cancellation, counting allocator type, crash marker | `rust/tauri` (`memory.rs`, `session_cache.rs`, new `eval_registry.rs`, `crash.rs`) |
| `#[global_allocator]` static | `app/src-tauri` |
| Budget implementation for season runs (`ByteBudget`, workers from the budget) | `rust/cli` |
| Showing `resource_exhausted` and the abnormal-exit report; not refetching on unchanged identity (already present) | `app/src` |

---

## 5. Season scale

A cross-session workbook over S sessions (hundreds) runs as **evaluate-then-reduce per session**.

1. **Select.** The catalog lists S sessions (`sessions` and `laps` tables, C4). No Parquet is opened.
2. **Plan once.** The planner is built per workbook. Its estimate is per session, because it
   depends on each session's sample counts: `E_s`.
3. **Evaluate in parallel.** Workers take sessions under the budget. A session is admitted when
   `reserved + E_s ≤ B`, and parallelism is `P ≈ min(cores − 1, ⌊B / E_s⌋)`. Each worker runs only
   the closure of the *requested reductions* (rank-0 values and `[lap]` vectors), stores them in the
   result cache (§4.2.F), and frees everything before taking the next session. Peak memory is
   `P × E_s` plus the cache's `I` for sessions in flight, plus kilobytes of results per session. It
   never grows with S.
4. **Combine.** Cross-session values are computed over the per-session reductions only: tables with
   a session row source, trends, and `[session]` / `[session, lap]` shaped values. No two sessions'
   full-rate data are resident together, except where an expression explicitly needs it (ghost-lap
   deltas and overlays need two closures, so `2 × E`).
5. **Reopen.** On a result-cache hit there are 0 decodes. Editing one definition invalidates only
   that definition's closure, across S sessions.

**Sizing, estimate.** Here `E_s` ≈ 0.35 GB. On this machine, with about 3 GB available, `P` = 5,
limited by the pool width. At 1–3 s per session in release, 300 sessions take about 1–3 minutes the
first time and seconds after that. A 64 GB, 16-core machine runs `P` = 15 with no configuration.

**Ties to the engine gaps** (`2026-10-27-mx-compare-engine-gaps-DRAFT.md`):

- **P1-6** (a workbook evaluates one session; this run needed 36 CLI evaluations and 8 literal
  tables) is the selection and combine half of the list above. The memory model removes the reason
  it would be unsafe to build today: 9 sessions × 2.4 GB.
- **P1-2** `mean(x, "t:lap")` and **N3** (lap functions with no time axis) produce the per-session
  `[lap]` reductions that step 4 combines. They should land as reductions that fuse (§4.2.E): a
  per-lap mean of a fused element-wise chain is one pass with no full-rate buffer.
- **N5** (integrals not restarted at the lap window) is the same semantic question as Q1, and
  should be answered together with it.
- **N10** (events) adds an `[event]` axis. Its reductions (`at_start`, `over`) are reductions in the
  sense above, and persist the same way.
- **N6 and N7** (the CLI cannot take a session id, and dumps full-rate series): the CLI should open
  sessions lazily from the library (`open_session_lazy`), not by eagerly parsing the 120 MB blob,
  which here cost 0.55 GB before any maths.

---

## 6. Phased plan, ranked by impact over effort

| Phase | Change | Layer | Effect here (estimate) | Effort | The test that proves it |
|---|---|---|---|---|---|
| **1** | **(a)** Single-flight shared evaluation keyed by `EvalKey`. `fetch_host_channel_v2` reads from it, and an LRU of evaluations is byte-accounted. **(b)** Remove the copies: one `Arc` pair per value shared by `EvalOutput`, the overlay and the result; no `HostChannel` materialisation (encode from a view); the lazy handle holds the cache's `Arc`s; no `Vec`-then-`Arc` copy in `elemwise`/`channel`. **(c)** Abnormal-exit marker. No C3 change. | core + tauri | 7 evaluations → 1. Per evaluation 2.4 → ≈ 0.6 GB (all 37 values kept once: 8 B × 62.2 M = 0.50 GB + ≈ 0.1 GB transient). App peak ≈ 1.0 + 0.63 + 0.6 ≈ **2.2 GB**, down from more than 12 GB requested. | M | tauri: `fetch_host_channel_v2_via — seven concurrent fetches on one key after eval_workbook_v2 — one evaluation runs` (registry counter, like `axis_decodes`, `session_cache.rs:660`). tauri: `… — workbook bytes change between calls — second call re-evaluates`. core, counting allocator: `eval_cells — ten chained full-rate defs over a 1e6-sample channel — peak under 8 B × N × 12 + 1 MB`; today it is ≈ 32 B × N × 10. Existing `fetch_host_channel_v2_via_a_lap_window_agrees_with_eval_workbook_v2_via…` stays byte-identical. tauri: `crash marker — left by a dead pid — reported once as an abnormal exit`. |
| **2** (built, `rust` branch `mem-p23`) | Planner: static shapes and counts from the footer, schedule, liveness release, demand and retain set, estimate `E`. | core | Per evaluation ≈ 0.6 → **≈ 0.3–0.35 GB**. Retained results 0.50 GB → 0.054 GB. | M | core: `plan — mx-compare-shaped fixture — estimate within ±25 % of the counted peak`. core: `liveness — a full-rate def with no dependents and not demanded — buffer released, metadata kept`. core: fixture peak ≤ `(I + F + T) × 1.1`. |
| **3** (built, `rust` branch `mem-p23`; CLI side not built) | Machine-aware budget and admission: `MemoryBudget` trait, `B = min(RAM × f, live commit − headroom)`, one ledger for cache, decode and evaluation, waiting before refusing, `resource_exhausted` when `E > B_max`, cancellation at zero subscribers. Allocator breadcrumb. | core trait + tauri + cli | No abort is possible from evaluation. Parallelism follows the machine. | M | tauri: `admission — two evaluations whose estimates sum past B — second waits, both succeed`. tauri: `admission — estimate past B_max — resource_exhausted before any decode`. tauri: `budget — fake probe with 64 GB physical — B_max scales, no 2 GiB ceiling`. tauri: `cancel — last subscriber drops — evaluation stops at the next definition boundary`. |
| **4** | Cache shape (one `t_us` per source, recorded axis on demand, drop 5 M-row axes, footer parsed once, row-group-wise gather) and window pruning when the halo is finite. | core store + tauri cache | Cache 0.63 → **≈ 0.13 GB**. Decode transient halved. A lap window on point-wise closures uses ≈ 1/12 of the I/O. | M | tauri: `SessionCache — six channels of one source — one t_us allocation` (`Arc::ptr_eq`). core: `read — pointwise closure, one-lap window — only overlapping row groups read` (reader hook counts them). core: `pruned and whole-session evaluation — same window — identical values`. |
| **5** | Fused element-wise kernels and streaming reductions; O(N) rolling `mean`/`std`; min/max host-channel decimation; `fetch_tile` without materialising. | core | `T` ≈ 95 → ≈ 14 MB. Reductions of chains allocate 0. Evaluation CPU drops by most of 3.4 × 10⁹ additions. Charts stop aliasing. | M–L | core, counting allocator: `fused chain ending in sum — allocations of N-sized buffers == 0`. core: `rolling_mean O(N) — matches the windowed sum within 1e-12 relative`. core: `host channel encode — 800 Hz sine burst — min/max survive decimation`. |
| **6** | Persisted reduction cache (Q2), per-closure keys, season evaluate-then-reduce with budget-derived workers, and the cross-session combine (with engine-gaps P1-6, P1-2, N3). | core + tauri + cli | Reopen: 0 decodes. S sessions in `P × E_s` memory. | L | core: `reopen — every requested reduction cached — zero Parquet decodes` (decode counter). cli/core: `50 synthetic sessions, budget fits 2 — peak ≤ 2 × E + 10 %, results equal to serial`. |

### 6.1 Phases 2 and 3 as built (2026-10-28, spec-during)

**Phase 2 (core `workbook::v3::plan`).**

- `ChannelColumnInfo::sample_count`: Σ over row groups of `num_values − null_count`, from the footer.
- `EvalPlan::new(defs, constants, PlanInputs, Demand)` gives the schedule (Kahn, lowest document index
  first; cycle members last), consumer counts, static shapes, the retain set and a `MemoryEstimate`.
- `Demand::document(doc)` retains the names found by the identifier scan of `js` and `table` bodies and
  `${…}` spans (the app bind pass's own rule). `Demand::closure(names)` evaluates only the closure.
  `Demand::reductions(names)` evaluates the closure and retains no full-rate value (for session-set
  members). `Demand::everything()` is what `eval_cells` still does.
- `resolve_planned` and `eval_cells_planned` run in schedule order. A full-rate `[t]` value outside the
  retain set is released after its last consumer, or at once if nothing reads it. The released value
  keeps `length`, `has_t`, rate, unit and axis: `HostChannelView::released`.
- **Deviation:** `E` uses the simulated step peak `P = max_k(live_before_k + transient_k)` in place of
  `F + T`. `P ≤ F + T`; `F` and `T` are still reported. `E = (I_missing + P) × 1.25`.
- `I` uses today's cache shape: raw bytes plus 16 B per sample. Phase 4 lowers it.
- Per-operator costs are measured against the per-thread counting allocator: every family is within
  0.1 % (`plan_cost_model_each_builtin_family_…`).
- **Measured** on the mx-compare-shaped fixture (the workbook's `c0000003`–`c0000007` definitions without
  lap functions; IMU0 120,000 samples):
  - estimate 14.32 MB against 14.35 MB counted, −0.2 %;
  - keep-everything peak 36.3 MB, planned peak 14.35 MB (−60 %);
  - scaled by sample count to session `103bc2bf…`, about 0.51 → 0.20 GB for these definitions (estimate).
- A fetch of a released definition (one the scan missed) evaluates that definition's closure under its
  own key.

**Phase 3.**

- Core `store::index_job`: `MemoryBudget` (`acquire`, `try_acquire`, `ceiling_bytes`) and `NeverFits`,
  implemented by `ByteBudget`.
- Tauri `memory.rs`:
  - `B_max = 50 % RAM`, no cap.
  - `MachineBudget::budget_now(accounted) = min(B_max, min(own, accounted) + available − headroom)`.
    Crediting own commit only up to what the ledger holds is a contained decision. It stops the app's
    baseline from counting as budget, and stops a granted-but-unallocated reservation from being
    granted twice.
  - Available commit is `free_swap` (commit limit − commit total on Windows) plus page-file growth,
    read from the `PagingFiles` registry value. Growth is not bounded by free disk yet (`TODO(idl0)`).
  - Own commit is the counting allocator's live heap.
- `SessionCache` is the ledger:
  - `admit_evaluation(bytes, hint, cancelled)` counts resident channels, kept evaluations, decodes in
    flight and running evaluations against `B`. It evicts cold channels, then kept evaluations, then
    waits; it re-reads the machine every 250 ms. It refuses at once only when `bytes > B_max`.
  - **Deviation:** decode reservations still do not charge residency (ruling R211.2's reason). They
    share the in-flight half with running evaluations, against `B` now.
- `evaluate_planned` (the two v2 commands) refuses before any decode when `E` (missing inputs included)
  is above `B_max`, with a hint naming the workbook and its largest definition. It then prefetches,
  admits its step peak and runs.
- `EvalRegistry`:
  - Every attached caller is a subscriber. `subscribe(key, f)` runs the flight on its own thread, and
    dropping the last `Subscription` cancels it at the next definition boundary.
  - `get_or_evaluate` keeps its caller subscribed, so it never cancels. The app has no cancel trigger
    until a C3 change gives it one.
  - Kept evaluations count in the ledger. The separate `eval_cache_cap_bytes` is gone.
- Allocator breadcrumb:
  - `crash::BreadcrumbAllocator` (the `static` is in `app/src-tauri`) counts live bytes.
  - On a null return it writes `alloc of N bytes failed, live=M` to `crash/alloc-<pid>.log`, with no
    allocation. The next launch folds it into the abnormal-exit report.
  - The marker's `in_flight` field (§4.2.H) is not written yet.

**Phase-1 recommendation.** Do 1(a) and 1(b) together. Section 2.5 shows that 1(a) alone still
peaks at ≈ 4.0 GB on this machine, within ≈ 0.8 GB of the abort. Section 2.4 shows that 1(b)
alone still multiplies by the number of charts. Add 1(c) because it is about 50 lines and the next
incident needs it. Phase 3's admission control is the actual guarantee and should follow
immediately. Phases 1 and 2 make it rarely needed.

Test infrastructure: the counting allocator for core tests is a `#[cfg(test)] #[global_allocator]`
in `rust/core/src/lib.rs` with **per-thread** counters, so parallel inline tests (CLAUDE.md §4)
measure only their own thread. The evaluator is single-threaded per evaluation.

---

## 7. Open questions for Isaac

### Q1 — Is a windowed value defined as "evaluate the whole session, then select the window"?
- **Where:** §4.2.D; `session_source.rs:457-474`; engine-gaps N5.
- **Context:** Today every window evaluates the whole session and then slices it, so a lap's
  filtered signal includes filter settling from neighbouring laps. Pruning reads to the window
  saves memory and I/O, but changes values at the edges for IIR filters (`butter`) and integrals.
  N5 says the reference restarts integrals at the window, which is a different definition again.
- **Blast radius:** structural.
- **Recommended answer:** Whole-session-then-window is the definition. Pruning is used only when
  the closure's halo is finite, so results are identical. Restarting integrals at the window (N5)
  is a separate, explicit builtin form, not a property of windows.
- **Proceeded on:** the recommended answer.
- **Affected outputs:** this file §4.2.D, Phase 4 (PROVISIONAL).
- **Your answer:** **Yes (Isaac, 2026-10-27).** Whole session, then the window. Pruning only where the result is identical.

### Q2 — May workbook reductions be persisted in a local result cache, and should they sync?
- **Where:** §4.2.F; design D6; C1 §5; C4 directory layout.
- **Context:** Season-scale reopen needs per-session results without decoding Parquet. D6 syncs
  derived files only for expensive estimators and calls math cells lazy. A local, never-synced
  cache (rebuildable, like the catalog) adds a directory to C4 but leaves the sync model alone.
  Synced results would change the sync surface.
- **Blast radius:** structural.
- **Recommended answer:** Yes to a local, never-synced cache under `<data>/cache/eval/` for rank-0
  and `[lap]` results, keyed by definition closure, data identity, laps and engine version. No
  sync. Full-rate definitions are not persisted.
- **Proceeded on:** a local, non-synced cache.
- **Affected outputs:** this file §4.2.F, §5, Phase 6 (PROVISIONAL).
- **Your answer:** **Yes, with an option to sync (Isaac, 2026-10-27).** Local cache by default. Its entries are keyed by their inputs (content-addressed, D6), so they may sync; syncing them is a setting, off by default. Full-rate definitions are still not persisted.

### Q3 — How much of the machine may idl1 take?
- **Where:** §4.2.G; `tauri/src/memory.rs:14-29` (today 25 % of RAM, capped at 2 GiB).
- **Context:** "Budgeted by the machine, never a fixed cap" needs a fraction of RAM and a headroom
  rule. A higher fraction gives more parallel sessions at season scale, but a less responsive
  machine for everything else while idl1 works.
- **Blast radius:** structural.
- **Recommended answer:** `B = min(50 % of physical RAM, live available commit − max(512 MB, 5 %
  RAM))`, with no absolute cap and no user setting until someone asks for one.
- **Proceeded on:** 50 %.
- **Affected outputs:** this file §4.2.G, §5 sizing, Phase 3 (PROVISIONAL).
- **Your answer:** **Budget past free memory, never near the commit wall (Isaac, 2026-10-27).** Free physical RAM on Isaac's machines is always low, so it must not be the limit: the budget is a share of physical RAM (50 %), and the OS pages other programs out to make room. The hard guard is commit: an evaluation is admitted only if it leaves at least the headroom below the commit limit (counting page-file growth where the page file is system-managed). Otherwise it waits, and refuses with `resource_exhausted` only if it could never fit.

### Q4 — Should definition charts get zoom tiers like stored channels (a C3 change)?
- **Where:** §4.2.I; C3 §3.4 `fetch_host_channel_v2(workbook_id, window, def_name, budget)`.
- **Context:** A definition chart today gets one whole-session decimation, so zooming in shows no
  more detail. Tiers need a time range or tier argument on the fetch, served from the shared
  evaluation's retained value. Min/max decimation (Phase 5) fixes aliasing without any contract
  change. Tiers are the rest of design §4's chart path.
- **Blast radius:** structural.
- **Recommended answer:** Yes, after Phase 2. Add `fetch_host_channel_v3` with C3 §3.5's tile
  arguments, reading the retained value. No change before then.
- **Proceeded on:** no contract change in Phases 1–5.
- **Affected outputs:** this file §4.2.I (PROVISIONAL).
- **Your answer:** **Yes, after Phase 2 (Isaac, 2026-10-27).**

---

## 8. Incidental findings (not memory, found on the way)

- **The app and the CLI disagree on this workbook.** Under any app window, `load_window_context`
  makes `main_lap_bounds` one span (`session_source.rs:471-474`), so `current_lap()` is 1 inside
  the window and 0 outside it (`variance.rs:158-165`). `on_t = where(current_lap() >= 2, 1, 0)` is
  then all zero in the app, and every `[on_t]`-weighted result (`c_rms`, `air_lap`, `n25`, …) is 0
  or NaN there. The CLI path, with detected laps, gives real numbers. This is reasoned from the
  code and has not been run in the app. It belongs with engine-gaps N3/N5.
- **Rolling `mean(x, w)` is O(N·w).** This workbook's four flight windows cost 3.4 × 10⁹ additions
  per evaluation (`statistics.rs:73-83`).
- **The footer is 6.65 MB** because every IMU column repeats its source's `gaps` JSON. It is
  re-parsed on every decode, estimate and handle open. Storing gaps once per source would be a C1
  follow-up; it is not needed for the memory target.
- **`workbook eval/data --session` loads the `.idl0` blob eagerly**
  (`cli/src/main.rs:1408-1413`): 0.55 GB before any maths on this session.

---

Contained decisions taken in this draft:

- `EvalKey` composition (§4.2.A).
- Per-thread counting allocator under `cfg(test)` in core (§6).
- Min/max pairs emitted inside the existing `IDLH` v1 layout (§4.2.I).

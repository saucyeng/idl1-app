# C1 — Session schema

**Status:** signed (lead) 2026-09-02 · **Date:** 2026-09-03 · **Owner:** lead

---

## 1. Scope

This contract fixes, byte-exactly, the three artifacts every L1 (store), L2 (importer) and L3
(workbook) implementer codes against for one imported session:

1. The **canonical in-memory model** (`Session`, `Channel`) as it exists after L1 lands mandatory
   per-sample time (§2).
2. The **time model**: the definition of the union axis `t`, the per-source recorded-stamp
   columns, the burst-seam correction algorithm and its versioning, and the invariants that must
   hold everywhere downstream (§3).
3. The **on-disk Arrow/Parquet schema** for `<data>/sessions/<session_id>/data.parquet` (§4) and
   `<data>/sessions/<session_id>/derived/<hash>.parquet` (§5), including every column, every
   key-value metadata key, row-group policy, and the derived-file hash recipe.
4. The **`session.json` schema** (§6) — the non-channel metadata that replaces `.idl0w`.
5. The **round-trip guarantees** L1's tests must prove (§7).

**What this contract leaves to L1's own SPEC section** (written when L1 lands, per CLAUDE.md §9):
the Rust module layout and function signatures that implement §2–§7; the drop-reconciliation
*interior* algorithm beyond what §3.3/§4.2 require for gap storage (rebuild-onto-grid mechanics
are L1's, `GapSpan` storage is C1's); the `Importer` trait signature (L2's — C1 fixes only the
*output* shape every importer must produce, via §2/§4); the CAS blob store and data-directory
paths (C4's); the catalog SQLite schema (C4's); CLI subcommand shapes (L1/L4's).

---

## 2. Canonical in-memory model

`Session` and `Channel` as they exist today (`rust/core/src/session/mod.rs` at the `idl0-final`
tag), with every field-level divergence this contract mandates enumerated below — not just the
per-sample-time change the outline calls out by name, which is the largest but not the only one.
L1 should read this list as the full set of call sites the struct change touches:

- **The headline change:** per-sample time becomes mandatory on every channel. `Channel`'s
  `sample_times_secs: Option<Vec<f64>>` (event-driven channels only, today) is replaced by
  `t_us: Vec<i64>` on *every* channel, and `sample_rate_hz: f64` is renamed `nominal_rate_hz: f64`
  and demoted to metadata-only — fixed-rate channels no longer imply time from `i /
  sample_rate_hz`.
- **`Session.device_id: String`** (today: empty-string sentinel for v1/no-device) **becomes
  `Option<String>`** — `None` for FIT/GPX/CSV sources, which have no device at all; the
  empty-string convention is retired in favour of an explicit optional.
- **`Session.config_checksum: String`** (today: same empty-string sentinel) **becomes
  `Option<String>`**, same reasoning — `None` for FIT/GPX/CSV.
- **`Session` gains two fields that do not exist today:** `source_format: SourceFormat` and
  `blob_sha256: String` — non-device provenance the design doc (§5) assigns this contract to add
  ("formalise the metadata the model needs for non-device sources").
- **`Channel` gains one field that does not exist today:** `source_kind: String` — which
  `<source>_t_recorded_us` column (§3.2) a channel's `t_us` was derived from, and whether §3.3's
  burst-seam correction applied to it.

```rust
/// One imported session — the parsed/converted view of one immutable source blob.
pub struct Session {
    /// Stable identity. The device's session UUID (32-char lowercase hex) for `.idl0`
    /// sources; a prefix of `blob_sha256` for FIT/GPX/CSV sources (exact derivation is C4's).
    pub session_id: String,
    /// 12-char lowercase hex MAC-derived device id. `None` for FIT/GPX/CSV — there is no device.
    pub device_id: Option<String>,
    /// Session start, UTC milliseconds since the Unix epoch. `0` means "unknown" (no header
    /// value and no GPS fix to back-fill from — see §3.1). Same sentinel convention as the
    /// existing `.idl0` header field (SPEC §5.1).
    pub timestamp_utc_ms: i64,
    /// Where `timestamp_utc_ms` came from (added 2026-09-10, ruling R194): `Header`
    /// (`.idl0` header `Session start UTC`), `GpsBackfill` (§3.1's first-fix formula),
    /// `SourceFile` (FIT/GPX/CSV earliest converted instant), or `User`
    /// (`set_session_start`, C3 §3.3). Set by each importer; carried in `session.json`
    /// (§6) and deliberately NOT in `data.parquet` §4.3 metadata, so no parquet is
    /// invalidated by its introduction. Serialises as the lowercase snake_case strings
    /// `"header" | "gps_backfill" | "source_file" | "user"`.
    pub timestamp_source: TimestampSource,
    /// CRC32 of `idl0_config.json` at recording time, 8-char lowercase hex (SPEC §5.1's
    /// Config CRC32 algorithm). `None` for FIT/GPX/CSV — there is no device config.
    pub config_checksum: Option<String>,
    /// Which importer produced this session: `Idl0 | Fit | Gpx | Csv`. Serializes to the
    /// file-metadata `source_format` string (§4.3) verbatim (lowercase).
    pub source_format: SourceFormat,
    /// SHA-256 of the raw source file bytes exactly as imported (the CAS blob this session's
    /// `data.parquet` is a function of — design doc §5). 64 lowercase hex chars.
    pub blob_sha256: String,
    /// Parsed channel data, one entry per channel present in this session.
    pub channels: Vec<Channel>,
}

/// Time-series data for a single channel. **Change from today:** `sample_times_secs:
/// Option<Vec<f64>>` (event-driven only) is replaced by `t_us: Vec<i64>` on *every* channel —
/// fixed-rate channels no longer imply time from `i / sample_rate_hz`. Nothing downstream may
/// ever compute a sample's time from `nominal_rate_hz`; it is metadata only (§3.5).
pub struct Channel {
    /// Registry/synthesized name, e.g. `IMU0_AccelZ`, `GPS_Latitude`, `WheelFront`.
    pub channel_id: String,
    /// Per-sample time, microseconds since the session's first sample (§3.1). One entry per
    /// sample in `column`; `t_us.len() == column.len()`. Strictly increasing (§3.5).
    pub t_us: Vec<i64>,
    /// Nominal sample rate in Hz — metadata only, never used to derive a sample's time.
    /// `0.0` for event-driven channels (matches the existing `sample_rate_hz == 0` convention).
    pub nominal_rate_hz: f64,
    /// Compact, typed sample storage — unchanged variants, see below for which survive the
    /// Parquet round-trip.
    pub column: RawColumn,
    /// Which recorded-timestamp source this channel's `t_us` was derived from — one of the
    /// `source_kind` tokens in §4.2. Determines which `<source>_t_recorded_us` column (§3.2)
    /// this channel's rows share, and whether §3.3's burst-seam correction applied.
    pub source_kind: String,
    /// Synthesized-sample runs from drop reconciliation, in this channel's own compact
    /// sample-index coordinates (post-null-drop — see §4.5's read rule). Unchanged semantics
    /// from today (SPEC §15.2): empty for every channel with no drops.
    pub gaps: Vec<GapSpan>,
    /// Verbatim recorded time — the same values §3.2's `<source>_t_recorded_us` column stores,
    /// kept in-memory so a burst-corrected channel's verbatim stamps survive to the Parquet
    /// writer. `None` when `t_recorded_us` would be identical to `t_us` (every non-burst source,
    /// §3.3 — no correction ever applies), so the common case costs nothing; `Some` only for a
    /// burst source whose correction actually diverged the two. **Added post-sign (2026-09-03,
    /// lead ruling R5, wave-1 L1):** §2's original listing omitted this field; §4.1 already
    /// required both `t` and `<source>_t_recorded_us` as independently-readable Parquet columns,
    /// which is unrecoverable at write time without an in-memory home for the verbatim value once
    /// burst correction (§3.3) diverges it from `t_us`. Dense (same length as `t_us`) when
    /// present; meaningful only at slots outside `gaps` — a reader consults `gaps` to decide a
    /// row's Parquet nullness, never infers it from this field's content (L1's own module-layout
    /// discretion, C1 §1).
    pub t_recorded_us: Option<Vec<i64>>,
    /// This channel's physical unit, e.g. `"g"`, `"km/h"`, `"deg"` — written verbatim into the
    /// Parquet column's `unit` metadata (§4.2, always required). **Added post-sign (2026-09-03,
    /// lead ruling R5, wave-1 L1):** §2's original listing omitted this field even though §4.2
    /// mandates the column value unconditionally; the channel registry's existing `units` field
    /// is the only source for it and was previously discarded after parse.
    pub unit: String,
}

/// Which importer produced a [`Session`]. Serializes to the `source_format` file-metadata string
/// (§4.3) lowercase, verbatim (`Idl0` → `"idl0"`, etc.).
pub enum SourceFormat {
    /// `.idl0` binary log from an IDL0 device.
    Idl0,
    /// Garmin/Wahoo/etc. `.fit` activity file.
    Fit,
    /// Garmin Connect/Strava-style `.gpx` track.
    Gpx,
    /// Generic `.csv` import (low priority — design doc D4).
    Csv,
}
```

**`RawColumn` variants and Parquet round-trip survival.** Unchanged variant set from today
(`rust/core/src/session/column.rs`):

| Variant | Round-trips through `data.parquet`? | Notes |
|---|---|---|
| `I16 { data, scale, offset }` | **Yes, bit-exact.** | Arrow `Int16`; the 18 IMU accel/gyro axis channels use this today. |
| `I32 { data, scale, offset }` | **Yes, bit-exact.** | Arrow `Int32`; today only `GPS_SpeedKmh` (`scale=0.01, offset=0.0`) uses this. |
| `F32 { data, scale, offset }` | **Yes, bit-exact.** | Arrow `Float32`; no channel populates this today (registry `data_type=6`, reserved for future f32 sensors). |
| `F64(data)` | **Yes, bit-exact,** including `-0.0` and `NaN` (Arrow `Float64` preserves the IEEE bit pattern; no `×1.0+0.0` is ever applied on read or write). | Every GPS_FIX-derived channel except `GPS_SpeedKmh`, and every generic `CHANNEL_SAMPLE` channel (`WheelFront`, `WheelRear`, `PressureFront`, `PressureRear`, `HR_BPM`, `HR_RR`) — see §4.1 for which of these are raw-wire-verbatim vs. already-physical. |
| `Ramp { len, rate }` (synthesized `Time`) | **No — never written.** | Zero-storage by design (design doc §5). A reader regenerates it: `Time[i]_seconds = t[i] / 1_000_000.0` for the requested axis. Not a column in §4.1's list. |
| `Interp { base, base_rate, out_rate, len }` (synthesized `Distance`) | **No — never written.** | A reader regenerates it by re-running the existing clamped-lerp formula (`rust/core/src/session/column.rs::interp_value`) over cumulative distance integrated from `GPS_SpeedKmh`, resampled onto the requested time axis. Not a column in §4.1's list. |

---

## 3. Time model

### 3.1 Definition of `t`

`t` is `INT64`, **microseconds**, strictly increasing across the whole file, equal to `0` at the
session's first sample. "First sample" is defined on the **corrected** time domain (post-§3.3
burst-seam correction for burst sources, verbatim for all others) — i.e. `t0_us` (the raw
`esp_timer`-domain, or wall-clock-derived, instant this session's `t=0` corresponds to) is the
**minimum corrected timestamp across every channel of every source** in the session. Every
channel's `t_us[i] = corrected_timestamp_us[i] − t0_us`.

This differs subtly from the existing SPEC §15.2 definition ("session t=0... the earliest record
`timestamp_us`", i.e. the earliest *raw recorded* stamp): burst-seam correction (§3.3) can move a
burst's earliest sample earlier *or* later than its own naive recorded value, so anchoring on the
raw minimum could make some corrected `t_us` values negative. Anchoring on the corrected minimum
instead guarantees `t_us[i] >= 0` for every sample everywhere, which §3.5 requires as an
invariant. (Flagged for confirmation — §8 item 1 is unrelated; this one is a definitional
tightening, not flagged, because it is required to satisfy §3.5 and does not change any existing
tested Rust function: the current engine has no `t_us` at all.)

`timestamp_utc_ms` (Session field, and `data.parquet` file metadata, §4.3) is the wall-clock UTC
millisecond instant corresponding to `t=0`:
- `.idl0` sources: if the file header's `Session start UTC` (SPEC §5.1) is non-zero, use it
  directly (it already represents the wall clock at the recording's first sample per firmware
  convention).
- `.idl0` sources with header `Session start UTC == 0`: back-fill from the first `GPS_FIX` record
  with `gps_epoch_ms != 0`, using SPEC §5.6's formula adapted to `t0_us`:
  `timestamp_utc_ms = gps_epoch_ms − round((device_timestamp_us − t0_us) / 1000.0)`, rounding
  half away from zero. If the session has no such fix, `timestamp_utc_ms = 0` ("unknown"; same
  sentinel the header already uses).
- **User-supplied start (amended 2026-09-10, ruling R191).** A session whose
  importer left `timestamp_utc_ms = 0` may be given a start by the user through
  `set_session_start` (C3 §3.3). The value is written to `session.json` only:
  `data.parquet` is a function of (blob, importer version) and never carries a
  human's input, so its §4.3 metadata keeps the importer's `0`. `session.json`
  gains `timestamp_source: "header" | "gps_backfill" | "source_file" | "user"`
  recording where the displayed value came from; readers prefer `session.json`.
  A user value is metadata, synced with the session like `venue_name`; it may
  be set on any session, including one whose importer found a time, and it
  replaces that time for display and sorting while `timestamp_source` says so.
- `.fit`/`.gpx` sources: the earliest converted UTC millisecond value across all channels (§3.4)
  — there is no separate device clock to back-fill from.

### 3.2 Recorded stamps: `<source>_t_recorded_us`

Every `source_kind` present in a session (§4.2's enumeration) gets exactly one
`<source>_t_recorded_us` column: `INT64`, microseconds, **verbatim** from the wire/file
timestamp for that source, converted to the same `t0_us`-relative origin as `t` but with **no
burst-seam correction applied** — i.e. `_t_recorded_us[row] = raw_timestamp_us[row] − t0_us` for
device sources, or the exact same value as `t` for FIT/GPX sources (§3.4, where recorded and
corrected are definitionally identical).

One column per *source*, not per *channel*: all 6 axes of one IMU are drained in a single FIFO
read and carry one `timestamp_us` per record (SPEC §5.5), so `IMU0_AccelX` … `IMU0_GyroZ` all
share `imu0_t_recorded_us`. Likewise every `GPS_*` channel shares `gps_t_recorded_us` (from
`device_timestamp_us`, SPEC §5.6 — **not** `gps_epoch_ms`, which is a different clock domain used
only for the `timestamp_utc_ms` anchor in §3.1).

`<source>_t_recorded_us` is **not guaranteed sorted** — a burst source's recorded stamps can
regress slightly at a seam when the true ODR is slower than nominal (design doc: "locally
non-monotonic time"). Do not `DELTA_BINARY_PACKED`-encode these columns (§4.4); only `t` is
guaranteed sorted.

### 3.3 Burst-seam correction

**Applies only to burst-drained fixed-rate sources** — today, `imu0`/`imu1`/`imu2`. GPS and every
generic `CHANNEL_SAMPLE` source (`wheel_front`, `wheel_rear`, `pressure_front`, `pressure_rear`,
`hr_bpm`, `hr_rr`) write one record per sample with no FIFO back-walk, so for those sources
`t == <source>_t_recorded_us` exactly, row for row — no correction to define.

**Inputs.** Per source (one IMU): the ordered sequence of recorded stamps
`stamps[0..n)` (raw `timestamp_us`, SPEC §5.5) and the nominal period
`nominal_period_us = 1_000_000 / configured_odr_hz` (integer division; `10_000` when
`configured_odr_hz == 0`, per the existing `imu_period_us` convention,
`rust/core/src/parse/records.rs`).

**Step 1 — detect bursts.** A burst is a maximal run `[lo, hi]` of indices such that for every
consecutive pair in the run, `|stamps[i] − stamps[i−1] − nominal_period_us| <= 1` (µs tolerance
for integer-division rounding). Walk the sequence once:

```
runs = []; run_start = 0
for i in 1..n:
    if abs(stamps[i] - stamps[i-1] - nominal_period_us) > 1:
        runs.push((run_start, i-1)); run_start = i
runs.push((run_start, n-1))
```

Each run `k` is a burst with `T_k = stamps[run.end]` (the newest/last sample — the read instant,
trustworthy per the firmware's stamping convention: sample `i = N−1` is stamped `t_read − 0`) and
`N_k = run.end − run.start + 1`.

**Step 2 — estimate the effective period.** For every burst `k >= 1` (one with a predecessor):
`estimate_k = (T_k − T_{k−1}) / N_k` (real division, not rounded yet). Aggregate over the whole
session for this source by **median** (not mean — robust to one-off outliers: a real pause
between recording segments, or a burst that straddles a genuine drop, would skew a mean but not a
median). With an even count of estimates, median = the mean of the two middle values. Round the
aggregate to the nearest integer µs, ties away from zero:
`effective_period_us = round(median(estimate_1..estimate_{m}))`. **If there are zero estimates**
(a single burst spans the whole source — every consecutive delta was already within tolerance of
nominal, i.e. the recorded ODR already matched nominal exactly), `effective_period_us =
nominal_period_us` — correction is then a no-op by construction (matches the recorded stamps
exactly). If the computed `effective_period_us <= 0` (pathological — e.g. out-of-order read
instants), fall back to `nominal_period_us` for the whole source and surface an
`ImportWarning` (CLAUDE.md §5 — never silently synthesize a wrong value, never hard-crash).

**Step 3 — re-space each burst.** For burst `k`, local sample index `i` (`0` = oldest,
`N_k − 1` = newest, matching the firmware's own indexing):
`corrected[k][i] = T_k − (N_k − 1 − i) * effective_period_us`.

**Monotonicity guarantee (required by §3.5).** Using the single session-wide
`effective_period_us` for every burst is *usually* safe but is not guaranteed never to push a
burst's earliest corrected sample at or before the previous burst's corrected last sample
(`T_{k-1}` exactly, since that sample's offset is 0) — a burst whose *own* true spacing ran faster
than the session-wide median could do this. To guarantee strict monotonicity always: **before**
committing burst `k`'s correction, check
`T_k − (N_k − 1) * effective_period_us > T_{k−1}`. If it fails, recompute burst `k` alone using
its own **local** period instead of the session-wide one:
`local_period_us = round((T_k − T_{k−1}) / N_k)` (same rounding rule; if this is `<= 0`, which
cannot happen for two real, time-ordered device reads, fall back to `nominal_period_us` and
surface an `ImportWarning`). Re-space burst `k` with `local_period_us` in place of
`effective_period_us`. Writing `true_local_period_us = (T_k − T_{k−1}) / N_k` (the unrounded
value) and `e = local_period_us − true_local_period_us` (the rounding error, `|e| <= 0.5`),
`corrected[k][0] = T_{k−1} + true_local_period_us − (N_k − 1) × e`, so this holds strictly
(`corrected[k][0] > T_{k−1}`) whenever `true_local_period_us > (N_k − 1) / 2`. For any burst size
and period an IMU FIFO can physically produce — periods of hundreds of µs (a few kHz ODR at most)
against burst sizes of at most a few dozen samples per FIFO watermark — this margin is enormous
(hundreds of µs of headroom against a bound in the tens); it only fails for a burst whose true
period is sub-microsecond or whose sample count is in the thousands, neither physically
realizable for this hardware. The first burst (`k=0`) has no predecessor, so no such check
applies to it; it always uses the session-wide `effective_period_us`.

**Version.** The whole of §3.3 is `seam_correction_version`. Current value: `"v1"`. Stored in
`data.parquet` file metadata (§4.3). A version bump means the algorithm's *output* can differ for
the same blob, so it must trigger regeneration of `data.parquet` from the immutable blob (§4.3).

**Worked numeric example.** IMU configured at 800 Hz → `nominal_period_us = 1_000_000 / 800 =
1250`. Suppose this IMU's true sampling rate is slightly faster, giving a true period of
`1200 µs` (≈833.3 Hz), and the firmware drains it in bursts of `N=4` every `4800 µs` of real
elapsed time (`4 × 1200`). Four consecutive bursts with read instants
`T_0=100000, T_1=104800, T_2=109600, T_3=114400` (µs, arbitrary epoch offset) produce these
**recorded** stamps (nominal-period walk-back, `T_k − (3−i)×1250`):

```
burst 0 (T=100000): 96250, 97500, 98750, 100000
burst 1 (T=104800): 101050, 102300, 103550, 104800
burst 2 (T=109600): 105850, 107100, 108350, 109600
burst 3 (T=114400): 110650, 111900, 113150, 114400
```

Consecutive within-burst deltas are exactly `1250` (within the ±1 µs tolerance of
`nominal_period_us`) — no seam there. At each burst boundary the delta is `101050 − 100000 =
1050`, `105850 − 104800 = 1050`, `110650 − 109600 = 1050` — none within ±1 µs of 1250, so all
three boundaries are correctly detected as seams. Four bursts, each `N_k=4`.

Effective-period estimates (bursts 1–3, each has a predecessor):
`(104800−100000)/4 = 1200`, `(109600−104800)/4 = 1200`, `(114400−109600)/4 = 1200`. Median =
`1200 µs` — the correction exactly recovers the true period. Re-spacing every burst (including
burst 0) backward from its own `T_k` at `1200 µs`:

```
burst 0 (T=100000): 96400, 97600, 98800, 100000
burst 1 (T=104800): 101200, 102400, 103600, 104800
burst 2 (T=109600): 106000, 107200, 108400, 109600
burst 3 (T=114400): 110800, 112000, 113200, 114400
```

Every consecutive delta, including across the three seams (`101200−100000=1200`,
`106000−104800=1200`, `110800−109600=1200`), is exactly `1200 µs` — strictly increasing,
uniformly spaced, matching the true ODR. Subtracting the source-wide minimum (`96400`, assuming
this is also the session's `t0_us`) gives this channel's final `t_us`:
`0, 1200, 2400, 3600, 4800, 6000, 7200, 8400, 9600, 10800, 12000, 13200, 14400, 15600, 16800,
18000`.

**Gaps (`GapSpan`) — ordering, ruled.** Drop reconciliation (rebuilding a channel onto an
equal-length, time-aligned grid across an IMU's drops — SPEC §15.2,
`rust/core/src/parse/records.rs` `ImuGridPlan::build`/`reconcile`) runs **after** burst-seam
correction, on the corrected time axis, using `effective_period_us` (or a burst's
`local_period_us` fallback) as the
reconciliation grid step passed to `ImuGridPlan::build` in place of `nominal_period_us`. This
changes that existing tested function's *inputs* (not its logic) — it now receives the corrected
period, not the nominal one.

**Why not the other order (reconcile first, then correct)?** Reconciling on the *nominal* grid
first would misread a true ODR offset as a stream of phantom drops. Direct simulation against
the §3.3 worked example's own recorded stamps (nominal 1250 µs, true 1200 µs, `N=4`/burst,
`t0 = 96250`, `ImuGridPlan::build`'s absolute rule `slot = round((ts − t0)/nominal_period_us)`,
SPEC §15.2) — the first 20 samples:

| idx | recorded `ts` (µs) | `Δ = ts − t0` (µs) | `Δ/1250` | `slot` | kept? |
|---|---|---|---|---|---|
| 0 | 96250 | 0 | 0.00 | 0 | kept |
| 1 | 97500 | 1250 | 1.00 | 1 | kept |
| 2 | 98750 | 2500 | 2.00 | 2 | kept |
| 3 | 100000 | 3750 | 3.00 | 3 | kept |
| 4 | 101050 | 4800 | 3.84 | 4 | kept |
| 5 | 102300 | 6050 | 4.84 | 5 | kept |
| 6 | 103550 | 7300 | 5.84 | 6 | kept |
| 7 | 104800 | 8550 | 6.84 | 7 | kept |
| 8 | 105850 | 9600 | 7.68 | 8 | kept |
| 9 | 107100 | 10850 | 8.68 | 9 | kept |
| 10 | 108350 | 12100 | 9.68 | 10 | kept |
| 11 | 109600 | 13350 | 10.68 | 11 | kept |
| 12 | 110650 | 14400 | 11.52 | 12 | kept |
| 13 | 111900 | 15650 | 12.52 | 13 | kept |
| 14 | 113150 | 16900 | 13.52 | 14 | kept |
| 15 | 114400 | 18150 | 14.52 | 15 | kept |
| 16 | 115450 | 19200 | 15.36 | **15** | **DROPPED — same slot as sample 15** |
| 17 | 116700 | 20450 | 16.36 | 16 | kept (resumes) |
| 18 | 117950 | 21700 | 17.36 | 17 | kept |
| 19 | 119200 | 22950 | 18.36 | 18 | kept |

Sample 16 — the first sample of the 5th burst — lands on the same slot (15) as sample 15 and,
per SPEC §15.2's own rule ("an out-of-order sample whose slot does not advance past the previous
kept one … is dropped"), is discarded: a genuine device sample misread as a duplicate.

**Deriving why sample 16, not some other index.** Within one burst, consecutive recorded deltas
increase by exactly `nominal_period_us` (the firmware always walks back at the *nominal* cadence
inside a burst, regardless of true ODR — SPEC §5.5), so the assigned slot advances by exactly 1
per sample and no drift accumulates *within* a burst (rows 0–3, 4–7, 8–11, 12–15 above each step
slot by exactly 1). Drift appears only at burst *seams*: crossing from burst `k−1` to `k`, real
elapsed time is `T_k − T_{k−1} = N × true_period_us`, while nominal-slot-counting "expects"
`N × nominal_period_us` to have elapsed — so every seam adds
`burst_drift_us = N × (nominal_period_us − true_period_us)` of cumulative drift against a
purely-nominal clock. After crossing `m` seams, cumulative drift is `m × burst_drift_us`; `round`
keeps assigning the expected slot only while this stays inside `± nominal_period_us / 2` of zero,
so the first collision occurs at the smallest `m` with
`m × burst_drift_us >= nominal_period_us / 2`, i.e.
`m = ceil(nominal_period_us / (2 × burst_drift_us))`, at overall sample index `m × N` (the first
sample of burst `m`, 0-based). Here: `burst_drift_us = 4 × (1250 − 1200) = 200 µs`;
`m = ceil(1250 / (2×200)) = ceil(3.125) = 4`; first collision at sample `4 × 4 = 16` — matches the
table exactly.

Because `ImuGridPlan::build`'s slot is always the *absolute* `round(Δ/nominal_period_us)` from
`t0` (SPEC §15.2: "never by accumulating per-step advances"), drift keeps accumulating linearly
from `t0` rather than resetting after a drop, so further collisions recur — re-simulating the same
example to sample 44 confirms a second dropped sample at index 40 (24 samples after the first),
consistent with the derivation: over a long window this converges to the aliasing rate between
two clocks — total drift after `s` samples is `s × per_sample_drift_us`
(`per_sample_drift_us = nominal_period_us − true_period_us = 50 µs`, the *average* rate, delivered
in 200 µs jumps every 4 samples rather than smoothly), so collisions recur roughly every
`nominal_period_us / per_sample_drift_us = 1250/50 = 25` samples in steady state (24 measured here
— the discreteness of burst-level drift accumulation, not a formula error, accounts for the
1-sample difference from the continuous estimate). The *first* collision lands later than this
steady-state estimate (16, not ~12–13) for the same reason: drift accumulates in discrete
`burst_drift_us` jumps, not continuously per sample, so the earlier, coarser part of the session
"absorbs" more slack before the first collision than the steady-state rate alone would predict.

Every one of these dropped/duplicated samples would then be fed into burst-seam correction as if
it were a real device read, corrupting the very `T_k`/`N_k` values §3.3's estimate depends on.
Correcting first removes the drift (the corrected axis matches the true, uniform sample cadence,
§3.3's worked example), so reconciliation afterward only ever sees genuine FIFO drops — its
existing "gap = delta > 1/ODR between consecutive same-`imu_index` timestamps" detection rule
(SPEC §5.5) becomes accurate again once it is run against the corrected period instead of the
nominal one. A `GapSpan`'s `{start, len}` continues to mean "these consecutive samples, in this
channel's own compact index space, are synthesized (interpolated fill or held-edge pad), not
recorded" — unchanged semantics, just computed on the corrected grid.
See §8 item 1 (ruled, not open).

### 3.4 Non-device sources (FIT, GPX)

FIT `record` messages carry one `timestamp` field: `u32` seconds since the FIT epoch
(1989-12-31T00:00:00Z UTC), i.e. whole-second resolution. GPX trackpoints carry an ISO-8601
`<time>` element, typically whole seconds, sometimes with a fractional-second suffix.

For both formats, the recorded timestamp maps to `t` **directly** — there is no burst structure
and no correction: `t_us[i] = round(timestamp_utc_ms[i] − first_timestamp_utc_ms) * 1000`, and
`_t_recorded_us[i]` holds the **same value** (`fit_t_recorded_us` / `gpx_t_recorded_us`), since
for these sources "recorded" and "corrected" are the same number by definition — §3.2's column
still exists (schema uniformity across every source, so a consumer never special-cases FIT/GPX to
skip reading a `_t_recorded_us` column), it is just always equal to `t` row for row.

**Rounding.** FIT: the `timestamp` field has 1-second resolution — no sub-second rounding needed;
`timestamp_utc_ms[i] = (fit_timestamp_s[i] + 631065600) * 1000` (`631065600` = seconds from the
Unix epoch to the FIT epoch). GPX: parse the ISO-8601 string to UTC milliseconds, rounding any
sub-millisecond fractional-second component to the nearest millisecond, ties away from zero.

**Duplicate/non-monotonic timestamps.** If two consecutive samples of the same channel produce an
equal or non-increasing `t_us` (possible only for a pathological source recording at ≥1 Hz FIT
resolution, or a GPX file with duplicate trackpoints), the importer **drops** the later duplicate
sample and surfaces an `ImportWarning` — never silently emits a non-strictly-increasing `t_us`
(CLAUDE.md §5: recover what's readable, surface a warning; never violate §3.5's invariant).

### 3.5 Invariants

1. **`t_us` is strictly increasing within every channel.** No channel's `t_us` vector may contain
   a repeated or decreasing value, ever — enforced by §3.3's monotonicity guarantee for burst
   sources, by construction for verbatim sources, and by the drop-and-warn rule in §3.4 for
   FIT/GPX.
2. **The union axis `t` (the `data.parquet` column) is sorted ascending and contains no duplicate
   value.** It is built as the sorted, deduplicated set of every channel's `t_us` values in the
   session — if two different channels happen to produce the identical microsecond value, they
   share one row rather than each getting a near-duplicate row.
3. **`<source>_t_recorded_us` is not guaranteed sorted** (§3.2) — do not assume it, do not
   `DELTA_BINARY_PACKED`-encode it.
4. **`nominal_rate_hz` never derives a sample's time, anywhere, on any code path.** Every `t_us`
   value traces back to a recorded device/GPS/FIT/GPX timestamp (verbatim, or burst-corrected per
   §3.3) — never `i / nominal_rate_hz`.

---

## 4. `data.parquet` schema

One wide file per session, `<data>/sessions/<session_id>/data.parquet` (path root fixed by C4).

### 4.1 Columns

| Column | Arrow type | Nullable | Notes |
|---|---|---|---|
| `t` | `Int64` | No | The union time axis, µs since first sample (§3.1). Sorted ascending, unique (§3.5). |
| `imu0_t_recorded_us`, `imu1_t_recorded_us`, `imu2_t_recorded_us` | `Int64` | Yes | Present only for IMUs enabled this session. Not sorted (§3.2). |
| `gps_t_recorded_us` | `Int64` | Yes | Present iff GPS is enabled. |
| `wheel_front_t_recorded_us`, `wheel_rear_t_recorded_us`, `pressure_front_t_recorded_us`, `pressure_rear_t_recorded_us`, `hr_bpm_t_recorded_us`, `hr_rr_t_recorded_us` | `Int64` | Yes | Present iff that registry channel is enabled. Bit-identical to `t` row-for-row for these sources (§3.3 — no burst correction applies), kept for schema uniformity. |
| `fit_t_recorded_us` / `gpx_t_recorded_us` | `Int64` | Yes | FIT/GPX sessions only; one or the other, never both. Bit-identical to `t` (§3.4). **Union-of-channels construction, amended post-sign (2026-09-04, lead ruling R23, wave-1 L2):** for a source whose channels do not all share one `t_us` (e.g. a FIT session with GPS present on only a subset of records), this column is built from the **union** of that source's channels' `t_us`, not any single channel's, so it stays bit-identical to `t` on every row (L2-R10). |
| `IMU{0,1,2}_{AccelX,AccelY,AccelZ,GyroX,GyroY,GyroZ}` | `Int16` | Yes | Raw LSB counts. `scale`/`offset` in column metadata (§4.2); `scale = accel_range_g/32768` or `gyro_range_dps/32768`, `offset = 0.0`. `unit`: `g` / `dps`. |
| `GPS_SpeedKmh` | `Int32` | Yes | Raw wire value (km/h × 100) with `scale=0.01, offset=0.0` — `materialize()` yields **physical km/h** (the one SPEC §5.7 exception). `unit`: `km/h`. |
| `GPS_EpochMs` | `Float64` | Yes | Verbatim raw `i64` UTC ms from the receiver, stored as f64, no scale/offset. `unit`: `ms_raw`. |
| `GPS_Latitude`, `GPS_Longitude` | `Float64` | Yes | **Physical decimal degrees**, baked in at parse time (`raw_i32 * 1e-7`), no metadata `scale`/`offset`. `unit`: `deg`. |
| `GPS_Altitude` | `Float64` | Yes | **Physical metres**, baked in at parse time (`raw_i16 * 0.1`), no metadata `scale`/`offset`. `unit`: `m`. |
| `GPS_Heading` | `Float64` | Yes | **Physical degrees** (0–360, true), baked in at parse time (`raw_u16 * 0.01`), no metadata `scale`/`offset`. `unit`: `deg`. |
| `GPS_FixQuality` | `Float64` | Yes | Verbatim raw `u8` code (0=none 1=GPS 2=DGPS), no scale/offset. `unit`: `enum_raw`. |
| `GPS_Satellites` | `Float64` | Yes | Verbatim raw `u8` count, no scale/offset. `unit`: `count`. |
| `WheelFront`, `WheelRear` | `Float64` | Yes | Already-physical (scale 1.0/offset 0.0 baked in at parse time — the generic `CHANNEL_SAMPLE` path for `data_type` codes other than i16/i32/f32 bakes `scale*raw+offset` into the stored f64; no metadata `scale`/`offset` key). `unit`: `pulse`. |
| `PressureFront`, `PressureRear` | `Float64` | Yes | Already-physical, same baked-in convention. `unit`: `bar`. |
| `HR_BPM` | `Float64` | Yes | Already-physical. `unit`: `bpm`. |
| `HR_RR` | `Float64` | Yes | Already-physical (scale `1000/1024` baked in, converting 1/1024 s ticks to ms). `unit`: `ms`. |
| *(FIT/GPX-derived channels)* | `Float64` | Yes | `GPS_Latitude`/`GPS_Longitude`/`GPS_Altitude`/`GPS_EpochMs`/`GPS_SpeedKmh`/`GPS_Heading`/`HR_BPM`/`Cadence_RPM`/`Power_W` as applicable — always-physical values (no raw/scale distinction; these formats deliver physical units natively), `unit` set accordingly (`deg`, `m`, `ms_raw`, `km/h`, `deg`, `bpm`, `rpm`, `W`). **`GPS_SpeedKmh`/`GPS_Heading` added post-sign (2026-09-03, lead ruling R7, wave-1 L2):** the original list omitted them, but lap timing and lap-distance normalisation (L1's own scope, design §10) depend on `GPS_SpeedKmh` the same way they do for `.idl0` sessions — FIT's `speed`/`enhanced_speed` fields (m/s, ×3.6 for km/h) and GPX's `<speed>`/`<course>` elements (or the ported `gpx_parser.dart` derive-when-absent fallback) are the source values. **`GPS_Latitude`/`GPS_Longitude` unit corrected from `deg` to `deg_e7`, amended post-sign (2026-09-04, lead ruling R23, wave-1 L2):** `.idl0` fills these same two columns at `deg_e7` (this table's `.idl0`-sourced `GPS_Latitude`, `GPS_Longitude` row, above) and every landed consumer — `gps.rs`, `laps::*`, `tracks::*` — assumes that scale throughout (R17); leaving FIT/GPX's lat/lon under this row's own "always-physical" principle at plain `deg` would silently disagree with every reader. `deg_e7` is the one named exception to the always-physical-units principle stated above: a 1e-7° integer grid is the receiver's own native resolution, and the lap/track stack works in it end to end, so FIT/GPX importers convert their native decimal-degree values ×1e7 at import time rather than leaving two different units under one column name. **R23's `deg_e7` decision is SUPERSEDED by ruling R27 (2026-09-04, Isaac): `GPS_Latitude`/`GPS_Longitude` are physical decimal degrees, `unit: deg`, for every source — FIT/GPX importers store their native decimal values unchanged, `.idl0` parse bakes `× 1e-7`. The paragraph above is kept only to explain why the column was briefly `deg_e7`.** **`GPS_EpochMs` population stated explicitly, amended post-sign (2026-09-04, lead ruling R23, wave-1 L2):** FIT populates it from `record.timestamp` on rows carrying a position (`GPS_EpochMs = (fit_timestamp_s + 631_065_600) * 1000`, `i64` UTC ms — §3.4's own FIT-epoch formula); GPX populates it from `<time>`. |

`Time` and `Distance` (`RawColumn::Ramp`/`Interp`) are **not** columns here (§2) — regenerated on
read.

### 4.2 Column key-value metadata

Applies to every **channel** column (not to `t` or `_t_recorded_us` columns, which carry no
column metadata beyond their Arrow type):

| Key | Type (stored as UTF-8 string; see below) | Present when |
|---|---|---|
| `scale` | `f64`, decimal string, shortest round-trip representation (Rust `f64::to_string()`) | Only on `Int16`/`Int32`/`Float32` columns |
| `offset` | `f64`, same encoding | Only on `Int16`/`Int32`/`Float32` columns |
| `nominal_rate_hz` | `f64`, Hz, same encoding | Always. `0.0` for event-driven. |
| `unit` | string | Always. See §4.1's table for values. |
| `source_kind` | string, one of: `imu0`, `imu1`, `imu2`, `gps`, `wheel_front`, `wheel_rear`, `pressure_front`, `pressure_rear`, `hr_bpm`, `hr_rr`, `fit`, `gpx`, `csv` (new sensors get a new lower-`snake_case` token without a schema change, per SPEC §5.2's forward-compatibility philosophy) | Always. Also present (as the sole metadata key) on `<source>_t_recorded_us` columns, identifying which source they belong to. **`csv` added post-sign (2026-09-04, lead ruling R23, wave-1 L2):** CSV is event-driven (`channel_kind: event`, `nominal_rate_hz: 0.0`) under this row's own "new sources get a new token without a schema change" clause; its `unit` (the `unit` row above) is the empty string when the CSV header supplies no unit — the `unit` key is still always present, just empty, same as any other source with nothing to put there. The corresponding `csv_t_recorded_us` column (§4.1) follows the same convention as `fit_t_recorded_us`/`gpx_t_recorded_us`: bit-identical to `t` row for row (§3.4's no-burst-structure reasoning applies to CSV the same way it applies to FIT/GPX). |
| `channel_kind` | string, `fixed-rate` \| `event` | Always. `event` iff `nominal_rate_hz == 0.0`. |
| `gaps` | JSON array string, e.g. `[{"start":120,"len":3}]` — `start`/`len` are indices into this channel's own compact (post-null-drop, §4.5) sample sequence, same semantics as today's `GapSpan` (§2) | Only when non-empty. Omitted (not an empty-array string) when the channel has no gaps — keeps metadata diffs clean, matches the existing `.idl0w` convention of omitting empty collections. |

All Parquet key-value metadata values are `String` (the format has no other type); every numeric
value above is serialized to its canonical decimal string and parsed back on read — this is the
one place floating-point values cross a text boundary in this schema, so `scale`/`offset`/
`nominal_rate_hz` round-trip tests (§7) must compare the *parsed-back bit pattern*, not just the
string.

### 4.3 File key-value metadata

| Key | Type | Present when |
|---|---|---|
| `session_id` | string | Always |
| `timestamp_utc_ms` | `i64` decimal string | Always (`"0"` = unknown, §3.1) |
| `device_id` | string, 12-char lowercase hex | `.idl0` sources only — key omitted entirely (not empty string) for FIT/GPX/CSV |
| `config_checksum` | string, 8-char lowercase hex | `.idl0` sources only — key omitted for FIT/GPX/CSV |
| `blob_sha256` | string, 64-char lowercase hex | Always |
| `source_format` | string, `idl0` \| `fit` \| `gpx` \| `csv` | Always |
| `importer_version` | SemVer 2.0.0 string, e.g. `0.1.0` | Always — the specific importer module's own version (`idl0`/`fit`/`gpx`/`csv`), bumped whenever that importer's parsing or timing-derivation output changes |
| `engine_version` | SemVer 2.0.0 string | Always — `idl-rs` core crate's `CARGO_PKG_VERSION`. Provenance only; **not** a `data.parquet` regeneration trigger (only `importer_version`/`seam_correction_version` are — see below) |
| `seam_correction_version` | string, e.g. `v1` | Always (even for non-IMU-only sources, for uniformity) — §3.3's algorithm version |

**Regeneration rule.** `data.parquet` is a pure function of `(blob, importer_version,
seam_correction_version)` (design doc §5). On session open/catalog scan, if either metadata value
differs from the currently-running build's, the file is deleted and rewritten from the immutable
blob before use. `engine_version` mismatch alone does not trigger this.

### 4.4 Row groups

Target row-group size: **1,000,000 rows** (or the whole file, if fewer) —
`WriterProperties::builder().set_max_row_group_size(1_000_000)`. `t` **must** be written with
`Encoding::DELTA_BINARY_PACKED` (confirmed available and vectorized in `parquet` 59.3.0 — ecosystem
finding 5; "works best on sorted data", which `t` is guaranteed to be by §3.5). Row-group
statistics (min/max) **must** be enabled at least at column-chunk granularity
(`EnabledStatistics::Chunk` or finer) for `t`, so range-pushdown reads ("one channel, one time
window") skip whole row groups without touching the rest of the file (ecosystem finding 5). Every
other column should also carry statistics (cheap; recommended, not required by this contract).

### 4.5 Nulls

Standard Arrow/Parquet nullable-column encoding: a validity bitmap in Arrow, definition levels
(max definition level 1 for these flat primitive columns) in Parquet, RLE-encoded by default —
this is exactly what makes "a 10 Hz GPS column in an 800 Hz table cost nothing measurable" true
(design doc §5) without any special-casing; no column needs a non-default encoding for this beyond
`t`'s `DELTA_BINARY_PACKED` (§4.4).

**Read rule.** To reconstruct one channel's compact `Channel` (its own `t_us` + `RawColumn`) from
the wide table: read that channel's column plus `t`, filter to the rows where the channel's value
is non-null, keep `t` at those rows as `t_us` and the values as the compact `RawColumn` data —
this drop-nulls step is exactly the inverse of how the column was written (§4.1: a channel's
column is non-null on precisely the rows at its own `t_us` values).

---

## 5. `derived/<hash>.parquet`

Same column-type and metadata conventions as §4.1/§4.2 (Arrow types by output kind — materialised
estimator outputs are `Float64`, no `scale`/`offset`; `unit`, `channel_kind`, `nominal_rate_hz`
still apply) with two differences: (1) the file's own `t` column is the derived channel's own
sample times (typically inherited from its primary input's post-correction `t`, not necessarily
identical to `data.parquet`'s full union axis — e.g. an estimator computed at IMU rate emits `t`
at that IMU's sample instants), and (2) file metadata carries provenance instead of import
provenance:

| Key | Type | Notes |
|---|---|---|
| `derived_kind` | string | Name of the estimator, e.g. `iekf_suspension_attitude` |
| `inputs` | JSON array string, `[{"channel_id": "...", "column_hash": "<64-hex>"}, ...]`, in the same canonical order used to compute the file hash (below) | Lets a consumer verify/re-derive without re-hashing every input |
| `config_json` | string — the exact canonical-JSON bytes (below) that went into the hash | |
| `engine_version` | SemVer string | Included in the hash (below) |
| `computed_at_utc_ms` | `i64` decimal string | Informational only — **not** part of the hash |

### Hash recipe (byte-exact)

`hash = sha256(input column hashes ‖ config json ‖ engine version)`, computed as:

**1. Per-input column hash** (`column_hash`, one per input channel):

```
column_hash(channel) = SHA256(
    UTF-8 bytes of channel.channel_id
    ++ 0x00                                        # channel_id is null-terminated ASCII
                                                     # (SPEC §5.2) so 0x00 cannot occur inside it —
                                                     # unambiguous delimiter
    ++ for i in 0..channel.len(), in t_us order:
         channel.t_us[i].to_le_bytes()              # i64, 8 bytes, little-endian
         ++ channel.materialize()[i].to_le_bytes()  # f64 IEEE-754 bit pattern, 8 bytes, little-endian
)
```

`materialize()[i]` is the *physical* value (raw × scale + offset already applied, or verbatim for
`F64`) — hashing the physical value, not the raw wire representation, means two files with
identical physical inputs hash identically even if their raw storage representation changes in a
future engine version. Output: 32 raw digest bytes (not hex).

**2. Canonical config JSON** (`config_json_bytes`): serialize the derived-channel's config struct
to a `serde_json::Value`, recursively sort every JSON object's keys into ascending UTF-8 byte
order, then serialize with `serde_json::to_vec` — compact (no extra whitespace), no trailing
newline. This exact byte sequence is also what `config_json` (file metadata, above) stores as its
string value.

**3. Overall hash:**

```
hash_bytes = SHA256(
    for each input channel, sorted by channel_id in ascending UTF-8 byte order:
        column_hash(channel)              # 32 bytes each, fixed length — no ambiguity concatenating them
    ++ 0x00                                # separator
    ++ config_json_bytes
    ++ 0x00                                # separator
    ++ UTF-8 bytes of engine_version       # e.g. "0.4.2"
)
filename_hex = lowercase_hex(hash_bytes)   # 64 chars
```

File: `derived/<filename_hex>.parquet`. If the file already exists at that path, its bytes are
authoritative and a new computation is skipped (content-addressed — design doc §5's "sync keeps
whichever it has" applies here too: two engines may compute bitwise-different, equivalent files
under one key due to last-ulp CPU differences, and either is valid).

---

## 6. `session.json`

`<data>/sessions/<session_id>/session.json` — replaces `.idl0w`. Ports the fields the inventory
(§2) and design doc (§5) name — laps, track visits, lap flags, rider, bike profile snapshot — from
`app/lib/data/workspace.dart` / `session_model.dart` / `bike_profile.dart`.

```jsonc
{
  "schema_version": 1,
  "session_id": "…",                     // string, matches Session.session_id

  // --- SessionMetadata carry-forward (session_model.dart) ---
  "rider": "",                           // string, default "" ("" = not set, no null representation)
  "bike": "",                            // string
  "bike_comment": "",                    // string
  "venue_name": "",                      // string
  "event_name": "",                      // string
  "event_session": "",                   // string, e.g. "Practice 2"
  "short_comment": "",                   // string
  "long_comment": "",                    // string
  "tag": "",                             // string, free-text label

  // --- bike profile snapshot (bike_profile.dart) ---
  "bike_profile_snapshot": null,         // object | null — verbatim copy of BikeProfile.config
                                          // (the §8 device-config JSON payload) at recording time

  // --- lap gates (lap_detector.dart) — see §8 item 2 ---
  "lap_gates": [                         // array, ordered; lap_gates[0] is the active gate
    { "lat1_deg": 0.0, "lon1_deg": 0.0, "lat2_deg": 0.0, "lon2_deg": 0.0, "name": "" }
  ],
  "sector_gates": [                      // array, ordered start-to-finish
    { "name": "S1", "gate": { "lat1_deg": 0.0, "lon1_deg": 0.0, "lat2_deg": 0.0, "lon2_deg": 0.0, "name": "" } }
  ],

  // --- laps (cached, mirroring TrackVisit.laps's existing caching pattern — §8 item 3) ---
  // The importer (L2b) writes this array and "track_visits" below together,
  // keyed by the two cache-key stamps at the bottom of this document:
  // "track_visits_library_hash" and "lap_detector_version". Either stamp
  // differing from the value freshly computed at import/rescan time marks
  // the cache stale and triggers a re-index (IDL0_SPEC §17.4).
  "laps": [
    {
      "lap_number": 1,                   // int, 1-based
      "start_timestamp_ms": 0,           // i64, UTC ms
      "end_timestamp_ms": 0,             // i64, UTC ms
      "raw_elapsed_ms": 0,               // i64, ms — end - start
      "lap_time_ms": 0,                  // i64, ms — raw_elapsed_ms minus neutral-zone time
      "start_time_secs": 0.0,            // f64, seconds, recording-time (t=0 anchored)
      "end_time_secs": 0.0,              // f64, seconds
      "sectors": [],                     // array, present when sector_gates non-empty; element:
                                          //   { "name": "", "start_ms": 0, "end_ms": 0,
                                          //     "start_time_secs": 0.0, "end_time_secs": 0.0 }
                                          //   (name: string; start_ms/end_ms: i64 UTC ms;
                                          //   start_time_secs/end_time_secs: f64 seconds,
                                          //   recording-time t=0-anchored) — pinned by L2b Task 5,
                                          //   closing C3 §6 item 11
      "neutral_zone_visits": []          // array; element: { "name": "", "enter_ms": 0, "exit_ms": 0 }
                                          //   (name: string; enter_ms/exit_ms: i64 UTC ms) — pinned
                                          //   by L2b Task 5, closing C3 §6 item 11
    }
  ],

  // --- lap flags (workspace.dart v2/v3/v5) ---
  "reference_lap_number": null,          // int | omitted — null/omitted = "use fastest lap"
  "ignored_lap_numbers": [],             // int[], sorted ascending, omitted when empty
  "main_lap_number": null,               // int | omitted
  "overlay_lap_key": null,               // {"session_id": "…", "lap_number": 0} | omitted
  "starred_lap_number": null,            // int | omitted

  // --- track visits (workspace.dart v4/v7) ---
  "track_visits": [
    {
      "visit_id": "…",                   // string UUID
      "track_id": "…",                   // string UUID
      "start_timestamp_ms": 0,           // i64, UTC ms
      "end_timestamp_ms": 0,             // i64, UTC ms — always >= start_timestamp_ms
      "laps": []                         // Lap[], same shape as top-level "laps", omitted when empty
    }
  ],
  "track_visits_library_hash": null,     // string | omitted — opaque, do not parse
  "timestamp_utc_ms": null,              // i64 | omitted — ruling R194, additive: present ONLY when
                                          // "timestamp_source" is "user"; then it is the displayed and
                                          // catalogued start and overrides data.parquet §4.3's value.
                                          // Omitted for every other source: the parquet is the truth.
  "timestamp_source": null,              // "header" | "gps_backfill" | "source_file" | "user" | omitted —
                                          // ruling R194, additive: omitted = legacy file, read as the
                                          // importer's source with the parquet value; only "user" makes
                                          // a reader prefer this file. Does not bump schema_version.
  "lap_detector_version": null           // string | omitted — L2b Task 2, ruling R83 Q2, additive:
                                          // stamps `store::lap_index::LAP_DETECTOR_VERSION`; a
                                          // mismatch against the running build's constant (including
                                          // an omitted value) is stale exactly like a changed
                                          // "track_visits_library_hash"; does not bump schema_version
}
```

**What is dropped from `.idl0w`** (design doc §5's migration note, verbatim): `workbook_layout`
(dead since workspace_version 6 — math channels and chart layout now live on the `.idl1wb`
workbook, C2's domain), `videos[]` (video linking is sidelined with D9 — dropped, not migrated;
may return when reels return, per design doc §8), and any UI cursor/selection state (never lived
in `Workspace` — it was always UI-state-only per the inventory, so there is nothing to drop from
*this* file).

Units: all `*_timestamp_ms`/`*_time_ms` fields are `i64` UTC milliseconds since the Unix epoch;
`*_time_secs` fields are `f64` seconds, recording-time (`t=0`-anchored, matching `t_us / 1e6` for
the corresponding instant); `lat*_deg`/`lon*_deg` are `f64` **decimal degrees** — a deliberate
choice, confirmed and ruled 2026-09-03 (lead ruling R8, see §8 item 4): idl0's `LapGate` really
does store `×1e7` on purpose (`lap_detector.dart`'s class doc comment, and
`track_editor_modal.dart`'s explicit `* _coordScale`/`/ _coordScale` at every UI boundary, are
both correct — not a copy-paste artifact, contrary to this contract's original draft text). It
matches `crate::gps::GpsFix`'s native scale (`rust/core/src/gps.rs`: "coordinates are copied at
the raw channel-sample scale; no conversion") and `crate::laps::geometry::find_crossings`'s
crossing-detection math, already ported to Rust and already tested. That geometry is a flat-earth
line-intersection test, **scale-invariant by construction** (its own doc comment says so) — it
produces identical crossings fed decimal degrees or `×1e7`, so `×1e7` was never a math
requirement, only a zero-conversion convenience when building `GpsFix` from raw channel samples.
`session.json` is a new, human-legible file (not an internal Dart struct feeding real-time
comparison against raw bytes), so decimal degrees wins on readability with no correctness cost:
**L1 converts once at the `session.json` ⇄ `Gate`/`GpsFix` boundary** (`× 1e7` on read, `÷ 1e7` on
write), verified by a round-trip test exploiting the algorithm's own scale-invariance
(`find_crossings` on a decimal-degree gate/track must equal `find_crossings` on the same
gate/track scaled `×1e7`).

### 6.1 Time windows

*Added post-sign (2026-09-07, S1 selection lane, ruling R117).* A **time
window** names a contiguous span of one session's recorded samples. It is
the unit of selection (C3 §3.4, ruling R115) and has exactly one
representation regardless of how the user picked it:

```
Window = { session_id: string, span: Span, colour: string }
Span   = { kind: "session" }
       | { kind: "lap", lap_number: u32 }        // 1-based, matches LapSummary.lap_number
       | { kind: "range", t0_us: i64, t1_us: i64 } // session-relative, t0_us < t1_us
```

`t_us` is microseconds since the session's first sample's hardware
timestamp — the same axis as `Channel.t_us` (§3.1), `EvalOutput.t_us` and
`cursor_readout`'s `t_us`. It is *not* epoch time: absolute hardware time
stays recorded in the session's own stamps (`timestamp_utc_ms`,
`<source>_t_recorded_us`, §3.2) and a window never restates it. Resolving a
window is therefore always a read of one session plus arithmetic, and a
window is meaningless without its `session_id`.

**Resolution.** `{ kind: "session" }` resolves to the session's full recorded
span. `{ kind: "lap", n }` resolves to `laps[n].start_time_secs …
end_time_secs` converted to `t_us`; an `n` absent from `laps[]` is
`invalid_argument` with `detail: { "lap": n }` (unchanged from §6's existing
rule). `{ kind: "range" }` that overlaps the session's recorded span resolves to
the intersection — a boundary cursor dragged past the edge (decision 52)
clamps, which is legitimate. A range that does **not overlap at all** is
`invalid_argument` with
`detail: { session_id, t0_us, t1_us, session_span_us }`, **not** a
zero-width window: a resolved span is a `(t0, t1)` pair and the engine's
slicing is inclusive at `t1`, so `(T, T)` selects one sample rather than
none (ruling R119). Under per-window evaluation it fails only that window,
and §D's error presentation applies.

**Ordering and duplicates.** Windows are an *ordered list*. Two windows over
the same `session_id` with different spans are legal and are the normal
case — that is lap-to-lap comparison (R115, ruling R117 item 2); nothing may
treat a repeated `session_id` as a duplicate to collapse, and uniqueness is
on the whole window, never on `session_id` alone. Two windows that resolve
to the same span are also legal; they are not deduplicated, because the
user may want the same lap in two colours in two roles.

**`colour`** is a chart-token name (`--chart-1` … `--chart-8`), never a hex
literal — the app resolves it through `Notebook/theme/series.ts`'s
`seriesColor`, and `tokens.css` stays the only place a chart hue is written
(decision 84 picks the token in the Data tab; ruling R117 item 6).

**Deletion.** When a window's `session_id` no longer exists (a deleted
session), the window is dropped — but not silently: the Data tab states
once that a selected session was deleted (ruling R117 item 5).

Nothing about a window is written to `session.json` or to a workbook. A
window is UI selection state (ledger R41), lives only in memory, and does
not survive a restart (decision 48).

`session.json` itself is **unchanged**: `laps[]`, `main_lap_number` and the
`lap_detector_version` stamp (R83) all keep their current meaning. `Span`'s
`lap` arm reads them; it does not add to them.

---

## 7. Round-trip guarantees

L1's tests must prove, on real `.idl0` sessions (parse → write `data.parquet` → read back):

1. **Recorded stamps bit-exact.** For every source, every `<source>_t_recorded_us[i]` value read
   back equals exactly (bit-for-bit `i64`) the original per-record `timestamp_us` /
   `device_timestamp_us` captured at parse time (or the FIT/GPX-converted µs value, §3.4) —
   before any burst-seam correction.
2. **Raw counts bit-exact.** Every `Int16`/`Int32`/`Float32` column's stored raw value equals
   exactly what the binary parser produced (same LSB counts in, same LSB counts out), so
   re-applying `physical = raw × scale + offset` after the round-trip reproduces the identical
   `f64` (same IEEE arithmetic, same operation order) as before writing.
3. **`scale`/`offset` metadata preserved.** The string round-trip through Parquet KV metadata
   parses back to the exact same `f64` bit pattern for every `Int16`/`Int32`/`Float32` column.
4. **`nominal_rate_hz` preserved.** Same bit-exact string round-trip for every channel.
5. **Gaps preserved.** Every `GapSpan {start, len}` recorded at parse time is recoverable
   unchanged from the `gaps` column-metadata JSON after a round-trip — same runs, same indices
   (into the channel's own compact, post-null-drop sample sequence, §4.5).
6. **Union axis correctness.** `t` is sorted ascending with no duplicate value (§3.5); every
   channel's non-null rows, read back and filtered per §4.5's rule, reproduce its original
   `t_us` vector exactly.
7. **`F64` sign/NaN preservation.** A GPS or math channel carrying `-0.0` or `NaN` round-trips
   with the exact bit pattern (§2's `RawColumn::F64` table entry).

---

## 8. Open questions

Every item below has a stated default already adopted in the body text above (nothing here blocks
implementation) — each still needs the assigned party's confirmation before or during L1, except
item 1, which is now ruled.

1. **Ruled — see §3.3.** Gap reconciliation runs on the burst-corrected grid, not the nominal
   grid (§3.3's "Gaps — ordering, ruled" paragraph): burst-seam correction first, then
   `ImuGridPlan::build`/`reconcile` (`rust/core/src/parse/records.rs`) with the corrected period
   in place of the nominal one. This changes that existing tested function's *inputs* — per
   CLAUDE.md §2 that needed explicit sign-off before implementation, and it has been given: §3.3
   now carries the phantom-drop argument for why the alternative ordering (reconcile on the
   nominal grid, then correct) is wrong, not just asserted. No longer open.
2. **`lap_gates`/`sector_gates` inclusion in `session.json`.** The design doc's field list for
   this contract names only "laps, track visits, lap flags, rider, bike profile snapshot" — I
   included gate geometry anyway (§6) because dropping user-placed gates would lose data no other
   file stores, but the outline's list may have deliberately excluded them (e.g. if ad hoc
   per-session gates are meant to be superseded entirely by the Track entity model, §16).
   **Assigned: Isaac (lead).**
3. **Top-level `laps[]` in `session.json` is a cache**, mirroring the existing `TrackVisit.laps`
   caching pattern (workspace_version 7) rather than always being live-recomputed from
   `lap_gates` on load. **Assigned: L1.**
4. **RULED (2026-09-03, lead ruling R8) — decimal degrees, confirmed with Isaac.** Verified
   directly against `lap_detector.dart`, `track_editor_modal.dart`, `rust/core/src/gps.rs`, and
   `rust/core/src/laps/geometry.rs`: idl0's `×1e7` convention is real and deliberate, not a
   copy-paste bug — this contract's original suspicion was wrong. `session.json` keeps §6's
   decimal degrees anyway, since `find_crossings`'s geometry is scale-invariant (no correctness
   cost) and decimal degrees is more legible in a human-inspectable file; L1 converts at the
   `session.json` ⇄ `Gate`/`GpsFix` boundary. Full reasoning: §6's units paragraph, and
   `runs/2026-09-03/decisions.md` ruling R8.
5. **Naming collision risk: `t` (this contract, µs `Int64`, the Parquet storage axis) vs. the math
   language's `t` variable** (seconds, `f64`, the synthesized `Time` channel used in the design
   doc's own worked example, `deriv(fork_travel, t)`). These are two representations of the same
   instant at different units under the same short name — C1 fixes only the storage layer; C2
   must state explicitly that the math-cell `t` is `Time` (seconds), not this column, to avoid an
   implementer wiring the raw µs axis into a seconds-denominated expression. **Assigned: L3 / C2.**
6. **`<source>_t_recorded_us` redundancy for non-burst sources.** For `wheel_front`,
   `wheel_rear`, `pressure_front`, `pressure_rear`, `hr_bpm`, `hr_rr` this column is bit-identical
   to `t` on every non-null row (§3.3 — no correction ever applies to these). I kept it for
   schema uniformity (§4.1); if the extra ~8 bytes/sample × up to six always-redundant columns
   is judged not worth it at scale, these could be dropped and their `source_kind` reads `t`
   directly. **Assigned: L1**, at implementation time, informed by measured file size.
7. **Firmware explicit burst-boundary stamping** (carried forward from design doc §16's open
   items) would make §3.3 exact rather than a statistical estimate — a future `.idl0` schema
   version could have the firmware mark each burst's boundary explicitly, eliminating the need
   for the ±1 µs delta-detection heuristic entirely. Out of scope for this contract (no format
   change is being proposed here) but worth tracking. **Assigned: Isaac (lead) / firmware lane.**
8. **§3.3 validation against a real session with a known ODR offset.** Design doc §16 assigns C1
   this explicitly: "the burst-seam correction algorithm (validated against a session with a
   known ODR offset)." §3.3's worked example (this document) is synthetic — arithmetically
   verified but not evidence the algorithm recovers a *real* IMU's true ODR. Before L1 ships this
   correction: validate §3.3 on a real `.idl0` session whose true ODR is measured independently
   (GPS-anchored recording duration ÷ IMU sample count gives an independent true-rate estimate to
   compare `effective_period_us` against). **Assigned: L1** — Isaac supplies the session.

---

## 9. Synthetic sessions

**Status:** added 2026-09-13 by the synthetic lane (roadmap "Firmware", M6.3 precondition,
ruling R187). Spec-first: this section was written before the code.

### 9.1 Why, and what it is not

M6.3's rigid-body calibration (`2026-09-10-idl1-rigid-body-calibration-DRAFT.md` §5) needs a
recording whose extrinsics are *known*, and lap detection needs a recording whose lap count is
*known*. No such recording exists: the hardware that would produce one is not built. A synthetic
generator supplies both, and supplies them before the bench does.

It produces **a real `.idl0` file** — schema-3 bytes valid for `parse::parse` exactly as §5 of
`docs/IDL0_SPEC.md` defines them — and not a `data.parquet` shortcut. That is the point: a
synthetic session enters through `import`, gets a CAS blob, a catalog row, a parquet cache, laps
and charts, on the same code path a device recording would take. Every layer is exercised, and
nothing in the engine knows the session was generated.

It is **not** a model of a bicycle. It is a rigid body on a planar loop, with rigidly attached
sensors. There is no suspension travel, no tyre compliance, no rider. Anything that depends on
those is not testable against it, and a test that pretends otherwise is wrong.

### 9.2 The command

    idl-rs session synth --out <file> [--laps N] [--lap-length-m L] [--rate-hz R]
                         [--gps-hz G] [--seed S] [--noise SCALE] [--imu-count N]

`synth` is a new verb in R230's closed vocabulary. C6 §1.2's ruling requirement is satisfied by
the synthetic lane's brief (ruling R187 line), which grants it; it is recorded in
`commands::table::VERBS_RULED` as `("synth", "R187")`.

The command writes two files:

| Path | Contents |
|---|---|
| `<out>` | The `.idl0` log. |
| `<out>` with its extension replaced by `.truth.json` | The ground truth, §9.6. |

`--dry-run` reports both paths and their byte counts and writes neither (R230 item 3). The
command takes no `--data-dir`: it writes a log file, it does not touch a data directory. A
generated file is imported afterwards with `session import`, like any other log.

Flag semantics and defaults:

| Flag | Unit | Default | Meaning |
|---|---|---|---|
| `--laps` | count | 3 | Complete circuits of the loop. Lap 1 begins at `t = 0`. |
| `--lap-length-m` | m | 400 | Loop perimeter. The loop is scaled to hit it exactly. |
| `--rate-hz` | Hz | 800 | IMU output data rate, every IMU, every axis. |
| `--gps-hz` | Hz | 5 | GPS fix rate. 1 and 5 are the rates §9.5 documents; any positive integer is accepted. |
| `--seed` | — | 1 | PRNG seed. The same seed and the same flags give byte-identical output. |
| `--noise` | — | 1.0 | Scales every noise σ in §9.4 together. `0` gives a noiseless recording. |
| `--imu-count` | count | 3 | 1, 2 or 3. Sensors are added in the §9.4 order, so `--imu-count 2` is the hardtail case (`IMU0` on the frame, `IMU1` on the fork) the calibration spec's §5 also asks for. |
| `--protocol` | — | `loop` | `loop` rides the §9.3 circuit. `calibration` replaces it with the two-body steering-hinge manoeuvre of §9.9. |

### 9.3 Track and motion

**Loop.** A planar ellipse in a local east/north metre frame centred on the origin, with a fixed
axis ratio `b/a = 0.5`, scaled so its perimeter equals `--lap-length-m`. An ellipse, not a
circle, because a circle's curvature is constant: the yaw rate would never change, and the
lever-arm term the calibration fit depends on would be a constant the fit could not separate
from a bias.

Parametric, in the loop parameter `u` over `[0, 2π)`:

    east(u)  = a·cos u        north(u) = b·sin u        (b = a/2)

Arc length `s(u)` is built once as a table over 4096 equal-`u` steps, trapezoid-integrated, and
inverted by linear interpolation. The table's step count is part of the format: changing it
changes the bytes.

**Speed.** A lateral-acceleration limit, not a fixed profile:

    v(u) = min(v_max, sqrt(a_lat_max / κ(u)))

with `v_max = 12 m/s` and `a_lat_max = 6 m/s²`, `κ(u)` the ellipse's own curvature. This slows
the body in the tight ends and lets it run at `v_max` down the flanks, which is what a rider
does and, more to the point, what makes tangential acceleration non-zero. Time along the loop is
`t(s)`, the running integral of `ds / v` on the same table.

**Attitude.** Yaw `ψ(u)` is the path tangent's heading. Roll and pitch are *imposed*, not
derived from a bank model:

    roll(t)  = 0.15 rad · sin(2π · 0.37 Hz · t)
    pitch(t) = 0.08 rad · sin(2π · 0.23 Hz · t + 1.0 rad)

Two irrational-ratio frequencies so the three body rates stay linearly independent over any
window — §2.4 of the calibration draft calls the alternative a degeneracy, and a synthetic
session that reproduces the degeneracy is useless for validating the fit. Sign conventions are
SPEC §9's ISO 8855 (X forward, Y left, Z up; positive yaw turns left).

**Body rates.** `ω_body(t)` is the body-frame angular velocity of that attitude sequence,
evaluated analytically from the yaw, pitch and roll rates through the ZYX Euler rate transform.
`ω̇_body` is a centred finite difference of `ω_body` on the sample grid (forward/backward at the
two ends).

### 9.4 Sensors

Three IMUs, in this order, with extrinsics fixed in the generator and copied verbatim into the
truth file. `R_i` rotates a body-frame vector into sensor `i`'s frame; `r_i` is the sensor's
position in the body frame, in metres.

| i | Role | Euler ZYX (deg, yaw/pitch/roll) | `r_i` (m, X fwd / Y left / Z up) |
|---|---|---|---|
| 0 | Frame | 0, 0, 0 | 0.000, 0.000, 0.000 |
| 1 | Fork (unsprung, front) | 5, −12, 3 | 0.640, 0.000, −0.180 |
| 2 | Rear (unsprung, rear) | −7, 4, −9 | −0.430, 0.020, −0.260 |

IMU 0 is the body frame by construction, so a fit that recovers `R_1` and `R_2` is recovering a
*relative* rotation with a known answer, which is what the calibration actually solves.

Per sensor, before quantisation:

    gyro_i(t)  = R_i · ω_body(t) + b_g,i + n_g,i(t)
    accel_i(t) = R_i · ( f_body(t) + ω̇×r_i + ω×(ω×r_i) ) + b_a,i + n_a,i(t)

`f_body` is **specific force**, not acceleration: the world-frame acceleration plus the upward
gravity vector, rotated into the body frame, with `g = 9.80665 m/s²`. That is the sign
convention SPEC §9 states for the LSM6DSO32 (stationary and upright gives `accel_z ≈ +1 g`).

Biases are fixed constants per sensor, listed in the truth file. Noise is white, zero-mean, with
σ scaled by `--noise`:

| Quantity | σ at `--noise 1.0` |
|---|---|
| Gyro, per axis | 0.003 rad/s (≈ 0.172 dps) |
| Accel, per axis | 0.05 m/s² (≈ 0.0051 g) |

These are the `reference_default()` figures the calibration draft §5 quotes, so the acceptance
thresholds in its table apply to this generator's output unchanged.

**Quantisation.** Each axis is converted to LSB counts with the registry's own scale and stored
as `i16`, saturating at ±32767: accel range ±32 g (`scale = 32/32768` g/LSB), gyro range
±2000 dps (`scale = 2000/32768` dps/LSB). Saturation is a real outcome, not an error — the
calibration draft asks for a clipping case, and a large enough `--noise` will produce one. The
truth file counts the clipped samples per sensor so a test can assert on it either way.

### 9.5 Wire encoding

**Header** (SPEC §5.1): magic `IDL0`, schema 3, a session UUID and device id derived from the
seed and the configuration (so two different configurations never collide, and the same one
always reproduces), `Session start UTC` = `1767225600000` (2026-01-01T00:00:00Z, a fixed
literal — never the wall clock), config CRC32 over the generator's own configuration JSON, the
IMU channel mask `0x3F` / `0xFFF` / `0x3FFFF` for 1 / 2 / 3 IMUs, `--rate-hz`, `--gps-hz`, and
one 40-byte registry entry per enabled axis in SPEC §5.2's canonical id order.

**Records**, emitted in non-decreasing `timestamp_us` order: `IMU_SAMPLE` (0x01) at `--rate-hz`
per IMU, `GPS_FIX` (0x02) at `--gps-hz`, a final `SESSION_END` (0xFF). `timestamp_us` starts at
a fixed non-zero device-boot offset (`4000000 µs`) so the back-fill arithmetic in SPEC §5.6 is
exercised rather than trivially satisfied by a zero. No `CHANNEL_SAMPLE` records: the generator
models a rigid body, and wheel-speed and pressure channels would be fiction with no ground truth
behind them.

**GPS fields — the M10 gap.** `docs/HARDWARE_M10_SETUP.md` §3 asks for four more fields per fix
(`sAcc`, `velD`, `odo_distance`, `odo_distance_std`). SPEC §5.6's `GPS_FIX` payload is a fixed
32 bytes with every byte assigned, so **there is no room for them**, and adding them is a wire
format change (payload length, importer, schema-version bump) that this lane does not own. The
generator therefore **emits the legacy 32-byte `GPS_FIX` record**, per the lane's ruling 2.

Consequences, stated so no one has to rediscover them:

- The inverse-variance distance weighting that `sAcc` exists to enable **cannot be tested
  against a synthetic session today.** Distance work validated here is validated against
  unweighted integration only.
- `speed` in the record is the body's **2D ground speed** (`km/h × 100`), matching `gSpeed`, and
  the vertical component is not recorded. The loop is planar, so `velD` would be zero anyway,
  but a non-planar loop would lose real information.
- The truth file (§9.6) carries the per-fix speed accuracy and the exact cumulative distance
  regardless, so the moment §5.6 gains the fields the generator can emit them and its existing
  ground truth already says what they should be.
- The alternative — carrying the four fields as registry `CHANNEL_SAMPLE` channels, which SPEC
  §5.2 permits without a format change — was **not** taken. It would invent four channel names
  no importer, chart or contract knows, in a lane that owns none of them.

Latitude and longitude are a local flat-earth projection about a fixed origin
(51.5° N, −1.5° E), `deg = m / 111320` in north and `deg = m / (111320 · cos φ₀)` in east with
`cos φ₀` a fixed literal. Over a 400 m loop the projection error is far below the `1e-7`-degree
storage resolution, and the truth file states the origin and both scale factors so a consumer
can invert it exactly. Altitude is a constant 100.0 m. `fix_quality` is 1 and `satellites` is 12
on every fix. `gps_epoch_ms` is the header start plus the fix's own session time.

### 9.6 The truth file

`<out>` with its extension replaced by `.truth.json`. UTF-8, `\n` line endings, pretty-printed
with a trailing newline, keys in a fixed order. Not a contract for any app code to read — it is
a test fixture, consumed by core's own tests and by M6.3's validation.

    {
      "schema_version": 1,
      "generator_version": "<synth::SYNTH_VERSION>",
      "config": { every flag's resolved value, including the defaults },
      "session": {
        "session_id": "<32 hex>", "device_id": "<12 hex>",
        "start_utc_ms": 1767225600000, "device_t0_us": 4000000,
        "imu_rate_hz": 800, "gps_rate_hz": 5,
        "imu_sample_count": <per IMU>, "gps_fix_count": <n>,
        "duration_s": <f64>
      },
      "loop": {
        "semi_major_m": <f64>, "semi_minor_m": <f64>, "perimeter_m": <f64>,
        "origin_lat_deg": 51.5, "origin_lon_deg": -1.5,
        "metres_per_deg_north": <f64>, "metres_per_deg_east": <f64>,
        "gate": { "east_m": <f64>, "north_m": <f64>,
                  "normal_east": <f64>, "normal_north": <f64> }
      },
      "laps": [ { "index": 1, "start_s": 0.0, "end_s": <f64>,
                  "start_utc_ms": <i64>, "end_utc_ms": <i64>,
                  "duration_s": <f64>, "distance_m": <f64> } ],
      "sensors": [ { "index": 0, "role": "frame",
                     "euler_zyx_deg": [<yaw>, <pitch>, <roll>],
                     "rotation_body_to_sensor": [[...],[...],[...]],
                     "lever_arm_m": [<x>, <y>, <z>],
                     "gyro_bias_rad_s": [...], "accel_bias_m_s2": [...],
                     "accel_scale_g_per_lsb": <f64>, "gyro_scale_dps_per_lsb": <f64>,
                     "clipped_sample_count": <n> } ],
      "noise": { "scale": 1.0, "gyro_sigma_rad_s": 0.003, "accel_sigma_m_s2": 0.05,
                 "distribution": "irwin-hall-12" },
      "gps": { "speed_accuracy_mm_s": <f64>, "total_distance_m": <f64>,
               "fields_omitted": ["sAcc", "velD", "odo_distance", "odo_distance_std"] }
    }

**Compared as text, not as a struct.** `serde_json`'s float *writer* is exact (it emits the
shortest string that reads back as the same `f64`), but its *reader* can land one unit in the
last place away from the value that string names. A consumer that deserialises this file and
compares it field-for-field against a freshly generated `Truth` will therefore see spurious
last-digit differences on the `f64` fields. The generator's own fixture test avoids that by
comparing the *serialised text*, and so should anything else that wants an exactness check.
The rendered numbers are still correct to ~1e-16 relative, so any tolerance-based comparison is
unaffected.

**Laps** are by construction, not by detection: lap `k` spans the loop parameter's `k`-th full
circuit, and `start_s` / `end_s` are the exact times the arc-length table gives at those arc
lengths. The gate is the line through the loop point at `u = 0`, normal to the tangent there —
the same gate a lap detector would be handed, so a detector's answer and the truth's answer are
comparable numbers and the detector can be *scored*, not merely smoke-tested.

### 9.9 The calibration protocol

`--protocol calibration` generates the manoeuvre the rigid-body calibration spec
(`docs/superpowers/specs/2026-09-10-idl1-rigid-body-calibration.md` §5.1) is written
against, in place of §9.3's loop. `--laps` and `--lap-length-m` are ignored: the duration is
fixed at 10 s of stationary hold, 33 s of tumble and 12 s of bar turn, 55 s in all, and the
lap table in the truth file is **empty** rather than fictional. Every GPS fix sits on the
projection origin at zero speed — the machine is held in the air and goes nowhere — but the
records are still written, because a real recording would have them and an importer that only
ever saw GPS-free synthetic logs would be untested.

**Two bodies.** `IMU1` (the fork sensor, `IDL0_SPEC.md` §3.2) rides body **F**; every other
sensor rides body **R**. They are joined by a steering hinge whose axis is the reference bike's
63.5° head angle. Body R's attitude is a sum of two incommensurate sinusoids per Euler axis,
ramped in from the hold by a `C²` smoothstep, giving a median `‖ω_R‖` near 3 rad/s and a rate
scatter condition number under 3 — clear of both §3 gates of the calibration spec. The steer
angle is zero, value **and** rate, through the hold and the tumble, which is what makes the
datum a datum; over the bar turn it sweeps ±0.75 rad.

Body F's rate is the calibration spec's equation (4) inverted, `ω_F = C(δ)ᵀ(ω_R + δ̇ s)`. The
specific force at its origin is the full moving-frame transport of body R's — rigid terms plus
the relative acceleration **and the Coriolis term** — because the F origin moves within the R
frame whenever the bars turn. `IMU1`'s lever arm within body F is zero by the spec's `r₁ ≡ 0`
convention, so the front sensor's position appears only as the hinge point and the hinge-to-F-
origin offset in the truth file.

**Noise.** `GYRO_SIGMA_RAD_S` and `ACCEL_SIGMA_M_S2` are **per-sample** σ, while the
calibration spec's 0.003 and 0.05 are angle- and velocity-random-walk coefficients. A test
validating that spec's §5 thresholds must pass `--noise √ODR` (28.8617 at 833 Hz), or the
synthetic body is 29× quieter than the acceptance arithmetic assumes.

**Truth.** The `hinge` block of §9.6 is present under this protocol and absent under `loop`.
It carries the sensor-to-body assignment, the steering axis and hinge point in the R frame,
the hinge-to-F-origin offset in the F frame, `C₀` (the identity gauge), the peak-to-peak steer
angle, and the three segment windows in seconds — the boundaries a solver is expected to
rediscover from the data alone. The block is strictly additive, so `schema_version` stands at
1, and `--protocol` is omitted from the serialised `config` when it is the default, so every
configuration writable before this protocol existed still produces the same bytes down to the
session UUID and `SYNTH_VERSION` does not move.

### 9.7 Determinism

"Deterministic" here means: **the same flags produce the same bytes on every platform, every
build and every run.** Consumers commit generated fixtures and diff them; a generator that
drifted by one LSB between Windows and Linux would make that worthless.

Three rules make it true, and all three are testable:

1. **No libm.** `sin`, `cos` and `atan2` are the generator's own polynomial implementations
   (`synth::dtrig`), built from add, subtract, multiply, divide and comparisons only. Those
   operations are exactly-rounded by IEEE-754 and identical on every target; the platform's
   `sin` is not, since its last-ULP result is unspecified. `sqrt` *is* exactly-rounded by
   IEEE-754 and is used directly. `dtrig`'s own tests assert agreement with `std` to 1e-12,
   which bounds the error without inheriting the variability.
2. **No RNG from the system, and no logarithm.** The PRNG is a fixed-constant PCG32 seeded from
   `--seed`. Gaussian noise is the Irwin–Hall sum of 12 uniforms, which needs no logarithm and
   so no libm. It is an approximation to a normal, documented as such in the truth file's
   `noise.distribution`, and indistinguishable from one at the σ this generator uses.
3. **No clock, no filesystem, no environment.** Every timestamp is derived from the fixed
   `start_utc_ms` literal. `synth::generate` is pure: it returns bytes and truth, and the CLI is
   the only thing that writes.

Rust does not enable floating-point contraction, so a multiply-add is not fused on one target
and split on another.

### 9.8 The committed fixture

`rust/core/tests/fixtures/synth-3lap.idl0` and `synth-3lap.truth.json`, generated by
`SynthConfig::fixture()` and committed, for any lane that needs a session with known answers
without running the generator. It is deliberately small — 3 laps of a 120 m loop with all three
IMUs at 25 Hz, under 200 KB — which makes it useless for anything spectral and entirely adequate
for lap detection, importer round-trips and catalog work. `rust/.gitattributes` marks the `.idl0` as binary and pins the truth JSON to LF, because this
checkout has `core.autocrlf` on and a line-ending translation would fail the byte comparison on
Windows and nowhere else. A core test regenerates it and asserts
byte equality with the committed file; that test failing means either the generator changed (bump
`SYNTH_VERSION` and re-commit) or determinism broke, which is a real bug.

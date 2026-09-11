# Measurement: session decode timing (ruling R221 item 2, "measure the 2 minutes")

Isaac's report: "the 3-hour session loaded in 2 minutes and didn't crash ... it went
silent for 2 minutes though". These are the numbers behind that silence.

## How

A throwaway `#[ignore]`d harness in `idl-rs-tauri`, **release** build, driving
`SessionCache::channel` once per stored channel on a **copy** of the largest session
in the library (`817a5492abae5d864d2826f57a197afc`, `data.parquet` 516 581 006 B,
28 stored channels, ~3 h at 780-810 Hz on three IMUs plus 1 Hz GPS/HR). The copy
lived in the session scratchpad; the library was read once, to copy, and never
written. The harness was deleted after the run — it is not in the diff.

## Numbers (ms, release, cold cache)

| Channel group | Nominal rate | Cold decode, each |
|---|---|---|
| `IMU0/1/2_{Accel,Gyro}{X,Y,Z}` (18 channels) | 789-812 Hz | 1589 - 2901 |
| `HR_BPM`, `HR_RR` | 1 Hz / irregular | 1164 - 1218 |
| `GPS_*` (8 channels) | 1 Hz | 754 - 1156 |
| `Time` (synthesized) | - | 2488 |
| `Distance` (synthesized) | - | 3746 |

- **All 28 stored channels, cold: 44 420 ms.** Two synthesized channels add 6234 ms.
- **Cache hit: 0 ms** for every channel. The `SessionCache` is doing its job.
- **Second cold pass on a fresh cache, OS page cache now warm: 38 563 ms** — 13 %
  faster than the first. So this is **not** disk.

## Where the cost is

It is **parquet decompression, paid once per channel over the whole file** — not the
union time axis, and not repeated decodes of the same channel (the cache returns in
0 ms, so there is no repeated-decode bug to fix).

The evidence is the 1 Hz channels. A `GPS_*` channel over three hours holds roughly
ten thousand samples and still costs 0.75 - 1.2 s, within a factor of two of an
800 Hz IMU channel holding eight million. Cost tracks the **file**, not the channel.
`read_channel_with_progress` calls `read_channel_index` and then reads a two-column
projection — the channel plus its `<source>_t_recorded_us` companion — across every
row group of a 516 MB file, for each channel asked for. Twenty-eight channels means
twenty-eight full-file passes, and every channel of one `source_kind` decompresses
that source's recorded-time column again from scratch.

## What this means for the 2 minutes

A notebook binding nine channels spends roughly 9 x 1.6 s = 15 s in release, and
the app is not a release build during development. The observed 2 minutes is
consistent with this cost paid serially with no progress reported — which is
exactly what R221 item 1 now fixes at the feedback level.

## Not optimised here (per the brief: "do not optimise beyond an obvious
repeated-decode bug")

There is no repeated-decode bug. There is a **shared-column** one: the
`<source>_t_recorded_us` column is decompressed once per channel of that source
rather than once per source. Six IMU0 channels pay for the IMU0 recorded axis six
times. Caching decoded recorded-time columns per `(session, source_kind)`, or
projecting several requested channels of one source in a single pass, would cut a
notebook-wide open substantially. **This needs a ruling** — it changes
`core/src/store/parquet.rs`'s read shape and the cache's key/eviction accounting,
both outside this lane.

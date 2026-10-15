# DRAFT — The `.idl1` session file format and IMU timing

**Status:** draft for Isaac's review, 2026-10-15. Nothing here is built.
Each section says what is **decided** (Isaac said so), what is **proposed**
(mine, needs a yes), and what is **open**.

## 1. Decided

- IDL1 hardware writes **`.idl1`** files with their own format and their own
  parser in idl-rs (Isaac, 2026-10-15: "this ground up hardware design can
  have a ground up schema and parser"). `.idl0` schema 3 is frozen and stays
  working for IDL0 boards and every existing log. Neither format changes the
  other.
- IMU timing comes from the chips' own clocks: FIFO timestamp words every 32
  samples (`DEC_32`), plus one read of the chip's timestamp register per FIFO
  drain to tie each chip's clock to the ESP32's. The firmware records raw
  facts; the parser does the maths.
- Logging efficiency is rule one: the firmware does as little per sample as
  possible, so sample rates can go as high as the hardware allows.
- Any subset of an IMU's axes can be recorded; all six is the default, the
  realistic case (Isaac, 2026-10-15).
- Low-g and high-g are the same data type; the registry only says which
  path a channel is, so the importer can merge them (Isaac, 2026-10-15).
- The channel-id ranges of §4.2 (Isaac, 2026-10-15: "gotta pick
  something").
- Logger diagnostics go inside each `.idl1` file, written as issues happen
  (Isaac, 2026-10-15: "willing to sacrifice a little logging effort to
  accurately capture issues, which should hopefully be rare"). This relaxes
  the firmware's "raw capture only" rule for these records. See §4.3.
- GPS_FIX carries HDOP (Isaac, 2026-10-15).
- Slow channels (wheel pulses, HR, analog, markers) keep their per-sample
  timestamps in CHANNEL_SAMPLE: they are real measurements (Isaac,
  2026-10-15).

## 2. Why: what limits `.idl0` timing today

The firmware drains each IMU's FIFO every ~20 ms, reads `esp_timer` once,
stamps the newest sample with that instant and walks back at the nominal
period (SPEC §5.5). The parser then estimates each IMU's real rate as a
session-wide median and re-spaces every burst at it (C1 §3.3). Three errors
remain:

1. **Read-instant error.** The newest sample was produced somewhere in the
   period before the read, so every burst's anchor is off by 0 to 1 period
   (0–2 ms at 480 Hz, about 0.6 ms RMS). Re-anchoring per burst keeps this
   sawtooth in the timeline. This is the ~1 ms jitter seen so far.
2. **Hidden drops.** An overrun discards the oldest FIFO samples, and the
   walk-back can't see it inside a burst. Frequent drops bias the median
   rate.
3. **One rate per session.** Oscillator drift with temperature isn't
   tracked, and each IMU is corrected on its own, so frame-to-pod alignment
   carries both IMUs' errors.

The per-sample timestamps in `IMU_SAMPLE` are not measurements: all but the
newest in each burst are computed. They cost 8 of every 24 bytes written.

## 3. Proposed: timing model

**Clocks.** Each LSM6DSV320X has one oscillator that drives both its sample
rate and its timestamp counter. ST's driver confirms it: `INTERNAL_FREQ_FINE`
is the "difference in percentage of the effective ODR (and timestamp rate)
with respect to the typical", step 0.13 %. The nominal tick (≈21.75 µs) is
from memory and isn't in the driver; the parser doesn't need it, because it
fits chip ticks straight to ESP32 µs. The ESP32's `esp_timer` (crystal, ~±10–20 ppm) is the master clock.
GPS ties the master clock to UTC, as today (SPEC §5.6).

**What the firmware records, per IMU per drain:**

- `read_us`: `esp_timer` at the drain.
- `read_chip_ts`: the chip's TIMESTAMP register (4 bytes, 0x40–0x43), read
  in the same drain. One pair per drain ties chip time to ESP32 time to
  within one bus transaction (tens of µs on SPI, ~125 µs on the 400 kHz I²C
  bus): a near-constant offset, not a sawtooth.
- The samples, in FIFO order, and each FIFO timestamp word with its position
  (which sample it follows).

**Reads don't need to line up with timestamp words.** The firmware drains
each FIFO every 20 ms (`IMU_POLL_MS`) and takes whatever is there: about 10
samples per read at 480 Hz, so a timestamp word lands every third read or
so; ~38 per read at 1920 Hz. Read boundaries play no part in the maths: every
read brings its own clock pair, and the timestamp words fix which samples
sit between them wherever the reads fell. Samples after a session's last
timestamp word are placed with the fitted chip rate. The FIFO holds ~266 ms
at 480 Hz low-g plus 960 Hz high-g, so there's no reason to wait for fuller
reads.

**What the parser computes, per IMU:**

1. **Chip → ESP32 clock map:** a robust linear fit (offset and rate) over the
   `(read_chip_ts, read_us)` pairs, in sliding windows so temperature drift is
   followed. Starting point: Theil–Sen over 10 s windows. This is a parser
   setting, tuned from bench data and changeable without touching firmware
   (the file holds raw facts), so it isn't a format decision.
2. **Sample chip times:** samples between two timestamp words are evenly
   spaced in chip time (same oscillator). With the expected 32 samples
   between words the spacing is exact; with fewer, the window lost samples
   and is marked a gap (count exact, placement within the 32-sample window
   linear-filled, as today's gap handling does).
3. **Sample times** = the clock map applied to the sample chip times.
4. **High-g samples** sit between timestamp words in FIFO order, at the
   high-g rate (an exact multiple or fraction of the low-g rate on the
   power-of-two ladder, same oscillator). Checked in ST's driver
   (`lsm6dsv320x_reg.h`): timestamp words are written at "the maximum rate
   between XL and GYRO BDR divided by decimation", so high-g never changes
   the 32-count, and the high-g samples are placed by FIFO order and the
   high-g rate.

**High-g is recorded continuously while it is on.** The chip delivers every
high-g triplet over the bus whether or not the file keeps it, so gating only
saves SD space. Continuous recording also gives the importer stretches where
low-g and high-g both read in range, which it needs to match their scales
before merging. Checked in ST's driver: the chip has no way to batch
high-g only while the low-g saturates. Its high-g extras are a wake-up
threshold interrupt, peak tracking (one peak value into the FIFO; P1
rejected it) and a batch-count interrupt, none of which gate the stream.

**Expected result:** tens of µs end to end and better between IMUs on one
board; drops counted exactly; drift followed; no sawtooth.

**Bus cost, low-g + gyro at 480 Hz (≈960 FIFO words/s per IMU):**

| | Extra words | Bus overhead |
|---|---|---|
| Timestamp words, `DEC_32` | 15/s | ~1.6 % |
| Timestamp register read per drain | 50 × 4 bytes/s | < 1 % |

## 4. Proposed: file layout

All integers little-endian. The `[type:u8][len:u16][payload]` record framing
is kept from `.idl0`: unknown record types are skipped by length, so the
format can grow without breaking older parsers.

### 4.1 Header

| Field | Type | Notes |
|---|---|---|
| magic | u8[4] | `IDL1` |
| format_version | u16 | 1. A parser refuses a major version it doesn't know. |
| header_len | u32 | Total header bytes, so fields can be appended later; a parser skips what it doesn't know. |
| session_uuid | u8[16] | as `.idl0` |
| device_id | u8[6] | as `.idl0` |
| firmware_version | u8[24] | NUL-terminated, e.g. `0.3.0` (new: no more guessing which firmware wrote a file) |
| session_start_utc_ms | i64 | 0 until the first GPS fix, as `.idl0` |
| config_crc32 | u32 | as `.idl0` |
| imu_freq_fine | i8[3] | each chip's `INTERNAL_FREQ_FINE` at init: a cross-check on the fitted rate |
| registry_count | u16 | |
| registry | entry[] | §4.2 |
| header_crc32 | u32 | over every header byte before it |

Removed against `.idl0`: `imu_count` (A8), the IMU channel mask (the
registry says which IMUs record), the header IMU and GPS rates (in the
registry), the `0xDEADBEEF` end marker (`header_len` + CRC replace it).

### 4.2 Channel registry entry (52 bytes)

| Field | Type | Notes |
|---|---|---|
| channel_id | u16 | |
| data_type | u8 | as `.idl0` (0 = u8 … 7 = f64). Every IMU axis, low-g or high-g, is 4 (i16). |
| kind | u8 | 0 generic, 1 IMU axis, 2 GPS |
| source | u8 | IMU index for kind 1, else 0 |
| axis | u8 | kind 1: 0–2 accel X/Y/Z, 3–5 gyro X/Y/Z |
| path | u8 | kind 1: 0 low-g/gyro, 1 high-g. The importer merges an accel axis's two paths into one channel. |
| reserved | u8 | 0 |
| rate_mhz | u32 | sample rate in milli-hertz (0 = event-driven); not limited to integers |
| scale | f32 | physical = raw × scale + offset |
| offset | f32 | |
| name | u8[24] | NUL-terminated. **The same names as today** (`IMU0_AccelX`, `IMU1_HgAccelX`, `WheelFront` …), so workbooks keep working. |
| units | u8[6] | |

Only recorded axes get an entry, as in `.idl0`. An IMU's recorded axes, in
axis order, set the layout of its samples in IMU_BLOCK (§4.4).

**Channel id ranges** (decided; a clean start, since nothing is recorded yet):

| Ids | Channels |
|---|---|
| 0–17 | low-g/gyro axes, IMU0–IMU2 (as today) |
| 18–26 | high-g X/Y/Z, IMU0–IMU2 |
| 32–47 | fixed board inputs: wheels, the TLA2528 pressures, HR BPM and RR |
| 64+ | user-added analog and digital channels, assigned per session |

### 4.3 Records

| Type | Name | Payload |
|---|---|---|
| 0x10 | IMU_BLOCK | one IMU's drain (§4.4) |
| 0x02 | GPS_FIX | as `.idl0` §5.6, plus `hdop_x100:u16` (decided) |
| 0x03 | CHANNEL_SAMPLE | as `.idl0` §5.7, with a u16 `channel_id` |
| 0x20 | LOGGER_EVENT | written when an issue happens: event code, IMU or channel, count since the last event of that code (FIFO overrun, writer-ring drop, bus error, IMU dropped out or recovered) |
| 0x21 | SESSION_SUMMARY | written just before SESSION_END: per IMU, FIFO overruns, bus errors, samples written; writer-ring drops; slowest poll cycle |
| 0xFF | SESSION_END | empty, as `.idl0` |

**LOGGER_EVENT payload** (15 bytes): `code:u8`, `source:u16` (IMU index or
channel id), `count:u32` (occurrences since the last event of this code),
`timestamp_us:i64` (`esp_timer`). Codes: 1 FIFO overrun, 2 writer buffer
full (data dropped), 3 bus error, 4 IMU stopped answering, 5 IMU recovered.

**SESSION_SUMMARY payload:** `n_imu:u8`, then per IMU `overruns:u32`,
`bus_errors:u32`, `samples:u32`, then `writer_drops:u32`,
`slowest_cycle_us:u32`.

**Diagnostics** (decided). Issues are written as they happen, as
LOGGER_EVENT records, and the totals once more in SESSION_SUMMARY at the
end. Each IMU_BLOCK also carries a free overrun bit. Events are rate-limited
per code (at most one per code per second, carrying the count since the
last), so a burst of trouble can't flood the writer it is reporting on.
Proposed: the rate limit of one per code per second.

### 4.4 IMU_BLOCK (0x10)

One record per IMU per drain, written as the firmware drains:

| Field | Type | Notes |
|---|---|---|
| imu_index | u8 | |
| flags | u8 | bit 0: FIFO overrun latched this drain |
| read_us | i64 | `esp_timer` at the drain |
| read_chip_ts | u32 | chip TIMESTAMP register, same drain |
| n_samples | u16 | low-g/gyro samples that follow |
| n_hg | u16 | high-g samples that follow |
| n_ts | u8 | FIFO timestamp words that follow |
| samples | n_samples × 2 × (recorded low-g/gyro axes) | raw i16, axis order; 12 bytes with all six |
| hg | n_hg × 2 × (recorded high-g axes) | raw i16, X/Y/Z order; 6 bytes with all three |
| ts | n_ts × 8 | `after_sample:u16`, `after_hg:u16`, `chip_ts:u32`: the word's FIFO position and value |

**Timestamp words.** `after_sample` is how many of this block's low-g
samples come before the word in the FIFO; the word's `chip_ts` is the time
of the next low-g sample (index `after_sample`). `after_hg` likewise for the
high-g stream. Which sample a word stamps (the one after it, or the one
before) is to be confirmed at bring-up; getting it wrong shifts an IMU by
one sample period, the same for every IMU, and the tap test would show it.

**Lost samples.** A window between two words that received fewer samples
than its tick span holds lost the difference. The parser counts them
exactly, fills them linearly and lists them as a gap, placed at the start of
the window. A later refinement can place them at the read boundary inside
the window, since an overrun loses samples between reads.

Header overhead is 19 bytes per drain. At 480 Hz that's ~10 samples per drain,
so ~14 bytes per low-g sample against 24 in `.idl0`.

**Axes.** The chip delivers whole triplets (accel, gyro, high-g), so a
skipped axis saves SD space, not bus time. With every axis recorded the
firmware copies samples straight through; with a subset it packs the chosen
axes, a few extra instructions per sample.

**Firmware work per drain:** one burst read (as today), one 4-byte register
read, a pass that sorts FIFO words into samples, high-g and timestamps, and
one writer submit. No per-sample timestamp arithmetic.

## 5. Write rates, a worked example

Three IMUs at 480 Hz, both pods' high-g at 960 Hz:

| | `.idl0` today | `.idl1` |
|---|---|---|
| Low-g/gyro | ~35 KB/s | ~20 KB/s |
| High-g (2 pods) | ~81 KB/s as currently designed (0x03 per axis) | ~12 KB/s |
| Timing | (computed timestamps) | ~0.4 KB/s (block headers' clock fields + `DEC_32` words) |

## 6. What changes where

- **Firmware:**
  - enable FIFO timestamp batching (`DEC_32`) and the timestamp counter;
  - read `FREQ_FINE` at init and the TIMESTAMP register per drain;
  - write IMU_BLOCK;
  - new header and registry writer;
  - session files named `….idl1`;
  - WiFi listing and BLE recent-files serve both extensions.
- **idl-rs core:**
  - a new `parse::idl1` module, separate from the `.idl0` readers;
  - import detection by magic;
  - the timing model of §3 as pure, tested functions.

  Output is the same C1 `Channel` model.
- **idl-rs transport and app:** file listing and download accept `.idl1`.
- **Contracts:**
  - SPEC: a new `.idl1` section beside §5;
  - C1: a timing section for `.idl1` sources (what `t_recorded_us` means
    when times come from the chip);
  - C4: `.idl1` blobs.
- **Order:** the app's parser ships before any firmware writes `.idl1`. An
  older app sees an unknown file type and ignores it; it never misreads
  one.

## 7. Bench validation (new logger)

1. Rigid-block tap test: all three IMUs on one block. Cross-correlate the
   impulses; target < 50 µs between IMUs.
2. Max-rate runs (one IMU at 3840/7680 Hz; all three at 1920 Hz with high-g):
   drops counted from timestamp gaps, writer drops from SESSION_SUMMARY. This is
   also the samples/s limit for the load meter.
3. Warm-up run (heat gun or a hot day): the clock map follows the drift.
4. The timing audit script, run on `.idl1` logs.

## 8. Open questions for Isaac

None left: every question so far is answered (§1). Still Isaac's to read
and approve before anything is built: the proposed header fields (§4.1),
the registry entry layout (§4.2), IMU_BLOCK (§4.4) and the diagnostics rate
limit (§4.3).

**Claude's checks:** done (§3), from ST's driver. The nominal timestamp tick
stays unconfirmed; nothing depends on it.

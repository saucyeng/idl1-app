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
rate and its timestamp counter (≈21.75 µs per tick nominal; datasheet to
confirm). The ESP32's `esp_timer` (crystal, ~±10–20 ppm) is the master clock.
GPS ties the master clock to UTC, as today (SPEC §5.6).

**What the firmware records, per IMU per drain:**

- `read_us`: `esp_timer` at the drain.
- `read_chip_ts`: the chip's TIMESTAMP register (4 bytes, 0x40–0x43), read
  in the same drain. One pair per drain ties chip time to ESP32 time to
  within one bus transaction (tens of µs on SPI, ~125 µs on the 400 kHz I²C
  bus): a near-constant offset, not a sawtooth.
- The samples, in FIFO order, and each FIFO timestamp word with its position
  (which sample it follows).

**What the parser computes, per IMU:**

1. **Chip → ESP32 clock map:** a robust linear fit (offset and rate) over the
   `(read_chip_ts, read_us)` pairs, in sliding windows so temperature drift is
   followed. Proposed: Theil–Sen over 10 s windows (open: window length).
2. **Sample chip times:** samples between two timestamp words are evenly
   spaced in chip time (same oscillator). With the expected 32 samples
   between words the spacing is exact; with fewer, the window lost samples
   and is marked a gap (count exact, placement within the 32-sample window
   linear-filled, as today's gap handling does).
3. **Sample times** = the clock map applied to the sample chip times.
4. **High-g samples** sit between timestamp words in FIFO order, at the
   high-g rate (an exact multiple or fraction of the low-g rate on the
   power-of-two ladder, same oscillator). Open: confirm in the datasheet how
   `DEC_32` counts when high-g is on (high-g has no BDR of its own).

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

### 4.2 Channel registry entry (48 bytes)

| Field | Type | Notes |
|---|---|---|
| channel_id | u16 | |
| data_type | u8 | as `.idl0` (0 = u8 … 7 = f64) |
| kind | u8 | 0 generic, 1 low-g/gyro axis, 2 high-g axis, 3 GPS |
| source | u8 | IMU index for kinds 1–2, else 0 |
| axis | u8 | 0–5 = AccelX … GyroZ (kind 1), 0–2 = X/Y/Z (kind 2) |
| rate_mhz | u32 | sample rate in milli-hertz (0 = event-driven); not limited to integers |
| scale | f32 | physical = raw × scale + offset |
| offset | f32 | |
| name | u8[24] | NUL-terminated. **The same names as today** (`IMU0_AccelX`, `IMU1_HgAccelX`, `WheelFront` …), so workbooks keep working. |
| units | u8[8] | |
| reserved | u8[2] | 0 |

**Proposed channel id ranges** (a clean start, since nothing is recorded yet):

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
| 0x02 | GPS_FIX | as `.idl0` §5.6, plus `hdop_x100:u16` (open: anything else from the receiver worth keeping) |
| 0x03 | CHANNEL_SAMPLE | as `.idl0` §5.7, with a u16 `channel_id` |
| 0x20 | LOGGER_EVENT | a diagnostic counter that changed: writer ring drops, FIFO overrun flags, bus errors (open: which ones) |
| 0xFF | SESSION_END | empty, as `.idl0` |

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
| samples | n_samples × 12 | accel X/Y/Z, gyro X/Y/Z, raw i16 |
| hg | n_hg × 6 | high-g X/Y/Z, raw i16 |
| ts | n_ts × 8 | `after_sample:u16`, `after_hg:u16`, `chip_ts:u32`: the word's FIFO position and value |

Header overhead is 19 bytes per drain. At 480 Hz that's ~10 samples per drain,
so ~14 bytes per low-g sample against 24 in `.idl0`.

**Proposed: an IMU records all six axes or none.** This matches the app's
all-or-nothing rule (SPEC §8) and fixes the sample stride at 12 bytes. Open:
keep partial axes possible on the wire instead.

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
   drops counted from timestamp gaps, writer drops from LOGGER_EVENT. This is
   also the samples/s limit for the load meter.
3. Warm-up run (heat gun or a hot day): the clock map follows the drift.
4. The timing audit script, run on `.idl1` logs.

## 8. Open questions

1. Window length for the clock-map fit (proposed 10 s).
2. How `DEC_32` counts with high-g on, and the exact timestamp tick
   (datasheet).
3. All six axes or none, or partial axes on the wire.
4. GPS_FIX additions beyond HDOP.
5. Which diagnostics LOGGER_EVENT carries.
6. The channel-id ranges in §4.2.
7. Whether to keep the 8-byte `CHANNEL_SAMPLE` timestamp for slow channels
   (simple, and they're cheap) or batch those too. Proposed: keep it.

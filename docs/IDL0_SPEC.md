# IDL0 Master Specification
**Version:** 1.0  **Last Updated:** 2026-05-04

---

## Table of Contents

| § | Section | Read for |
|---|---------|----------|
| **PART 1 — ORIENTATION** | | |
| 1 | System Philosophy | Always |
| 2 | Document Conventions | Always |
| **PART 2 — DEVICE & WIRE** | | |
| 3 | Hardware | Hardware/firmware tasks |
| 4 | Firmware | Firmware tasks |
| 5 | Binary Log Format | Parser, firmware |
| 6 | WiFi Protocol | Transport layer |
| 7 | BLE Protocol | Transport layer |
| 8 | Configuration Schema | Config, firmware |
| 9 | Coordinate System | Processing, calibration |
| 10 | Device Behavior | Firmware, power tasks |
| **PART 3 — APP ARCHITECTURE** | | |
| 11 | App Architecture | Any implementation |
| 12 | State Management | Any Dart implementation |
| 13 | Selection Model | Any Dart implementation |
| 14 | Error Handling | Any Dart implementation |
| 14a | Transport Trait Architecture (idl1) | Transport layer |
| **PART 4 — APP DATA MODEL** | | |
| 15 | Session & File Model | Data layer |
| 15a | Non-device Importers (FIT, GPX, CSV) | Import tasks |
| 16 | Track Entity | Track-related work |
| 17 | Multi-Track & TrackVisits | Track-related work |
| 17a | Workbook Entity | Analyze tab, LAN sync |
| 17b | Track Artifact (`.idl0t`) | Track-related work |
| 18 | Bike Profiles & Riders | Profile, metadata tasks |
| **PART 5 — APP PROCESSING** | | |
| 19 | Signal Processing Pipeline | Rust layer tasks |
| 20 | Calibration | Calibration tasks |
| 21 | Analysis Features | Analyze tab, lap detection |
| **PART 6 — APP UI** | | |
| 22 | UI Structure | UI tasks |
| 23 | Tab — Device | Device tab work |
| 24 | Tab — Data | Data tab work |
| 25 | Tab — Maths | Maths tab work |
| 26 | Tab — Analyze | Analyze tab work |
| 27 | Tab — Settings | Settings tab work |
| **PART 7 — CROSS-CUTTING** | | |
| 28 | Google Drive Sync | Transport, sync |
| 29 | Data Export | Export tasks |
| 30 | First Launch / Onboarding | First launch |
| **PART 8 — DISTRIBUTION** | | |
| 31 | Distribution | Build / release / self-update |
| 32 | Open Source | Setup |
| **PART 9 — VIDEO** | | |
| 33 | Video Overlay (engine + CLI) | Video overlay tasks |

---

# PART 1 — ORIENTATION

## 1. System Philosophy

Two hard domains, no overlap:

**Firmware:** During a **logging session** the firmware does raw capture only — sensor bytes to SD card, minimum clock cycles, no filtering, integration, or signal conditioning. Outside a logging session — boot/initialisation, calibration, file transfer, config handling — it is a normal embedded device and may compute as those tasks require (e.g. the calibration routine averages a static-hold window and derives bias + orientation). The one absolute, in every mode: **analysis DSP** — filtering, integration, FFT, statistics — never runs on the device. That is exclusively the app's job.

**App:** All analysis computation — signal processing, filtering, integration, FFT, visualization, analysis. Rust processing layer (sci-rs + nalgebra) called via flutter_rust_bridge. Dart for everything else. The device computes calibration *values*; the app *applies* them when processing a log.

**File model:** Log files (`.idl0`) are immutable after download. All derived work lives in the workspace file (`.idl0w`).

---

## 2. Document Conventions

This document is the contract for the IDL0 system. It describes WHAT the system does, not the path that led there.

**How to read this spec.** The spec is organised in eight Parts following data flow from device to UI. Read top-to-bottom for an end-to-end orientation; jump to a Part using the Table of Contents for task-specific reference. The CLAUDE.md task-type table maps common task categories to the sections they need.

**Section numbers are stable.** After the 2026-05-04 overhaul, section numbers do not change. New sections are appended (or inserted with a deliberate decision recorded in `docs/design_rationale.md`). This stability is what makes inline cross-references (`§N.M`) reliable.

**Specification vs project management.** The spec describes specification only. Work-to-do lives in `TASKS.md`. Recently-shipped changes live in `CHANGELOG.md`. Architectural decisions and tradeoffs live in `docs/design_rationale.md`. See CLAUDE.md §10 for the full artifact map.

**Inline `**TODO:**` markers** indicate gaps in the specification itself — places where the system's behaviour is not yet defined. They are visible flags inside the spec; they are NOT project tasks (those live in TASKS.md). Inline references of the form `TODO #N` resolve to entries in `TASKS.md` under the "Migrated from spec §2 Open Items" section.

**Spec disposition.** When updating this document, follow the rules in `CLAUDE.md §9 Spec Discipline`: spec-first for architectural changes, spec-during for additive features, no-change-needed must be explicitly stated.

**Units.** Wherever a numeric value or threshold appears, units are mandatory. See CLAUDE.md §4.

**Code references** (paths, type names, function names) are rendered in `inline code` formatting. Section cross-references use `§N` or `§N.M`.

---

# PART 2 — DEVICE & WIRE

## 3. Hardware

### 3.1 Microcontroller
- **Module:** Seeed Studio XIAO ESP32-C6
- **SPI bus:** All high-speed sensors share SPI2, individual CS per device

### 3.2 IMUs — LSM6DSO32TR ×3
- ±32g accel, up to 1600 Hz ODR
- **IMU0:** Sprung mass (onboard PCB)
- **IMU1:** Front unsprung (fork, remote via harness)
- **IMU2:** Rear unsprung (swingarm, remote via harness) — absent on hardtails
- Index = fixed physical location, never sequential enumeration

### 3.3 GPS — u-blox MAX-M10S
- Antenna: Linx ANT-GNSSCP-TH25L1 ceramic patch (50mm ground plane, 50Ω RF trace)
- Interface: UART. 1–10 Hz configurable.
- Role: absolute time anchor + GPS track for mapping/sectors

### 3.4 Analog Inputs
- **PRESSURE_FRONT, PRESSURE_REAR** — ESP32-C6 ADC, 12-bit, **0–3.3V max**
- General-purpose: any 0–3.3V source. Primary use: brake pressure.
- v1 status: pins wired to harness, physically unconnected
- ⚠️ **No input protection. User must voltage-divide external sensors to ≤3.3V.**
- App applies user-defined scale/offset (from datasheet) to convert counts → engineering units

### 3.5 Wheel Speed
- **SPEED_FRONT, SPEED_REAR** — Hall effect sensor, active-low digital pulse
- Interrupt-driven, timestamped per pulse (not polled)
- ISR: `IRAM_ATTR`, queued via `xQueueSendFromISR`
- Supports: MTB rotor (12 pt/rev), tone ring (~60 pt/rev), or any user-defined PPR
- Velocity: `circumference_mm / (ppr × Δt_µs) × 3.6` → km/h

### 3.6 Device Identification

Each ESP32-C6 has a unique 6-byte MAC accessible via `esp_efuse_mac_get_default()`. From it the firmware derives two identifiers that are visible across the transport surface:

| Identifier | Source | Format | Visible in |
|------------|--------|--------|------------|
| `device_id` | All 6 MAC bytes | 12-char lowercase hex (e.g. `7c87ce4a32f1`) | Binary log header (§5.1), `idl0_config.json` `device_id` field (§8) |
| SSID suffix | Last 2 MAC bytes | 4-char uppercase hex (e.g. `B2C3`) | WiFi AP SSID `IDL0-XXXX` (§6) |
| BLE name suffix | Last 2 MAC bytes | 4-char uppercase hex | BLE advertised name `IDL0-XXXX` (§7) |

The firmware writes `device_id` into the binary log header at session start and into the `idl0_config.json` it persists. The companion app surfaces the same string in the Device tab so users can tell devices apart.

### 3.7 Connector — Deutsch DTM15-12PA

| Pin | Net | Function |
|-----|-----|----------|
| 1 | +3V3 | Power out |
| 2 | GND | Ground |
| 3 | SPI_SCK | SPI clock |
| 4 | MOSI | SPI data out |
| 5 | MISO | SPI data in |
| 6 | IMU_CS_FRONT | CS — IMU1 |
| 7 | IMU_CS_REAR | CS — IMU2 |
| 8 | PRESSURE_FRONT | Analog |
| 9 | PRESSURE_REAR | Analog |
| 10 | SPEED_FRONT | Wheel pulse |
| 11 | SPEED_REAR | Wheel pulse |
| 12 | BUTTONS | User input |

### 3.8 PCB & Storage
- 4-layer PCB, KiCad 9.0, Seeed Fusion PCBA
- MicroSD 256 GB, SPI, peak write ~56 KB/s at max config
- Battery: 1–3 Ah LiPo via JST-PH 2.0 (J3)

**TODO:** LSM6DSO32 sample-rate ceiling (1600 Hz over SPI) not yet validated against hardware. Deferred until next hardware revision.

---

## 4. Firmware

### 4.1 Core Constraint
Zero processing. Read sensor registers. Write raw binary to SD. Nothing else.

### 4.2 Startup
1. Read `idl0_config.json` from SD root
2. Parse channel mask, sample rates, enabled sensors
3. Initialize peripherals
4. Write session file header
5. Await start trigger

### 4.3 Session Triggers
- Start/stop: button press OR BLE command (`CMD_START_LOGGING` / `CMD_STOP_LOGGING`)
- WiFi is on-demand only — enabled via `CMD_WIFI_ON`, disabled via `CMD_WIFI_OFF`
- BLE stays active continuously (control plane). WiFi is data transfer only.

### 4.4 Record Loop
- Poll sensors at configured rates, write raw binary records
- GPS records interspersed as received
- Wheel pulses written per-interrupt event
- No computation on any value

### 4.5 Sensor Failure
If IMU SPI read fails: write zero-filled record with correct index and timestamp. Do not halt.

### 4.6 Partition Table
Dual-OTA layout on 4 MB flash. `partitions.csv`:
```
nvs,      data, nvs,     0x9000,  24K
phy_init, data, phy,     0xF000,   4K
otadata,  data, ota,     0x10000,  8K
ota_0,    app,  ota_0,   0x20000,  1600K
ota_1,    app,  ota_1,          ,  1600K
```

OTA update: app pushes `.bin` to `/ota` endpoint over WiFi (§6.1). ESP-IDF `esp_ota_ops.h` handles slot selection, streaming write, SHA-256 verification, and boot-partition switching. After an OTA-installed image boots, it is in pending-verify state until the app sends `CMD_OTA_CONFIRM` (§7.2); if it reboots before that confirmation, the bootloader rolls back to the previous slot. Rollback is armed by `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y` in `sdkconfig.defaults`; because this is a bootloader option, devices flashed before it was enabled require one USB reflash (the bootloader is never OTA-updated).

---

## 5. Binary Log Format

**Byte order:** All multi-byte integers are **little-endian** (ESP32 native byte order).

### 5.1 File Header

| Field | Type | Bytes | Notes |
|-------|------|-------|-------|
| Magic | u8[4] | 4 | `IDL0` |
| Schema version | u8 | 1 | = 3 |
| Session UUID | u8[16] | 16 | App converts to 32-char lowercase hex → `Session.sessionId` |
| Device ID | u8[6] | 6 | App converts to 12-char lowercase hex → `Session.deviceId` |
| Session start UTC | i64 | 8 | ms, GPS-anchored |
| Config CRC32 | u32 | 4 | |
| IMU channel mask | u32 | 4 | see §5.3 |
| IMU count | u8 | 1 | |
| IMU sample rate | u16 | 2 | Hz |
| GPS sample rate | u8 | 1 | Hz |
| Channel registry count | u8 | 1 | N entries follow |
| Channel registry | entry[] | N×40 | see §5.2 |
| End marker | u8[4] | 4 | `0xDEADBEEF` |

> **Note.** Per-sample timing is carried inside the records themselves (see §5.5 for IMU_SAMPLE and §5.6 for GPS_FIX). The header's `Session start UTC` field stays as the wall-clock anchor; the device clock used for record-level timestamps is anchored against it on first GPS fix.

**Config CRC32 algorithm.** CRC-32/ISO-HDLC (a.k.a. zlib/PKZIP/gzip CRC32):
- Polynomial: `0x04C11DB7` (reflected: `0xEDB88320`)
- Initial value: `0xFFFFFFFF`
- Reflect input / reflect output: yes
- Final XOR: `0xFFFFFFFF`

Computed by the firmware over the raw on-disk JSON bytes of `idl0_config.json` (§8), exactly as loaded from the SD card before any whitespace normalisation. Available in ESP-IDF as `esp_rom_crc32_le(0, buf, len)` from `<rom/crc.h>`. The companion app verifies with `package:crclib`'s `Crc32` (which uses this same standard variant by default).

This is a corruption / mismatch check only; not security.

### 5.2 Channel Registry Entry (40 bytes each)

Every data source — analog channels, wheel-speed counters, and each individual IMU axis — declares itself in the header. The parser reads the registry once and handles all channel types from a single code path.

| Field | Type | Bytes | Notes |
|-------|------|-------|-------|
| channel_id | u8 | 1 | unique per session, referenced in 0x03 records |
| data_type | u8 | 1 | 0=u8 1=u16 2=u32 3=i8 4=i16 5=i32 6=f32 7=f64 |
| sample_rate_hz | u16 | 2 | 0 = event-driven (not fixed rate) |
| scale | f32 | 4 | physical = stored × scale + offset |
| offset | f32 | 4 | added after scaling |
| name | u8[20] | 20 | null-terminated ASCII e.g. `IMU0_AccelX`, `WheelFront` |
| units | u8[8] | 8 | null-terminated ASCII e.g. `g`, `dps`, `pulse`, `bar` |

**Adding a new sensor:** add an entry to the channel registry. No other format change. Old app versions see an unknown channel_id in the registry, skip those 0x03 records, parse everything else normally. No new parser required.

**Current channels in registry at v3 launch:**
| ID | Name | Type | Rate (Hz) | Units | Scale | Offset |
|----|------|------|-----------|-------|-------|--------|
| 0  | IMU0_AccelX | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 1  | IMU0_AccelY | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 2  | IMU0_AccelZ | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 3  | IMU0_GyroX  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 4  | IMU0_GyroY  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 5  | IMU0_GyroZ  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 6  | IMU1_AccelX | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 7  | IMU1_AccelY | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 8  | IMU1_AccelZ | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 9  | IMU1_GyroX  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 10 | IMU1_GyroY  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 11 | IMU1_GyroZ  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 12 | IMU2_AccelX | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 13 | IMU2_AccelY | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 14 | IMU2_AccelZ | i16 | (configured) | g   | accel_range_g / 32768 | 0 |
| 15 | IMU2_GyroX  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 16 | IMU2_GyroY  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 17 | IMU2_GyroZ  | i16 | (configured) | dps | gyro_range_dps / 32768 | 0 |
| 18 | WheelFront     | u32 | 0 (event) | pulse | 1.0 | 0 |
| 19 | WheelRear      | u32 | 0 (event) | pulse | 1.0 | 0 |
| 20 | PressureFront  | u16 | 100 | bar | from config | from config |
| 21 | PressureRear   | u16 | 100 | bar | from config | from config |

Scale and offset values in the table are resolved per-axis at session start from the active config and written verbatim into the registry entry. The parser treats them as opaque floats and applies `physical = stored × scale + offset` without reference to any config.

Disabled IMU axes (per the channel mask in §5.3) have no registry entry — the registry count reflects only axes that are enabled and recorded. The channel mask in §5.3 still drives stride decoding inside `IMU_SAMPLE` (0x01) records; the registry defines what each value means.

In the Scale column, `accel_range_g` and `gyro_range_dps` refer to the per-IMU resolved values from §8 — per-IMU sub-block value if present, else the top-level default.

**BLE Heart Rate Monitor (added when `heart_rate_monitor.enabled` in §8):**
| ID | Name | Type | Rate | Units | Scale | Offset |
|----|------|------|------|-------|-------|--------|
| 22 | HR_BPM | u8 | 1 | bpm | 1.0 | 0.0 |
| 23 | HR_RR | u16 | 0 (event) | ms | 1000/1024 | 0.0 |

**Future sensors (no format change needed):**
| ID | Name | Type | Rate | Units | Scale | Offset |
|----|------|------|------|-------|-------|--------|
| 24+ | anything | any | any | any | TBD | TBD |

### 5.3 Record Types

All records share a common 3-byte framing header:

```
[type:u8][payload_len:u16][payload:N bytes]
```

`payload_len` is the byte count of the payload only (does not include the 3-byte header). This enables forward-compatible skipping: on an unknown `type`, read `payload_len` and advance that many bytes, then continue parsing.

| Tag | Name | Payload description |
|-----|------|---------------------|
| 0x01 | IMU_SAMPLE | Raw int16 LSB — variable stride per IMU channel mask |
| 0x02 | GPS_FIX | Fixed-width parsed GPS fix |
| 0x03 | CHANNEL_SAMPLE | Generic — any channel in registry |
| 0xFF | SESSION_END | Empty payload (payload_len = 0) |

**SESSION_END semantics.** Firmware writes `0xFF` with `payload_len = 0` and flushes the file when:
1. The companion app sends `CMD_STOP_LOGGING` over BLE (§7.2).
2. The user presses the stop button.
3. Battery voltage drops below the soft-cutoff threshold (§10.1).

On a hard power loss with no SESSION_END, every record up to the last periodic fsync survives a normal read: the firmware commits the file's directory-entry **size** — not just its data clusters — at the ~1 Hz flush cadence (§10.2), so even without a clean close the file is parseable up to that point. It carries no SESSION_END marker, so the app treats it as an "interrupted" session and surfaces a warning while loading it normally. Samples written in the final ≤1 s between the last fsync and the cut reach the card's clusters but fall outside the committed size — a normal read does not see them; salvaging them needs a raw-device scan (`idl-rs recover`).

### 5.4 IMU Channel Mask (for 0x01 records only)

| Bits | Channels |
|------|---------|
| 0–5 | IMU0 accel XYZ, gyro XYZ |
| 6–11 | IMU1 same |
| 12–17 | IMU2 same |
| 18–31 | Reserved |

### 5.5 IMU_SAMPLE Record (0x01)

Variable stride — only enabled axes are written. Parser computes payload size from the IMU channel mask once at session load.

Framing: `[0x01][payload_len:u16][payload]`

| Field | Type | Bytes | Present when |
|-------|------|-------|-------------|
| imu_index | u8 | 1 | always |
| timestamp_us | i64 | 8 | always |
| accel_x | i16 | 2 | mask bit 0/6/12 |
| accel_y | i16 | 2 | mask bit 1/7/13 |
| accel_z | i16 | 2 | mask bit 2/8/14 |
| gyro_x | i16 | 2 | mask bit 3/9/15 |
| gyro_y | i16 | 2 | mask bit 4/10/16 |
| gyro_z | i16 | 2 | mask bit 5/11/17 |

`timestamp_us` is `esp_timer_get_time()` microseconds from device boot. Firmware reads the IMU FIFO in bursts and assigns per-sample timestamps walking back from the read instant at the nominal ODR cadence: for N samples drained at `t_read`, sample `i` (0 = oldest) is stamped `t_read - (N - 1 - i) * (1_000_000 / ODR)`. The device clock is anchored to wall-clock time by `gps_epoch_ms` carried in §5.6 GPS_FIX records.

Minimum payload: 9 bytes (`imu_index` + `timestamp_us`, no axes enabled).
Maximum payload: 21 bytes (`imu_index` + `timestamp_us` + 6 axes).

**Drop detection.** A dropped sample inside the FIFO is visible app-side as a gap larger than `1 / ODR` between consecutive `timestamp_us` values on the same `imu_index`. No separate "drop" record is emitted; firmware logs FIFO overruns to the serial / BLE status string for debugging but does not write them to the file. The parser reconciles these gaps onto the nominal grid — linear-filling the dropped samples and recording each run in the channel's gap list — so all IMU channels stay equal-length and time-aligned (§15.2).

**App-side channel names** (produced by `BinaryParser`, consumed by charts and math expressions):

| imu_index | Channel names (axis order: AccelX, AccelY, AccelZ, GyroX, GyroY, GyroZ) |
|-----------|--------------------------------------------------------------------------|
| 0 | `IMU0_AccelX` `IMU0_AccelY` `IMU0_AccelZ` `IMU0_GyroX` `IMU0_GyroY` `IMU0_GyroZ` |
| 1 | `IMU1_AccelX` … `IMU1_GyroZ` |
| 2 | `IMU2_AccelX` … `IMU2_GyroZ` |

Stored values are raw `i16`. The parser scales each axis using its registry entry's `scale` and `offset` fields: `physical = stored × scale + offset`. The channel mask defines which axes are present in the payload and in what order; the registry entry for each axis name defines what the raw value means. The Rust processing layer (§19) receives already-scaled physical values.

### 5.6 GPS_FIX Record (0x02)

Framing: `[0x02][payload_len:u16][payload]` — payload is always 32 bytes.

| Field | Type | Bytes | Notes |
|-------|------|-------|-------|
| gps_epoch_ms | i64 | 8 | UTC ms from the GPS receiver |
| device_timestamp_us | i64 | 8 | `esp_timer_get_time()` at fix arrival |
| latitude | i32 | 4 | deg × 1e7 |
| longitude | i32 | 4 | deg × 1e7 |
| altitude | i16 | 2 | m × 10 |
| speed | u16 | 2 | km/h × 100 |
| heading | u16 | 2 | deg × 100 |
| fix_quality | u8 | 1 | 0=none 1=GPS 2=DGPS |
| satellites | u8 | 1 | count |

**Wall-clock anchor.** `gps_epoch_ms` and `device_timestamp_us` together anchor the device's monotonic `esp_timer` clock to UTC. Records that precede the first fix carry `gps_epoch_ms = 0`. When the header `Session start UTC` (§5.1) is 0, the app back-fills the session's start as the wall clock at the recording's **first sample**, from the first non-zero fix:

```
session_start_utc_ms = gps_epoch_ms − (device_timestamp_us − first_sample_device_timestamp_us) / 1000
```

Per-sample times are zeroed at that first sample (§15.2), so each sample's absolute wall time is `session_start_utc_ms + sample_time`. (`first_sample_device_timestamp_us` is the earliest record timestamp in the file; `device_timestamp_us` is monotonic since device boot, not since the recording, so the offset to the first sample — not the raw device timestamp — is what places the start at recording time rather than boot.)

### 5.7 CHANNEL_SAMPLE Record (0x03)
Generic record for all non-IMU, non-GPS channels. Value width determined by `data_type` in registry.

Framing: `[0x03][payload_len:u16][payload]`

| Field | Type | Bytes | Notes |
|-------|------|-------|-------|
| channel_id | u8 | 1 | matches registry entry |
| timestamp_us | i64 | 8 | µs since boot |
| value | N bytes | 1–8 | per registry data_type |

**App-side channel names** (produced by the `idl-rs` engine for GPS_FIX records):

| Channel | Source field | Storage |
|---------|-------------|---------|
| `GPS_EpochMs` | `gps_epoch_ms` | raw `i64` ms |
| `GPS_Latitude` | `latitude` | raw `i32` (deg × 1e7) |
| `GPS_Longitude` | `longitude` | raw `i32` (deg × 1e7) |
| `GPS_Altitude` | `altitude` | raw `i16` (m × 10) |
| `GPS_SpeedKmh` | `speed` | `i32`, engine scale **0.01** → physical km/h |
| `GPS_Heading` | `heading` | raw `u16` (deg × 100) |
| `GPS_FixQuality` | `fix_quality` | raw `u8` |
| `GPS_Satellites` | `satellites` | raw `u8` |

Values are stored as raw wire integers in the on-disk record. Registry-defined `CHANNEL_SAMPLE` channels are returned with `physical = stored × scale + offset` from the channel's registry entry (§5.2). The GPS_FIX-derived channels above carry no registry entry. **`GPS_SpeedKmh` is the one exception that is engine-scaled**: the firmware logs km/h × 100, and the engine stores the raw `i32` with a `0.01` scale so `materialize()` yields **physical km/h** — every consumer (`Distance` synthesis, math, FIT export, colour-by) reads physical speed directly, none divides. The remaining GPS_FIX channels are returned **raw**; consumers that need physical units divide by the documented factor (e.g. `GPS_Latitude` ÷ 1e7, `GPS_Altitude` ÷ 10, `GPS_Heading` ÷ 100).

**Wheel pulse example** (channel_id=18, data_type=u32):
- `value` = monotonic pulse counter (rollover detectable)
- `sample_rate_hz` = 0 (event-driven, one record per pulse)

**Heart rate example** (channel_id=22, data_type=u8):
- `value` = BPM from BLE heart rate monitor
- `sample_rate_hz` = 1

**RR-interval example** (channel_id=23, data_type=u16):
- `value` = raw 1/1024-second ticks per beat-to-beat interval
- `sample_rate_hz` = 0 (one record per heartbeat, back-derived timestamps)
- Parser converts to ms via `physical = stored × 1000/1024 + 0.0`

---

## 6. WiFi Protocol

ESP32 runs as AP. Phone connects directly, no router.

| Parameter | Value |
|-----------|-------|
| SSID | `IDL0-XXXX` where `XXXX` = uppercase hex of MAC bytes 4–5. See §3.6. |
| Password | Per-device (TODO #16). Current: `datalogger123` |
| Device IP | `192.168.4.1` |
| Protocol | HTTP/1.1 |

### 6.1 Endpoints

| Endpoint | Method | Response | Notes |
|----------|--------|----------|-------|
| `/ping` | GET | JSON object | Status + identity. See below. Handler is allocation-light and never touches the SD card. |
| `/handoff` | POST | 200 | App acknowledges the HTTP link is up; firmware then drops BLE (disconnects + stops advertising). Idempotent. See §10.4. |
| `/wifi_off` | POST | 200 | Exits WiFi mode. Response flushes (~500 ms delay), then AP tears down and BLE advertising resumes. The normal WiFi-exit path once BLE is off. |
| `/files` | GET | JSON array | `[{"name":"...", "size":N, "session_id":"<32-hex>"}]` — `session_id` is the 16-byte header UUID as 32 lowercase hex chars (no dashes), read from each file; omitted only if the header is unreadable. The app diffs it against the library to mark files NEW vs in-library (§24). |
| `/download?file=N` | GET | binary stream | `Range: bytes=START[-END]` supported (`206` + `Content-Range`). The app resumes interrupted downloads from the received offset — safe because session files are immutable after recording. |
| `/delete?file=N` | GET | 200/error | |
| `/config` | POST | 200/error | Push `idl0_config.json`. **On success the device reboots** (`esp_restart`, ~500 ms after the `200`) to apply the new config in full — it is read at boot only (HRM enable/address, IMU ODR/ranges). The GPS module is UART-only with no power-enable GPIO, so its fix survives the SoC reset. The app re-establishes the BLE link after the push; the device boots back into idle mode. |
| `/ota` | POST | 200/error | OTA firmware update — see below |

`/ota` request body is the raw firmware image (`Content-Type: application/octet-stream`). `Content-Length` SHOULD be set; if present, the device rejects a short upload (HTTP 400) so a truncated stream never reaches validation. The device streams the bytes into the inactive OTA partition, then validates the image's embedded SHA-256 via `esp_ota_end()`:
- **200** with body `ok\n` — image valid; the device reboots ~500 ms after the response. A `SocketException` on the immediately-following request is expected.
- **400 `image validation failed`** — SHA-256 mismatch (corrupt upload). Device keeps running the previous image.
- **400 `short upload`** — `Content-Length` set but fewer bytes received.
- **500 …** — receive or flash-write failure. Device keeps running the previous image.

The new image boots in pending-verify state. The app commits it with `CMD_OTA_CONFIRM` (§7.2); without that confirmation, the next reboot rolls back. See §4.6.

**`/ping` payload.** The WiFi-mode status feed and identity check:

```json
{
  "device": "IDL0-A3F2",
  "fw": "1.4.0",
  "proto": 1,
  "battery": 87,
  "sd": "OK",
  "mode": "wifi",
  "ble": "on"
}
```

`device` is `idl0_device_name()` — the app verifies it against the expected
device before trusting the link (every IDL0 AP shares `192.168.4.1`).
`proto` is the WiFi control-protocol version (currently 1); on a major
mismatch the app refuses operations and surfaces a firmware-update prompt.
`ble` is `on` until `/handoff`, `off` after. The remaining fields mirror the
§7.3 status characteristic: once BLE drops, `/ping` **is** the status feed
(§7.3). Unknown fields are ignored by the app, so the set may grow.

### 6.2 App ↔ Device Link Management

**Android network binding.** Android 10+ routes HTTP to the default
(cellular) network when a WiFi AP has no internet. The app requests the
device AP with `WifiNetworkSpecifier` via the `idl0/wifi_network` platform
channel. The plugin is a pure sensor/actuator: commands `request(ssid,
password)` / `release()` (immediate return, no timers, no policy) plus an
event stream (`available` / `lost` / `unavailable`). The network request
stays registered for the whole linked period; `onUnavailable` and `release`
both unregister, and the network↔SSID association is keyed so switching
devices never reuses a stale network. Android 11+ stores the user's AP
approval, so repeat requests auto-connect with no dialog; on Android 10 a
re-request may re-prompt, so unattended relink attempts are capped there
(one automatic retry, then a manual Retry affordance).

**Per-socket routing (loopback proxy).** The process is never globally
bound to the AP (`bindProcessToNetwork` is not used). While the AP network
is available, the plugin runs a minimal TCP forwarder: `127.0.0.1:<ephemeral
port>` ↔ a `Network.socketFactory` socket ↔ `192.168.4.1:80`. The port is
delivered in the `available` event and the app's device base URL becomes
`http://127.0.0.1:<port>`. Internet traffic (Drive sync, §28) flows
normally during transfers. On every other platform the app talks to
`192.168.4.1` directly and the user joins the AP in system settings.

**Link reconciler.** A single-flight state machine in the app owns the
link: `unlinked → requesting → verifying → linked`, with failures feeding
back through bounded backoff (1 s / 2 s / 4 s, then `failed`; `failed`
re-arms on user Retry, app resume, or WiFi-mode re-entry). Desired state
derives from device mode (read through the §7.3 staleness model); actual
state from platform events plus the heartbeat. `verifying` requires an
identity-checked `/ping` (wrong `device` → release + `failed`, never talk
to the wrong logger); the first success after WiFi-mode entry triggers
`POST /handoff`. While `linked`, `/ping` runs every 10 s (any successful
operation counts as a heartbeat); 3 consecutive failures → relink. The
machine is an explicit transition table with full-coverage tests, and the
last ~100 transitions are journaled for diagnosis. All device operations go
through one serialized, link-gated facade: ops wait up to 15 s while the
reconciler is converging, and fail fast with a typed error when the link is
`failed` or the device is not in WiFi mode.

---

## 7. BLE Protocol

### 7.1 GATT

| Characteristic | UUID | Type |
|----------------|------|------|
| Service | `000000FF-0000-1000-8000-00805F9B34FB` | — |
| IMU Data | `0000FF01-0000-1000-8000-00805F9B34FB` | Notify (disabled in v2) |
| GPS Data | `0000FF02-0000-1000-8000-00805F9B34FB` | Notify (disabled in v2) |
| Control | `0000FF03-0000-1000-8000-00805F9B34FB` | Write with Response |
| Status | `0000FF04-0000-1000-8000-00805F9B34FB` | Notify |
| Config RX | `0000FF05-0000-1000-8000-00805F9B34FB` | Write with Response |
| Config TX | `0000FF06-0000-1000-8000-00805F9B34FB` | Read |

Control characteristic uses **Write with Response** — app waits for GATT ACK before the command call returns. Firmware must acknowledge. If declared as Write Without Response in the firmware GATT table, update this and flip `withoutResponse` in `BleConnection._sendCommand`.

### 7.2 Control Commands (single byte write)

| Byte | Command |
|------|---------|
| 0x01 | CMD_WIFI_ON |
| 0x02 | CMD_WIFI_OFF |
| 0x03 | CMD_START_LOGGING |
| 0x04 | CMD_STOP_LOGGING |
| 0x05 | CMD_CALIBRATE_IMU |
| 0x06 | CMD_OTA_CONFIRM |
| 0x07 | CMD_CONFIG_BEGIN |
| 0x08 | CMD_CONFIG_COMMIT |
| 0x09 | CMD_CONFIG_READ_BEGIN |

`CMD_OTA_CONFIRM` (0x06) commits the currently-running image after an OTA. After an `/ota` POST and the subsequent reboot, the new image runs in pending-verify state — the status characteristic includes an `OTA: PENDING_VERIFY` line (§7.3). The app must send `CMD_OTA_CONFIRM` to cancel the pending rollback; if the device reboots before the confirmation, the bootloader switches back to the previous slot. Sending the command in any other state is a no-op.

**Config push over BLE.** `idl0_config.json` is pushed over BLE — no WiFi changeover. The app:

1. writes `CMD_CONFIG_BEGIN` (0x07) to Control, opening an 8 KB reassembly buffer on the device;
2. streams the JSON to the **Config RX** characteristic (FF05) in MTU-sized chunks (each a Write with Response);
3. writes `CMD_CONFIG_COMMIT` (0x08) to Control.

On COMMIT the firmware validates the reassembled bytes as JSON and atomically writes them to `idl0_config.json` (temp-file + rename), then reboots ~500 ms later to apply (config is read at boot only, §4.2). The app re-establishes BLE after the reboot and lands back in idle mode. BEGIN/COMMIT and the FF05 writes carry the §7.2 ACK protocol: a chunk that would exceed 8 KB, a COMMIT with no buffered data, malformed JSON, or an SD write error are rejected (`0x80`/`0x81`) and no partial config is persisted. A BLE disconnect mid-transfer discards the buffer. This shares one validate+atomic-write path with the WiFi `POST /config` handler (§6.1), which remains available as a fallback.

**Config read-back over BLE.** `CMD_CONFIG_READ_BEGIN` (0x09) snapshots the live `idl0_config.json` into a device-side buffer and resets a cursor; the app then reads the **Config TX** characteristic (FF06) repeatedly — each read returns the next ≤200-byte chunk and advances the cursor — until an **empty read** signals EOF. The app reassembles and `jsonDecode`s the bytes. READ_BEGIN returns `0x81` if no config file exists. The snapshot is discarded on disconnect. The app uses this to **verify a push**: after the reboot+reconnect it pulls the config back and compares it (compact JSON) to what it sent; a mismatch (or read-back unsupported on older firmware) is surfaced to the user but never silently treated as success.

**ACK protocol.** Every write to the Control characteristic (FF03)
returns an ATT result code as the GATT write response:

| Code | Meaning |
|------|---------|
| `0x00` | Success — command accepted and dispatched |
| `0x03` | `WRITE_NOT_PERMITTED` — mutex or precondition refusal |
| `0x80` | `IDL0_ACK_BUSY` (reserved) |
| `0x81` | `IDL0_ACK_PRECONDITION` (reserved) |
| `0x82` | `IDL0_ACK_NOT_IMPLEMENTED` (reserved) |

Acceptance (0x00) does NOT mean the work completed — only that the
firmware accepted the command and will execute it. The corresponding
FF04 status notify carrying the new state is the completion signal.

**Mutex.** `CMD_WIFI_ON` and `CMD_START_LOGGING` are mutually
exclusive. The firmware returns `0x03` (and refuses to act) when:

- `CMD_WIFI_ON` is issued while a session is running.
- `CMD_START_LOGGING` is issued while SoftAP is up.

Mode changes are automatic (§23.9) — recording from the Device hero's
primary button, WiFi driven on demand by file sync (§24) / OTA (§27) — so the
app never lets the user request a mutex-violating transition directly.

In WiFi mode, BLE control is available only until the §10.4 radio
handoff: after `POST /handoff` the phone link drops and control moves
to HTTP (`/wifi_off` exits the mode). `CMD_WIFI_OFF` over BLE remains
the abort path for a WiFi entry that never achieved an HTTP link.

### 7.3 Status Characteristic
UTF-8, newline-delimited. Parse case-insensitively. Unknown lines are ignored, so the set may grow without breaking older parsers.
```
WiFi: ON|OFF
Logging: RUNNING|STOPPED
Battery: N%
SD: OK|FULL|ERROR|ABSENT
GPS: FIX|NOFIX|ABSENT
IMU: OK|PARTIAL|ERROR|ABSENT
Firmware: <semver>      (running image version, e.g. 1.5.0)
OTA: PENDING_VERIFY     (present only while the running image is awaiting CMD_OTA_CONFIRM — see §7.2)
HR:         ABSENT | SEARCHING | CONNECTED N | NO_CONTACT N | SUSPENDED
HR_Battery: N%
```
`SD` reflects mount + free-space state. `GPS` reflects fix acquisition. `IMU` is an aggregate across the enabled IMUs — `PARTIAL` means at least one enabled IMU is responding and at least one is not. `Firmware` carries the running image's embedded version (`esp_app_desc_t.version`), the same value `/ping` reports as `fw`; the app uses it to offer over-the-air updates (§27.7). `OTA` is absent in the common case; it appears only between an OTA-installed reboot and the app's `CMD_OTA_CONFIRM`.

`HR` reflects the HRM central-role state (§7.5). `CONNECTED N` carries the latest BPM. `NO_CONTACT N` means the strap's sensor-contact-detected flag (bits 1–2 of the HR Measurement flags byte) reports no skin contact; BPM continues to stream but is unreliable. `SUSPENDED` means the HRM link has been dropped because WiFi SoftAP is active (§10.4). `HR_Battery` is absent until the first successful battery read on connect; thereafter it stays present (with the last-read value) for the duration of the session.

**Status sources and staleness.** This characteristic is the status feed in
idle and recording modes. In WiFi mode, after the §10.4 radio handoff drops
BLE, the `/ping` heartbeat (§6.1) carries the same fields as JSON. The app's
`DeviceState` never resets to defaults on link loss: it holds last-known
values with a timestamp and source (`ble` | `ping`), and derives staleness
(no payload from any source within 25 s). Mode derivation reads through
this, so BLE absence during WiFi mode is the designed state, not an error;
only a deliberate user disconnect clears device state. UI renders stale
values dimmed rather than substituting defaults.

### 7.4 Connection Sequence
1. Scan for service UUID `000000FF-...`
2. Connect GATT, negotiate MTU
3. Enable notifications on the Status characteristic (wait for the CCCD descriptor-write ACK). Control is write-only — it has no notifications to enable; just hold its handle for writing.
4. Read initial status

### 7.5 BLE Central Role (Heart Rate Monitor)

The firmware runs NimBLE as both **peripheral** (GATT server for the phone) and **central** (GATT client for an HRM strap) on a single radio. Requires `CONFIG_BT_NIMBLE_ROLE_CENTRAL=y` and `CONFIG_BT_NIMBLE_MAX_CONNECTIONS=2` in `sdkconfig`.

The central role connects to one HRM per session, identified by the 6-byte BLE address stored in `idl0_config.json` `heart_rate_monitor.device_address` (§8). The strap exposes the standard Heart Rate Service (`0x180D`) with the Heart Rate Measurement characteristic (`0x2A37`) and the Battery Service (`0x180F`) with the Battery Level characteristic (`0x2A19`).

The firmware subscribes to `0x2A37` notifications and reads `0x2A19` once on connect. Each notification produces:
- One `HR_BPM` (channel 22) CHANNEL_SAMPLE record, value = BPM from the notification's HR byte.
- N `HR_RR` (channel 23) CHANNEL_SAMPLE records, one per RR interval in the notification payload, with back-derived timestamps walking from the notification arrival time.

**WiFi coexistence.** The ESP32-C6 RF coexistence table marks SoftAP + BLE as "C1 — unstable." The firmware drops the HRM connection when WiFi turns on (file transfer / OTA / config push) and reconnects when WiFi turns off. See §10.4.

### 7.6 IMU Calibration

`CMD_CALIBRATE_IMU` (0x05) puts the device into **calibration mode** — a non-logging mode. The device runs a self-contained routine: it captures a static-hold sample window, then computes per-IMU bias offsets and the 3×3 orientation matrix on-device (permitted outside the logging path — see §1). It does **not** stream raw IMU data over BLE.

The result — per-IMU bias `[ax, ay, az, gx, gy, gz]` and the orientation matrix — is delivered to the app over BLE as a compact, fixed-size payload (one packet or a short bounded set; the exact characteristic is pinned when the calibration flow is implemented). The app writes the values into the bike's `idl0_config.json` (§8 `bias` / `orientation` fields), so calibration is stored per bike profile and travels with that bike's config.

The firmware never *applies* calibration — it writes raw int16 LSB values into the log (§5.5). The parser converts raw values to physical units using the per-channel scale/offset stored in the channel registry (§5.2). The app then applies bias correction and orientation rotation in the Rust processing layer, matching log to config via the header `config_crc32` (§5.1).

---

## 8. Configuration Schema

**File:** `idl0_config.json` on SD card root. Pushed manually by user after review — never pushed automatically.

```json
{
  "config_version": 1,
  "device_id": "XXXXXXXXXXXX",
  "bike_profile": {
    "name": "Trek Session 2024",
    "default_rider": "Rider Name"
  },
  "imu": {
    "sample_rate_hz": 833,
    "accel_range_g": 32,
    "gyro_range_dps": 2000,
    "low_power_mode": false,
    "high_performance_mode": true,
    "imu0": {
      "enabled": true,
      "accel_range_g": 32,
      "gyro_range_dps": 2000,
      "channels": { "accel_x": true, "accel_y": true, "accel_z": true,
                    "gyro_x": true, "gyro_y": true, "gyro_z": false }
    },
    "imu1": {
      "enabled": true,
      "accel_range_g": 16,
      "gyro_range_dps": 500,
      "channels": { "accel_x": true, "accel_y": true, "accel_z": true,
                    "gyro_x": false, "gyro_y": false, "gyro_z": false }
    },
    "imu2": {
      "enabled": true,
      "accel_range_g": 16,
      "gyro_range_dps": 500,
      "channels": { "accel_x": true, "accel_y": true, "accel_z": true,
                    "gyro_x": false, "gyro_y": false, "gyro_z": false }
    },
    "orientation": {
      "imu0_rotation_matrix": [[1,0,0],[0,1,0],[0,0,1]],
      "imu1_rotation_matrix": [[1,0,0],[0,1,0],[0,0,1]],
      "imu2_rotation_matrix": [[1,0,0],[0,1,0],[0,0,1]]
    },
    "bias": {
      "imu0": [0,0,0,0,0,0],
      "imu1": [0,0,0,0,0,0],
      "imu2": [0,0,0,0,0,0]
    }
  },
  "gps": {
    "sample_rate_hz": 5,
    "dynamic_model": "automotive",
    "nmea_sentences": ["GGA", "RMC"],
    "sbas_enabled": true
  },
  "analog": {
    "sample_rate_hz": 100,
    "channels": []
  },
  "digital": {
    "channels": []
  },
  "wheel_speed": {
    "front": { "enabled": false, "points_per_revolution": 12, "wheel_circumference_mm": 2300 },
    "rear":  { "enabled": false, "points_per_revolution": 12, "wheel_circumference_mm": 2300 }
  },
  "heart_rate_monitor": {
    "enabled": true,
    "device_address": "AA:BB:CC:DD:EE:FF",
    "device_name": "Polar H10 12345678"
  }
}
```

**Heart rate monitor.** `device_address` is the 6-byte BLE public address, colon-separated uppercase hex. `device_name` is informational (preserved across pushes, used as the UI label). `enabled: false` retains the saved address but suppresses connection. Omitting the block is equivalent to `enabled: false`. The firmware adds channels 22 (`HR_BPM`) and 23 (`HR_RR`) to the per-session channel registry only when `enabled` is true (§5.2).

**Bike profile.** The `bike_profile` block carries only user-facing metadata — `name` (also written into `SessionMetadata.bike` for matching across the app) and `default_rider`. The presence of IMU1/IMU2 is derived from `imu.imu1.enabled` and `imu.imu2.enabled`, not from a separate `imu_count` or `type` field.

**Analog channels.** Each element of `analog.channels` is:

```json
{ "key": "strain_left", "label": "Strain Left",
  "adc_pin": 4, "units": "kN",
  "scale": 0.0123, "offset": -1.5, "enabled": true }
```

No default entries — users add channels via the Device tab as they wire up sensors. The firmware iterates the array at session start to configure ADC channels dynamically. `analog.sample_rate_hz` is shared across all analog channels (the ADC scheduler round-robins between configured pins). Per-channel rate overrides are forward-compatible but not yet implemented.

**Digital channels.** Each element of `digital.channels` is:

```json
{ "key": "marker_btn", "label": "Marker", "kind": "marker",
  "gpio_pin": 21, "active_low": true, "debounce_ms": 20, "enabled": true }
```

`kind` is one of `marker` (event-driven push button — one CHANNEL_SAMPLE per debounced press, value = monotonic press counter), `level` (low-rate sampled binary state, u8 at 50 Hz), or `pwm` (frequency / duty measurement, u32 at 50 Hz). Spec 1 ships `marker` in the app's `+ Add channel…` picker; `level` and `pwm` are reserved in the schema but not yet exposed.

**Wheel speed defaults.** Both `front.enabled` and `rear.enabled` default to `false` — wheel-pulse counters require a Hall-effect sensor that not every bike has wired. Users enable per slot via the Device tab.

**Per-IMU range resolution.** Each `imu.imu0`, `imu.imu1`, and `imu.imu2` sub-block carries its own `accel_range_g` and `gyro_range_dps`. The top-level `imu.accel_range_g` and `imu.gyro_range_dps` fields (shown above) act as defaults: the firmware seeds all three IMU slots from those values, then applies any per-IMU overrides. A config file that omits the per-IMU sub-blocks entirely is valid — all three IMUs inherit the top-level range. The resolved per-axis values are written verbatim into the channel registry entry (§5.2) at session start; the parser uses those registry values without further reference to the config.

**Configurable chip options:**

LSM6DSO32: sample rate (12.5–1666 Hz), accel range (±4/8/16/32g), gyro range (±125–2000 dps), high-performance vs low-power mode, anti-aliasing filter bandwidth.

u-blox MAX-M10S: sample rate (1–10 Hz), dynamic model (portable/pedestrian/automotive/sea/airborne), NMEA sentences (GGA+RMC default), SBAS enable.

**Valid `sample_rate_hz` values — app UI must expose these discrete options:**

| Config path | Valid values | On invalid value |
|-------------|-------------|-----------------|
| `imu.sample_rate_hz` | High-perf: 12.5, 26, 52, 104, 208, 416, 833, 1666 Hz. Low-power: 1.6, 12.5, 26, 52, 104, 208 Hz. | Undefined — firmware maps directly to ODR register; off-list values produce undefined chip behavior. |
| `gps.sample_rate_hz` | Integer 1–10 Hz | Firmware clamps or rejects. |
| `analog.sample_rate_hz` | **Not yet defined.** ADC chip and valid rate set unspecified — define before implementing analog parsing. | — |

**Read-only fields — app preserves on push, never user-edited:**
- `device_id`: 12-char lowercase hex of `esp_efuse_mac_get_default()`. See §3.6.
- `config_version`: App-managed. Increment only for breaking firmware-compatibility changes.

**Compatibility:** Firmware ignores unknown JSON fields. App warns if device firmware is newer than app. Breaking changes increment `config_version`.

**Push transport:** "Push Config" sends `idl0_config.json` over BLE (FF05 + `CMD_CONFIG_BEGIN`/`CMD_CONFIG_COMMIT`, §7.2); the device reboots to apply. Requires idle mode (BLE control is suspended in WiFi mode, §10.4). The WiFi `POST /config` path (§6.1) remains as a fallback.

**App-side config model (idl1, `app/src/routes/pages/Device/config/model.ts`).**
The app parses `idl0_config.json` leniently: a malformed field falls back to
its default and is recorded as a `Repair` rather than throwing, so a config
the app cannot fully make sense of never blocks the tab. A value that is the
right type but off a SPEC-stated valid set (the `imu.sample_rate_hz` ODR
table above) is kept exactly as read and reported as a `Repair` — the app
never silently snaps a stored value to the nearest valid one, unlike idl0's
`ImuSettingsDialog`. Unknown top-level JSON keys and the two read-only
fields (`device_id`, `config_version`) survive a parse → edit → serialise
round trip unchanged. `analog.sample_rate_hz` has no SPEC-defined valid set
(the row above is still "Not yet defined"); the app accepts any positive
integer there and flags nothing, pending a spec answer (ruling R53 Device
Q2).

**`validateConfig` validation table (idl1, `app/src/routes/pages/Device/config/validate.ts`).**
The single gate `pushConfig` sits behind — a config is never pushed with an
unresolved `error`-severity issue (`warning` issues never block a push).
One row per rule below; each names the exact `ValidationIssue.path` the app
emits, so a reviewer can check the code against this table line by line.

| Path | Severity | Condition | Citation |
|------|----------|-----------|----------|
| `imu.sample_rate_hz` | error | not in the high-perf or low-power ODR list for the current `imu.low_power_mode` | §8 "Valid `sample_rate_hz` values" |
| `imu.low_power_mode` | warning | `imu.high_performance_mode` also true | SPEC §8 gap — the two flags are framed as one physical toggle but §8 never states which wins when both are set; tracked note 2026-09-05 |
| `imu.accel_range_g` | error | not one of ±4/8/16/32 g | §8 "Configurable chip options" |
| `imu.gyro_range_dps` | error | not one of ±125/250/500/1000/2000 dps | §8 "Configurable chip options" |
| `imuN.accel_range_g` (N=0,1,2) | error | not one of ±4/8/16/32 g | §8 "Per-IMU range resolution" |
| `imuN.gyro_range_dps` (N=0,1,2) | error | not one of ±125/250/500/1000/2000 dps | §8 "Per-IMU range resolution" |
| `imuN.channels` (N=0,1,2) | warning | `imuN.enabled` true and every axis channel false | load-bearing invariant: an enabled IMU logging nothing is a mistake |
| `gps.sample_rate_hz` | error | not an integer | §8 "Integer 1-10 Hz" |
| `gps.sample_rate_hz` | error | integer but outside 1..10 | §8 "Integer 1-10 Hz" |
| `gps.dynamic_model` | error | not one of portable/pedestrian/automotive/sea/airborne | §8 "Configurable chip options" |
| `gps.nmea_sentences` | warning | empty array | §8 "NMEA sentences (GGA+RMC default)" |
| `analog.channels[i].key` | error | empty string | §8 "Analog channels" (the key addresses the entry) |
| `analog.channels[i].key` | error | shares its value with an earlier channel's key | §8 "Analog channels" (one physical sensor per key) |
| `analog.channels[i].scale` | error | `scale` is 0 | §8 "Analog channels" (every sample would read as the fixed offset) |
| `analog.channels[i].adc_pin` / `digital.channels[j].gpio_pin` | error | two channels (any kind combination) share a pin number | one physical pin cannot serve two claims |
| `digital.channels[i].kind` | warning | `kind` is not `"marker"` | §8 "`level`... `pwm`... reserved in the schema but not yet exposed" |
| `digital.channels[i].debounce_ms` | error | negative | §8 "Digital channels" (a negative debounce window is meaningless) |
| `wheel_speed.front/rear.points_per_revolution` | error | slot `enabled` true and value ≤ 0 | divide-by-zero in every speed derivation |
| `wheel_speed.front/rear.wheel_circumference_mm` | error | slot `enabled` true and value ≤ 0 | not a usable geometry |
| `heart_rate_monitor.device_address` | error | block `enabled` true and address does not match `^([0-9A-F]{2}:){5}[0-9A-F]{2}$` | §8 "Heart rate monitor" (colon-separated uppercase hex) |

A disabled `wheel_speed` slot, and an absent or `enabled: false`
`heart_rate_monitor` block, are not validated at all — neither is pushed to
hardware in that state (§8 "Wheel speed defaults"; §8 "Heart rate monitor").

**Channel-enable preview (idl1, `app/src/routes/pages/Device/config/sourcesPreview.ts`).**
Wave 2's Device tab channels table shows enable state, sample rate, and
units only, per source — never a predicted `channel_id`, `data_type`, or
`scale`/`offset`. Those four values are §5.2's own registry-entry fields,
resolved from the config by `core::parse` in Rust (the `scale = range /
32768` derivation is the wire contract's formula, not the app's); a second
copy of that arithmetic in TypeScript is exactly the drift a standing
reviewer brief flags as a finding (ruling R53 Device Q1). The full
per-channel registry preview — one row per resolved axis/pin/counter,
carrying `channel_id`, `data_type`, `scale`, and `offset` — is deferred to
`preview_channel_registry(config_json) -> RegistryRow[]` (IPC need 12),
computed engine-side once the Rust write-amendment lane lands it.

---

## 9. Coordinate System

**ISO 8855, right-hand:**
- X: forward
- Y: left lateral
- Z: up

**Sign conventions (right-hand rule):**
- Roll (about X): positive = left side down
- Pitch (about Y): positive = nose up
- Yaw (about Z): positive = turning left

**Suspension note:** Fork compression → negative Z on sprung IMU, positive Z on unsprung. Account for this in travel calculation.

**Sensor sign convention:** LSM6DSO32 reports specific force reaction (not gravitational acceleration). Stationary and upright: `accel_z ≈ +g`. Used as gravity vector target during calibration (see §20).

---

## 10. Device Behavior

### 10.1 Power
- Soft cutoff at minimum LiPo voltage (~3.3V/cell): write SESSION_END, flush SD, BLE notify "Battery critical", power off
- Hard cutoff: hardware undervoltage lockout. FAT32 survives ungraceful power loss on append-only files.
- App shows battery level, warning below 20%

### 10.2 SD Card

**Layout.**
- All session files live under `/sessions/` at the root of the FAT32 partition.
- At session start the firmware opens `/sessions/tmp_<boot_ms>.idl0` where `<boot_ms>` is `esp_timer_get_time() / 1000`. This name is used until the first valid GPS fix arrives.
- On first fix, the file is renamed to `/sessions/YYYY-MM-DD_HH-MM-SS.idl0` using UTC from `gps_epoch_ms`.
- If no fix is ever acquired during a session, the temp name persists. The app's `/files` listing (§6.1) is filename-agnostic and accepts both.
- No subfolders by date — the flat layout matches what the prototype produced and keeps the `/files` JSON simple.

**Durability.** During logging the writer commits on a ~1 Hz cadence: it flushes the 16 KB stdio buffer to the card and `fsync`s the file, writing back the directory-entry **size** (and the FAT). FATFS does not otherwise update a file's size until `f_close` (here: the first-fix rename and session close), so this periodic fsync is what keeps a power-interrupted session from reading as truncated — it bounds the frozen-size window to one flush interval. See §5.3 (SESSION_END semantics). Samples in the final ≤1 s before a hard cut reach the card but lie beyond the committed size and require raw-device recovery.

- Min free space threshold: 200 MB (~1.3 hr at peak load)
- At threshold: stop logging, BLE notify — do not crash
- Future: overwrite oldest session (config option, default off) — TODO #17

### 10.3 Version Compatibility
- All versions from v1.0 forward are mutually compatible
- Config JSON: firmware ignores unknown fields; app warns if firmware is newer
- Binary format: the app supports the current schema and the immediately prior schema during a transition window (≈2 weeks after a schema bump). After the window closes, the older parser is removed; files in that older schema are no longer readable by the current app.
- Binary record types: new types skipped by old parsers — never modify existing record layouts

### 10.4 RF coexistence — WiFi SoftAP vs. BLE

The firmware enforces a hard mutex between SoftAP and BLE central
(HRM) via the §7.2 ACK protocol: `CMD_WIFI_ON` returns `0x03` while
a session is running, and `CMD_START_LOGGING` returns `0x03` while
SoftAP is up. Coordination between subsystems happens through a
FreeRTOS event group (`mode_state.{h,c}`) with bits for `WIFI_UP`
and `LOGGING_ACTIVE`. `wifi_server.c` and `session.c` are the only
producers; subsystems that need to react (HRM, IMU, GPS) subscribe
via `xEventGroupWaitBits` / `xEventGroupGetBits`. New mode-aware
subsystems opt themselves in — no central-code changes required.

When WiFi comes up the HRM link is dropped (STREAMING → SUSPENDED)
and re-established when WiFi turns off. The IMU and GPS tasks likewise
suspend their sensor bus reads while `WIFI_UP` is set: the mutex
guarantees no session is logging, so there is no consumer for sensor
data, and IMU0 shares the SPI bus with the SD card — suspending hands
the bus and CPU to the `/download` path. The IMU FIFOs are drained
(discarded) and the GPS UART flushed on resume.

**Radio handoff — BLE off in WiFi mode.** The coexistence table marks
SoftAP (station connected) + BLE as "C1 — unstable", and the
time-slicing scheme cedes up to ~50% of radio time to a connected BLE
link. The firmware therefore drops the *peripheral* GATT (phone
connection) too, once the app no longer needs it:

1. `CMD_WIFI_ON` (BLE) brings the AP up. BLE stays fully up.
2. The app links over HTTP and verifies identity via `/ping` (§6.1).
3. The app sends `POST /handoff`; firmware disconnects the phone and
   stops advertising. WiFi now owns the radio outright.
4. WiFi mode ends via `POST /wifi_off` (HTTP), after which the AP
   tears down and BLE advertising resumes; the app reconnects.

Until `/handoff` arrives, `CMD_WIFI_OFF` over BLE remains the abort
path — a phone that never achieves an HTTP link is never stranded
without a control channel.

**No-activity failsafe.** While in WiFi mode the firmware tracks AP
station count and the last-HTTP-request time. Five minutes with no
connected station, or five minutes with no HTTP request, exits WiFi
mode autonomously and resumes BLE advertising — the device can never
be stranded in AP mode draining battery. The app's 10 s `/ping`
heartbeat keeps an active link alive indefinitely.

---

# PART 3 — APP ARCHITECTURE

## 11. App Architecture

> **Status note (2026-09-03):** this section is L5's first draft, written
> alongside `docs/superpowers/plans/2026-09-03-idl1-wave1-l5-tauri-scaffold.md`.
> L10's plan does a cross-lane consistency pass once L1–L4, L6 and L7 have
> also landed and named their own module paths — treat any Rust module path
> below as illustrative until then.

### 11.1 Layers

The authoritative layer table and decision rule live in `CLAUDE.md` §2 —
this section does not repeat them. In one line: `rust/core` is the pure
engine (no Tauri, no async runtime, no network); `rust/transport` is device
and LAN I/O; `rust/tauri` (`idl-rs-tauri`) is thin `#[tauri::command]` glue
over both and the only crate the frontend sees; `app/src-tauri` is the Tauri
app crate (builder, plugin registration, mobile plugins); `app/src` is the
TypeScript UI, which talks only to `idl-rs-tauri` commands.

This replaces idl0's Dart/Rust split (`flutter_rust_bridge`, Riverpod
providers, `sqflite`) in full — Flutter is not part of idl1 (design doc D1).

### 11.2 IPC

Every command, its argument/return shapes, the binary tile/raster layouts,
the typed error shape, and the interaction budget (which commands may never
run on a hot path) are fixed by contract C3
(`docs/superpowers/specs/2026-09-03-idl1-c3-ipc-surface.md`) — not restated
here. `app/src/ipc/*.ts` (one module per C3 §3 command group) is the only
place `app/src` is allowed to import `@tauri-apps/api/core` (C3 §1).

### 11.3 Platform targets

Desktop (Windows/macOS/Linux) and mobile (Android/iOS) both run the same
Tauri v2 shell and the same `idl-rs-tauri` command set — there is no separate
web/PWA target (unlike idl0's Flutter web lane, which idl1 does not carry
forward). Mobile BLE and WiFi-network binding are Tauri mobile plugins over
the same Rust transport traits desktop uses (design §7; lane L9, wave 2–3).

### 11.4 State management

React (design D12). The app-shell state (current tab, resolved `<data>` path,
engine version) is a `Context` + `useReducer` store with no external
dependency (`app/src/state/AppState.tsx`, lane L5). Riverpod, Provider and
Bloc are idl0-only and do not apply (`CONTRIBUTING.md`). Whether the notebook
view's reactive cross-runtime DAG (design §4, "one graph, two schedulers")
needs a heavier state library is L6's decision, recorded here when made — see
this plan's Open Questions.

### 11.5 File model and local database

Superseded by contracts C1 (session schema) and C4 (data directory) in full
— `docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md` and
`…-c4-data-directory.md`. In one line: raw sources are immutable,
content-addressed blobs; `data.parquet`/`derived/*.parquet` are functions of
those blobs; `session.json` replaces `.idl0w`; `.idl1wb` (C2) replaces
`.idl0wb`; `catalog.sqlite` is a rebuildable index that is never synced (C4
§5) — nothing reads it for truth.

### 11.6 File watcher

`notify` on `<data>/workbooks` only, self-write suppression via an
expected-hash set, ~100 ms debounce (C4 §4, design §7). Built in
`rust/tauri/src/watcher.rs` (lane L5); wired to per-cell diffing once L3's
workbook parser lands (C3 §3.4 `watch_workbook`).

---

## 12. State Management

**Riverpod only.** No Provider, no Bloc, no setState except local widget state.

Provider structure:
```
providers/
├── device_provider.dart         — BLE state, device config, recording
├── session_provider.dart        — loaded session metadata list
├── selection_provider.dart      — XOR session-or-lap app-wide selection
├── channel_provider.dart        — raw + calibrated channel data
├── math_channel_provider.dart   — lazy-evaluated math channel output
├── workspace_provider.dart      — active workbook/worksheet, layout
├── lap_provider.dart            — lap detection, gate definitions
├── data_filters_provider.dart   — Data tab faceted-search state
└── data_results_provider.dart   — derived SessionRow / TrackRow /
                                    FacetCounts for the Data tab
```

Math channel providers use `FutureProvider.family` — evaluated lazily on demand, never pre-computed.

**Selection (XOR).** `selectionProvider` is the single source of truth
for what the Analyze tab and other downstream consumers should render.
It carries a `mode` (`session` or `lap`) and exactly one populated set —
either `sessionIds: Set<String>` or `lapKeys: Set<LapKey>`. Toggling an
entry of the inactive kind flips mode and clears the inactive set; the
"session selected AND a lap selected" mixed state cannot exist.
Downstream consumers prefer the derived providers `effectiveSessionIdsProvider` (sessions to render — sessionIds in
session-mode, distinct sessionIds drawn from lapKeys in lap-mode) and
`effectiveLapKeysProvider` (lap-mode lapKeys, empty otherwise). The
Analyze tab currently honours session resolution only; the lap keys are
exposed for a follow-up pass to filter charts to specific laps.

See §13 for the full Selection Model specification.

---

## 13. Selection Model

### 13.1 Purpose

Selection state is app-global with a strict XOR rule: the user is either selecting whole sessions OR individual laps, never mixed. This eliminates the cognitive complexity of comparing "session A as a whole" vs "lap 3 of session B" — the typical comparisons are session-vs-session or lap-vs-lap.

**File.** `app/lib/providers/selection_provider.dart`.

### 13.2 Types

```dart
enum SelectionMode { session, lap }

class LapKey {
  final String sessionId;
  final int lapNumber;        // 1-based
  // Implements ==, hashCode, toString for Set semantics.
}

class Selection {
  final SelectionMode mode;
  final Set<String> sessionIds;     // populated when mode == session
  final Set<LapKey> lapKeys;        // populated when mode == lap
  final LapKey? mainLapKey;         // N-lap comparison reference; lap-mode only.
                                    // null ⇒ auto = fastest selected lap.
  bool get isEmpty => sessionIds.isEmpty && lapKeys.isEmpty;
}
```

`mainLapKey` designates the **Main** lap for N-lap comparison (§26.13) — the reference every selected lap is measured against. It is meaningful only in lap-mode and only when it is a member of `lapKeys`; `null` means "auto" (the fastest selected lap is Main). The overlay laps are derived (selected laps minus Main), never stored.

### 13.3 Provider

```dart
final selectionProvider =
    NotifierProvider<SelectionNotifier, Selection>(SelectionNotifier.new);

class SelectionNotifier extends Notifier<Selection> {
  Selection build() => const Selection(
    mode: SelectionMode.session, sessionIds: {}, lapKeys: {},
  );

  void toggleSession(String sessionId);   // flips to session-mode if needed
  void toggleLap(LapKey key);              // flips to lap-mode if needed
  void selectMany({Set<String>? sessions, Set<LapKey>? laps});
  void setMainLap(LapKey? key);            // designate Main, or null for auto
  void setMode(SelectionMode mode);        // also clears the inactive set
  void clear();
}
```

`setMainLap` is a no-op outside lap-mode or when `key` is not a current lap selection. The Main designation auto-resets to `null` (auto) when the Main lap is deselected, the selection is cleared, or the mode leaves lap.

### 13.4 Toggle Semantics

When the operation disagrees with the current mode, the inactive set is cleared and mode flips. Concretely: calling `toggleSession` while in lap-mode clears `lapKeys`, sets `mode = session`, then adds the sessionId. Same in reverse. UI surfaces (Data tab checkboxes, Session Sheet checkboxes) honor this — clicking a "muted" checkbox flips the global mode.

### 13.5 Derived Providers

Charts that operate on whole-session windows watch `effectiveSessionIdsProvider`, which returns `selection.sessionIds` in session-mode and `{for k in selection.lapKeys} k.sessionId}` in lap-mode (the parent sessions). Lap-aware charts watch `effectiveLapKeysProvider`, which returns `selection.lapKeys` in lap-mode and `{}` in session-mode.

```dart
final effectiveSessionIdsProvider = Provider<Set<String>>((ref) {
  final s = ref.watch(selectionProvider);
  return s.mode == SelectionMode.session
      ? s.sessionIds
      : s.lapKeys.map((k) => k.sessionId).toSet();
});

final effectiveLapKeysProvider = Provider<Set<LapKey>>((ref) {
  final s = ref.watch(selectionProvider);
  return s.mode == SelectionMode.lap ? s.lapKeys : const {};
});
```

### 13.6 Scope

Single source of truth, app-wide. No per-tab or per-worksheet selection state. The Data tab and Analyze tab's Session Sheet both read and write the same provider.

---

## 14. Error Handling

### 14.1 Exception Hierarchy
```
IdlException
├── ParseException
│   ├── InvalidMagicBytesException
│   ├── UnsupportedSchemaVersionException
│   ├── TruncatedRecordException
│   └── UnknownRecordTypeException
├── CalibrationException
│   └── InsufficientMotionException
├── MathChannelException
│   ├── UnknownChannelException
│   ├── ExpressionSyntaxException
│   └── DivisionByZeroException
└── TransportException
    ├── DeviceNotFoundException       — BLE scan: no device with IDL0 service UUID found
    ├── DeviceUnreachableException    — WiFi: connection refused, host unreachable, or non-200 on control endpoint
    ├── FileListParseException        — WiFi: /files response is not a valid JSON array (firmware version mismatch)
    ├── TransferTimeoutException      — file download did not complete within retry budget
    └── TransferChecksumException     — received file checksum does not match expected
```

### 14.2 Behavior

| Exception | Behavior | User message |
|-----------|----------|--------------|
| InvalidMagicBytes | Reject file | "Not a valid IDL0 log" |
| UnsupportedSchemaVersion | Reject file | "Update the app to open this file" |
| TruncatedRecord | Return partial session | "Log incomplete — showing data to [timestamp]" |
| UnknownRecordType | Skip record, continue | Silent (debug log only) |
| UnknownChannel | Inline editor error | "Channel '[name]' not in this session" |
| ExpressionSyntax | Inline editor error | "Syntax error at position N" |
| TransferTimeout | Retry 3× with backoff (transport layer retries — caller sees final result or exception) | "Transfer timed out. Check WiFi." |
| TransferChecksum | Discard, offer retry | "Transfer error. Retry?" |
| CalibrationException | Abort, keep previous | "Calibration failed — was bike stationary?" |

Hard crashes in response to bad data are never acceptable. Debug log ring buffer (last 500 entries) accessible via Settings → tap version 5×.

---

### 14a. Transport Trait Architecture (idl1)

Added by idl1 lane L4 (`rust/transport`, crate `idl-transport`). Fixes the app-side facts §6–8
leave to the implementation: the Rust trait shapes every platform's device connection code
implements, and the timeout/retry/chunking defaults this lane chose where §6–8 leave them to
the client.

**Traits.** `BleTransport` and `WifiTransport` (`rust/transport/src/ble_transport.rs`,
`wifi_transport.rs`) — one method per §6.1/§7 operation the app needs. Desktop implements both
with `btleplug`/`reqwest` in this crate; a Tauri mobile plugin (L9) implements the same two
traits against the platform BLE stack and WiFi-network-binding proxy (§6.2). Because desktop
and mobile are separate compiled targets, neither trait needs to be object-safe (`dyn`-callable)
— each platform's Tauri app crate picks its concrete type at compile time.

**Known platform limitation — the ACK byte is unreachable on Windows.** §7.2 defines a one-byte
ACK code returned by every Control (FF03) write (`0x00` success; `0x03` mutex/precondition
refusal; `0x80`/`0x81`/`0x82` reserved), decoded here by `ble_control::AckCode::from_byte`
(pure, unit-tested). On Windows, `btleplug` 0.13.0's `winrtble` backend cannot surface that
byte: `Peripheral::write` returns only `Result<()>`, and internally `write_value` calls WinRT's
`WriteValueWithOptionAsync`, inspecting only the resulting `GattCommunicationStatus`
(`Success`/`Unreachable`/`ProtocolError`/`AccessDenied`) — the device's actual application error
code is never read off the WinRT `GattWriteResult` and so never reaches this crate (verified
against `btleplug` 0.13.0's own pinned source, `winrtble/ble/characteristic.rs::write_value`).
Consequently `BtleplugBle::send_command` (`rust/transport/src/ble_transport.rs`) can only
observe `Ok(())` for `AckCode::Success`, or a `TransportErrorKind::Ble` carrying `btleplug`'s own
coarse error text for every other case — including §7.2's mutex refusals. The specific ACK code
(`0x03` vs `0x80` vs `0x81` vs `0x82`) is not recoverable from a real write on this platform.
This is a genuine platform-API limitation confirmed against the pinned `btleplug` source, not a
gap in this crate's own logic; `AckCode::from_byte` stays exported and unit-tested because a
future `btleplug` version, a different backend, or L9's mobile plugins on iOS/Android may expose
the real byte. Found and documented during Task 7 — `ble_transport.rs`'s `send_command` doc
comment carries the same finding in-line, at the point of use.

**Config is opaque to this layer.** Both traits' config methods take/return `&[u8]`/`Vec<u8>`
never a parsed struct — §8's schema is validated by `idl-rs` core's `parse_config` before a
byte reaches either trait (contract C3 §3.8). The one config-shaped check this layer owns is
§7.2's push-verification byte comparison (read the pushed config back, compare bytes) — not
JSON parsing.

**BLE scan is a live channel, not a batch return** (resolves contract C3 §2 open question 6):
`BleTransport::scan` returns a `tokio::sync::mpsc::Receiver<DiscoveredDevice>` fed as
`btleplug` reports each discovery, for the duration of the timeout — matching `btleplug`'s own
event-based scan API and C3's `ble_scan(timeout_ms, progress: Channel<DeviceDiscovered>)`
shape, which the Tauri command layer (L5) fulfils by draining this channel into the IPC
`Channel`.

**Chunk size for config push (§7.2 "MTU-sized chunks").** Defaults to 20 bytes (the default
BLE ATT MTU of 23 bytes minus 3 bytes of write-request overhead) when the negotiated MTU can't
be read back from `btleplug` on the connecting platform; uses the negotiated MTU minus 3 when
it can. See Open question 7 in the L4 plan for why this isn't uniform across platforms.

**Download resume.** `WifiTransport::download`'s `resume_from_bytes` parameter is the caller's job to
determine (typically: bytes already on disk for a partially-downloaded blob) — this trait
issues the `Range` request and trusts the server's `206`/`Content-Range` echo, erroring
(`TransportErrorKind::Wifi`) rather than silently resuming from the wrong offset if the two
disagree.

**Timeouts.** BLE scan: caller-supplied (`Duration` argument). BLE connect, GATT read/write,
and WiFi requests: no default fixed by this lane — see Open question 10.

---

# PART 4 — APP DATA MODEL

## 15. Session & File Model

The `.idl0` binary parser and the parser-output data model live in the
pure-Rust **`idl-rs`** engine (`rust/core`). The app consumes them through
`idl-rs-tauri` `#[tauri::command]` handlers (contract C3) rather than
FlutterRustBridge: a session opens into an in-process `SessionHandle` the
Rust side owns, and the frontend pulls output-shaped views on demand — a
compact metadata summary, the channel list, per-channel samples over IPC as
raw bytes (`tauri::ipc::Response`), never JSON for sample data. The handle
carries an interior-mutable, typed derived-channel store keyed by kind
(math-channel outputs by name; lap-windowed slices by `(source, role, lap)`)
exactly as before — this part of the architecture is unchanged by the idl1
rewrite. What changes is the on-disk and canonical-model layer beneath it,
fixed by contract **C1** (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`):

- **Canonicalise on ingest** (design doc D3). Every source format (`.idl0`,
  `.fit`, `.gpx`, `.csv` — the last three are L2's importers) converts once,
  at import, into the one `Session`/`Channel` model below, and is written to
  `<data>/sessions/<session_id>/data.parquet` (contract C4 fixes the path).
  The raw source bytes are kept immutable and content-addressed in the CAS
  blob store (`<data>/blobs/sha256/…`); `data.parquet` is a pure function of
  `(blob, importer_version, seam_correction_version)` and is regenerated from
  the blob whenever either version changes — it is never hand-edited and
  never modified in place.
- **Time is recorded, not assumed.** Every channel carries a mandatory
  per-sample time column, `t_us: Vec<i64>` — microseconds since the
  session's first sample, one entry per sample, strictly increasing. This
  replaces the old convention where a fixed-rate channel's sample `i` was
  implicitly at `i / sample_rate_hz`; `nominal_rate_hz` is metadata only and
  **never** derives a sample's time on any code path (C1 §3.5). A burst-drained
  IMU's raw per-record timestamps are preserved verbatim in a
  `<source>_t_recorded_us` column and separately corrected into the
  monotonic `t_us`/`t` axis by the burst-seam correction algorithm (C1
  §3.3) — see §15.2 below.

### 15.1 Session Metadata

Source: C1 §2 (canonical model) and C1 §6 (`session.json`, which replaces
`.idl0w` — see §16.3/§17 for how track visits and lap flags fit in).

```rust
/// One imported session — the parsed/converted view of one immutable source blob.
pub struct Session {
    pub session_id: String,             // device UUID (.idl0) or blob-hash prefix (else), C4 §3
    pub device_id: Option<String>,      // None for fit/gpx/csv
    pub timestamp_utc_ms: i64,          // 0 = unknown
    pub config_checksum: Option<String>,// None for fit/gpx/csv
    pub source_format: SourceFormat,    // Idl0 | Fit | Gpx | Csv
    pub blob_sha256: String,            // 64-char lowercase hex
    pub channels: Vec<Channel>,
}
```

`SessionMetadata`'s Dart-era shape (`sessionId`, `filePath`, `workspacePath`,
`rider`, `bike`, `venueName`, …) is superseded by two files: `Session`
above (parser output, one per blob) and `session.json` (C1 §6 — rider,
bike, venue, event, comments, tag, lap gates, cached laps, track visits,
lap flags; replaces every field `Workspace`/`SessionMetadata` used to
split between `.idl0w` and the SQLite index). The SQLite `sessions` table
(C4 §5) caches a denormalised projection of both files for fast list/filter
queries — it is never authoritative (design doc: "the catalog is an
index").

**On-disk file naming.** A session's files live under
`<data>/sessions/<session_id>/` (C4 §2) — `session_id` is now a directory,
not a filename stem, and needs no collision-suffix scheme at that level
(C4 §3 fixes a separate collision rule for non-device `session_id`
derivation itself). The **workbook filename** (`workbooks/<file_name>.idl1wb`)
is still human-named and still uses the append `-2`, `-3`, … collision rule
(C4 §2), continuing the convention `session_filename.dart` established for
the old `.idl0`/`.idl0w` pair.

**Session source type** is now `Session.source_format: SourceFormat`
(`Idl0 | Fit | Gpx | Csv`), replacing the two-value `SessionSourceType`
enum. `device_id`/`config_checksum` are `Option<String>` (`None` for
non-`.idl0` sources) rather than the old empty-string sentinel.

### 15.2 Canonical Model and the Time Axis

```rust
/// Time-series data for a single channel. Every channel carries mandatory
/// per-sample time — see C1 §3.
pub struct Channel {
    pub channel_id: String,        // e.g. IMU0_AccelZ, GPS_Latitude, WheelFront
    pub t_us: Vec<i64>,            // µs since the session's first sample; strictly increasing
    pub nominal_rate_hz: f64,      // metadata only — never derives a sample's time
    pub column: RawColumn,
    pub source_kind: String,       // imu0 | imu1 | imu2 | gps | wheel_front | … | fit | gpx
    pub gaps: Vec<GapSpan>,        // synthesized-sample runs, unchanged semantics
    pub t_recorded_us: Option<Vec<i64>>, // verbatim recorded stamp; None when identical to t_us
    pub unit: String,              // e.g. "g", "km/h", "deg" — Parquet column `unit` metadata
}
```

`t_us[i]` traces back to a recorded device/GPS/FIT/GPX timestamp, verbatim
or burst-corrected — never `i / nominal_rate_hz` (C1 §3.5 invariant 4). The
one documented, scoped exception: `Session.channels`'s *synthesized*
`Time`/`Distance` presentation channels (unchanged in role from the pre-idl1
engine — a zero/low-storage convenience for chart/math consumers, never
written to `data.parquet`) derive their `t_us` from the real, already-corrected
`t_us` of the fixed-rate channel they present, not from their own rate — see
`rust/core/src/session/synthesis.rs`'s doc comment for the exact rule.

`Channel.t_recorded_us`/`Channel.unit` are the in-memory homes for two values
C1 §4.1/§4.2 mandate on the Parquet side (added to C1 §2 post-sign, lead
ruling R5): `t_recorded_us` is `None` unless burst-seam correction actually
diverged this channel's corrected `t_us` from its verbatim recorded stamp, so
the writer has something to serialize into `<source>_t_recorded_us` beyond
the common (non-burst) case; `unit` carries the channel registry's existing
`units` value through to the `unit` column-metadata key, which §4.2 requires
unconditionally and which parsing used to discard after use.

**IMU burst-seam correction.** Every IMU FIFO read stamps its samples by
walking back from the read instant at the *nominal* ODR (SPEC §5.5); when
the true ODR differs from nominal this makes the recorded stamps overlap or
gap at burst seams — locally non-monotonic time. C1 §3.3 fixes a documented,
versioned correction: detect bursts from the recorded-stamp deltas, estimate
each burst's true period from consecutive read-instant spacing (median
across the session, a per-burst local fallback when the session-wide
estimate would violate monotonicity), and re-space each burst backward from
its own read instant at the corrected period. The corrected stamps feed
drop reconciliation (`ImuGridPlan::build`/`reconcile`,
`rust/core/src/parse/records.rs`) in place of the nominal period, so
reconciliation only ever sees genuine FIFO drops, not the phantom ones a
true-ODR offset would otherwise manufacture against a nominal grid (C1 §3.3
carries the full worked derivation of why). The algorithm version
(`seam_correction_version`, currently `"v1"`) is `data.parquet` file
metadata and triggers regeneration from the blob on a version bump, exactly
like `importer_version`.

**`<source>_t_recorded_us`.** One per source present in a session (not per
channel — all six axes of one IMU share one `imu0_t_recorded_us`), holding
the verbatim recorded stamp with no correction applied; not guaranteed
sorted (C1 §3.2).

**The union axis `t`.** `data.parquet`'s own `t` column is the sorted,
deduplicated union of every channel's `t_us` values in the session (C1
§3.5 invariant 2) — the file's row axis; a channel's column is null on
every row where it did not sample.

FIT/GPX sources have no burst structure: their recorded timestamp maps to
`t` directly, and `_t_recorded_us` is bit-identical to `t` by definition
(C1 §3.4) — kept anyway for schema uniformity across every source.

### 15.3 Sample lifecycle for chart rendering

The retained `SessionHandle` (§15 intro) owns every channel's samples — base, synthesized, and resolved math channels (the math store written via `add_channel`). Samples are stored **compactly**: each channel is a typed raw column (`RawColumn`) — IMU axes and i16/i32/f32 registry channels keep their raw wire values plus a `scale`/`offset` pair (2–4 bytes/sample); GPS and math channels are verbatim f64; synthesized `Time` is a zero-storage ramp (`value(i) = i / rate`) and `Distance` stores only GPS-rate metres, lazily interpolated onto the Time grid. Physical f64 is **materialized lazily** as `physical = (raw as f64) × scale + offset`, only for the consumer that asks, and is never resident. The Analyze chart decimates min/max tiles directly from it: `decimate_tile(handle, channel_id, tier, tile_index)` folds min/max per bucket over the raw column — no f64 window is materialized at any tier (an all-NaN tile for an absent channel). A session's samples therefore exist in exactly one place — the engine, in compact form — and never round-trip over IPC for charting.

**The charts self-source every view by channel id.** The frontend holds no copy of a channel's samples. Each Analyze chart is handed only channel *metadata* (`SessionChannelData`: `sessionId`, `channelId`, `sampleRateHz`, `length`, `isEventDriven`, built from `sessionChannelMetaProvider`) and pulls the bounded view it needs from the handle: the time-series line decimates tiles (`decimate_tile`) and reads Y-bounds from `channel_min_max` (engine-folded, no materialization) plus event-driven sample times from `channel_sample_times`; the FFT reads its spectrum from `welch_channel` (computed in the engine — only the `WelchResult` crosses IPC, never the samples); the histogram reads its value distribution from `channel_histogram` (binned in the engine — only the `HistogramResult` crosses IPC); the GPS map reads the fix list from `gps_track`, and for a channel-coloured trace one value per fix from `gps_channel_values` (the channel resampled nearest-sample onto the GPS fixes — only the small per-fix vector crosses IPC, never the column). Everything the chart renders is therefore a channel resident in the handle, addressed by id — including derived traces: a displayed **math channel** is evaluated-and-stored entirely engine-side (`eval_math_into_store(handle, expression, store_as, lap_ctx)` upserts the result under the channel name and returns only `(length, sample_rate_hz)` — the sample vector never crosses IPC), and a **lap-window slice** for the lap-compare overlay is sliced-and-stored engine-side via `slice_by_time_into_store` under a `'<id> (main)'` / `'<id> (overlay)'` name (only the length crosses IPC), then decimated like any channel. The Maths-tab expression preview likewise reads one decimated tile of the stored result, never the samples.

Decimated tiles are cached in the app (`ChartTileCache`, §26.8) and invalidated when:
- The session is removed from the active selection (which fires on session deletion from the library) — `SelectionNotifier` clears the cache slice.
- A math channel's expression changes — the tile cache is invalidated across every session for that channel id, and the next render decimates the upserted evaluator output straight from the handle. Hooked from `MathChannelNotifier.updateChannel` / `deleteChannel`.

The retained handle has a **bounded lifetime** (Phase E): `sessionHandleProvider`
is `autoDispose` and pins itself with `keepAlive()`, handing its link to a
`HandleResidencyController` along with the handle's engine-reported resident
size (`session_resident_bytes`). The controller keeps every selected session
resident plus the most-recently-used deselected ones that fit a **byte budget**
(1 GiB default — byte-based, not handle-count-based, so eight small sessions
and one season-scale log are budgeted alike); beyond it, it closes the
least-recently-used handle's link (the handle autodisposes; the provider's
`onDispose` calls `dispose()` on the handle, freeing its Rust samples
deterministically rather than at GC-finalizer time) and invalidates that
session's chart tiles. The per-session providers
that read the handle (`sessionChannelMetaProvider`, `channelBoundsProvider`,
`channelSampleTimesProvider`, `fftSpectrumProvider`, `gpsTrackProvider`,
`lapSlicedChannelProvider`, `sessionStartMsProvider`, `sessionLapsProvider`,
`visitLapsProvider`, `lapDistanceAccumulatorProvider`, `mathChannelEvalProvider`)
are `autoDispose` so deselect releases their handle subscriptions. Re-selecting
within the warm window reuses the live handle (no re-parse); beyond it, the
session re-parses on demand.

The `.idl0` file is the source of truth; the engine parses it and owns the parsed session. There is no separate process-global sample registry — the chart reads the handle the same way the math evaluator (§19) does.

### 15.4 Video links (`videos[]`, workspace v8)

A session workspace may reference any number of external video files (§33). Each entry in the `videos[]` array (added in workspace_version 8; older files load with an empty list):

| Field | Type | Meaning |
|-------|------|---------|
| `id` | string | Stable UUID assigned app-side at link time |
| `path` | string | Absolute path to the video; may live outside the session folder |
| `file_size_bytes` | int | Size at link time — cheap re-link validation without hashing multi-GB files |
| `file_mtime_ms` | int | Modification time at link time, UTC ms |
| `sync_offset_s` | double | `session_time_s = video_time_s + sync_offset_s`, seconds |
| `sync_method` | string | `gpmf` \| `creation_time` \| `manual` |
| `sync_confidence` | double? | 0.9 gpmf / 0.3 creation_time; **null for manual** — omitted from JSON |
| `label` | string? | Optional user-facing name, e.g. `Chest cam` — omitted when unset |

Semantics:
- **Linking auto-syncs.** At link time the app estimates `sync_offset_s` engine-side (§33.3): GPMF UTC anchor when the container carries one, else container creation time. A container with no usable anchor degrades to `manual` at offset 0 for the user to nudge. A video whose time range does not overlap the session is refused (surfaced as a mismatch), not stored.
- **A manual sync is never silently overwritten** — re-estimation only happens on explicit user action, and a `manual` method always stores a null confidence.
- **A missing/moved file prompts a re-link, never blocks workspace load.** `file_size_bytes` + `file_mtime_ms` verify a candidate file is the same recording.
- The `.idl0` log remains untouched — video links are derived work and live only in `.idl0w`.

---

## 15a. Non-device Importers (FIT, GPX, CSV)

Companion to §15 (`.idl0` binary parsing) for the three source formats a
device never wrote. Design doc D3 ("canonicalise on ingest") and D4
("hardware-agnostic... a decade of FIT/GPX is a first-class target; CSV is
low priority") — `docs/superpowers/specs/2026-09-02-idl1-rewrite-design.md`.
Contract C1 (`docs/superpowers/specs/2026-09-03-idl1-c1-session-schema.md`)
fixes the output shape (`Session`/`Channel`, §2) and the time-model rules
(§3.4) every importer in this section obeys; this section is the importer
*behaviour* spec C1 §1 explicitly leaves to the lane.

### 15a.1 The `Importer` trait

`rust/core/src/import/mod.rs` defines one trait, implemented once per
non-device `SourceFormat` (C1 §2): `source_format() -> SourceFormat` and
`import(bytes: &[u8], blob_sha256: &str) -> Result<ImportedSession,
ImporterError>`. Pure: `bytes` is the caller-already-read, immutable source
blob; `blob_sha256` is the caller-computed SHA-256 hex digest (CAS hashing
is C4's/L1's job, not repeated here). `session_id` (C4 §3: first 16 lowercase
hex characters of `blob_sha256` for non-device sources) is derived by
`session_id_from_blob_hash`, a free function every importer calls —
collision extension (18, 20, ... hex characters, on a real catalog
collision) needs catalog state this pure function does not have, and is
L1's job at catalog-insert time. `.idl0` import (`crate::parse` plus L1's
burst-seam correction, C1 §3.3) does not implement this trait in this
section's scope; whether/how L1 wires it in is L1's call.

`ImportedSession { session: Session, warnings: Vec<ImporterWarning> }`
(renamed from the plan's original `ImportOutcome`/`ImportWarning` to avoid
a type-name collision with landed `store::import`/`session` types of those
same names — the *shape* is unchanged: one `Session` plus zero or more
warnings). `ImporterError` is a typed enum (CLAUDE.md §5 — never
`Err(String)`); variant names are written to fit the `parse_*`
kind-vocabulary prefix contract C3 §2 assigns to importer/parser errors
(mirroring `crate::session::ParseError`'s existing `parse_*` kinds for
`.idl0`), but **C3 §2's kind table does not yet list rows for these new
variants** — see Open Questions. (A future importer registry making importers
enumerable is Task 7's scope, ledger ruling R51 Q2 — not specified here and
not part of this trait's shape.)

### 15a.2 FIT import

`FitImporter`, via the `fitparser` crate (pin `0.9`). Reads every `record`
(global message 20) message; ignores every other message kind (`lap`,
`session`, `file_id`, ...) — lap/session metadata is L1's `session.json`
concern (C1 §6), not this importer's.

| FIT field (name, as decoded by `fitparser`) | idl1 channel | Conversion |
|---|---|---|
| `timestamp` (`Value::Timestamp`) | (time axis only) | `fitparser` already applies the FIT-epoch offset (1989-12-31 UTC); `.timestamp()` on the decoded value is UTC epoch **seconds**, matching C1 §3.1's `(fit_timestamp_s + 631065600)` formula with the offset already folded in. |
| `position_lat` / `position_long` (`Value::SInt32`, semicircles) | `GPS_Latitude` / `GPS_Longitude` | `degrees = semicircles × 180 / 2^31` (FIT SDK's documented conversion) |
| `enhanced_altitude` (`Value::Float64`, metres — `fitparser` applies `raw/5 − 500` itself since field 2's scale/offset are non-trivial; the plain `altitude` field is not emitted unless `DecodeOption::KeepCompositeFields` is requested, which this importer does not do) | `GPS_Altitude` | direct (already physical) |
| `heart_rate` (`Value::UInt8`, bpm) | `HR_BPM` | direct |
| `cadence` (`Value::UInt8`, rpm) | `Cadence_RPM` | direct |
| `power` (`Value::UInt16`, watts) | `Power_W` | direct |

**Units (L2-R1, copied verbatim from C1 §4.1's "*(FIT/GPX-derived
channels)*" row):** `GPS_Latitude`/`GPS_Longitude` → `deg`, `GPS_Altitude`
→ `m`, `GPS_EpochMs` → `ms_raw`, `HR_BPM` → `bpm`, `Cadence_RPM` → `rpm`,
`Power_W` → `W`. (`GPS_SpeedKmh` → `km/h` and `GPS_Heading` → `deg` belong
in this same units list for completeness even though neither channel is
populated by this importer — §15a.3's L2 follow-on S/H (post-archive) note applies here too.)

**GPS coordinate scale — physical decimal degrees (R27).** `GPS_Latitude`/
`GPS_Longitude` are physical decimal degrees, `unit: deg`, for **every**
source (R27, superseding an earlier, since-reversed ruling R23 that briefly
set this to `deg_e7`; R27 has already landed in code — idl-rs `7e10797` —
and every landed consumer now reads decimal degrees:
`core/src/gps.rs`, `laps::distance` — whose `M_PER_UNIT` is plain
`111_320.0` again — `laps::gate_*`, `tracks::*`). This importer's
`semicircles_to_deg` output (the conversion above) is stored **unchanged**,
with no further scaling — the same holds for GPX (§15a.3): no channel in
this section carries `deg_e7`.

Matches C1 §4.1's FIT/GPX-derived column list exactly (`GPS_Latitude`,
`GPS_Longitude`, `GPS_Altitude`, `HR_BPM`, `Cadence_RPM`, `Power_W` —
C1's list also names `GPS_EpochMs`; see the paragraph below). A channel is
present in the output `Session` only when at least one `record` message
carries that field (C1 §4.1 "as applicable") — genuinely per-record: a
record missing `power`, say, contributes no sample to `Power_W` rather
than a zero-filled one, since different `record` messages in one FIT file
commonly carry different subsets of fields.

**`GPS_EpochMs`.** FIT **does** populate `GPS_EpochMs`, from
`record.timestamp` (a UTC instant), on every `record` message carrying a
position (both `position_lat` and `position_long` present) — matching
C1 §4.1's now-explicit text. Wire-level formula:
`GPS_EpochMs = (fit_timestamp_s + 631_065_600) * 1000`, where
`fit_timestamp_s` is the **raw FIT-epoch-relative** wire value (seconds
since 1989-12-31). This is the wire-level formula for reference only:
Task 4's own code decodes the FIT `timestamp` field via `fitparser`, whose
`Value::Timestamp(..).timestamp()` already returns Unix-epoch seconds with
this same `+631_065_600` folded in by the crate itself — Task 4's importer
must not add the offset a second time to that already-converted value.
Unit `ms_raw`.

**Timestamp dedup is record-level, not per-channel.** C1 §3.4 states the
duplicate/non-monotonic drop rule per *channel*; every FIT `record` message
carries exactly one `timestamp` shared by every field on that message (a
FIT protocol invariant), so dropping the whole record when its timestamp
collides with the previous *kept* record is equivalent to the per-channel
rule applied to every one of that record's fields at once — this importer
does it once, at the record level, rather than redundantly per output
channel.

### 15a.3 GPX import

`GpxImporter` — a port of `gpx_parser.dart`
(`app/lib/data/gpx_parser.dart` in idl0-app), via `quick-xml` (pin `0.41.0`
— see Open Questions on provenance). Iterates `<trkpt>` elements; local-name
matching (namespace-prefix-agnostic, matching the Dart parser's approach)
finds `<ele>`, `<time>`, and (regardless of nesting depth under
`<extensions>`) `<hr>`, `<cad>`, `<power>`.

| GPX element | idl1 channel | Notes |
|---|---|---|
| `<trkpt lat lon>` | `GPS_Latitude`, `GPS_Longitude` | decimal degrees, direct (C1 §4.1: `unit: deg`) — **not** scaled ×1e7 as `gpx_parser.dart` did for the old Dart engine's raw-wire convention; under R27, C1's non-device row stores physical degrees directly, for every source |
| `<ele>` | `GPS_Altitude` | metres; per-field `Option` semantics (L2-R6) — a trackpoint with no `<ele>` contributes no sample, never a `0.0` fill; `GPS_Altitude` may therefore be shorter than `GPS_Latitude`/`GPS_Longitude` and carries its own `t_us`. `unit: m` |
| `<time>` | `GPS_EpochMs` | ISO-8601 UTC ms, parsed by a hand-rolled parser (no chrono dependency — GPX's `<time>` shape is fixed and simple); sub-millisecond fractions round to the nearest ms, ties away from zero (C1 §3.4). `unit: ms_raw` |
| `<hr>` (namespace-agnostic) | `HR_BPM` | only when at least one point has it. `unit: bpm` |
| `<cad>` | `Cadence_RPM` | only when at least one point has it. `unit: rpm` |
| `<power>` | `Power_W` | only when at least one point has it. `unit: W` |

**`GPS_SpeedKmh`/`GPS_Heading` — deferred to L2 follow-on S/H (post-archive), not a contract gap.**
C1 §4.1 **does** name both `GPS_SpeedKmh` (`unit: km/h`) and `GPS_Heading`
(`unit: deg`) in its FIT/GPX-derived column list (added post-sign,
2026-09-03, ruling R7 — a separate, earlier ruling than R23 the same day).
This importer and FIT's (§15a.2) deliberately do not populate either
channel in this wave: that is a dedicated follow-on, **L2 follow-on S/H
(post-archive)** (FIT
`speed`/`enhanced_speed` ×3.6; GPX `<speed>`/`<course>` or the ported Dart
derive-when-absent fallback), held per ledger ruling R23 Q4 pending Isaac's
real FIT/GPX archive, not executed in this wave — not a contract gap
needing escalation.

**Timestamp dedup is trackpoint-level**, for the same reason as FIT's
record-level rule (§15a.2): every idl1 channel a GPX file populates is
sampled at the same `<trkpt>` cadence, so per-channel and per-trackpoint
dedup coincide.

**Missing timestamps.** C1 §3.4 assumes every source sample carries a
parseable recorded timestamp; it does not define behaviour for a GPX file
with none. Per L2-R7, trackpoints are partitioned once, before any `t_us`
math, into those with a parseable `<time>` and those without:
— **case (b), no trackpoint anywhere has one:** the ported 1 Hz index
synthesis is kept (`t_us[i] = i × 1_000_000`), but `Session.timestamp_utc_ms
= 0` ("unknown") and no `GPS_EpochMs` channel is created at all — a
synthesized index is not a receiver epoch. Exactly **one** `ImporterWarning`
is raised for the whole file, not one per point;
— **case (c), some trackpoints have one and some don't:** the timestamped
points alone define the axis; every untimestamped point is **dropped**,
each with its own `ImporterWarning` naming the point's index. `GPS_EpochMs`
**is** created, from the real, kept timestamps, and `t0` is anchored at the
**minimum** timestamp among the kept points (C1 §3.1), not the first one
encountered. Synthesized index-ms and epoch-ms never share an axis. See Open
Questions.

### 15a.4 CSV import (trivial — D4)

`CsvImporter`. **No SPEC, contract, or design-doc text defines a CSV input
shape** — design doc §15 explicitly defers "CSV beyond a trivial
importer." This plan invents the minimal shape design doc's low-priority
framing anticipates, pending lead confirmation (see Open Questions):

```
t_seconds,<channel_1>,<channel_2>,...
0.0,10.0,1.0
1.0,11.0,
2.5,,3.0
```

Comma-separated, **no quoting/escaping** (a real CSV importer, if this
grows beyond hand-built test fixtures, needs a proper crate — out of scope
here). Header row's first column must be literally `t_seconds` (elapsed
seconds, monotonic non-decreasing is not required — each channel column is
deduplicated independently against C1 §3.4's rule); every other header
column names one channel. An empty cell means "no sample for this channel
at this row" (not zero). `t_us[row] = round((t_seconds[row] −
t_seconds[first_row]) × 1e6)`. `Session.timestamp_utc_ms = 0` ("unknown" —
a generic CSV has no wall-clock anchor).

**`source_kind = "csv"`** is a new token under C1 §4.2's `source_kind`
enumeration's forward-compatibility clause ("new sensors get a new
lower-`snake_case` token without a schema change") — C1 §4.2 was amended
(ruling R23) to name `csv` directly in that enumeration and to state CSV
is event-driven (`channel_kind: event`, `nominal_rate_hz: 0.0` for every
channel — no fixed-rate guarantee is made by this trivial format) with
`unit` the empty string when the header supplies none. This importer's
`nominal_rate_hz = 0.0` for every channel follows that amendment directly,
not as an independent choice.

### 15a.5 Common rules

- **Error kinds.** `ImporterError`'s variants (`FitMalformed`,
  `GpxMalformedXml`, `GpxNoTrackpoints`, `GpxMissingLatLon`,
  `GpxUnparseableLatLon`, `CsvMalformed`, `NotUtf8`) each have a row in C3
  §2's kind vocabulary table, `import_*`-prefixed (`import_fit_malformed`
  through `import_not_utf8`, added under lead ruling R7) — distinct from
  `parse_*` (`ParseError`, `.idl0`-only, unchanged). Landed ahead of L5
  Task 9's `import_file`/`list_importers` wiring, which reads this table.
- **`Time`/`Distance` synthesis.** Every L2 channel (FIT, GPX, CSV) has
  `nominal_rate_hz = 0.0` (§15a.2–15a.4), and `synthesize_base_channels`
  (`session/synthesis.rs`) originally synthesized `Time` only from a
  channel with `nominal_rate_hz > 0`. Ledger ruling R23 (Q2) fixes the
  synthesizer, not the metadata: when no channel in a session has a
  positive rate, `synthesize_base_channels` falls back to the channel with
  the most samples, using **that channel's own real `t_us`** for `Time` —
  never a fabricated rate (the synthesized `Time` channel's
  `nominal_rate_hz` stays `0.0` in this fallback, so `channel_kind`
  honestly reads `event`, not `fixed-rate`, for an irregular source). This
  is a landed L1 file, edited under this ruling by L2 Task 6 (CLAUDE.md
  §7 — through the lead). Consequence for this section: every FIT/GPX/CSV
  session gets a `Time` channel, derived from its longest channel's real
  recorded time, event-driven. `Distance` still requires `GPS_SpeedKmh` at
  a positive rate, which none of this section's importers produce
  (§15a.3's L2 follow-on S/H (post-archive) deferral) — `Distance` stays
  absent for FIT/GPX/CSV sessions until that follow-on lands.
- **Post-import materialisation hook.** `rust/core/src/import/hook.rs`
  defines `PostImportHook` (`on_imported(&self, session: &Session)`) and a
  no-op default (`NoopPostImportHook`) — the extension point design doc
  §5's materialised-derived-channel chain (the iEKF estimator) attaches to
  once L1/L3 build the materialised-channel store. Per ledger ruling
  L2-R12, there is no `import_with_hook` wrapper: the plan's original
  signature could not accept `importer_for_extension`'s `Box<dyn Importer>`
  without an awkward deref, so the hook is invoked directly inside
  `store::import::import_file`'s own pipeline (L2-R13, Task 6, landed) —
  a `NoopPostImportHook.on_imported` call after a successful import,
  before the CAS blob write. This section ships only the hook's shape;
  wiring a real hook is out of scope here.
- **What is not covered here.** Writing `data.parquet` (C1 §4), catalog
  insertion (C4 §5), CLI subcommand wiring (`idl-rs import`), and the
  `.idl0` importer are L1's.

### 15a.6 Open questions

See `docs/superpowers/plans/2026-09-03-idl1-wave1-l2-importers.md`'s Open
Questions section — assigned per item, none unassigned, none blocking this
section's own golden tests.

---

## 16. Track Entity

### 16.1 Purpose

A Track is a venue + reference polyline + canonical gates that multiple sessions can be associated with. Tracks live in Drive (`IDL0/tracks/<uuid>.idl0t`) with a local SQLite cache for fast queries. This enables cross-session comparison ("my best lap on A-Line over the past year") without each session storing its own gate copy.

**File.** `app/lib/data/track.dart`. Local cache: `app/lib/data/track_index.dart`.

### 16.2 Track Shape

```dart
class Track {
  final String trackId;                        // UUID
  final String name;                           // user-facing
  final String venueName;                      // optional, free-text
  final LapTiming? lapTiming;                  // sealed union: Circuit | PointToPoint; null = no lap timing
  final List<NeutralZone> neutralZones;        // timing-pause regions
  final List<SectorGate> sectorGates;          // canonical sectors
  final List<GpsFix> referencePolyline;        // reference run geometry
  final int createdAtMs;
  final int updatedAtMs;

  factory Track.create({...});  // generates UUID + timestamps
  Map<String, dynamic> toJson();
  factory Track.fromJson(Map<String, dynamic> json);
}
```

### 16.2.a LapTiming Types

`LapTiming` is a sealed union defining how a Track's lap is bounded:

- **`Circuit(startFinish: LapGate, name: String?)`** — single gate that acts as both start and finish. Each crossing ends the current lap and begins the next. Lap 1 starts at the first GPS fix of the session. Useful for closed-loop tracks.

- **`PointToPoint(start: LapGate, finish: LapGate)`** — two distinct gates. Lap n runs from the nth `start` crossing to the nth `finish` crossing. Used for stages (downhill, enduro, time trials) where start and finish are at different locations.

- **`null`** — no lap timing configured. Sessions visiting this Track will produce zero laps until the user sets timing via the Track editor.

### 16.2.b NeutralZone

A region whose duration is excluded from lap timing:

```dart
class NeutralZone {
  final String name;                   // display label, e.g. "Pit lane"
  final LapGate enter;                 // gate that pauses lap timing
  final LapGate exit;                  // gate that resumes lap timing
}

class NeutralZoneVisit {
  final String neutralZoneName;        // name of the NeutralZone
  final int enterMs;                   // UTC ms, GPS-anchored
  final int exitMs;                    // UTC ms, GPS-anchored
  int get durationMs => exitMs - enterMs;
}
```

When lap detection encounters a crossing of `enter` while in a lap, the timer pauses. Crossing `exit` resumes. The duration `(exitMs - enterMs)` is subtracted from the lap's raw elapsed time. `Lap.neutralZoneVisits` records each detected enter→exit pair for lap-table display.

### 16.2.c Reference polyline only (canonical polyline rolled back)

Tracks no longer carry a derived "canonical" polyline. The 2026-05-08 polyline-averaging architecture (`canonicalPolyline`, `polylineSourceSessionId`, `polylineSourceLapCount`, `polylineDerivedAtMs` and `polyline_averager.dart`) is rolled back wholesale. Reference matching for variance now uses the user-designated **overlay lap's GPS verbatim** (no averaging, no synthesised geometry) — see §19 (`variance_time` / `variance_dist`) and §21.3 (main/overlay/starred designation). `Track.referencePolyline` is retained for the tracks-browser map preview and `TrackMatcher.findVisits`; loading a Track JSON with the four removed keys silently ignores them.

### 16.3 Storage Model

Contract C4 fixes the layout; this section is the summary. The filesystem
tree under `<data>` is the source of truth — there is no cloud store in
idl1 (design doc D7: LAN sync only, no SaaS/Drive).

- **File:** `<data>/tracks/<track_id>.idl0t` — JSON, one per Track, format
  unchanged from idl0 (SPEC §16.2/§16.3 pre-idl1; C4 §2 fixes only the path
  root). Written via the atomic-write primitive (C4 §4): `tmp/<uuid>` →
  fsync → rename.
- **Local cache:** SQLite table `tracks` in `<data>/catalog.sqlite` (C4
  §5), columns `track_id PRIMARY KEY`, `name`, `venue_name`, `created_at_ms`,
  `updated_at_ms`, `full_json TEXT` — the same shape the old `SessionIndex`
  pattern used, now under one catalog database shared with `sessions`,
  `blobs`, `workbooks`, `laps`, `lap_summary`. The catalog is rebuildable by
  a full tree scan and is never itself synced (design principle: "the
  catalog is an index").
- **Sync (design doc §7, D7):** `tracks/*.idl0t` moves over the pit-lane LAN
  sync protocol, last-write-wins by `updated_at_ms` (C4 §6) — the same
  conflict rule the pre-idl1 `TrackProvider` used against Drive, now against
  a peer app instance instead of a cloud folder.

### 16.4 Drive Folder Layout

```
IDL0/
├── sessions/
│   └── YYYY-MM-DD_venue_rider/
│       ├── <session_uuid>.idl0   (or .gpx for imported)
│       └── <session_uuid>.idl0w
└── tracks/
    └── <track_uuid>.idl0t
```

### 16.5 TrackProvider

`app/lib/providers/track_provider.dart`. AsyncNotifier returning `List<Track>`. On build: load from local TrackIndex; in background, sync with Drive (download newer/missing tracks). Conflict policy: **last-write-wins by `updatedAtMs`**. Methods: `createTrack`, `updateTrack`, `deleteTrack`.

### 16.6 .gpx Import

Multi-select via file_picker (`allowMultiple: true`). One Track created per file. Default name = filename without `.gpx`. Reference polyline = parsed GPX trkpt list. Gates and sectors default to empty (user places them later via the Analyze tab gate UI). Duplicates allowed; deduplication is not attempted.

### 16.7 Track Creation from Session

Existing alternative path: pick a session, GPS becomes the reference polyline, current Workspace gates copy to the new Track. Useful when no external .gpx exists.

### 16.8 Venue Field

`Track.venueName` is a free-text grouping key with no separate Venue entity. The Tracks view's detail card surfaces an editable Venue field via `Autocomplete<String>` sourced from `distinct Track.venueName ∪ distinct SessionMetadata.venueName`. Submitting a new value creates the venue lazily; submitting an existing value merges this Track into that venue group. Renaming a venue is performed by `TrackNotifier.renameVenue(oldName, newName)`, which patches `venueName` on every Track matching `oldName` in a single batch write.

---

## 17. Multi-Track & TrackVisits

### 17.1 Purpose

A single session can visit multiple Tracks (e.g., a trail ride that hits 5 trails sequentially). The data model represents this as a list of TrackVisits per session, each with a time window. Lap detection runs per-visit using that visit's Track gates.

**Engine.** Visit detection runs in the `idl-rs` engine (`tracks::detect_visits`): it reads the session's `GPS_*` channels from the retained `SessionHandle` and takes each Track's reference polyline as input. The app maps Track config in and visit windows back through `track_matching_bridge.dart`, minting the `visitId` (the engine returns deterministic windows with no id). Storage in `Workspace.trackVisits` (per-session `.idl0w`). The track library / catalog remain app-side.

### 17.2 TrackVisit Shape

```dart
class TrackVisit {
  final String trackId;
  final int startTimestampMs;     // UTC ms, GPS-anchored
  final int endTimestampMs;
  final List<Lap> laps;           // cached laps detected within this window (§17.4)
}
```

Stored in `Workspace.trackVisits: List<TrackVisit>`. Workspace schema bump required when this is added (`_kSupportedWorkspaceVersion` increments; `fromJson` accepts missing field with default empty list). The `laps` array caches the laps detected within the visit window — see §17.4.

### 17.3 Visit Detection Algorithm

`tracks::detect_visits(handle, tracks, params)` reads the session GPS from the handle and returns an ordered list of visit windows. Tuning defaults (30 m / 5 s / 30 s) live once in the engine's `VisitParams::default()` — the app passes no overrides.

1. **Bounding-box pre-filter.** Reject Tracks whose polyline bbox doesn't overlap the session bbox. Cheap; rejects most Tracks for any given session.
2. **Distance-mark phase.** For each surviving Track, mark each session GPS sample as "on track" if its closest-point distance to the Track polyline is < `threshold_m` (default 30 m), in a flat-earth metric frame around the session centroid. Uses the engine's `closest_point_on_polyline`.
3. **Coalesce.** Group contiguous "on track" samples into windows. Allow up to `gap_tolerance_s` (default 5 s) of off-track samples within a window — covers GPS noise.
4. **Resolve overlaps.** If a sample is "on" multiple Tracks (rare), attribute to the one with smallest distance.
5. **Filter short visits.** Discard windows shorter than `min_visit_s` (default 30 s) — typically drive-bys, not real laps.

### 17.4 Caching

Run on session import; cache results in `Workspace.trackVisits`. Don't re-run on every session load. A "Rescan Tracks" action manually re-runs for a session — useful when new Tracks are added after import.

**Laps are cached with their visits.** When a session is parsed (import, WiFi download, GPX-as-session, or rescan), lap detection runs per visit using that visit's Track config, and the result is stored on `TrackVisit.laps`. The Data tab (§24) reads these cached laps to build its session/track aggregates and lap-time facets — it never parses a session on open. Cached laps are invalidated together with their visits: a rescan recomputes both under the current `trackVisitsLibraryHash`. The Analyze tab still detects laps live (`visitLapsProvider`, §17.6) so the lap table reflects in-session Track-gate edits immediately; only the read-only Data-tab browse uses the cache. A pre-cache workspace (visits present, `laps` absent) shows no laps in the Data tab until the next rescan populates them — opening the tab does not trigger a parse.

### 17.5 Lap Detection Reads Only Track

**Lap detection reads only Track.** `visitLapsProvider` resolves laps using `Track.lapTiming`, `Track.sectorGates`, and `Track.neutralZones`. The legacy workspace-over-track fall-through has been removed; `Workspace.lapGates` and `Workspace.sectorGates` remain in the model dormant — see future Session Gates feature for per-session analysis overlays that do not pollute the canonical Track.

**Detection runs in the engine.** The detection algorithm lives in the `idl-rs` engine (`laps::detect_laps`): it reads the session's `GPS_Latitude`/`GPS_Longitude`/`GPS_EpochMs` from the retained `SessionHandle`, takes the Track's gates / sector gates / neutral zones as input, and restricts to the visit window. It returns the lap table (laps, sectors, neutral-zone visits); the gate-crossing geometry, circuit / point-to-point timing, sector splits, and neutral-zone subtraction all live Rust-side. The Track config models and the track library remain app-side — only the algorithm is in the engine.

### 17.6 Lap Detection Provider

```dart
final visitLapsProvider = FutureProvider.family<
  List<Lap>,
  ({String sessionId, String visitId})>((ref, key) async {
    final ws = await ref.watch(sessionWorkspaceProvider(key.sessionId).future);
    final visit = ws.trackVisits.firstWhere((v) => v.visitId == key.visitId);
    final track = (await ref.watch(trackProvider.future))
        .firstWhere((t) => t.trackId == visit.trackId);
    final handle = await ref.watch(sessionHandleProvider(key.sessionId).future);
    // Engine reads GPS from the handle, restricts to the visit window, and
    // detects laps using Track.lapTiming / sectorGates / neutralZones.
    final results = await rust.detectLaps(
      handle: handle, timing: timingArg(track.lapTiming!),
      sectorGates: [...], neutralZones: [...],
      windowStartMs: visit.startTimestampMs, windowEndMs: visit.endTimestampMs);
    return [for (final r in results) lapFromRust(r)];
});
```

### 17.7 Lap Recording-Seconds

Each `Lap` and `Sector` carries both wall-clock epoch bounds
(`startTimestampMs` / `endTimestampMs`, UTC ms) and **recording-time second
bounds** (`startTimeSecs` / `endTimeSecs`, seconds on the uniform `Time` axis
where `Time[i] = i / rate`). The seconds are **engine-computed** in
`detect_laps`: it stamps every lap and sector boundary via
`SessionHandle::epoch_ms_to_time_secs`, which interpolates the epoch against the
`GPS_EpochMs` channel (the recording's wall-clock index) and divides by the GPS
rate, falling back to `(epoch_ms − timestamp_utc_ms) / 1000` against the
back-filled session origin when GPS is absent.

The engine owns epoch→Time conversion; Dart performs none. Consumers needing a
lap/sector position on the chart's time axis (math lap-context, chart lap
windowing) read these fields directly rather than converting from samples — laps
carry their own analysis-frame coordinates.

---

## 17a. Workbook Entity (`.idl1wb`)

A Workbook is a portable, session-agnostic analysis document: prose, math
cells, table cells and JS chart cells, as Observable Framework-compatible
Markdown. Charts reference channels and math definitions by name, never by
session id, and render against whatever session the app binds at runtime.
Full grammar, cell-id scheme, math-cell language, table-cell schema, JS
host variables and migration rules: **`docs/superpowers/specs/2026-09-03-idl1-c2-workbook-v3.md`
(contract C2)** — that document is authoritative; this section is a
summary for readers navigating the SPEC, not a second source of truth.

### 17a.1 Storage

- File: `<workbookId>.idl1wb`, UTF-8, LF line endings, at
  `<data>/workbooks/<name>.idl1wb` (path root: contract C4).
- The workbook **is** the file — no database mirror, no Drive sync layer
  (D7's LAN sync replaces the old Drive-based sync entirely; see §17a.4).
- Conflict policy: per-cell merge (C2 §7), not last-write-wins on the
  whole file.

### 17a.2 Schema (`version: 3`)

YAML front matter (`id` UUIDv4, `name`, `constants`, `units`, `version`)
followed by CommonMark prose interleaved with fenced ` ```math `,
` ```table ` and ` ```js ` cells (C2 §1–§2). Every fenced cell carries a
stable `id=<8 hex>` in its fence info string, assigned on first save and
never changed — the unit of diff and sync merge (C2 §2.2, §7).

**Math cells** (C2 §3) hold one or more `name = expression` lines in a
flat, whole-document namespace; `name` is a JS-identifier (unlike v2's
free-text `MathChannel.name` — see §17a.5); a `# label: <text>` trailing
comment carries a free-text display name. The expression grammar is the
engine's existing evaluator (`idl-rs::math::{token,parse,eval}`), unchanged,
with a 69-function builtin catalog (C2 §3.3) and a unit table (C2 §3.4)
consulted only by the editor UI, never by evaluation. `const NAME = value`
lines and front-matter `constants` share one flat, workbook-scoped
namespace; the four universal constants (`pi`/`tau`/`e`/`g`) are reserved
and cannot be redeclared (C2 §3.5.A).

**Table cells** (C2 §4) carry the existing `TableModel` JSON verbatim,
unchanged from v2.

**JS cells** (C2 §5) are standard Observable Runtime cells, executed in an
origin-isolated sandboxed iframe (design doc §6), never crossing Tauri IPC
directly. The host binds one JS variable per math definition (a
`{length, t, v}` column-oriented table — `t` in **seconds**, distinct from
the Parquet storage axis `t` in the session schema, which is microseconds;
see contract C1 §3.1 and C2 §5.1) plus `channel()`, `laps`, `session`,
`constants`, `Plot`, `d3`, `Inputs`, `html`. `channel()`'s optional
cross-session lookup is exclusive (it resolves only against the named
session, never falling back to the primary one) and an out-of-range lap
reference names the recorded lap count in its error message. A Properties
form generates and parses back a fixed subset of `Plot.plot(...)` code
(C2 §5.3, `plotForm`); code outside that subset is "custom" and edited as
text only.

Newer-than-supported `version` refuses the file
(`UnsupportedWorkbookVersion`, C2 §3.5.A); an absent `version` key defaults
to `3`.

### 17a.3 Session binding (view context)

Unchanged from v2: workbooks are session-agnostic; a view context binds a
primary session and an optional overlay session at render time, never
serialized into the file.

### 17a.4 Sync

LAN sync (design doc §7, contract to follow in L11's wave-2 work) replaces
Drive sync entirely: pull-based manifest/blob sync between paired peers on
the local network, with workbook merge **per cell** (C2 §7) rather than
whole-file last-write-wins — a cell changed on only one side takes that
side; a same-cell conflict appends the peer's version as a marked conflict
cell (`<!-- conflict from <peer> -->`) directly below, so the file always
stays valid Markdown. No cloud relay in v1 (design doc §15).

### 17a.5 Import policy

When importing a `.idl1wb` file:

- No local match (`id` not in the local index) → import as-is, preserving `id`.
- Local `id` match → user picks **Replace** (overwrite local) or **Import
  as copy** (fresh `id` — `Uuid::new_v4()`, `"(Copy)"` suffix on `name`).
  Import-as-copy is the one sanctioned way a workbook's `id` ever changes:
  C2 §1 makes `id` immutable everywhere else, including sync (§17a.4) and
  migration (§17a.6).

### 17a.6 Migration from v2 (`workbook_version` 1 or 2)

**Specified but not implemented in wave 1** (ruling R30 cut the
`migrate-workbook` task from wave 1's scope — Isaac has no `.idl0wb` files
worth migrating today, so v3 workbooks start from scratch). C2 §6/§6.1
carries the full algorithm as a specification for whenever migration is
wanted; no `migrate_workbook_text` function, `MigrationReport` type, or
`_migrate_charts`/`_migrate_math` front-matter key exists in `idl-rs` yet.

As specified: `idl-rs migrate-workbook <input.idl0wb> --output <output.idl1wb>`
would convert a v2 file's `math_channels[]` into one `math` cell
(identifier-sanitising any name that isn't already a valid JS identifier —
every idl0 AHRS built-in needs this — while preserving the original as a
`# label:` comment; C2 §6.1's exact algorithm), `constants[]` into
front-matter `constants`, table blocks into `table` cells verbatim, and
stage chart slots in a transient `_migrate_charts` front-matter key the app
would convert to `js` cells on first open (Properties-form code generation;
not a CLI concern — C2 §6). A second transient key, `_migrate_math`, would
carry each migrated definition's original v2 `id` and colour forward as a
Stage-2 fallback (C2 §6); both transient keys would be deleted by the app
once Stage 2 runs. `overlay_layouts[]` would be dropped (D9).
`worksheets[].xAxisMode` and the three non-timeSeries chart types with no
v3 analogue (`gpsMap`/`lapTable`/`lapProgression`) would have no migration
path and would be dropped with a logged warning, not silently discarded
without a trace. The migration would never refuse except for an
unrecognised `workbook_version` or a migrated constant colliding with a
universal constant (`pi`/`tau`/`e`/`g`) — every other irregularity (an
unresolved chart reference, dropped block metadata, a live-lap
`rowSource`) would be reported and migrated through, never silently
dropped and never a refusal.

---

## 17b. Track Artifact (`.idl0t`)

A **portable Track file** — one Track's analysis config (gates, timing,
reference polyline), independent of any session. The GUI authors Tracks (§16)
and exports them; the `idl-rs` engine and CLI consume them for headless lap /
track analysis (§29.6). One Track per file.

### 17b.1 Schema (`track_artifact_version = 1`)

JSON, pretty-printed. A version wrapper around the Track entity's serialization
(`Track.toJson`), so the file *is* the Dart↔engine contract:

```json
{
  "track_artifact_version": 1,
  "track": {
    "track_id": "…uuid…", "name": "A-Line", "venue_name": "Whistler",
    "lap_timing": { "kind": "circuit", "name": "S/F", "start_finish": { …gate… } },
    "sector_gates":  [ { "name": "S1", "gate": { …gate… } } ],
    "neutral_zones": [ { "name": "Pit", "enter": { …gate… }, "exit": { …gate… } } ],
    "reference_polyline": [ { "timestamp_ms": 0, "latitude_deg": …, "longitude_deg": … } ],
    "created_at_ms": …, "updated_at_ms": …
  }
}
```

Gates are `lat1_deg`/`lon1_deg`/`lat2_deg`/`lon2_deg` (+ optional `name`);
`lap_timing` is omitted when unset; coordinates are raw degrees × 1e7. The
engine reads `track_id` (visit identity) + `name`/`venue_name` (display) and the
analysis fields; it ignores the timestamps. A reader rejecting a higher
`track_artifact_version` surfaces a typed error.

### 17b.2 Storage

Not in the SQLite catalog — a standalone file the user saves/opens via an OS
file picker (export from the track editor; import from the Tracks panel).

### 17b.3 Import policy

- No local match (`track_id` not in the library) → import as-is, **keeping the
  file's `track_id`** (preserves identity across share / re-import).
- `track_id` match → user picks **Update in place** (replace fields, keep id) or
  **Import as new copy** (fresh id). Matching is `track_id`-only.

---

## 18. Bike Profiles & Riders

### 18.1 Profile Model
```json
{
  "profile_id": "uuid",
  "name": "Trek Session 2024",
  "type": "full_suspension",
  "imu_count": 3,
  "default_rider": "Isaac",
  "wheel_circumference_front_mm": 2300,
  "wheel_circumference_rear_mm": 2300
}
```

`default_rider` pre-populates rider field on every downloaded session. Overridable per session in Data tab.

### 18.2 Profile Management

- Created/managed in the Device tab.
- **Stored as one JSON file per profile**, `<data>/profiles/<profile_id>.idl0p`
  (path convention carried from `profile_store.dart`; fixed by C4 §2, added
  post-sign as lead ruling R6). Written via the C4 §4 atomic-write
  primitive (`tmp/<uuid>` → fsync → rename). A malformed profile file is
  skipped on load with a warning, never fails the whole load (CLAUDE.md §5).
- App-wide settings (rider name, unit system, firmware channel, …) persist
  in `app_config_dir()/settings.json` (C4 §1's existing bootstrap file,
  which already holds `data_dir`) rather than `shared_preferences` — see
  this plan's Open questions for why that file rather than a new one.
- **Config never auto-pushed** — user reviews and pushes manually (unchanged).
- Post-session: profile editable in the Data tab metadata editor (updates
  `session.json` only, C1 §6, not the immutable log file).

### 18.3 Multi-Device
- App manages multiple IDL0 devices simultaneously
- Devices identified by `IDL0-XXXX` (last 4 of MAC)
- Data tab filterable by device ID and rider

---

# PART 5 — APP PROCESSING

## 19. Signal Processing Pipeline

All steps run in Rust — the `idl-rs` engine crate in the repo-root `/rust/`
cargo workspace — exposed to the app through the `idl-rs-bridge`
flutter_rust_bridge shim and reusable headlessly via the `idl-rs` CLI.

**Engine (`idl-rs`) dependencies — pure, no Flutter:**
```toml
sci-rs = "0.4"      # scipy.signal equivalent
nalgebra = "0.33"   # linear algebra
rustfft = "6.2"     # FFT
```
`flutter_rust_bridge` is a dependency of `idl-rs-bridge` only — never the engine.

**Default pipeline per IMU channel:**
1. Bias subtraction — nalgebra vector subtract (`imu.bias` from config)
2. Rotation — nalgebra 3×3 matrix multiply → vehicle frame (ISO 8855)
3. Input — IMU samples arrive as physical values (g and dps); the parser applied scale/offset from the channel registry (§5.2) before handoff.
4. High-pass filter — sci-rs `butter` order 2, cutoff 0.15–0.3 Hz, applied via `sosfiltfilt` → Rust: `highpass(data, order, cutoff_hz, sample_rate_hz)`
5. Integration (where needed) — trapezoidal rule, `output[0] = 0.0`, output length = input length → Rust: `integrate(data, sample_rate_hz)`. sci-rs 0.4 has no `cumtrapz`; implemented directly.
6. High-pass filter (post-integration) — second `sosfiltfilt` pass

All steps user-overridable via math channel expressions.

**Rust API notes (flutter_rust_bridge):**
- Filters: `highpass(data, order, cutoff_hz, sample_rate_hz)` / `lowpass(...)`. No single `butter()` function. Math channel `butter(order, cutoff, type, ch)` maps to these at eval time.
- FFT: `fft(data, window)` → one-sided linear magnitude spectrum, `n/2 + 1` bins. Caller computes `freq[k] = k × sample_rate_hz / n`. Output is `|X[k]|`, not power. Backs the math-channel `fft(ch, window)` function.
- Welch: `welch(data, sample_rate_hz, window, nperseg, noverlap, detrend, averaging, scaling)` → `WelchResult { freqs_hz, values }`, both `nperseg/2 + 1` bins. Segmented, averaged spectral estimation composed on `rustfft` (sci-rs has no spectral API). `nperseg = 0` or `≥ len` ⇒ one full-record segment, which with rectangular window and no detrend reproduces `fft()` bin-for-bin. `detrend` ∈ {None, Mean, Linear}; `averaging` ∈ {Mean, Median}; `scaling` ∈ {Magnitude (RMS, input units), Density (PSD, units²/Hz)}. Backs the FFT chart. See `docs/signal_pipeline.md`.
- Windowed Welch: `welch_channel_windowed(handle, channel, t0_secs, t1_secs, …)`
  slices the channel to an inclusive time window then runs `welch()` at the
  channel's rate — backs the auto-windowing FFT chart (§26).
- Spectrogram: `spectrogram(data, sample_rate_hz, window, nperseg, noverlap,
  detrend, scaling) → SpectrogramResult { freqs_hz, times_secs, power (flat
  row-major n_times × n_freqs), n_times, n_freqs }`. Same segmentation as
  `welch()` (shared `stft()` core), kept per-frame instead of averaged. The
  `spectrogram_channel(handle, channel, t0_secs, t1_secs, …)` accessor windows
  it; `times_secs` are absolute session seconds. Backs the spectrogram chart
  (§26) and the `idl-rs spectrogram` CLI command (§29). The math-channel
  `spectrogram(ch)` function stays deferred (a 2-D result has no 1-D channel form).
- Rotation matrix: flat 9-element row-major `Vec<f64>` (FRB cannot serialize `[[f64;3];3]`). Format shared by `rotation_from_gravity()` output and `apply_rotation()` input.
- Declip: `declip(data, sample_rate_hz)` → same-length signal with ±32 g-clipped segments reconstructed via a tuned analytic pulse. Shape constants are tuned offline against real sub-limit events (dev-only Rust harness, `#[cfg(test)]`) and baked into `default_params()` in `rust/core/src/clip_reconstruct.rs`. Non-clipped input returned unchanged.
- Cross-session analysis: `table::evaluate_table_multi(...)` evaluates a table whose rows bind different sessions (per-row `SessionHandle`, cross-row `{col[]}` preserved in one pass; `main({col[]})` reads the Main row) and `variance::variance_traces(reference, targets, channel_id, mode)` computes N overlay-vs-Main delta series in time or distance — the N-lap comparison substrate. See §26.11, §26.13.

**Math channel functions (scipy-equivalent names):**

| Category | Functions |
|----------|-----------|
| Filters | `butter(order, cutoff, type, ch)`, `sosfilt(sos, ch)` |
| Time-domain | `integrate(ch)`, `differentiate(ch)`, `rms(ch, w)`, `mean(ch, w)`, `std(ch, w)`, `median(ch, w)`, `detrend(ch)` / `detrend(ch, mode)` — global least-squares trend removal over the sample index; `mode` = `"linear"` (default) \| `"constant"` (alias `"mean"`) \| `"none"`; NaN-aware (fit over finite samples, dropouts left in place) |
| Aggregates (channel → scalar) | `mean(ch)`, `max(ch)`, `min(ch)`, `sum(ch)`, `std(ch)`, `rms(ch)`, `median(ch)`, `p(ch, q)`, `first(ch)`, `last(ch)`, `count(ch)` |
| Reconstruction | `declip(ch)` — rebuilds acceleration peaks clipped at the ±32 g rail by fitting a smooth asymmetric pulse to each clipped segment's shoulders; `ch` unchanged where nothing is clipped |
| Frequency | `fft(ch, window)`, `spectrogram(ch)`, `hilbert(ch)` |
| Correlation | `correlate(a, b)`, `convolve(ch, kernel)` |
| Resampling | `resample(ch, hz)` |
| Math | `abs`, `sqrt`, `pow`, `sign`, `min`, `max`, `clamp`, `floor`, `ceil`, `round` |
| Trig | `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `sinh`, `cosh`, `tanh`, `deg2rad`, `rad2deg` |
| Vector | `vec(x, y, z)`, `vx(v)`, `vy(v)`, `vz(v)`, `vadd(a, b)`, `vsub(a, b)`, `vscale(v, s)`, `cross(a, b)`, `dot(a, b)`, `norm(v)`, `normalize(v)`, `angle(a, b)` |
| Rotation | `rotate_mat(v, r00, r01, r02, r10, r11, r12, r20, r21, r22)`, `rotate_axis(v, ax, ay, az, angle)`, `rotate_euler(v, roll, pitch, yaw)` |
| Logic | `if(cond, t, f)`, `and`, `or`, `not` |
| Range | `ch[t_start:t_end]`, `ch[lap_n]` |
| Variance — temporal | `variance_time(ch)` — main − overlay at the same lap-relative time, position-matched via Rust track projection |
| Variance — spatial | `variance_dist(ch)` — main − overlay at the same arc length along the overlay lap |
| Lap | `current_lap()` — 1-based lap number at each sample, `0` outside any lap |
| Lap | `lap_start_time(n)` — session-relative start time (s) of lap `n`, `NaN` when out of range |
| Lap | `sector_number()` — 0-based sector index at each sample, `NaN` outside any sector |
| Estimator | `attitude("roll"\|"pitch")` — the **estimator's** chassis attitude vs gravity, deg (roll positive leaning right, pitch positive nose up). Diagnostic: the user-facing attitude channels are expressions, see *Attitude and body acceleration* below |
| Estimator | `body_accel("long"\|"lat")` — the **estimator's** gravity-removed acceleration in the chassis body frame, g (positive forward / right). Same note as `attitude` |
| Estimator | `wheel_travel("front"\|"rear")` — suspension travel, mm; `wheel_velocity("front"\|"rear")` — mm/s |

**Not yet implemented.** `resample`, `spectrogram`, `hilbert`, `correlate`,
`convolve`, and `sosfilt` parse and validate but raise `NotImplemented` in the
evaluator; `deg2rad` / `rad2deg` are accepted by the Dart validator's
`knownFunctions` but have no evaluator arm. They are listed above because they
are the intended surface — treat the table as the contract, not as a statement
of what ships today.

**Aggregates (channel → scalar).** Each reduces a channel (or a `{col[]}` table
column, §26.11) to one value over its finite samples — non-finite samples are
skipped; an empty/all-non-finite input yields `NaN`. `p(ch, q)` is a
linear-interpolated percentile (`q` in 0..=100); `std(ch)` is the population
standard deviation. **Arity selects** for the names that also have a
windowed/elementwise form: one channel argument is the scalar aggregate
(`mean([Fork])` = whole-channel mean), two arguments keep the prior form
(`mean([Fork], w)` = rolling mean; `min(a, b)` = elementwise). This makes
de-meaning natural in channel math — `[Fork] - mean([Fork])` — as well as
backing table cells. `sum`/`p`/`first`/`last`/`count` have no two-argument form.
A scalar-valued top-level expression returns a single-sample, rate-0 channel.

**Logic keyword syntax:** `and`, `or`, `not` are infix/prefix keywords, not call-style functions. Valid: `x > 0 and y < 10`. Invalid: `and(x, y)`. The validator does not check `and`/`or`/`not` against the function-call pattern; `if` is the only Logic entry that uses `(` syntax.

**Vector & rotation primitives.** `vec(x, y, z)` assembles a 3-vector from scalars or channels (scalars broadcast across every sample). A 3-vector is an **intermediate** value: charts plot scalars, so the top-level result of an expression must reduce back to a scalar channel via `vx`/`vy`/`vz` (component) or `norm` (magnitude) — a bare top-level vector is a typed error advising which extractor to use. All operations work element-wise over the component buffers, following the same broadcasting rules as scalar/channel arithmetic (channel operands must share sample rate and length). `cross`/`dot`/`norm`/`normalize`/`angle` are the usual `nalgebra` operations; `angle(a, b)` returns radians in `[0, π]`. Rotations apply inline (no matrix/quaternion data type): `rotate_mat` takes a 3×3 **row-major** matrix (same layout as `rotation_from_gravity` output), `rotate_axis` is axis-angle (axis normalised internally; a zero axis is an error), and `rotate_euler` takes intrinsic roll/pitch/yaw — its angle args may be channels, giving a per-sample (time-varying) rotation. The frame-at-axle rigid-body acceleration transfer (lever-arm `a_O + α×r + ω×(ω×r)`) is the motivating consumer. Implemented in `idl-rs` `math::vector`.

**User-defined constants (legacy idl0 app, v2 workbooks):** Constants created in the Maths tab Constants panel are inserted as inline numeric literals (e.g., selecting `g = 9.81` inserts `9.81`). There is no symbolic constant reference syntax for user constants in this legacy engine/UI — changing a stored value does not update existing expressions that used it. User constants travel with the workbook (`.idl0wb` `constants`, §17a). This is specific to the legacy Maths tab; v3 workbooks (§17a.2, C2 §3.1/§3.2) have a real symbolic constant syntax — `const NAME = value` and front-matter `constants` are referenced by name in expressions and update every reference when the value changes.

**Universal constants:** Four scalar constants are recognised as **bare identifiers** in any expression and resolve to a literal at parse time — no store, always available, portable: `pi` (π), `tau` (2π), `e` (Euler's number), and `g` (standard gravity, `9.80665` m/s²). They are lowercase and case-sensitive. Because channel references are always bracketed (`[g]`), a bare `g` is unambiguously the constant — e.g. `[IMU1_AccelZ] * g` converts an acceleration in g-units to m/s². Defined in `idl-rs` `math::parse`. (The chip editor renders expressions that use a bare constant in Text mode rather than as chips.)

**Variance functions.** `variance_time` and `variance_dist` compare the session's **main lap** against an **overlay lap** (which may live in another session — cross-session compare). Both reads come from the per-session workspace's `mainLapNumber` and `overlayLapKey` fields (§21.3). `variance_time` projects each main-lap sample's `(E, N, heading)` onto the overlay lap's GPS polyline (Rust `Projector`, `rust/core/src/track_projection.rs`) — heading mismatch > 90° rejects the segment (kills the switchback case) — then linearly interpolates the overlay channel value at the projected `t_ref` and subtracts from the main sample. `variance_dist` interpolates the overlay channel at the main sample's arc length. Samples that fail to project (out of range, heading mismatch, overlay shorter than main) emit `NaN`; the expression does not abort. When either `mainLapNumber` or `overlayLapKey` is unset the function throws a `MathChannelEvaluationException` with a user-facing message — variance does not silently fall back to a default lap. The new gate-aware functions `current_lap()`, `lap_start_time(n)`, and `sector_number()` read lap and sector windows from the same per-session workspace (Rust helpers in `rust/core/src/variance.rs`). See §21.3 for the main/overlay/starred model.

**Attitude and body acceleration (AHRS).** `Roll (deg)`, `Pitch (deg)`, `Longitudinal accel (g)` and `Lateral accel (g)` are **built-in math channels** (`kBuiltinMathChannels`), not estimator outputs. They implement a turn-compensated complementary filter over IMU0 and GPS-derived speed using only the functions in the table above — no estimator run, so they are available in the CLI and the overlay renderer as ordinary expressions, and cost a fraction of a 24-DOF filter pass.

The inertial compensation is the whole point. A bare accelerometer **cannot see lean**: in a coordinated turn the specific-force resultant runs down the bike's own vertical axis, so `asin(a_y)` reads ≈0° at any lean angle — the same reason a turn-and-bank ball stays centred. It likewise reads braking as nose-down pitch that never happened. Removing the inertial term first recovers the real attitude:

- **Lean:** `sin φ = a_y − v·g_z/g`. The centripetal term is horizontal, so it projects onto the tilted body-y axis through `cos φ`; the *body* yaw rate carries that same factor (`g_z = ψ̇·cos φ`), so it cancels exactly. No small-angle assumption and no iteration — substituting the nav-frame turn rate here would be wrong, not more accurate.
- **Pitch:** `sin θ = (a_x − dv/dt)/g`.

Each reference is low-passed **inside** the `asin`, not after it: on real trail data the raw argument exceeds ±1 g for ~10% of samples (18% for pitch), and clamping those to ±90° then averaging biases the level. Filtering in the measurement domain drops saturation to zero. `declip` repairs samples where the accelerometer railed on a hard hit, matching the estimator's own input adapter.

The reference is memoryless — hence lag-free — but noisy, so it supplies only the level; high-passed integrated gyro supplies the dynamics and discards gyro bias, which would otherwise integrate into unbounded phantom lean. `butter` is `sosfiltfilt` (zero-phase, forward-backward), so the 0.2 Hz crossover contributes **no phase distortion**. That is the property that makes this preferable offline to a causal Kalman filter, which necessarily lags corner entry — the estimator's RTS smoother covers only its wheel chains, never attitude.

Pitch rate is the Euler rate `sin φ·r − cos φ·q`, **not** the bare body-Y rate: through a sustained corner the yaw axis projects ~8 deg/s onto body Y at 20° of lean, which a naive reading would report as pitching.

Speed comes from `differentiate([Distance])`. `Distance` is synthesised at the IMU rate (§15), so it arrives already rate-matched to the gyro — which is why the chain needs no `resample`, and it is smoothed once and reused because its derivative is a 1 Hz staircase.

The named intermediates (`Speed (m/s)`, `Roll rate (deg/s)`, `Roll reference (deg)`, `Pitch rate (deg/s)`, `Pitch reference (deg)`) are ordinary editable channels. They memoise shared sub-expressions and make every stage independently chartable when a result looks wrong. The expression text is pinned verbatim by `AHRS_CHANNELS` in `rust/core/src/math/tests_ahrs.rs`, which proves it against a synthetic coordinated-turn ride — including the two blind-spot cases above, so the compensation cannot be silently dropped.

**Time as a base channel.** `Time` is a synthesised built-in channel with `samples[i] = i / sampleRateHz`, where `sampleRateHz` is the highest non-event-driven channel rate in the session. Not stored on disk — re-synthesised on each session load. Appears in the channel picker alongside `GPS_SpeedKmh` etc., and lets math expressions reference session-relative time directly (e.g., the tutorial `LapTime` channel is `Time - lap_start_time(current_lap())`).

**Expression engine.** The math-channel expression engine — tokenizer, recursive-descent parser, evaluator, value types (channel / scalar / string), and the function set above — lives in the `idl-rs` core `math` module and is consumed by the app through the bridge call `eval_math_into_store(handle, expression, store_as, lap_ctx)`, which evaluates, upserts the result into the handle's math store under `store_as`, and returns only `(length, sample_rate_hz)`. The evaluator reads `[ChannelName]` references from the retained `SessionHandle` (§15) via a channel lookup over base, synthesized, and resolved math channels; lap-aware and variance functions consume an injected lap context (lap/sector windows in session-relative seconds, plus the overlay session as a second handle for `variance_*`). A scalar-valued expression returns a single-sample, rate-0 channel. Errors surface as a typed `MathChannelException` (§14). The **cross-channel dependency resolver** — which evaluates referenced math channels first and writes their results back into the handle via `add_channel` — lives in the `idl-rs` core (`math::resolve`); the app invokes it through the bridge call `resolve_math_dependencies(handle, target, defs, lap_ctx)` before evaluating the target expression, while the lap context itself is still assembled in Dart from the session's `.idl0w` annotations. Reading a **portable workbook** (`.idl0wb`) and applying its math channels to a session is likewise an engine capability (`workbook::apply_workbook`), consumed headlessly by the CLI (§29.5). The deferred functions `spectrogram`, `hilbert`, `correlate`, `convolve`, `resample`, and `sosfilt` parse and validate but throw "not yet implemented" at evaluation time; the two-argument rolling `median(ch, w)` is likewise deferred, while the one-argument aggregate `median(ch)` is implemented. The same evaluator backs **table cells** through `evaluate_scalar` (require a single scalar result) with a cell-aware channel lookup; channel math never sees the `{cell}` namespace — `ChannelLookup::lookup_cell` defaults to "none", so the Maths editor is structurally firewalled from cells (§26.11).

---

## 20. Calibration

**Trigger:** "Calibrate IMUs" button in Device tab. Precondition: bike stationary, upright, rider off.

**Process:** ~5 seconds of samples averaged. Computes per IMU:
- **Rotation matrix** (3×3): maps sensor body frame → vehicle frame
- **Bias** (6-element): zero-g accel offset + zero-rate gyro offset

**Output:** Written to `imu.orientation` and `imu.bias` in `idl0_config.json`.

**Tolerance:** ±1° from vertical acceptable. Warn if gravity vector >5° from Z axis.

**Sensor sign convention:** LSM6DSO32 reports specific force reaction. Stationary and upright: sensor reads ≈ `[0, 0, +g]`. Calibration target is vehicle Z = `[0, 0, 1]`.

**Rotation matrix format:** 9-element flat row-major `Vec<f64>`. Stored in `idl0_config.json` as a 9-element JSON array. Degenerate case (sensor exactly antiparallel to vehicle Z): falls back to 180° rotation about vehicle X axis.

---

## 21. Analysis Features

### 21.1 Data Views
- Time-series graph — multi-channel, overlay laps, synchronized cursor
- FFT — multi-channel, one line per assigned channel sharing the frequency axis; event-driven channels skipped. Computed via Welch's method (`welch()`). Slot properties, configured in the chart properties dialog: window function (Hann/Hamming/rectangular per `FftWindow`), segment length (blank = auto: largest power of two ≤ n/8, clamped 256–8192), overlap %, detrend (None/Mean/Linear), averaging (Mean/Median), scaling (Magnitude/Density), the frequency X scale (linear/log), and the shared magnitude-Y scale (`yScale`, §26.12). Defaults (auto segment, 50 % overlap, Mean detrend, Mean averaging, Magnitude) yield a smoothed, DC-suppressed spectrum out of the box; a single full-record segment with no detrend reproduces the raw periodogram. Log / non-linear transforms applied app-side (fl_chart has no native non-linear axis).
- Histogram — suspension travel, velocity, brake pressure
- GPS map — track display, channel-colored overlay, lap/sector gate editor
- Gauge — single-value at cursor
- Lap time table — lap × sector matrix
- Lap-time progression chart — line per session, X = lap index, Y = lap time s
- Ghost-delta chart — per-sample time delta vs a reference lap (see `docs/design_rationale.md` for sector timing & ghost lap implementation rationale)
- Statistics panel — min/max/mean/RMS for selected range

**Worksheet kinds** (runtime workbook in `WorkspaceState`, persisted via `shared_preferences`):

- **Standard** — blank slate the user fills with chart slots manually.
- **Session Sheet** — pins a `lapTable` slot at index 0 and a `lapProgression`
  slot at index 1; both refuse removal via `WorkspaceNotifier.removeChart`
  (no-op + `debugPrint`). Below the pinned pair, the user may add any
  standard chart (time series, FFT, GPS map, ghost). The `_ChartHeader`
  renders a pin badge on pinned slots and hides the properties / remove
  buttons. Multiple Session Sheets per workbook are supported.

A new workbook ships with one of each (`Session` + `Charts`); legacy
workbooks loaded from prefs that pre-date Session Sheets get one prepended
on first read (one-shot at load time, never on save — so a user who deletes
their Session Sheet keeps it deleted within the same app session). The
worksheet-tab `+` is a `PopupMenuButton<WorksheetKind>` offering both
kinds; Session Sheet tabs render with a leading `Icons.list_alt` badge.

The lap table and lap progression chart honour the global XOR selection
model (`selectionProvider`, §13): per-row checkboxes call `toggleSession`
or `toggleLap`, mute the inactive-mode column at 40 % opacity, and tapping
a muted box flips the mode atomically. The lap-progression chart's "scope"
is `effectiveSessionIdsProvider` so it works in both modes — the parent
session of any pinned lap key surfaces its full progression line.

### 21.2 X Axis Modes (all time-series graphs)
- **Time** — elapsed from gate (default)
- **Wheel distance** — integral of wheel speed (requires sensor)
- **GPS distance** — cumulative along GPS track

**Channel presence detection:** Wheel distance mode requires a channel with ID `WheelFront` or `WheelRear`. GPS distance mode requires `GPSSpeed`. Detection is by exact ID equality, not substring match.

**Fallback when data absent:** If the selected mode's required channel is not present in the active channel set, the chart falls back to time-axis display and shows a warning banner. The `workspaceProvider` retains the requested mode — it does not revert to `time` automatically. When the required channel is subsequently loaded, the chart switches without user action.

**Event-driven channels (`sampleRateHz == 0`):** Channels with zero sample rate (HR_RR, wheel pulses, digital markers) are plotted against their per-sample timestamps, self-sourced from the handle via `channel_sample_times` (`channelSampleTimesProvider`) — sample `i` is placed at `sampleTimesSecs[i]` seconds, not `i / rate`. This keeps an irregular channel on the correct wall-clock position: without it, one sample per heartbeat plotted at the fallback 1 Hz stretches the axis by the mean event rate (e.g. HR_RR at ~120 bpm would span 2× the real session duration). Decimation is unchanged — tiles still hold index-bucketed min/max envelopes; only the bucket→X mapping and the viewport→sample-range mapping read the timestamp array (`sampleXSeconds` / `sampleIndexAtTime` in `time_series_chart.dart`). A channel that somehow has no per-sample times still falls back to the 1.0 Hz index mapping.

### 21.3 Lap Detection
- Start/finish gate drawn on GPS map by tapping two points
- Placeable after first lap — retroactively scores lap 1
- Sector gates defined same way — multiple per lap
- **Circuit mode** (one gate, acts as start and finish): each crossing ends the current lap and starts the next. Lap 1 starts at the first GPS fix of the session. 0 crossings → 0 laps.
- **Point-to-point mode** (separate start gate + finish gate): each start→finish pair = one lap. Used for stages (downhill, enduro) where start and finish are at different locations.
- **Crossing algorithm:** 2D line-segment intersection with the flat-earth approximation (lat/lon treated as Cartesian x/y). Accurate to centimetres for gate lines under ~100 m.
- **Sector gates** are global to the workspace — they apply to every lap regardless of which start/finish gate configuration is active.

**Gate model and storage (workspace_version 2):** Each `LapGate` carries a `name` field (display label, defaults to empty string for v1 files; the UI substitutes `Start/Finish` or `S<n>` when empty). All gate coordinates are stored at the firmware × 1e7 scale (deg × 1e7) — same scale as `GPS_Latitude` / `GPS_Longitude` channel samples — so the detector can compare gate vs. track without any unit conversion. The first entry of `Workspace.lapGates` is the start (and the finish, in circuit mode); a second entry promotes the session to point-to-point with that entry as the finish line. Additional entries beyond the second are stored but unused, so users can park alternative gate positions in the same file.

**Ghost lap timing:** `Workspace.referenceLapNumber` (nullable, also new in v2) pins which lap acts as the comparison baseline for ghost-delta charts. `null` means "use the fastest lap" — the comparison auto-selects whichever lap currently has the shortest time, even when a faster one is recorded later in the session. Ghost-delta views are transient (full-screen modal route, not stored as workbook chart slots); pin a reference lap to make the auto-selection deterministic across runs of the comparison.

**Main / Overlay / Starred designation.** Per-session `.idl0w` carries three nullable fields (`Workspace.mainLapNumber: int?`, `Workspace.overlayLapKey: ({String sessionId, int lapNumber})?`, `Workspace.starredLapNumber: int?`) that replace the old top-level `WorkspaceState.baselineLapKey`. **Main** is the lap variance functions evaluate over (the "this lap"). **Overlay** is the reference lap they compare against — it carries a `sessionId` so the overlay can live in a different session (cross-session compare), and is resolved at evaluation time through `sessionProvider` + `sessionWorkspaceProvider` + the overlay session's retained handle (its lap-window slice is taken with `slice_by_time_into_store`). **Starred** is independent of main/overlay; it drives lap-table emphasis and gauge defaults, defaults to the fastest non-ignored lap when null, and is user-overridable from the lap-table star column. `variance_time` and `variance_dist` (§19) read `mainLapNumber` and `overlayLapKey` directly; missing either throws a `MathChannelEvaluationException`. Lap-table UI surfaces both designations as radio columns; a "Pick from another session…" affordance opens the cross-session overlay picker scoped to sessions whose workspaces have a `TrackVisit` to the active Track. The legacy `Workspace.referenceLapNumber` (introduced in workspace v2 for ghost-delta charts) is retained — it pins the ghost-delta reference and is independent of main/overlay/starred.

**Ghost lap delta filtering.** Raw per-sample deltas pass through a three-phase pipeline. Phase 1 is the forward-monotonic projection matcher with a direction filter that surfaces both the delta and the squared projection residual (target-to-polyline distance) per sample. Phase 2 is a narrow centered median (default width 3) that kills isolated single-sample garbage. Phase 3 is a confidence-weighted Gaussian: each output sample is a weighted mean of neighbours within a ± time window, weighted jointly by temporal proximity and per-sample confidence (`exp(-residual / driftSensitivity²)`), so noisy samples in switchback terrain attenuate to near zero while clean projections carry the result. The smoothing window is expressed in seconds rather than samples so behaviour is consistent across 1 Hz Strava exports and 10 Hz device data. A rider stopping mid-track produces a small residual (the target parks on the polyline at one point), so confidence stays high, no smoothing is applied, and the legitimate 1 s/s slope passes through cleanly.

### 21.4 Cross-Rider Comparison
- Overlay multiple sessions on shared X axis
- Time-from-gate: phase shifts = time deltas
- Lap time delta derived channel: `t_A(x) - t_B(x)` at same X value
- See §21.2 for X axis options — wheel/GPS distance available for position-normalized comparison

See `docs/design_rationale.md` for sector timing & ghost lap implementation rationale.

---

# PART 6 — APP UI

## 22. UI Structure

### 22.1 Navigation
- Mobile: bottom nav bar (4 tabs)
- Desktop: left side rail (4 tabs)
- `flutter_adaptive_scaffold`, breakpoint 600px
- **Small desktop window (< 600 dp):** bottom NavigationBar — same as mobile. A Drawer is never used (`useDrawer: false`). Width alone determines the navigation widget; platform (mobile vs. desktop) does not.

### 22.2 Tab responsibilities

Everything about a connected device lives on the **Device tab** (§23): the
Device card (status, recording, push/pull config, **file sync**) and the Config
card (profile + channels). The **Data tab** (§24) is purely the **library** —
browsing/filtering recorded sessions and tracks plus Drive sign-in; it has no
device-connection surface. Device file download is reached from the Device
card's Files entry (which drives WiFi automatically), not the Data tab.

---

## 23. Tab — Device

The Device tab manages the BLE connection, the active bike profile, and the per-channel configuration that gets pushed to the device.

The tab is organised as **two cards**: the **Device card** (the hero — live status, mode-as-info, recording, push/pull config, and file access; §23.10) and the **Config card** (profile bar + channel table; §23.2/§23.3). Calibration (§23.5) is a collapsed section below both cards.

### 23.1 Connection panel

BLE scan / connect / disconnect, with the §7.3 status characteristic rendered as a live status pane: battery, SD, GPS, IMU, and (when Spec 2 lands) HR + HR_Battery. Status rows showing values that are not auto-refreshed are annotated as such — auto-refresh / refresh-button is tracked as a follow-up task.

### 23.2 Profile bar

A profile is one complete bike-specific configuration: `runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 11's `BikeProfile` shape (`profile_id`, `profile_name`, `created_at_ms`, `updated_at_ms`, and a `config` sub-object — the SPEC §8 device-config document, pushed verbatim). idl0 stored the library as JSON files at `<docs>/profiles/<uuid>.idl0p`, one profile active at a time; **Push Config** (§23.6) pushes only the active profile's `config`.

**Wave 2 (`Device/profiles.ts`, `Device/profilesSync.ts`, `Device/ProfileBar.tsx`, L7b Task 10, R77.4) persists the library** over the landed `list_profiles`/`save_profile`/`delete_profile` (C3 §3.10, `rust/core/src/store/profile.rs`'s `load_all`/`save`/`delete`). `save_profile` is a whole-document replace, **last-write-wins** — the tab never merges; a save's returned `BikeProfile` replaces the local copy, never the optimistic one sent. **Save policy (ruling R78 Q3, 2026-09-06): an explicit "Save profile" button, no autosave** — every edit (rename, duplicate, new profile, or a channel-table change) stays local, with a dirty marker on the profile bar, until the user presses Save; this matches Push Config's "review, then press" rule (§23.6) and avoids a write on every config-editor keystroke. A profile whose `config` fails `Device/config/model.ts`'s `parseConfig` (any repair needed counts as a failure — never a silently defaulted config), and any file `list_profiles` itself could not parse, are both shown together in one skipped-profiles list. The bar itself is close to idl0's shape:

- **Dropdown** — lists profiles by `profile_name`, single-select. Selection updates the active pointer (`profilesReducer`'s `SELECT`).
- **`+ New profile`** — creates a profile seeded from `Device/config/defaults.ts`'s `defaultConfig(deviceId)` and makes it active (`CREATE`). Wave 2 has no "Duplicate active" toggle on creation — duplicating an existing profile is its own action, below.
- **Duplicate / Rename / Delete active** — `DUPLICATE` deep-copies the active profile's `config` (`structuredClone`) under a new `profile_id`, so editing the copy never touches the original; `RENAME` does not enforce unique names, only unique ids; `DELETE` reassigns `activeId` to another remaining profile, or `null` when the library becomes empty — wave 2 does **not** refuse deleting the last profile (idl0's "a profile library cannot be empty" rule), since an empty library is exactly the honest state of a fresh session with nothing created yet. Import/export from file are not built in wave 2 (no file dialog is wired to this bar).

The active profile id is **not** persisted anywhere — no `SharedPreferences` equivalent — consistent with the whole library being in-memory only.

### 23.3 Channel table

`Device/sources.ts`'s `listSources(config)` builds one `SourceView` row per
configurable source — `imu0`/`imu1`/`imu2`, `gps`, `wheel_front`/`wheel_rear`,
one per `analog.channels[]` entry, one per `digital.channels[]` entry, and
the heart rate monitor — in that stable order, hardware-pinned sources
first. `ChannelsTable.tsx` renders it: **Source · Rate Hz · Channels
(`enabled/total`) · Enabled · ⚙**. Enable state and rate are joined from
`previewSources` (§23.2's sibling Task 4 module) by `sourceKey`, never
recomputed here.

The ⚙ control opens that source's form: the three `imu0`/`imu1`/`imu2` rows
and the two `wheel_front`/`wheel_rear` rows each share one form per group
(§23.3.1, §23.3.3), `gps` opens its own (§23.3.2), and an analog, digital or
heart-rate-monitor row opens its own entry's form keyed by that row's
`sourceKey` (§23.3.4–.6).

Expanding a row lists its channels: **Name · Units · Enabled · Scale ·
Offset**, where Scale/Offset show only for an `analog.channels[]` entry's
own config-typed `scale`/`offset` (the value the user typed) — every other
source's channel rows show `—` in those two columns. Wave 2 has **no
predicted `channel_id` or data-type column**: that number is `core::parse`'s
own arithmetic (SPEC §3's `scale = range / 32768`), and showing it here
before `preview_channel_registry` (IPC need 12) lands would be a second,
driftable copy of wire-format logic in TypeScript (R53 Device Q1).

For sources whose sample rate is hardware-shared across instances (IMUs all
on one SPI bus, analog channels round-robined by the ADC scheduler), the
rate is shown once at the source row, not per channel — there is no
per-channel rate to edit independently of the source-level rate.

Hardware-pinned sources (IMU, GPS, Wheel Speed) and the heart rate monitor
are always present in a profile, shown even when disabled — HRM has no
picker entry of its own (§23.4) precisely because it is never added or
removed, only configured. User-added sources (Analog, Digital marker) each
appear once created via **+ Add channel…**.

**Breakdown row names are the SPEC §5.4 registry channel names, verbatim** —
`WheelFront`/`WheelRear`, `HR_BPM`, and the GPS row's six children
(`GPS_Latitude`, `GPS_Longitude`, `GPS_Altitude`, `GPS_SpeedKmh`,
`GPS_Heading`, `GPS_EpochMs`) — never an invented word (`"pulse"`,
`"heart_rate"`, `"fix"`). A user sees the same name here as the Data tab and
notebook will use for the same data once those read the registry.

**While `pull_config` (IPC need 10) is not yet wired**, the config card
renders against `defaultConfig("")` — a fabricated placeholder, not a
connected device's actual settings — and shows a visible banner above the
table saying so, so a default Rate/Enabled value is never mistaken for a
real one.

### 23.3.1 IMU form

`Device/forms/ImuForm.tsx` edits `config.imu` as a whole: the SPI-bus-shared
`sample_rate_hz`, the `low_power_mode`/`high_performance_mode` flags, the
top-level default `accel_range_g`/`gyro_range_dps`, and the three
`imu0`/`imu1`/`imu2` sub-blocks (each its own enable flag, range overrides,
and six axis checkboxes). The sample-rate control's option list switches
between the high-performance and low-power ODR tables based on
`low_power_mode`; both range controls are limited to the LSM6DSO32's four
accel and five gyro full-scale options. Every field commits immediately
through `Device/config/edit.ts` (`setImuRate`/`setImuSlot`/`setImuAxis`/
`setImuModeFlags`/`setImuRanges`) and re-runs `validateConfig`, showing that
field's own issues inline — never snapping or blocking the edit itself, only
the eventual push (§23.6).

### 23.3.2 GPS form

`Device/forms/GpsForm.tsx` edits `config.gps`: fix rate (an integer 1–10 Hz
picker), dynamic model (the five SPEC-stated values), the six-sentence NMEA
checklist, and SBAS. Commits through `setGps`, one field at a time — toggling
`dynamic_model` never touches `nmea_sentences` or `sbas_enabled`.

### 23.3.3 Wheel form

`Device/forms/WheelForm.tsx` edits both `wheel_speed.front` and `.rear`
slots in one form: each slot's enable flag, Hall-sensor points-per-
revolution count, and wheel circumference (mm). Commits through
`setWheelSlot`, one slot at a time — editing front never touches rear.
Matching `validateConfig`'s own rule (§23.3), a slot's geometry issues show
only once that slot is enabled.

### 23.3.4 Analog form

`Device/forms/AnalogForm.tsx` edits one `analog.channels[]` entry: label,
units, ADC pin, scale, offset and enable flag, plus Delete. Commits through
`Device/config/edit.ts`'s `upsertAnalogChannel` (both a new draft entry from
the picker and every field edit here go through the same function — a new
channel's `key` is already unique by construction, so "insert" and "replace
in place" are the same operation from `upsertAnalogChannel`'s point of
view) and `removeAnalogChannel`.

The ADC pin control is a plain non-negative-integer input, starting empty
when the pin is unassigned (`adc_pin: null`), never a `<select>` — SPEC §8
states no valid `adc_pin` range or numbering scheme for a picker to
enumerate (ruling R58, `runs/2026-09-03/decisions.md`), so the app never
invents one or auto-selects a pin on the user's behalf. `validateConfig`
reports an unassigned pin as a push-blocking error and a pin shared with
another analog or digital entry as a collision error; this form shows both
inline, never snapping or rejecting the keystroke itself. **The pin input
is unconstrained until SPEC §8 states the device's valid `adc_pin` value
set** (or maps it to §3.7's named connector nets) — when it does, the
input becomes a select and the validator gains a range rule, in one task,
with no model change.

### 23.3.5 Digital form

`Device/forms/DigitalForm.tsx` edits one `digital.channels[]` entry: label,
GPIO pin, active-low polarity, debounce window (ms) and enable flag, plus
Delete. `kind` is shown as read-only text, never a picker — Spec 1 only
ever creates `"marker"` entries (§23.4's picker); `"level"`/`"pwm"` are
reserved in the schema (§8) but not exposed for editing even on an entry a
loaded config file already carries with one of those kinds. Commits through
`upsertDigitalChannel`/`removeDigitalChannel`, same pattern as the Analog
form. The GPIO pin control is the same unconstrained non-negative-integer
input as the Analog form's, for the same reason (§23.3.4); the same
"unconstrained until SPEC §8 states a value set" note applies.

### 23.3.6 HRM form

`Device/forms/HrmForm.tsx` edits `heart_rate_monitor`: an enable flag, a
**Search nearby** action, manual address entry, and an informational
device-name field, plus Forget.

Search nearby runs `bleScan` (C3 §3.8) for a fixed window and lists every
BLE device found, each with a Select action. `bleScan`'s `DeviceDiscovered`
shape carries no service-UUID filter, so the app cannot narrow this list to
heart-rate straps specifically (Parity gap noted in
`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`) — the form lists everything and
the user picks by name. Selecting a result writes its identifier into
`device_address` and its name into `device_name` verbatim and sets
`enabled: true`, through `setHrm`. On a platform where the discovered
identifier is not the colon-separated uppercase-hex MAC SPEC §8 states,
`validateConfig`'s `BLE_ADDRESS_RE` check reports it as an invalid address
rather than the form silently reformatting or discarding it — visible, not
silent, the same stance ruling R58 takes on an unassigned pin.

The address field also accepts manual uppercase-hex entry, validated the
same way. Forget calls `clearHrm`, removing the block entirely (SPEC §8:
an absent block is equivalent to `enabled: false`) rather than leaving a
`{ enabled: false, ... }` shape behind. The form states plainly that the
device logs HR_BPM (channel 22) and HR_RR (channel 23) while enabled
(SPEC §5.2).

### 23.4 `+ Add channel…` picker

`Device/forms/AddChannelPicker.tsx` lists `Device/config/newChannel.ts`'s
`addChannelOptions(config)`: **Wheel front**, **Wheel rear** (each toggles
that slot's existing `enabled` flag via `setWheelSlot` rather than creating
a new entry — a config has exactly one front and one rear slot — and is
disabled once that slot is already enabled), **Analog channel** (creates a
new draft `AnalogChannel` via `newAnalogChannel`) and **Marker button**
(creates a new draft `DigitalChannel` via `newDigitalMarker`). Spec 1 does
not expose **Heart Rate Monitor** as a picker choice — the HRM source
always exists as one fixed row in the channels table (§23.3), configured
through §23.3.6's form directly, never added or removed.

Both `newAnalogChannel` and `newDigitalMarker` generate a key of the form
`"analog_N"`/`"marker_N"` that never collides with an existing key in the
config (never idl0's literal `"__new__"`, which collided on a second add)
and seed SPEC §8's example-shape defaults (`enabled: true, scale: 1,
offset: 0` for analog; `kind: "marker", active_low: true, debounce_ms: 20`
for digital) with an unassigned pin (§23.3.4/.5). Choosing an option
commits immediately and closes the picker; the new row then appears in the
channels table like any other source, and the user opens its own gear
control to fill in the label, pin and other fields.

### 23.5 Calibration

The Calibration panel runs `CMD_CALIBRATE_IMU` per §7.6 and writes the resulting `bias` / `orientation` matrices into the active profile's `config.imu` block via `profileProvider.updateConfig`.

### 23.6 Push Config

Sends the active profile's `config` sub-object (app-side metadata such as `profile_id`/`profile_name` stripped) to the device over BLE (FF05 + `CMD_CONFIG_BEGIN`/`CMD_CONFIG_COMMIT`, §7.2); the device then reboots to apply and the app reconnects. Requires idle mode (BLE control is suspended in WiFi mode, §10.4).

**Wave 2 (`Device/push.ts`, `Device/PushConfigBar.tsx`)** calls the real, landed `push_config` (C3 §3.8) over `pushConfig(deviceId, configJson)`, never a hand-built JSON string. `preparePush(config)` is the one gate a config passes through: it runs `validateConfig`/`isPushable` and only serialises with `serializeConfig` when there is zero error-severity `ValidationIssue` — **validate, then serialise, never the reverse**, the lane's load-bearing invariant, since `push_config`'s Rust side checks JSON syntax only. Warning-severity issues (an enabled-but-empty IMU slot, a reserved digital-channel kind) never block a push. `PushConfigBar`'s **Push config** button is enabled only when a device connected in this session (`ConnectionState.connected !== null`, read as "the last attempt succeeded" per R53 Device Q4, never a live link), a profile is active, and `isPushable` holds; the push itself runs through a small pure `pushReducer` (idle → pushing → succeeded/failed) so a double click or an unrelated re-render can never stack a second `pushConfig` call on top of one already in flight.

Idle mode is **stated in copy, not enforced** — `device_status` (IPC need 8) is a stub, so the app cannot read the device's current mode before pushing; a push attempted while the device is in WiFi mode surfaces as a rejection (`kind: "config"` or `kind: "ble"`, `Device/errors.ts`'s `describeIpcError`) rather than being blocked in advance.

**What verification currently does and does not prove.** idl0's push flow reconnects and (once landed) confirms the device is running what was sent. `pull_config` (IPC need 10) is a stub in wave 2, so there is no reconnect-and-verify leg yet: `describePushResult(reconnected, verified)` names all four states SPEC intends (verified match, verified mismatch, reconnect failed, verification unavailable), but every real push in wave 2 lands on the last one — **"Config applied, not verified."** A push that resolves without throwing means only that the device accepted and is applying the bytes sent; nothing in wave 2 confirms the device is actually running them afterward. **Pull from device** is wired to the `pull_config` stub as a visible placeholder — pressing it reports "not available yet" rather than silently doing nothing or claiming success.

Config pushes are never automatic — per §8, the user must review changes and explicitly press Push Config.

### 23.7 Recording controls

Start / Stop session — sends `CMD_START_LOGGING` / `CMD_STOP_LOGGING` per §7.2.

**Wave 2 (`Device/control.ts`, `Device/DeviceControls.tsx`, L7b Task 10, R77.4).**
Start/Stop recording and WiFi on/off go through the landed `device_control`
(C3 §3.8), gated by `controlAvailability` (WiFi and recording are mutually
exclusive per §23.9; a control whose deciding field is `null` — not
reported — is withheld rather than guessed). `device_control` sends the
command and polls status internally until the transition is observed or a
bounded timeout expires, **returning the post-transition status either way —
never timing out to an error** (R59). On this desktop BLE stack the SPEC
§7.2 acknowledgement byte never reaches the app (R63 item 1, R71 correction
2026-09-06), so a device that refuses a command cannot be distinguished from
one that silently ignored it: a resolved `deviceControl` promise is *never*
reported as success. The only evidence is `transitionObserved`'s read of the
returned `DeviceStatus` against what the command asked for — `"observed"`,
`"not-observed"` (sent, but the status still shows the old state), or
`"unreported"` (the relevant field came back `null`) — each shown as its own
distinct sentence, and a provisional-controls banner states this constraint
plainly beside the buttons.

### 23.8 Deferred

Recently connected devices list — requires persistent storage of past device names/IDs across sessions; not present in v1.

### 23.9 Mode status (info-only)

Mode is **automatic** — there is no manual mode picker. WiFi is driven on
demand by file sync (§24) and OTA (§27): each enters WiFi when needed and
returns to idle when done. Recording is driven by the hero card's primary
button. The Device card shows the current mode as a non-interactive status
line (`Idle` / `Syncing…` / `Recording`).

Transitions still run through `ModeController.switchTo` and the §7.2 mutex
still applies (WiFi and recording are exclusive). Transitions out of WiFi run
over HTTP (`POST /wifi_off`, §10.4) followed by a BLE-reconnect leg.

**Recording starts immediately.** Sensor health — HR strap, GPS, SD, IMU,
battery — never gates recording; a degraded sensor surfaces as a non-blocking
warning on the Device hero card (§23.10). `idle → recording` sends
`CMD_START_LOGGING` directly with no HR-up wait.

Mode-transition refusals are surfaced by an always-mounted `ModeResultListener`
wrapping the Device tab — so feedback survives even though there is no picker —
per `TransitionResult`:

- `RefusedByFirmware(attCode, reason)` and `RefusedByPolicy(reason)` surface as
  SnackBars with the reason text.
- `TimedOutAwaitingConfirm(expected)` surfaces as a persistent `MaterialBanner`
  with a Reconnect action (v1: action only dismisses).
- `AbortedByDisconnect` / `AbortedByCancel` are silent.

### 23.10 Device hero card

The Device tab leads with a hero card — the single prominent status +
primary-action surface — a state machine over the live device state:

- **No device** (`!isConnected`): a full-width **"Select a device ▾"**
  dropdown that opens the picker.
- **Ready** (connected, not recording): a **"Connected · {name} ▾"** device
  dropdown + battery + a live **RX/TX** activity pair (RX blinks on each
  status frame, TX on each command sent), the colour-coded peripheral
  readout, and a large green **Start recording** CTA.
- **Recording**: a pulsing live indicator + `mm:ss` timer, RX/TX, the
  peripheral readout, and a large amber **Stop recording** CTA.

The **peripheral readout** (SD / GPS / IMU / HR / HRM battery / firmware
version) is folded into the hero, colour-coded so a degraded sensor reads
as an in-place warning — green healthy, amber degraded, red fault — never
blocking recording (§23.9). The firmware-version entry (`FW v<version>`)
is neutral — a version is not a health state — and renders only when the
device has reported a §7.3 `Firmware:` line. There is no separate
Connection section. Richer detail (GPS fix-type + satellite count, SD free
space, signal RSSI) is planned, pending the firmware §7.3 status carrying
it.

The card is intentionally dense — no instructional copy (first-run
guidance is a separate walkthrough). Start/Stop route through
`ModeController.switchTo`; refusals surface via the always-mounted
`ModeResultListener` wrapping the tab (§23.9); Connect/Disconnect are handled
on the hero and never surface an uncaught transport error.

While disconnected (and the app is foregrounded), the app **auto-connects** to
the nearest IDL0 on a steady scan cadence (the "headphones" model), so the
common case needs no tap — powering a device on connects it, and an unexpected
BLE drop reconnects on its own. Two paths opt out: a manual **Disconnect**
parks the scanner for the session (so "disconnect" means disconnect, re-armed
by a manual scan), and the OTA push parks it around its own reboot-reconnect
(§27.7) so the two never race for the link. Scanning is foreground-only — a
backgrounded BLE scan is OS-throttled and would only drain the battery.

A device **dropdown** (`StatusDropdownTrigger`) on the hero opens the
device **picker** sheet — the single surface for choosing / disconnecting
the source. Today it scans and connects the nearest IDL0, disconnects the
current one, and lists **"This phone"** as a forthcoming GPS source.
Auto-connecting only a *known* (previously-paired) device, listing every
nearby IDL0 in the dropdown (system-Bluetooth style), true multi-unit
switching, a persisted paired-device list (§23.8), the phone-GPS recording
mode, and the on-device download/transfer card are still deferred.

**Wave 2 (`Device/HeroCard.tsx`, `Device/statusPoll.ts`, `Device/control.ts`,
`Device/DeviceControls.tsx`, L7b Task 10, R77.4) goes live.** The connect
path moved from the connect-act-disconnect `ble_connect` to the managed
`connect_device`/`disconnect_device` pair (C3 §3.8, R59) — a 1 Hz poll is
not implementable on a command that reconnects every call. While the tab is
mounted, a device is connected, and the window is visible
(`document.visibilityState`, R78 Q1), a pure `startStatusPoll` driver polls
`device_status` at 1 Hz: one request in flight at a time, the next timer
armed only once the previous settles, a rejection dispatched and the poll
continued rather than stopped (a device walking back into range recovers on
its own). `HeroCard` now shows real `Mode` / `Recording` / `SD card` /
`GPS fix` / `IMU` / `HRM` / `Battery` / `Firmware` / `WiFi` rows, each in one
of three distinct states: the real value, the literal **"unavailable"** for
a field the device did not report (never a plausible-looking zero or a
colour-coded "healthy" state it cannot back up — a fabricated battery
reading on a race day is worse than a blank one, lane brief "Do not"), or
**"not polled yet"** before the first result. After three consecutive
`device_status` rejections (`LINK_LOST_AFTER_FAILURES` — no source states a
number) a "link lost?" note appears beside the card; per ruling R78 Q2 this
does **not** change `ConnectionState.connected` or stop the poll, since a
transient BLE drop that self-heals is the common case, not the disconnect
one. Start/Stop recording and WiFi on/off (§23.7) are offered through
`DeviceControls.tsx`'s provisional-controls banner and buttons.

Still not built from idl0's dense state machine: the colour-coded
peripheral readout (values are shown, but not colour-coded healthy/degraded/
fault), RX/TX link-activity indicators, the `mm:ss` recording timer, the
device dropdown/picker sheet, and the auto-connect ("headphones") loop — the
tab's plain **Scan for devices** / **Connect** / **Disconnect** buttons
(`Device/connection.ts`) are still the only way to reach a device. IMU
calibration (§23.5) and HRM pairing (§23.3.6's Search nearby) are likewise
not built. `preview_channel_registry`'s enable/rate/unit widening (R53
Device Q1) is explicitly out of this task's scope, as is the recently-
connected-devices list (§23.8, already deferred).

---

## 24. Tab — Data

### 24.1 Purpose

The Data tab is a McMaster-Carr-style faceted search interface that operates over both sessions and tracks. The driving use case is "find my best lap on Track X to look up the bike setup that produced it." It replaces the previous flat Runs list.

**File.** `app/lib/ui/tabs/data/`.

### 24.2 Layout

- **Wide (≥ 720 dp):** three-column — filter rail (~280 dp) | results list | detail pane. The detail pane is empty until the user opens a detail card.
- **Narrow (< 720 dp):** filter rail collapses behind a "Filter" button at the top of the results panel; tapping opens a modal bottom sheet (active filter count badge on the button). The detail pane is also presented as a modal bottom sheet rather than a fixed column.

### 24.3 Two Views, One Filter Set

- **Sessions view (default)** — sessions grouped by Date · Venue, with inline lap expansion.
- **Tracks view** — Tracks grouped into collapsible venue sections (mirroring the Sessions Date·Venue grouping), with right-pane `TrackDetailPanel`.

View toggle: `SegmentedButton<DataView> { sessions, tracks }`. The active filter set persists when switching views; facets not applicable to the current view (e.g., lap-time range when viewing tracks) are hidden or greyed.

### 24.4 Filter Rail (idl1, wave 2 — `app/src/routes/pages/Data/`)

Rewritten for idl1 (was idl0's `_FacetGroup`/`FilterRail`/`filter_rail.dart`,
Flutter). The facet model is `Data/filters.ts`'s `DataFilters` (state) and
`Data/facets.ts`'s `matchesFilters`/`facetCounts` (matching); the rail itself
is `Data/FilterRail.tsx`, the dismissible-chip row above the results is
`Data/ActiveChips.tsx`.

**Combining rule.** Filters compose with **AND across facet categories** — a
row must pass every active facet to appear in the results. Within one
multi-select facet, matching is **OR** — any one of the selected values is
enough (e.g. selecting two bikes shows sessions ridden on either). An empty
selection (a Set with no members, or `null` for a range) means that facet is
inactive and passes every row through unfiltered.

**The `""`-is-"(none)" convention.** For Bike, Rider, Tag and Venue, the
empty string `""` is a synthetic pseudo-entry selectable like any other
option; it matches a row whose corresponding `SessionSummary` field is the
empty string (idl0's "(none)" entries, ported as-is).

Facets, top to bottom (`FilterRail.tsx`'s section order), and what each
reads:
- **Date** — inclusive range over `SessionSummary.timestamp_utc_ms`, compared
  by local (viewer time zone) calendar day so a row on the range's own last
  day matches regardless of time-of-day. Today / Week / Month presets plus a
  custom start/end pair.
- **Bike** — multi-select over `SessionSummary.bike`. `""` is "(none)".
- **Rider** — multi-select over `SessionSummary.rider`. `""` is "(none)".
- **Tag** — multi-select over `SessionSummary.tag`. `""` is "(none)".
- **Venue** — multi-select over `SessionSummary.venue_name`. `""` is "(none)".
- **Lap time** — inclusive millisecond range. At wave 2 this keys off
  `SessionSummary.duration_ms` (a session's total ride time), the closest
  field a `SessionSummary` actually carries — there is no per-lap time on a
  `SessionSummary`. A row with a `null` `duration_ms` is excluded from a
  bound range, not included by default.
- **Source** — multi-select over `SessionSummary.source_format`, **C3's own
  vocabulary** (`idl0 | fit | gpx | csv`) — not idl0's `SessionSourceType`
  enum, which named formats idl1 doesn't import from this path (e.g. no bare
  `.gpx`-as-track distinction) and lacks `fit`/`csv`.

**Track, has-gates and has-GPS are absent for wave 2** (R53 Data Q2, R54) —
dropped outright, not stubbed, not shown disabled. None of the three is
derivable from a `SessionSummary`: Track needs lap-level attribution
(`LapSummary.track_id` or `SessionDetail.track_visits`), "has gates" needs a
matched Track's gate list, "has GPS" needs a GPS channel presence check, and
all three currently require a per-session `getSession` or lap-indexed data
this tab's local filtering does not have. **R54 ruling:** a facet a viewer
can select but that structurally can never match a row (as a wave-2 Track
facet fed only by `list_tracks`, with no session→track linkage, would be) is
a trap, not honesty — worse than simply not offering it. This differs from
the lap-time and lap-count gaps, which keep the control and render "—"/empty
per row (R53 Data Q4): those controls still act, they just have nothing to
show; a wave-2 Track facet's control would not act at all. Filed as a wave-3
C4 §5 + C3 §3.2 amendment (same item for all three) — likely catalog columns
added at index time, not a runtime join.

**Search** — free-text, case-insensitive substring match across venue name,
short comment and tag (`Data/facets.ts`'s `matchesFilters`) — idl0 also
matched Track name and the long comment; both are dropped for wave 2 for the
same reason as the Track facet (no session→track join) and because
`SessionSummary` has no long-comment field (only `SessionDetail` does).

**Active chips** (`ActiveChips.tsx`) — one dismissible chip per active facet
value plus "Clear all", idl0's `_ActiveChipRow` semantics: the date chip
reads `Date: <day>` for a single day or `Date: <start> → <end>` for a range;
the lap-time chip reads as a clock (`mm:ss` or `h:mm:ss` past an hour), not
raw milliseconds. "Clear all" resets every facet to its wave-2 default but
leaves the active `view` and sort untouched.

### 24.5 Search Bar

Top of the results panel. Case-insensitive substring match across `venueName ∪ shortComment ∪ longComment ∪ Track.name ∪ tag`.

### 24.6 Active Filter Chips

Row above results; one chip per active facet value. Tap × on a chip to remove that single filter. "Clear all" at the right end clears everything except search text.

### 24.7 Sessions View

Sessions are grouped by `(Date, Venue)`. A day with two different venues produces two separate header rows under the same date.

**Header row tap behaviour:**
- Tapping the venue text portion of the header opens a `VenueDetailCard` in the detail pane.
- Tapping the rest of the header body toggles expand/collapse for that Date·Venue group.

**Session row layout:** `[ checkbox ] [ chevron ] [ body ]`

- **Checkbox** — writes via `selectionProvider.toggleSession` (session-mode) or `selectionProvider.toggleLap` (lap-mode). Mode flips automatically per §13 semantics.
- **Chevron** — toggles inline lap expansion for that session row (independent of the detail pane).
- **Body** — opens a `SessionDetailCard` in the detail pane.

```
Tuesday · 2026-05-15
  Whistler Bike Park                              ← venue header (tap venue → VenueDetailCard; tap body → collapse)
  ☐ ▾ 14:32  A-Line, Dirt Merchant +1 more · Stumpjumper · [Practice] · 5 laps · 47:12
       Lap 1  A-Line     00:48.2
       Lap 2  A-Line     00:46.8 ★
       Lap 3  Dirt Merchant  01:14.3
```

When a session has TrackVisits, the track list renders inline as `name1, name2 +K more` (truncated to avoid overflow). ★ marks the fastest visible lap per session. Within a session, laps render flat with the track name on each row (not nested by track).

Sessions with zero filter-matching laps are hidden. Lap counts and total time recompute from filter-matching laps only.

**Data flow — no parse on open.** The Sessions and Tracks views, lap-time facet domain, and the "compare with" picker build their aggregates from the laps cached on `TrackVisit.laps` (§17.4), read directly from each session's already-loaded `.idl0w`. Opening the Data tab never parses a `.idl0` session — parsing happens only on import, explicit rescan, or when a file is opened in Analyze.

### 24.8 Tracks View

Flat sortable table. Columns: Name | Sessions | Laps | Best lap | Last ridden. Clicking a row opens `TrackDetailPanel` in the detail pane (desktop) or as a full-screen route (mobile). See §24.10 for the Track detail card contents.

### 24.9 Detail Pane

The detail pane is driven by `detailSelectionProvider`, which holds a `DetailSelection(kind: DetailKind, id: String?)`. `DetailKind` is an enum: `none | session | venue | track`. This axis is fully independent of `selectionProvider` (the XOR multi-select used for Analyze).

Opening any detail card sets `detailSelectionProvider` to the corresponding kind + id. Pressing the back/close button sets it back to `none`.

### 24.10 Session Detail Card (`SessionDetailCard`)

At the top, a non-interactive **GPS map preview** (`SessionMapPreview`) renders
the session's GPS polyline (`sessionGpsPreviewProvider` → engine `gpsTrack`) on
the app basemap (`tileSpecsFor`), fit to its bounds, so the user can recognise
*where* a session was before any Track work. Sessions without GPS show a "No GPS
data" placeholder. When the session has GPS, a **"Create track from this
session"** button opens the Track Editor in create mode (§24.12) — naming
happens there, with the map visible.

The header venue falls back to a matched Track's venue when the session carries
no explicit `venueName` (mirroring the venue filter facet and the Sessions-tree
heading). The editable **Venue** field is *pre-filled* with this same resolved
venue when `venueName` is empty, so saving the card persists the venue into the
session's own metadata rather than leaving it blank.

**Metadata form (idl1, wave 2 — `Data/metadataDraft.ts`, `Data/MetadataForm.tsx`).**
Rewritten over C1 §6's `session.json` fields — the nine editable fields are
now exactly `rider`, `bike`, `bike_comment`, `venue_name`, `event_name`,
`event_session`, `tag`, `short_comment`, `long_comment`; `""` is the only
"not set" representation for any of them (C1 §6 has no null). idl0's
distinct-Track/`Autocomplete` sourcing for Rider and Bike is dropped for
wave 2 — `venueOptions` (`metadataDraft.ts`) still derives the Venue
suggestion list from `list_tracks`' distinct `venue_name` values, deduped
and sorted, matching this section's venue-autocomplete rule above; Rider and
Bike render as plain text fields.

The **venue pre-fill rule carries over unchanged**: `initialDraft` fills
`venue_name` from the session's own `venue_name` when non-empty, otherwise
from the first resolvable visited track's `venue_name`
(`trackRow.ts`'s `resolveDisplayVenue`, Task 6) — walked in visit order,
skipping a visit whose `track_id` no longer resolves — so saving persists
the venue the card already shows rather than the session's own possibly-
empty field.

**Save path — `save_session_metadata` (IPC need 1,
`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`), no command behind it in wave 2.**
The command does not exist on `main` yet; `Data/ipcStubs.ts`'s
`saveSessionMetadata` stands in for it and always rejects with a local
`NotImplementedError`, never a fabricated `IpcError` kind (C3 §2's kind
vocabulary is additive-only). The form surfaces this honestly — "Saving
session metadata isn't wired up yet — your changes aren't saved" — rather
than pretending the save succeeded; typed changes stay live in the form
after a failed save so nothing already typed is lost, but nothing reaches
disk until the real command lands. **Once it does, the write is a
whole-block replace of all nine fields, never a sparse patch** — every
field is required on `SessionMetadataPatch` specifically so a concurrent
editor cannot half-apply a save.

Below `MetadataForm`:
- **Tracks visited row** — inline list of `TrackVisit` names with tap-to-open.
- **File info** — collapsible section showing session UUID, file path, file size, and per-file Drive sync status (see §28). Field values are selectable text (highlight/copy). The file-path row carries two quick actions: a copy-path button (all platforms) and, on desktop only, a reveal-in-file-manager button (`explorer /select` on Windows, `open -R` on macOS, `xdg-open` of the containing folder on Linux).
- **Delete button** — opens a confirmation dialog with three options:
  - **Cancel** — dismisses dialog.
  - **Remove from app** — deletes the session from local storage only; Drive files are untouched.
  - **Delete everywhere** — deletes local files and calls `DriveService.deleteRemote(sessionId)` to remove Drive files. This button is disabled with an explanatory tooltip when the user is not signed in to Drive.

### 24.11 Venue Detail Card (`VenueDetailCard`)

Venues are derived groupings, not first-class entities. The card aggregates all Tracks sharing the same `venueName`:
- **Name field** — editable. Saving calls `TrackNotifier.renameVenue(oldName, newName)`, which batch-renames `venueName` on every matching Track.
- **Tracks list** — all Tracks in this venue; tapping a Track opens its `TrackDetailPanel`.
- **Stats** — total sessions, total laps, best lap across all tracks in the venue.
- **Kebab menu → "Delete venue…"** — clears `venueName` on every Track in the venue (sets to empty string); does not delete the Tracks themselves.

### 24.12 Track Detail Card (`TrackDetailPanel`)

- **Name field** — editable `TextField`.
- **Venue field** — `Autocomplete<String>` sourced from `distinct Track.venueName ∪ distinct SessionMetadata.venueName`. Submitting a new value creates the venue lazily; submitting an existing value merges this Track into that venue group (see §16.8).
- **Delete** — deletes the Track (calls `TrackNotifier.deleteTrack`).
- **Edit gates on map…** — button that opens the Track Editor modal (map + sidebar) for placing/editing lap gates, sectors, and neutral zones.

Additional read-only fields: polyline preview, gate count, sector count, fastest lap with link to parent session, last ridden, sessions count, laps count. "Open in Analyze" button switches to the Analyze tab with all sessions on this track selected (session-mode).

The Track Editor modal has a **create mode**, entered from a session — the
detail-card "Create track from this session" button (§24.10) or the Tracks
toolbar "Create from session…" (§24.14). In create mode the sidebar gains a
**TRACK** section with Name + Venue (autocomplete) fields, Save is disabled
until Name is non-empty, and Save **creates** the Track (`createTrack`) and
rescans the source session's visits, rather than updating an existing Track.
Cancel discards without persisting anything.

The editor is **responsive**: wide (≥ 720 dp) is map + pinned right sidebar;
narrow is the map over a scrollable controls panel (~45% / ~55%), and while a
gate is being placed the map takes the whole area so the two taps are precise,
restoring the controls once placement commits or is cancelled. So track
creation and gate editing work on mobile, not only desktop.

### 24.13 Sort Options

Sort is a **field + direction**: a field chooser plus an ascending/descending
toggle (`DataSortField` + `DataFilters.sortAscending`), so any column can be
sorted either way.
- Sessions fields: Date (default), Best lap, Duration, Lap count.
- Tracks fields: Last ridden (default), Name, Lap count, Best lap.

Each field has a default direction (Best-lap and Name ascending; the rest
descending); selecting a field resets to its default and the toggle flips it. In
the Sessions tree the day-group order follows the active sort (the day holding
the top-ranked session leads).

### 24.14 Toolbar Actions

- **Search** — toggles the search bar.
- **Sessions / Tracks toggle** — `SegmentedButton<DataView>`.
- **Sort** — a compact field chooser + ascending/descending toggle for the active view's fields (§24.13).
- **Import** (idl1, wave 2 — `Data/ImportPanel.tsx`, `Data/importQueue.ts`,
  `Data/FilePicker.ts`) — rewritten over C3 §3.3's `import_file`/
  `list_importers`; idl0's Dart runs-provider import flow (`RunsNotifier`
  registering `.idl0`/`.gpx` files picked by the OS's native file picker) is
  gone. The picker itself is a pasted absolute path in wave 2, not a native
  dialog — no file-picker mechanism exists yet anywhere in this codebase, and
  adding one (`@tauri-apps/plugin-dialog`) needs a new dependency and an
  `app/src-tauri` capability entry outside this lane's scope; see
  `runs/2026-09-05/lanes/l7a-data/brief-task5.md` (lead ruling R55) for the
  seam this sits behind (`FilePicker.ts`'s `pickImportFile`), swapped for a
  real dialog by a later shell task with no call-site change. Enqueued files
  run through the queue **serialised, one at a time** (R13: this machine is
  memory-bound, import is CPU/I/O-heavy) — never more than one `import_file`
  call in flight. Progress streams via a `Channel<Progress>` carrying a
  `phase` string and an optional `total` (C3 §1); the overall queue bar is
  `null`, not a fake number, while the running file's `total` is unknown. A
  forced-importer override is available via `listImporters()`; `null` means
  extension-based auto-detection. On the queue draining (every item `"done"`
  or `"failed"`), the tab re-runs `list_sessions` once so newly imported
  sessions appear without a manual refresh. A per-file failure marks that
  item `"failed"` and never cancels the others still queued or running.
- **Create from session…** — builds the session's GPS polyline and opens the Track Editor modal in **create mode** (§24.12): Name/Venue are entered in the editor with the map visible, and the Track is created on Save.
- **Rescan visits** — calls `RunsNotifier.rescanAllTrackVisits` over all sessions; re-runs TrackVisit detection without re-downloading source files, showing a per-row spinner and surfacing the first error on failure.

### 24.15 Selection & Analyze Launcher

Floating bar at the bottom of the body when `selection.isEmpty == false`: `[ ANALYZE N selected » ]`. Tapping switches to the Analyze tab via `shellIndexProvider`. This selection (via `selectionProvider`) is independent of the detail-pane selection (via `detailSelectionProvider`).

### 24.16 Empty States

- No sessions imported: "No sessions yet. Import your first .idl0 or .gpx file."
- Sessions exist but filters exclude all: "No matches. Try clearing filters." with a Clear All button.
- Tracks view, no tracks: "No tracks yet. Import .gpx tracks…"

### 24.17 Device Sync (WiFi download)

Device file download is launched from the **Device card's Files entry** (§23),
not the Data tab — the Data tab is library-only (§22.2). The Files entry shows a
"N new" badge (device files not yet in the library) and, on tap, **auto-enters
WiFi mode** (`ModeController.switchTo(Mode.wifi)`) and opens the full-screen
**Sync screen** (`SyncScreen`), dropping back to idle on return. The screen is
driven by `SyncController` (`syncControllerProvider`); its classification and
download behaviour below are unchanged regardless of where it is launched from.

**Classification.** `SyncController.list()` calls `GET /files` (§6.1) and, for each entry, compares the reported `session_id` against the in-memory `sessionProvider` session IDs:
- in the library → **IN LIBRARY**,
- not in the library → **NEW**,
- `session_id` empty (older firmware) → **NEW?** identity-unknown (shown as downloadable).

Entries are sorted newest-first (filename descending, per the `YYYY-MM-DD_HH-MM-SS.idl0` convention in §10) and rendered as a tightly-packed list.

**Two behaviours, switched by one setting.** The screen serves two distinct cases cleanly:
- **Pick a few (default).** The list is a file picker: every NEW row is a checkbox **unchecked by default**, so connecting to an unfamiliar device never pulls everything at once. The user checks the files they want and taps **Download (N)** (disabled until something is selected). This runs `SyncController.sync()`, which downloads only the checked files.
- **Connect and forget.** When the `autoSyncOnOpen` setting (§27, default **OFF**) is enabled, opening the screen runs `SyncController.syncAllNew()` — it selects every NEW file and downloads them automatically, no interaction needed.

**Download queue.** In both cases files download **strictly one at a time** — the device serves a single HTTP request at a time, so the queue is sequential by design, not as a limitation. Each file streams via `WifiService.downloadFile`; the progress fraction is derived from the known file size from `/files` (the firmware streams chunked with no `Content-Length`), shown per-file as `MB / MB · %` with a bar, plus an overall "N of M done · K queued" banner. On completion each file is registered via `RunsNotifier.registerDownloadedByName` (parse → index → track-visit detection → Drive upload queue) and flips to IN LIBRARY. A per-file failure marks that entry as errored and the queue continues; a Stop control cancels the active download and halts the queue.

**WiFi-mode gate.** The file APIs require WiFi mode. When the device is not in `Mode.wifi`, the screen shows a "Switch to WiFi mode" prompt; bringing the AP up and binding to it is the `ModeController`'s responsibility (gated by the WiFi/logging mutex), not the screen's.

**Wave 2 (`Device/files.ts`, `Device/DeviceFiles.tsx`, plan Task 9).** The
full-screen `SyncScreen` above is not built; the Device tab has a plain
**List files** button and an inline list instead. Listing calls
`listDeviceFiles(deviceId)` (C3 §3.8, real and landed) only on that click
— never on connect or on a timer — and `rust/tauri/src/commands/device.rs`
drives the device's own `ControlCommand::WifiOn` transition internally, so
this list has no separate "switch to WiFi mode" prompt to show.
**Classification** matches idl0's rule exactly: `toFileViews` marks a file
`isNew` when its `session_id` is absent from the catalog's known session
ids (`listSessions`, `app/src/ipc/catalog.ts`, C3 §3.2 — fetched on the
last successful connect) **or** when `session_id` is `null` (idl0's
"NEW?" case, folded into plain "new" — wave 2 has no separate
identity-unknown state).

**No checkbox picker, no "connect and forget."** Every row has its own
**Download** button; there is no multi-select and no `autoSyncOnOpen`
equivalent (that setting lives in L7c/Settings and is not wired to this
tab in wave 2 — Open question 3). Downloads still run **strictly one at a
time**: `isDownloadActive(queue)` disables every row's Download button
while any queue entry is `"queued"` or `"downloading"`, over
`downloadFile(deviceId, name, onProgress)` (C3 §3.8). Progress renders as
a byte count and a `formatTransferRate`-derived KB/s figure — never a
percentage when `Progress.total` is `null` (the firmware's chunked
transfer reports no `Content-Length`, same constraint idl0 had). A
per-file failure (`downloadReducer`'s `FAILED`) leaves every other queued
entry untouched, matching idl0's "queue continues" behaviour; there is no
Stop control for wave 2.

**No import handoff (R53 Device Q3).** A finished download lands a blob
under `<data>/blobs/sha256/` (`DownloadResult`) — idl0's
`registerDownloadedByName` (parse → index → track-visit detection) has no
wave-2 equivalent here. The completed row's text says the file is
downloaded and to import it from the Data tab; the two tabs do not call
each other. A shared "blobs awaiting import" slice is a wave-3 shell task.

---

## 25. Tab — Maths

idl1 has no separate Maths tab. Math channels are `math` cells inside the
notebook, authored and evaluated alongside prose, `table` and `js` cells in
one flat document — see §26.

---

## 26. Tab — Notebook

> **Status note (2026-09-05):** this section is L6's first draft, written
> against `docs/superpowers/plans/2026-09-05-idl1-wave2-l6-notebook.md` and
> ruling R52 (`runs/2026-09-03/decisions.md`) plus its follow-on rulings
> R53 Data Q3, R62, R65, R66, R67, R69, R70, R72, R74. L10's cross-lane
> consistency pass over the app-side SPEC parts runs after L7 also lands —
> treat any file path or module name below as illustrative until then.

A notebook is one `.idl1wb` file (C2), a flat sequence of cells in document
order — idl0's worksheet/workbook-bar hierarchy is not carried forward (§26
below's parity-gap table). The workbook is a file; the notebook tab is a
live viewer of it (CLAUDE.md §3): editing a cell writes through to the
document's markdown, and an external edit (another process, or a sync)
reloads the same document by the file-watcher path (§26.5).

### 26.1 Cell kinds and rendering

Four kinds (C2 §2.1–§2.4): **prose**, `math`, `table`, `js`. Each is
recognised by a narrow, non-authoritative TypeScript fence scan
(`Notebook/model/cells.ts`, R52 Q3) that maps a cell's C2 fence-string id to
a byte range in the document for editor addressing only — Rust
(`idl_rs::workbook`) remains the sole evaluator; the scan never parses an
expression, a table body, or JS.

- **Prose** renders in the host DOM, from Rust's `CellOutput.prose_before_html`/
  `prose_after_html` (C3 §3.4, ledger R70/R78), through
  `Notebook/components/ProseBlock.tsx` — the one place this app calls
  `dangerouslySetInnerHTML`, on core's own escaped HTML output only (never
  sandbox output; §26.4's sandbox-output rule is unaffected). `${…}`
  placeholders (`<span data-span-id="…">`) inside that HTML are filled in
  place, by `textContent` only, from the sandbox's own evaluation of that
  one expression (`evalInline`/`inlineResult`, §26.4). Before a cell's
  first `eval_workbook` result exists, its prose shows the document's raw
  text verbatim, `${…}` sources intact (`Notebook/model/proseBlocks.ts`'s
  `proseBlocksFor`, the stated pre-first-eval fallback). Prose has no fence
  id and is never independently selectable in the editor (§26.2).
- **`math`** cells hold one or more named definitions over C2 §3's 69-function
  catalog; each definition's evaluated scalar/channel result and any
  per-definition error render inline under the cell
  (`Notebook/components/MathCell.tsx`) — this is idl0's `ExpressionPreview`
  pane, reduced to living on the cell itself rather than a separate panel
  (§26.6).
- **`table`** cells render the engine's per-cell `CellResult { value, error }`
  grid (`Notebook/components/TableCell.tsx`); the hybrid-grid cell-reference
  grammar and its evaluation are unchanged from idl0's design (§26.11 in the
  legacy Analyze section) and are entirely Rust-side.
- **`js`** cells run inside the sandbox (§26.4) and render one of three ways.
  A cell whose code round-trips through `plotForm.parse` (§26.2) and
  references at least one real session channel has its `marks[*].channel`
  (and lap scope) bound into `NotebookSession`
  (`Notebook/host/NotebookSession.ts`, R66/R72) and mounts through
  `Notebook/components/ChartCell.tsx` — the host-side gesture frame
  (pan/zoom/hover, §26.3) around the sandbox's own rendered Plot output,
  for the one session channel it mounts. A `marks[*].channel` may instead
  (or additionally) name a workbook `math` definition with a recorded time
  axis (`eval_workbook`'s `CellOutput.defs[].name`, R77.3, L6 Task 18): its
  samples are fetched whole and decimated to the chart's point budget via
  `fetch_host_channel` (§26.4) rather than tile-by-tile, and reach the
  sandbox as a host variable exactly like a session channel; because
  `fetch_host_channel` takes no time window, panning or zooming such a
  cell re-decimates the whole definition on settle rather than resolving a
  sub-range. A cell whose marks are *all* definitions has no session
  channel to gesture over and mounts as a plain frame with no gesture
  handling instead (`Notebook/components/JsCellFrame.tsx`, Q2(a) R78) — the
  sandbox's own rendered Plot output still updates on a definition
  re-fetch, only pan/zoom/hover are absent. A cell whose code does not
  round-trip (custom code), or that names a channel or definition the
  active session/workbook does not have, or a definition with no recorded
  time axis (Q3(a) R78 — treated like an unresolvable name, since there is
  nothing to chart against, C1 "time is recorded, not assumed"), also
  mounts as that same plain frame (`Notebook/components/JsCellFrame.tsx`)
  — reserving its last-reported `cellRendered.heightPx` and otherwise
  inert. A form-generated cell with no session selected at all
  (`AppState.selection.sessionId === null`) mounts the same plain frame with
  a note reading "No session is selected — choose one in the Data tab."
  (`Notebook/model/jsCellNote.ts`, L6 Task 21) — it is not otherwise
  distinguished from "code does not round-trip"/"names an unknown
  channel/definition" above except that a more specific cause, when one
  also applies, wins.

`Notebook/components/CellList.tsx` iterates the document's cells in order
and wraps each kind's own rendered output — never the prose spans on either
side of it — through an optional `frame` hook (`frame?: (cell, output) =>
ReactNode`, ruling R74) so every cell kind, not only `js`, can be made
selectable for the editor. `Notebook/index.tsx` supplies
`Notebook/components/CellFrame.tsx` as that hook, uniformly, for every cell
whose scan found an id.

### 26.2 Editing surfaces — Properties and Code (design D13)

Every chart cell's source of truth is its code (design §6). Two editing
panes, assembled by `Notebook/components/EditorPanes.tsx` over one open
cell at a time:

- **Code** — CodeMirror 6, Markdown mode for prose, JS mode for `js` cells,
  a hand-built math mode for `math`/`table`. Mounted for every kind.
- **Properties** — a form (channels, lap/session scope, mark type, axes and
  domains, colours, y-scale, units) mounted **only for `js` cells**. It
  **generates** idiomatic Plot code (`Notebook/plotForm/generate.ts`,
  `generate(props) → code`) and **parses back** the subset it generates plus
  literal edits (`Notebook/plotForm/parse.ts`, `parse(code) → props | null`)
  — a hand-rolled recursive-descent reader over a hand-rolled tokenizer,
  never `eval`/`new Function`, never a whole-source regex, and never
  throwing: a syntax error mid-edit simply parses to `null`.
  `plotForm.generate`/`.parse` round-trip byte-identically over C2 §5.3's
  worked examples and, exhaustively, over the whole closed grammar
  (Task 3's generator-based test, §26.7's done-criterion 2).

Both panes write through the same `replaceCellBody` call
(`Notebook/model/cells.ts`) into the document's markdown, so an edit in
either pane is visible in the other: Properties → `generate` → body; Code →
debounced → `parse` → Properties repopulates from the parsed props, or
greys.

**The custom-code rule.** When a `js` cell's code does not `plotForm.parse`
(returns `null`), the Properties pane greys to a *custom code* state with a
*Reset to form* action that regenerates code from the last known props and
warns that the custom code will be discarded if accepted. This is design
§6's stated rule, verbatim, as Task 12 implemented it: code outside the
closed grammar is a deliberate escape hatch (computed values, custom D3
marks), not an error state.

**Chart type in the form (FFT)** (added 2026-09-06, rulings R78/R79, L6
Task 20). The Properties pane's first control is the chart type, `Time` or
`FFT`, because the type is a property of the document and not of the pane:
an FFT cell's window size, hop size, window function, detrend, scaling and
averaging are parameters of the picture and so live in the cell's code, in
the closed grammar C2 §5.3 defines (CLAUDE.md §3, "no renderer-only
parameters"; ruling R78, L6 Task 19 Q1). An FFT cell is its own cell and
carries exactly one spectrum mark — a spectrum's x axis is frequency and a
time series' is seconds, and one `Plot.plot` has one x axis (R78 Q2). The
host recognises an FFT cell by parsing it, never by scanning for a call,
so a cell outside the grammar is custom code that renders an empty plot
rather than a silently half-wired chart. The spectrum itself is computed
by `fetch_fft` (C3 §3.6) and reaches the sandbox as a
`{ kind: "spectrum", f, m }` host-variable payload; the only arithmetic
this tab performs on it is bin `k`'s frequency,
`k * sample_rate_hz / (2 * bin_count)`, which C3 §3.6 places frontend-side
explicitly. With `averaging: "none"` the request covers the whole record
in one segment (ruling R76), which the document writes as
`windowSize: "all", hopSize: "all"` rather than a session-specific sample
count.

**The Properties↔Code loop guard.** Because both panes write the same
underlying body, a write from one pane can echo back into the other as an
apparent external change. `Notebook/model/editorEcho.ts`'s `isEditorEcho`
recognises "this is the exact text I last wrote for this cell" and drops
it rather than writing it through a second time; `CodePane`'s own
external-sync check and `replaceCellBody`'s no-op-on-unchanged-text guard
are both independent backstops against the same failure mode.

Non-`js` cells (prose, `math`, `table`) show the Code pane only — there is
no Properties surface for them in wave 2.

### 26.3 Interaction rules and the point budget

Restated from the plan's Performance budget as spec text — every rule below
is grep-checkable in the diff and is a blocking review finding if violated
(no IPC on the interaction path, CLAUDE.md §2):

- **No IPC from a gesture handler.** No `invoke` call is reachable from a
  pointer, wheel, touch or animation-frame handler. IPC runs only from a
  settle callback, an explicit user action, or a mount effect.
- **Hover reads the tile.** The hover readout reads the already-fetched
  tile's per-pixel-column stats (`columnMin`/`columnMax`/`columnMean`/
  `columnTUs`) out of the shared `TileCache`; the cursor readout IPC
  (`cursor_readout`) fires only from the cursor's own settle debounce
  (150 ms, ruling R62 — its own trigger, distinct from the viewport-settle
  callback, which also refreshes it when the picture moves under a still
  pointer), never per move.
- **Zoom during a gesture is a transform.** A pinch/wheel frame updates a
  CSS transform (`host/protocol.ts`'s `transform` message, sent host→sandbox
  via `postMessage`, never IPC) applied to the sandbox's already-rendered
  Plot; a tile fetch at the new tier happens once, on settle.
- **Pan during a gesture is a translation.** Only newly exposed edge tile
  indices are requested, and only on settle; prefetch runs on a
  timer/lookahead, never from a gesture frame.
- **Point budget.** A line mark receives at most 2 points per pixel column
  per series (a pure, tested budget function); density views (spectrogram,
  2-D histogram) are Rust rasters, never a JS point cloud.
- **`eval_workbook` is debounced.** It runs on workbook open, on a
  `watch_workbook` event, and on a debounced editor change — never per
  keystroke, never per frame.
- **Heavy arrays cross as bytes.** Every array reaching the sandbox
  (a decoded channel's `t`/`v`) is two transferable `ArrayBuffer`s in
  `postMessage`'s transfer list, never a JSON array of numbers.
- **Rust = numbers, JS = pictures.** No decimation, filtering, FFT,
  binning, statistics or unit conversion is implemented in TypeScript
  anywhere in this tab. The only arithmetic this tab owns is layout:
  pixel↔time mapping, tier choice, and cache keys.

Every IPC- or `postMessage`-driving `useEffect` in this tab keys its
dependency array on data only (never a function/callback prop), never
cancels in-flight work from its cleanup, and decides "is this result still
current" through a pure, tested driver (a monotonic sequence) rather than
inline in the effect (wave-2 operating brief §4's process rule, added after
repeated review Criticals against this exact failure mode).

### 26.4 The sandbox boundary and the cell API

`js` cells execute inside one origin-isolated `<iframe sandbox=
"allow-scripts">` per open notebook (no `allow-same-origin`, so the
sandbox's realm has no path to `window.__TAURI_INTERNALS__` even if cell
code somehow reached for it — this is the actual security boundary, not a
convention). The Runtime, Inspector, Plot, D3 and Inputs are bundled into
the iframe's own build (no CDN — design §3). Host and iframe talk only
`postMessage`, validated on receipt as untrusted input exactly like a
server treats a request body (`Notebook/host/protocol.ts`'s
`isHostMessage`).

**Cell outputs render inside the sandbox, never the host DOM** (ruling
R69). The sandbox owns a cell-output list keyed by cell id; the host never
receives output HTML and never calls `dangerouslySetInnerHTML`. The
sandbox reports back only `cellRendered { cellId, heightPx }` (so the host
can size its own gesture-capturing frame around each output) and errors as
plain text (`cellError`, or `spanError` for one inline `${…}` prose span —
a distinct message type, ruling R66, not overloaded onto `cellError`'s
`cellId` field). During a gesture the host posts `transform { cellId,
translateXPx, scaleX }` per frame; on settle it sends fresh channel data
the same way it always has.

**The cell API** (design §6): `channel(name, { lap?, session? })`, `laps`,
`session`, `constants`, `Plot`, `d3`, `Inputs`, `html` (C2 §5.1's six host
variables; `html` needs the `htl` package, ruling R52 Q1). `channel()`
returns **an array of `{ t, v }` records**, materialised inside the sandbox
from the two transferred `Float64Array` buffers — not the originally
proposed `{ length, t, v }` structure-of-arrays object (ruling R52 Q2:
Plot's mark resolvers index a channel string per element, which a
`{length, t, v}` object cannot support). C2 §5.3's grammar
(`x: "t", y: "v"` as literal field-name strings) is unchanged; only the
object `channel()` returns changed. The record count is budget-capped
(§26.3's point budget), so this is a few thousand objects, not hundreds of
thousands.

**Rebuilds.** A watchdog pings the sandbox; a stalled cell (a runaway loop)
gets the iframe torn down and rebuilt (`Notebook/host/SandboxHost.ts`).
Every outbound message for the current iframe generation queues until that
generation's own `ready` arrives (a generation-tagged outbound queue,
`Notebook/host/outboundQueue.ts`), and a rebuild replays, in order, `init`
→ every cached JSON host variable → every currently bound channel →
`setCells` — an order fixed by which of `sandbox/main.ts`'s handlers are
no-ops before `init` has run. A tile-backed (session-channel) bound
channel is re-derived from the shared `TileCache`, never re-fetched; a
definition-bound channel (L6 Task 18, R77.3) has no tile-cache entry to
re-derive from, so it is re-fetched via `fetch_host_channel` instead
(Q1(a), R78 — accepted because a rebuild is already the rare,
watchdog-triggered path). State loss on rebuild is the cost, and it is
per-notebook, not per-app: the notebook's cells, their JSON host
variables, and their bound channels survive; only derived, reactive state
(an in-flight gesture's transform, a pending inline-span result) is lost.

**Per-cell bound-channel registry.** `Notebook/host/NotebookSession.ts`
holds every channel a `js` cell currently has bound, as a list per cell id
(ruling R72: a multi-mark cell binds every one of its channels, not only
the first, so a settle refetch or a rebuild restores all of them). A single
monotonic run-sequence counter per cell
(`Notebook/model/cellRunSequencer.ts`) is shared between a cell's initial
bind and every later settle-triggered refetch, so whichever run started
most recently always wins when two overlap — resolve order, not start
order, would otherwise let a slow initial fetch overwrite a faster
settle's fresher state.

**Inline `${…}` reactivity (known limitation).** Inline prose spans
re-evaluate on every cell-set/markdown change, not on the Observable
Runtime's own reactive re-run graph — acceptable for wave 2, and named here
per the plan's own Task 16 note; true reactivity is a later-wave item.

**Prose HTML is core output, not sandbox output (ruling R78).** Ruling R70
gives prose HTML two additive fields on `CellOutput`
(`prose_before_html`/`prose_after_html`, Rust's `pulldown-cmark` render
with author HTML escaped) plus a `prose_spans: { id, expr }[]` list from
Rust's own `${…}` scanner (`workbook/v3/js_cell.rs::find_inline_exprs`).
The notebook's former interim TypeScript regex scanner
(`Notebook/components/ProseSpan.tsx`'s `extractInlineSpans`) is deleted:
`Notebook/model/proseBlocks.ts` decides which prose blocks exist and which
`prose_spans` entries belong to each from the HTML alone (matching each
id's literal `data-span-id="…"` occurrence, never by parsing the HTML or
inventing an id-naming convention), and `Notebook/components/ProseBlock.tsx`
renders the block. Because this HTML is produced by core and crosses IPC
like any other trusted value — R69's sandbox-output boundary above governs
*sandbox*-produced output, and prose is never that — the host renders it
directly, which is the one place this app calls `dangerouslySetInnerHTML`.
A `${…}` placeholder inside that HTML is still filled only by the sandbox's
own `evalInline` result, spliced in by `textContent`, never by HTML.

### 26.5 Conflicts and save

`save_workbook(id, markdown, based_on_hash)` fails with the `conflict`
kind (C3 §2) when the file changed on disk since this document's hash was
last read. `Notebook/components/ConflictBanner.tsx` offers two coarse
resolutions — **Reload from disk** (discards local edits, with an explicit
confirmation since this is destructive) and **Overwrite** (re-reads disk's
current content, re-applies local edits on top, and saves again with the
freshly read hash). Both are a deliberately coarse stand-in: the real
per-cell merge C4 §4 names as the eventual answer is L11's job, not this
tab's — stated here so a reader is not left thinking wave 2 ships
conflict-free collaborative editing.

### 26.6 What idl0 had that this tab does not carry (parity gaps)

Every idl0 Analyze/Maths feature this wave does not deliver, with the
reason. Silence is not deferral (wave-2 operating brief §2). Source:
`idl0-app/app/lib/ui/tabs/analyze/` and `.../maths/`.

**Delivered in wave 2:** time-series line charts (multi-channel, colours,
manual/auto y domain, log/sqrt y scale, lap scope), the FFT chart (single
whole-record spectrum), spectrogram, 2-D
density heatmap (the scatter chart's density mode), hover readout, cursor
readout, pan/zoom, table cells, math cells with the full 69-function
catalog, per-cell errors, live file reload, save with conflict detection.

| idl0 feature | Status | Reason |
|---|---|---|
| **FFT chart** | Delivered (C2 §5.3, R79/R80; L6 Tasks 19–20) — single spectrum, whole record | `fetch_fft` (C3 §3.6, `IDLF`) computes the spectrum; C2 §5.3's `spectrum(...)` production carries window size, hop, window function, detrend, scaling and averaging in the document, and the Properties pane's FFT parameter panel edits all six. Gaps from idl0's `analyze/fft_chart.dart`: (1) idl0's overlay of up to `kMaxFftSpectra` = 10 spectra, one line per channel × selected lap (`fft_window_resolver.dart`), is **not** carried — one spectrum per cell (R79 Q7), and lap-scoped spectra wait on lap indexing at import (`lap` is `null`, C3 §3.6). (2) idl0's `Overlap %` control is replaced by hop size in samples, C3's own unit (R79 Q3). (3) idl0's session-mode window **tracks the worksheet's live zoom** (or the whole session when unzoomed) and lap-mode windows each selected lap separately; `fetch_fft` takes no time window at all (C3 §3.6), so a wave-2 FFT cell always covers the whole channel — panning/zooming a time-series cell elsewhere in the notebook has no effect on it, and the only way to see a sub-range spectrum is lap indexing landing (same blocker as (1)). (4) idl0 auto-derives a default segment length from the *windowed* sample count (`ChartSlot.autoFftSegmentLength`) so a short zoom auto-reduces `nperseg`; the Properties pane instead seeds a fixed `2048` and leaves adjusting it (or switching to `Whole record`, forced automatically under `averaging: "none"`) to the author, since there is no window to auto-derive from. An FFT cell has no pan, zoom, hover or cursor readout (matches idl0's own "no cursor rendered — read-only frequency-domain view" for this chart specifically). |
| **1-D histogram chart** | Deferred, blocked on IPC | Same rule: binning is numbers. C3 §3.6 has only the 2-D `histogram2d` raster. Filed as IPC need N6, deferred to a later wave — genuinely new engine code, unlike N5's thin wrapper. |
| **Scatter — point-cloud mode** | Deferred | Density mode is delivered via `fetch_raster`'s `histogram2d`. Point-cloud mode needs a time-aligned paired-sample endpoint C3 does not have (IPC need N7, marked for a later wave). |
| **GPS map chart with basemap tiles** | Deferred, needs a product ruling | "Offline-first means bundled. No CDN, ever" (design §3) forbids a tile server outright. A plain GPS polyline with no basemap is expressible today as a custom `js` cell. Escalated to Isaac as a product call (ruling R52 Q8), non-blocking. |
| **Lap table's Main/Overlay designation** | Partly delivered | The table data itself is a `table` cell and renders. The lap-scoping designation that would drive it has no v3 home: `eval_workbook` has no lap-context argument in the landed command (IPC need N4, ruling R52 Q5 — proposed, not yet implemented as of this writing; see `Notebook/index.tsx`'s own `TODO(idl0)` at the read site). |
| **Lap progression chart, variance trace chart** | Not carried / deferred | `lapProgression` is outside C2 §6's `plotForm` grammar entirely (authorable as a custom `js` cell from `list_laps`). The variance functions exist in the math catalog but read the same missing lap context as the lap table — same N4 blocker. |
| **X-axis modes (`wheelDistance`, `gpsDistance`)** | Not carried | C2 §6 drops `xAxisMode` explicitly; `plotForm`'s `x` is always `"t"`. Widening the grammar is a contract change, not a UI decision. |
| **Worksheets, per-sheet x-axis mode, workbook-bar tabs** | Not carried | A `.idl1wb` is one flat cell sequence, read in document order — v3 has no worksheet concept; there is nothing for a worksheet tab bar to switch between. |
| **Worksheet tab rename/duplicate (double-tap, right-click context menu)** | Not carried | Falls out of the same "no worksheet concept" gap immediately above — there is no worksheet tab to rename or duplicate. |
| **Workbook rename/duplicate** (`workbook_bar.dart`'s double-tap-to-rename, `workbook_dropdown_menu.dart`'s Duplicate) | Not carried, L6 Task 21 | `WorkbookBar` names the open document (the picker's selected option) but has no rename or duplicate action — `create_workbook` mints a new empty document, it does not clone or retitle one. Filed as a gap, not scheduled; a future task needs a `rename_workbook`/`duplicate_workbook` command C3 does not have today. |
| **Browse-all-workbooks modal** (search + sort by recent/name/created, `browse_workbooks_modal.dart`) | Not carried, L6 Task 21 | The picker is a plain `<select>` over every indexed workbook in `list_workbooks`' own order (never sorted or filtered by this lane) — no search box, no sort control, no per-row rename/duplicate/export menu. Idl0's per-row popup menu (rename/duplicate/export) has no idl1 equivalent for the same reason as the row above. |
| **Workbook export/import/"Reload from file", delete** (`workbook_dropdown_menu.dart`'s exportFile/importFile/reloadFromFile/delete) | Not carried, L6 Task 21 | A `.idl1wb` already lives in `workbooks/` as a plain file — there is no separate on-disk vs. in-app copy to export/import/reload the way idl0's SQLite-backed `Workbook` entities needed. Delete has no `delete_workbook` command; removing a file from `workbooks/` and rescanning is today's only path, done outside the app. |
| **Workbook Drive sync settings dialog** (`workbook_sync_settings_dialog.dart`, per-workbook) | Not carried | Same ruling as the table row above this one ("Workbook Drive sync settings") — superseded by LAN sync (L11); no per-workbook sync configuration surface exists or is planned to replace the per-workbook dialog specifically. |
| **`heightFactor`, `showZeroLine`, chart `title`, `scope: session`** | Not carried | No `plotForm` grammar slot exists for any of them; a zero line or a title is one line of custom `js`. |
| **`yScale: sqrtSigned` / `squareSigned`** | Not carried | C2 §6 maps both to plain `linear`; the grammar's `y.type` enum is `linear\|log\|sqrt`. |
| **Maths chip-expression editor, function insert/help panels** | Superseded / reduced | Superseded by D13's two editing surfaces (Properties, Code); CodeMirror completion over the 69-function catalog (a hand-copied TS table, tracked note 2026-09-05) replaces the browsable panel. |
| **Math channel metadata bar (quantity, units, rate, decimal places, colour)** | Not carried | C2 §6 drops all four; the surviving affordance is C2 §3.1's `# label:` display name. Colour moves to the mark's `stroke`. |
| **Unit inference / `MathQuantity.defaultUnit`** | Reduced to a label suggestion | The Properties form suggests an axis label as `"<label> (<unit>)"` from C1's per-channel `unit` string (`get_session`'s `SessionDetail.channels[].unit`, ruling R65) — no TS quantity→unit conversion table; unit conversion is a number and stays the engine's. |
| **Expression live preview** | Reduced | Each math definition's result and per-definition error render inline under the cell (§26.1) rather than in a dedicated preview pane. |
| **Workbook Drive sync settings** | Not carried | Superseded by LAN sync (L11); Google Drive is not on the idl1 line. |
| **Per-axis vertical zoom, chart context menu** | Deferred | Zoom is uniform in wave 2; per-axis vertical zoom is an interaction refinement for a later wave. |
| **Workbook migration Stage 2** (v2 `.idl0wb` → `plotForm.generate`) | Deferred | Ruling R30 dropped workbook migration from wave 1; no migrated file exists to convert yet. |
| **Mobile paper view** | Not carried by this lane | Design §6 assigns it to a mobile lane; this tab builds the components it will render. |

### 26.7 IPC needs this tab is standing on

Filed in full, with proposed contract text and landed-vs-stubbed status, in
`runs/2026-09-05/lanes/l6/IPC-NEEDS.md` and
`runs/2026-09-05/lanes/l6/CONTRACT-AMENDMENTS.md`. In one line each: **N1**
`read_workbook` (still a stub in this tab as of this writing —
`Notebook/ipcStubs/readWorkbook.ts` — the hard blocker that made Tasks 13–14
possible only against a stub); **N3** the host-channel byte path
(`fetch_host_channel`, magic `IDLH`) — landed (L6 Task 18, R77.3): a `js`
cell naming a workbook `math` definition binds and fetches through it via
`ipc/workbook.ts`'s `fetchHostChannel`/`ipc/hostChannel.ts`'s `IDLH`
decoder (§26.1, §26.4); open, named in §26.1, is that the command's lack of
a time window means a definition-bound cell cannot resolve a sub-range on
zoom; **N4** `eval_workbook`'s additive
`lap_context` argument (§26.6); **N5** FFT — delivered end to end (L6 Tasks
19–20): `fetch_fft` (C3 §3.6, ruling R63 (3)) is wrapped and decoded by
`app/src/ipc/rasters.ts` (`fetchFft`/`decodeFft`, `IDLF`), and C2 §5.3's
`spectrum(...)` grammar production plus the Properties pane's FFT parameter
panel let a document author an FFT cell that requests it (§26.6); **N6**
1-D histogram, still unlanded, deferred to a later wave (§26.6); **N8**
`create_workbook`. Design §10's L6 done-criterion
"`plotForm` round-trips its subset" is checked by Task 3's exhaustive test,
part of this lane's gate; the companion criterion, "pan/zoom/hover on a
real session at 60 fps desktop," is observed in the running dev app at the
lead's merge-gate eyeball pass, not inferred from this tab's unit tests
alone (the L5 lesson, ruling R50).

### 26.8 Opening a workbook: empty state, rescan, picker

`list_workbooks` (C3 §3.2) is catalog-backed (`catalog_read::list_workbooks`)
and therefore an index, not truth (CLAUDE.md §3: "the catalog is an index —
deletable, rebuildable, never synced"). `Notebook/index.tsx` treats an empty
result as "possibly stale, not necessarily empty": on page open, exactly one
`rebuild_catalog` runs automatically when and only when `list_workbooks`
first returns `[]`, then the list is re-fetched before falling through to
the empty state (`Notebook/model/workbookEntry.ts`'s `chooseWorkbookEntry`
returning `{ kind: "empty" }`, R81 Q1(a)). This covers a fresh install, a
restored `<data>` directory, a changed data-dir override, or a deleted
`catalog.sqlite` — every case where workbooks exist on disk but the index
does not yet know it — without imposing a rebuild cost on the common,
already-populated case. The empty state itself offers **New workbook** (an
inline name field, never a native `window.prompt`, committing through
`create_workbook`) and **Rescan** (`rebuild_catalog` again, explicit and
user-triggered, mirroring `Data`'s existing "Rebuild catalog" toolbar
button).

`create_workbook` (C3 §3.4) writes the file but does not insert a catalog
row — only `rebuild_catalog` reconciles the catalog (C4 §5) — so a newly
created workbook is invisible to `list_workbooks` until the next rebuild.
Every other workbook command (`open_workbook`, `read_workbook`,
`save_workbook`, `eval_workbook`) resolves by scanning `workbooks/` directly
(`resolve_workbook_path`), not via the catalog. The Notebook therefore opens
a just-created workbook immediately from `create_workbook`'s own returned
`WorkbookHandle` — no rebuild required for that — and runs `rebuild_catalog`
afterwards purely so the picker's next `list_workbooks` call sees it.

Above one indexed workbook, a `<select>` in the editor's save-bar row
(`Notebook/components/WorkbookBar.tsx`) lets the author choose which
document to open (R66 item 3's deferred picker, closed here); at exactly one
workbook there is no picker (R81 Q4(a)). The choice is remembered per
machine, in `localStorage` under `idl1.notebook.ui.v1`
(`Notebook/model/notebookPrefs.ts`) — UI state, never written into the
workbook file or into any shared app state, and never synced. Switching
workbooks is disabled while the open document has unsaved edits
(`dirtyCellIds.size > 0`, R81 Q5(a)), so the picker can never silently
discard local typing; L11's per-cell merge (§26.5) is the eventual
replacement for that restriction, not built here.

A workbook file copied directly into `workbooks/` becomes visible the same
way a newly created one does: after a rescan. This is distinct from C4 §4's
file watcher, which watches `workbooks/` for *content* changes to a document
already open in this page, not for catalog membership — a copied-in file
the Notebook has never opened produces no watcher event at all.

---

## 27. Tab — Settings

Tab 5 of the [AdaptiveScaffold](../app/lib/ui/shell/adaptive_shell.dart) shell. Icon: `Icons.settings`.

**Layout.** Narrow (< 720 dp): a single vertical scroll of the §27.4 sections, each a `MinimalSectionHead` + content (Firmware is a collapsed-by-default `CollapsibleSection`). Wide (≥ 720 dp): a two-pane layout — a left list of the sections + a right detail pane showing the selected section (default Profile), matching the Data tab's wide idiom (§24.2). Every control is reachable in both layouts.

### 27.1 Prefs model (idl1)

**Superseded (2026-09-05, L7c Task 2).** idl0's `AppSettings`
(`app/lib/data/app_settings.dart`, `shared_preferences`-backed, 7 fields) is
replaced by idl1's `Prefs` (`app/src/routes/pages/Settings/prefs.ts`), split
into an engine half and a UI-only half:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `engine.data_dir` | `string \| null` | `null` | C4 §1's `<data>` override. `null` = platform default. Read from `get_settings`; written only by `setDataDir`/`set_data_dir` — `set_settings` ignores this field on its argument (ruling R59 Q5). |
| `engine.rider_name` | `string` | `""` | `""` = not set (C4 §1 — there is no `null` representation for this field). |
| `engine.unit_system` | `"imperial" \| "metric"` | `"imperial"` | An unrecognised value (e.g. from a corrupt document) falls back to `"imperial"`, never throws. |
| `ui.last_section` | `string` | `"profile"` | Which Settings section the tab reopens on. Never reaches the engine. |
| `ui.section_list_width_px` | `number` | `220` | Wide-layout section-list width, in pixels. Never reaches the engine. |

`engine` is field-for-field `idl_rs::store::settings::AppSettings`
(`rust/core/src/store/settings.rs`) and C4 §1's `settings.json` keys, so a
future `set_settings` call can take the `engine` object unchanged, with no
translation layer. `ui` is UI-only and never leaves the machine.

idl0's Drive-sync (`autoSyncOnDownload`, `syncOnWifiOnly`, `autoSyncOnOpen`)
and firmware (`firmwareChannel`, `autoCheckFirmware`) fields have no idl1
counterpart here: Drive sync is dropped permanently (replaced by LAN sync,
§27.4) and firmware/OTA is deferred to wave 3 (not persisted yet).

**Where it lives (L7c Task 8, R77.4/R78) — `engine` in `settings.json`, `ui`
in `localStorage`.** `Settings/settingsBackend.ts` implements `PrefsBackend`
over `get_settings`/`set_settings` (C3 §3.10): `read()` merges the `engine`
half from `get_settings` with the `ui` half from `localStorage` into the one
document shape `parsePrefs` already understands, and `write()` splits it back
— `rider_name`/`unit_system` go to `set_settings`, the whole document
(including `ui` and any preserved unknown keys) is also kept in `localStorage`
so a `get_settings` outage degrades to the last known values rather than to
defaults. `engine.data_dir` is read from `get_settings` but never written
through `set_settings`, which ignores that field on its argument (ruling R59
Q5) — `setDataDir` is that key's sole writer; `settingsBackend.write()` echoes
back whatever `read()` last saw for it rather than inventing `null`. `ui`
stays in `localStorage` unchanged (R78 Q2): it never reaches the engine and
losing it (a cleared WebView) is a non-event.

`Settings/prefsMigration.ts` runs a one-time import, at app start, of
whatever `engine` fields an existing `localStorage` document holds into
`settings.json`, then removes just that half from the `localStorage`
document (`ui` and any unknown keys stay) — guarded by a
`localStorage`-held flag so it runs at most once per machine. `settings.json`
wins on conflict (R78 Q1): only fields still at their engine default on disk
are imported, since a non-default value there was set deliberately (by this
app or another `set_settings` caller) and a stale browser copy must not
silently overwrite it. `data_dir` is never touched by the migration. A failed
`set_settings` call during migration does not set the flag, so the import
retries on the next launch; a failed migration and a failed engine-field
write are both shown as a `role="status"` line in the affected section
(`ProfileSection`/`UnitsSection`, R78 Q3) rather than a console log.

`parsePrefs`/`serializePrefs` are lenient: an unreadable or partial
document yields defaults for the keys it cannot supply, and unknown keys
(from a newer app version) are preserved through a round trip rather than
dropped. Every `localStorage` access is wrapped in try/catch — a WebView
can refuse storage (private mode, cleared site data, a policy) — so a read
failure yields defaults and a write failure is reported as a failed result,
never a crash and never a silently discarded change.

### 27.2 Unit system — defaultUnit()

`String defaultUnit(MathQuantity q, UnitSystem system)` in `app/lib/data/math_quantity.dart`.

Imperial overrides: Speed → mph, Length & Distance → ft, Pressure & Stress / Delta → psi, Temperature / Delta → °F, Force → lbf, Torque → ft·lbf, Spring Constant → lb/in, Mass → lb, Power → hp. All other quantities return their primary unit (index 0) regardless of system.

Called by `ChannelMetadataBar._onQuantityChanged` to set the default unit when the user picks a quantity.

### 27.3 Shell navigation

`shellIndexProvider` (`StateProvider<int>`) in `adaptive_shell.dart` replaces local `_selectedIndex` state. Any widget in the tree can navigate tabs by writing to `ref.read(shellIndexProvider.notifier).state`.

### 27.4 Sections

| # | Title | Content |
|---|-------|---------|
| 1 | Profile | Rider name — debounced 500 ms text field |
| 2 | Units | `SegmentedButton<UnitSystem>` + summary line |
| 3 | Sync (idl1: LAN sync, replaces Drive Sync — see §27.9) | Paired-peer list with online status, pairing-code entry, manual "Sync now" per peer |
| 4 | Firmware | OTA update. Auto-checks the selected channel (stable/beta) against the running version (§7.3 `Firmware:`) and shows an "update available vX → vY" card that downloads from GitHub Releases (§27.7) and runs the OTA push. Channel picker, auto-check toggle, "Check now", plus the manual `.bin` picker as fallback. Progress / reboot states, pending-verify commit/rollback card. See §4.6 / §6.1 / §27.7. Collapsed by default in the narrow layout. |
| 5 | Controls | Read-only reference of the chart keyboard / mouse / wheel shortcuts (mirrors `kDefaultChartBindings` + `wheelModeFor`, §26.7), grouped Mouse wheel / Mouse / Keyboard as leader-dot `SpecRow`s. Editable rebinding is a v2 follow-up. |
| 6 | How-Tos | 4 markdown articles + Full Reference link |
| 7 | About | App version (hardcoded 0.1.0), Open Source Licenses, Report an Issue |

### 27.5 How-to articles

Assets in `assets/howtos/`. Rendered via `flutter_markdown` in a pushed `Scaffold` route.

| File | Title |
|------|-------|
| `first_setup.md` | First Setup |
| `wifi_download.md` | WiFi Download |
| `lap_gate.md` | GPS Lap Gate |
| `math_channels.md` | Math Channels |

### 27.6 Data tab redirect

`_DriveSection` in the Data tab: when not signed in and user taps the Sign In button, navigates to Settings tab (index 4) via `shellIndexProvider` and shows `SnackBar("Sign in to Google Drive in Settings")`.

### 27.7 Firmware auto-update

The app pulls published firmware from a dedicated GitHub repository
(`kFirmwareRepoSlug`, a single app constant) via the public GitHub Releases
REST API — no auth token, no server.

**Version of record.** The git tag is the firmware version: CI sets the build
version from the tag (leading `v` stripped), so the embedded
`esp_app_desc_t.version` — reported over `/ping` `fw` and the §7.3 `Firmware:`
line — equals the release tag. The app parses both ends as semver and offers an
update only when hosted `>` device.

**Channels.** `stable` = the latest non-prerelease release (`/releases/latest`);
`beta` = the newest non-draft release including prereleases. A tag with a
`-beta`/`-rc` suffix is published as a GitHub prerelease.

**Flow.** On connect/open (when auto-check is on) and on demand, the app fetches
the channel's latest release, compares versions, and surfaces an "update
available" card (Settings → Firmware) and a Device-hero banner. Accepting
downloads the `.bin` into memory — optionally verifying a published
`idl0-firmware-v<ver>.bin.sha256` sidecar (`sha256sum` output format,
`<hex>  <filename>`) — then hands the bytes to the existing OTA push (§6.1
`/ota` → reboot → §7.2 `CMD_OTA_CONFIRM`). The device's embedded SHA-256
(`esp_ota_end`) remains the authoritative integrity gate; the app-side check is
a fast-fail.

The verdict is a function of the live device, not a value that stays true once
computed: it clears when the device disconnects, and a connected device whose
reported version changes (e.g. it returns on the pushed build after an OTA
reboot) triggers a fresh check. A stale "update available" banner therefore
never outlives the link or the build that produced it — the Device-hero banner
is additionally gated on an active connection.

**Auto-confirm.** After a catalog-driven update push completes and the device
reboots, the app arms a one-shot auto-confirm expectation carrying the pushed
release's version. The first version-bearing status frame received after the
post-reboot reconnect completes consumes the expectation unconditionally; if —
and only if — the reported `Firmware:` version equals the pushed version and
the frame carries `OTA: PENDING_VERIFY`, the app sends `CMD_OTA_CONFIRM`
automatically, committing the new image before any subsequent reboot can
trigger the bootloader's rollback of the unconfirmed slot. A device that comes
back reporting any other version (e.g. the bootloader already rolled back)
disarms the expectation without confirming. The manual pending-verify card
remains the fallback for manual `.bin` pushes (no known target version —
auto-confirm is never armed; starting one disarms any pending expectation) and
for interrupted flows (version mismatch, a failed confirm send, or a frame
with no pending flag).

**Failure modes.** Offline or absent device version → no banner, manual push
still available. An update is offered only when hosted is strictly newer; a
channel switch that leaves the device ahead of the channel shows an
informational note, not a downgrade prompt.

### 27.8 Data directory override (idl1, no idl0 counterpart)

**New section (2026-09-05, L7c Task 4).** idl0 has no equivalent screen —
this is C4 §1's "Override in Settings", built here against the
`get_data_dir`/`set_data_dir` stubs (IPC need 7a/7b,
`runs/2026-09-05/lanes/l7/IPC-NEEDS.md`) until the write-amendment Rust lane
lands the real commands.

**What the section shows.** The `<data>` root actually in use for this
process (`DataDirInfo.resolved_path`), an override text field seeded from
`DataDirInfo.override_path` (empty when the platform default is in use),
and, once a candidate path passes `dataDir.ts`'s `validateDataDir` (non-empty,
"absolute-looking" — a drive letter or a leading `/`/`\`, no trailing
whitespace), an explicit confirmation step before `set_data_dir` is called.
Changing where a user's whole data store lives is not a field that saves on
blur.

**What the confirmation states (C4 §1).** `dataDir.ts`'s
`describeOverrideChange` names both the previous location (or "the platform
default location" if there was no override) and the new one, and states
plainly that existing files are **not moved** — the app opens or creates a
tree at the new path and the old tree is left exactly where it was.

**Takes effect on restart, not immediately (R53 Q4).** `<data>` is resolved
once at startup and cached for the process lifetime (C4 §1), so a change
saved here has no visible effect until the app restarts;
`DataDirInfo.restart_required` reports when a saved override has not yet
taken effect, and the section's copy states the restart requirement rather
than implying the change is live.

**Known trap, not this lane's work.** A `settings.json` written with a
UTF-8 BOM parses as absent and silently falls back to the platform default,
which can make a data-directory override set from this section appear to do
nothing (`runs/2026-09-03/decisions.md`, 2026-09-05 ledger entry;
`runs/2026-09-05/lanes/l7/IPC-NEEDS.md` need 7). The fix
(`rust/tauri/src/paths.rs`) rides with the Rust write-amendment lane, not
this one.

### 27.9 Sync (idl1, replaces Drive Sync — §27.4 row 3)

**Superseded (2026-09-05, L7c Task 5).** idl0's Drive-sync section (Sign
in/out, auto-sync toggle, WiFi-only toggle, auto-sync-on-open toggle — see
§28, itself superseded) is replaced by idl1's LAN sync, built here against
the real, landed `sync_status`/`sync_now`/`pair_peer` commands
(`app/src/ipc/sync.ts`, C3 §3.9) — not stubs. Google Drive is dropped
permanently; idl1 syncs peer-to-peer over the LAN (design §7).

**What the section shows.** A list of paired peers (`sync_status`'s
`paired_peers`) with each peer's online flag; a pairing-code field that
normalizes the input (`pairCode.ts`'s `normalizePairCode` strips spaces and
`-`/`_` separators) and validates it locally (`validatePairCode`: exactly
six digits) before calling `pair_peer` — C3 §3.9 backs a malformed code with
`invalid_argument`, but local validation means a typo never becomes a round
trip; and a manual "Sync now" button per peer that calls `sync_now`,
streaming `Progress` messages (a mixed blobs+cells count disambiguated by
`phase` — "manifest", "blobs", "workbooks") into a running-transfer line.

**Polling.** The section polls `sync_status` on a 5-second timer while
mounted (C3 §4: a periodic poll, never per-frame; no contract fixes the
interval) and stops when the section is not the selected one, since the
poll lives in the mounted component's own effect.

**Result summary.** `syncState.ts`'s `describeSyncResult` turns a
`SyncResult` into one line, e.g. "12 blobs, 3 workbooks merged cleanly."
when `conflicts` is zero, or "12 blobs, 3 workbooks merged, 2 conflict
cells to resolve." otherwise — a non-zero conflict count reads as something
to go resolve in the merged workbook (design §7's per-cell merge produces
conflict cells as a normal outcome), never as a sync failure.

**L11 has not landed.** The Rust LAN-sync implementation (L11) has not
merged, so all three commands reject today; the section renders that
through `errors.ts`'s `describeIpcError` (kind `sync` and others) when the
rejection is a typed `IpcError`, or a "LAN sync isn't running on this build
yet" message otherwise, rather than a raw error. The automatic
"sync when a paired peer appears" trigger (design §7) is L11's job to wire
once the backend exists; this section provides the manual button and status
display only.

### 27.10 Chart controls reference (idl1)

**Superseded (2026-09-05, L7c Task 6).** idl0's Controls section (§27.4 row
5) carried `kDefaultChartBindings`/`wheelModeFor` verbatim. idl1's
equivalent (`app/src/routes/pages/Settings/controls.ts`,
`ControlsSection.tsx`) carries the same three groups (mouse wheel, mouse,
keyboard) and the same rows, since idl0's content is all this lane has to
go on.

**Provisional (R53 Q2).** L6 (the Notebook lane) owns the chart's actual
interaction bindings and is being built concurrently with this lane, so
this table may not match the shipped chart. Per R53 Q2(a), the table is
carried now and the section renders a visible "provisional — bindings land
with the Notebook lane" label in the UI itself, not only in a code comment.
R53 Q2(b) — L6 exporting its real binding table for Settings to import —
is a follow-up the lead does after L6 merges; this lane does not attempt
that cross-lane import.

### 27.11 How-to articles (idl1)

**Superseded (2026-09-05, L7c Task 6).** idl0's four Markdown articles
(§27.5, rendered via `flutter_markdown`) are carried as bundled TSX
components (`app/src/routes/pages/Settings/howtos/*.tsx`) — no CDN, ever
(CLAUDE.md §3), and four short documents do not justify adding a markdown
renderer dependency to the bundle.

| Component | Title | Rewritten for idl1 |
|---|---|---|
| `FirstSetup.tsx` | First Setup | idl0's Device/Runs tabs become idl1's Device tab (pairing, config push, calibration, recording) and Data tab (download, session library) |
| `WifiDownload.tsx` | WiFi Download | idl0's "Runs" tab becomes idl1's Data tab |
| `GpsLapGate.tsx` | GPS Lap Gate | idl0's Runs/Analyze tabs become idl1's Data tab (session selection) and Notebook tab (chart viewing, lap-gate editing) |
| `MathChannels.tsx` | Math Channels | idl0's separate "Maths" tab is gone — math channels are now `math` cells written directly in the notebook document (C2 §2), not a dedicated editor screen |

idl0's "Full reference" and "Report issue" buttons, both pointing at
`example.com` placeholders (idl0's own `TODO(idl0)` comments), are not
carried across.

### 27.12 About (idl1)

**Superseded (2026-09-05, L7c Task 6).** idl0's `_AboutSection` (§27.4 row
7) is carried as `app/src/routes/pages/Settings/about.ts`'s `aboutRows` +
`AboutSection.tsx`.

| Row | idl0 | idl1 |
|---|---|---|
| App version | hardcoded `0.1.0` | hardcoded `0.1.0` (mirrors `app/package.json`; no build-time version injection is wired into the Vite build yet) |
| Engine version | n/a (idl0 has no engine crate) | real value, read from `AppState.engineVersion` — the same `engine_version` (C3 §3.1) call the app shell already makes once on mount, not a second IPC round trip. Reads `"…"` while that fetch is in flight, never `"unknown"` (`"unknown"` would imply the call failed) |
| Schema | hardcoded `"IDL0 v1"` | hardcoded `"session schema v1"`, mirroring C1's `session.json` `schema_version` field |
| Build | hardcoded `"dev"` | hardcoded `"dev"`, same treatment |

**Licenses.** idl0 generated a license page from Flutter's package graph
(`showLicensePage`). idl1 has no equivalent generator wired into its build
— assembling one from the npm/cargo dependency graph is a build-tooling
task, not a Settings task — so the control is omitted in wave 2 rather than
shown disabled or linking out. idl0's "Report issue" button, pointing at an
`example.com` placeholder, is not carried across either.

### 27.13 Section inventory (idl1)

**Superseded (2026-09-05, L7c Task 6).** idl0's seven-section table (§27.4)
becomes idl1's seven sections, replacing §27.4 for the idl1 line:

| # | Section | idl1 disposition |
|---|---|---|
| 1 | Profile | Carried (§27.1) |
| 2 | Units | Carried (§27.1, §27.2) |
| 3 | Data directory | New, no idl0 counterpart (§27.8) |
| 4 | Sync | Replaces Drive sync, permanently — LAN sync, not deferred (§27.9) |
| 5 | Chart controls | Carried, marked provisional (§27.10) |
| 6 | How-tos | Carried as bundled TSX (§27.11) |
| 7 | About | Carried, with a real engine-version value (§27.12) |

**Firmware/OTA (idl0 §27.4 row 4, §27.7) is deferred to wave 3**, per the
wave 2 operating brief §3: `push_ota` exists on the transport trait but no
C3 command exposes it, and the two `AppSettings` fields that would
configure it are not carried into idl1's prefs model (§27.1) — a
preference for a feature that does not exist is a field nobody can act on.
**Google Drive (idl0 §27.4 row 3, §28) is gone, permanently** — replaced by
LAN sync (row 4 above), not deferred; §28 carries its own superseded banner.

---

# PART 7 — CROSS-CUTTING

## 28. Google Drive Sync

**Superseded (2026-09-05, L7c Task 5).** This section describes idl0's
Google Drive sync, which idl1 does not have — the idl1 line syncs
peer-to-peer over the LAN instead (design §7; app-side section: §27.9). Kept
below for idl0 reference only.

**Goal:** Automatic, invisible — experience like Google Docs. Session appears on all devices without user action.

**Behavior:**
- One-time setup: sign in + configure Drive folder (Settings → Google Account)
- Auto-upload source file (`.idl0` for device-recorded, `.gpx` for imported) + `.idl0w` workspace after every WiFi download or import
- Workspace changes sync within seconds of save
- Offline: queues sync, uploads when connectivity returns
- Auth: `google_sign_in`, scope `drive.file` (least privilege)

**Drive folder structure:**
```
IDL0/
├── sessions/
│   └── YYYY-MM-DD_venue_rider/
│       ├── uuid.idl0     (or uuid.gpx for imported runs)
│       └── uuid.idl0w
├── tracks/
│   └── <trackId>.idl0t   (one Track per file, see §16)
├── workbooks/
│   └── <workbookId>.idl1wb  (one Workbook per file, see §17a)
└── exports/
    ├── uuid.csv
    └── uuid.fit
```

Workbook sync: see §17a.4 (LAN sync, per-cell merge — not last-write-wins).

**Per-session sync status in Data tab:** source file (`.idl0` or `.gpx`) / `.idl0w` / `.csv` / `.fit` — states: not uploaded / queued / uploading / synced / error. The indicator always renders all four file types regardless of whether the file exists on disk; `.csv` and `.fit` show `notUploaded` until export generates them. File-type keys in the sync status map are lowercase strings without dots. For GPX-sourced sessions, the `idl0` slot is replaced by a `gpx` key.

**`DriveService` surface:**
- `uploadSession(sessionId)` — uploads source file + `.idl0w` for the given session; queues if offline.
- `uploadWorkspace(sessionId)` — uploads only the `.idl0w`; called on every workspace save.
- `uploadTrack(trackId)` — uploads the `.idl0t` file; called by `TrackNotifier` after create/update.
- `deleteRemote(sessionId)` — removes all Drive files for the given session (`uuid.idl0`/`.gpx` + `uuid.idl0w`). Called by `RunsNotifier.deleteSession` when the user selects "Delete everywhere". Errors propagate to the caller so that the local delete is aborted if the remote delete fails; the user sees an error and the session remains intact locally.

**Future (v2):** Download sessions from Drive — coach reviews rider data from home without physical device access.

---

## 29. Data Export

### 29.1 CSV
- Column per channel, row per sample
- Timestamp: relative (s from start) + absolute UTC (if GPS anchor available)

### 29.2 FIT (Garmin)

FIT activity export for Strava / Garmin Connect upload, produced by the `idl-rs`
engine (`export::write_fit`) and exposed on the CLI as `idl-rs fit` (§29.5). The
encoder is hand-rolled in the pure core (the Rust ecosystem has FIT readers but
no mature writer); it streams to any `io::Write`.

**Messages emitted** (FIT-valid order): `file_id` (type=activity,
manufacturer=development), `device_info` (fixed branding: manufacturer=development,
`product_name="IDL0"`), one `record` per GPS fix, `lap` message(s), `session`,
and `activity`.

**Field mapping** (all from existing channels): timestamp from `GPS_EpochMs`
(unix→FIT epoch, offset 631 065 600 s); `position_lat`/`position_long` from
`GPS_Latitude`/`GPS_Longitude` as semicircles (`deg × 2³¹/180`); `altitude` from
`GPS_Altitude`; `speed` from `GPS_SpeedKmh`; `distance` as cumulative haversine;
`heart_rate` from `HR_BPM`. Altitude / speed / heart-rate fields are included in
the `record` definition only when their source channel is present.

**Heart rate** is carry-forward merged onto the GPS record stream: `HR_BPM` is
event-driven (session-relative time → wall clock via the GPS-anchored session
start), and each record takes the most recent beat at-or-before its timestamp.
`session.avg_heart_rate`/`max_heart_rate` are emitted when HR is present.

**Laps:** the encoder takes a slim `FitLap` list (`start_ms`, `end_ms`,
`elapsed_ms` — the effective lap time, neutral zones removed) and emits one `lap`
message per entry, or a single whole-ride lap when the list is empty. The CLI
builds it from `detect_laps` (`--track`, `.idl0t`); the app builds it from the
session's cached track-visit laps (§29.2.1). The slim type keeps the full lap
model off the FFI boundary — the encoder only ever needs the three timing fields.

**Out of scope:** IMU and other non-standard data have no native FIT fields.
They are expressible only via Developer Data Fields (a `developer_data_id` +
`field_description` per custom field), which Strava / Garmin Connect carry but do
not render — so they are not emitted. A position-less session is rejected
(`NoGpsData`): a FIT activity without a GPS track is not meaningful for upload.

### 29.2.1 In-app FIT export

The Data-tab session detail card offers **Export .fit** beside **Create track**,
shown only for GPS sessions (FIT export requires a position track, so the
`NoGpsData` path is unreachable from the UI). The app calls the engine's
`export_fit_to_vec` bridge wrapper — which returns the FIT bytes in memory — then
writes them to a user-chosen path via a file picker. Laps come from the session's
cached `TrackVisit` laps (all visits, chronological) as `FitLap`s; an untracked
session exports a single whole-ride lap. Sport is cycling. The default filename is
`YYYY-MM-DD_<venue>.fit` (the resolved display venue, else the local time).

After a successful save, a desktop-only affordance appears beside the button: a
drag handle that drags the saved `.fit` into a browser upload target (e.g.
Strava), and a reveal-in-file-manager action. Direct Strava upload (OAuth) and
embedding an activity description are out of scope — a `.fit` cannot carry a
Strava description, so uploads are manual.

### 29.3 LD (MoTeC i2pro)
- ⚠️ **Not for distribution.** Opening `.ld` in i2pro requires MoTeC license.
- Not yet implemented; if built, a personal utility excluded from releases
- ⚠️ **Format is byte-exact.** Header field offsets, string padding, channel descriptor layout must match precisely or i2pro silently fails. Validate every output against i2pro before considering done.

### 29.4 Future
HDF5 (`.h5`) — preserves metadata + sample rates, native Python/MATLAB support. Low priority.

### 29.5 CLI export (`idl-rs` engine)

Headless export from the `idl-rs` CLI. The serialization is a capability of the
`idl-rs` **core** (`export` module — pure, streaming to any writer), so the CLI,
the app, and future Python/WASM bindings share one implementation. Input is
`.idl0` only (GPX import is app-side). The `export` command's channel set is the
raw parsed channels plus the synthesized `Time`/`Distance`; derived math channels
are produced by the separate `math` command below.

```
idl-rs export <file.idl0> [-o OUT] [--format csv|json] [--channel NAME]...
```

- **Format resolution:** `--format` wins; otherwise inferred from the `-o`
  extension (`.csv`/`.json`); with no `-o`, output goes to stdout as CSV.
- **`--channel NAME`** (repeatable) restricts output to an allow-list, in the
  given order; default is all channels. An unknown id is an error listing the
  available channels.
- **CSV is long/tidy** — header `channel,time_s,value`, one row per sample.
  `time_s` is `index / sample_rate_hz` for fixed-rate channels and the
  per-sample time for event-driven channels. This differs from §29.1's
  app-side column-per-channel layout: long/tidy handles mixed sample rates in
  one file without resampling or inventing data.
- **JSON is nested and lossless** — a `session` metadata object plus a
  `channels` array; each channel carries `sample_rate_hz`, `synthesized`,
  `is_event_driven`, `samples`, and (event-driven only) `sample_times_secs`.
- Truncated logs still export (recover what is readable) with a stderr warning.

**Headless workbook evaluation.** The `math` command evaluates a portable
workbook's math channels against a session and exports the derived results:

```
idl-rs math <file.idl0> --workbook <wb.idl0wb> [-o OUT] [--format csv|json] [--include-base] [--channel NAME]...
```

- The `.idl0wb` is read for its `math_channels` only (`workbook::apply_workbook`);
  worksheets/layout are display state the engine ignores.
- Default output is the **derived channels only**; `--include-base` prepends the
  base + synthesized channels, and `--channel` filters within the result set.
- Cross-channel dependencies resolve in the engine (§19). Lap-aware functions
  (`variance_*`, `current_lap`, …) require a lap context the CLI does not yet
  build (headless main/overlay-lap selection is a separate follow-up, even
  though lap *detection* now exists — §29.6): such channels are reported
  `skipped` on stderr and omitted from the output, while the rest export normally.
- Per-channel outcomes (`ok` / `skipped` / `error`) print to stderr; the data
  stays on the output sink. Partial success is success; the command fails only
  if the workbook cannot be read or no channel evaluates.

**FIT activity export.** The `fit` command converts a session to a Garmin FIT
file (§29.2):

```
idl-rs fit <file.idl0> [-o OUT] [--sport cycling|motorcycling|running|generic] [--track <t.idl0t>]
```

- `--sport` defaults to `cycling`; `-o` defaults to the input path with a `.fit`
  extension.
- `--track` (optional) reads a `.idl0t` artifact, requires its lap timing, runs
  `detect_laps`, and writes the splits as FIT `lap` messages.
- Errors if the session has no GPS data.

Parquet is not yet supported (deferred until a concrete columnar consumer).

### 29.6 CLI lap & track analysis

Headless lap timing and track matching, taking a portable Track artifact
(§17b) alongside the `.idl0` session. The engine reads the `.idl0t`
(`track_artifact` module) and runs the Phase-4 `detect_laps` / `detect_visits`.

```
idl-rs laps   <file.idl0> --track <t.idl0t> [--format json]
idl-rs visits <file.idl0> --track <a.idl0t> [--track <b.idl0t> …] [--format json]
```

- **`laps`** prints the lap table for the track's timing (lap number, start,
  lap time, raw elapsed; sector splits and neutral-zone subtractions indented
  beneath). Errors if the artifact has no `lap_timing`.
- **`visits`** prints which tracks the session visited and when (track name,
  start, end, duration), in time order. `--track` is repeatable.
- Output is human text by default; `--format json` emits the enveloped success
  form (§29.7). CSV is not offered here — nested lap/sector data maps poorly to
  flat rows; use `export` for tabular channel data.

### 29.7 CLI output envelope

Every `idl-rs` command speaks one versioned JSON **envelope** so a script or
agent has a single shape to parse and one error path to branch on. The wrapper
is a CLI concern (`rust/cli/src/envelope.rs`); the engine and app call the core
directly and never see it.

**Shape.** Success and error share a head — `schema` (contract version,
currently `1`), `ok` (mirrors the exit code), `command`, and `engine` (the CLI's
version string) — then exactly one of `data` or `error`:

```json
{ "schema": 1, "ok": true,  "command": "laps", "engine": "0.1.0",
  "data": { "laps": [ … ] },
  "warnings": [ { "kind": "truncated_log", "message": "log incomplete — 3 records dropped at EOF" } ] }

{ "schema": 1, "ok": false, "command": "laps", "engine": "0.1.0",
  "error": { "kind": "invalid_input", "message": "…", "details": { "track": "whistler.idl0t" } } }
```

- `data` (success only) is **always an object**, never a bare array — collections
  live in a named field (`{"laps":[…]}`) so the shape stays additively extensible.
- `warnings` (optional, omitted when empty) carries non-fatal machine-readable
  caveats as `{kind, message}`. A truncated log surfaces as `truncated_log` here,
  not only as a stderr line.
- `error` (failure only) is `{kind, message, details?}`. `details` is an open
  object — by convention `not_found` carries the `available` list (one-retry
  self-correction), `eval` carries `eval_kind`, `invalid_input` carries the
  offending `track` / `expected_magic`.

**Error `kind`** is a closed set a consumer branches on; finer detail lives in
`details`, never in new kinds:

| `kind` | Meaning |
|---|---|
| `io` | A file could not be read or written. |
| `invalid_input` | A file is present but unusable: bad magic, unsupported schema, malformed config, or a missing required field. |
| `not_found` | A named entity is absent in the loaded data (unknown channel / track / header). |
| `eval` | A math-channel expression failed to evaluate; `details.eval_kind` echoes the engine discriminant. |
| `unsupported` | A deferred / not-yet-implemented capability was requested. |
| `usage` | Invalid arguments past clap (e.g. a format that cannot be inferred). |
| `internal` | An unexpected failure — a bug. |

Consumers MUST tolerate an unknown `kind` (treat as `internal`) and ignore
unknown `data`/`warning` fields. Additive changes (new `data` fields, new
kinds, new commands) keep `schema`; only a breaking change to an existing field
bumps it.

**Structured vs. bulk.** Commands split by output size:

- **Structured** — `info`, `channels`, `laps`, `visits`, `table`: small
  aggregated/metadata results. Default output is **human text**; `--format json`
  emits the success envelope on stdout. Failures emit the error envelope on
  stdout.
- **Bulk** — `export`, `math`, `fit`, `recover`, `scan`: sample streams /
  binaries. Success writes the raw CSV/FIT/`.idl0` artifact to stdout or `-o`
  unchanged; failure writes the error envelope to **stderr** and exits non-zero.
  Bulk commands have no success envelope, so their per-item diagnostics
  (e.g. `math`'s per-channel `ok`/`skipped`/`error` lines) stay stderr-only.

The universal rule: **every command emits a JSON error envelope on failure** —
on stdout for structured commands, on stderr for bulk commands. The raw-output
streams (stdout / `-o`) of a bulk command never carry an error.

**Streams & exit codes.** stdout carries the one machine artifact (envelope or
raw output); stderr is human-only and never required to parse. `-o <path>`
receives the successful payload only — an error always returns on the standard
streams, never into the output file. Exit `0` = success, `1` = enveloped runtime
error (parse `error.kind`), `2` = clap argument/usage error raised before
dispatch (clap's native stderr message, **not** enveloped). "No results" is
success: a command that completes but finds nothing returns `ok: true` with an
empty collection.

**Per-command `data`** (structured commands; field names follow the engine's
serde output):

- `info` → `{ session_id, device_id, timestamp_utc_ms, config_checksum, channel_count, duration_ms }`.
- `channels` → `{ channels: [ { channel_id, sample_rate_hz, length, synthesized } ] }`.
- `laps` → `{ laps: [ Lap ] }`, the engine's `Lap` serde shape.
- `visits` → `{ visits: [ { track_id, name, start_ms, end_ms, duration_ms } ] }`.
- `table` → the self-describing table result (columns + resolved row windows +
  cells); the envelope is its wrapper.

JSON is pretty-printed. The human defaults are unchanged (`text` for the
structured inspect commands, `csv` for `export`/`math`); a machine consumer
passes `--format json` explicitly.

### 29.8 CLI table evaluation

Headless evaluation of a workbook's tables (§26 worksheet blocks) against a
session. The engine
surfaces table blocks from the `.idl0wb` (`Workbook::tables`), resolves each
row's lap window (`table::lap_windows`), evaluates with the shared cell evaluator
(`table::evaluate_table`), and validates structure (`table::validate`). A nested
`table` command group exposes three sub-actions, each taking exactly the
arguments it needs:

```
idl-rs table eval  <session.idl0> --workbook <wb.idl0wb> [--track <t.idl0t>] [--table <block_id>] [--format text|csv|json]
idl-rs table list                  --workbook <wb.idl0wb>                                          [--format text|json]
idl-rs table check [<session.idl0>] --workbook <wb.idl0wb> [--track <t.idl0t>]                     [--format text|json]
```

- **`eval`** evaluates the workbook's tables against one session (the v1 scope —
  see below) and returns the resolved grids. `--table` narrows to one block id
  (else all tables, same `{ tables: [...] }` shape). `--track` is required iff a
  selected table has lap-bound rows; a missing track then is a `usage` error.
  `--format csv` emits a raw grid (header of column names, `#ERR` for a cell
  error), `text` an aligned grid, `json` the enveloped self-describing form.
- **`list`** enumerates the tables a workbook contains — no session, no
  evaluation — for discovery before a run.
- **`check`** validates every table and reports problems; the session is
  optional (with one, an eval pass also reports cell errors). It always exits `0`
  — problems are a *result*, not a command failure.

`table` is a **structured** command (§29.7): JSON enveloped, `text`/`csv` for
humans. Per-action `data`:

- **`eval`** → `{ tables: [ { block_id, worksheet, placement, overlay_target_id,
  columns: [Column], rows: [ { context, window: {t0,t1}|null, cells: [CellResult] } ] } ] }`.
  `columns`/`cells`/`context` are the engine's `Column` / `CellResult` /
  `RowContext` serde shapes; `window` is the row's resolved recording-time span.
  A per-cell `error` is data, not a command failure.
- **`list`** → `{ tables: [ { block_id, worksheet, placement, overlay_target_id,
  columns: [name], row_count } ] }`.
- **`check`** → `{ tables: [ { block_id, worksheet, problems: [ { row, col, kind,
  message } ] } ] }`, where `kind` is `dimension_mismatch` / `parse_error` /
  `unknown_reference` / `cycle` (static) or `eval_error` (session pass).

**Warnings** (`eval`, in the envelope `warnings`): `session_mismatch` (a row's
bound `sessionId` differs from the passed session) and `lap_out_of_range` (a
`lapIndex` past the session's detected laps; that row's window is null).

**Layout metadata** (`placement`, `overlay_target_id`) is surfaced for the
consumer's awareness; the CLI never renders layout.

**Scope:** a table is evaluated against a **single** session. Cross-session tables
(rows binding different sessions) are not yet supported — the cell evaluator is
single-handle.

**Authoring** is not a CLI command: the `.idl0wb` is portable JSON, edited
directly, then validated with `table check`. The table-block schema inside a
workbook is `worksheets[].blocks[]` where a block is
`{ id, placement, content }` and a table block's `content` is
`{ "kind": "table", "table": <TableModel> }`; a `TableModel` is
`{ columns: [ {id, name?, template?} ], rows: [ {id, context?: {sessionId, lapIndex}} ], cells: [[ {formula?, literal?, name?} ]] }`
(camelCase keys, identical to the engine's serde).

### 29.9 CLI frequency analysis (`idl-rs fft` / `idl-rs spectrogram`)

Headless Welch spectrum and spectrogram of a single channel, backed by
`welch_channel` / `welch_channel_windowed` / `spectrogram_channel` in the
engine (§19). Samples never cross the CLI boundary — only the compact result
does. Both commands are **structured** (§29.7): text mode is the default;
`--format json` emits a success envelope on stdout.

#### `idl-rs fft`

```
idl-rs fft <session.idl0> --channel <id>
           [--from <secs>] [--to <secs>]
           [--window hann|hamming|rect]    (default: hann)
           [--nperseg <n>]                (default: 0 = one full-record segment)
           [--noverlap <n>]               (default: 0)
           [--detrend none|mean|linear]   (default: mean)
           [--averaging mean|median]      (default: mean)
           [--scaling magnitude|density]  (default: magnitude)
           [--format text|json]           (default: text)
```

- When `--from` and `--to` are both absent the whole session is used
  (`welch_channel`). If either is present the windowed path runs
  (`welch_channel_windowed`) with the missing bound filled from
  `[0, duration_secs]`.
- `--nperseg 0` (default) selects a single full-record segment — rectangular
  window with no detrend reproduces the raw periodogram bin-for-bin.
- **Text mode** — one `freq_hz\tvalue` line per bin, stdout.
- **JSON mode** — success envelope with:
  ```json
  "data": {
    "channel": "<id>",
    "freqs_hz": [0.0, …],
    "values":   [0.0, …]
  }
  ```
  `freqs_hz` and `values` are the same length (`nperseg_used / 2 + 1`).
  Units of `values` follow `--scaling`: Magnitude = RMS in input units;
  Density = PSD in input-units²/Hz.

#### `idl-rs spectrogram`

```
idl-rs spectrogram <session.idl0> --channel <id>
                   [--from <secs>] [--to <secs>]
                   [--window hann|hamming|rect]    (default: hann)
                   [--nperseg <n>]                (default: 0)
                   [--noverlap <n>]               (default: 0)
                   [--detrend none|mean|linear]   (default: mean)
                   [--scaling magnitude|density]  (default: density)
                   [--format text|json]           (default: text)
```

- There is no whole-session spectrogram accessor; when `--from`/`--to` are
  absent the full `[0, duration_secs]` span is passed to
  `spectrogram_channel`. The `times_secs` in the result are absolute
  session seconds (shifted by `t0`).
- **Text mode** — prints `n_times\t<n>` and `n_freqs\t<n>` (the heatmap
  dimensions), stdout.
- **JSON mode** — success envelope with:
  ```json
  "data": {
    "channel":    "<id>",
    "freqs_hz":   [0.0, …],           // length n_freqs
    "times_secs": [0.0, …],           // length n_times, absolute session seconds
    "power":      [0.0, …],           // flat row-major n_times × n_freqs
    "n_times":    7,
    "n_freqs":    33
  }
  ```
  `power[t * n_freqs + f]` is the value at time frame `t`, frequency bin `f`.
  Units follow `--scaling` (same as `fft`).

**Error handling:** an unknown `--channel` returns a `not_found` envelope
with `data.available` listing the session's channel ids. All other engine
errors follow the §29.7 envelope contract.

---

## 30. First Launch / Onboarding

**Path A (have device):** Device tab → connect → load existing config or push default → calibrate → record.
**Path B (have files):** Data tab → import `.idl0` / `.gpx` from local
or Drive → faceted search → select sessions / laps → Analyze.

---

# PART 8 — DISTRIBUTION

## 31. Distribution

| Platform | Format | Notes |
|----------|--------|-------|
| Android | APK / AAB | Primary target |
| iOS | PWA (Flutter web) | Analysis-only, no BLE |
| Windows | MSIX / EXE / zip | No store required |
| macOS | DMG | Requires Apple notarization (automated in CI) |
| Linux | AppImage | Single self-contained file; the self-update format (§31.2) |

Build: `flutter build apk|web|windows|macos|linux`

### 31.1 App release pipeline

The app is released from `idl0-app` the same way firmware is released from
`idl0-firmware` (§27.7): **the git tag is the version of record.** On a `v*`
tag, `app-release.yml` builds the app per platform, stamps the build version
from the tag (`--build-name`, leading `v` stripped, so `package_info_plus`
reports the tag at runtime), and publishes to GitHub Releases:

| Platform | Artifact | Notes |
|----------|----------|-------|
| Android | `idl0-app-v<ver>.apk` + `.sha256` | release-signed (§31.1.1) |
| Linux | `idl0-app-v<ver>-x86_64.AppImage` + `.sha256` | self-contained single file |
| Windows | `idl0-app-v<ver>-windows-x64.zip` + `.sha256` | published; install path scaffolded (§31.2) |

Exactly one asset per platform per release, versioned filenames — the asset
contract the firmware workflow already enforces. Stable vs beta map onto the
GitHub prerelease flag (`-beta`/`-rc` tag suffix → prerelease), identical to
firmware channels. **App and firmware versions are independent.**

#### 31.1.1 Android signing

The update APK must be signed with the **same key** as the installed app or
Android rejects it. The app already signs **both debug and release** with one
shared cert (`idl0`, keystore `~/.android/idl0-dev.jks`, configured in
`android/app/build.gradle.kts`), so every build — local or CI — installs over
the last with no uninstall, which is exactly what self-update needs. The
keystore is **not** committed; CI restores it from the `ANDROID_KEYSTORE_B64`
secret (base64 of the keystore) to that path. Its passwords live in the
committed signing config. (AppImage GPG signing is optional and deferred; the
`sha256` sidecar is the Linux integrity check.)

### 31.2 In-app self-update

The app checks GitHub Releases for a newer **app** version and, where the
platform allows, installs it — reusing the firmware update surface (§27.7):

- **Check.** `AppReleaseCatalog` queries this repo's Releases API for the
  selected channel's latest release and picks the current platform's asset
  (`.apk` / `.AppImage` / `.zip`). `appUpdateProvider` compares the running
  version (`package_info_plus`) to it and offers an update only when hosted is
  strictly newer — the §27.7 rule, including the "ahead of channel →
  informational, never a downgrade" case. The verdict is re-derived from live
  inputs (never stale).
- **UI.** A **Settings → App updates** section (sibling of Firmware): the
  update-available card, a stable/beta channel picker (independent of the
  firmware channel), an auto-check-on-launch toggle, and "Check now".
- **Install.**
  - **Android** — the downloaded APK is `sha256`-checked, then handed to the OS
    package installer via a `FileProvider` + install intent; the OS performs the
    replace and enforces the signature match. `REQUEST_INSTALL_PACKAGES` is
    requested; if "install unknown apps" is off the user is routed to enable it
    once.
  - **Linux** — the new AppImage is downloaded beside the current one,
    `sha256`-verified, made executable, atomically swapped into place (the
    running process holds the old inode), and the user is prompted to relaunch.
  - **Windows** — check + download only; the in-place swap/restart is
    scaffolded ("downloaded — install manually for now") and completed later.

Integrity gate per platform: Android — OS signature match; Linux — published
`sha256`; Windows — deferred with the install path. Updates are always
**user-initiated**; there is no forced update.

Design doc: `docs/superpowers/specs/2026-07-14-app-self-update-design.md`.

---

## 32. Open Source

- **License: AGPL-3.0-or-later** (app + `idl-rs` engine); firmware is **GPL-3.0-or-later**.
- Contributions require signing the CLA (`CLA.md`).
- Three public repos under `github.com/saucyeng`:
  - `saucyeng/idl0-app` — the Flutter app (this repo); `idl-rs` is vendored as a git submodule at `rust/`.
  - `saucyeng/idl-rs` — the pure-Rust processing engine (`idl-rs` core, `idl-rs-bridge` FRB shim, `idl-rs-cli`).
  - `saucyeng/idl0-firmware` — the ESP32-C6 firmware.
- App repo structure: `app/` `rust/` (submodule) `tools/` `docs/`.

---

# PART 9 — VIDEO

## 33. Video Overlay (engine + CLI)

Phase 1 of the video feature (design doc
`docs/superpowers/specs/2026-07-08-video-overlay-design.md`): headless
burned-in overlay export. App data layer (workspace v8 links) and UI are
phases 2–3 and are NOT described here yet.

### 33.1 Overlay model (canvas-agnostic)

`overlay::model::OverlayLayout` — stored in the workbook (`.idl0wb`,
`workbook_version: 2`, additive field `overlay_layouts`). Elements: `gauge`
(styles `numeric | bar | dial`; fields `channel`, `label`, `min`, `max`),
`attitude` (styles `roll | steer`; fields `channel`, `range_deg`, and for
the `roll` style an optional `pitch_channel`, §33.4),
`trace_strip` (`channels[]`, `window_s`), `track_map`, `lap_panel`. Rects are
normalized `[x, y, w, h]` fractions of the canvas. `canvas` (`"1920x1080"`) is
design-space for stroke/font scaling only — never an output resolution.
Channel references resolve like charts (raw, synthesized, math); a missing
channel degrades that element to its no-data state (`—`), never fails the
render. "Like charts" includes the **derived store**: an element bound to a
math channel resolves through `SessionHandle::channel_meta` /
`channel_samples`, which read the store as well as the parsed set — the
`channels()` library list alone would render every math binding no-data.

### 33.2 Sampling

`overlay::sample::SampleContext::prepare(handle, layout, laps)` materializes
referenced channels once; `sample(t_secs)` returns a `FrameSample` (gauge
values, trace windows normalized to session min/max, GPS position normalized
to the session track bbox, lap state). Rate-based channels interpolate
linearly; event-driven channels carry forward. `t` outside a channel's span →
no-data.

### 33.3 GPMF & sync

`video::mp4box` walks ISO-BMFF (no ffmpeg): `gpmd` sample payloads with
video-relative timestamps, `mvhd creation_time`, video-track
width/height/fps/duration. `video::gpmf` parses GPMF KLV (`DEVC`→`STRM`→
`GPS5|GPS9` with `SCAL`/`GPSU`) → `VideoTelemetry`. `video::sync::
estimate_sync` returns `SyncEstimate { offset_s, confidence, method }`:
`gpmf` (UTC anchor vs `GPS_EpochMs`-anchored session clock, confidence 0.9)
else `creation_time` (confidence 0.3). Manual offsets always win; rendering
never re-estimates. Video/session overlap is validated — none → typed error
listing both ranges. `session_time_s = video_time_s + sync_offset_s`.

The anchor epoch maps onto session time through
`epoch_ms_to_time_secs_extrapolated`, which extrapolates past both ends of
`GPS_EpochMs` rather than clamping to it. Clamping is correct for epochs
known to belong to the session (a lap crossing) but wrong for one arriving
from outside it: a saturated value is indistinguishable from a real edge
match, so footage from a different run maps to the session's last second and
passes the overlap check with a fabricated offset. Extrapolation keeps
out-of-range anchors out of range, which is what makes the `NoOverlap` guard
— and the app's `VideoSyncMismatchException` — reachable at all.

Cameras without GPS (e.g. HERO11 Black Mini) write GPMF telemetry with no
`GPS5`/`GPS9`/`GPSU` stream at all; those fall through to `creation_time`,
whose accuracy is the camera clock's.

The app runs this estimation at link time through the bridge (`video_probe`,
`estimate_video_sync` against the retained `SessionHandle`) and persists the
outcome as a workspace `videos[]` entry (§15.4). A container with no usable
anchor degrades to a `manual` link at offset 0; a no-overlap error is
surfaced to the user and nothing is stored.

### 33.4 Rendering

`video::render::render_overlay_frame(layout, sample, w, h)` → straight
(un-premultiplied) RGBA bytes via tiny-skia; text via embedded IBM Plex Mono
(OFL). Deterministic (golden-image tested). The video compositor is the first
consumer of the overlay model, not its owner.

**Attitude indicator (`roll` style).** A conventional artificial horizon:
sky/ground hemispheres split by a horizon line, a pitch ladder at 10°
intervals (±30° spans the ball radius), a fixed amber aircraft symbol, a bank
scale on the bezel with a pointer riding the horizon, and a `roll pitch`
readout. Binding `pitch_channel` translates the horizon vertically; leaving it
unbound pins the horizon level so a roll-only layout still renders — an
*unbound* pitch is not the no-data state, only a missing **roll** value is.

The horizon **counter-rotates**: banking right by φ rotates the drawn world by
−φ while the aircraft symbol stays fixed. This is what a real attitude
indicator does (the gyro-stabilised disk holds still in space while the case
turns with the vehicle), and on a bike it matches the footage directly, since
the camera is bolted to the frame and the filmed horizon tilts the same way.
Positive roll is leaning right and positive pitch is nose up (§19), so nose-up
places the horizon *below* centre — you are looking above it.

### 33.5 Export driver (`video-export` crate)

The only process-spawning component. `ffprobe` (JSON) probes width/height/
fps/duration/rotation/audio; `ffmpeg` receives rendered frames as a second
rawvideo RGBA input piped to stdin, `filter_complex overlay`, audio
stream-copied, `libx264` default (`--encoder` overrides), `+faststart`.

**Quality.** `ExportPlan.quality` is one constant-quality number mapped to
whatever the chosen encoder understands: `-crf` for x264/x265/SVT-AV1/rav1e,
and `-rc vbr -cq <q> -b:v 0` for NVENC/QSV/AMF (`-cq` alone is ignored under
NVENC's default rate control, which silently caps the bitrate instead).
Unrecognised encoders get no rate flags. Without this the encoders are not
comparable — libx264 defaults to CRF 23 while NVENC defaults to roughly
2 Mbps, so switching to the GPU encoder looked ~2.6× faster while actually
producing a 16× smaller, visibly worse file. Pinned at equal quality on the
reference clip, NVENC is ~3.8× faster and larger, which is the real trade.
Output writes to `<out>.part`, renamed on success. VFR input is normalized to
CFR; rotation metadata is applied at probe time. Progress = frames fed /
total; cancel kills the child and removes the `.part`.

**Orientation.** `ExportPlan.rotate_ccw_deg` (0/90/180/270) is an *extra*
counter-clockwise rotation composed on top of container rotation metadata,
for footage shot with the camera deliberately mounted rotated where the
container records no rotation to correct it. It becomes a `transpose`
(`2` = 90° CCW, `1` = 90° CW) or `hflip,vflip` stage ahead of the overlay in
the filter graph, so the overlay composites onto the *rotated* frame and its
text stays upright. `frame_dims()` — the size the renderer is asked for — is
the final displayed frame, both rotations applied.

**Hardware acceleration.** `ExportPlan.hwaccel` (`cuda`, `qsv`, `d3d11va`, …)
selects an ffmpeg hardware decoder for the source input only; decoded frames
are downloaded to system memory so the overlay and rotation stay on the
portable CPU filter path. Pair with a hardware `encoder` (`h264_nvenc`) to
move both ends off the CPU. Both are opt-in: the default path spawns the
same software argv as before.

### 33.6 CLI

- `idl-rs overlay <session.idl0> --video <v.mp4> --workbook <w.idl0wb>
  [--layout <name>] [--track <t.idl0t>] [--offset <s>] [--start <s>]
  [--duration <s>] [--output <out.mp4>] [--encoder <name>] [--quality <0-51>]
  [--rotate <deg>] [--hwaccel <name>] [--jobs <n>] [--ffmpeg <path>]`
  — bulk command (§29.7 envelope: artifact on success, error envelope on
  stderr). `--layout` optional only when the workbook has exactly one layout.
  `--track` enables the lap panel; without it lap elements render no-data.
  `--offset` skips auto-sync. Math channels are applied (`apply_workbook`)
  before sampling. `--rotate` takes a quarter turn only (0/90/180/270 or a
  negative equivalent); anything else is rejected at parse time rather than
  silently ignored.
- `idl-rs video sync <session.idl0> --video <v.mp4>` — structured command:
  offset/confidence/method (text or `--format json`).
- `idl-rs video probe --video <v.mp4>` — structured command: container info +
  GPMF presence (pure-Rust walker; no ffprobe).

---

*This document is the source of truth. Update before implementing. Claude Code reads only sections relevant to the current task — see TOC.*

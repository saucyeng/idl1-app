# SPEC §7.3 status characteristic — additive delta (draft for firmware)

Drafted 2026-09-08 by the UI interviewer at Isaac's request ("define the spec and
I'll have an agent implement it"). Source rulings: R113 (`LoggingElapsed`), R59 Q6
(status fields), UI-DIRECTION-2 decisions 66 and 87. Goes into `docs/IDL0_SPEC.md`
§7.3 through the lead; the same fields appear in the `/ping` JSON (§6.1) under the
same names, since `/ping` "carries the same fields" once BLE drops.

## Rules

- **Additive only.** Every existing line keeps its meaning and format; §7.3 already
  says unknown lines are ignored, so old apps keep working and new apps degrade when a
  line is absent (R113: the app falls back and renders the value dimmed).
- **Raw integers, no units in the text, no floats, no percent maths on the device.**
  The app converts. Each new line is `Key: <unsigned decimal>` or a fixed token.
- **Cadence unchanged.** No new notifications; the lines ride in the existing status
  payload. Cost per notification: ≤ ~90 extra bytes.
- **Presence rules** are per line below; an absent line means "unknown", never zero.

## New lines

```
LoggingElapsed: N      seconds since the current logging session started, device
                       monotonic (esp_timer), integer. Present ONLY while
                       Logging: RUNNING.                                    (R113)
BatteryRaw: N          the unscaled battery ADC count (whatever the pin/ADC
                       returns), integer, no conversion on the device. Always
                       present. Battery: N% stays for old parsers; the app scales
                       BatteryRaw itself (scale/offset live in the app, per board
                       revision) and prefers it when both exist.
SDFreeMiB: N           free space on the mounted card in MiB, integer. Present when
                       SD: OK or SD: FULL; absent for ERROR/ABSENT.
GPSFix: 0|1|2|3        NMEA GGA fix-quality field, raw (0 none, 1 GPS, 2 DGPS,
                       3 PPS or better). Present when GPS is not ABSENT.
GPSSats: N             satellites used in the solution, integer (GGA field 7).
                       Present when GPS is not ABSENT; 0 while searching.
GPSHDOP: N             HDOP × 100, integer (GGA field 8 scaled; 0.9 → 90).
                       Present when GPSFix ≥ 1. Optional if the GPS driver does
                       not expose it cheaply.
IMU0: OK|ERROR|ABSENT|OFF
IMU1: OK|ERROR|ABSENT|OFF
IMU2: OK|ERROR|ABSENT|OFF
                       Per-IMU state. OFF = disabled in the loaded config;
                       ABSENT = enabled but not detected on the bus; ERROR = detected
                       but failing reads/FIFO. The aggregate IMU: line stays and is
                       derived from these three exactly as today.
```

## Worked payload (recording, good GPS)

```
WiFi: OFF
Logging: RUNNING
LoggingElapsed: 412
Battery: 87%
BatteryRaw: 2471
SD: OK
SDFreeMiB: 27310
GPS: FIX
GPSFix: 1
GPSSats: 11
GPSHDOP: 90
IMU: OK
IMU0: OK
IMU1: OK
IMU2: OK
Firmware: 1.6.0
```

## App side (for the lead; not firmware work)

- `DeviceState` gains the fields additively; `device_status` (C3) grows the same way.
- Timer: `LoggingElapsed` when present, else client-observed and dimmed (R113).
- Hero status strip (decision 87): per-IMU dots from `IMU0..2`, satellite count from
  `GPSSats`, duration from `LoggingElapsed`. `GPSHDOP`/`SDFreeMiB`/`BatteryRaw` feed
  the detail rows, not the strip.

## Resolved with Isaac (2026-09-08)

- Battery: no millivolt reading exists yet; the firmware sends the raw ADC count
  (`BatteryRaw`) and the app scales it. `Battery: N%` stays.
- The 320 g boards keep three IMU slots, so `IMU0..2` is the full set.
- IMU config flags: `low_power_mode` and `high_performance_mode` are XOR — both set
  is a config validation error (app side). Low power is only used while idle or
  transferring, switched by firmware, not by the user's session config.

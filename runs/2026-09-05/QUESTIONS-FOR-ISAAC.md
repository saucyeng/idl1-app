# Open questions for Isaac (as of 2026-09-05 evening)

None is blocking. Each has a ledger entry in `runs/2026-09-03/decisions.md`;
answer in whatever order suits, and the lead turns each into a one-task change.

## Hardware / firmware facts (SPEC §8 and §7.3)

1. **IMU defaults** — rate (Hz), accel range (g), gyro range (dps) the
   firmware actually boots with. Today the Device tab pre-fills 833 / 32 /
   2000 from SPEC §8's worked example. *(tracked note, "IMU defaults")*
2. **IMU mode flags** — are `low_power_mode` and `high_performance_mode`
   mutually exclusive, or does one win when both are set? Today the validator
   warns; with an answer it becomes an error or a rule. *(tracked note)*
3. **Valid pin sets** — the legal `adc_pin` and `gpio_pin` values (or a map to
   §3.7's named nets). Today the pin input is an unconstrained non-negative
   integer; with an answer it becomes a dropdown and a validator rule. *(R58)*
4. **Status block fields** — can the firmware report SD free bytes, GPS fix
   quality, satellite count and battery millivolts in the §7.3 status block?
   If yes, `device_status` grows additively. *(R59 Q6)*
5. **Generic channel ids** — for configured analog/digital channels, is the
   wire `channel_id` deterministic from config order (the preview can compute
   it) or assigned by the firmware at boot (only the parser knows)? *(R63 Q2)*

## Product calls

6. **GPS map basemap** — wave 2 draws the GPS trace on plain axes (no tile
   server, per "no CDN, ever"). Do you want a user-configured tile URL as an
   explicit off-by-default exception later? *(R52 Q8)*
7. **Lap tables are empty in wave 2** — no wave-1 import path indexes laps;
   the Data tab shows "—" honestly. Lap indexing at import is on the Rust
   backlog after the write-amendment lane. Fine to ship this way, or should it
   move up? *(R53 Data Q4)*

## Data

8. **Real FIT/GPX archive** — the importers landed against synthetic
   fixtures; the FIT/GPX speed/heading direct path ("L2 follow-on S/H") waits
   for real files to validate against. *(R23 Q4, R60)*
9. **Sample rates** — `IMU2_AccelX` measured 791.77 Hz on your real session
   against 833 configured / 800 in the header / 812.3 from seam validation.
   Not blocking; worth knowing which the firmware intends. *(L5 landing)*

5b. **Pressure channels 20/21** — SPEC section 8's config example gives no scale/offset source for them, so the registry preview emits no row for pressure until it does. *(R64.5)*

## 11. Disk headroom (2026-09-06, blocking Tauri builds)

C: reached 0 bytes free during L8w Task 13's app-crate check. The lead
freed ≈2.5 GB of stale Claude scratch only. Tauri builds need ~20 GB of
headroom. Candidates (your call): `Downloads` 37.5 GB,
`AppData\Local\Packages` 27.8 GB, `AppData\Roaming\Claude` 10.2 GB,
`idl0-app\rust\target` 3.9 GB (rebuildable), `pagefile.sys` 36.5 GB
(system-managed). May the lead delete the idl0-app target directory?
Addendum: `saucyeng/.cargo-shared-target` (the wave-2 worktree build cache)
is 12 GB and every wave-2 worktree is now retired; clearing it is safe and
rebuildable but forces cold compiles for wave 3 worktrees (memory cost).
`idl1-app/app/src-tauri/target` is 9.2 GB. The lead will not build the
Tauri preview until ≥10 GB is free — say which of these to clear.

## 12. Device-tab refinements (UI-5, direction decision 35) — your call on each

From the restyle, the gaps the Device tab still carries:
1. Device picker is an inline discovered-device list in the hero card, not
   idl0's picker sheet; no auto-connect ("headphones" model). Want either?
2. No RX/TX live BLE-activity indicator distinct from the recording pulse.
3. Recording timer is client-observed (first `logging:true` this session),
   so it resets on reconnect — a device-reported start time needs firmware
   or a status field.
4. Calibration panel is a placeholder: `CMD_CALIBRATE_IMU` (SPEC §7.6/§20)
   has no Tauri command yet.
5. HRM "Search nearby" lists every BLE device (no service-UUID filter).
6. Push config cannot read device mode first; a wrong-mode push surfaces as
   a rejection, not a pre-check.

## 13. Firmware items unblocked 2026-09-07 ("firmware changes are completely okay")
- **`LoggingElapsed: N`** in the §7.3 status payload (R113) — seconds,
  device monotonic, present only while `Logging: RUNNING`. Needed for the
  device-reported recording timer (direction-2 decision 66).
- **Calibration (R116):** the from-scratch routine needs a straight-line
  acceleration run to observe yaw. Open: is that a *device* mode (the
  device detects the run and computes) or an *app* routine over a short
  recorded session? Given §1 ("analysis DSP never runs on the device"),
  the app is the natural home — confirm.
- Assumption recorded: the 320 g IMUs' scale-factor error is not
  calibrated today and v1 will not calibrate it. Flag if that is not
  acceptable for the high-g channels.

## Answers (Isaac, 2026-09-07/08, via the UI interviewer)

Item 12 was answered in full as `runs/2026-09-07/ui/UI-DIRECTION-2.md` §E
(decisions 64–70). The rest, one line each, Isaac's words quoted:

1. **IMU defaults** — the device boots with whatever the loaded config says; the
   *factory* config is 833 Hz ("or whatever the 320x's actual frequency is"), 32 g
   "with the ability to read the 64 g bursts"; gyro range: "check old data for the
   dps range, we may be able to drop it to 1000". → Keep 833/32/2000 pre-fill; a
   follow-up task measures peak dps across the real archive before changing it.
2. **IMU mode flags** — "I do want to be able to put the IMUs in low power mode, but
   they're such low power consumption that it really doesn't matter." No rule given.
   Follow-up 2026-09-08: "just make it XOR; the switching will happen by software
   anyway; low power mode will only be used while the device is idling/transferring."
   → Both flags set is a validator **error**. Note for the lead: low-power is a
   device-state concern (idle/transfer), not a per-session config the user picks.
3. **Valid pin sets** — "probably not now." Pin input stays a free non-negative
   integer; no dropdown.
4. **Status block fields** — "yes on all." Spec delta drafted at
   `runs/2026-09-08/firmware/STATUS-7.3-DELTA.md` (includes R113's
   `LoggingElapsed` and per-IMU lines for direction-2 decision 87).
5. **Generic channel ids** — "deterministic would probably be wise to make
   post-processing more consistent, even if they aren't super descriptive." Names
   like `A1`, `D1` or `AF`/`AR`/`DF`/`DR`. "We don't want to blindly assign
   pressure." → ids derive from config order; no semantic (pressure) naming.
5b. **Pressure channels 20/21** — covered by 5: no pressure rows until a sensor
   exists and its scale/offset is known.
6. **GPS basemap** — "I liked it how it was." Round-1 decision 36 stands: live
   OSM/Esri tiles are an explicit, user-visible network exception (tiles are data,
   not bundled code; the app must render the trace without them).
7. **Lap tables** — "definitely would like to get the lap tables; idl-rs will spit
   them to the command line, so can't be that hard." → Move lap indexing at import
   up the Rust backlog; lap-to-lap is the common workflow (direction-2 decision 46).
8. **Real FIT/GPX archive** — `D:\sessions\export_133404\activities`. "Not too
   worried about it for now."
9. **Sample rates** — "it probably intends 833 and drops some; maybe that was an
   old firmware version that had worse frame dropping. We're changing the hardware
   anyway, so I wouldn't worry too much about that old data." → Nominal 833; seams
   are the truth (C1); no further investigation.
11. **Disk** — 19.2 GB free on 2026-09-08 (idl0 target already gone). Isaac: clear
   `saucyeng/.cargo-shared-target` (7.3 GB) "if the rebuilds will be cold anyway".
13a. **`LoggingElapsed`** — "sure, define the spec and I'll have an agent implement
   it; be really efficient with MCU compute, send efficient raw data, convert in the
   app." → `STATUS-7.3-DELTA.md` above.
13b. **Calibration routine** — app-side, over recorded data (confirming §1). Two
   routines wanted: (1) bike motionless and level on the ground; (2) "swing it
   around in mid air, turning the bars and whatnot, to get all the sensor mounting
   offsets right." Straight-line acceleration run for yaw is not ruled out; Isaac
   did not mention it.
13c. **320 g scale-factor error** — "I'm just going to assume they're calibrated
   right from the factory; I don't have a centrifuge handy." → Accepted: v1 corrects
   bias only.
14. **Battery millivolts** (from the status delta) — "not real yet; I forget if we do
   the battery reading through a XIAO pin or the ADC, but either way it first lands as
   a raw binary number that we can scale in the app." → `BatteryMV` becomes
   `BatteryRaw: N` (the unscaled ADC count); the app owns the scale. Delta updated.
15. **320 g boards** — still three IMU slots: "yes".
16. **Map tiles** — "yes, we can fetch map tiles." Confirms item 6.
